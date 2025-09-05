// js/main.js

window.matchInterval = null;
let last = performance.now();
let lastState = null;

// ===============================================
// == بخش اصلی: ساخت و مدیریت هوش مصنوعی ==
// ===============================================
const rlAgent = new RLAgent();
const targetAgent = new RLAgent();
rlAgent.updateTargetModel(targetAgent.model);

let replayBuffer = [];
const REPLAY_BUFFER_SIZE = 10000;
const TRAINING_BATCH_SIZE = 64;

// -- START: PHASE 1 CHANGES --
let trainingStepCount = 0; // شمارنده قدم‌ها برای آموزش و به‌روزرسانی
const TARGET_UPDATE_FREQUENCY_STEPS = 1000; // به‌روزرسانی شبکه هدف هر 1000 قدم
// -- END: PHASE 1 CHANGES --

let trainingEpisodeCount = 0;
let totalReward = 0;

// ===========================================

// تابع اصلی که در ابتدای بارگذاری صفحه اجرا می‌شود
function initializeApp() {
    console.log("Initializing Air Hockey AI... Start a single player game or load a saved model.");

    // راه‌اندازی بقیه قسمت‌های بازی
    resize();
    resetObjects();
    requestAnimationFrame(loop);
}

function startGame(mode) {
    const minutes = Number(matchMinutesSelect.value || 2);
    modal.style.display = 'none';
    resize();
    resetObjects();
    tryFullscreen();
    try {
        if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) { console.error("Could not resume audio context:", e); }
    startMatch(minutes, mode);
}

function startMatch(minutes, mode) {
    state.gameMode = mode;
    state.goldenGoal = false;
    timerEl.classList.remove('golden-goal-text');
    playerALabel.textContent = (mode === 'singlePlayer' || mode === 'ai-vs-ai') ? 'هوش مصنوعی' : 'بازیکن ←';
    startCrowd();
    state.matchTime = Math.max(10, Math.floor(minutes * 60));
    state.timeLeft = state.matchTime;
    state.running = false;
    state.paused = false;
    state.scoreA = 0;
    state.scoreB = 0;
    scoreAEl.textContent = 0;
    scoreBEl.textContent = 0;
    timerEl.textContent = formatTime(state.timeLeft);
    lastTouch = null;
    totalReward = 0;
    messageOverlay.classList.remove('show');
    if (window.matchInterval) clearInterval(window.matchInterval);

    let countdownValue = 3;

    function doCountdown() {
        if (countdownValue > 0) {
            showMessage(countdownValue, 'white');
            playClick(440, 0.1, 0.2);
            countdownValue--;
            setTimeout(doCountdown, 1000);
        } else {
            showMessage('شروع!', '#ffd166');
            playWhistle();
            state.running = true;
            if (state.gameMode === 'singlePlayer' || state.gameMode === 'ai-vs-ai') {
                lastState = getGameState();
            }

            window.matchInterval = setInterval(() => {
                if (state.running && !state.paused && !state.goldenGoal) {
                    state.timeLeft -= 1;
                    timerEl.textContent = formatTime(state.timeLeft);
					if (state.timeLeft <= 10 && state.timeLeft > 0) {
                        showMessage(state.timeLeft, '#FFD700');
                        playClick(1200, 0.1, 0.4);
                    }
                    if (state.timeLeft <= 0) {
                        handleTimeUp();
                    }
                }
            }, 1000);
        }
    }
    doCountdown();
}

function handleTimeUp() {
    if (state.scoreA === state.scoreB) {
        state.goldenGoal = true;
        state.running = true;
        if (window.matchInterval) clearInterval(window.matchInterval);
        timerEl.textContent = 'گل طلایی';
        timerEl.classList.add('golden-goal-text');

        messageOverlay.innerHTML = `<div class="golden-goal-text">گل طلایی</div>`;
        messageOverlay.classList.add('show');
        setTimeout(()=> messageOverlay.classList.remove('show'), 2500);

        playWhistle();
    } else {
        endMatch();
    }
}

