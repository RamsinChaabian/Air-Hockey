// js/game.js

/**
 * Resets the puck and paddles to their initial positions and states.
 */
function resetObjects() {
    const { left, right, top, bottom, width } = tableCoords(canvas.width, canvas.height);
    puck = { x: (left + right) / 2, y: (top + bottom) / 2, r: Math.max(12, Math.min(28, width * 0.02)), vx: 0, vy: 0, mass: 1, maxSpeed: 1500, rotation: 0, angularVelocity: 0 };
    paddleA = { x: left + width * 0.15, y: (top + bottom) / 2, r: Math.max(22, Math.min(44, width * 0.03)), mass: 5, maxSpeed: 900, acceleration: 3500, vx: 0, vy: 0, hitAnimation: 0, isTurboActive: false };
    paddleB = { x: right - width * 0.15, y: (top + bottom) / 2, r: Math.max(22, Math.min(44, width * 0.03)), mass: 5, maxSpeed: 900, acceleration: 3500, vx: 0, vy: 0, hitAnimation: 0, isTurboActive: false };
    lastTouch = null;
}

/**
 * Attempts to shoot the puck based on paddle position and input.
 */
function attemptShoot(p, opts = {}) {
    const who = opts.who || 'B';
    if ((who === 'A' && state.gameMode !== 'twoPlayer' && shoot.cooldownA > 0) ||
        (who === 'B' && shoot.cooldownB > 0) ||
        (who === 'AI' && shoot.aiCooldown > 0)) {
        return;
    }

    const d = distance(puck, p);
    if (d > p.r + puck.r + shoot.distance) return;

    let dir = opts.targetVec ? normalize(opts.targetVec) : normalize({ x: puck.x - p.x, y: puck.y - p.y });
    
    let power;
    if (who === 'AI') {
        power = shoot.powerAI;
    } else {
        const paddleSpeed = Math.hypot(p.vx, p.vy);
        power = shoot.basePowerHuman + (paddleSpeed * shoot.velocityPowerMultiplier);
        if (p.isTurboActive) {
            power *= turbo.powerMultiplier;
        }
    }

    const blend = 0.18;
    puck.vx = puck.vx * blend + dir.x * power * (1 - blend);
    puck.vy = puck.vy * blend + dir.y * power * (1 - blend);

    const sp = Math.hypot(puck.vx, puck.vy);
    const maxSp = puck.maxSpeed * 1.1;
    if (sp > maxSp) {
        const k = maxSp / sp;
        puck.vx *= k;
        puck.vy *= k;
    }

    puck.angularVelocity += (p.vx * dir.y - p.vy * dir.x) * 0.002 + (Math.random() * 0.4 - 0.2);
    playShoot();
    shakeTimer = 0.22;
    shakeIntensity = 3 + (power / shoot.powerAI) * 6;

    if (who === 'A') shoot.cooldownA = shoot.cooldownHuman;
    if (who === 'B') shoot.cooldownB = shoot.cooldownHuman;
    if (who === 'AI') shoot.aiCooldown = shoot.cooldownAI;
}

/**
 * Handles keyboard input for shooting.
 */
function handleShootKeydown(e) {
    if (!state.running) return;
    if (e.code === 'ControlRight') {
        attemptShoot(paddleB, { who: 'B' });
    }
    if (e.key && e.key.toLowerCase() === 'f' && state.gameMode === 'twoPlayer') {
        attemptShoot(paddleA, { who: 'A' });
    }
}

/**
 * Handles gamepad input for paddle movement and shooting.
 */
function handleGamepadInput(dt) {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    if (!gamepads.length) return;

    const processGamepad = (paddle, gamepad) => {
        if (!gamepad) return;
        let accel = paddle.acceleration;
        if (paddle.isTurboActive) {
            accel *= turbo.accelerationMultiplier;
        }
        let dx = gamepad.axes[0];
        let dy = gamepad.axes[1];
        if (Math.abs(dx) < 0.1) dx = 0;
        if (Math.abs(dy) < 0.1) dy = 0;

        paddle.vx += dx * accel * dt;
        paddle.vy += dy * accel * dt;

        const wasPressed = prevPad[gamepad.index]?.buttons?.[0] || false;
        const isPressed = !!gamepad.buttons?.[0]?.pressed;
        if (isPressed && !wasPressed) {
            const who = (paddle === paddleA) ? 'A' : 'B';
            attemptShoot(paddle, { who: who });
        }
        
        prevPad[gamepad.index] = prevPad[gamepad.index] || { buttons: [] };
        prevPad[gamepad.index].buttons[0] = isPressed;
    };

    const gp2 = gamepads[1] || gamepads[0];
    processGamepad(paddleB, gp2);

    if (state.gameMode === 'twoPlayer') {
        const gp1 = gamepads[0];
        if (gp1 && (!gp2 || gp1.index !== gp2.index)) {
            processGamepad(paddleA, gp1);
        }
    }
}

