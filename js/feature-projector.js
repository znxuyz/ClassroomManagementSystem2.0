/* ============================================
   投影模式
   ────────────────────────────────────────────
   這是**全班一起看著的那一面牆**,不是一個工具頁。所以它和其他頁的
   設計目標不一樣:

   · 一個畫面要放得下全班。原本是固定 180px 的方格,1024×768 的投影機
     只看得到 8 位,其他 20 位要捲 —— 而沒有人會在投影時捲動。
     現在依「人數 × 畫面比例」算出最接近正方形的欄數,格子自己縮放。
   · 28 個卡片框等於 28 個互相競爭的框。框線與底色全部拿掉,
     留下守護獸、名字、分數 —— 看起來才像一片森林,不像一個後台。
   · 守護獸的暱稱拿掉了。投影要回答的是「哪一個孩子、他的獸長多大、幾分」,
     暱稱在他自己的手機上看得到,放在牆上只是把獸擠小。
   · 加分的那一刻是全班一起看的,所以 flash 要夠明顯。
============================================ */

/* 算出要分幾欄。兩件事要一起顧:

   · 格子盡量接近正方形 —— 太扁或太瘦,守護獸都會變小
   · 最後一排盡量不要只剩一兩個人 —— 28 位排成 9 欄時,
     最後一排只站一個孩子,看起來像漏掉了

   所以把「空掉的格子數」也算進分數裡(權重 0.5)。
   28 位在 1920×1080 上:9 欄的格子比較方,但會空掉 8 格;
   7 欄剛好 4 排整齊,而且格子更大 —— 加進去之後就會選 7。 */
function projectorColumns(n, w, h) {
  if (n <= 0) return 1;
  let best = 1, bestScore = Infinity;
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const cw = w / cols, ch = h / rows;
    const squareness = Math.abs(Math.log((cw / ch) || 1));
    const waste = (cols * rows - n) / n;
    const score = squareness + waste * 0.5;
    if (score < bestScore - 0.001) { bestScore = score; best = cols; }
  }
  return best;
}

function renderProjector() {
  const grid = document.getElementById('projectorGrid');
  const totalEl = document.getElementById('projTotalPoints');
  if (!grid) return;

  const total = state.students.reduce((sum, s) => sum + s.totalPoints, 0);
  if (totalEl) totalEl.textContent = '總積分 ' + total;

  /* 畫面高度要扣掉上面那兩排選單(全螢幕時它們是收起來的,所以是 0)。
     不扣的話格子會算得太高,整班排成六七排、下半截被切掉 ——
     而投影的時候沒有人會去捲動。 */
  const bar = document.querySelector('.app-topbar');
  const top = (bar && bar.offsetParent !== null) ? bar.getBoundingClientRect().height : 0;
  const view = document.getElementById('projectorView');
  if (view) view.style.setProperty('--proj-top', Math.round(top) + 'px');

  const box = grid.getBoundingClientRect();
  grid.style.setProperty('--proj-cols',
    projectorColumns(state.students.length,
      box.width || window.innerWidth,
      box.height || (window.innerHeight * 0.7)));

  grid.innerHTML = state.students.map(student => {
    const stage = student.pet ? PetEngine.getStage(student.totalPoints) : 0;
    const health = PetEngine.getHealth(student);
    const icon = student.pet ? PetEngine.getIcon(student) : '❓';

    return `
      <div class="projector-card" data-student-id="${student.id}">
        <div class="projector-pet stage-${stage} health-${health}">
          ${icon}
        </div>
        <div class="projector-name">${escapeHtml(student.name)}</div>
        <div class="projector-points">${student.totalPoints}</div>
      </div>
    `;
  }).join('');
}

/* 視窗大小變了(切全螢幕、投影機換解析度)要重算欄數。
   只有投影頁開著的時候才做,不然每一次縮視窗都在重畫一整班。 */
let _projResizeTimer = null;
window.addEventListener('resize', () => {
  const v = document.getElementById('projectorView');
  if (!v || !v.classList.contains('active')) return;
  clearTimeout(_projResizeTimer);
  _projResizeTimer = setTimeout(renderProjector, 150);
});

function triggerProjectorFlash(studentId, points) {
  const card = document.querySelector(`.projector-card[data-student-id="${studentId}"]`);
  if (!card) return;
  card.classList.remove('flash');
  void card.offsetWidth;
  card.classList.add('flash');
  
  // 漂浮分數
  const rect = card.getBoundingClientRect();
  const float = document.createElement('div');
  float.className = 'float-points';
  float.textContent = (points > 0 ? '+' : '') + points;
  float.style.color = points > 0 ? 'var(--gold)' : 'var(--sick-ink)';
  float.style.left = (rect.left + rect.width / 2) + 'px';
  float.style.top = (rect.top + 20) + 'px';
  document.body.appendChild(float);
  setTimeout(() => float.remove(), 1500);
}


/* ============================================
   全螢幕投影
   ────────────────────────────────────────────
   投影到教室大螢幕時,上面那兩排選單只是在佔位置(115px),
   而且讓整個畫面看起來像一個 App,不像一面班級榮譽榜。

   真的要求瀏覽器全螢幕(不只是隱藏選單)—— 投影機通常只有 1024×768,
   省下瀏覽器的網址列與分頁列,守護獸就能再大一圈。
   不給全螢幕(或使用者按 Esc 退出)時,至少選單還是收起來的。
============================================ */
function toggleProjectorFull() {
  const root = document.documentElement;
  const on = !root.classList.contains('projector-full');
  root.classList.toggle('projector-full', on);

  const btn = document.getElementById('projFullBtn');
  if (btn) btn.textContent = on ? '⛶ 離開全螢幕' : '⛶ 全螢幕';

  if (on) {
    if (root.requestFullscreen) root.requestFullscreen().catch(() => { });
  } else if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => { });
  }
  // 格子大小是算出來的,所以尺寸變了要重畫
  requestAnimationFrame(renderProjector);
}

/* 使用者按 Esc 離開全螢幕時,把選單收回來 ——
   不然會停在「沒有選單又沒有全螢幕」的半吊子狀態,出不去。 */
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement &&
      document.documentElement.classList.contains('projector-full')) {
    document.documentElement.classList.remove('projector-full');
    const btn = document.getElementById('projFullBtn');
    if (btn) btn.textContent = '⛶ 全螢幕';
    requestAnimationFrame(renderProjector);
  }
});
