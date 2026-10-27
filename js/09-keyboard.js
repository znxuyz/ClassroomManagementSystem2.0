/* ============================================
   鍵盤操作
   ────────────────────────────────────────────
   這個專案原本**一個鍵盤事件都沒有**。表單填完不能按 Enter 送出,
   每一次都得把手離開鍵盤去點按鈕 —— 而老師一天要在「學生加分」
   按幾十次、出題時要連續新增幾十題。

   這裡做三件事:

   1. 建立列裡按 Enter 就送出,而且送出後焦點回到第一格 ——
      連續新增十題時手不必離開鍵盤
   2. Esc 收起加分面板 / 離開地圖編輯
   3. 讓焦點看得見(見 css 的 :focus-visible)

   ── 中文輸入法的那個坑 ──
   注音、倉頡在選字時也是按 Enter 確認的。如果不判斷「正在組字」,
   老師打「陳怡安」按 Enter 選字,表單就直接送出去了 ——
   這在中文介面是會真的壞掉的,所以 isComposing 的檢查不能省。
============================================ */

/* 哪些容器算「一排可以按 Enter 送出的欄位」。
   每一種容器裡的主要按鈕(btn-primary / btn-accent)就是它的送出鈕。
   找不到主要按鈕就什麼都不做 —— 寧可沒反應,也不要按到「刪除」。 */
const ENTER_ROWS = [
  '[data-enter-row]',      // 給程式產生的列用(例如獎品卡的編輯狀態)
  '.field-row',
  '.quiz-create-form',
  '.tq-form',
  '.custom-points-row',
  '.group-controls',
  '.seating-toolbar',
  '.api-key-input-row'
];

function _enterRowOf(el) {
  for (const sel of ENTER_ROWS) {
    const row = el.closest(sel);
    if (row) return row;
  }
  return null;
}

/* 這一排的送出鈕。只認主要按鈕 —— ghost 多半是「取消 / 刪除 / 另一條路」,
   按 Enter 跑到那些上面會出事。 */
function _submitBtnOf(row) {
  const btn = row.querySelector('.btn-primary:not([disabled]), .btn-accent:not([disabled])');
  return (btn && btn.offsetParent !== null) ? btn : null;
}

document.addEventListener('keydown', e => {
  /* ---------- Enter:送出 ---------- */
  if (e.key === 'Enter') {
    /* 正在用輸入法組字(注音選字、倉頡)—— 這個 Enter 是給輸入法的。
       keyCode 229 是舊瀏覽器的說法,一起擋。 */
    if (e.isComposing || e.keyCode === 229) return;
    if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;

    const el = e.target;
    if (!el || el.tagName !== 'INPUT') return;           // textarea 的 Enter 是換行
    if (['checkbox', 'radio', 'button', 'submit', 'file'].includes(el.type)) return;

    const row = _enterRowOf(el);
    if (!row) return;
    const btn = _submitBtnOf(row);
    if (!btn) return;

    e.preventDefault();
    btn.click();

    /* 送出之後把焦點放回這一排。
       連續新增十題、十件獎品時,手不必在鍵盤與滑鼠之間來回。

       放回「第一個必填欄位」而不是「第一格」—— 獎品那一排的第一格
       是選填的 emoji 圖示,跳到那裡等於還要再按一次 Tab。
       必填欄位的標籤上有紅星(.req),拿它當記號。 */
    const req = row.querySelector('.field:has(.req) input');
    const any = row.querySelector('input:not([type=checkbox]):not([type=radio])');
    const firstId = (req || any)?.id;
    requestAnimationFrame(() => {
      const again = firstId ? document.getElementById(firstId) : null;
      if (again && again.offsetParent !== null) { again.focus(); again.select?.(); }
    });
    return;
  }

  /* ---------- Esc:收起 ---------- */
  if (e.key === 'Escape') {
    // 輸入到一半按 Esc 是「我不要填了」,先把焦點放掉就好
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) {
      e.target.blur();
      return;
    }
    // 地圖編輯模式
    if (typeof TerritoryEdit !== 'undefined' && TerritoryEdit.active) {
      TerritoryEdit.exit();
      return;
    }
    // 學生加分的面板(手機上它是蓋住畫面的浮層,一定要有辦法關掉)
    const layout = document.getElementById('dashboardLayout');
    if (layout && layout.classList.contains('has-selection')
        && typeof clearStudentSelection === 'function') {
      clearStudentSelection();
    }
  }
});
