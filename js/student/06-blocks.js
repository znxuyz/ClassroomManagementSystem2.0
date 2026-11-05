/* ============================================
   學生端 — 積木挑戰
   ────────────────────────────────────────────
   孩子在這裡做的事:讀題目 → 拼積木 → 自己按按鈕試 → 按「檢查」
   → 對了就交出去。

   ── 為什麼要讓他自己檢查 ──
   練習最重要的是**立刻知道哪裡不對**。等老師批改,下一節課才知道,
   那時候他早就忘了自己當初在想什麼。
   所以老師發下來的是一份「考卷」(劇本 + 每一步預期的畫面),
   學生的裝置拿著考卷就能自己判 —— 但考卷裡沒有老師的積木,
   所以也抄不到答案(見 js/blocks/03-judge.js)。

   ── 分數還是老師發 ──
   交出去的是**程式本身**,不是「我過了」。老師那一端會自己再判一次
   才給分 —— 和測驗、兌換一樣,前端說的話不算數。
============================================ */

Object.assign(StudentApp, {
  blockTasks: [],        // 老師發下來的考卷
  myBlockWork: {},       // { taskId: { program, at, pass } }
  bkTask: null,          // 正在做的那一題
  bkResult: null,        // 這次檢查的結果

  watchBlockTasks() {
    if (this.unsubBlocks) this.unsubBlocks();
    if (!Cloud.db) return;        // 單機 / 測試環境:沒有雲端就不接監聽
    this.unsubBlocks = Cloud.watchBlockTasks(this.classInfo.classId, data => {
      this.blockTasks = (data && data.tasks) || [];
      if (!this.activeQuiz && this.tab === 'blocks' && !this.bkTask) this.render();
    });
  },

  async loadMyBlockWork() {
    if (!Cloud.db) { this.myBlockWork = {}; return; }
    try {
      const d = await Cloud.getMyBlockWork(this.classInfo.classId, Cloud.uid);
      this.myBlockWork = (d && d.work) || {};
    } catch (e) {
      this.myBlockWork = {};
    }
  },

  /* ---------- 進出一題 ---------- */
  bkOpen(id) {
    this.bkTask = this.blockTasks.find(t => t.id === id) || null;
    this.bkResult = null;
    this.render();
    if (!this.bkTask) return;
    const saved = this.myBlockWork[id];
    BlockEditor.mount('bkStuEditor', {
      program: (saved && saved.program) || [],
      palette: this.bkTask.palette || null,
      onChange: p => { BlockSim.setProgram(p); this.bkResult = null; this.bkSyncButtons(); }
    });
    BlockSim.mount('bkStuSim', BlockEditor.value());
  },

  bkClose() {
    this.bkTask = null;
    this.bkResult = null;
    this.render();
  },

  /* 檢查之後只改那兩塊,不整頁重畫 —— 重畫會把學生正在拼的工作區
     捲動位置與選取的插入點弄掉,他得重新找自己做到哪裡。 */
  bkSyncButtons() {
    const box = document.getElementById('bkStuResult');
    if (box) box.innerHTML = this.renderBkResult();
  },

  bkCheck() {
    const t = this.bkTask;
    if (!t) return;
    const program = BlockEditor.value();
    const bad = BlockJudge.precheck(program);
    if (bad) { this.bkResult = { kind: 'hint', text: bad }; this.bkSyncButtons(); return; }

    const r = BlockJudge.runCompiled({ script: t.script, expect: t.expect }, program);
    this.bkResult = {
      kind: r.pass ? 'pass' : 'fail',
      text: BlockJudge.explain(r),
      score: BlockJudge.score(r),
      steps: r.steps
    };
    this.bkSyncButtons();
  },

  async bkSubmit() {
    const t = this.bkTask;
    if (!t) return;
    const program = BlockEditor.value();
    try {
      await Cloud.saveBlockWork(this.classInfo.classId, Cloud.uid, {
        uid: Cloud.uid,
        studentId: this.classInfo.studentId,
        name: this.classInfo.name,
        work: { ...this.myBlockWork, [t.id]: { program, at: Date.now() } }
      });
      this.myBlockWork[t.id] = { program, at: Date.now() };
      toast('✦ 交出去了!老師看過就會給分');
      this.bkSyncButtons();
    } catch (e) {
      toast('交不出去:' + (e.code || e.message));
    }
  },

  /* ---------- 畫面 ---------- */
  renderBlocksTab() {
    if (this.bkTask) return this.renderBkWork();

    const list = this.blockTasks;
    if (!list.length) {
      return this.pageEmpty('⬚', '目前沒有積木挑戰',
        '老師開放題目時會出現在這裡。做出來的功能對了就有分數。');
    }
    return `
      <div class="bk-stu-list">
        ${list.map(t => {
          const done = this.myBlockWork[t.id];
          return `
          <button class="bk-stu-card ${done ? 'is-done' : ''}"
                  onclick="StudentApp.bkOpen('${t.id}')">
            <div class="bk-stu-name">${escapeHtml(t.name)}
              ${done ? '<span class="bk-stu-done">已交出</span>' : ''}</div>
            ${t.spec ? `<div class="bk-stu-spec">${escapeHtml(t.spec)}</div>` : ''}
            <div class="bk-stu-meta">完成得 ${t.points} 分</div>
          </button>`;
        }).join('')}
      </div>`;
  },

  renderBkWork() {
    const t = this.bkTask;
    return `
      <div class="bk-stu-head">
        <button class="btn btn-ghost btn-small" onclick="StudentApp.bkClose()">← 回題目</button>
        <div class="bk-stu-title">${escapeHtml(t.name)}</div>
      </div>
      <div class="bk-stu-spec-box">${escapeHtml(t.spec || '')}</div>

      <div class="bk-stu-grid">
        <div class="bk-stu-sim">
          <div id="bkStuSim"></div>
          <div id="bkStuResult">${this.renderBkResult()}</div>
        </div>
        <div id="bkStuEditor"></div>
      </div>`;
  },

  renderBkResult() {
    const r = this.bkResult;
    const done = this.bkTask && this.myBlockWork[this.bkTask.id];
    const actions = `
      <div class="bk-stu-acts">
        <button class="btn btn-primary btn-block" onclick="StudentApp.bkCheck()">檢查看看</button>
        ${r && r.kind === 'pass'
          ? `<button class="btn btn-accent btn-block" onclick="StudentApp.bkSubmit()">${
               done ? '再交一次' : '交出去'}</button>`
          : ''}
      </div>`;

    if (!r) {
      return `<div class="bk-stu-hint">
        先用上面那台 micro:bit 按按看,覺得做出來了就按「檢查看看」。
      </div>${actions}`;
    }
    if (r.kind === 'hint') {
      return `<div class="bk-stu-msg hint">${escapeHtml(r.text)}</div>${actions}`;
    }
    if (r.kind === 'pass') {
      return `<div class="bk-stu-msg pass">✦ ${escapeHtml(r.text)}</div>${actions}`;
    }
    /* 沒過:講清楚卡在哪一步,並且讓他看到自己已經對了幾步 ——
       「全錯」和「只差最後一步」感覺差很多。 */
    return `
      <div class="bk-stu-msg fail">
        <div class="bk-stu-bar"><span style="width:${r.score}%"></span></div>
        <div class="bk-stu-bar-label">已經對了 ${r.score}%</div>
        ${escapeHtml(r.text)}
      </div>${actions}`;
  }
});
