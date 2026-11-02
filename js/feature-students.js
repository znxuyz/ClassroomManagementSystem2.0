/* ============================================
   學生列表 - 左側欄學生顯示
============================================ */

function renderStudentList() {
  const list = document.getElementById('studentList');
  const count = document.getElementById('sidebarCount');
  
  if (!list || !count) return;
  
  count.textContent = BatchAward.active
    ? `已選 ${BatchAward.picked.size} / ${state.students.length}`
    : state.students.length + ' 位';

  const btn = document.getElementById('batchToggleBtn');
  if (btn) {
    btn.textContent = BatchAward.active ? '離開批次' : '批次加分';
    btn.classList.toggle('active', BatchAward.active);
  }

  /* 「全選」只有批次模式用得到,而它必須待在標題列 ——
     放在下面的面板裡的話,要先捲過 29 位學生才按得到。 */
  const allBtn = document.getElementById('batchAllBtn');
  if (allBtn) {
    const allOn = state.students.length > 0
      && BatchAward.picked.size === state.students.length;
    allBtn.style.display = BatchAward.active ? '' : 'none';
    allBtn.textContent = allOn ? '全部取消' : '全選';
  }
  
  list.innerHTML = state.students.map(student => {
    const stage = student.pet ? PetEngine.getStage(student.totalPoints) : 0;
    const health = PetEngine.getHealth(student);
    const icon = student.pet ? PetEngine.getIcon(student) : '❓';
    const batch = BatchAward.active;
    const isPicked = batch && BatchAward.picked.has(student.id);
    const isSelected = batch ? isPicked : student.id === state.selectedStudentId;
    /* 「幾天沒被加分」寫在頭像右上角那顆小圓點裡。
       守護獸本來就會因此微恙(3 天)、生病(7 天),圓點本來只寫
       「!」與「✚」—— 看得出有事,看不出多久。改成直接寫天數,
       同一個位置、同一個顏色,資訊卻完整了。

       刻意不另外開一行文字標籤:有的學生有、有的沒有的話,整排格子
       會被最高的那一張撐開,同一排裡的名字與分數就對不齊(28 格很明顯),
       而且 1024 的螢幕上 28 位就會多出一排、不再「一眼看得完」。 */
    const quietDays = student.lastPointTime
      ? Math.floor((Date.now() - student.lastPointTime) / 86400000) : 0;
    const quietTitle = health === 'healthy' ? ''
      : ` title="${quietDays} 天沒加分,守護獸${health === 'sick' ? '生病了' : '微恙'}"`;

    const seatLabel = student.seatNumber
      ? `<span class="seat-no">${escapeHtml(String(student.seatNumber))}</span> ` : '';
    
    return `
      <li class="student-item ${isSelected ? 'selected' : ''} ${batch ? 'is-batch' : ''}"
          onclick="${batch ? `BatchAward.pick('${student.id}')` : `selectStudent('${student.id}')`}">
        ${batch ? `<span class="student-check ${isPicked ? 'on' : ''}">${isPicked ? '✓' : ''}</span>` : ''}
        <div class="student-avatar stage-${stage} health-${health}"
             data-quiet="${quietDays}"${quietTitle}>
          ${icon}
        </div>
        <div class="student-info">
          <div class="student-name">${seatLabel}${student.name}</div>
          <div class="student-meta">
            <span class="student-points">${student.currentPoints} 分</span>
            ${student.pet ? '' : '<span class="student-nopet" title="還沒選守護獸">未選</span>'}
          </div>
        </div>
      </li>
    `;
  }).join('');
}