function togglePause() {
    if (!state.running) return;
    state.paused = !state.paused;
    if (state.paused) {
        stopCrowd();
        showPauseMenu();
    } else {
        startCrowd();
        modal.style.display = 'none';
        last = performance.now();
        requestAnimationFrame(loop);
    }
}



/**
 * تابع پاداش نهایی با جریمه هوشمند برای گیر کردن
 * @param {boolean} scored - آیا هوش مصنوعی گل زده است؟
 * @param {boolean} conceded - آیا هوش مصنوعی گل خورده است؟
 * @returns {number} - مقدار پاداش
 */
function calculateReward(scored, conceded) {
    if (scored) return 50;
    if (conceded) return -50;

    let reward = 0;
    const { left, right, top, bottom, width } = tableCoords(canvas.width, canvas.height);
    const goalCenter = { x: left, y: (top + bottom) / 2 };

    // 1. پاداش اصلی: نزدیک شدن و کنترل توپ
    const distToPuck = distance(paddleA, puck);
    reward += (1 - (distToPuck / width)) * 0.8;

    // 2. پاداش برای دور نگه داشتن توپ از دروازه
    const distPuckFromGoal = distance(puck, goalCenter);
    reward += (distPuckFromGoal / width) * 0.4;

    // -- START: FINAL CORNER FIX --

    // 3. جریمه هوشمند برای "گیر کردن" در گوشه
    const wallThreshold = paddleA.r * 1.5; // فاصله از دیواره
    const isNearWall = (
        paddleA.y < top + wallThreshold ||
        paddleA.y > bottom + wallThreshold ||
        paddleA.x < left + wallThreshold
    );
    const isStuck = Math.hypot(paddleA.vx, paddleA.vy) < 50; // سرعت بسیار پایین

    // اگر هم به دیواره نزدیک باشد و هم سرعتش کم باشد، جریمه می‌شود
    if (isNearWall && isStuck) {
        reward -= 0.5; // این جریمه سنگین، او را مجبور به حرکت می‌کند
    }
    // -- END: FINAL CORNER FIX --

    // 4. پاداش برای موقعیت‌گیری دفاعی
    if (puck.x < left + width / 2) {
        const vecToGoal = { x: goalCenter.x - puck.x, y: goalCenter.y - puck.y };
        const distVec = Math.hypot(vecToGoal.x, vecToGoal.y) || 1;
        const optimalDefensivePos = {
            x: puck.x + (vecToGoal.x / distVec) * (paddleA.r * 2),
            y: puck.y + (vecToGoal.y / distVec) * (paddleA.r * 2)
        };
        const distFromOptimal = distance(paddleA, optimalDefensivePos);
        reward += (1 - (distFromOptimal / width)) * 0.3; // کاهش وزن برای تعادل
    }

    // 5. پاداش برای شوت‌های موثر
    if (lastTouch === 'A') {
        const opponentGoal = { x: right, y: (top + bottom) / 2 };
        const puckSpeedTowardsGoal = (puck.vx * (opponentGoal.x - puck.x));
        if (puckSpeedTowardsGoal > 0) {
            reward += (puckSpeedTowardsGoal / (width * puck.maxSpeed)) * 1.5;
        }
    }

    return reward;
}


