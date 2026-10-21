/* ============================================
   守護獸技能 — 學生端
   ────────────────────────────────────────────
   技能面板掛在「守護獸」分頁裡,不另外開一個分頁 ——
   目的就是讓學生在看自己的獸的時候,直接看到「再進化一次會多拿到什麼」。

   每一次使用都先在伺服器登記一筆(id 含「第幾次」),
   拿到 id 之後才把效果帶進作答/兌換。順序不能顛倒:
   先有紀錄,規則才查得到這次加成。
============================================ */

Object.assign(StudentApp, {
  skillGrants: null,      // 老師發的授權表 { season, g }
  skillUses: [],          // 我這一季用過的
  unsubSkillUses: null,
  armedSkill: null,       // 這一次攻擊要帶的技能(目前只有猛擊)

  skillsOn() {
    const c = SkillEngine.cfg(this.classSkills);
    return !!(c.enabled && c.startAt);
  },

  skillSeason() {
    return SkillEngine.seasonOf(this.classSkills, Date.now());
  },

  myStage() {
    return PetEngine.getStage((this.student && this.student.totalPoints) || 0);
  },

  /* 我這一季各技能還剩幾次 */
  mySkills() {
    const used = SkillEngine.usedMap(this.skillUses, this.skillSeason());
    return SkillEngine.mySkills(this.myStage(), used);
  },

  skillLeft(skillId) {
    const s = this.mySkills().find(x => x.id === skillId);
    return s ? s.left : 0;
  },

  async loadSkills() {
    if (!this.skillsOn()) { this.skillUses = []; return; }
    const season = this.skillSeason();
    this.skillUses = await this.optional('技能紀錄',
      () => Cloud.listMySkillUses(this.classInfo.classId, Cloud.uid, season), []);
  },

  watchSkills() {
    if (this.unsubSkillGrants) this.unsubSkillGrants();
    this.unsubSkillGrants = Cloud.watchSkillGrants(this.classInfo.classId, g => {
      this.skillGrants = g;
    });
  },

  /* 護盾會改變地圖的重播結果,所以全班都要看得到誰用了護盾。
     只在「技能開著 + 有倒扣」時才訂 —— 否則一筆也用不到。 */
  syncSkillUseWatch() {
    const need = this.skillsOn()
      && !!(TerritoryGame.config && (TerritoryGame.config.wrongPenalty || 0) > 0);
    if (need && !this.unsubSkillUses) {
      this.unsubSkillUses = Cloud.watchSkillUses(
        this.classInfo.classId, this.skillSeason(), list => {
          TerritoryGame.shielded = SkillEngine.shieldedAttempts(list);
          TerritoryGame.rebuild();
        });
    } else if (!need && this.unsubSkillUses) {
      this.unsubSkillUses();
      this.unsubSkillUses = null;
      TerritoryGame.shielded = new Set();
    }
  },

  /* ---------- 用掉一次技能 ----------
     n 是「這一季的第幾次」。本機算出來,撞號代表同一次送了兩遍,
     規則會擋下(既有文件不准修改),所以不會偷偷多用。 */
  async spendSkill(skillId, ref) {
    const season = this.skillSeason();
    const used = SkillEngine.usedMap(this.skillUses, season);
    const n = (used[skillId] || 0) + 1;
    const total = SkillEngine.usesAt(skillId, this.myStage());
    if (n > total) throw new Error('這個技能這一季已經用完了');

    const id = await Cloud.useSkill(this.classInfo.classId, Cloud.uid, {
      studentId: this.classInfo.studentId,
      studentName: this.classInfo.name,
      skillId, season, n,
      ref: ref || ''
    });
    this.skillUses.push({ id, skillId, season, n, ref: ref || '', uid: Cloud.uid });
    return id;
  },

  /* 錯誤訊息要說人話 —— 規則擋下來的原因學生看不懂 */
  skillError(e) {
    if (e && e.code === 'permission-denied') {
      return '技能用不了:可能是次數已經用完、或老師還沒更新這一季的技能表';
    }
    return '技能用不了:' + ((e && e.message) || '不明原因');
  },

  /* ---------- 面板 ---------- */
  renderSkillsPanel() {
    if (!this.skillsOn()) return '';
    const stage = this.myStage();
    const mine = this.mySkills();
    const next = SkillEngine.nextUnlocks(stage);
    const range = SkillEngine.seasonRange(this.classSkills, Date.now());
    const days = Math.max(0, Math.ceil((range.to - Date.now()) / 86400000));

    return `
      <section class="skill-panel">
        <div class="skill-head">
          <h3>守護獸技能</h3>
          <span class="skill-season">第 ${range.index + 1} 季 · ${days} 天後刷新</span>
        </div>

        ${mine.length === 0 ? `
          <div class="skill-empty">
            ${stage === 0
              ? '你的守護獸還是靈卵,孵化之後就會學會第一個技能。'
              : '這一階還沒有技能。'}
          </div>` : `
          <div class="skill-grid">
            ${mine.map(s => `
              <div class="skill-card ${s.left > 0 ? '' : 'spent'}">
                <span class="skill-icon">${s.icon}</span>
                <div class="skill-body">
                  <div class="skill-name">${escapeHtml(s.name)}
                    <span class="skill-area">${SKILL_AREAS[s.area].icon} ${SKILL_AREAS[s.area].name}</span>
                  </div>
                  <div class="skill-desc">${escapeHtml(s.desc)}</div>
                </div>
                <span class="skill-left">${s.left}<small>/${s.total}</small></span>
              </div>`).join('')}
          </div>`}

        ${next.length > 0 ? `
          <div class="skill-next">
            <strong>再進化一次會學會:</strong>
            ${next.map(s => `<span class="skill-next-one">${s.icon} ${escapeHtml(s.name)} —
              ${escapeHtml(s.short)}</span>`).join('')}
          </div>` : (stage > 0 ? `
          <div class="skill-next">你的守護獸已經學會所有技能了。</div>` : '')}
      </section>`;
  },

  /* ---------- 領地戰:猛擊 ----------
     開題之前先問,因為加成要寫進那一次作答的紀錄裡。 */
  armWarPower() {
    if (this.skillLeft('war_power') <= 0) { toast('猛擊這一季已經用完了'); return; }
    this.armedSkill = this.armedSkill === 'war_power' ? null : 'war_power';
    this.render();
  },

  /* ---------- 領地戰:護盾 ----------
     答錯之後才用得上,所以放在結果提示框裡。 */
  async useShield(attemptId) {
    if (!attemptId) return;
    if (this.skillLeft('war_shield') <= 0) { toast('護盾這一季已經用完了'); return; }
    try {
      await this.spendSkill('war_shield', attemptId);
      toast('🛡️ 護盾擋下了這次倒扣');
      hideWarResult();
      this.render();
    } catch (e) {
      toast(this.skillError(e));
    }
  },

  /* ---------- 領地戰:靜心 ----------
     冷卻中才用得上。ref 指名「是哪一次冷卻」,規則據此確認一次只解一次。 */
  async useFocus() {
    const last = this.tLastAttempt;
    if (!last) return;
    if (this.skillLeft('war_focus') <= 0) { toast('靜心這一季已經用完了'); return; }
    try {
      this.focusUseId = await this.spendSkill('war_focus', last.id);
      this.stopCooldownTimer();
      toast('🌀 靜心完成,可以再出手了');
      this.render();
    } catch (e) {
      toast(this.skillError(e));
    }
  },

  /* ---------- 測驗:專注 / 保險 ---------- */
  async useQuizSkill(skillId, quizId) {
    if (this.skillLeft(skillId) <= 0) { toast('這個技能這一季已經用完了'); return; }
    const sk = SkillEngine.byId(skillId);
    const already = this.skillUses.some(u => u.skillId === skillId && u.ref === quizId);
    if (already) { toast('這份測驗已經用過這個技能了'); return; }
    if (!confirm(`對這份測驗使用「${sk.name}」?\n\n${sk.desc}\n\n用了就不能收回。`)) return;
    try {
      await this.spendSkill(skillId, quizId);
      toast(`${sk.icon} 已對這份測驗使用「${sk.name}」`);
      this.render();
    } catch (e) {
      toast(this.skillError(e));
    }
  },

  quizSkillUsed(skillId, quizId) {
    return this.skillUses.some(u => u.skillId === skillId && u.ref === quizId);
  },

  /* ---------- 商店:議價 / 優先 ----------
     先登記技能,再把它的 id 寫進兌換申請單 —— 老師結算時照著算。 */
  async pickShopSkill(itemId) {
    const opts = ['shop_discount', 'shop_jump']
      .filter(id => this.skillLeft(id) > 0)
      .map(id => SkillEngine.byId(id));
    if (opts.length === 0) return null;

    const lines = opts.map((s, i) => `${i + 1}. ${s.icon} ${s.name} — ${s.short}`).join('\n');
    const ans = prompt(`要用技能嗎?(直接按確定 = 不用)\n\n${lines}\n\n輸入編號:`, '');
    if (!ans) return null;
    const pick = opts[parseInt(ans, 10) - 1];
    if (!pick) return null;

    try {
      return { skillId: pick.id, skillUseId: await this.spendSkill(pick.id, itemId) };
    } catch (e) {
      toast(this.skillError(e));
      return null;
    }
  }
});