// =========================================================================
// == بخش هوش مصنوعی مبتنی بر یادگیری تقویتی (Reinforcement Learning) ==
// =========================================================================

let lastAction = 0; // برای ذخیره آخرین اقدام انجام‌شده

/**
 * وضعیت فعلی بازی را به صورت یک آرایه عددی نرمال‌شده برمی‌گرداند.
 */
function getGameState() {
    const { left, right, top, bottom, width, height } = tableCoords(canvas.width, canvas.height);
    // نرمال‌سازی مقادیر برای بهبود یادگیری شبکه عصبی
    return [
        (puck.x - (left + width / 2)) / (width / 2),
        (puck.y - (top + height / 2)) / (height / 2),
        puck.vx / puck.maxSpeed,
        puck.vy / puck.maxSpeed,
        (paddleA.x - (left + width / 4)) / (width / 4),
        (paddleA.y - (top + height / 2)) / (height / 2),
        (paddleB.x - (right - width / 4)) / (width / 4),
        (paddleB.y - (top + height / 2)) / (height / 2),
    ];
}

/**
 * کنترل هوش مصنوعی با استفاده از عامل RL.
 */
function aiControlRL(dt) {
    const currentState = getGameState();
    // rlAgent در فایل main.js تعریف شده است و در اینجا از آن استفاده می‌کنیم
    const actionIndex = rlAgent.chooseAction(currentState);
    lastAction = actionIndex;

    const moveAmount = paddleA.acceleration * dt;

    switch (actionIndex) {
        case 0: paddleA.vy -= moveAmount; break; // بالا
        case 1: paddleA.vy += moveAmount; break; // پایین
        case 2: paddleA.vx -= moveAmount; break; // چپ
        case 3: paddleA.vx += moveAmount; break; // راست
        case 4: attemptShoot(paddleA, { who: 'AI' }); break; // شوت
        case 5: /* هیچ کاری نکن */ break;
    }
}

/**
 * Triggers a penalty, resetting puck and paddles.
 */
function triggerPenalty(player) {
    if (!state.running) return;

    const { left, right } = tableCoords(canvas.width, canvas.height);
    let offender = player || (puck.x > (left + right) / 2 ? 'B' : 'A');

    if (!state.penaltyFor) {
        showMessage("اوت", "white");
        playWhistle();
    }

    state.penaltyFor = offender;
    puck.vx = puck.vy = puck.angularVelocity = 0;

    const { top, bottom, width } = tableCoords(canvas.width, canvas.height);
    const penaltySpotY = (top + bottom) / 2;

    if (offender === 'A') {
        puck.x = right - width * 0.25;
        paddleB.x = right - width * 0.15;
    } else {
        puck.x = left + width * 0.25;
    }
    paddleA.x = left + width * 0.15;
    puck.y = paddleA.y = paddleB.y = penaltySpotY;
    paddleA.vx = paddleA.vy = paddleB.vx = paddleB.vy = 0;
}

/**
 * Main physics simulation step.
 */
