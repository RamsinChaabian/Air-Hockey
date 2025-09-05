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

let trainingStepCount = 0;
const TARGET_UPDATE_FREQUENCY_STEPS = 1000;

let trainingEpisodeCount = 0;
let totalReward = 0;
let episodeRewardDetails = {}; // برای جمع‌آوری جزئیات پاداش در طول اپیزود

// متغیرهای جدید برای مدیریت هوشمند اکتشاف
let performanceTracker = [];
const CONSECUTIVE_EPISODES_FOR_RESET = 25;
const REWARD_THRESHOLD = -10;
// ===========================================

function initializeApp() {
    console.log("Initializing Air Hockey AI... Start a single player game or load a saved model.");
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
    episodeRewardDetails = {}; // ریست کردن جزئیات پاداش برای بازی جدید
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
        setTimeout(() => messageOverlay.classList.remove('show'), 2500);
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

function calculateRewardWithDetails(scored, conceded, causedPenalty) {
    const details = {};
    let reward = 0;

    if (scored) {
        details['گل زده'] = 50;
        return { total: 50, details };
    }
    if (conceded) {
        details['گل خورده'] = -50;
        return { total: -50, details };
    }
    if (causedPenalty) {
        details['پنالتی (اوت)'] = -25;
        return { total: -25, details };
    }

    const { left, right, top, bottom, width, height } = tableCoords(canvas.width, canvas.height);
    const cornerThresholdX = left + width * 0.15;
    const cornerThresholdY = height * 0.2;

    // ** منطق جدید **
    const isInCorner = paddleA.x < cornerThresholdX || paddleA.y < top + cornerThresholdY || paddleA.y > bottom - cornerThresholdY;

    if (isInCorner) {
        const cornerPenalty = -0.8;
        reward += cornerPenalty;
        details['جريمه گوشه'] = cornerPenalty;
        // اگر در گوشه باشد، هیچ پاداش دیگری محاسبه نمی‌شود
    } else {
        // این محاسبات فقط زمانی انجام می‌شود که هوش مصنوعی در گوشه نباشد
        const distFromCenterY = Math.abs(paddleA.y - (top + bottom) / 2);
        const centerReward = (1 - (distFromCenterY / (height / 2))) * 0.4;
        reward += centerReward;
        details['کنترل مرکز'] = centerReward;

        const distToPuck = distance(paddleA, puck);
        const proximityReward = (1 - (distToPuck / width)) * 0.2;
        reward += proximityReward;
        details['نزدیکی به توپ'] = proximityReward;

        const puckProgress = (puck.x - left) / width;
        const progressReward = puckProgress * 0.8;
        reward += progressReward;
        details['پیشروی توپ'] = progressReward;

        if (lastTouch === 'A') {
            const opponentGoal = { x: right, y: (top + bottom) / 2 };
            const puckSpeedTowardsGoal = (puck.vx * (opponentGoal.x - puck.x));
            if (puckSpeedTowardsGoal > 0) {
                const shotReward = (puckSpeedTowardsGoal / (width * puck.maxSpeed)) * 1.5;
                reward += shotReward;
                details['شوت موثر'] = shotReward;
            }
        }
    }

    return { total: reward, details };
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
    const penaltyStateBefore = state.penaltyFor;

    if (state.running) {
        handleGamepadInput(dt);
        stepPhysics(dt);
    }

    let scored = state.scoreA > originalScoreA;
    let conceded = state.scoreB > originalScoreB;
    let causedPenalty = (penaltyStateBefore !== 'A' && state.penaltyFor === 'A');
    let episodeDone = scored || conceded || (state.timeLeft <= 0 && !state.goldenGoal);

    if (state.running && (state.gameMode === 'singlePlayer' || state.gameMode === 'ai-vs-ai') && lastState) {
        trainingStepCount++;
        const { total: reward, details: rewardDetails } = calculateRewardWithDetails(scored, conceded, causedPenalty);

        for (const key in rewardDetails) {
            if (episodeRewardDetails[key]) {
                episodeRewardDetails[key] += rewardDetails[key];
            } else {
                episodeRewardDetails[key] = rewardDetails[key];
            }
        }

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

            console.log("%cAggregated Reward Details for the Episode:", "color: lightblue; font-weight: bold;");
            const sortedDetails = Object.entries(episodeRewardDetails)
                .sort(([, a], [, b]) => a - b)
                .reduce((r, [k, v]) => ({ ...r, [k]: v.toFixed(2) }), {});
            console.table(sortedDetails);

            if (totalReward < REWARD_THRESHOLD) {
                performanceTracker.push(true);
            } else {
                performanceTracker = [];
            }

            if (performanceTracker.length >= CONSECUTIVE_EPISODES_FOR_RESET) {
                rlAgent.epsilon = Math.max(rlAgent.epsilon, 0.4);
                console.log('%c🧠 AI stuck in local minimum! Resetting epsilon to force exploration.', 'color: orange; font-weight: bold;');
                performanceTracker = [];
            }

            if (replayBuffer.length < TRAINING_BATCH_SIZE) {
                console.log(`Collecting experiences... ${replayBuffer.length}/${TRAINING_BATCH_SIZE}`);
            }

            console.log(`🧠 AI Status: Exploration (Epsilon) = ${rlAgent.epsilon.toFixed(4)}`);
            console.groupEnd();

            totalReward = 0;
            episodeRewardDetails = {};
        }

        if (trainingStepCount % 4 === 0 && replayBuffer.length >= TRAINING_BATCH_SIZE) {
            const batch = [];
            for (let i = 0; i < TRAINING_BATCH_SIZE; i++) {
                const randomIndex = Math.floor(Math.random() * replayBuffer.length);
                batch.push(replayBuffer[randomIndex]);
            }
            rlAgent.train(batch, targetAgent.model);
        }

        if (trainingStepCount % TARGET_UPDATE_FREQUENCY_STEPS === 0 && trainingStepCount > 0) {
            rlAgent.updateTargetModel(targetAgent.model);
            console.log(`%c🎯 Target Model Updated after ${trainingStepCount} steps!`, "color: cyan; font-weight: bold;");
        }
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

// --- Event Listeners and the rest of the file...
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

const saveAiBtn = document.getElementById('saveAiBtn');
const loadAiBtn = document.getElementById('loadAiBtn');
const loadAiModal = document.getElementById('loadAiModal');
const selectFilesBtn = document.getElementById('selectFilesBtn');
const confirmLoadBtn = document.getElementById('confirmLoadBtn');
const cancelLoadBtn = document.getElementById('cancelLoadBtn');
const modelUploader = document.getElementById('modelUploader');
const fileStatusEl = document.getElementById('fileStatus');
let stagedFiles = [];

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
        if (state.gameMode === 'singlePlayer' || state.gameMode === 'ai-vs-ai') {
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
        modelUploader.value = "";
        checkFilesReady();
    });
}

selectFilesBtn.addEventListener('click', () => modelUploader.click());

modelUploader.addEventListener('change', e => {
    stagedFiles = Array.from(e.target.files);
    checkFilesReady();
});

confirmLoadBtn.addEventListener('click', async () => {
    const modelLoaded = await rlAgent.loadModel(stagedFiles);
    if (modelLoaded) {
        rlAgent.updateTargetModel(targetAgent.model);
        loadAiModal.style.display = 'none';
    }
});

cancelLoadBtn.addEventListener('click', () => {
    loadAiModal.style.display = 'none';
});

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

initializeApp();