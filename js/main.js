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
let trainingEpisodeCount = 0;
let totalReward = 0;
const TARGET_UPDATE_FREQUENCY = 10;
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
    playerALabel.textContent = mode === 'singlePlayer' ? 'هوش مصنوعی' : 'بازیکن ←';
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
            if (state.gameMode === 'singlePlayer') {
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

function calculateReward(scored, conceded) {
    if (scored) return 100;
    if (conceded) return -100;
    
    let reward = 0;
    const distToPuck = distance(paddleA, puck);
    reward += (1 - (distToPuck / canvas.width)) * 0.1;

    if (lastTouch === 'A') {
        reward += 1;
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

    if (state.running && state.gameMode === 'singlePlayer' && lastState) {
        const reward = calculateReward(scored, conceded);
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
            
            if (replayBuffer.length >= TRAINING_BATCH_SIZE) {
                const batch = [];
                for (let i = 0; i < TRAINING_BATCH_SIZE; i++) {
                    const randomIndex = Math.floor(Math.random() * replayBuffer.length);
                    batch.push(replayBuffer[randomIndex]);
                }
                console.log("Training the brain with a batch of " + TRAINING_BATCH_SIZE + " experiences...");
                await rlAgent.train(batch, targetAgent.model);
            } else {
                console.log(`Collecting experiences... ${replayBuffer.length}/${TRAINING_BATCH_SIZE}`);
            }
            
            if (trainingEpisodeCount % TARGET_UPDATE_FREQUENCY === 0) {
                rlAgent.updateTargetModel(targetAgent.model);
                console.log(`%c🎯 Target Model Updated!`, "color: cyan; font-weight: bold;");
            }

            console.log(`🧠 AI Status: Exploration (Epsilon) = ${rlAgent.epsilon.toFixed(4)}`);
            console.groupEnd();

            totalReward = 0;
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

// --- Event Listeners ---
window.addEventListener('resize', () => { resize(); resetObjects(); });
fsBtn.addEventListener('click', tryFullscreen);
startSinglePlayerBtn.addEventListener('click', () => startGame('singlePlayer'));
startTwoPlayerBtn.addEventListener('click', () => startGame('twoPlayer'));
pauseBtn.addEventListener('click', togglePause);
resetBtn.addEventListener('click', () => location.reload());

// ==========================================================
// == بخش مدیریت پیشرفته بارگذاری هوش مصنوعی ==
// ==========================================================
const saveAiBtn = document.getElementById('saveAiBtn');
const loadAiBtn = document.getElementById('loadAiBtn');
const loadAiModal = document.getElementById('loadAiModal');

const selectJsonBtn = document.getElementById('selectJsonBtn');
const selectBinBtn = document.getElementById('selectBinBtn');
const selectTxtBtn = document.getElementById('selectTxtBtn');
const confirmLoadBtn = document.getElementById('confirmLoadBtn');
const cancelLoadBtn = document.getElementById('cancelLoadBtn');

const jsonUploader = document.getElementById('jsonUploader');
const binUploader = document.getElementById('binUploader');
const txtUploader = document.getElementById('txtUploader');

let stagedFiles = { jsonFile: null, weightsFile: null, epsilonFile: null };

function checkFilesReady() {
    const ready = stagedFiles.jsonFile && stagedFiles.weightsFile && stagedFiles.epsilonFile;
    confirmLoadBtn.disabled = !ready;
    confirmLoadBtn.style.opacity = ready ? 1 : 0.5;
}

if (saveAiBtn) {
    saveAiBtn.addEventListener('click', () => {
        if(state.gameMode === 'singlePlayer') {
            rlAgent.saveModel();
        } else {
            showMessage("فقط در حالت تک‌نفره!", "orange");
        }
    });
}
if (loadAiBtn) {
    loadAiBtn.addEventListener('click', () => {
        loadAiModal.style.display = 'flex';
        stagedFiles = { jsonFile: null, weightsFile: null, epsilonFile: null };
        document.getElementById('jsonStatus').textContent = '❌';
        document.getElementById('binStatus').textContent = '❌';
        document.getElementById('txtStatus').textContent = '❌';
        checkFilesReady();
    });
}

selectJsonBtn.addEventListener('click', () => jsonUploader.click());
selectBinBtn.addEventListener('click', () => binUploader.click());
selectTxtBtn.addEventListener('click', () => txtUploader.click());

jsonUploader.addEventListener('change', e => {
    stagedFiles.jsonFile = e.target.files[0];
    document.getElementById('jsonStatus').textContent = '✔️';
    checkFilesReady();
});
binUploader.addEventListener('change', e => {
    stagedFiles.weightsFile = e.target.files[0];
    document.getElementById('binStatus').textContent = '✔️';
    checkFilesReady();
});
txtUploader.addEventListener('change', e => {
    stagedFiles.epsilonFile = e.target.files[0];
    document.getElementById('txtStatus').textContent = '✔️';
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