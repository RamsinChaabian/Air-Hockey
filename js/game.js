/**
 * Resets the puck and paddles to their initial positions and states.
 */
function resetObjects() {
    const { left, right, top, bottom, width } = tableCoords(canvas.width, canvas.height);
    puck = { x: (left + right) / 2, y: (top + bottom) / 2, r: Math.max(12, Math.min(28, width * 0.02)), vx: 0, vy: 0, mass: 1, maxSpeed: 1500, rotation: 0, angularVelocity: 0 };
    paddleA = { x: left + width * 0.15, y: (top + bottom) / 2, r: Math.max(22, Math.min(44, width * 0.03)), mass: 5, maxSpeed: 900, acceleration: 3500, vx: 0, vy: 0, hitAnimation: 0 };
    paddleB = { x: right - width * 0.15, y: (top + bottom) / 2, r: Math.max(22, Math.min(44, width * 0.03)), mass: 5, maxSpeed: 900, acceleration: 3500, vx: 0, vy: 0, hitAnimation: 0 };
    lastTouch = null;
}

/**
 * Attempts to shoot the puck based on paddle position and input.
 * @param {object} p - The paddle object attempting the shot.
 * @param {object} opts - Options for the shot (who, targetVec, power).
 */
function attemptShoot(p, opts = {}) {
    const who = opts.who || 'B';
    if ((who === 'A' && state.gameMode !== 'twoPlayer') ||
        (who === 'A' && shoot.cooldownA > 0) ||
        (who === 'B' && shoot.cooldownB > 0) ||
        (who === 'AI' && shoot.aiCooldown > 0)) {
        return;
    }

    const d = distance(puck, p);
    if (d > p.r + puck.r + shoot.distance) return;

    let dir = opts.targetVec ? normalize(opts.targetVec) : normalize({ x: puck.x - p.x, y: puck.y - p.y });
    const power = opts.power || (who === 'AI' ? shoot.powerAI : shoot.powerHuman);

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
    shakeIntensity = 9;

    if (who === 'A') shoot.cooldownA = shoot.cooldownHuman;
    if (who === 'B') shoot.cooldownB = shoot.cooldownHuman;
    if (who === 'AI') shoot.aiCooldown = shoot.cooldownAI;
}


/**
 * Handles keyboard input for shooting.
 * @param {KeyboardEvent} e - The keyboard event.
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
 * @param {number} dt - Delta time.
 */
function handleGamepadInput(dt) {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    if (!gamepads.length) return;

    // Right player (Player B)
    const gp2 = gamepads[1] || gamepads[0];
    if (gp2) {
        let dx = gp2.axes[0];
        let dy = gp2.axes[1];
        if (Math.abs(dx) < 0.1) dx = 0;
        if (Math.abs(dy) < 0.1) dy = 0;
        paddleB.vx += dx * paddleB.acceleration * dt;
        paddleB.vy += dy * paddleB.acceleration * dt;

        const wasPressed = prevPad[gp2.index]?.buttons?.[0] || false;
        const isPressed = !!gp2.buttons?.[0]?.pressed;
        if (isPressed && !wasPressed) {
            attemptShoot(paddleB, { who: 'B' });
        }
        prevPad[gp2.index] = prevPad[gp2.index] || { buttons: [] };
        prevPad[gp2.index].buttons[0] = isPressed;
    }

    // Left player (Player A) in two-player mode
    if (state.gameMode === 'twoPlayer') {
        const gp1 = gamepads[0];
        if (gp1) {
            let dx = gp1.axes[0];
            let dy = gp1.axes[1];
            if (Math.abs(dx) < 0.1) dx = 0;
            if (Math.abs(dy) < 0.1) dy = 0;
            paddleA.vx += dx * paddleA.acceleration * dt;
            paddleA.vy += dy * paddleA.acceleration * dt;

            const wasPressed = prevPad[gp1.index]?.buttons?.[0] || false;
            const isPressed = !!gp1.buttons?.[0]?.pressed;
            if (isPressed && !wasPressed) {
                attemptShoot(paddleA, { who: 'A' });
            }
            prevPad[gp1.index] = prevPad[gp1.index] || { buttons: [] };
            prevPad[gp1.index].buttons[0] = isPressed;
        }
    }
}


