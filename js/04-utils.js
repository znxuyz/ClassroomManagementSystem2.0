/* ============================================
   提示訊息
============================================ */
let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

/* 依座號排序。沒填座號的排最後。
   座號是字串(可能是 "07"),要轉成數字比,不然 10 會排在 2 前面。 */
function bySeatNumber(a, b) {
  const na = parseInt(a.seatNumber, 10);
  const nb = parseInt(b.seatNumber, 10);
  return (isNaN(na) ? Infinity : na) - (isNaN(nb) ? Infinity : nb);
}

/* 帶一個動作按鈕的提示。批次發分之後要能馬上復原 —— 一次改 28 個人,
   沒有退路的話老師按錯只能一個一個補回去。 */
let toastActionTimer = null;

function toastWithAction(msg, label, onClick) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.innerHTML = `<span>${escapeHtml(msg)}</span>
    <button class="toast-action" id="toastActionBtn">${escapeHtml(label)}</button>`;
  el.classList.add('show', 'has-action');

  const btn = el.querySelector('#toastActionBtn');
  if (btn) btn.onclick = () => { hideToast(); onClick(); };

  clearTimeout(toastTimer);
  clearTimeout(toastActionTimer);
  toastActionTimer = setTimeout(hideToast, 6000);   // 給久一點,要看得到才按得到
}

function hideToast() {
  const el = document.getElementById('toast');
  if (!el) return;
  el.classList.remove('show', 'has-action');
}