function stepPhysics(dt) {
    const { left, right, top, bottom, width, height } = tableCoords(canvas.width, canvas.height);

    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gpB = gamepads[1] || gamepads[0];
    const gpA = state.gameMode === 'twoPlayer' && gamepads[0] ? gamepads[0] : null;

    if (paddleB) {
        const isGamepadTurbo = gpB ? !!gpB.buttons?.[5]?.pressed : false;
        const isKeyboardTurbo = !!keys['ShiftRight'];
        paddleB.isTurboActive = isGamepadTurbo || isKeyboardTurbo;
    }

    if (paddleA && state.gameMode === 'twoPlayer') {
        const canUseGamepadA = gpA && (!gpB || gpA.index !== gpB.index);
        const isGamepadTurbo = canUseGamepadA ? !!gpA.buttons?.[5]?.pressed : false;
        const isKeyboardTurbo = !!keys['ShiftLeft'];
        paddleA.isTurboActive = isGamepadTurbo || isKeyboardTurbo;
    }

    const cornerDist = puck.r + 20;
    if (distance(puck, { x: left, y: top }) < cornerDist || distance(puck, { x: left, y: bottom }) < cornerDist || distance(puck, { x: right, y: top }) < cornerDist || distance(puck, { x: right, y: bottom }) < cornerDist) {
        triggerPenalty(lastTouch);
        return;
    }

    const move = (p, upKey, downKey, leftKey, rightKey) => {
        const minX = p === paddleA ? left + 8 : left + width / 2 + 8;
        const maxX = p === paddleA ? left + width / 2 - 8 : right - 8;

        if ((state.penaltyFor === 'A' && p === paddleA) || (state.penaltyFor === 'B' && p === paddleB)) {
             p.vx *= 0.9; p.vy *= 0.9;
        } else {
            let accel = p.acceleration;
            let maxSp = p.maxSpeed;

            if (p.isTurboActive) {
                accel *= turbo.accelerationMultiplier;
                maxSp *= turbo.maxSpeedMultiplier;
            }

            let inputX = 0, inputY = 0;
            if (keys[upKey]) inputY -= 1; if (keys[downKey]) inputY += 1;
            if (keys[leftKey]) inputX -= 1; if (keys[rightKey]) inputX += 1;

            if (inputX !== 0 || inputY !== 0) {
                const len = Math.hypot(inputX, inputY);
                p.vx += (inputX / len) * accel * dt;
                p.vy += (inputY / len) * accel * dt;
            } else {
                p.vx *= 0.94; p.vy *= 0.94;
            }

            const currentSpeed = Math.hypot(p.vx, p.vy);
            if (currentSpeed > maxSp) {
                const k = maxSp / currentSpeed;
                p.vx *= k; p.vy *= k;
            }
        }
    };
    
    // اجرای منطق حرکت برای بازیکنان
    if (state.gameMode === 'twoPlayer') {
        move(paddleA, 'w', 's', 'a', 'd');
        paddleA.x += paddleA.vx * dt;
        paddleA.y += paddleA.vy * dt;
        paddleA.x = clamp(paddleA.x, left + paddleA.r, left + width / 2 - paddleA.r);
        paddleA.y = clamp(paddleA.y, top + paddleA.r, bottom - paddleA.r);
    } else {
        aiControlRL(dt);
        paddleA.x += paddleA.vx * dt;
        paddleA.y += paddleA.vy * dt;
        paddleA.vx *= 0.92;
        paddleA.vy *= 0.92;
        paddleA.x = clamp(paddleA.x, left + paddleA.r, left + width / 2 - paddleA.r);
        paddleA.y = clamp(paddleA.y, top + paddleA.r, bottom - paddleA.r);
    }
    move(paddleB, 'arrowup', 'arrowdown', 'arrowleft', 'arrowright');
    paddleB.x += paddleB.vx * dt;
    paddleB.y += paddleB.vy * dt;
    paddleB.x = clamp(paddleB.x, left + width / 2 + paddleB.r, right - paddleB.r);
    paddleB.y = clamp(paddleB.y, top + paddleB.r, bottom - paddleB.r);


    puck.x += puck.vx * dt;
    puck.y += puck.vy * dt;
    puck.rotation += puck.angularVelocity * dt;

    const friction = 0.995 ** (dt * 60);
    puck.vx *= friction;
    puck.vy *= friction;
    puck.angularVelocity *= friction;

    if (puck.y - puck.r < top) { puck.y = top + puck.r; puck.vy *= -0.9; playClick(600); }
    if (puck.y + puck.r > bottom) { puck.y = bottom - puck.r; puck.vy *= -0.9; playClick(600); }

    const goalHeight = Math.min(160, height * 0.32);
    const goalTop = (top + bottom) / 2 - goalHeight / 2;
    const goalBottom = (top + bottom) / 2 + goalHeight / 2;

    if (puck.x - puck.r <= left) {
        if (puck.y > goalTop && puck.y < goalBottom) { scorePoint('B'); }
        else { puck.x = left + puck.r; puck.vx *= -0.9; playClick(440); }
    }
    if (puck.x + puck.r >= right) {
        if (puck.y > goalTop && puck.y < goalBottom) { scorePoint('A'); }
        else { puck.x = right - puck.r; puck.vx *= -0.9; playClick(440); }
    }

    const collideP = (p) => {
        const dx = puck.x - p.x, dy = puck.y - p.y;
        const dist = Math.hypot(dx, dy);
        const minD = puck.r + p.r;
        if (dist < minD) {
            p.hitAnimation = 0.2;
            playClick(1200, 0.05, 0.15);
            lastTouch = (p === paddleA ? 'A' : 'B');

            if (state.penaltyFor && ((state.penaltyFor === 'A' && p === paddleB) || (state.penaltyFor === 'B' && p === paddleA))) {
                state.penaltyFor = null;
            }

            const nx = dx / dist, ny = dy / dist;
            puck.x = p.x + nx * minD;
            puck.y = p.y + ny * minD;

            const vdx = puck.vx - p.vx, vdy = puck.vy - p.vy;
            const dotN = vdx * nx + vdy * ny;
            if (dotN < 0) {
                const restitution = 1.3;
                const impulse = -(restitution) * dotN / (1 / puck.mass + 1 / p.mass);
                puck.vx += impulse * nx / puck.mass;
                puck.vy += impulse * ny / puck.mass;
                puck.angularVelocity += (p.vx * ny - p.vy * nx) * 0.002;

                const puckSpeed = Math.hypot(puck.vx, puck.vy);
                if (puckSpeed > puck.maxSpeed) {
                    const k = puck.maxSpeed / puckSpeed;
                    puck.vx *= k;
                    puck.vy *= k;
                }
            }
        }
    };
    collideP(paddleA);
    collideP(paddleB);

    shoot.cooldownA = Math.max(0, shoot.cooldownA - dt);
    shoot.cooldownB = Math.max(0, shoot.cooldownB - dt);
}


