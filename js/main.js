window.matchInterval = null;
let last = performance.now();

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
    playerALabel.textContent = mode === 'singlePlayer' ? 'هوش مصنوعی' : 'بازیکن ←';
    startCrowd();
    state.matchTime = Math.max(10, Math.floor(minutes * 60));
    state.timeLeft = state.matchTime;
    state.running = false; // Game is not running during countdown
    state.paused = false;
    state.scoreA = 0;
    state.scoreB = 0;
    scoreAEl.textContent = 0;
    scoreBEl.textContent = 0;
    timerEl.textContent = formatTime(state.timeLeft);
    lastTouch = null;
    messageOverlay.classList.remove('show');
    if (window.matchInterval) clearInterval(window.matchInterval);

    let countdownValue = 3;

    function doCountdown() {
        if (countdownValue > 0) {
            showMessage(countdownValue, 'white');
            playClick(440, 0.1, 0.2); // Countdown tick sound
            countdownValue--;
            setTimeout(doCountdown, 1000);
        } else {
            showMessage('شروع!', '#ffd166');
            playWhistle();
            state.running = true; // Start the game

            // Start the main match timer interval
            window.matchInterval = setInterval(() => {
                if (state.running && !state.paused && !state.goldenGoal) {
                    state.timeLeft -= 1;
                    timerEl.textContent = formatTime(state.timeLeft);
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
        
        messageOverlay.innerHTML = `<div class="golden-goal-text" style="font-size: clamp(48px, 12vw, 120px);">گل طلایی</div>`;
        messageOverlay.classList.remove('show');
        void messageOverlay.offsetWidth;
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
        last = performance.now(); // Reset timer to avoid a large dt jump
        requestAnimationFrame(loop);
    }
}

function loop(now) {
    if (state.paused) return; // Stop the loop if paused

    const dt = Math.min(0.03, (now - last) / 1000);
    last = now;

    if (state.running) {
        handleGamepadInput(dt);
        stepPhysics(dt);
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
window.addEventListener('resize', () => {
    resize();
    resetObjects(); 
});
fsBtn.addEventListener('click', tryFullscreen);
startSinglePlayerBtn.addEventListener('click', () => startGame('singlePlayer'));
startTwoPlayerBtn.addEventListener('click', () => startGame('twoPlayer'));
pauseBtn.addEventListener('click', togglePause);
resetBtn.addEventListener('click', () => location.reload()); // Simple reset

window.addEventListener('keydown', e => {
    if (e.key === 'Escape' || e.key === 'p') {
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
resize();
resetObjects();
requestAnimationFrame(loop);
