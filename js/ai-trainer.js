// js/ai-trainer.js

// -- متغیرهای مربوط به هوش مصنوعی --
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
let episodeRewardDetails = {};

let performanceTracker = [];
const CONSECUTIVE_EPISODES_FOR_RESET = 25;
const REWARD_THRESHOLD = -10;
// -- -- -- -- -- -- -- -- -- -- -- --

// محاسبه پاداش برای هوش مصنوعی بر اساس عملکرد
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

    const isInCorner = paddleA.x < cornerThresholdX || paddleA.y < top + cornerThresholdY || paddleA.y > bottom - cornerThresholdY;

    if (isInCorner) {
        const cornerPenalty = -0.8;
        reward += cornerPenalty;
        details['جريمه گوشه'] = cornerPenalty;
    } else {
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

// آموزش هوش مصنوعی در هر مرحله از بازی
function trainAI(scored, conceded, causedPenalty) {
    if (state.running && (state.gameMode === 'singlePlayer' || state.gameMode === 'ai-vs-ai') && lastState) {
        trainingStepCount++;
        const { total: reward, details: rewardDetails } = calculateRewardWithDetails(scored, conceded, causedPenalty);

        for (const key in rewardDetails) {
            episodeRewardDetails[key] = (episodeRewardDetails[key] || 0) + rewardDetails[key];
        }

        totalReward += reward;
        const newState = getGameState();
        const episodeDone = scored || conceded || (state.timeLeft <= 0 && !state.goldenGoal);

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
}