/**
 * Handles scoring a point.
 */
function scorePoint(player) {
    if (!state.running) return;

    if (player === 'A') state.scoreA++; else state.scoreB++;
    scoreAEl.textContent = state.scoreA;
    scoreBEl.textContent = state.scoreB;

    if (state.goldenGoal) {
        endMatch();
        return;
    }

    flashTimer = 0.5;
    flashSide = player;
    shakeTimer = 0.3;
    shakeIntensity = 5;
    playCheer(0.1);
    playWhistle();

    const ownGoal = (lastTouch && lastTouch !== player);
    if (ownGoal) {
        showMessage(
            `<div style="text-align:center"><div id="lottieEmoji" style="width:100px; height:100px; margin:0 auto; display:block;"></div><div style="font-size:40px; margin-top:80px;">گل به خودی</div></div>`,
            "white",
            true
        );
    } else {
        const color = player === 'A' ? "#ff6b6b" : "#ffd166";
        showMessage(player === 'A' ? String(state.scoreA) : String(state.scoreB), color);
    }

    const { left, right, top, bottom } = tableCoords(canvas.width, canvas.height);
    puck.x = (left + right) / 2;
    puck.y = (top + bottom) / 2;
    puck.vx = (player === 'A' ? -260 : 260);
    puck.vy = 0;
    puck.angularVelocity = 0;
    shoot.aiCooldown = 0.5;
    lastTouch = null;
}

/**
 * Draws a paddle on the canvas.
 */
function drawPaddle(p, c, inner, dt) {
    let radius = p.r;
    if (p.hitAnimation > 0) {
        const animationProgress = 1 - (p.hitAnimation / 0.2);
        radius = p.r * (1 + 0.2 * Math.sin(animationProgress * Math.PI));
        p.hitAnimation -= dt;
    } else {
        p.hitAnimation = 0;
    }

    if (p.isTurboActive) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius * 1.5, 0, Math.PI * 2);
        const turboGlow = ctx.createRadialGradient(p.x, p.y, radius, p.x, p.y, radius * 1.5);
        turboGlow.addColorStop(0, `${c}88`);
        turboGlow.addColorStop(1, `${c}00`);
        ctx.fillStyle = turboGlow;
        ctx.fill();
    }

    const shadowOffsetX = 6 + (p.vx / p.maxSpeed) * 4;
    const shadowOffsetY = 10 + (p.vy / p.maxSpeed) * 4;
    ctx.beginPath();
    ctx.ellipse(p.x + shadowOffsetX, p.y + shadowOffsetY, radius * 1.1, radius * 0.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(p.x - radius * 0.4, p.y - radius * 0.4, radius * 0.1, p.x, p.y, radius);
    g.addColorStop(0, 'rgba(255,255,255,0.8)');
    g.addColorStop(0.3, c);
    g.addColorStop(1, inner);
    ctx.fillStyle = g;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(p.x - radius * 0.2, p.y - radius * 0.2, radius * 0.5, 0, Math.PI * 2);
    const highlight = ctx.createRadialGradient(p.x - radius * 0.3, p.y - radius * 0.3, 0, p.x - radius * 0.2, p.y - radius * 0.2, radius * 0.5);
    highlight.addColorStop(0, 'rgba(255,255,255,0.7)');
    highlight.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = highlight;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 3;
    ctx.stroke();
}

/**
 * Draws the puck on the canvas.
 */
