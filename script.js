// --- Air Hockey با Canvas 2D و WebAudio — نسخه با «شوت مستقل» و AI تهاجمی/دفاعی ---

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const modal = document.getElementById('modal');
const startSinglePlayerBtn = document.getElementById('startSinglePlayerBtn');
const startTwoPlayerBtn = document.getElementById('startTwoPlayerBtn');
const fsBtn = document.getElementById('fullscreenBtn');
const scoreAEl = document.getElementById('scoreA');
const scoreBEl = document.getElementById('scoreB');
const timerEl = document.getElementById('timer');
const matchMinutesSelect = document.getElementById('matchMinutes');
const playerALabel = document.getElementById('playerALabel');
const messageOverlay = document.getElementById('messageOverlay'); // پیام/ایموجی وسط صفحه

// --- وضعیت بازی ---
const state = { running:false, scoreA:0, scoreB:0, matchTime: 120, timeLeft: 0, gameMode: 'singlePlayer', penaltyFor: null };

// اندازه‌گیری و فول‌اسکرین
function resize(){ canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.addEventListener('resize',resize);
resize();

async function tryFullscreen(){
  try{ if(document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen(); }
  catch(e){ console.warn('fullscreen blocked',e);}
}
window.addEventListener('load',()=>{ /* tryFullscreen(); */ });
fsBtn.addEventListener('click', tryFullscreen);

let flashTimer = 0; let flashSide = null;
let shakeTimer = 0; let shakeIntensity = 0;

// ### برای تشخیص گل به خودی:
let lastTouch = null; // 'A' یا 'B'، کسی که آخرین بار به توپ برخورد کرده

function tableCoords(w,h){
  const padding = Math.min(w*0.06,60);
  const left = padding, right = w-padding;
  const top = h*0.18, bottom = h - h*0.08;
  return {left,right,top,bottom,width:right-left,height:bottom-top};
}

let puck, paddleA, paddleB;
function resetObjects(){
  const {left,right,top,bottom,width,height} = tableCoords(canvas.width,canvas.height);
  puck = {x:(left+right)/2, y:(top+bottom)/2, r: Math.max(12, Math.min(28, width*0.02)), vx:0, vy:0, mass:1, maxSpeed:1500, rotation:0, angularVelocity:0};
  paddleA = {x:left + width*0.15, y:(top+bottom)/2, r: Math.max(22, Math.min(44, width*0.03)), mass: 5, maxSpeed: 900, acceleration: 3500, vx:0, vy:0};
  paddleB = {x:right - width*0.15, y:(top+bottom)/2, r: Math.max(22, Math.min(44, width*0.03)), mass: 5, maxSpeed: 900, acceleration: 3500, vx:0, vy:0};
  lastTouch = null; // شروع تازه
}
resetObjects();

// ورودی‌ها
const keys = {};
window.addEventListener('keydown', e=>{ keys[e.key.toLowerCase()] = true; handleShootKeydown(e); });
window.addEventListener('keyup', e=>{ keys[e.key.toLowerCase()] = false; });

const activeTouch = {};

// حالت‌های شوت و کول‌داون‌ها
const shoot = {
  cooldownA: 0,
  cooldownB: 0,
  aiCooldown: 0,
  distance: 18, // فاصله اضافه برای نزدیکی به توپ برای شوت
  powerHuman: 2000,
  powerAI: 4000,
  cooldownHuman: 0.35,
  cooldownAI: 0.65
};

function handleShootKeydown(e){
  if(!state.running) return;
  // ControlRight برای بازیکن راست (B)
  if(e.code === 'ControlRight'){
    attemptShoot(paddleB, {who:'B'});
  }
  // F برای بازیکن چپ (A) — فقط در حالت دو نفره
  if(e.key && e.key.toLowerCase()==='f' && state.gameMode==='twoPlayer'){
    attemptShoot(paddleA, {who:'A'});
  }
}

// گیم‌پد
const prevPad = {};// prevPad[index] = {buttons:[]}
function handleGamepadInput(dt) {
  const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
  if (!gamepads) return;

  const {left,right,top,bottom,width,height} = tableCoords(canvas.width,canvas.height);

  // دسته‌ی بازیکن راست: معمولاً index 1، اگر نبود از 0 استفاده می‌کنیم
  const gp2 = gamepads[1] || gamepads[0];
  if (gp2) {
    let dx = gp2.axes[0]; let dy = gp2.axes[1];
    if (Math.abs(dx) < 0.1) dx = 0; if (Math.abs(dy) < 0.1) dy = 0;
    paddleB.vx += dx * paddleB.acceleration * dt;
    paddleB.vy += dy * paddleB.acceleration * dt;
    // Shoot: Button 0 (A)
    const was = prevPad[gp2.index]?.buttons?.[0] || false;
    const now = !!gp2.buttons?.[0]?.pressed;
    if(now && !was){ attemptShoot(paddleB, {who:'B'}); }
    prevPad[gp2.index] = prevPad[gp2.index] || {buttons:[]};
    prevPad[gp2.index].buttons[0] = now;
  }

  if (state.gameMode === 'twoPlayer') {
    const gp1 = gamepads[0];
    if (gp1) {
      let dx = gp1.axes[0]; let dy = gp1.axes[1];
      if (Math.abs(dx) < 0.1) dx = 0; if (Math.abs(dy) < 0.1) dy = 0;
      paddleA.vx += dx * paddleA.acceleration * dt;
      paddleA.vy += dy * paddleA.acceleration * dt;
      // Shoot: Button 1 (B)
      const was = prevPad[gp1.index]?.buttons?.[0] || false;
      const now = !!gp1.buttons?.[0]?.pressed;
      if(now && !was){ attemptShoot(paddleA, {who:'A'}); }
      prevPad[gp1.index] = prevPad[gp1.index] || {buttons:[]};
      prevPad[gp1.index].buttons[0] = now;
    }
  }
}

// صدا
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playClick(frequency=880, duration=0.06, volume=0.12){
  const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
  o.type='sine'; o.frequency.setValueAtTime(frequency, audioCtx.currentTime);
  g.gain.setValueAtTime(volume, audioCtx.currentTime);
  o.connect(g); g.connect(audioCtx.destination);
  o.start(); o.stop(audioCtx.currentTime + duration);
}
function playWhistle(){
  const t0 = audioCtx.currentTime; const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(2000 + Math.random()*500, t0);
  g.gain.setValueAtTime(0.08, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.8);
  o.connect(g); g.connect(audioCtx.destination); o.start(t0); o.stop(t0 + 0.8);
}
function playShoot(){
  const t0 = audioCtx.currentTime; const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
  o.type = 'square'; o.frequency.setValueAtTime(180, t0);
  o.frequency.exponentialRampToValueAtTime(520, t0 + 0.08);
  g.gain.setValueAtTime(0.1, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.2);
  o.connect(g); g.connect(audioCtx.destination); o.start(t0); o.stop(t0 + 0.22);
}
const crowd = { gainNode: audioCtx.createGain(), running:false };
function startCrowd(){
  if (crowd.running) return;
  const bufferSize = 2*audioCtx.sampleRate; const noiseBuffer = audioCtx.createBuffer(1,bufferSize, audioCtx.sampleRate);
  const output = noiseBuffer.getChannelData(0); for(let i=0;i<bufferSize;i++) output[i] = (Math.random()*2 - 1) * 0.4;
  const whiteNoise = audioCtx.createBufferSource(); whiteNoise.buffer = noiseBuffer; whiteNoise.loop = true;
  const noiseFilter = audioCtx.createBiquadFilter(); noiseFilter.type='lowpass'; noiseFilter.frequency.setValueAtTime(1100, audioCtx.currentTime);
  whiteNoise.connect(noiseFilter); noiseFilter.connect(crowd.gainNode); crowd.gainNode.connect(audioCtx.destination);
  crowd.gainNode.gain.setValueAtTime(0.03, audioCtx.currentTime); whiteNoise.start();
  crowd.source = whiteNoise; crowd.running = true; crowd.cheerTimer = setInterval(()=>{ playCheer(); }, 7000 + Math.random()*8000);
}
function stopCrowd(){ if(crowd.running){ crowd.source.stop(); clearInterval(crowd.cheerTimer); crowd.running=false; } }
function playCheer(volume=0.06){
  const t0 = audioCtx.currentTime; const g = audioCtx.createGain(); g.gain.setValueAtTime(0.001, t0); g.connect(audioCtx.destination);
  [440,660,880].map(f=>{ const o = audioCtx.createOscillator(); o.type='triangle'; o.frequency.setValueAtTime(f + (Math.random()*80-40), t0); o.connect(g); o.start(); setTimeout(()=>o.stop(), 0.25*1000); });
  g.gain.linearRampToValueAtTime(volume,t0+0.05); g.gain.exponentialRampToValueAtTime(0.0001,t0+0.7);
}

// --- AI هوشمند: دفاع + شوت محاسبه‌شده ---
function aiControl(dt) {
  if (state.penaltyFor === 'B') {
    paddleA.vx *= 0.9; paddleA.vy *= 0.9;
    paddleA.x += paddleA.vx * dt; paddleA.y += paddleA.vy * dt;
    return;
  }
  const {left, right, top, bottom, width, height} = tableCoords(canvas.width, canvas.height);
  const p = paddleA; // AI روی سمت چپ
  const goalHeight = Math.min(160, height*0.32);
  const goalTop = (top + bottom)/2 - goalHeight/2;
  const goalBottom = (top + bottom)/2 + goalHeight/2;
  const enemyGoal = { x: right - 10, y: (top + bottom) / 2 };
  const isPuckInAIHalf = puck.x < left + width * 0.5;

  // محدودیت محدوده حرکت AI به نیمه خودش
  const clampToAIHalf = () => {
    p.x = Math.max(left + p.r, Math.min(left + width/2 - p.r, p.x));
    p.y = Math.max(top + p.r, Math.min(bottom - p.r, p.y));
  };

  // پارامترهای رفتاری
  const DEF_X = left + width * 0.14; // خط دفاعی
  const maxAISpeed = p.maxSpeed * 0.9;
  const arriveThreshold = 8; // فاصله‌ای که می‌گیم رسید

  // کاهش کول‌داون شوت
  shoot.aiCooldown = Math.max(0, shoot.aiCooldown - dt);

  if (!isPuckInAIHalf) {
    // حالت دفاعی: در نیمه‌ی خودمان عقب می‌مانیم و عمودی با توپ تراز می‌شویم
    const target = { x: DEF_X, y: Math.min(Math.max(puck.y, top + p.r), bottom - p.r) };
    moveTowards(p, target, maxAISpeed, dt);
    clampToAIHalf();
    return;
  }

  // توپ وارد زمین AI شده → تهاجمی عمل کن
  // 1) محاسبه بردار هدف به سمت مرکز دروازه حریف (کمی رندوم ظریف برای تنوع)
  const aimY = clamp(enemyGoal.y + (Math.random()*40 - 20), goalTop + 12, goalBottom - 12);
  const aimVec = normalize({ x: enemyGoal.x - puck.x, y: aimY - puck.y });

  // 2) نقطه‌ی پشت توپ نسبت به بردار هدف (برای «پشت توپ قرار گرفتن»)
  const backoff = p.r + puck.r + 24; // فاصله‌ای برای دورخیز
  const approach = { x: puck.x - aimVec.x * backoff, y: puck.y - aimVec.y * backoff };
  // محدود به نیمه خودی
  approach.x = Math.min(approach.x, left + width/2 - p.r);
  approach.x = Math.max(approach.x, left + p.r);
  approach.y = clamp(approach.y, top + p.r, bottom - p.r);

  const distToApproach = distance(p, approach);
  if (distToApproach > arriveThreshold) {
    // هنوز نرسیده → به سمت نقطه‌ی رویکرد حرکت کن
    moveTowards(p, approach, maxAISpeed, dt, 1.2);
    clampToAIHalf();
  } else {
    // رسیده → به سمت توپ دَش کن و اگر موقعیت مناسب بود شوت کن
    const dashTarget = { x: puck.x - aimVec.x * (p.r + 6), y: puck.y - aimVec.y * (p.r + 6) };
    moveTowards(p, dashTarget, maxAISpeed * 1.15, dt, 1.6);
    clampToAIHalf();

    // شرایط شوت: فاصله نزدیک + هم‌جهتی مناسب + کول‌داون تمام
    const toPuck = normalize({ x: puck.x - p.x, y: puck.y - p.y });
    const align = dot(toPuck, aimVec); // 1 یعنی کامل هم‌جهت
    const d = Math.hypot(puck.x - p.x, puck.y - p.y);
    const inRange = d <= p.r + puck.r + shoot.distance + 6;
    if (inRange && align > 0.55 && shoot.aiCooldown <= 0) {
      // شوت دقیق به سمت دروازه حریف
      attemptShoot(p, { who:'AI', targetVec: aimVec, power: shoot.powerAI });
      shoot.aiCooldown = shoot.cooldownAI;
    }
  }
}

// ابزارهای برداری
function normalize(v){ const len = Math.hypot(v.x, v.y) || 1; return {x: v.x/len, y: v.y/len}; }
function distance(a,b){ return Math.hypot(a.x-b.x, a.y-b.y); }
function dot(a,b){ return a.x*b.x + a.y*b.y; }
function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }

function moveTowards(p, target, maxSpeed, dt, accelFactor=1){
  const dx = target.x - p.x;
  const dy = target.y - p.y;
  const dist = Math.hypot(dx, dy);
  if (dist > 1) {
    p.vx += (dx / dist) * maxSpeed * dt * 8 * (accelFactor||1);
    p.vy += (dy / dist) * maxSpeed * dt * 8 * (accelFactor||1);
  }
  // اصطکاک سبک برای جلوگیری از لرزش
  p.vx *= 0.9; p.vy *= 0.9;
  const sp = Math.hypot(p.vx, p.vy);
  if (sp > maxSpeed) { const k = maxSpeed / sp; p.vx *= k; p.vy *= k; }
  p.x += p.vx * dt; p.y += p.vy * dt;
}

// شوت: به توپ ضربه‌ی جهت‌دار می‌زند (برای انسان: از پدل به توپ؛ برای AI: هدف به سمت دروازه)
function attemptShoot(p, opts={}){
  const who = opts.who || 'B';
  if (who==='A' && state.gameMode!=='twoPlayer') return; // بازیکن چپ فقط در دو نفره

  // کول‌داون‌ها
  if (who==='A' && shoot.cooldownA>0) return;
  if (who==='B' && shoot.cooldownB>0) return;
  if (who==='AI' && shoot.aiCooldown>0) return;

  const d = Math.hypot(puck.x - p.x, puck.y - p.y);
  if (d > p.r + puck.r + shoot.distance) return; // خیلی دوره

  // جهت ضربه
  let dir;
  if (opts.targetVec) {
    dir = normalize(opts.targetVec);
  } else {
    dir = normalize({ x: puck.x - p.x, y: puck.y - p.y });
  }

  // قدرت
  const power = opts.power || (who==='AI' ? shoot.powerAI : shoot.powerHuman);
  // اعمال سرعت روی پک (Overwrite با کمی وزن روی سرعت فعلی)
  const blend = 0.18; // درصدی از سرعت قبلی را نگه داریم تا طبیعی‌تر شود
  const vx = dir.x * power;
  const vy = dir.y * power;
  puck.vx = puck.vx * blend + vx * (1 - blend);
  puck.vy = puck.vy * blend + vy * (1 - blend);
  // سقف سرعت
  const sp = Math.hypot(puck.vx, puck.vy);
  const maxSp = puck.maxSpeed * 1.1;
  if (sp > maxSp) { const k = maxSp / sp; puck.vx *= k; puck.vy *= k; }
  // اسپین کمی بر اساس اختلاف سرعت‌های عرضی پدل
  puck.angularVelocity += (p.vx * dir.y - p.vy * dir.x) * 0.002 + (Math.random()*0.4-0.2);

  // افکت‌ها
  playShoot();
  shakeTimer = 0.22; shakeIntensity = 9;

  // تنظیم کول‌داون
  if (who==='A') shoot.cooldownA = shoot.cooldownHuman;
  if (who==='B') shoot.cooldownB = shoot.cooldownHuman;
}
function triggerPenalty(player) {
    if (state.running === false || state.penaltyFor) return;

    state.penaltyFor = player;
    puck.vx = 0;
    puck.vy = 0;
    puck.angularVelocity = 0;

    const {left, right, top, bottom, width, height} = tableCoords(canvas.width, canvas.height);
    const penaltySpotY = (top + bottom) / 2;

    if (player === 'A') {
        puck.x = left + width * 0.25; // Center of the left penalty box
        puck.y = penaltySpotY;
        paddleA.x = left + width * 0.15;
        paddleA.y = penaltySpotY;
        paddleA.vx = 0; paddleA.vy = 0;
    } else { // Player B
        puck.x = right - width * 0.25; // Center of the right penalty box
        puck.y = penaltySpotY;
        paddleB.x = right - width * 0.15;
        paddleB.y = penaltySpotY;
        paddleB.vx = 0; paddleB.vy = 0;
    }

    playWhistle();
}

function stepPhysics(dt){
  const {left,right,top,bottom,width,height} = tableCoords(canvas.width,canvas.height);

  const cornerDist = puck.r + 20; 
  if (!state.penaltyFor) {
    if (distance(puck, {x: left, y: top}) < cornerDist) { triggerPenalty('A'); return; }
    if (distance(puck, {x: left, y: bottom}) < cornerDist) { triggerPenalty('A'); return; }
    if (distance(puck, {x: right, y: top}) < cornerDist) { triggerPenalty('B'); return; }
    if (distance(puck, {x: right, y: bottom}) < cornerDist) { triggerPenalty('B'); return; }
  }

  const move = (p, upKey, downKey, leftKey, rightKey)=>{
    if ((state.penaltyFor === 'A' && p === paddleB) || (state.penaltyFor === 'B' && p === paddleA)) {
        p.vx *= 0.94;
        p.vy *= 0.94;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const minX = p===paddleA ? left + 8 : left + width/2 + 8;
        const maxX = p===paddleA ? left + width/2 - 8 : right - 8;
        p.x = Math.max(minX + p.r, Math.min(maxX - p.r, p.x));
        p.y = Math.max(top + p.r, Math.min(bottom - p.r, p.y));
        return;
    }
    const damping = 0.94;
    let inputX = 0, inputY = 0;
    if(keys[upKey]) inputY -= 1; if(keys[downKey]) inputY += 1;
    if(keys[leftKey]) inputX -= 1; if(keys[rightKey]) inputX += 1;

    if (inputX !== 0 || inputY !== 0) {
      const len = Math.hypot(inputX, inputY);
      p.vx += (inputX / len) * p.acceleration * dt;
      p.vy += (inputY / len) * p.acceleration * dt;
    } else {
      p.vx *= damping; p.vy *= damping;
    }

    const currentSpeed = Math.hypot(p.vx, p.vy);
    if (currentSpeed > p.maxSpeed) { const k = p.maxSpeed / currentSpeed; p.vx *= k; p.vy *= k; }

    p.x += p.vx * dt; p.y += p.vy * dt;
    const minX = p===paddleA ? left + 8 : left + width/2 + 8;
    const maxX = p===paddleA ? left + width/2 - 8 : right - 8;
    p.x = Math.max(minX + p.r, Math.min(maxX - p.r, p.x));
    p.y = Math.max(top + p.r, Math.min(bottom - p.r, p.y));
  };

  if (state.gameMode === 'twoPlayer') {
    move(paddleA,'w','s','a','d');
  } else {
    aiControl(dt); // حرکت و تصمیم AI داخل خودش انجام می‌شود
  }
  move(paddleB,'arrowup','arrowdown','arrowleft','arrowright');

  // به‌روز‌رسانی پک
  puck.x += puck.vx * dt; puck.y += puck.vy * dt; puck.rotation += puck.angularVelocity * dt;

  const friction = 0.995 ** (dt*60);
  puck.vx *= friction; puck.vy *= friction; puck.angularVelocity *= friction;
  if(Math.hypot(puck.vx,puck.vy) < 6) { puck.vx = 0; puck.vy = 0; }
  if(Math.abs(puck.angularVelocity) < 0.1) { puck.angularVelocity = 0; }

  const spinEffect = 0.06;
  if(puck.y - puck.r < top){ puck.y = top + puck.r; puck.vy *= -0.9; puck.vx += puck.angularVelocity * spinEffect; playClick(600); }
  if(puck.y + puck.r > bottom){ puck.y = bottom - puck.r; puck.vy *= -0.9; puck.vx -= puck.angularVelocity * spinEffect; playClick(600); }

  const goalHeight = Math.min(160, height*0.32);
  const goalTop = (top + bottom)/2 - goalHeight/2;
  const goalBottom = (top + bottom)/2 + goalHeight/2;
  if(puck.x - puck.r <= left){ if(puck.y > goalTop && puck.y < goalBottom){ scorePoint('B'); } else { puck.x = left + puck.r; puck.vx *= -0.9; playClick(440);} }
  if(puck.x + puck.r >= right){ if(puck.y > goalTop && puck.y < goalBottom){ scorePoint('A'); } else { puck.x = right - puck.r; puck.vx *= -0.9; playClick(440); } }

  function collideP(p){
    const dx = puck.x - p.x; const dy = puck.y - p.y; const dist = Math.hypot(dx,dy);
    const minD = puck.r + p.r;
    if(dist < minD){
      // ثبت آخرین لمس کننده برای تشخیص گل به خودی
      lastTouch = (p === paddleA ? 'A' : 'B');

      if (state.penaltyFor) {
        if ((state.penaltyFor === 'A' && p === paddleA) || (state.penaltyFor === 'B' && p === paddleB)) {
            state.penaltyFor = null;
        }
      }
      const nx = dx/dist, ny = dy/dist;
      const overlap = minD - dist + 0.001; puck.x += nx * overlap; puck.y += ny * overlap;
      const vdx = puck.vx - p.vx; const vdy = puck.vy - p.vy; const dotN = vdx * nx + vdy * ny;
      if (dotN < 0) {
        const restitution = 1.3; // برخورد معمولی را نرم‌تر نگه می‌داریم؛ قدرت اصلی از «شوت» می‌آید
        const impulse = -(restitution) * dotN / (1/puck.mass + 1/p.mass);
        puck.vx += impulse * nx / puck.mass;
        puck.vy += impulse * ny / puck.mass;
        puck.angularVelocity += (p.vx * ny - p.vy * nx) * 0.002;
      }
    }
  }
  collideP(paddleA); collideP(paddleB);

  // کاهش کول‌داون‌های انسانی
  shoot.cooldownA = Math.max(0, shoot.cooldownA - dt);
  shoot.cooldownB = Math.max(0, shoot.cooldownB - dt);
}

function scorePoint(player){
  if(player==='A') state.scoreA++; else state.scoreB++;
  scoreAEl.textContent = state.scoreA; scoreBEl.textContent = state.scoreB;
  flashTimer = 0.5; flashSide = player; shakeTimer = 0.3; shakeIntensity = 5;
  playCheer(0.1); playWhistle();

  // تشخیص گل به خودی: اگر آخرین لمس‌کننده با گل‌زن یکی نباشد
  const ownGoal = (lastTouch && lastTouch !== player);

  if (ownGoal) {
    messageOverlay.innerHTML = `
		<div style="text-align:center">
		<div style="font-size:40px">😂</div>
		<div style="font-size:40px">گل به خودی</div>
		</div>
		`;

    messageOverlay.style.color = "white";
  } else {
    if (player === 'A') {
      messageOverlay.textContent = String(state.scoreA);
      messageOverlay.style.color = "#ff6b6b"; // قرمز
    } else {
      messageOverlay.textContent = String(state.scoreB);
      messageOverlay.style.color = "#ffd166"; // زرد
    }
  }
  // نمایش و محو
  messageOverlay.classList.remove('show'); // ریست سریع برای تریگر مجدد
  // فورس رفلـو برای اعمال دوباره transition
  void messageOverlay.offsetWidth;
  messageOverlay.classList.add('show');
  setTimeout(()=> messageOverlay.classList.remove('show'), 1200);

  const {left,right,top,bottom} = tableCoords(canvas.width,canvas.height);
  puck.x = (left+right)/2; puck.y = (top+bottom)/2; puck.vx = (player==='A'? -260:260); puck.vy = 0; puck.angularVelocity = 0;
  // کمی استراحت به AI بعد از گل
  shoot.aiCooldown = 0.5;

  // بعد از ثبت گل، لمس قبلی را پاک می‌کنیم
  lastTouch = null;
}

function draw(){
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0,0,w,h);
  const g = ctx.createLinearGradient(0,0,0,h); g.addColorStop(0,'#011121'); g.addColorStop(1,'#032a3b');
  ctx.fillStyle = g; ctx.fillRect(0,0,w,h);
  const {left,right,top,bottom,width,height} = tableCoords(w,h);

  ctx.save();
  ctx.translate(left + width/2, (top+bottom)/2 + height*0.05);
  const shadowW = width*1.04, shadowH = height*1.12;
  const rad = ctx.createRadialGradient(0,0,shadowW*0.02,0,0,shadowW*0.6);
  rad.addColorStop(0,'rgba(0,0,0,0.55)'); rad.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle = rad; ctx.beginPath(); ctx.ellipse(0,0,shadowW/2,shadowH/4,0,0,Math.PI*2); ctx.fill();
  ctx.restore();

  const tableGrad = ctx.createLinearGradient(0,top,0,bottom); tableGrad.addColorStop(0,'#56ccf2'); tableGrad.addColorStop(1,'#0077b6');
  ctx.fillStyle = tableGrad; roundRect(ctx,left,top,width,height, 26); ctx.fill();
  ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(255,255,255,0.08)'; roundRect(ctx,left+3,top+3,width-6,height-6,22); ctx.stroke();

  ctx.beginPath(); ctx.moveTo(left + width/2, top+12); ctx.lineTo(left + width/2, bottom-12); ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 3; ctx.stroke();
  
  // --- START: Added Penalty Boxes ---
  const penaltyBoxWidth = width * 0.25;
  const penaltyBoxHeight = height * 0.7;
  const penaltyBoxTop = (top + bottom) / 2 - penaltyBoxHeight / 2;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 2;
  // Left Penalty Box
  roundRect(ctx, left, penaltyBoxTop, penaltyBoxWidth, penaltyBoxHeight, 15);
  ctx.stroke();
  // Right Penalty Box
  roundRect(ctx, right - penaltyBoxWidth, penaltyBoxTop, penaltyBoxWidth, penaltyBoxHeight, 15);
  ctx.stroke();
  // --- END: Added Penalty Boxes ---

  const goalHeight = Math.min(160, height*0.32);
  const goalTop = (top + bottom)/2 - goalHeight/2;
  ctx.fillStyle = 'rgba(0,0,0,0.12)'; roundRect(ctx,left-6,goalTop, 12, goalHeight,6); ctx.fill();
  ctx.fillStyle = 'rgba(153,255,153,0.6)'; roundRect(ctx,left,goalTop,6,goalHeight,4); ctx.fill();
  ctx.fillStyle = 'rgba(153,255,153,0.6)'; roundRect(ctx,right-6,goalTop,6,goalHeight,6); ctx.fill();
  ctx.beginPath(); ctx.arc((left+right)/2, (top+bottom)/2, 8,0,Math.PI*2); ctx.fillStyle='rgba(153,255,153,0.18)'; ctx.fill();

  drawPaddle(paddleA,'#ff6b6b','#731010');
  drawPaddle(paddleB,'#ffd166','#6a4f00');
  drawPuck();

  if(flashTimer > 0) {
    const opacity = flashTimer / 0.5;
    ctx.fillStyle = `rgba(255, 255, 255, ${opacity * 0.7})`;
    const {height} = tableCoords(w,h);
    const goalHeight = Math.min(160, height*0.32);
    const t = (tableCoords(w,h).top + tableCoords(w,h).bottom)/2 - goalHeight/2;
    const flashX = flashSide === 'A' ? tableCoords(w,h).right - 20 : tableCoords(w,h).left;
    roundRect(ctx, flashX, t, 20, goalHeight, 6);
    ctx.fill();
    flashTimer -= 1/60;
  }
  
}

