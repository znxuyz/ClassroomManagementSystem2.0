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
    return !!SkillEngine.cfg(this.classSkills).enabled;
  },

  skillSeason() {
    return SkillEngine.seasonOf(this.classSkills, Date.now());
  },

  myStage() {
    return PetEngine.getStage((this.student && this.student.totalPoints) || 0);
  },

  /* 我這一季各技能還剩幾次、現在多強。沒買果實的不會出現在這裡。 */
  mySkills() {
    const used = SkillEngine.usedMap(this.skillUses, this.skillSeason());
    return SkillEngine.mySkills(this.student, this.myStage(), used);
  },

  owns(skillId) { return SkillEngine.owns(this.student, skillId); },

  /* 這個技能現在的強度(倍率/折扣/幾題)。沒買或還不能用就是 0。 */
  skillPower(skillId) {
    if (!this.owns(skillId)) return 0;
    return SkillEngine.powerAt(skillId, this.myStage());
  },

  /* 「買了、而且這一階用得了、而且還有次數」 */
  canUse(skillId) {
    return this.skillsOn() && this.owns(skillId) && this.skillLeft(skillId) > 0;
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

    const power = SkillEngine.powerAt(skillId, this.myStage());
    const id = await Cloud.useSkill(this.classInfo.classId, Cloud.uid, {
      studentId: this.classInfo.studentId,
      studentName: this.classInfo.name,
      skillId, season, n, power,
      ref: ref || ''
    });
    this.skillUses.push({ id, skillId, season, n, power, ref: ref || '', uid: Cloud.uid });
    return id;
  },

  /* 錯誤訊息要說人話 —— 規則擋下來的原因學生看不懂 */
  skillError(e) {
    if (e && e.code === 'permission-denied') {
      return '技能用不了:可能是次數已經用完、守護獸還不夠強,' +
             '或老師那邊的技能表還沒更新(請老師開一下系統)';
    }
    return '技能用不了:' + ((e && e.message) || '不明原因');
  },

  /* ---------- 面板 ----------
     掛在「守護獸」分頁裡,目的就是讓學生看自己的獸時,
     直接看到「我現在的技能多強、再進化一次會變成什麼」。 */
  renderSkillsPanel() {
    if (!this.skillsOn()) return '';
    const stage = this.myStage();
    const mine = this.mySkills();
    const range = SkillEngine.seasonRange(this.classSkills, Date.now());
    const days = Math.max(1, Math.ceil((range.to - Date.now()) / 86400000));
    const unbought = SkillEngine.notOwned(this.student);

    return `
      <section class="skill-panel">
        <div class="skill-head">
          <h3>守護獸技能</h3>
          <span class="skill-season">${days} 天後(下週一)次數回滿</span>
        </div>

        ${mine.length === 0 ? `
          <div class="skill-empty">
            還沒有技能。到<strong>兌換</strong>分頁買一顆<strong>技能果實</strong>就學得會,
            買過之後守護獸每進化一次,同一個技能就會更強。
          </div>` : `
          <div class="skill-grid">
            ${mine.map(s => `
              <div class="skill-card ${s.total === 0 ? 'locked' : s.left > 0 ? '' : 'spent'}">
                <span class="skill-icon">${s.icon}</span>
                <div class="skill-body">
                  <div class="skill-name">${escapeHtml(s.name)}
                    <span class="skill-area">${SKILL_AREAS[s.area].icon} ${SKILL_AREAS[s.area].name}</span>
                  </div>
                  <div class="skill-level">${escapeHtml(s.levelText)}</div>
                  <div class="skill-desc">${escapeHtml(s.desc)}</div>
                </div>
                ${s.total > 0
                  ? `<span class="skill-left">${s.left}<small>/${s.total}</small></span>`
                  : '<span class="skill-left locked">🔒</span>'}
              </div>`).join('')}
          </div>`}

        ${mine.length > 0 ? this.renderSkillGrowth(stage, mine) : ''}

        ${unbought.length > 0 ? `
          <div class="skill-shop-hint">
            還有 <strong>${unbought.length}</strong> 顆技能果實沒買:
            ${unbought.map(s => `${s.icon}${escapeHtml(s.name)}`).join('、')}
            —— 在<strong>兌換</strong>分頁。
          </div>` : ''}
      </section>`;
  },

  /* 「再進化一次,我的技能會變成什麼」——
     這是整個設計的重點,所以要講得很具體,不能只寫「會變強」。 */
  renderSkillGrowth(stage, mine) {
    if (stage >= STAGE_NAMES.length - 1) {
      return '<div class="skill-next">你的守護獸已經是最高階,所有技能都是最強版本。</div>';
    }
    const ups = mine.map(s => {
      const now = SkillEngine.levelAt(s.id, stage);
      const next = SkillEngine.levelAt(s.id, stage + 1);
      if (!next.n) return null;
      if (!now.n) return `${s.icon} <strong>${escapeHtml(s.name)}</strong> 解鎖 —— ${escapeHtml(next.text)}`;
      if (now.n === next.n && now.p === next.p) return null;
      return `${s.icon} <strong>${escapeHtml(s.name)}</strong> ${escapeHtml(now.text)}
              → <strong>${escapeHtml(next.text)}</strong>`;
    }).filter(Boolean);

    if (ups.length === 0) return '';
    return `
      <div class="skill-next">
        <strong>進化到${STAGE_NAMES[stage + 1]}之後:</strong>
        ${ups.map(u => `<span class="skill-next-one">${u}</span>`).join('')}
      </div>`;
  },

  /* ---------- 領地戰:猛擊 ----------
     開題之前先按,因為倍率要寫進那一次作答的紀錄裡。 */
  armWarPower() {
    if (!this.canUse('war_power')) { toast('猛擊現在用不了'); return; }
    this.armedSkill = this.armedSkill === 'war_power' ? null : 'war_power';
    this.render();
  },

  /* ---------- 領地戰:巧手 ----------
     攻打中才用得上 —— 這一次攻擊的換題次數變多。
     ref 指名「是哪一次攻擊」,所以一次技能只加成那一次。 */
  async useHand() {
    if (!this.canUse('war_hand')) { toast('巧手現在用不了'); return; }
    if (this.handUseId) { toast('這一次攻擊已經用過巧手了'); return; }
    const extra = this.skillPower('war_hand');
    try {
      this.handUseId = await this.spendSkill('war_hand', this.tAttackId);
      this.tSwapsLeft += extra;
      toast(`✋ 巧手發動,這一次可以多換 ${extra} 題`);
      this.render();
    } catch (e) {
      toast(this.skillError(e));
    }
  },

  /* ---------- 領地戰:護盾 ----------
     答錯之後才用得上,所以放在結果提示框裡。 */
  async useShield(attemptId) {
    if (!attemptId) return;
    if (!this.canUse('war_shield')) { toast('護盾現在用不了'); return; }
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
    if (!this.canUse('war_focus')) { toast('靜心現在用不了'); return; }
    try {
      this.focusUseId = await this.spendSkill('war_focus', last.id);
      this.stopCooldownTimer();
      toast('🌀 靜心完成,可以再出手了');
      this.render();
    } catch (e) {
      toast(this.skillError(e));
    }
  },

  /* ---------- 測驗:專注 / 保險 / 送分 ----------
     指定一份測驗,結算時老師端照著算 —— 結算本來就在老師端,
     所以學生改前端沒有用。 */
  async useQuizSkill(skillId, quizId) {
    if (!this.canUse(skillId)) { toast('這個技能現在用不了'); return; }
    const sk = SkillEngine.byId(skillId);
    if (this.quizSkillUsed(skillId, quizId)) { toast('這份測驗已經用過這個技能了'); return; }
    const lv = SkillEngine.levelAt(skillId, this.myStage());
    if (!confirm(`對「${quizId && ''}這份測驗」使用「${sk.name}」?\n\n` +
                 `你現在的效果:${lv.text}\n\n用了就不能收回。`)) return;
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

  /* ---------- 商店:議價 ----------
     先登記技能,再把它的 id 寫進兌換申請單 —— 老師結算時照著打折。 */
  async askDiscount(item) {
    if (!this.canUse('shop_discount')) return null;
    const p = this.skillPower('shop_discount');
    const off = Math.round((1 - p) * 100);
    const after = Math.floor(item.price * p);
    if (!confirm(`要用「議價」嗎?\n\n` +
                 `${item.name} ${item.price} 點 → 打 ${10 - off / 10} 折 = ${after} 點\n` +
                 `(這一週剩 ${this.skillLeft('shop_discount')} 次)\n\n` +
                 `按取消 = 原價兌換`)) return null;
    try {
      return await this.spendSkill('shop_discount', item.id);
    } catch (e) {
      toast(this.skillError(e));
      return null;
    }
  }
});