async function loop(now) {
    if (state.paused) {
        requestAnimationFrame(loop);
        return;
    }

    const dt = Math.min(0.03, (now - last) / 1000);
    last = now;

    const originalScoreA = state.scoreA;
    const originalScoreB = state.scoreB;

    if (state.running) {
        handleGamepadInput(dt);
        stepPhysics(dt);
    }

    let scored = state.scoreA > originalScoreA;
    let conceded = state.scoreB > originalScoreB;
    let episodeDone = scored || conceded || (state.timeLeft <= 0 && !state.goldenGoal);

    if (state.running && (state.gameMode === 'singlePlayer' || state.gameMode === 'ai-vs-ai') && lastState) {
        // -- START: PHASE 1 CHANGES --
        trainingStepCount++; // افزایش شمارنده قدم‌ها در هر فریم
        const reward = calculateReward(scored, conceded, lastAction); // ارسال حرکت انتخاب شده به تابع پاداش
        // -- END: PHASE 1 CHANGES --

        totalReward += reward;
        const newState = getGameState();

        replayBuffer.push({ state: lastState, action: lastAction, reward, nextState: newState, done: episodeDone });
        if (replayBuffer.length > REPLAY_BUFFER_SIZE) {
            replayBuffer.shift();
        }

        lastState = newState;

        if (episodeDone) {
            trainingEpisodeCount++;
            console.group(`%c--- Episode ${trainingEpisodeCount} Finished ---`, "color: yellow; font-size: 14px;");
            console.log(`%cReason: ${scored ? 'AI Scored!' : (conceded ? 'Player Scored' : 'Time Up')}`, `color: ${scored ? 'lightgreen' : 'orange'}`);
            console.log(`Total Reward in Episode: ${totalReward.toFixed(2)}`);

            // -- START: PHASE 1 CHANGES (منطق آموزش از اینجا حذف و به بیرون منتقل شد) --
            if (replayBuffer.length < TRAINING_BATCH_SIZE) {
                 console.log(`Collecting experiences... ${replayBuffer.length}/${TRAINING_BATCH_SIZE}`);
            }
            // -- END: PHASE 1 CHANGES --

            console.log(`🧠 AI Status: Exploration (Epsilon) = ${rlAgent.epsilon.toFixed(4)}`);
            console.groupEnd();

            totalReward = 0;
        }

        // -- START: PHASE 1 CHANGES --
        // آموزش مداوم در هر 4 قدم (به جای فقط در انتهای اپیزود)
        if (trainingStepCount % 4 === 0 && replayBuffer.length >= TRAINING_BATCH_SIZE) {
            const batch = [];
            for (let i = 0; i < TRAINING_BATCH_SIZE; i++) {
                const randomIndex = Math.floor(Math.random() * replayBuffer.length);
                batch.push(replayBuffer[randomIndex]);
            }
            // آموزش شبکه اصلی با یک دسته از تجربیات
             rlAgent.train(batch, targetAgent.model);
        }

        // به‌روزرسانی شبکه هدف بر اساس تعداد قدم‌ها
        if (trainingStepCount % TARGET_UPDATE_FREQUENCY_STEPS === 0 && trainingStepCount > 0) {
            rlAgent.updateTargetModel(targetAgent.model);
            console.log(`%c🎯 Target Model Updated after ${trainingStepCount} steps!`, "color: cyan; font-weight: bold;");
        }
        // -- END: PHASE 1 CHANGES --
    }


    let offsetX = 0, offsetY = 0;
    if (shakeTimer > 0) {
        offsetX = (Math.random() - 0.5) * shakeIntensity;
        offsetY = (Math.random() - 0.5) * shakeIntensity;
        ctx.translate(offsetX, offsetY);
        shakeTimer -= dt;
        shakeIntensity *= 0.95;
    }

    draw(dt);

    if (shakeTimer > 0) {
        ctx.translate(-offsetX, -offsetY);
    }
    requestAnimationFrame(loop);
}

// --- Event Listeners ---
window.addEventListener('resize', () => { resize(); resetObjects(); });
fsBtn.addEventListener('click', tryFullscreen);
startSinglePlayerBtn.addEventListener('click', () => startGame('singlePlayer'));
startTwoPlayerBtn.addEventListener('click', () => startGame('twoPlayer'));
const startAiVsAiBtn = document.getElementById('startAiVsAiBtn');
if (startAiVsAiBtn) {
    startAiVsAiBtn.addEventListener('click', () => startGame('ai-vs-ai'));
}
pauseBtn.addEventListener('click', togglePause);
resetBtn.addEventListener('click', () => location.reload());

// -- START: BUGFIX CHANGES --

// ==========================================================
// == بخش مدیریت پیشرفته بارگذاری هوش مصنوعی (اصلاح شده) ==
// ==========================================================
const saveAiBtn = document.getElementById('saveAiBtn');
const loadAiBtn = document.getElementById('loadAiBtn');
const loadAiModal = document.getElementById('loadAiModal');