/**
 * Moves a paddle towards a target position.
 * @param {object} p - The paddle to move.
 * @param {object} target - The target coordinates {x, y}.
 * @param {number} maxSpeed - The maximum speed for the paddle.
 * @param {number} dt - Delta time.
 * @param {number} accelFactor - Acceleration multiplier.
 */
function moveTowards(p, target, maxSpeed, dt, accelFactor = 1) {
    const dx = target.x - p.x;
    const dy = target.y - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 1) {
        p.vx += (dx / dist) * maxSpeed * dt * 8 * (accelFactor || 1);
        p.vy += (dy / dist) * maxSpeed * dt * 8 * (accelFactor || 1);
    }
    p.vx *= 0.9; p.vy *= 0.9;
    const sp = Math.hypot(p.vx, p.vy);
    if (sp > maxSpeed) { const k = maxSpeed / sp; p.vx *= k; p.vy *= k; }
    p.x += p.vx * dt; p.y += p.vy * dt;
}

/**
 * یک هدف مناسب برای شوت زاویه‌دار (برخورد با دیواره) محاسبه می‌کند.
 * @returns {object|null} مختصات هدف روی دیواره یا null اگر شوت مناسبی پیدا نشود.
 */
function calculateBankShotTarget() {
    const { left, right, top, bottom, width, height } = tableCoords(canvas.width, canvas.height);
    const p = paddleA;
    const enemyGoal = { x: right - 10, y: (top + bottom) / 2 };

    // بررسی اینکه آیا مسیر مستقیم توسط حریف مسدود شده است یا نه
    const directPathBlocked = Math.abs(puck.y - paddleB.y) < paddleB.r && puck.x < paddleB.x;

    if (!directPathBlocked) {
        return null; // اگر مسیر مستقیم باز است، نیازی به شوت زاویه‌دار نیست
    }

    // امتحان کردن شوت از دیواره بالا و پایین
    const walls = [{ y: top, name: 'top' }, { y: bottom, name: 'bottom' }];
    let bestTarget = null;
    let bestTargetScore = -Infinity;

    for (const wall of walls) {
        // "آینه کردن" دروازه حریف در آن سوی دیواره
        const reflectedGoalY = wall.y + (wall.y - enemyGoal.y);
        const reflectedGoal = { x: enemyGoal.x, y: reflectedGoalY };

        // محاسبه بردار از پوک به سمت دروازه آینه‌ای
        const dirToReflectedGoal = normalize({ x: reflectedGoal.x - puck.x, y: reflectedGoal.y - puck.y });

        // پیدا کردن نقطه برخورد با دیواره
        const t = (wall.y - puck.y) / dirToReflectedGoal.y;
        if (t > 0) {
            const collisionPoint = {
                x: puck.x + dirToReflectedGoal.x * t,
                y: wall.y
            };

            // اطمینان از اینکه نقطه برخورد داخل محدوده میز است
            if (collisionPoint.x > left && collisionPoint.x < right) {
                // یک امتیازدهی ساده برای انتخاب بهترین شوت
                // شوتی بهتر است که زاویه تندتری داشته باشد (برای غافلگیری)
                const score = Math.abs(dirToReflectedGoal.x); 
                if (score > bestTargetScore) {
                    bestTargetScore = score;
                    bestTarget = collisionPoint;
                }
            }
        }
    }
    
    return bestTarget;
}


/**
 * AI logic for controlling paddle A in single-player mode.
 * @param {number} dt - Delta time.
 */
