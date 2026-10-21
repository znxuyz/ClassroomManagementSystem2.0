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
  allStudents: [],        // 全班資料,排行榜用
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

    await this.refresh();
    this.watch();
    this.watchPurchases();
    this.watchTerritory();
    this.watchSkills();
    // 自己的領地戰紀錄等「真的有一局在跑」再讀,沒開局就不必花那些讀取
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
     找到了就把 classInfo 的 id 補正,後續的作答、兌換才會寫到對的人身上。 */
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

  /* 老師一發分、一結算成績,學生畫面就跟著動。
     排行榜是即時的,搶答結果馬上看得到名次變化。 */
  watch() {
    if (this.unsub) this.unsub();
    this.unsub = Cloud.watchClass(this.classInfo.classId, doc => {
      const blob = doc.blob || {};
      this.allStudents = blob.students || [];
      this.student = this.findMe(this.allStudents);

      this.shopItems = blob.shopItems || [];
      this.classSkills = blob.skills || null;
      this.readGroups(blob);

      // 正在作答時不要重繪,會把已經選好的答案清掉
      if (this.activeQuiz) return;

      const before = this.lastScore;
      const now = this.student ? this.student.totalPoints : 0;
      this.lastScore = now;

      this.render();
      if (before !== undefined && now > before) {
        toast(`✦ 獲得 ${now - before} 分!`);
      }
    });
  },

  async refresh() {
    const { classId } = this.classInfo;   // studentId 由 findMe() 決定(可能需要用信箱補正)

    const doc = await Cloud.loadClass(classId);
    if (!doc) {
      toast('找不到班級資料');
      return;
    }
    const blob = doc.blob || {};
    this.allStudents = blob.students || [];
    this.student = this.findMe(this.allStudents);
    this.classRules = blob.rules || [];
    this.shopItems = blob.shopItems || [];
    this.classSkills = blob.skills || null;

    this.readGroups(blob);

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
                onclick="StudentApp.setTab('war')">領地戰</button>` : ''}
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
        ${this.tab === 'pet'  ? this.renderPetTab()  : ''}
        ${this.tab === 'rank' ? this.renderRankTab() : ''}
        ${this.tab === 'quiz' ? this.renderQuizTab() : ''}
        ${this.tab === 'shop' ? this.renderShopTab() : ''}
        ${this.tab === 'war'  ? this.renderWarTab()  : ''}
        ${this.tab === 'help' ? renderHelpFull('student', this.classRules) : ''}
      </main>
    `;
  },

  setTab(tab) {
    this.tab = tab;
    this.render();
  },
};
