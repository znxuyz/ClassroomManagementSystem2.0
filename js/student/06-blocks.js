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
  bkHints: 0,            // 這一題用掉幾條提示(換一條少一顆星)

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
  /* 我這一題拿幾顆星 */
  bkStars(id) {
    const w = this.myBlockWork[id];
    return (w && w.stars) || 0;
  },

  bkLocked(id) {
    const i = this.blockTasks.findIndex(t => t.id === id);
    return !taskUnlocked(this.blockTasks, i, x => this.bkStars(x));
  },

  bkOpen(id) {
    if (this.bkLocked(id)) { toast('先把前一關做出來,這一關就開了'); return; }
    this.bkTask = this.blockTasks.find(t => t.id === id) || null;
    this.bkResult = null;
    this.bkHints = (this.myBlockWork[id] || {}).hintsUsed || 0;
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
    const stars = starsFor(t, program, { pass: r.pass, hintsUsed: this.bkHints });
    this.bkResult = {
      kind: r.pass ? 'pass' : 'fail',
      text: BlockJudge.explain(r),
      score: BlockJudge.score(r),
      stars,
      blocks: blockCount(program),
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
        work: { ...this.myBlockWork,
                [t.id]: { program, at: Date.now(),
                          hintsUsed: this.bkHints,
                          stars: (this.bkResult && this.bkResult.stars) || 1 } }
      });
      this.myBlockWork[t.id] = { program, at: Date.now(),
                                 hintsUsed: this.bkHints,
                                 stars: (this.bkResult && this.bkResult.stars) || 1 };
      toast('✦ 交出去了!老師看過就會給分');
      this.bkSyncButtons();
    } catch (e) {
      toast('交不出去:' + (e.code || e.message));
    }
  },

  bkUseHint() {
    const t = this.bkTask;
    if (!t) return;
    const hints = t.hints || [];
    if (this.bkHints >= hints.length) return;
    this.bkHints++;
    this.bkSyncButtons();
  },

  /* ---------- 畫面 ---------- */
  renderBlocksTab() {
    if (this.bkTask) return this.renderBkWork();

    const list = this.blockTasks;
    if (!list.length) {
      return this.pageEmpty('⬚', '目前沒有積木挑戰',
        '老師開放題目時會出現在這裡。做出來的功能對了就有分數。');
    }

    /* 關卡地圖:一條往下走的路,守護獸站在「現在該挑戰的那一關」。
       鎖住的關卡還是看得到 —— 看得到才有往前走的理由,
       只是點不開(點了會告訴他「先把前一關做出來」)。 */
    const petIcon = this.student ? PetEngine.getIcon(this.student) : '🐣';
    const total = list.reduce((n, t) => n + this.bkStars(t.id), 0);
    const here = list.findIndex((t, i) =>
      this.bkStars(t.id) === 0 && taskUnlocked(list, i, x => this.bkStars(x)));

    return `
      <div class="bk-map-head">
        <span class="bk-map-title">積木挑戰</span>
        <span class="bk-map-stars">★ ${total} / ${list.length * 3}</span>
      </div>
      <div class="bk-map">
        ${list.map((t, i) => {
          const stars = this.bkStars(t.id);
          const locked = !taskUnlocked(list, i, x => this.bkStars(x));
          const cur = i === here;
          return `
          <div class="bk-node ${locked ? 'is-locked' : ''} ${stars ? 'is-done' : ''}
                      ${cur ? 'is-here' : ''}">
            <button class="bk-node-dot" ${locked ? 'disabled' : ''}
                    onclick="StudentApp.bkOpen('${t.id}')">
              ${locked ? '🔒' : (stars ? starText(stars).slice(0, 1) : (i + 1))}
            </button>
            <button class="bk-node-card" ${locked ? 'disabled' : ''}
                    onclick="StudentApp.bkOpen('${t.id}')">
              <div class="bk-node-name">第 ${i + 1} 關 · ${escapeHtml(t.name)}</div>
              ${t.spec ? `<div class="bk-node-spec">${escapeHtml(t.spec)}</div>` : ''}
              <div class="bk-node-meta">
                <span class="bk-node-stars ${stars ? 'on' : ''}">${starText(stars)}</span>
                <span>${locked ? '過了前一關就開' : (stars ? '可以再挑戰拿更多星' : t.points + ' 分')}</span>
              </div>
            </button>
            ${cur ? `<span class="bk-node-pet">${petIcon}</span>` : ''}
          </div>`;
        }).join('')}
      </div>
      <div class="bk-map-legend">
        ★ 做出來了　★★ 而且沒用提示　★★★ 而且積木夠精簡 ——
        做完回頭整理一下,第三顆星隨時補得回來。
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

  /* 提示。換一條少一顆星,所以要先講清楚再換;
     但沒有任何責備的字 —— 換提示永遠比放棄好。 */
  renderBkHints() {
    const t = this.bkTask;
    const hints = (t && t.hints) || [];
    if (!hints.length) return '';
    const used = hints.slice(0, this.bkHints);
    const left = hints.length - this.bkHints;
    return `
      <div class="bk-stu-hints">
        ${used.map((h, i) => `
          <div class="bk-stu-hint"><b>提示 ${i + 1}</b>${escapeHtml(h)}</div>`).join('')}
        ${left > 0 ? `
          <button class="btn btn-ghost btn-block btn-small" onclick="StudentApp.bkUseHint()">
            卡住了?看一條提示(還有 ${left} 條 · 會少一顆星)
          </button>` : ''}
      </div>`;
  },

  renderBkResult() {
    const r = this.bkResult;
    const t = this.bkTask;
    const done = t && this.myBlockWork[t.id];
    const limit = t ? (t.starLimitPublic || 0) : 0;
    const actions = `
      <div class="bk-stu-acts">
        <button class="btn btn-primary btn-block" onclick="StudentApp.bkCheck()">檢查看看</button>
        ${r && r.kind === 'pass'
          ? `<button class="btn btn-accent btn-block" onclick="StudentApp.bkSubmit()">${
               done ? '再交一次' : '交出去'}</button>`
          : ''}
      </div>
      ${this.renderBkHints()}`;

    if (!r) {
      return `<div class="bk-stu-hint">
        先用上面那台 micro:bit 按按看,覺得做出來了就按「檢查看看」。
      </div>${actions}`;
    }
    if (r.kind === 'hint') {
      return `<div class="bk-stu-msg hint">${escapeHtml(r.text)}</div>${actions}`;
    }
    if (r.kind === 'pass') {
      /* 過了就告訴他離下一顆星還差什麼 —— 三顆星永遠拿得到,
         所以每一次過關都還有下一個目標。 */
      let next = '';
      if (r.stars === 1) next = '用了提示,所以這一次是一顆星。下次不用提示就有兩顆。';
      else if (r.stars === 2 && limit) {
        next = `你用了 ${r.blocks} 塊積木 —— 減到 ${limit} 塊以內就是三顆星,`
             + '回頭看看有沒有多做了什麼。';
      }
      return `
        <div class="bk-stu-msg pass">
          <div class="bk-stu-got">${starText(r.stars)}</div>
          ✦ ${escapeHtml(r.text)}
          ${next ? `<div class="bk-stu-next">${escapeHtml(next)}</div>` : ''}
        </div>${actions}`;
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