function drawPuck() {
    const shadowOffsetX = 4 + (puck.vx / puck.maxSpeed) * 6;
    const shadowOffsetY = 8 + (puck.vy / puck.maxSpeed) * 6;
    ctx.beginPath();
    ctx.ellipse(puck.x + shadowOffsetX, puck.y + shadowOffsetY, puck.r * 1.2, puck.r * 0.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.26)';
    ctx.fill();

    ctx.save();
    ctx.translate(puck.x, puck.y);
    ctx.rotate(puck.rotation);
    ctx.beginPath();
    ctx.arc(0, 0, puck.r, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(-puck.r * 0.3, -puck.r * 0.3, 0, 0, 0, puck.r);
    g.addColorStop(0, '#f0f0f0');
    g.addColorStop(0.5, '#444');
    g.addColorStop(1, '#111');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, puck.r, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, puck.r * 0.6, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
}

/**
 * Main drawing function for the game.
 * @param {number} dt - Delta time.
 */
function draw(dt) {
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, '#011121');
    bgGrad.addColorStop(1, '#032a3b');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    const { left, right, top, bottom, width, height } = tableCoords(w, h);

    ctx.save();
    ctx.translate(left + width / 2, (top + bottom) / 2 + height * 0.05);
    const shadowW = width * 1.04, shadowH = height * 1.12;
    const rad = ctx.createRadialGradient(0, 0, shadowW * 0.02, 0, 0, shadowW * 0.6);
    rad.addColorStop(0, 'rgba(0,0,0,0.55)');
    rad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rad;
    ctx.beginPath();
    ctx.ellipse(0, 0, shadowW / 2, shadowH / 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const tableGrad = ctx.createLinearGradient(0, top, 0, bottom);
    tableGrad.addColorStop(0, '#56ccf2');
    tableGrad.addColorStop(1, '#0077b6');
    ctx.fillStyle = tableGrad;
    roundRect(ctx, left, top, width, height, 26);
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    roundRect(ctx, left + 3, top + 3, width - 6, height - 6, 22);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(left + width / 2, top + 12);
    ctx.lineTo(left + width / 2, bottom - 12);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 3;
    ctx.stroke();

    const penaltyBoxWidth = width * 0.25;
    const penaltyBoxHeight = height * 0.7;
    const penaltyBoxTop = (top + bottom) / 2 - penaltyBoxHeight / 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 2;
    roundRect(ctx, left, penaltyBoxTop, penaltyBoxWidth, penaltyBoxHeight, 15);
    ctx.stroke();
    roundRect(ctx, right - penaltyBoxWidth, penaltyBoxTop, penaltyBoxWidth, penaltyBoxHeight, 15);
    ctx.stroke();

    const penaltySpotRadius = 30;
    ctx.fillStyle = 'rgba(153,255,153,0.18)';
    ctx.beginPath();
    ctx.arc(left + width * 0.25, (top + bottom) / 2, penaltySpotRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(right - width * 0.25, (top + bottom) / 2, penaltySpotRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc((left + right) / 2, (top + bottom) / 2, width * 0.1, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.stroke();

    const cornerRadius = (puck?.r || 12) + 20;
    ctx.setLineDash([8, 10]);
    ctx.strokeStyle = 'rgba(255, 100, 100, 0.6)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(left, top, cornerRadius, 0, Math.PI * 0.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(left, bottom, cornerRadius, -Math.PI * 0.5, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(right, top, cornerRadius, Math.PI * 0.5, Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(right, bottom, cornerRadius, Math.PI, Math.PI * 1.5);
    ctx.stroke();
    ctx.setLineDash([]);


    const goalHeight = Math.min(160, height * 0.32);
    const goalTop = (top + bottom) / 2 - goalHeight / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    roundRect(ctx, left - 6, goalTop, 12, goalHeight, 6);
    ctx.fill();
    ctx.fillStyle = 'rgba(153,255,153,0.6)';
    roundRect(ctx, left, goalTop, 6, goalHeight, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(153,255,153,0.6)';
    roundRect(ctx, right - 6, goalTop, 6, goalHeight, 6);
    ctx.fill();

    drawPaddle(paddleA, '#ff6b6b', '#731010', dt);
    drawPaddle(paddleB, '#ffd166', '#6a4f00', dt);
    drawPuck();

    if (flashTimer > 0) {
        const opacity = flashTimer / 0.5;
        ctx.fillStyle = `rgba(255, 255, 255, ${opacity * 0.7})`;
        const flashX = flashSide === 'A' ? right : left - 20;
        roundRect(ctx, flashX, goalTop, 20, goalHeight, 6);
        ctx.fill();
        flashTimer -= dt;
    }
}