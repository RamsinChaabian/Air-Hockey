// --- WebAudio API ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playClick(frequency = 880, duration = 0.06, volume = 0.12) {
    if (audioCtx.state === 'suspended') return;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(frequency, audioCtx.currentTime);
    g.gain.setValueAtTime(volume, audioCtx.currentTime);
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + duration);
}

function playWhistle() {
    if (audioCtx.state === 'suspended') return;
    const t0 = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(2000 + Math.random() * 500, t0);
    g.gain.setValueAtTime(0.08, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.8);
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start(t0);
    o.stop(t0 + 0.8);
}

function playShoot() {
    if (audioCtx.state === 'suspended') return;
    const t0 = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(180, t0);
    o.frequency.exponentialRampToValueAtTime(520, t0 + 0.08);
    g.gain.setValueAtTime(0.1, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.2);
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start(t0);
    o.stop(t0 + 0.22);
}

const crowd = { gainNode: audioCtx.createGain(), running: false, cheerTimer: null, source: null };

function startCrowd() {
    if (crowd.running || audioCtx.state === 'suspended') return;
    const bufferSize = 2 * audioCtx.sampleRate;
    const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        output[i] = (Math.random() * 2 - 1) * 0.4;
    }
    const whiteNoise = audioCtx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;
    const noiseFilter = audioCtx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.setValueAtTime(1100, audioCtx.currentTime);
    whiteNoise.connect(noiseFilter);
    noiseFilter.connect(crowd.gainNode);
    crowd.gainNode.connect(audioCtx.destination);
    crowd.gainNode.gain.setValueAtTime(0.03, audioCtx.currentTime);
    whiteNoise.start();
    crowd.source = whiteNoise;
    crowd.running = true;
    crowd.cheerTimer = setInterval(() => { playCheer(); }, 7000 + Math.random() * 8000);
}

function stopCrowd() {
    if (crowd.running) {
        crowd.source.stop();
        clearInterval(crowd.cheerTimer);
        crowd.running = false;
    }
}

function playCheer(volume = 0.06) {
    if (audioCtx.state === 'suspended') return;
    const t0 = audioCtx.currentTime;
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.001, t0);
    g.connect(audioCtx.destination);
    [440, 660, 880].map(f => {
        const o = audioCtx.createOscillator();
        o.type = 'triangle';
        o.frequency.setValueAtTime(f + (Math.random() * 80 - 40), t0);
        o.connect(g);
        o.start();
        setTimeout(() => o.stop(), 0.25 * 1000);
    });
    g.gain.linearRampToValueAtTime(volume, t0 + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.7);
}
