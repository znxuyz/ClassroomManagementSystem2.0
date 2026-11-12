/* ============================================
   積木冒險 — 老師端(出題)
   ────────────────────────────────────────────
   出一題只要三件事:

     1. 寫下功能敘述(「做一個計步器:開機歸零、搖一下加一、A+B 歸零」)
     2. 用和學生一模一樣的編輯器,把答案拼一次
     3. 按「試跑」看一下,沒問題就開放

   測試案例不必自己想 —— 系統看你的答案用到哪些事件,自動排一齣劇本
   (開機 → 搖三下 → 按 A+B → 歸零後再搖一次),再把你的答案在那齣劇本下
   的行為錄起來當標準答案。學生只要做出**一樣的行為**就算對,
   不必和你拼得一樣(見 03-judge.js)。

   ── 答案不會送到學生那邊 ──
   發給學生的是「考卷」:劇本 + 預期的畫面,不含你的積木。
   不然打開開發者工具就看得到答案。
   而學生拿著考卷可以在自己的裝置上立刻知道對不對,不必等你批改。
============================================ */

const BlockTasks = {
  editing: null,      // 正在編輯的題目 id
  _judge: null,       // 試跑的結果

  all() {
    if (!state.blockTasks) state.blockTasks = [];
    return state.blockTasks;
  },

  byId(id) { return this.all().find(t => t.id === id) || null; },

  create() {
    const nameEl = document.getElementById('bkName');
    const name = (nameEl.value || '').trim();
    if (!name) { toast('先給這一題一個名字'); return; }
    const task = {
      id: 'bt_' + Date.now(),
      name,
      spec: (document.getElementById('bkSpec').value || '').trim(),
      points: Math.max(0, parseInt(document.getElementById('bkPoints').value, 10) || 5),
      solution: [],
      palette: null,          // null = 全部積木都給
      hints: [],              // 最多三條,學生卡住可以換(換了少一顆星)
      starLimit: 0,           // 第三顆星的積木數上限,0 = 用「解答 + 2」
      free: false,            // true = 不必過前一關就能挑戰
      status: 'draft',
      createdAt: Date.now()
    };
    this.all().push(task);
    nameEl.value = '';
    document.getElementById('bkSpec').value = '';
    save();
    this.edit(task.id);
  },

  edit(id) {
    this.editing = id;
    this._judge = null;
    this.render();
  },

  closeEdit() {
    this.editing = null;
    this.render();
  },

  remove(id) {
    const t = this.byId(id);
    if (!t) return;
    if (!confirm(`確定刪除「${t.name}」?學生已經交的作品也會看不到。`)) return;
    state.blockTasks = this.all().filter(x => x.id !== id);
    if (this.editing === id) this.editing = null;
    save();
    this.render();
  },

  setField(id, field, value) {
    const t = this.byId(id);
    if (!t) return;
    t[field] = value;
    save();
  },

  /* 開放 / 收起來。開放之前一定要先試跑過,
     不然學生會拿到一題「連老師的答案都跑不動」的題目。 */
  toggleOpen(id) {
    const t = this.byId(id);
    if (!t) return;
    if (t.status !== 'open') {
      const paper = BlockJudge.compile(t);
      if (paper.error) {
        toast('這一題的參考解答自己跑不動:' + paper.error.message, 6000);
        return;
      }
      if (!(t.solution || []).length) { toast('先把參考解答拼出來'); return; }
      t.status = 'open';
      toast(`✦ 「${t.name}」已開放,學生端就看得到了`);
    } else {
      t.status = 'closed';
      toast(`「${t.name}」已收起來`);
    }
    save();
    this.render();
  },

  /* 試跑:把自己的答案當成學生的作品判一次,應該要全過。
     這一步在抓「敘述和答案對不上」—— 老師改了敘述卻忘了改答案時。 */
  tryRun() {
    const t = this.byId(this.editing);
    if (!t) return;
    t.solution = BlockEditor.value();
    save();
    const paper = BlockJudge.compile(t);
    this._judge = paper.error
      ? { pass: false, error: paper.error, steps: [] }
      : BlockJudge.runCompiled(paper, t.solution);
    this._paper = paper;
    this.render();
  },

  onEditorChange(program) {
    const t = this.byId(this.editing);
    if (!t) return;
    t.solution = program;
    BlockSim.setProgram(program);
    // 改了答案,剛才那次試跑就不算數了
    this._judge = null;
    save();
  },

  /* ---------- 畫面 ---------- */
  render() {
    const el = document.getElementById('blocksBody');
    if (!el) return;

    if (this.editing) { this.renderEditor(el); return; }

    const list = this.all();
    el.innerHTML = `
      <div class="field-row bk-create">
        <label class="field grow">
          <span class="field-label">題目名稱<span class="req">*</span></span>
          <input type="text" id="bkName" class="rule-editor-input" placeholder="例:計步器" />
        </label>
        <label class="field grow">
          <span class="field-label">功能敘述</span>
          <input type="text" id="bkSpec" class="rule-editor-input"
                 placeholder="例:開機時步數歸零並顯示,搖一下加一,A+B 歸零" />
        </label>
        <label class="field narrow">
          <span class="field-label">完成得分</span>
          <input type="number" id="bkPoints" class="rule-editor-input" value="5" min="0" max="20" />
        </label>
        <button class="btn btn-primary btn-small" onclick="BlockTasks.create()">＋ 新增題目</button>
      </div>

      ${this.all().some(t => t.status === 'open') ? `
        <div class="bk-wall-bar">
          <button class="btn btn-accent btn-small" onclick="BlockWall.open()">
            ▣ 投影全班進度牆
          </button>
          <span class="bk-hint-line" style="margin:0;">
            每一位的守護獸停在他走到的那一關。全班卡在同一關的話,
            那通常是題目的問題,不是孩子的問題。
          </span>
        </div>` : ''}

      ${list.length === 0 ? `
        <div class="empty-state">
          <div class="empty-state-icon">⬚</div>
          <div>還沒有題目,從上方新增一題</div>
          <div class="empty-state-action">
            出題只要寫下功能敘述、把答案拼一次 —— 測試案例系統自己產生。
          </div>
        </div>` : `
        <div class="bk-hint-line">
          題目的順序就是關卡的順序:學生要**前一關拿到星星**才解得開下一關
          (想讓某一題隨時都能挑戰,在那一題的編輯頁勾起來)。用 ↑↓ 調順序。
        </div>
        <div class="bk-list">
          ${list.map((t, i) => this.renderCard(t, i)).join('')}
        </div>`}`;
  },

  move(id, dir) {
    const list = this.all();
    const i = list.findIndex(t => t.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    const [t] = list.splice(i, 1);
    list.splice(j, 0, t);
    save();
    this.render();
  },

  renderCard(t, idx) {
    const n = blockCount(t.solution);
    const open = t.status === 'open';
    const st = (typeof BlockWork !== 'undefined') ? BlockWork.statusOf(t.id)
                                                  : { submitted: 0, passed: 0 };
    return `
      <div class="bk-task ${open ? 'is-open' : ''}">
        <span class="bk-task-no">${idx + 1}</span>
        <div class="bk-task-main">
          <div class="bk-task-name">${escapeHtml(t.name)}
            <span class="bk-task-state ${open ? 'on' : ''}">${open ? '開放中' : '未開放'}</span>
          </div>
          ${t.spec ? `<div class="bk-task-spec">${escapeHtml(t.spec)}</div>` : ''}
          <div class="bk-task-meta">
            參考解答 ${n} 塊積木 · 完成得 ${t.points} 分
            · 三顆星要 ${starBlockLimit(t)} 塊以內
            ${(t.hints || []).length ? ` · ${t.hints.length} 條提示` : ' · 沒有提示'}
            ${t.free ? ' · 隨時可挑戰' : ''}
            ${open ? ` · 交出 ${st.submitted} 位 · 完成 ${st.passed} 位` : ''}
          </div>
        </div>
        <div class="bk-task-acts">
          <button class="btn btn-ghost btn-small" title="往前一關"
                  onclick="BlockTasks.move('${t.id}', -1)">↑</button>
          <button class="btn btn-ghost btn-small" title="往後一關"
                  onclick="BlockTasks.move('${t.id}', 1)">↓</button>
          <button class="btn btn-ghost btn-small" onclick="BlockTasks.edit('${t.id}')">編輯</button>
          <button class="btn ${open ? 'btn-ghost' : 'btn-primary'} btn-small"
                  onclick="BlockTasks.toggleOpen('${t.id}')">${open ? '收起來' : '開放'}</button>
          <button class="btn btn-ghost btn-small danger"
                  onclick="BlockTasks.remove('${t.id}')">刪除</button>
        </div>
      </div>`;
  },

  renderEditor(el) {
    const t = this.byId(this.editing);
    if (!t) { this.editing = null; this.render(); return; }

    el.innerHTML = `
      <div class="bk-edit-head">
        <button class="btn btn-ghost btn-small" onclick="BlockTasks.closeEdit()">← 回題目清單</button>
        <div class="bk-edit-title">${escapeHtml(t.name)}</div>
        <div style="flex:1"></div>
        <button class="btn btn-primary btn-small" onclick="BlockTasks.tryRun()">▶ 試跑並檢查</button>
      </div>

      <label class="field" style="margin-bottom:14px;">
        <span class="field-label">功能敘述(學生會看到這一段)</span>
        <textarea id="bkSpecEdit" class="setup-textarea" rows="2"
          oninput="BlockTasks.setField('${t.id}', 'spec', this.value)"
          placeholder="做一個計步器:開機時步數歸零並顯示,搖一下步數加一並顯示,按 A+B 歸零。"
          >${escapeHtml(t.spec || '')}</textarea>
      </label>

      ${this.renderWorks(t)}

      <div class="bk-edit-grid">
        <div>
          <div class="panel-title">參考解答</div>
          <div id="bkEditorHost"></div>
        </div>
        <div class="bk-side">
          <div class="panel-title">試試看</div>
          <div id="bkSimHost"></div>
          ${this.renderJudge()}
        </div>
      </div>

      ${this.renderHints(t)}`;

    BlockEditor.mount('bkEditorHost', {
      program: t.solution,
      onChange: p => this.onEditorChange(p)
    });
    BlockSim.mount('bkSimHost', t.solution);
  },

  /* ---------- 提示與星星 ----------
     提示是給卡住的孩子用的,換一條少一顆星 —— 但**換提示永遠比放棄好**,
     所以文案裡不會有任何責備的意思。
     寫提示有一個原則:**不要寫答案,寫「下一步往哪裡看」**。
       壞:「用改變步數 1」
       好:「搖動的時候要讓步數變多 —— 變數那一類裡有一塊是在做這件事」 */
  renderHints(t) {
    const hints = t.hints || [];
    return `
      <div class="panel-card bk-hints">
        <div class="panel-title">提示與星星</div>
        <div class="bk-hint-line">
          提示不要寫答案,寫「下一步往哪裡看」。學生每換一條提示就少一顆星,
          但換提示永遠比放棄好。
        </div>
        ${[0, 1, 2].map(i => `
          <label class="field" style="margin-top:8px;">
            <span class="field-label">提示 ${i + 1}${i ? '(選填)' : ''}</span>
            <input type="text" class="rule-editor-input"
              value="${escapeHtml(hints[i] || '')}"
              placeholder="${i === 0 ? '例:搖一搖要讓步數變多 —— 變數那一類裡有一塊在做這件事'
                                    : '留空就是沒有這一條'}"
              onchange="BlockTasks.setHint('${t.id}', ${i}, this.value)" />
          </label>`).join('')}

        <div class="field-row" style="margin-top:12px;">
          <label class="field narrow">
            <span class="field-label">三顆星的積木數</span>
            <input type="number" class="rule-editor-input" min="0" max="60"
              value="${t.starLimit || 0}"
              onchange="BlockTasks.setField('${t.id}', 'starLimit', Math.max(0, parseInt(this.value,10)||0))" />
          </label>
          <div class="bk-hint-line" style="flex:1 1 200px;">
            0 = 用「你的解答 + 2 塊」(現在是 ${starBlockLimit(t)} 塊)。
            第三顆星比的是精簡,不是快 —— 做完回頭整理就補得回來。
          </div>
          <label class="bk-free">
            <input type="checkbox" ${t.free ? 'checked' : ''}
              onchange="BlockTasks.setField('${t.id}', 'free', this.checked)" />
            隨時可挑戰(不必先過前一關)
          </label>
        </div>
      </div>`;
  },

  setHint(id, i, value) {
    const t = this.byId(id);
    if (!t) return;
    t.hints = t.hints || [];
    t.hints[i] = (value || '').trim();
    // 中間空的要擠掉,不然學生會換到一條空白的提示
    t.hints = t.hints.filter(h => h);
    save();
  },

  /* ---------- 學生交了什麼 ----------
     看別人怎麼拼,是老師講評時最有用的材料 ——
     「這三位用的是完全不同的做法,都對」比講十分鐘還有效。 */
  renderWorks(t) {
    if (typeof BlockWork === 'undefined' || !BlockWork.all.length) return '';
    const rows = BlockWork.all
      .filter(d => d.work && d.work[t.id])
      .map(d => {
        const paid = (t.paid || {})[d.studentId];
        return `<button class="bk-work-chip ${paid ? 'ok' : ''}"
          onclick="BlockTasks.viewWork('${t.id}', '${d.studentId}')"
          >${escapeHtml(d.name || d.studentId)}${paid ? ' ✓' : ''}</button>`;
      }).join('');
    if (!rows) return '';
    return `
      <div class="bk-works">
        <span class="bk-works-label">交出來的作品</span>${rows}
        ${this._viewing ? `<button class="btn btn-ghost btn-small"
            onclick="BlockTasks.closeWork()">收起來</button>` : ''}
      </div>
      ${this._viewing ? `<div class="bk-work-view" id="bkWorkView"></div>` : ''}`;
  },

  viewWork(taskId, studentId) {
    this._viewing = { taskId, studentId };
    this.render();
    const w = BlockWork.workOf(taskId, studentId);
    const host = document.getElementById('bkWorkView');
    if (!host || !w) return;
    const t = this.byId(taskId);
    const r = BlockJudge.run(t, w.program);
    const who = (state.students.find(s => s.id === studentId) || {}).name || '';
    host.innerHTML = `
      <div class="bk-work-head">${escapeHtml(who)} 的做法
        <span class="${r.pass ? 'ok' : 'no'}">${r.pass ? '通過' : BlockJudge.explain(r)}</span>
      </div>
      <div id="bkWorkEditor"></div>`;
    BlockEditor.mount('bkWorkEditor', { program: w.program, readonly: true });
  },

  closeWork() { this._viewing = null; this.render(); },

  renderJudge() {
    const r = this._judge;
    if (!r) {
      return `<div class="bk-judge-hint">
        拼好之後按「試跑並檢查」—— 系統會自動排一齣劇本,
        把你的答案跑一遍,那就是學生要做出來的行為。
      </div>`;
    }
    if (r.error) {
      return `<div class="bk-judge bad"><b>這一題跑不動</b><br>${escapeHtml(r.error.message)}</div>`;
    }
    return `
      <div class="bk-judge ${r.pass ? 'good' : 'bad'}">
        <b>${r.pass ? '可以開放了' : '答案和敘述對不上?'}</b>
        <div class="bk-steps">
          ${r.steps.map(s => `
            <div class="bk-step ${s.ok ? 'ok' : 'no'}">
              <span class="bk-step-label">${escapeHtml(s.label)}</span>
              <span class="bk-step-val">${escapeHtml(BlockVM.describeScreen(s.expect))}</span>
            </div>`).join('')}
        </div>
        <div class="bk-judge-note">
          上面這一串就是學生要做出來的行為。<br>
          積木怎麼拼不限,只要畫面的變化一樣就算對。
        </div>
      </div>`;
  }
};

