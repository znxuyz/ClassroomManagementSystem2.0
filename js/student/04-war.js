/* ============================================
   學生端:領地佔領戰
   ────────────────────────────────────────────
   地圖和老師端跑同一份重播,所以兩邊看到的必然一致。
   答錯時安全規則會擋下寫入(permission-denied),據此判定對錯 ——
   正確答案從頭到尾沒有離開伺服器。
============================================ */

Object.assign(StudentApp, {
  tQuestions: [],
  tTargetHex: null,
  tQuestion: null,
  tPickedAnswer: null,
  tSubmitting: false,
  tResult: null,
  unsubTQuestions: null,
  _warTabShown: false,
  _warSig: null,
  tTried: new Set(),      // 這次登入已經作答過的題目(含答錯的)
  tSolved: {},            // 已經答對的題目 { questionId: true },不會再抽到
  tAttemptId: null,
  tLastAttempt: null,     // 我最後一筆嘗試 { id, seq, questionId, streak, at } 連錯冷卻用
  tCooldownTimer: null,
  tSwapsLeft: 3,
  tSwapping: false,
  tOpening: false,
  tDeadline: 0,
  tTimer: null,
  qProgress: {},          // { quizId: 已答題數 } 逐題搶答用
  qAnswered: {},          // 目前這份測驗自己答過的題目
  qPicked: null,
  qSending: false,

  watchTerritory() {
    // 重播引擎由老師端與學生端共用,這裡只是掛上自己的重繪
    // 老師開戰/收工時,分頁列本身要跟著出現或消失 —— 不能只在已經站在
    // 領地戰分頁時才重繪,否則學生會一直看不到那個分頁。
    TerritoryGame.start(() => {
      const running = !!(TerritoryGame.config && TerritoryGame.config.status === 'running');
      /* 開了局才去讀自己的作答紀錄(答過哪些題、連錯幾題)。
         沒開局就讀的話,每個人每次登入都白白付那些讀取。 */
      this.syncSkillUseWatch();
      if (running && !this._warHistoryLoaded) {
        this._warHistoryLoaded = true;
        this.loadMyAttempts().then(() => { if (this.tab === 'war') this.render(); });
      }
      if (running !== this._warTabShown) {
        this._warTabShown = running;
        if (!running && this.tab === 'war') this.tab = 'pet';
        this.render();
        return;
      }
      // 重播引擎每秒重算一次(倒數與階段開放靠它),但戰況沒變就不該重畫
      // 上千格的地圖 —— 那會讓學生正在看的位置一直被打斷。
      if (this.tab === 'war' && !this.tQuestion) {
        const sig = TerritoryGame.config
          ? Territory.signature(TerritoryGame.config, TerritoryGame.map) : 'none';
        if (sig === this._warSig) { this.tickWarCountdown(); return; }
        this._warSig = sig;
        this.render();
      }
    }, this.classInfo.classId);

    if (this.unsubTQuestions) this.unsubTQuestions();
    this.unsubTQuestions = Cloud.watchTerritoryQuestions(
      this.classInfo.classId, qs => { this.tQuestions = qs; });
  },

  /* 戰況沒變時只更新倒數文字,不動地圖 */
  tickWarCountdown() {
    const el = document.getElementById('warCountdown');
    if (!el || !TerritoryGame.config) return;
    const nextAt = Territory.nextStageAt(TerritoryGame.config);
    if (nextAt) el.textContent = formatCountdown(nextAt - Date.now());
  },

  myGroupIdx() {
    const c = TerritoryGame.config;
    if (!c || !c.memberGroup) return null;
    const g = c.memberGroup[this.classInfo.studentId];
    return g == null ? null : g;
  },

  renderWarTab() {
    const c = TerritoryGame.config;
    // 畫完之後把畫面帶到自己的領地。只做一次 —— 之後每次戰況更新都搶
    // 捲動位置的話,學生正在看別處會一直被拉回來。
    if (!this._warCentered) {
      requestAnimationFrame(() => {
        if (this.tab !== 'war' || this.tQuestion) return;
        const g = this.myGroupIdx();
        if (g != null && centerOnGroup(g, { instant: true })) this._warCentered = true;
      });
    }
    if (!c) return '<div class="student-empty">老師還沒開始領地戰</div>';

    const map = TerritoryGame.map;
    const groupIdx = this.myGroupIdx();

    if (c.status !== 'running') {
      return `${renderStandings(c, map, groupIdx)}
              <div class="student-empty">這一局已經結束了</div>
              ${renderHexMap(c, map, { zoom: _territoryZoom })}`;
    }
    if (groupIdx == null) {
      return '<div class="student-empty">你不在這一局的任何一組,請找老師確認分組</div>';
    }
    if (this.tQuestion) return this.renderWarQuestion();

    const targets = Territory.targetsFor(c, map, groupIdx);
    const color = GROUP_COLORS[groupIdx % GROUP_COLORS.length];
    const nextAt = Territory.nextStageAt(c);
    const pen = c.wrongPenalty || 0;
    const floor = c.penaltyFloor || 0;
    const maxSwaps = c.maxSwaps === undefined ? 3 : c.maxSwaps;
    const coolN = c.cooldownWrong || 0;
    const coolSec = c.cooldownSeconds || 0;
    const coolLeft = this.cooldownLeftMs();
    if (coolLeft > 0) requestAnimationFrame(() => this.startCooldownTimer());

    return `
      ${coolLeft > 0 ? `
        <div class="war-cooldown-bar">
          <span class="war-cooldown-icon">⏳</span>
          <div>
            <strong>連續答錯 ${coolN} 題,先休息一下</strong><br>
            還要等 <strong id="warCooldown">${Math.ceil(coolLeft / 1000)} 秒</strong>
            才能再出手。趁這段時間把題目看清楚吧!
          </div>
          ${this.skillsOn() && this.skillLeft('war_focus') > 0 ? `
            <button class="btn btn-accent btn-small"
                    onclick="StudentApp.useFocus()"
                    title="用掉一次靜心,立刻解除這次冷卻">
              🌀 靜心(剩 ${this.skillLeft('war_focus')})</button>` : ''}
        </div>` : ''}
      <div class="war-header" style="border-color:${color}">
        <div class="war-head-row">
          <div class="war-my-group" style="color:${color}">我是第 ${groupIdx + 1} 組</div>
          <button class="btn btn-ghost btn-small"
                  onclick="centerOnGroup(${groupIdx})">⌖ 回到我的領地</button>
          ${this.skillsOn() && SkillEngine.usesAt('war_power', this.myStage()) > 0 ? `
            <button class="btn btn-small ${this.armedSkill === 'war_power' ? 'btn-accent' : 'btn-ghost'}"
                    ${this.skillLeft('war_power') > 0 ? '' : 'disabled'}
                    onclick="StudentApp.armWarPower()"
                    title="開啟後,下一題答對的佔領分變兩倍">
              ⚔️ 猛擊${this.armedSkill === 'war_power'
                ? ' 已待命' : `(剩 ${this.skillLeft('war_power')})`}</button>` : ''}
        </div>
        <div class="war-hint">
          點選<strong>亮起來</strong>的地塊發動攻擊(有 ${targets.size} 格可打)<br>
          ${nextAt
            ? `下一圈地圖在 <strong id="warCountdown">${formatCountdown(nextAt - Date.now())}</strong> 後開放`
            : '地圖已全部開放'}
        </div>
      </div>
      ${renderStandings(c, map, groupIdx)}
      ${renderHexMap(c, map, { groupIdx, onClick: 'StudentApp.attackHex', zoom: _territoryZoom })}
      <div class="war-legend">
        <strong>空白的地</strong>:累積到 ${c.threshold} 分就立刻佔領。<br>
        <strong>別組的地</strong>:打下去會展開 ${c.battleSeconds} 秒的爭奪,
        時間內分數最高且達到 ${c.threshold} 分的那一組拿下。<br>
        ${pen > 0 ? `<span class="war-penalty-note">答錯或作廢會倒扣 <strong>${pen}</strong> 佔領分${
            floor > 0 ? `,同一格最多扣到 −${floor} 分` : ''} ——
            <strong>只扣你答錯的那一格</strong>,其他正在打的地不會被扣。</span><br>` : ''}
        同一題答對一次就不會再出現,答錯可以再挑戰。<br>
        ${coolN > 0 && coolSec > 0 ? `<span class="war-penalty-note">連續答錯
          <strong>${coolN}</strong> 題要等 <strong>${coolSec}</strong> 秒才能再出手,
          答對一次就歸零(換題不算答錯)。</span><br>` : ''}
        ${maxSwaps > 0 ? `遇到<strong>還沒教過</strong>的題目可以<strong>換題</strong>,
          每次攻擊最多 ${maxSwaps} 次 —— 換到的題目難度與分數都降一階。<br>` : ''}
        灰色是尚未開放的區域,★ 是各組基地,不能被攻佔。
      </div>`;
  },

  /* 已經答過的題目不再出現。答過的名單直接從戰況事件推出來,
     重新整理或換裝置都算數,不靠瀏覽器記憶。 */
  /* 可以再抽到的題目。
     只排除「已經答對」的 —— 同一題答對一次就夠了,再答也不該再得分。
     答錯過的仍然留在池子裡,題庫小的班級才不會很快就無題可答;
     但會排到最後面,不會一直拿同一題煩人。 */
  unusedQuestions(level) {
    const solved = this.tSolved || {};
    let pool = this.tQuestions.filter(q => !solved[q.id]);
    if (level) {
      const sameLevel = pool.filter(q => (q.difficulty || 'medium') === level);
      if (sameLevel.length > 0) pool = sameLevel;   // 該難度沒題目就退回全部
    }
    const fresh = pool.filter(q => !this.tTried.has(q.id));
    return fresh.length > 0 ? fresh : pool;
  },

  /* 換題:往下一個難度換。難度降了,分數也跟著降 —— 代價就在這裡,
     所以不另外罰。還沒教到的單元,學生不會被卡死。 */
  async swapQuestion() {
    if (!this.tQuestion || this.tSwapping) return;
    if (this.tSwapsLeft <= 0) { toast('這一次的換題次數用完了'); return; }

    const ORDER = ['hard', 'medium', 'easy'];
    const cur = this.tQuestion.difficulty || 'medium';
    const i = ORDER.indexOf(cur);
    const nextLevel = i >= 0 && i < ORDER.length - 1 ? ORDER[i + 1] : 'easy';

    const pool = this.unusedQuestions(nextLevel).filter(q => q.id !== this.tQuestion.id);
    if (pool.length === 0) {
      toast(nextLevel === cur ? '沒有更簡單的題目了' : `題庫裡沒有其他${DIFFICULTY[nextLevel].label}的題目`);
      return;
    }

    const q = pool[Math.floor(Math.random() * pool.length)];
    this.tSwapping = true;
    this.render();

    try {
      const prev = this.tAttemptId;
      // 換題不算答錯,連錯數維持原樣
      const streak = Territory.nextStreak(this.tLastAttempt, this.tSolved, true);
      // 換題次數由伺服器核對:接著前一筆往上加,上限是老師設的 maxSwaps
      const swapsUsed = ((this.tLastAttempt || {}).swaps || 0) + 1;
      this.tAttemptId = await Cloud.startTerritoryAttempt(
        this.classInfo.classId, Cloud.uid, {
          studentId: this.classInfo.studentId,
          studentName: this.classInfo.name,
          groupIdx: this.myGroupIdx(),
          hexKey: this.tTargetHex,
          questionId: q.id,
          seq: (this.tSeq || 0) + 1,
          prev,
          replaces: prev,         // 舊的那筆不算失手,不會倒扣
          streak,
          swaps: swapsUsed
        });
      this.rememberAttempt(q.id, streak, swapsUsed);
    } catch (e) {
      console.warn('[領地戰] 換題失敗:', e.code || e.message);
      this.tSwapping = false;
      toast('換題失敗:' + (e.message || e.code));
      // 被擋下通常代表本機算的鏈接錯了,從伺服器重新接一次
      this.loadMyAttempts().then(() => { if (this.tab === 'war') this.render(); });
      return;
    }

    this.tSwapping = false;
    this.tSwapsLeft--;
    this.tQuestion = q;
    this.tPickedAnswer = null;

    // 新題目重新計時,換到的題目才有完整的作答時間
    const limit = this.answerSeconds();
    this.tDeadline = limit > 0 ? Date.now() + limit * 1000 : 0;
    if (limit > 0) this.startAnswerTimer();
    this.render();
  },

  async attackHex(hexKey) {
    if (this.tQuestions.length === 0) { toast('題庫是空的,請找老師'); return; }
    // 紀錄是開局後才讀的,萬一還沒讀完就被點到,先補讀 —— 否則會抽到
    // 已經答對過的題目,送出時被規則擋下來,看起來就像莫名其妙答錯
    if (!this._warHistoryLoaded) { this._warHistoryLoaded = true; await this.loadMyAttempts(); }
    const pool = this.unusedQuestions();
    if (pool.length === 0) {
      toast(`題庫共 ${this.tQuestions.length} 題你都答對了,請找老師再出題`);
      return;
    }
    if (this.tOpening) return;

    const cool = this.cooldownLeftMs();
    if (cool > 0) {
      const c0 = TerritoryGame.config || {};
      toast(`連續答錯 ${c0.cooldownWrong} 題,要等 ${Math.ceil(cool / 1000)} 秒才能再出手`);
      return;
    }

    /* 規則要先講。嚴格模式下切個分頁題目就沒了,
       沒有事先說清楚會覺得被陰。 */
    const limitSec = this.answerSeconds();
    if (this.strictOn() && !confirm(
      '這一題開始之後:\n\n' +
      (limitSec > 0 ? `· 限時 ${limitSec} 秒\n` : '· 不限時,想清楚再答\n') +
      ((TerritoryGame.config || {}).wrongPenalty > 0
        ? `· 答錯或作廢會倒扣 ${TerritoryGame.config.wrongPenalty} 佔領分\n` : '') +
      '· 會進入全螢幕,離開全螢幕或切到別的分頁就作廢\n' +
      '· 答錯或作廢可以再挑戰這一題,但答對過的題目不會再出現\n' +
      ((TerritoryGame.config || {}).cooldownWrong > 0
        && (TerritoryGame.config || {}).cooldownSeconds > 0
        ? `· 連續答錯 ${TerritoryGame.config.cooldownWrong} 題要等 ${TerritoryGame.config.cooldownSeconds} 秒才能再出手\n` : '') +
      (((TerritoryGame.config || {}).maxSwaps ?? 3) > 0
        ? `· 沒學過的題目可以換題(最多 ${(TerritoryGame.config || {}).maxSwaps ?? 3} 次),難度與分數降一階\n` : '') +
      '\n準備好了就按確定')) return;

    const q = pool[Math.floor(Math.random() * pool.length)];
    this.tOpening = true;

    /* 先在伺服器登記「我點開了這一題」,拿到伺服器時間之後才顯示題目。
       每次點開都是新的一筆,所以答錯之後還可以再試這一題。 */
    const last = this.tLastAttempt;
    const streak = Territory.nextStreak(last, this.tSolved, false);
    try {
      this.tAttemptId = await Cloud.startTerritoryAttempt(
        this.classInfo.classId, Cloud.uid, {
          studentId: this.classInfo.studentId,
          studentName: this.classInfo.name,
          groupIdx: this.myGroupIdx(),
          hexKey,
          questionId: q.id,
          seq: (this.tSeq || 0) + 1,
          prev: last ? last.id : '',      // 第一筆沒有前一筆
          streak,
          swaps: 0,                       // 新的一次攻擊,換題次數歸零
          // 靜心:用過就帶著它,規則據此放行這一次的冷卻
          skillUseId: this.focusUseId || ''
        });
      this.focusUseId = null;
      this.rememberAttempt(q.id, streak, 0);
    } catch (e) {
      console.warn('[領地戰] 登記作答失敗:', e.code || e.message);
      this.tOpening = false;
      toast(e.code === 'permission-denied'
        ? '開啟題目被拒絕 —— 可能是冷卻還沒結束,或請老師確認 Firestore 安全性規則已重新發布'
        : '開啟題目失敗:' + (e.message || e.code));
      // 被擋下通常代表本機算的鏈接錯了,從伺服器重新接一次
      this.loadMyAttempts().then(() => { if (this.tab === 'war') this.render(); });
      return;
    }

    /* 猛擊要在「這一次攻擊」上生效,所以嘗試登記成功之後、顯示題目之前
       就把技能登記掉,並記著它指向哪一筆嘗試。 */
    this.warPowerUse = null;
    if (this.armedSkill === 'war_power') {
      try {
        this.warPowerUse = await this.spendSkill('war_power', this.tAttemptId);
        toast('⚔️ 猛擊已發動,這一題答對拿雙倍');
      } catch (e) {
        toast(this.skillError(e));
      }
      this.armedSkill = null;
    }

    this.tOpening = false;
    this.tSwapsLeft = (TerritoryGame.config || {}).maxSwaps;
    if (this.tSwapsLeft === undefined) this.tSwapsLeft = 3;
    this.tTargetHex = hexKey;
    this.tQuestion = q;
    this.tPickedAnswer = null;
    this.tResult = null;
    const limit = this.answerSeconds();
    this.tDeadline = limit > 0 ? Date.now() + limit * 1000 : 0;
    if (limit > 0) this.startAnswerTimer();
    this.render();
    await this.enterStrict();
  },

  async loadMyAttempts() {
    this.tSolved = await this.optional('作答紀錄',
      () => Cloud.listMySolvedQuestions(this.classInfo.classId, Cloud.uid), {});
    /* 連錯冷卻要接回自己那條鏈,才不會被「重新整理」繞過。
       只需要最後一筆,所以不把整串抓回來 —— 用上次記住的號碼去驗,
       通常 2 次讀取就夠(見 Cloud.getMyChainTip)。
       取不到就當成沒連錯過 —— 寧可少罰,也不要讓學生被卡住不能玩。
       就算接錯了也不會出事:安全規則會擋下來,擋下來就重接一次。 */
    const tip = await this.optional('嘗試紀錄',
      () => Cloud.getMyChainTip(this.classInfo.classId, Cloud.uid, this.chainHint()), null);
    this.tLastAttempt = tip && (tip.seq || 0) >= 1 ? tip : null;
    this.tSeq = this.tLastAttempt ? this.tLastAttempt.seq : 0;
    this.saveChainHint();
  },

  /* 上次答到第幾號,記在這台裝置上。只是個提示,錯了頂多多讀幾筆 */
  chainKey() {
    return `war:${this.classInfo.classId}:${(TerritoryGame.config || {}).startedAt || 0}:seq`;
  },

  chainHint() {
    try { return Number(localStorage.getItem(this.chainKey())) || 0; } catch (e) { return 0; }
  },

  saveChainHint() {
    try { localStorage.setItem(this.chainKey(), String(this.tSeq || 0)); } catch (e) { /* 無痕模式 */ }
  },

  /* ---------- 連錯冷卻 ----------
     連錯幾題就停幾秒,擋的是「不看題目一直猜」。
     算式在 Territory.cooldownUntil,安全規則用同一套,
     所以畫面上的倒數就是伺服器真正在等的時間。 */

  /* 記下剛剛登記成功的那一筆,接著當下一筆的 prev。
       seq 以伺服器真正收下的 id 為準(撞號時會往後挪) */
  rememberAttempt(questionId, streak, swaps) {
    const seq = Number(String(this.tAttemptId || '').split('_').pop()) || (this.tSeq || 0) + 1;
    this.tSeq = seq;
    this.tLastAttempt = {
      id: this.tAttemptId, seq, questionId, streak, swaps: swaps || 0, at: Date.now()
    };
    this.saveChainHint();
  },

  cooldownLeftMs() {
    const c = TerritoryGame.config;
    if (!c) return 0;
    return Math.max(0, Territory.cooldownUntil(c, this.tLastAttempt, this.tSolved) - Date.now());
  },

  /* 回報失手:答錯/超時/作廢/放棄都走這裡。
     扣分就發生在這一刻、扣在這一格 —— 不會波及我點開過的其他格子。
     寫不進去不要緊,重播還有寬鬆的期限兜底,所以不打擾學生。 */
  reportFail(why) {
    const id = this.tAttemptId;
    const hexKey = this.tTargetHex;
    const questionId = this.tQuestion ? this.tQuestion.id : null;
    if (!id || !hexKey) return;
    Cloud.sendTerritoryFail(this.classInfo.classId, Cloud.uid, id, {
      studentId: this.classInfo.studentId,
      studentName: this.classInfo.name,
      groupIdx: this.myGroupIdx(),
      hexKey, questionId, why
    }).catch(e => console.warn('[領地戰] 回報失手失敗:', e.code || e.message));
  },

  /* 答錯之後要講清楚現在連錯幾題、還差幾題就要等 ——
     不說的話學生只會覺得莫名其妙被鎖住。 */
  cooldownNote() {
    const c = TerritoryGame.config || {};
    const n = c.cooldownWrong || 0;
    const sec = c.cooldownSeconds || 0;
    if (n <= 0 || sec <= 0) return '';
    const s = Territory.nextStreak(this.tLastAttempt, this.tSolved, false);
    if (s <= 0) return '';
    return s % n === 0
      ? `。已經連錯 ${s} 題,要等 ${sec} 秒才能再出手`
      : `。已經連錯 ${s} 題,再錯 ${n - (s % n)} 題就要等 ${sec} 秒`;
  },

  /* 冷卻中每秒只更新那一行字,不重畫地圖 */
  startCooldownTimer() {
    clearInterval(this.tCooldownTimer);
    this.tCooldownTimer = setInterval(() => {
      const left = this.cooldownLeftMs();
      const el = document.getElementById('warCooldown');
      if (!el) { this.stopCooldownTimer(); return; }
      if (left <= 0) {
        this.stopCooldownTimer();
        if (this.tab === 'war' && !this.tQuestion) this.render();
        return;
      }
      el.textContent = Math.ceil(left / 1000) + ' 秒';
    }, 250);
  },

  stopCooldownTimer() { clearInterval(this.tCooldownTimer); this.tCooldownTimer = null; },

  /* 0 = 不限時。老師若覺得讀題慢的學生會吃虧,可以整個關掉;
     防作弊就只靠「一題一次機會」與嚴格作答。 */
  answerSeconds() {
    const c = TerritoryGame.config;
    const n = c ? c.answerSeconds : 45;
    return (n === 0 || n) ? n : 45;
  },

  /* ---------- 嚴格作答 ----------
     學生的手法是:在電腦上把題目複製下來,開另一個分頁貼給 AI。
     所以真正要擋的不是「複製」,是「離開這個畫面」。

     兩層偵測:
       · 全螢幕:作答時進入全螢幕,離開就作廢
       · 可見性:切到別的分頁、切到別的視窗(blur)一樣作廢
     第二層其實比第一層準 —— 就算沒進全螢幕,切走也抓得到。
     兩個都是前端判定,但伺服器那邊有作答時限當底,繞過前端也來不及查。 */

  strictOn() {
    const c = TerritoryGame.config;
    return !!(c && c.strictMode !== false);
  },

  async enterStrict() {
    if (!this.strictOn()) return;
    const box = document.getElementById('studentView');
    try {
      if (box && box.requestFullscreen && !document.fullscreenElement) {
        await box.requestFullscreen();
      }
    } catch (e) {
      console.warn('[領地戰] 無法進入全螢幕:', e.message);
    }

    this._onLeave = () => {
      // 進入全螢幕的那一瞬間也會觸發一次,要排掉
      if (document.fullscreenElement) return;
      this.violate('離開了全螢幕');
    };
    this._onHide = () => {
      if (document.visibilityState === 'hidden') this.violate('切換到別的分頁或視窗');
    };
    document.addEventListener('fullscreenchange', this._onLeave);
    document.addEventListener('visibilitychange', this._onHide);
    window.addEventListener('blur', this._onHide);
  },

  exitStrict() {
    document.removeEventListener('fullscreenchange', this._onLeave || (() => {}));
    document.removeEventListener('visibilitychange', this._onHide || (() => {}));
    window.removeEventListener('blur', this._onHide || (() => {}));
    this._onLeave = this._onHide = null;
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  },

  /* 違規:題目作廢。機會本來就在點開時登記掉了,所以不用再寫什麼 */
  violate(why) {
    if (!this.tQuestion) return;
    this.stopAnswerTimer();
    this.exitStrict();
    this.reportFail('作廢:' + why);
    this.tQuestion = null;
    this.tTargetHex = null;
    this.tPickedAnswer = null;
    this.render();
    const pen4 = (TerritoryGame.config || {}).wrongPenalty || 0;
    showWarResult(false, `${why},這一次作廢` +
      (pen4 > 0 ? `,倒扣 ${pen4} 佔領分` : '') + '。可以再挑戰這一題' + this.cooldownNote());
  },

  /* 作答倒數。時間到就關掉題目 —— 機會已經用掉了,不能再回來慢慢查。 */
  startAnswerTimer() {
    clearInterval(this.tTimer);
    this.tTimer = setInterval(() => {
      const left = Math.max(0, Math.ceil((this.tDeadline - Date.now()) / 1000));
      const el = document.getElementById('warCountdownBig');
      if (el) {
        el.textContent = left + ' 秒';
        el.classList.toggle('is-urgent', left <= 10);
      }
      if (left <= 0) this.timeUpWarAnswer();
    }, 250);
  },

  stopAnswerTimer() { clearInterval(this.tTimer); this.tTimer = null; },

  timeUpWarAnswer() {
    this.stopAnswerTimer();
    this.exitStrict();
    if (!this.tQuestion) return;
    this.reportFail('時間到');
    this.tQuestion = null;
    this.tTargetHex = null;
    this.tPickedAnswer = null;
    this.render();
    const pen3 = (TerritoryGame.config || {}).wrongPenalty || 0;
    showWarResult(false, '時間到,這一次算答錯' +
      (pen3 > 0 ? `,倒扣 ${pen3} 佔領分` : '') + '。可以再挑戰這一題' + this.cooldownNote());
  },

  cancelWarQuestion() {
    this.stopAnswerTimer();
    this.exitStrict();
    this.reportFail('放棄');
    this.tQuestion = null;
    this.tTargetHex = null;
    this.tPickedAnswer = null;
    this.render();
  },

  pickWarAnswer(i) {
    this.tPickedAnswer = i;
    this.render();
  },

  renderWarQuestion() {
    const q = this.tQuestion;
    const d = DIFFICULTY[q.difficulty] || DIFFICULTY.easy;
    const c = TerritoryGame.config;
    const cell = TerritoryGame.map[this.tTargetHex] || {};
    const mine = cell.battle ? (cell.battle.points[String(this.myGroupIdx())] || 0) : 0;

    return `
      <div class="war-question">
        <div class="war-q-head">
          <span class="war-q-diff" style="background:${d.color}">
            ${d.label} · 答對 +${d.points} 佔領分</span>
          ${(c.wrongPenalty || 0) > 0
            ? `<span class="war-q-penalty">答錯 −${c.wrongPenalty}</span>` : ''}
          ${this.tDeadline > 0 ? `<span class="war-q-timer" id="warCountdownBig">${
            Math.max(0, Math.ceil((this.tDeadline - Date.now()) / 1000))} 秒</span>` : ''}
          ${this.tSwapsLeft > 0 ? `
            <button class="btn btn-ghost btn-small" ${this.tSwapping ? 'disabled' : ''}
                    onclick="StudentApp.swapQuestion()"
                    title="沒學過的單元可以換一題,但難度與分數都會降一階">
              ${this.tSwapping ? '換題中…' : `換題 (還有 ${this.tSwapsLeft} 次)`}</button>` : ''}
          <button class="btn btn-ghost btn-small" onclick="StudentApp.cancelWarQuestion()">放棄</button>
        </div>

        <div class="war-q-target">
          <span>攻打:${cell.owner === null || cell.owner === undefined
            ? '空白地塊' : '第 ' + (cell.owner + 1) + ' 組的地'}</span>
          <span class="war-q-progress">
            ${cell.battle
              ? `我方 ${mine} 分 · 剩 ${formatCountdown(cell.battle.endsAt - Date.now())}`
              : `尚未開戰 · 需 ${c.threshold} 分`}
          </span>
        </div>

        <div class="war-q-text noselect" oncopy="return false" oncontextmenu="return false"
             >${escapeHtml(q.text)}</div>

        ${q.options.map((opt, i) => opt ? `
          <label class="student-option noselect ${this.tPickedAnswer === i ? 'picked' : ''}"
                 oncopy="return false" oncontextmenu="return false"
                 onclick="StudentApp.pickWarAnswer(${i})">
            <span class="student-option-letter">${'ABCD'[i]}</span>
            <span>${escapeHtml(opt)}</span>
          </label>` : '').join('')}

        <button class="btn btn-primary btn-block btn-large" style="margin-top:14px;"
                ${this.tPickedAnswer === null || this.tSubmitting ? 'disabled' : ''}
                onclick="StudentApp.submitWarAnswer()">
          ${this.tSubmitting ? '送出中…'
            : this.tPickedAnswer === null ? '請先選一個答案' : '送 出'}
        </button>
      </div>`;
  },

  /* 答錯時規則會拒絕寫入。這不是錯誤,而是判定結果 ——
     正確答案不需要送到學生端,也就無從偷看。 */
  async submitWarAnswer() {
    if (this.tPickedAnswer === null || this.tSubmitting) return;
    this.stopAnswerTimer();
    this.exitStrict();
    this.tSubmitting = true;
    this.render();

    const groupIdx = this.myGroupIdx();
    const base = DIFFICULTY[this.tQuestion.difficulty].points;
    // 猛擊:佔領分 ×2。倍率由安全規則核對,前端只是照著算
    const boosted = !!this.warPowerUse;
    const points = boosted ? base * 2 : base;
    this.tTried.add(this.tQuestion.id);

    try {
      await Cloud.sendTerritoryEvent(this.classInfo.classId, Cloud.uid, {
        studentId: this.classInfo.studentId,
        studentName: this.classInfo.name,
        groupIdx,
        hexKey: this.tTargetHex,
        questionId: this.tQuestion.id,
        attemptId: this.tAttemptId,
        answer: this.tPickedAnswer,
        points,
        skillId: boosted ? 'war_power' : '',
        skillUseId: boosted ? this.warPowerUse : ''
      });
      this.tSolved[this.tQuestion.id] = true;
      showWarResult(true, `為第 ${groupIdx + 1} 組拿下 ${points} 佔領分` +
        (boosted ? '(⚔️ 猛擊雙倍)' : ''));
    } catch (e) {
      if (e.code === 'permission-denied') {
        // 答案由安全規則在伺服器端比對,被拒絕就代表答錯
        this.reportFail('答錯');
        const pen = (TerritoryGame.config || {}).wrongPenalty || 0;
        showWarResult(false, '這一題答錯了' +
          (pen > 0 ? `,這一格倒扣 ${pen} 佔領分` : '') +
          '。可以再挑戰這一題,但會先輪到還沒做過的題目' + this.cooldownNote(),
          pen > 0 ? this.shieldOffer(this.tAttemptId) : '');
      } else {
        console.error(e);
        showWarResult(null, '送出失敗:' + e.message);
      }
    } finally {
      this.tSubmitting = false;
      this.tQuestion = null;
      this.tTargetHex = null;
      this.render();
    }
  }
});
