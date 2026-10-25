/* ============================================
   渲染:投影模式
============================================ */
function renderProjector() {
  const grid = document.getElementById('projectorGrid');
  const totalEl = document.getElementById('projTotalPoints');
  
  const total = state.students.reduce((sum, s) => sum + s.totalPoints, 0);
  totalEl.textContent = '總積分 ' + total;
  
  grid.innerHTML = state.students.map(student => {
    const stage = student.pet ? PetEngine.getStage(student.totalPoints) : 0;
    const health = PetEngine.getHealth(student);
    const icon = student.pet ? PetEngine.getIcon(student) : '❓';
    const species = student.pet ? PET_SPECIES.find(p => p.id === student.pet) : null;
    const petLabel = student.petName ? '「' + student.petName + '」' : (species ? STAGE_NAMES[stage] : '尚未選擇');
    
    return `
      <div class="projector-card" data-student-id="${student.id}">
        <div class="projector-pet stage-${stage} health-${health}">
          ${icon}
        </div>
        <div class="projector-name">${student.name}</div>
        <div class="projector-pet-name">${petLabel}</div>
        <div class="projector-points">${student.totalPoints}</div>
      </div>
    `;
  }).join('');
}

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
  float.style.color = points > 0 ? 'var(--gold)' : 'var(--sick)';
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
