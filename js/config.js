// --- DOM Elements ---
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const modal = document.getElementById('modal');
const startSinglePlayerBtn = document.getElementById('startSinglePlayerBtn');
const startTwoPlayerBtn = document.getElementById('startTwoPlayerBtn');
const fsBtn = document.getElementById('fullscreenBtn');
const scoreAEl = document.getElementById('scoreA');
const scoreBEl = document.getElementById('scoreB');
const timerEl = document.getElementById('timer');
const matchMinutesSelect = document.getElementById('matchMinutes');
const playerALabel = document.getElementById('playerALabel');
const messageOverlay = document.getElementById('messageOverlay');
const pauseBtn = document.getElementById('pauseBtn');
const resetBtn = document.getElementById('resetBtn');

// --- Game State ---
const state = {
    running: false,
    paused: false,
    scoreA: 0,
    scoreB: 0,
    matchTime: 120,
    timeLeft: 0,
    gameMode: 'singlePlayer',
    penaltyFor: null,
    goldenGoal: false
};

// --- Game Objects ---
let puck, paddleA, paddleB;
let lastTouch = null; // 'A' or 'B'

// --- Input States ---
const keys = {};
const activeTouch = {};
const prevPad = {};

// --- Shoot Mechanics (MODIFIED) ---
const shoot = {
    cooldownA: 0,
    cooldownB: 0,
    aiCooldown: 0,
    distance: 18,
    // قدرت پایه برای شوت بازیکنان، حتی اگر دسته ثابت باشد
    basePowerHuman: 800,
    // میزان تاثیر سرعت دسته بر قدرت نهایی شوت
    velocityPowerMultiplier: 1.8,
    // قدرت هوش مصنوعی ثابت باقی می‌ماند
    powerAI: 4000,
    cooldownHuman: 0.35,
    cooldownAI: 0.65
};

// --- NEW: Turbo Mechanics ---
const turbo = {
    accelerationMultiplier: 2.8,
    maxSpeedMultiplier: 2.5,
    powerMultiplier: 2.2
};


// --- Effects ---
let flashTimer = 0;
let flashSide = null;
let shakeTimer = 0;
let shakeIntensity = 0;

