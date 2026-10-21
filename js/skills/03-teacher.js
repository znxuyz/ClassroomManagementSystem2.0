/* ============================================
   守護獸技能 — 教師端
   ────────────────────────────────────────────
   老師要做的事只有兩件:開關、以及決定幾週刷新一次。
   其餘都自動:

   · 授權表(誰這一季各技能幾次)由這裡算好寫到雲端,
     安全規則照著它驗。學生進化了、換季了,就自動重寫一次。
   · 測驗與商店的技能效果在結算時套用 —— 那兩處本來就是老師端算的,
     所以學生改前端沒有用。
============================================ */

const SkillAdmin = {
  grants: null,
  uses: [],
  unsubGrants: null,
  unsubUses: null,
  _publishing: false,

  cfg() { return SkillEngine.cfg(state.skills); },
  on()  { const c = this.cfg(); return !!(c.enabled && c.startAt); },
  season() { return SkillEngine.seasonOf(state.skills, Date.now()); },

  start() {
    this.stop();
    if (!isCloudMode()) return;

    this.unsubGrants = Cloud.watchSkillGrants(state.classId, g => {
      this.grants = g;
      this.publishIfStale();
    });
    this.syncUseWatch();
  },

  stop() {
    if (this.unsubGrants) { this.unsubGrants(); this.unsubGrants = null; }
    if (this.unsubUses) { this.unsubUses(); this.unsubUses = null; }
    this.grants = null;
    this.uses = [];
    this._season = null;
  },

  /* 使用紀錄只在技能開著時才訂,而且換季就重訂(只讀這一季的) */
  syncUseWatch() {
    const want = this.on() ? this.season() : null;
    if (want === this._season) return;
    if (this.unsubUses) { this.unsubUses(); this.unsubUses = null; }
    this._season = want;
    this.uses = [];
    if (want === null) return;
    this.unsubUses = Cloud.watchSkillUses(state.classId, want, list => {
      this.uses = list;
      TerritoryGame.shielded = SkillEngine.shieldedAttempts(list);
      TerritoryGame.rebuild();
      if (typeof renderSkillBoard === 'function') renderSkillBoard();
    });
  },

  /* 授權表該重寫就重寫:換季、有人進化、名單變動都算。
     寫的是一份小文件,不是每個學生一份 —— 學生讀一筆就夠。 */
  publishIfStale() {
    if (!this.on() || !isCloudMode() || this._publishing) return;
    if (!SkillEngine.grantsStale(this.grants, state.students, state.skills, Date.now())) return;

    this._publishing = true;
    const next = SkillEngine.grantsFor(state.students, state.skills, Date.now());
    Cloud.saveSkillGrants(state.classId, next)
      .then(() => { this.grants = next; })
      .catch(e => console.warn('[技能] 授權表寫入失敗:', e.message))
      .finally(() => { this._publishing = false; this.syncUseWatch(); });
  },

  /* ---------- 查詢:結算時要用 ---------- */

  /* 某位學生對某個對象用過這個技能嗎(測驗用 quizId,商店用獎品 id) */
  usedOn(studentId, skillId, ref) {
    return this.uses.find(u =>
      u.studentId === studentId && u.skillId === skillId && u.ref === ref) || null;
  },

  byId(useId) {
    return this.uses.find(u => u.id === useId) || null;
  },

  /* 技能使用是一次性的:同一筆不能套用在兩次結算上。
     已經吃掉的記在這裡(存進班級資料,換裝置也算數)。 */
  consumed() {
    if (!state.skillConsumed) state.skillConsumed = {};
    return state.skillConsumed;
  },

  /* 確認一筆技能使用可以套用在這位學生的這件事上,可以就標記吃掉。
     回傳 true 表示生效。 */
  claim(useId, studentId, skillId) {
    const u = this.byId(useId);
    if (!u) return false;
    if (u.studentId !== studentId || u.skillId !== skillId) return false;
    if (this.consumed()[useId]) return false;
    this.consumed()[useId] = Date.now();
    return true;
  }
};

/* ============================================
   教師端畫面
============================================ */

function renderSkillBoard() {
  const box = document.getElementById('skillBoard');
  if (!box || !box.offsetParent) return;
  box.innerHTML = skillBoardHtml();
}