function aiControl(dt) {
    if (state.penaltyFor === 'B') {
        paddleA.vx *= 0.9; paddleA.vy *= 0.9;
        paddleA.x += paddleA.vx * dt; paddleA.y += paddleA.vy * dt;
        return;
    }
    const { left, right, top, bottom, width, height } = tableCoords(canvas.width, canvas.height);
    const p = paddleA;
    const goalHeight = Math.min(160, height * 0.32);
    const goalTop = (top + bottom) / 2 - goalHeight / 2;
    const goalBottom = (top + bottom) / 2 + goalHeight / 2;
    const enemyGoal = { x: right - 10, y: (top + bottom) / 2 };
    const isPuckInAIHalf = puck.x < left + width * 0.55; // کمی محدوده را افزایش می‌دهیم

    const clampToAIHalf = () => {
        p.x = Math.max(left + p.r, Math.min(left + width / 2 - p.r, p.x));
        p.y = Math.max(top + p.r, Math.min(bottom - p.r, p.y));
    };

    const DEF_X = left + width * 0.14;
    const maxAISpeed = p.maxSpeed * 0.9;
    const arriveThreshold = 8;

    shoot.aiCooldown = Math.max(0, shoot.aiCooldown - dt);

    // --- پیاده‌سازی پیشنهاد ۲: پیش‌بینی حرکت پوک ---
    // مکان پوک را در 0.15 ثانیه آینده تخمین می‌زنیم
    const predictionTime = 0.15;
    const predictedPuck = {
        x: puck.x + puck.vx * predictionTime,
        y: puck.y + puck.vy * predictionTime
    };


    if (!isPuckInAIHalf) {
        // بازگشت به موقعیت دفاعی بر اساس مکان *پیش‌بینی‌شده* پوک
        const target = { x: DEF_X, y: clamp(predictedPuck.y, top + p.r, bottom - p.r) };
        moveTowards(p, target, maxAISpeed, dt);
        clampToAIHalf();
        return;
    }

    // --- پیاده‌سازی پیشنهاد ۳: شوت‌های زاویه‌دار ---
    let aimTarget = null;
    let isBankShot = false;

    // ابتدا تلاش برای شوت زاویه‌دار
    const bankShotTarget = calculateBankShotTarget();
    if (bankShotTarget) {
        aimTarget = bankShotTarget;
        isBankShot = true;
    } else {
        // اگر شوت زاویه‌دار ممکن نبود، یک شوت مستقیم را هدف‌گیری کن
        const aimY = clamp(enemyGoal.y + (Math.random() * 40 - 20), goalTop + 12, goalBottom - 12);
        aimTarget = { x: enemyGoal.x, y: aimY };
    }

    // بردار هدف‌گیری بر اساس هدف انتخابی (مستقیم یا زاویه‌دار) و مکان *پیش‌بینی‌شده* پوک
    const aimVec = normalize({ x: aimTarget.x - predictedPuck.x, y: aimTarget.y - predictedPuck.y });
    
    // حرکت به پشت پوک برای آماده‌سازی شوت
    const backoff = p.r + puck.r + (isBankShot ? 15 : 24); // برای شوت زاویه‌دار کمی نزدیک‌تر شو
    const approach = { x: predictedPuck.x - aimVec.x * backoff, y: predictedPuck.y - aimVec.y * backoff };
    approach.x = clamp(approach.x, left + p.r, left + width / 2 - p.r);
    approach.y = clamp(approach.y, top + p.r, bottom - p.r);

    if (distance(p, approach) > arriveThreshold) {
        moveTowards(p, approach, maxAISpeed, dt, 1.2);
    } else {
        // حرکت سریع برای ضربه زدن
        const dashTarget = { x: predictedPuck.x - aimVec.x * (p.r + 6), y: predictedPuck.y - aimVec.y * (p.r + 6) };
        moveTowards(p, dashTarget, maxAISpeed * 1.15, dt, 1.6);

        const toPuck = normalize({ x: puck.x - p.x, y: puck.y - p.y });
        const align = dot(toPuck, aimVec);
        const inRange = distance(p, puck) <= p.r + puck.r + shoot.distance + 6;

        if (inRange && align > (isBankShot ? 0.45 : 0.55) && shoot.aiCooldown <= 0) {
            // برای شوت زاویه‌دار به دقت کمتری نیاز است
            attemptShoot(p, { who: 'AI', targetVec: aimVec, power: shoot.powerAI * (isBankShot ? 1.1 : 1.0) }); // قدرت بیشتر برای شوت زاویه‌دار
        }
    }
    clampToAIHalf();
}

