/* ============================================
   學生端 — 分頁畫面
   ────────────────────────────────────────────
   守護獸、排行榜、兌換、以及自選守護獸與積分紀錄。
   都是純粹把資料畫出來,沒有寫入動作。
============================================ */

Object.assign(StudentApp, {
  /* ---------- 分頁:我的守護獸 ---------- */

  renderPetTab() {
    const s = this.student;
    const petHtml = s && s.pet
      ? this.renderPet(s)
      : this.petChoice
        ? this.renderPendingPet()
        : this.renderPetPicker();

    return `
      <section class="student-pet-section">${petHtml}</section>
      ${this.renderSkillsPanel()}
      <section class="student-section">
        <div class="student-section-title">最近的積分紀錄</div>
        ${this.renderHistory()}
      </section>`;
  },

  /* ---------- 分頁:測驗 ---------- */

  renderQuizTab() {
    if (this.quizzes.length === 0) {
      return '<div class="student-empty">目前沒有待作答的測驗</div>';
    }
    const results = (this.student && this.student.quizResults) || {};

    return this.quizzes.map(q => {
      const race = q.scoreMode === 'perQuestion';
      const answered = race ? (this.qProgress[q.id] || 0) : 0;
      const done = race ? answered >= q.questions.length : !!this.submissions[q.id];
      const r = results[q.id];
      const waiting = !!q.settleAt && Date.now() < q.settleAt;

      let action;
      if (r) {
        action = `<span class="student-quiz-score">+${r.awarded} 分</span>`;
      } else if (race && !done && q.status === 'open') {
        action = `<button class="btn btn-accent btn-small"
                    onclick="StudentApp.openQuiz('${q.id}')">${
                      answered > 0 ? `繼續作答 (${answered}/${q.questions.length})` : '開始作答'
                    }</button>`;
      } else if (done) {
        action = `<span class="student-quiz-done">✓ ${race ? '已答完' : '已交卷'}${
          waiting ? '<br><small>' + formatSettleAt(q.settleAt) + ' 公布</small>' : ''}</span>`;
      } else if (q.status !== 'open') {
        action = '<span class="student-quiz-done">已結束</span>';
      } else {
        action = `<button class="btn btn-accent btn-small"
                    onclick="StudentApp.openQuiz('${q.id}')">開始作答</button>`;
      }

      return `
      <div class="student-quiz-card ${done ? 'done' : ''}">
        <div class="student-quiz-main">
          <div class="student-quiz-title">${escapeHtml(q.title)}</div>
          <div class="student-quiz-meta">
            ${q.questions.length} 題${q.dueDate ? ' · 截止 ' + q.dueDate : ''}
            ${q.scoreMode === 'topN' ? ` · 前 ${q.topN} 名得分` : ''}
          </div>
          ${r ? this.renderMyQuizResult(q, r) : ''}
          ${!r && q.status === 'open' ? this.renderQuizSkills(q) : ''}
        </div>
        ${action}
      </div>`;
    }).join('');
  },

  /* 測驗卡片上的技能。只在「還沒結算」時給用 ——
     結算完才用就沒意義了,而且老師那邊也不會再重算。
     保險只對搶分類的測驗有用,所以其他類型不顯示。 */
  renderQuizSkills(q) {
    if (!this.skillsOn()) return '';
    const race = q.scoreMode === 'topN' || q.scoreMode === 'perQuestion';
    // 保險只對搶分類有意義(其他模式答對就有分,沒有「沒進名次」這回事)
    const list = ['quiz_double', 'quiz_insure', 'quiz_gift']
      .filter(id => id !== 'quiz_insure' || race)
      .filter(id => this.owns(id) && SkillEngine.usesAt(id, this.myStage()) > 0)
      .map(id => SkillEngine.byId(id));
    if (list.length === 0) return '';

    return `
      <div class="quiz-skill-row">
        ${list.map(sk => {
          const used = this.quizSkillUsed(sk.id, q.id);
          const left = this.skillLeft(sk.id);
          const lv = SkillEngine.levelAt(sk.id, this.myStage());
          return `<button class="skill-chip ${used ? 'on' : ''}"
                    ${used || left <= 0 ? 'disabled' : ''}
                    title="${escapeHtml(sk.desc + ' — ' + (lv.text || ''))}"
                    onclick="StudentApp.useQuizSkill('${sk.id}', '${q.id}')">
                    ${sk.icon} ${escapeHtml(sk.name)}${
                      used ? ' ✓' : `<small>剩 ${left}</small>`}</button>`;
        }).join('')}
      </div>`;
  },

  /* 成績公布後,學生看得到自己每一題的對錯。
     marks 是老師端批改時存下來的 '1/0/-' 字串,裡面沒有正確答案。 */
  renderMyQuizResult(quiz, r) {
    const marks = r.marks || '';
    const ranks = (r.qRanks || '').split(',');     // 逐題搶答才有

    const dots = quiz.questions.map((q, i) => {
      const m = marks[i] || '-';
      const rank = Number(ranks[i] || 0);
      const label = m === '1' ? '✓' : m === '0' ? '✗' : '—';
      const cls = m === '1' ? 'ok' : m === '0' ? 'no' : 'skip';
      // 這一題搶到名次的話,把名次標在格子上
      return `<span class="qmark ${cls} ${rank ? 'won' : ''}"
                title="第 ${i + 1} 題${rank ? ':第 ' + rank + ' 個答對' : ''}"
              >${rank ? rank : label}</span>`;
    }).join('');

    const fast = ranks.filter(x => Number(x) > 0).length;

    return `
      <div class="student-quiz-result">
        <div class="sqr-line">
          答對 <strong>${r.score}/${r.total}</strong> 題
          ${quiz.scoreMode === 'perQuestion'
            ? ` · 搶到 <strong>${fast}</strong> 題的前 ${quiz.topN} 名`
            : ''}
          ${quiz.scoreMode === 'topN' && r.rank ? ` · 第 <strong>${r.rank}</strong> 名` : ''}
          ${r.awarded === 0 && quiz.scoreMode === 'topN'
            ? ' <span class="sqr-miss">(未進得分名額)</span>' : ''}
          ${r.skillNote ? ` <span class="sqr-skill">${escapeHtml(r.skillNote)}</span>` : ''}
        </div>
        <div class="sqr-marks">${dots}</div>
        ${quiz.scoreMode === 'perQuestion'
          ? '<div class="sqr-legend">格子裡的數字 = 那一題你是第幾個答對的</div>' : ''}
      </div>`;
  },

  /* ---------- 分頁:兌換商店 ----------
     學生按下兌換只是送出一張申請單,實際扣點在老師端執行。
     所以這裡顯示的餘額純粹是給孩子參考,不是判斷的依據。 */

  renderShopTab() {
    const items = (this.shopItems || []).filter(i => i.active);
    const points = this.student ? this.student.currentPoints : 0;

    const pendingIds = (this.myPurchases || [])
      .filter(p => p.status === 'pending')
      .map(p => p.itemId);

    const cards = items.length === 0
      ? '<div class="student-empty">老師還沒上架任何獎品</div>'
      : items.map(item => {
          const soldOut  = item.stock !== null && item.stock <= 0;
          const tooPoor  = points < item.price;
          const waiting  = pendingIds.includes(item.id);
          const disabled = soldOut || tooPoor || waiting;

          return `
          <div class="prize-card ${disabled ? 'disabled' : ''}">
            <div class="prize-icon">${escapeHtml(item.icon || '🎁')}</div>
            <div class="prize-body">
              <div class="prize-name">${escapeHtml(item.name)}</div>
              ${item.description
                ? `<div class="prize-desc">${escapeHtml(item.description)}</div>` : ''}
              <div class="prize-meta">
                <span class="prize-price">${item.price} 點</span>
                ${item.stock !== null
                  ? `<span class="prize-stock">${soldOut ? '已兌完' : '剩 ' + item.stock + ' 份'}</span>`
                  : ''}
              </div>
            </div>
            <button class="btn btn-accent btn-small" ${disabled ? 'disabled' : ''}
                    onclick="StudentApp.buy('${item.id}')">
              ${waiting ? '處理中' : soldOut ? '已兌完' : tooPoor ? `還差 ${item.price - points} 點` : '兌換'}
            </button>
          </div>`;
        }).join('');

    return `
      <div class="prize-balance">
        <span>我的可用積分</span>
        <strong>${points}</strong>
      </div>
      ${cards}
      ${this.renderMyPurchases()}`;
  },

  renderMyPurchases() {
    const list = (this.myPurchases || [])
      .filter(p => p.status !== 'pending')
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, 10);
    if (list.length === 0) return '';

    const label = {
      paid: '已扣點,等老師發放',
      delivered: '已領取',
      rejected: '未成立',
      refunded: '已退點'
    };

    return `
      <section class="student-section">
        <div class="student-section-title">我的兌換紀錄</div>
        <div class="student-history">
          ${list.map(p => `
            <div class="student-history-row">
              <span class="student-history-reason">
                ${escapeHtml(p.itemIcon || '🎁')} ${escapeHtml(p.itemName)}
                <span class="prize-status ${p.status}">${label[p.status] || p.status}</span>
                ${p.status === 'rejected' && p.reason
                  ? `<span class="prize-reason">${escapeHtml(p.reason)}</span>` : ''}
              </span>
              <span class="student-history-points neg">
                ${p.settledPrice != null ? '-' + p.settledPrice : ''}
              </span>
            </div>`).join('')}
        </div>
      </section>`;
  },

  async buy(itemId) {
    const item = (this.shopItems || []).find(i => i.id === itemId);
    if (!item) return;

    const fruit = SkillEngine.skillOfFruit(item.id);
    if (fruit && SkillEngine.owns(this.student, fruit.id)) {
      toast('這顆果實你已經有了,一個技能買一次就永久擁有');
      return;
    }
    if (!confirm(fruit
        ? `用 ${item.price} 點買「${item.name}」嗎?\n\n` +
          `買一次就永久擁有,守護獸每進化一次這個技能就更強。\n\n` +
          SkillEngine.fruitDescription(fruit)
        : `用 ${item.price} 點兌換「${item.name}」嗎?`)) return;

    /* 議價要先登記,再把它的 id 寫進申請單 —— 老師結算時照著打折。
       取消或用不了就是原價兌換。技能果實本身不給打折(買一次就永久)。 */
    const useId = (this.skillsOn() && !SkillEngine.isFruit(item.id))
      ? await this.askDiscount(item) : null;

    try {
      await Cloud.createPurchase(this.classInfo.classId, Cloud.uid, {
        studentId: this.classInfo.studentId,
        studentName: this.classInfo.name,
        itemId: item.id,
        itemName: item.name,
        itemIcon: item.icon || '🎁',
        requestedPrice: item.price,
        skillId: useId ? 'shop_discount' : '',
        skillUseId: useId || ''
      });
      toast(useId
        ? '✦ 已送出兌換(帶著 🏷️ 議價)'
        : '✦ 已送出兌換,老師確認後就會扣點');
    } catch (e) {
      console.error(e);
      toast('兌換失敗:' + e.message);
    }
  },

  /* ---------- 分頁:排行榜 ---------- */

  /* 分組來源:老師存過的分組優先,否則用目前螢幕上那份(按過「產生分組」就有)。
     老師只按產生沒按儲存也看得到,不用多教一個步驟。 */
  readGroups(blob) {
    const sets = blob.groupSets || [];
    if (sets.length > 0) {
      const latest = sets[sets.length - 1];
      this.groups = decodeGroups(latest.groups);
      this.groupsName = latest.name;
    } else {
      this.groups = decodeGroups(blob.currentGroups);
      this.groupsName = null;
    }
  },

  renderRankTab() {
    const hasGroups = !!(this.groups && this.groups.length);
    const showGroup = this.rankTab === 'group' && hasGroups;

    const rows = showGroup
      ? Leaderboard.groups(this.allStudents, this.groups)
      : Leaderboard.individual(this.allStudents);

    // 小組榜要高亮的是「我所屬的那一組」
    const myId = showGroup ? this.myGroupId() : this.classInfo.studentId;

    const switcher = hasGroups ? `
      <div class="rank-switch">
        <button class="rank-switch-btn ${!showGroup ? 'active' : ''}"
                onclick="StudentApp.setRankTab('individual')">個人榜</button>
        <button class="rank-switch-btn ${showGroup ? 'active' : ''}"
                onclick="StudentApp.setRankTab('group')">小組榜</button>
      </div>` : '';

    // 前三名沒變動就不重播動畫
    const sig = this.rankTab + '::' + Leaderboard.signature(rows);
    const animate = sig !== this.lastPodiumSig;
    this.lastPodiumSig = sig;

    return `
      ${switcher}
      ${showGroup && this.groupsName
        ? `<div class="rank-groupset-name">依「${escapeHtml(this.groupsName)}」分組</div>` : ''}
      ${Leaderboard.renderPodium(rows, { highlightId: myId, animate })}
      ${Leaderboard.renderMyRank(rows, myId, showGroup ? '我這組的名次' : '我的名次')}
    `;
  },

  setRankTab(tab) {
    this.rankTab = tab;
    this.render();
  },

  /* 找出自己在哪一組 */
  myGroupId() {
    if (!this.groups) return null;
    const idx = this.groups.findIndex(members =>
      (members || []).some(m => Leaderboard.memberId(m) === this.classInfo.studentId));
    return idx >= 0 ? 'g' + idx : null;
  },

  renderPet(s) {
    const stage = PetEngine.getStage(s.totalPoints);
    const species = PET_SPECIES.find(p => p.id === s.pet);
    const nextThreshold = STAGE_THRESHOLDS[stage + 1];
    const pct = nextThreshold
      ? Math.min(100, Math.round(s.totalPoints / nextThreshold * 100))
      : 100;

    return `
      <div class="student-pet-card">
        <div class="student-pet-icon">${PetEngine.getIcon(s)}</div>
        <div class="student-pet-name">${escapeHtml(s.petName || (species ? species.name : '守護獸'))}</div>
        <div class="student-pet-stage">${STAGE_NAMES[stage]}</div>
        <div class="student-points">
          <div><span class="student-points-num">${s.totalPoints}</span><span>累積經驗</span></div>
          <div><span class="student-points-num">${s.currentPoints}</span><span>可用積分</span></div>
        </div>
        <div class="student-progress">
          <div class="student-progress-bar" style="width:${pct}%"></div>
        </div>
        <div class="student-progress-label">
          ${nextThreshold
            ? `再 ${nextThreshold - s.totalPoints} 分進化到下一階段`
            : '已達最高階段'}
        </div>
      </div>`;
  },

  /* ---------- 自選守護獸 ---------- */

  renderPetPicker() {
    const cards = PET_SPECIES.map(p => `
      <div class="pet-choice ${this.pickedPet === p.id ? 'selected' : ''}"
           onclick="StudentApp.pickPet('${p.id}')">
        <div class="pet-choice-icon">${p.icon}</div>
        <div class="pet-choice-name">${escapeHtml(p.name)}</div>
        <div class="pet-choice-desc">${escapeHtml(p.desc)}</div>
      </div>`).join('');

    return `
      <div class="pet-picker">
        <div class="pet-picker-title">選擇你的守護獸</div>
        <div class="pet-picker-sub">— 台 灣 山 林 八 神 —</div>
        <div class="pet-picker-desc">
          牠們都是台灣特有種,真實住在這座島上。<br>
          選好之後就不能更換了,慢慢挑。
        </div>
        <div class="pet-choice-grid">${cards}</div>
        <input type="text" id="petNickname" class="student-short-input"
               placeholder="幫牠取個名字(可留空)" style="margin-top:16px;" />
        <button class="btn btn-primary btn-block btn-large" style="margin-top:14px;"
                ${this.pickedPet ? '' : 'disabled'}
                onclick="StudentApp.confirmPet()">
          ${this.pickedPet ? '就選牠了' : '請先選一隻'}
        </button>
      </div>`;
  },

  pickPet(petId) {
    this.pickedPet = petId;
    // 保留使用者已經打好的名字,重繪不要清掉
    const input = document.getElementById('petNickname');
    this.draftNickname = input ? input.value : (this.draftNickname || '');
    this.render();
    const restored = document.getElementById('petNickname');
    if (restored) restored.value = this.draftNickname || '';
  },

  async confirmPet() {
    if (!this.pickedPet) return;
    const species = PET_SPECIES.find(p => p.id === this.pickedPet);
    const input = document.getElementById('petNickname');
    const nickname = (input ? input.value : '').trim();

    if (!confirm(`確定選擇「${species.name}」嗎?選好之後就不能更換了。`)) return;

    try {
      await Cloud.savePetChoice(this.classInfo.classId, Cloud.uid, {
        studentId: this.classInfo.studentId,
        studentName: this.classInfo.name,
        pet: this.pickedPet,
        petName: nickname || null
      });
      toast('✦ 守護獸已選定!');
      this.pickedPet = null;
      this.draftNickname = '';
      await this.refresh();
    } catch (e) {
      console.error(e);
      toast('選擇失敗:' + e.message);
    }
  },

  /* 已送出選擇,但老師還沒開過班級後台,尚未收進正式資料 */
  renderPendingPet() {
    const species = PET_SPECIES.find(p => p.id === this.petChoice.pet);
    if (!species) return '<div class="student-pet-empty">守護獸資料有誤,請告訴老師</div>';
    return `
      <div class="student-pet-card">
        <div class="student-pet-icon">🥚</div>
        <div class="student-pet-name">${escapeHtml(this.petChoice.petName || species.name)}</div>
        <div class="student-pet-stage">${escapeHtml(species.name)} · 靈卵</div>
        <div class="student-progress-label" style="margin-top:16px;">
          你選好了 ${species.icon} ${escapeHtml(species.name)}。<br>
          老師下次打開班級後台時,牠就會正式住進來。
        </div>
      </div>`;
  },

  renderHistory() {
    const h = (this.student && this.student.history) || [];
    if (h.length === 0) return '<div class="student-empty">還沒有積分紀錄</div>';
    return `<div class="student-history">` +
      h.slice(-10).reverse().map(r => `
        <div class="student-history-row">
          <span class="student-history-reason">${escapeHtml(r.reason)}</span>
          <span class="student-history-points ${r.points >= 0 ? 'pos' : 'neg'}">
            ${r.points >= 0 ? '+' : ''}${r.points}
          </span>
        </div>`).join('') + `</div>`;
  },
});