function drawPaddle(p, c, inner) {
  const shadowOffsetX = 6 + (p.vx / p.maxSpeed) * 4;
  const shadowOffsetY = 10 + (p.vy / p.maxSpeed) * 4;
  ctx.beginPath(); ctx.ellipse(p.x + shadowOffsetX, p.y + shadowOffsetY, p.r * 1.1, p.r * 0.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fill();
  ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
  const g = ctx.createRadialGradient(p.x - p.r * 0.4, p.y - p.r * 0.4, p.r * 0.1, p.x, p.y, p.r);
  g.addColorStop(0, 'rgba(255,255,255,0.8)'); g.addColorStop(0.3, c); g.addColorStop(1, inner);
  ctx.fillStyle = g; ctx.fill();
  ctx.beginPath(); ctx.arc(p.x - p.r * 0.2, p.y - p.r * 0.2, p.r * 0.5, 0, Math.PI * 2);
  const highlight = ctx.createRadialGradient(p.x - p.r * 0.3, p.y - p.r * 0.3, 0, p.x - p.r * 0.2, p.y - p.r * 0.2, p.r * 0.5);
  highlight.addColorStop(0, 'rgba(255,255,255,0.7)'); highlight.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = highlight; ctx.fill();
  ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 3; ctx.stroke();
}

function drawPuck(){
  const shadowOffsetX = 4 + (puck.vx / puck.maxSpeed) * 6; const shadowOffsetY = 8 + (puck.vy / puck.maxSpeed) * 6;
  ctx.beginPath(); ctx.ellipse(puck.x + shadowOffsetX, puck.y + shadowOffsetY, puck.r*1.2, puck.r*0.5,0,0,Math.PI*2);
  ctx.fillStyle='rgba(0,0,0,0.26)'; ctx.fill();
  ctx.save(); ctx.translate(puck.x, puck.y); ctx.rotate(puck.rotation);
  ctx.beginPath(); ctx.arc(0,0,puck.r,0,Math.PI*2);
  const g = ctx.createRadialGradient(-puck.r*0.3, -puck.r*0.3, 0, 0, 0, puck.r);
  g.addColorStop(0, '#f0f0f0'); g.addColorStop(0.5, '#444'); g.addColorStop(1, '#111');
  ctx.fillStyle=g; ctx.fill();
  ctx.beginPath(); ctx.arc(0,0,puck.r,0,Math.PI*2); ctx.lineWidth=2; ctx.strokeStyle='rgba(0,0,0,0.4)'; ctx.stroke();
  ctx.beginPath(); ctx.arc(0,0, puck.r*0.6,0,Math.PI*2); ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.restore();
}

function roundRect(ctx,x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }

let last = performance.now();
function loop(now){
  const dt = Math.min(0.03,(now-last)/1000); last = now;
  if(state.running){
    handleGamepadInput(dt);
    stepPhysics(dt);
  }
  let offsetX = 0, offsetY = 0;
  if(shakeTimer > 0){
    offsetX = (Math.random() - 0.5) * shakeIntensity; offsetY = (Math.random() - 0.5) * shakeIntensity;
    ctx.translate(offsetX, offsetY);
    shakeTimer -= dt; shakeIntensity *= 0.95;
  }
  draw();
  if(shakeTimer > 0){ ctx.translate(-offsetX, -offsetY); }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

let matchInterval = null;
function startMatch(minutes, mode){
  state.gameMode = mode;
  playerALabel.textContent = mode === 'singlePlayer' ? 'هوش مصنوعی' : 'بازیکن ←';
  if(audioCtx.state === 'suspended') audioCtx.resume();
  startCrowd();
  state.matchTime = Math.max(10, Math.floor(minutes*60)); state.timeLeft = state.matchTime; state.running = true; state.scoreA=0; state.scoreB=0; scoreAEl.textContent=0; scoreBEl.textContent=0;
  timerEl.textContent = formatTime(state.timeLeft);
  lastTouch = null; // شروع مسابقه، لمس قبلی خالی
  messageOverlay.classList.remove('show');
  if(matchInterval) clearInterval(matchInterval);
  matchInterval = setInterval(()=>{
    state.timeLeft -= 1; timerEl.textContent = formatTime(state.timeLeft);
    if(state.timeLeft <= 0){ endMatch(); }
  },1000);
}
function endMatch(){
  state.running=false; stopCrowd(); if(matchInterval) clearInterval(matchInterval);
  modal.style.display = 'flex';
  const winnerA = state.gameMode === 'singlePlayer' ? 'هوش مصنوعی' : 'بازیکن چپ';
  const winner = state.scoreA > state.scoreB ? `${winnerA} پیروز شد!` : (state.scoreB > state.scoreA ? 'بازیکن راست پیروز شد!' : 'تساوی!');
  modal.querySelector('.panel').innerHTML = `
    <h2 style="text-align:center">پایان مسابقه</h2>
    <div style="font-size:32px;margin:10px 0;color:#ffd166; text-align:center;">${winner}</div>
    <div style="display:flex;gap:12px;margin:10px 0; justify-content:center;">
      <div class="scoreBox">
        <div style="text-align:center"><div class="label">→ بازیکن</div><div class="scoreNumber">${state.scoreB}</div></div>
      </div>
      <div class="scoreBox">
        <div style="text-align:center"><div class="label">${winnerA}</div><div class="scoreNumber">${state.scoreA}</div></div>
      </div>
     </div>
    <div style="margin-top:10px; text-align:center;">
      <button onclick="location.reload()" class="btn">بازی مجدد</button>
    </div>
  `;
}

function formatTime(s){ const m = Math.floor(s/60); const sec = s%60; return String(m).padStart(2,'0')+':' + String(sec).padStart(2,'0'); }

function startGame(mode) {
  const minutes = Number(matchMinutesSelect.value || 2);
  modal.style.display = 'none';
  resize(); resetObjects();
  try{ if(audioCtx.state === 'suspended') audioCtx.resume(); }catch(e){}
  startMatch(minutes, mode);
}

startSinglePlayerBtn.addEventListener('click', () => startGame('singlePlayer'));
startTwoPlayerBtn.addEventListener('click', () => startGame('twoPlayer'));

// لمس
canvas.addEventListener('touchstart', e=>{ e.preventDefault(); for(const t of e.changedTouches){ activeTouch[t.identifier] = {id:t.identifier}; } },{passive:false});
canvas.addEventListener('touchmove', e=>{
  e.preventDefault(); const rect = canvas.getBoundingClientRect(); for(const t of e.changedTouches){ const pos = {x: t.clientX - rect.left, y: t.clientY - rect.top};
      const dA = Math.hypot(pos.x - paddleA.x, pos.y - paddleA.y); const dB = Math.hypot(pos.x - paddleB.x, pos.y - paddleB.y);
      if (state.gameMode === 'twoPlayer' && dA < dB) {
        paddleA.x = pos.x; paddleA.y = pos.y;
      } else {
        paddleB.x = pos.x; paddleB.y = pos.y;
      }
    }
},{passive:false});

window.addEventListener('orientationchange', ()=>{ resize(); resetObjects(); });
document.addEventListener('selectstart', e=>e.preventDefault());