/**
 * Triggers a penalty, resetting puck and paddles.
 * @param {string} player - The player who committed the foul ('A' or 'B').
 */
function triggerPenalty(player) {
    if (!state.running || state.penaltyFor) return;

    showMessage("اوت", "white");
    state.penaltyFor = player;
    puck.vx = puck.vy = puck.angularVelocity = 0;

    const { left, right, top, bottom, width } = tableCoords(canvas.width, canvas.height);
    const penaltySpotY = (top + bottom) / 2;

    if (player === 'A') {
        puck.x = left + width * 0.25;
        paddleA.x = left + width * 0.15;
        paddleB.x = right - width * 0.15;
    } else {
        puck.x = right - width * 0.25;
        paddleB.x = right - width * 0.15;
        paddleA.x = left + width * 0.15;
    }
    puck.y = paddleA.y = paddleB.y = penaltySpotY;
    paddleA.vx = paddleA.vy = paddleB.vx = paddleB.vy = 0;

    playWhistle();
}

/**
 * Main physics simulation step.
 * @param {number} dt - Delta time.
 */
function stepPhysics(dt) {
    const { left, right, top, bottom, width, height } = tableCoords(canvas.width, canvas.height);

    const cornerDist = puck.r + 20;
    if (!state.penaltyFor) {
        if (distance(puck, { x: left, y: top }) < cornerDist) { triggerPenalty('A'); return; }
        if (distance(puck, { x: left, y: bottom }) < cornerDist) { triggerPenalty('A'); return; }
        if (distance(puck, { x: right, y: top }) < cornerDist) { triggerPenalty('B'); return; }
        if (distance(puck, { x: right, y: bottom }) < cornerDist) { triggerPenalty('B'); return; }
    }

    const move = (p, upKey, downKey, leftKey, rightKey) => {
        const minX = p === paddleA ? left + 8 : left + width / 2 + 8;
        const maxX = p === paddleA ? left + width / 2 - 8 : right - 8;

        if ((state.penaltyFor === 'A' && p === paddleA) || (state.penaltyFor === 'B' && p === paddleB)) {
             p.vx *= 0.9; p.vy *= 0.9;
        } else {
            let inputX = 0, inputY = 0;
            if (keys[upKey]) inputY -= 1; if (keys[downKey]) inputY += 1;
            if (keys[leftKey]) inputX -= 1; if (keys[rightKey]) inputX += 1;

            if (inputX !== 0 || inputY !== 0) {
                const len = Math.hypot(inputX, inputY);
                p.vx += (inputX / len) * p.acceleration * dt;
                p.vy += (inputY / len) * p.acceleration * dt;
            } else {
                p.vx *= 0.94; p.vy *= 0.94;
            }

            const currentSpeed = Math.hypot(p.vx, p.vy);
            if (currentSpeed > p.maxSpeed) {
                const k = p.maxSpeed / currentSpeed;
                p.vx *= k; p.vy *= k;
            }
        }
        
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.x = clamp(p.x, minX + p.r, maxX - p.r);
        p.y = clamp(p.y, top + p.r, bottom - p.r);
    };

    if (state.gameMode === 'twoPlayer') {
        move(paddleA, 'w', 's', 'a', 'd');
    } else {
        aiControl(dt);
    }
    move(paddleB, 'arrowup', 'arrowdown', 'arrowleft', 'arrowright');

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
            const overlap = minD - dist;
            puck.x += nx * overlap; puck.y += ny * overlap;

            const vdx = puck.vx - p.vx, vdy = puck.vy - p.vy;
            const dotN = vdx * nx + vdy * ny;
            if (dotN < 0) {
                const restitution = 1.3;
                const impulse = -(restitution) * dotN / (1 / puck.mass + 1 / p.mass);
                puck.vx += impulse * nx / puck.mass;
                puck.vy += impulse * ny / puck.mass;
                puck.angularVelocity += (p.vx * ny - p.vy * nx) * 0.002;
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
 * @param {string} player - The player who scored ('A' or 'B').
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
 * @param {object} p - The paddle object.
 * @param {string} c - The main color.
 * @param {string} inner - The inner color.
 * @param {number} dt - Delta time.
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
