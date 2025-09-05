// js/event-listeners.js

// این تابع تمام رویدادهای مورد نیاز برنامه را تنظیم می‌کند
function setupEventListeners() {
    // رویدادهای مربوط به دکمه‌های اصلی و پنجره مرورگر
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

    // --- مدیریت کامل ذخیره و بارگذاری مدل هوش مصنوعی ---
    const saveAiBtn = document.getElementById('saveAiBtn');
    const loadAiBtn = document.getElementById('loadAiBtn');
    const loadAiModal = document.getElementById('loadAiModal');
    const selectFilesBtn = document.getElementById('selectFilesBtn');
    const confirmLoadBtn = document.getElementById('confirmLoadBtn');
    const cancelLoadBtn = document.getElementById('cancelLoadBtn');
    const modelUploader = document.getElementById('modelUploader');
    const fileStatusEl = document.getElementById('fileStatus');
    let stagedFiles = [];

    // بررسی می‌کند که آیا هر سه فایل مورد نیاز (.json, .bin, .txt) انتخاب شده‌اند یا خیر
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
    // --- پایان بخش بارگذاری مدل ---

    // --- ورودی‌های کیبورد ---
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

    // --- ورودی‌های لمسی ---
    canvas.addEventListener('touchstart', e => {
        e.preventDefault();
        for (const t of e.changedTouches) {
            activeTouch[t.identifier] = { id: t.identifier };
        }
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
                paddleA.x = pos.x;
                paddleA.y = pos.y;
            } else {
                paddleB.x = pos.x;
                paddleB.y = pos.y;
            }
        }
    }, { passive: false });

    // --- سایر رویدادها ---
    window.addEventListener('orientationchange', () => { resize(); resetObjects(); });
    document.addEventListener('selectstart', e => e.preventDefault());
}