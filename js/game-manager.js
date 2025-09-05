// js/game-manager.js

// این تابع مسئولیت شروع بازی را بر عهده دارد
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

// این تابع مسابقه را با زمان و حالت مشخص شده آغاز می‌کند
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
    episodeRewardDetails = {};
    messageOverlay.classList.remove('show');
    if (window.matchInterval) clearInterval(window.matchInterval);

    // شمارش معکوس برای شروع بازی
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

            // تایمر بازی
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

// مدیریت وضعیت پایان زمان بازی و ورود به حالت "گل طلایی"
function handleTimeUp() {
    if (state.scoreA === state.scoreB) {
        state.goldenGoal = true;
        state.running = true;
        if (window.matchInterval) clearInterval(window.matchInterval);
        timerEl.textContent = 'گل طلایی';
        timerEl.classList.add('golden-goal-text');
        messageOverlay.innerHTML = `<div class="golden-goal-text">گل طلایی</div>`;
        messageOverlay.classList.add('show');
        setTimeout(() => messageOverlay.classList.remove('show'), 2500);
        playWhistle();
    } else {
        endMatch();
    }
}

// توقف و ادامه بازی
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