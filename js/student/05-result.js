/* ============================================
   答題結果提示
   ────────────────────────────────────────────
   原本只在畫面上方放一條小橫幅,學生按完送出、畫面一跳,
   常常根本沒注意到自己到底答對還是答錯。改成擋在中央的對話框:
   要按一下才會消失,想不看到都難。
============================================ */
function showWarResult(ok, message) {
  let el = document.getElementById('warResultModal');
  if (!el) {
    el = document.createElement('div');
    el.id = 'warResultModal';
    el.className = 'war-result-modal';
    document.body.appendChild(el);
  }

  const kind = ok === true ? 'ok' : ok === false ? 'no' : 'err';
  const mark = ok === true ? '✓' : ok === false ? '✕' : '!';
  const title = ok === true ? '答對了!' : ok === false ? '答錯了' : '送出失敗';

  el.innerHTML = `
    <div class="war-result-card is-${kind}">
      <div class="war-result-mark">${mark}</div>
      <div class="war-result-title">${title}</div>
      <div class="war-result-msg">${escapeHtml(message)}</div>
      <button class="btn btn-primary btn-block" onclick="hideWarResult()">繼續</button>
    </div>`;
  el.classList.add('is-open');
}

function hideWarResult() {
  const el = document.getElementById('warResultModal');
  if (el) el.classList.remove('is-open');
}
