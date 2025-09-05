// js/main.js

let last = performance.now();
let lastState = null;

// تابع اصلی برنامه که همه چیز را راه‌اندازی می‌کند
function initializeApp() {
    console.log("Initializing Air Hockey AI...");
    resize();
    resetObjects();
    setupEventListeners(); // فراخوانی تابع جدید برای تنظیم رویدادها
    requestAnimationFrame(loop);
}

// حلقه اصلی بازی
async function loop(now) {
    if (state.paused) {
        requestAnimationFrame(loop);
        return;
    }

    const dt = Math.min(0.03, (now - last) / 1000);
    last = now;

    const originalScoreA = state.scoreA;
    const originalScoreB = state.scoreB;
    const penaltyStateBefore = state.penaltyFor;

    if (state.running) {
        handleGamepadInput(dt);
        stepPhysics(dt);
    }
    
    // بررسی وضعیت بازی برای آموزش هوش مصنوعی
    let scored = state.scoreA > originalScoreA;
    let conceded = state.scoreB > originalScoreB;
    let causedPenalty = (penaltyStateBefore !== 'A' && state.penaltyFor === 'A');
    trainAI(scored, conceded, causedPenalty);

    // مدیریت لرزش صفحه
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

// شروع برنامه
initializeApp();