// المان‌های جدید در فایل index.html (باید جایگزین دکمه‌های قبلی شوند)
const selectFilesBtn = document.getElementById('selectFilesBtn');
const confirmLoadBtn = document.getElementById('confirmLoadBtn');
const cancelLoadBtn = document.getElementById('cancelLoadBtn');
const modelUploader = document.getElementById('modelUploader'); // <input type="file" id="modelUploader" multiple>
const fileStatusEl = document.getElementById('fileStatus');

let stagedFiles = []; // حالا یک آرایه برای نگهداری فایل‌ها داریم

function checkFilesReady() {
    const hasJson = stagedFiles.some(f => f.name.endsWith('.json'));
    const hasBin = stagedFiles.some(f => f.name.endsWith('.bin'));
    const hasTxt = stagedFiles.some(f => f.name.endsWith('.txt'));

    const ready = hasJson && hasBin && hasTxt;

    fileStatusEl.textContent = ready ? `${stagedFiles.length} فایل انتخاب شد ✔️` : "لطفاً ۳ فایل مدل را انتخاب کنید ❌";
    fileStatusEl.style.color = ready ? '#02ffa0' : '#ff6b6b';

    confirmLoadBtn.disabled = !ready;
    confirmLoadBtn.style.opacity = ready ? 1 : 0.5;
}

if (saveAiBtn) {
    saveAiBtn.addEventListener('click', () => {
        if(state.gameMode === 'singlePlayer' || state.gameMode === 'ai-vs-ai') {
            rlAgent.saveModel();
        } else {
            showMessage("فقط در حالت تک‌نفره یا هوش مصنوعی در مقابل ربات!", "orange");
        }
    });
}

if (loadAiBtn) {
    loadAiBtn.addEventListener('click', () => {
        loadAiModal.style.display = 'flex';
        stagedFiles = [];
        modelUploader.value = ""; // ریست کردن ورودی فایل
        checkFilesReady();
    });
}

selectFilesBtn.addEventListener('click', () => modelUploader.click());

modelUploader.addEventListener('change', e => {
    stagedFiles = Array.from(e.target.files); // تبدیل FileList به آرایه
    checkFilesReady();
});


confirmLoadBtn.addEventListener('click', async () => {
    // ارسال آرایه فایل‌ها به تابع loadModel
    const modelLoaded = await rlAgent.loadModel(stagedFiles);
    if (modelLoaded) {
        rlAgent.updateTargetModel(targetAgent.model);
        loadAiModal.style.display = 'none';
    }
});

cancelLoadBtn.addEventListener('click', () => {
    loadAiModal.style.display = 'none';
});
// -- END: BUGFIX CHANGES --


// --- بقیه رویدادها ---
window.addEventListener('keydown', e => {
    if (e.key === 'Escape' || e.key.toLowerCase() === 'p') {
        togglePause();
    }
    keys[e.key.toLowerCase()] = true;
    keys[e.code] = true;
    handleShootKeydown(e);
});

window.addEventListener('keyup', e => {
    keys[e.key.toLowerCase()] = false;
    keys[e.code] = false;
});

canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    for (const t of e.changedTouches) activeTouch[t.identifier] = { id: t.identifier };
}, { passive: false });

canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    if (!state.running || state.paused) return;
    const rect = canvas.getBoundingClientRect();
    for (const t of e.changedTouches) {
        const pos = { x: t.clientX - rect.left, y: t.clientY - rect.top };
        const dA = distance(pos, paddleA);
        const dB = distance(pos, paddleB);
        if (state.gameMode === 'twoPlayer' && dA < dB) {
            paddleA.x = pos.x; paddleA.y = pos.y;
        } else {
            paddleB.x = pos.x; paddleB.y = pos.y;
        }
    }
}, { passive: false });

window.addEventListener('orientationchange', () => { resize(); resetObjects(); });
document.addEventListener('selectstart', e => e.preventDefault());


// --- Initial Calls ---
initializeApp();