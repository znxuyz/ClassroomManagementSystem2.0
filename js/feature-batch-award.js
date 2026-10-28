/* ============================================
   批次加分與小組加分
   ────────────────────────────────────────────
   課堂上常見的情況:整組表現好要一起加、或是點名幾個人一起加。
   原本一次只能選一位學生,28 個人就得按 28 次。

   做法是在左側名單上加一個「批次」模式:打開之後名單變成可勾選,
   上方給小組的快捷鍵,右邊的積分規則按鈕照舊 —— 只是一次套用到所有
   勾起來的人。老師不用學新的操作,只是多了勾選這一步。
============================================ */

const BatchAward = {
  active: false,
  picked: new Set(),
  lastBatch: null,      // 復原用的快照

  toggle() {
    this.active = !this.active;
    this.picked.clear();
    if (this.active) state.selectedStudentId = null;
    renderStudentList();
    renderSelectedStudent();
  },

  pick(id) {
    if (this.picked.has(id)) this.picked.delete(id);
    else this.picked.add(id);
    renderStudentList();
    renderSelectedStudent();
  },

  pickAll() {
    const all = state.students.length > 0 && this.picked.size === state.students.length;
    this.picked = all ? new Set() : new Set(state.students.map(s => s.id));
    renderStudentList();
    renderSelectedStudent();
  },

  /* 小組加分:直接把整組勾起來。再按一次就取消那一組,
     方便「這組加完換下一組」的節奏。 */
  pickGroup(index) {
    const members = (state.currentGroups || [])[index] || [];
    const ids = members.map(m => Leaderboard.memberId(m)).filter(Boolean);
    const allPicked = ids.length > 0 && ids.every(id => this.picked.has(id));

    this.picked = new Set(allPicked ? [] : ids);
    renderStudentList();
    renderSelectedStudent();
  },

  /* 勾起來的這群人剛好等於某一組的話,回傳組別編號 ——
     歷程紀錄寫「第 3 組」比只寫規則名稱有用得多。 */
  matchedGroup() {
    const groups = state.currentGroups || [];
    for (let i = 0; i < groups.length; i++) {
      const ids = (groups[i] || []).map(m => Leaderboard.memberId(m)).filter(Boolean);
      if (ids.length === 0 || ids.length !== this.picked.size) continue;
      if (ids.every(id => this.picked.has(id))) return i;
    }
    return -1;
  },

  award(points, reason) {
    if (this.picked.size === 0) { toast('請先勾選學生'); return; }

    const gi = this.matchedGroup();
    const label = gi >= 0 ? `${reason}(第 ${gi + 1} 組)` : reason;

    const before = [];
    const evolved = [];
    state.students.forEach(s => {
      if (!this.picked.has(s.id)) return;
      const oldStage = s.pet ? PetEngine.getStage(s.totalPoints) : 0;
      before.push(awardPointsCore(s, points, label));
      const newStage = s.pet ? PetEngine.getStage(s.totalPoints) : 0;
      if (newStage > oldStage) evolved.push({ name: s.name, stage: STAGE_NAMES[newStage] });
    });

    this.lastBatch = { before, label, points, count: before.length };

    updateClassTasksProgress();
    save();
    renderStudentList();
    renderSelectedStudent();
    renderProjector();

    evolved.forEach(e =>
      logToContactBook('petLevelup', `${e.name} 的守護獸進化為「${e.stage}」`));

    const who = gi >= 0 ? `第 ${gi + 1} 組 ${before.length} 位` : `${before.length} 位學生`;
    const sign = points > 0 ? '+' : '';
    toastWithAction(
      `${who} ${sign}${points} 分 · ${reason}` +
        (evolved.length ? ` · ${evolved.length} 隻守護獸進化` : ''),
      '復原', () => this.undo()
    );
  },

  undo() {
    if (!this.lastBatch) return;
    this.lastBatch.before.forEach(b => revertPointsCore(b));
    const n = this.lastBatch.count;
    this.lastBatch = null;

    updateClassTasksProgress();
    save();
    renderStudentList();
    renderSelectedStudent();
    renderProjector();
    toast(`已復原 ${n} 位學生的加分`);
  },

  /* 右側面板:選了誰、小組快捷鍵都放這裡 */
  renderPanel() {
    const groups = state.currentGroups || [];
    const gi = this.matchedGroup();

    const chips = groups.length === 0
      ? `<div class="batch-hint">還沒有分組。到「班級管理 → 隨機分組」分好組,
           這裡就會出現小組的快捷鍵。</div>`
      : `<div class="batch-groups">
           ${groups.map((g, i) => {
             const n = (g || []).length;
             return `<button class="batch-group ${i === gi ? 'active' : ''}"
                       style="--g:${GROUP_COLORS[i % GROUP_COLORS.length]}"
                       onclick="BatchAward.pickGroup(${i})">第 ${i + 1} 組
                       <span>${n}</span></button>`;
           }).join('')}
         </div>`;

    const names = state.students.filter(s => this.picked.has(s.id));

    /* 「已選 N 位 / 全選 / 離開批次」都在上面那張卡的標題列了 ——
       這裡再放一次是重複的,而且會把真正有用的「小組快捷」往下推。
       這一塊只留勾選時真正需要的:按哪一組、現在選了誰。 */
    return `
      <div class="batch-panel">
        <div class="batch-label">
          小組快捷
          ${gi >= 0 ? `<span class="batch-ismatch">目前剛好是第 ${gi + 1} 組</span>` : ''}
        </div>
        ${chips}

        <div class="batch-label">已選名單</div>
        <div class="batch-names">
          ${names.length === 0
            ? '<span class="batch-hint">從左側名單勾選,或按上面的小組。</span>'
            : names.map(s => `<span class="batch-name">
                ${s.seatNumber ? `<span class="seat-no">${escapeHtml(String(s.seatNumber))}</span>` : ''}
                ${escapeHtml(s.name)}</span>`).join('')}
        </div>
      </div>`;
  }
};
