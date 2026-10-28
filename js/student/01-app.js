/* ============================================
   學生端
   ────────────────────────────────────────────
   學生看得到:自己的守護獸、自己的積分、待作答的測驗。
   學生只能寫入自己的那份 submission,不能改班級資料,
   所以 30 個人同時操作也不會互相影響。
============================================ */

const StudentApp = {
  classInfo: null,      // { classId, className, studentId, name, seatNumber }
  student: null,        // 從班級 blob 取出的自己那筆資料(唯讀)
  quizzes: [],
  submissions: {},      // { quizId: submissionDoc }
  activeQuiz: null,
  draftAnswers: {},
  petChoice: null,        // 已送出但老師還沒收進班級資料的選擇
  pickedPet: null,        // 挑選畫面上目前點選的物種
  draftNickname: '',
  tab: 'pet',             // pet | rank | quiz
  rankTab: 'individual',  // individual | group
  allStudents: [],        // 全班的公開資料(姓名、累積經驗、守護獸),排行榜用
  rosterEntry: null,      // 公開名冊裡自己那一筆
  myPrivate: null,        // 只有自己看得到的那一份(明細、可用積分、測驗成績、背包)
  useRoster: false,       // 讀的是公開名冊,還是退回讀主文件
  groups: [],             // 目前使用的分組(id 陣列的陣列)
  groupsName: null,       // 分組名稱,老師存過才有
  shopItems: [],          // 老師上架的獎品
  myPurchases: [],        // 自己的兌換申請
  unsub: null,            // 班級即時監聽
  unsubPurchases: null,
  unsubSkillGrants: null,
  classSkills: null,      // 老師的技能設定(從班級資料來)
  lastScore: undefined,   // 用來偵測加分,跳出提示

  async enter(classInfo) {
    // 跨班切換時要把上一班的殘留狀態清掉,否則會看到別班的作答畫面
    this.activeQuiz = null;
    this.myPurchases = [];
    this.lastScore = undefined;
    // 換班時這幾個一定要清掉,否則會把上一班的自己混進來
    this.rosterEntry = null;
    this.myPrivate = null;
    this.useRoster = false;
    this._warTabShown = false;
    this._warSig = null;
    this._warHistoryLoaded = false;
    this.skillUses = [];
    this.armedSkill = null;
    this.tTried = new Set();
    this.tSolved = {};
    this.stopAnswerTimer();
    this.classInfo = classInfo;
    hideAllTopViews();
    document.getElementById('studentView').classList.remove('hidden');
    document.getElementById('studentView').innerHTML =
      '<div class="student-loading">載入中…</div>';

    /* 載不到班級資料就停在這裡 —— 再去接那些監聽沒有意義,
       而且它們一回來就會把「請老師開一下系統」那句話蓋掉。 */
    if (await this.refresh() === false) return;

    this.watch();
    this.watchPurchases();
    this.watchTerritory();
    this.watchSkills();
    // 自己的蜂巢戰紀紀錄等「真的有一局在跑」再讀,沒開局就不必花那些讀取
  },

  /* 老師結算兌換後,狀態會即時反映在學生畫面上 */
  watchPurchases() {
    if (this.unsubPurchases) this.unsubPurchases();
    this.unsubPurchases = Cloud.watchMyPurchases(
      this.classInfo.classId, Cloud.uid, list => {
        this.myPurchases = list;
        if (!this.activeQuiz && this.tab === 'shop') this.render();
      });
  },

  /* 找出「我」是名單上的哪一位。
     老師重新整理名單時學生的 id 會換掉,登入索引卻還指著舊的 id ——
     那時只用 id 找會找不到人,畫面一片空白。改成找不到就用信箱再找一次,
     找到了就把 classInfo 的 id 補正,後續的作答、兌換才會寫到對的人身上。

     公開名冊裡**刻意沒有信箱**(不然全班的 Google 帳號互相看得到),
     所以用名冊讀資料時這裡的信箱比對會落空 —— 由 ensureMyId() 另外
     向名冊索引(以自己的信箱為鍵、只有自己讀得到)問出自己的學號。 */
  findMe(list) {
    const byId = list.find(s => s.id === this.classInfo.studentId);
    if (byId) return byId;

    const mail = (state.user && state.user.email || '').trim().toLowerCase();
    const byMail = mail && list.find(s => (s.email || '').trim().toLowerCase() === mail);
    if (byMail) {
      console.warn('[學生端] 名冊索引的 studentId 已失效,改用信箱比對');
      this.classInfo.studentId = byMail.id;
      return byMail;
    }
    return null;
  },

  /* 名單上沒有我的學號時,向名冊索引問一次正確的。 */
  async ensureMyId(list) {
    if ((list || []).some(s => s.id === this.classInfo.studentId)) return;
    const sid = await Cloud.myStudentId(this.classInfo.classId).catch(() => null);
    if (sid && list.some(s => s.id === sid)) {
      console.warn('[學生端] 登入索引的學號已失效,已用名冊索引補正');
      this.classInfo.studentId = sid;
    }
  },

  /* ============================================
     套用班級的公開資料
     ────────────────────────────────────────────
     來源有兩種,欄位名稱刻意一致,所以這裡不必分辨是哪一種:
       · classes/{id}/public/roster  —— 現在的來源,只含該公開的部分
       · 主文件 blob                 —— 老師還沒開過這個班時的退路

     為什麼要分開:主文件裡有全班的加分明細(含扣分原因)、測驗成績、
     可用積分與 Google 帳號。安全規則擋不了個別欄位,學生打開開發者
     工具就全部看得到 —— 積分互相看得到是刻意的,那些不是。
  ============================================ */
  applyClassData(src) {
    this.allStudents = src.students || [];
    this.rosterEntry = this.findMe(this.allStudents);
    if (src.rules) this.classRules = src.rules;
    this.shopItems = src.shopItems || [];
    this.classSkills = src.skills || null;
    this.readGroups(src);
    this.mergeMe();
  },

  /* this.student = 公開那筆 + 自己的私有那筆。

     順序是「私有先、公開後」,所以同時存在的欄位(姓名、累積經驗)
     以公開名冊為準 —— 私有那一份可能因為寫入失敗而落後一步,
     不能讓它把剛更新的分數蓋回舊的。

     私有那份讀不到時就只有公開的:畫面會少掉積分明細與測驗成績,
     但守護獸、排行榜、兌換都還在 —— 比整頁空白好。
     退回讀主文件時 rosterEntry 本來就是完整的那一筆,所以也對。 */
  mergeMe() {
    if (!this.rosterEntry) { this.student = null; return; }
    this.student = { ...(this.myPrivate || {}), ...this.rosterEntry };
  },

  /* ============================================
     幫守護獸改名
     ────────────────────────────────────────────
     次數是兌換改名卡來的,而且**真正扣次數的是老師那一端** ——
     學生寫不了班級資料,所以這裡只是送出請求。
     老師開著系統的話幾秒內就會套用(他那邊有監聽)。
  ============================================ */
  async renamePet() {
    const s = this.student;
    if (!s || (s.renameLeft || 0) <= 0) return;

    const now = s.petName || '';
    const want = (prompt(
      `幫你的守護獸取一個新名字(最多 ${PET_NAME_MAX} 個字):\n\n`
      + `這會用掉一張改名卡,你還有 ${s.renameLeft} 張。`, now) || '').trim();
    if (!want || want === now) return;

    if (want.length > PET_NAME_MAX) {
      toast(`名字最多 ${PET_NAME_MAX} 個字`);
      return;
    }

    try {
      await Cloud.requestPetRename(
        this.classInfo.classId, Cloud.uid, this.classInfo.studentId, want);
      /* 名字由老師那一端套用,所以這裡不能直接改 —— 直接改的話畫面上
         變了、雲端沒變,下一次重新整理又會變回去,那比不會改更糟。 */
      toast(`已送出:要改成「${want}」。老師那邊一開著就會生效。`, 6000);
    } catch (e) {
      console.error(e);
      toast('送出失敗:' + e.message);
    }
  },

  /* 自己那份私有資料(加分明細、可用積分、測驗成績、背包)。 */
  async refreshMine() {
    if (!this.useRoster || !this.classInfo.studentId) return;
    try {
      const p = await Cloud.loadMyPrivate(this.classInfo.classId, this.classInfo.studentId);
      if (!p) return;
      this.myPrivate = p;
      this.mergeMe();
      if (!this.activeQuiz) this.render();
    } catch (e) {
      console.warn('[學生端] 讀取自己的明細失敗:', e.code || e.message);
    }
  },

  /* 老師一發分、一結算成績,學生畫面就跟著動。
     排行榜是即時的,搶答結果馬上看得到名次變化。 */
  watch() {
    if (this.unsub) this.unsub();

    const onData = src => {
      this.applyClassData(src);

      // 正在作答時不要重繪,會把已經選好的答案清掉
      if (this.activeQuiz) return;

      const before = this.lastScore;
      const now = this.student ? this.student.totalPoints : 0;
      this.lastScore = now;

      this.render();

      if (before !== undefined && now !== before) {
        /* 自己的分數動了,私有那一份(明細、可用積分)也跟著變,補讀一次。
           **只有被加分的那一位會多讀**,不是全班 —— 名冊推送給全班,
           但這一行只有分數真的變了的人會跑到。 */
        this.refreshMine();
      }
      if (before !== undefined && now > before) {
        toast(`✦ 獲得 ${now - before} 分!`);
      }
    };

    if (this.useRoster) {
      this.unsub = Cloud.watchPublicRoster(this.classInfo.classId,
        src => { if (src) onData(src); });
    } else {
      this.unsub = Cloud.watchClass(this.classInfo.classId, doc => onData(doc.blob || {}));
    }
  },

  async refresh() {
    const { classId } = this.classInfo;   // studentId 由 findMe() 決定(可能需要用信箱補正)

    /* 先試公開名冊。老師開過這個班就有 ——
       沒有的話(剛上線還沒開過)退回讀主文件,功能完全一樣,
       只是那一份含有不該給學生看的欄位。
       五個班都開過一次之後,主文件的讀取權限就會收成只有導師。 */
    let roster = null;
    try {
      roster = await Cloud.loadPublicRoster(classId);
    } catch (e) {
      console.warn('[學生端] 讀取公開名冊失敗,改讀主文件:', e.code || e.message);
    }
    this.useRoster = !!(roster && roster.students);

    if (this.useRoster) {
      await this.ensureMyId(roster.students);
      this.myPrivate = await Cloud.loadMyPrivate(classId, this.classInfo.studentId)
        .catch(e => {
          console.warn('[學生端] 讀取自己的明細失敗:', e.code || e.message);
          return null;
        });
      this.applyClassData(roster);
    } else {
      /* 退路:讀主文件。
         這條路以後會被安全規則關掉(主文件含有不該給學生看的欄位),
         到時候「名冊不存在」+「主文件讀不到」就是同一個原因:
         老師還沒用新版開過這個班。那句話要說得讓學生看得懂,
         不要丟一個「找不到班級資料」讓他以為自己走錯班。 */
      let doc = null;
      try {
        doc = await Cloud.loadClass(classId);
      } catch (e) {
        console.warn('[學生端] 主文件也讀不到:', e.code || e.message);
      }
      if (!doc) {
        document.getElementById('studentView').innerHTML = `
          <div class="student-loading">
            這個班級還沒準備好 ——<br>
            請老師開一下系統(開班時會自動完成),再重新整理這個頁面。
          </div>`;
        return false;
      }
      this.myPrivate = null;
      this.applyClassData(doc.blob || {});
    }

    /* 以下都是「有最好,沒有也還能用」的東西。
       之前任何一個被安全規則擋下來,整個登入就失敗,學生只看到一句
       Missing or insufficient permissions —— 守護獸、積分明明都讀到了
       卻什麼也看不到。改成各自獨立,壞掉的那塊退掉就好。 */
    this.degraded = [];

    // 老師還沒把選擇收進班級資料前,先用學生自己的選擇單顯示
    this.petChoice = this.student && this.student.pet
      ? null
      : await this.optional('守護獸選擇', () => Cloud.getMyPetChoice(classId, Cloud.uid), null);

    this.quizzes = await this.optional('測驗', () => Cloud.listQuizzesForStudent(classId), []);
    await this.loadSkills();

    // 逐份查自己交過沒 — 開放中的測驗通常不多,這裡的查詢量很小
    this.submissions = {};
    this.qProgress = {};
    for (const q of this.quizzes) {
      if (q.scoreMode === 'perQuestion') {
        // 逐題搶答沒有交卷動作,進度看的是自己答過幾題
        const mine = await this.optional('作答進度',
          () => Cloud.listMyQuizAnswers(classId, q.id, Cloud.uid), {});
        this.qProgress[q.id] = Object.keys(mine).length;
      } else {
        const sub = await this.optional('作答紀錄',
          () => Cloud.getMySubmission(classId, q.id, Cloud.uid), null);
        if (sub) this.submissions[q.id] = sub;
      }
    }

    this.render();
  },

  /* 讀不到就退回預設值,並記下是哪一塊壞了 */
  async optional(label, fn, fallback) {
    try {
      return await fn();
    } catch (e) {
      console.warn(`[學生端] ${label} 讀取失敗:`, e.code || e.message);
      const why = e.code === 'permission-denied' ? '權限不足' : '讀取失敗';
      if (!this.degraded.some(d => d.label === label)) {
        this.degraded.push({ label, why });
      }
      return fallback;
    }
  },

  /* ---------- 主畫面 ---------- */

  render() {
    if (this.activeQuiz) {
      this.renderQuizPage();
      return;
    }

    const pending = this.quizzes.filter(q => !this.submissions[q.id]).length;

    document.getElementById('studentView').innerHTML = `
      <header class="student-header">
        <div>
          <div class="student-class">${
            (state.myClasses || []).length > 1
              ? `<select class="student-class-switch" onchange="switchStudentClass(this.value)">${
                  state.myClasses.map(c =>
                    `<option value="${c.classId}" ${c.classId === this.classInfo.classId ? 'selected' : ''}>${escapeHtml(c.className)}</option>`
                  ).join('')
                }</select>`
              : escapeHtml(this.classInfo.className)
          }</div>
          <div class="student-name">${escapeHtml(this.classInfo.name)}
            ${this.classInfo.seatNumber ? ' · ' + escapeHtml(this.classInfo.seatNumber) + ' 號' : ''}</div>
        </div>
        <div class="student-header-actions">
          <button class="btn btn-ghost btn-small" onclick="StudentApp.refresh()">重新整理</button>
          <button class="btn btn-ghost btn-small" onclick="Session.signOut()">登出</button>
        </div>
      </header>

      <nav class="student-tabs">
        <button class="student-tab ${this.tab === 'pet' ? 'active' : ''}"
                onclick="StudentApp.setTab('pet')">守護獸</button>
        <button class="student-tab ${this.tab === 'rank' ? 'active' : ''}"
                onclick="StudentApp.setTab('rank')">排行榜</button>
        <button class="student-tab ${this.tab === 'quiz' ? 'active' : ''}"
                onclick="StudentApp.setTab('quiz')">
          測驗${pending > 0 ? `<span class="student-tab-badge">${pending}</span>` : ''}
        </button>
        <button class="student-tab ${this.tab === 'shop' ? 'active' : ''}"
                onclick="StudentApp.setTab('shop')">兌換</button>
        ${TerritoryGame.config && TerritoryGame.config.status === 'running' ? `
        <button class="student-tab war ${this.tab === 'war' ? 'active' : ''}"
                onclick="StudentApp.setTab('war')">蜂巢戰紀</button>` : ''}
        <button class="student-tab ${this.tab === 'help' ? 'active' : ''}"
                onclick="StudentApp.setTab('help')" title="使用說明">說明</button>
      </nav>

      <main class="student-main ${this.tab === 'war' ? 'is-war' : ''}">
        ${(this.degraded || []).length ? `
          <div class="student-degraded">
            這些功能暫時讀不到:${this.degraded.map(d =>
              `${escapeHtml(d.label)}(${d.why})`).join('、')}。<br>
            守護獸與積分不受影響,請告訴老師看看。
          </div>` : ''}
        <div class="student-pane pane-${this.tab}${this._paneAnim ? ' is-switching' : ''}">
          ${this.tab === 'pet'  ? this.renderPetTab()  : ''}
          ${this.tab === 'rank' ? this.renderRankTab() : ''}
          ${this.tab === 'quiz' ? this.renderQuizTab() : ''}
          ${this.tab === 'shop' ? this.renderShopTab() : ''}
          ${this.tab === 'war'  ? this.renderWarTab()  : ''}
          ${this.tab === 'help' ? renderHelpFull('student', this.classRules) : ''}
        </div>
      </main>
    `;
  },

  setTab(tab) {
    this.tab = tab;
    /* 只有「真的切分頁」時才播滑動動畫。
       render() 在老師加分、戰況更新時也會跑,那些不該動。 */
    this._paneAnim = true;
    this.render();
    this._paneAnim = false;
  },
};
