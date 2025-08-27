// --- Sizing and Fullscreen ---
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

async function tryFullscreen() {
    try {
        if (document.documentElement.requestFullscreen) {
            await document.documentElement.requestFullscreen();
        }
    } catch (e) {
        console.warn('fullscreen blocked', e);
    }
}

// --- Table Coordinates ---
function tableCoords(w, h) {
    const padding = Math.min(w * 0.06, 60);
    const left = padding, right = w - padding;
    const top = h * 0.18, bottom = h - h * 0.08;
    return { left, right, top, bottom, width: right - left, height: bottom - top };
}

// --- Vector Utilities ---
function normalize(v) {
    const len = Math.hypot(v.x, v.y) || 1;
    return { x: v.x / len, y: v.y / len };
}

function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function dot(a, b) {
    return a.x * b.x + a.y * b.y;
}

function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

// --- Drawing Utilities ---
function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

// --- Time Formatting ---
function formatTime(s) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
}