/* ---------- 發題目給學生 ----------
   發出去的是考卷,不是答案。改了題目就重發一次;
   沒變的話不寫 —— 每一次存檔都重寫一遍沒有意義,而且會洗掉學生的流量。 */
Object.assign(BlockTasks, {
  _lastPublished: null,

  papers() {
    return this.all().filter(t => t.status === 'open').map(t => {
      const paper = BlockJudge.compile(t);
      return {
        id: t.id, name: t.name, spec: t.spec || '', points: t.points || 0,
        palette: t.palette || null,
        hints: t.hints || [],
        /* 第三顆星的門檻要讓學生看得到(他要知道目標是幾塊),
           但那只是一個數字,看不出答案長什麼樣子。 */
        starLimitPublic: starBlockLimit(t),
        free: !!t.free,
        script: paper.script, expect: paper.expect
      };
    }).filter(p => p.expect);
  },

  async publish() {
    if (!isCloudMode()) return;
    const payload = { tasks: this.papers(), at: Date.now() };
    const sig = JSON.stringify(payload.tasks);
    if (sig === this._lastPublished) return;
    try {
      await Cloud.publishBlockTasks(state.classId, payload);
      this._lastPublished = sig;
    } catch (e) {
      console.warn('[積木] 題目發布失敗:', e.code || e.message);
    }
  },

  reset() { this._lastPublished = null; this.editing = null; this._judge = null; }
});

/* 切到這一頁時才畫(和其他頁一樣的規矩) */
function renderBlocksView() {
  BlockTasks.render();
}
