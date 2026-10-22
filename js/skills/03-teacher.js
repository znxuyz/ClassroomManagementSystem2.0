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
  on()  { return !!this.cfg().enabled; },
  season() { return SkillEngine.seasonOf(state.skills, Date.now()); },

  start() {
    this.stop();
    if (!isCloudMode()) return;

    this.unsubGrants = Cloud.watchSkillGrants(state.classId, g => {
      this.grants = g;
      this.publishIfStale();
    });
    this.syncUseWatch();

    /* 週一 00:00 換季時,就算沒有人碰任何東西,授權表也要跟著換。
       一分鐘檢查一次 —— 沒換季時什麼事都不會發生,不花讀取。 */
    this.ticker = setInterval(() => {
      this.syncUseWatch();
      this.publishIfStale();
    }, 60000);
  },

  stop() {
    if (this.ticker) { clearInterval(this.ticker); this.ticker = null; }
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
   技能果實上架
   ────────────────────────────────────────────
   果實就是一般的兌換獎品,只是多帶一個 skillId —— 所以申請、確認、
   扣點、進背包整條流程都沿用現成的,連安全規則都不必動。
   價格上架後可以自己改,說明會自動帶上四個階段的效果。
============================================ */
function listSkillFruits() {
  const fruits = SkillEngine.fruitItems();
  const existing = new Set(state.shopItems.map(i => i.id));
  const added = [];
  const updated = [];

  fruits.forEach(f => {
    if (existing.has(f.id)) {
      // 已經上架過的只更新說明(效果表可能改過),價格與上下架沿用老師設的
      const cur = state.shopItems.find(i => i.id === f.id);
      if (cur.description !== f.description) {
        cur.description = f.description;
        cur.skillId = f.skillId;
        updated.push(f.name);
      }
    } else {
      state.shopItems.push(f);
      added.push(f.name);
    }
  });

  save();
  renderAll();
  toast(added.length
    ? `✦ 已上架 ${added.length} 顆技能果實`
    : updated.length ? `已更新 ${updated.length} 顆果實的說明` : '技能果實都已經在架上了');
}

/* ============================================
   教師端畫面
============================================ */

function renderSkillBoard() {
  const box = document.getElementById('skillBoard');
  if (!box) return;
  /* 這裡刻意不檢查「畫面是不是看得見」。
     renderAll() 通常在別的分頁時執行,如果因為隱藏就跳過,
     之後切到設定頁也不會重畫 —— 面板就永遠是空的(踩過)。
     這個函式只在 renderAll() 呼叫,不是每秒跑,所以直接畫沒有成本。 */
  box.innerHTML = skillBoardHtml();
}

function skillBoardHtml() {
  const c = SkillAdmin.cfg();
  const range = SkillEngine.seasonRange(state.skills, Date.now());
  const onShelf = PET_SKILLS.filter(s =>
    state.shopItems.some(i => i.id === SkillEngine.fruitId(s.id))).length;

  // 四階效果總表:一眼看完哪一階能用什麼、多強
  const rows = PET_SKILLS.map(sk => `
    <tr>
      <td class="skill-tb-name">${skillIconHtml(sk, 26)} ${escapeHtml(sk.name)}
        <small>${SKILL_AREAS[sk.area].name}</small></td>
      ${sk.levels.map(lv => `
        <td class="${lv.n > 0 ? '' : 'skill-tb-off'}">
          ${lv.n > 0 ? escapeHtml(lv.text).replace(',每週', '<br>每週') : '—'}
        </td>`).join('')}
      <td class="skill-tb-price">${sk.price} 點</td>
    </tr>`).join('');

  const counts = [0, 1, 2, 3].map(i =>
    state.students.filter(s => PetEngine.getStage(s.totalPoints || 0) === i).length);

  // 這一季誰用了什麼
  const recent = [...SkillAdmin.uses]
    .sort((a, b) => (b.at && b.at.seconds || 0) - (a.at && a.at.seconds || 0))
    .slice(0, 15)
    .map(u => {
      const sk = SkillEngine.byId(u.skillId);
      return `<div class="skill-use-row">
        <span>${sk ? skillIconHtml(sk, 20) : '•'} ${escapeHtml(u.studentName || u.studentId)}</span>
        <span class="skill-stage-meta">${sk ? escapeHtml(sk.name) : u.skillId}${
          u.power ? ' ×' + u.power : ''}</span>
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
      <label>週刷新(1 = 每週一)</label>

      <span class="skill-season-tag">本季 ${new Date(range.from).toLocaleDateString('zh-TW')}
        ~ ${new Date(range.to - 1).toLocaleDateString('zh-TW')}</span>

      <div style="flex:1"></div>
      <button class="btn ${onShelf === PET_SKILLS.length ? 'btn-ghost' : 'btn-accent'} btn-small"
              onclick="listSkillFruits()">
        ${onShelf === PET_SKILLS.length ? '更新果實說明' : `上架技能果實(${onShelf}/${PET_SKILLS.length})`}
      </button>
    </div>

    <div class="quiz-mode-hint">
      技能要<strong>去商店買「技能果實」</strong>才學得會,一個技能買一次就永久擁有;
      買了之後<strong>守護獸每進化一階,同一個技能就更強</strong> ——
      所以養獸的動力會延續下去,而不是進化完就沒事做。<br>
      次數<strong>每週一 00:00 歸零</strong>,用完就沒,所以強技能不會讓差距滾雪球。
      每一次使用都在伺服器留下紀錄,次數與強度都由安全規則把關,改前端沒有用。
      ${c.enabled ? '' : '<strong>目前是關閉狀態,學生端完全看不到技能與果實。</strong>'}
    </div>

    <div class="skill-table-wrap">
      <table class="skill-table">
        <thead>
          <tr>
            <th>技能</th>
            ${STAGE_NAMES.map((n, i) => `<th>${n}<small>${counts[i]} 人</small></th>`).join('')}
            <th>果實售價</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

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

  state.skills = { ...prev, enabled, weeks };
  save();
  SkillAdmin.syncUseWatch();
  SkillAdmin.publishIfStale();
  renderSkillBoard();
  toast(enabled ? '✦ 守護獸技能已啟用' : '守護獸技能已關閉');
}
