// js/rl_agent.js

class RLAgent {
    constructor() {
        this.model = this.createModel();
        // پارامترهای یادگیری
        this.learningRate = 0.001;
        this.discountFactor = 0.95;
        this.epsilon = 1.0;
        this.epsilonDecay = 0.995;
        this.epsilonMin = 0.05;
    }

    // -- START: PHASE 3 CHANGES --
    createModel() {
        const model = tf.sequential();
        // ورودی همچنان 13 است
        model.add(tf.layers.dense({ inputShape: [13], units: 64, activation: 'relu' }));
        model.add(tf.layers.dense({ units: 64, activation: 'relu' }));
        // افزایش سایز خروجی به 13 برای پشتیبانی از 3 شوت و توربو
        model.add(tf.layers.dense({ units: 13, activation: 'linear' }));
        model.compile({ optimizer: tf.train.adam(this.learningRate), loss: 'meanSquaredError' });
        return model;
    }

    chooseAction(state) {
        if (Math.random() <= this.epsilon) {
            // انتخاب یک حرکت تصادفی از بین 13 حرکت ممکن
            return Math.floor(Math.random() * 13);
        }
        return tf.tidy(() => {
            const prediction = this.model.predict(tf.tensor2d([state]));
            return prediction.argMax(1).dataSync()[0];
        });
    }

    async train(batch, targetModel) {
        if (batch.length < TRAINING_BATCH_SIZE) return;

        const states = batch.map(exp => exp.state);
        const actions = batch.map(exp => exp.action);
        const rewards = batch.map(exp => exp.reward);
        const nextStates = batch.map(exp => exp.nextState);
        const dones = batch.map(exp => exp.done);

        const statesTensor = tf.tensor2d(states, [batch.length, 13]);
        const actionsTensor = tf.tensor1d(actions, 'int32');
        const rewardsTensor = tf.tensor1d(rewards, 'float32');
        const nextStatesTensor = tf.tensor2d(nextStates, [batch.length, 13]);
        const donesTensor = tf.tensor1d(dones, 'bool');

        const nextQValues = targetModel.predict(nextStatesTensor);
        const maxNextQ = nextQValues.max(1);

        const terminalStateMask = donesTensor.logicalNot();
        const targetQValues = rewardsTensor.add(
            maxNextQ.mul(this.discountFactor).mul(terminalStateMask)
        );

        const currentQValues = this.model.predict(statesTensor);
        // به‌روزرسانی تعداد حرکات در oneHot
        const actionMask = tf.oneHot(actionsTensor, 13);
        const invertedActionMask = tf.sub(1, actionMask);

        const updatedQValues = currentQValues.mul(invertedActionMask).add(
            actionMask.mul(targetQValues.expandDims(1))
        );

        await this.model.fit(statesTensor, updatedQValues, {
            epochs: 1, verbose: 0,
            callbacks: {
                onTrainEnd: () => {
                    tf.dispose([
                        statesTensor, actionsTensor, rewardsTensor, nextStatesTensor,
                        donesTensor, nextQValues, maxNextQ, terminalStateMask,
                        targetQValues, currentQValues, actionMask, invertedActionMask, updatedQValues
                    ]);
                }
            }
        });

        if (this.epsilon > this.epsilonMin) {
            this.epsilon *= this.epsilonDecay;
        }
    }
    // -- END: PHASE 3 CHANGES --

    updateTargetModel(targetModel) {
        targetModel.setWeights(this.model.getWeights());
    }

    async saveModel() {
        await this.model.save('downloads://air-hockey-ai-model');
        const epsilonData = new Blob([this.epsilon.toString()], {type: 'text/plain'});
        const url = window.URL.createObjectURL(epsilonData);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = 'air-hockey-ai-epsilon.txt';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
        
        console.log("%cAI Model and Epsilon Saved for Download!", "color: lightgreen; font-weight: bold;");
        showMessage("فایل‌های هوش مصنوعی آماده دانلود!", "#02ffa0");
    }

    async loadModel(files) {
        if (!files || files.length < 3) {
            showMessage("لطفاً هر سه فایل مدل را انتخاب کنید!", "red");
            return false;
        }

        const jsonFile = files.find(f => f.name.endsWith('.json'));
        const weightsFile = files.find(f => f.name.endsWith('.bin'));
        const epsilonFile = files.find(f => f.name.endsWith('.txt'));

        if (!jsonFile || !weightsFile || !epsilonFile) {
            console.error("One or more required model files are missing from the selection.");
            showMessage("فایل‌های JSON, BIN, یا TXT در انتخاب شما یافت نشد!", "red");
            return false;
        }

        try {
            this.model = await tf.loadLayersModel(tf.io.browserFiles([jsonFile, weightsFile]));
            this.model.compile({ optimizer: tf.train.adam(this.learningRate), loss: 'meanSquaredError' });
            
            const epsilonValue = await epsilonFile.text();
            this.epsilon = parseFloat(epsilonValue);

            console.log("%cAI Model Loaded Successfully from files!", "color: cyan; font-weight: bold;");
            showMessage("هوش مصنوعی بارگذاری شد!", "#56ccf2");
            return true;

        } catch (error) {
            console.error("Error loading model from files:", error);
            showMessage("خطا در بارگذاری فایل!", "red");
            return false;
        }
    }
}