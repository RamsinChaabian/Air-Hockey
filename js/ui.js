function showMessage(content, color, isLottie = false) {
    if (isLottie) {
        messageOverlay.innerHTML = content;
        lottie.loadAnimation({
            container: document.getElementById('lottieEmoji'),
            renderer: 'svg',
            loop: true,
            autoplay: true,
            path: 'lottie.json'
        });
    } else {
        messageOverlay.textContent = content;
    }
    messageOverlay.style.color = color;
    messageOverlay.classList.remove('show');
    void messageOverlay.offsetWidth;
    messageOverlay.classList.add('show');
    setTimeout(() => messageOverlay.classList.remove('show'), 1200);
}

function endMatch() {
    state.running = false;
    stopCrowd();
    if (window.matchInterval) clearInterval(window.matchInterval);

    modal.style.display = 'flex';
    const winnerA = state.gameMode === 'singlePlayer' ? 'هوش مصنوعی' : 'بازیکن چپ ←';
    const winner = state.scoreA > state.scoreB ? `${winnerA} پیروز شد!` : (state.scoreB > state.scoreA ? 'بازیکن راست پیروز شد!' : 'تساوی!');

    let finalMessage = `<h2 style="text-align:center">پایان مسابقه</h2>`;
    if (state.goldenGoal) {
        finalMessage += `<div style="font-size:24px; text-align:center; color:#FFD700; margin-bottom:12px;">با گل طلایی!</div>`;
    }

    modal.querySelector('.panel').innerHTML = `
        ${finalMessage}
        <div style="font-size:32px;margin:10px 0;color:#ffd166; text-align:center;">${winner}</div>
        <div style="display:flex;gap:12px;margin:10px 0; justify-content:center;">
          <div class="scoreBox">
            <div style="text-align:center"><div class="label">→ بازیکن راست</div><div class="scoreNumber">${state.scoreB}</div></div>
          </div>
          <div class="scoreBox">
            <div style="text-align:center"><div class="label">${winnerA}</div><div class="scoreNumber">${state.scoreA}</div></div>
          </div>
         </div>
        <div style="margin-top:10px; text-align:center;">
          <button onclick="location.reload()" class="btn">بازی مجدد</button>
        </div>
      `;
}