function skillBoardHtml() {
  const c = SkillAdmin.cfg();
  const range = SkillEngine.seasonRange(state.skills, Date.now());
  const started = !!c.startAt;

  const stages = [0, 1, 2, 3].map(i => {
    const list = SkillEngine.unlocked(i);
    const count = state.students.filter(s =>
      PetEngine.getStage(s.totalPoints || 0) === i).length;
    return `
      <div class="skill-stage">
        <div class="skill-stage-head">
          <strong>${STAGE_NAMES[i]}</strong>
          <span>${count} 人</span>
        </div>
        ${list.length === 0
          ? '<div class="skill-stage-none">沒有技能</div>'
          : list.map(sk => `
            <div class="skill-stage-row">
              <span>${sk.icon} ${escapeHtml(sk.name)}</span>
              <span class="skill-stage-meta">${SKILL_AREAS[sk.area].name} · ${sk.uses[i]} 次</span>
            </div>`).join('')}
      </div>`;
  }).join('');

  // 這一季誰用了什麼,照時間倒著排
  const recent = [...SkillAdmin.uses]
    .sort((a, b) => (b.n || 0) - (a.n || 0))
    .slice(0, 12)
    .map(u => {
      const sk = SkillEngine.byId(u.skillId);
      return `<div class="skill-use-row">
        <span>${sk ? sk.icon : '•'} ${escapeHtml(u.studentName || u.studentId)}</span>
        <span class="skill-stage-meta">${sk ? escapeHtml(sk.name) : u.skillId}</span>
      </div>`;
    }).join('');

  return `
    <div class="tg-live-row">
      <label class="tg-live-check">
        <input type="checkbox" id="skEnabled" ${c.enabled ? 'checked' : ''}
               onchange="applySkillSettings()" />
        啟用守護獸技能
      </label>

      <label style="margin-left:10px;">每</label>
      <input type="number" id="skWeeks" class="rule-editor-input" style="width:80px;"
             value="${c.weeks}" min="1" max="12" onchange="applySkillSettings()" />
      <label>週刷新一次</label>

      ${started ? `
        <span class="skill-season-tag">第 ${range.index + 1} 季 ·
          ${new Date(range.from).toLocaleDateString('zh-TW')} 起</span>
        <button class="btn btn-ghost btn-small" onclick="restartSkillSeason()">
          從現在重新開季</button>` : ''}
    </div>

    <div class="quiz-mode-hint">
      技能是「次數」,不是永久加成 —— 用完就沒了,下一季才回來。
      所以強技能不會讓差距滾雪球,只會讓關鍵時刻更有感。
      每一次使用都在伺服器留下紀錄,次數由安全規則把關,改前端沒有用。
      ${c.enabled ? '' : '<strong>目前是關閉狀態,學生端完全看不到技能。</strong>'}
    </div>

    <div class="skill-stage-grid">${stages}</div>

    ${SkillAdmin.on() ? `
      <div class="skill-uses">
        <div class="student-section-title">這一季的技能使用
          (${SkillAdmin.uses.length} 次)</div>
        ${recent || '<div class="skill-stage-none">還沒有人用過</div>'}
      </div>` : ''}`;
}

function applySkillSettings() {
  const enabled = document.getElementById('skEnabled').checked;
  const weeks = Math.max(1, parseInt(document.getElementById('skWeeks').value) || 1);
  const prev = SkillAdmin.cfg();

  state.skills = {
    ...prev,
    enabled,
    weeks,
    // 第一次開啟就從現在起算第一季
    startAt: prev.startAt || (enabled ? Date.now() : 0)
  };
  save();
  SkillAdmin.syncUseWatch();
  SkillAdmin.publishIfStale();
  renderSkillBoard();
  toast(enabled ? '✦ 守護獸技能已啟用' : '守護獸技能已關閉');
}

function restartSkillSeason() {
  if (!confirm('從現在開始重新算第一季?\n\n' +
               '每個人的技能次數會立刻回滿。已經用掉的紀錄會留著當歷程,不會被刪。')) return;
  state.skills = { ...SkillAdmin.cfg(), startAt: Date.now() };
  save();
  SkillAdmin.syncUseWatch();
  SkillAdmin.publishIfStale();
  renderSkillBoard();
  toast('✦ 已重新開季,技能次數全部回滿');
}
