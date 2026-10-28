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
    const seatLabel = student.seatNumber
      ? `<span class="seat-no">${escapeHtml(String(student.seatNumber))}</span> ` : '';
    
    return `
      <li class="student-item ${isSelected ? 'selected' : ''} ${batch ? 'is-batch' : ''}"
          onclick="${batch ? `BatchAward.pick('${student.id}')` : `selectStudent('${student.id}')`}">
        ${batch ? `<span class="student-check ${isPicked ? 'on' : ''}">${isPicked ? '✓' : ''}</span>` : ''}
        <div class="student-avatar stage-${stage} health-${health}">
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
