/* ============================================
   領地佔領戰 — 連線與重播
   ────────────────────────────────────────────
   訂閱雲端的設定/事件/嘗試,變動時重新重播。
   這裡是唯一持有「目前這一局」狀態的地方。
============================================ */

/* ============================================
   監聽與重播
   ────────────────────────────────────────────
   老師端與學生端跑的是同一份重播,所以看到的地圖必然一致。
============================================ */

const TerritoryGame = {
  unsubConfig: null,
  unsubEvents: null,
  unsubAttempts: null,
  unsubFails: null,
  ticker: null,
  config: null,
  events: [],
  attempts: [],
  fails: {},        // { attemptId: 失手時間 } 答錯的當下就扣那一格
  map: {},
  log: [],
  onUpdate: null,      // 學生端掛自己的重繪

  // classId 要能外傳:學生端不會設定 state.classId(那是老師端載入班級才有的),
  // 所以不能沿用 isCloudMode(),否則學生永遠收不到戰況、看不到領地戰分頁。
  start(onUpdate, classId) {
    this.stop();
    const cid = classId || state.classId;
    if (!Cloud.ready || !Cloud.uid || !cid) return;
    this.onUpdate = onUpdate || null;

    this._cid = cid;

    this.unsubConfig = Cloud.watchTerritoryConfig(cid, c => {
      this.config = c;
      this.syncStreams();        // 設定決定了哪幾條流真的用得到
      this.rebuild();
    });
    this.syncStreams();

    // 戰役到期與階段開放都是「時間到了才發生」,沒有新事件也要重算
    this.ticker = setInterval(() => this.rebuild(), 1000);
  },

  /* ---------- 只訂閱真的用得到的資料流 ----------
     每一台裝置都會把整個集合抓下來,所以每多訂一條,
     讀取量就要乘上全班人數。一局打下來事件數以千計,
     訂了卻用不到的那幾條,一天就能吃掉整個免費額度。

     · 還沒開過局(沒有 config):什麼都不用訂
     · 沒開倒扣(預設就是 0):嘗試與失手紀錄在重播時會被整個丟掉
       (見 Territory.failedAttempts 的第一行),訂了純粹是浪費
     老師在遊戲中把倒扣打開,這裡就會補訂上去,所以功能不受影響。 */
  syncStreams() {
    const cid = this._cid;
    const hasGame = !!this.config;
    const needPenalty = hasGame && (this.config.wrongPenalty || 0) > 0;

    this._stream('unsubEvents', hasGame,
      () => Cloud.watchTerritoryEvents(cid, list => { this.events = list; this.rebuild(); }),
      () => { this.events = []; });

    /* 嘗試紀錄是所有集合裡最大的一份(每點開一題就一筆,換題、答對的
       也都算),而且只為了一件事存在:抓出「點開題目就把分頁關掉、
       想躲掉倒扣」的人。為了這件事讓全班每台裝置都抓一次整份,
       代價太高 —— 所以只有老師那一台訂,由老師那台把過期沒回報的
       補寫成一筆 tfails,學生端只要讀 tfails 就夠了。
       老師的畫面開著時行為完全一樣;沒開的時候那幾筆會晚一點才補上。 */
    this._stream('unsubAttempts', needPenalty && this.isTeacherSide(),
      () => Cloud.watchTerritoryAttempts(cid, list => { this.attempts = list; this.rebuild(); }),
      () => { this.attempts = []; });

    this._stream('unsubFails', needPenalty,
      () => Cloud.watchTerritoryFails(cid, m => { this.fails = m; this.rebuild(); }),
      () => { this.fails = {}; });
  },

  // 學生端會掛自己的重繪;沒掛的就是老師端
  isTeacherSide() { return !this.onUpdate; },

  _stream(key, want, attach, clear) {
    if (want && !this[key]) this[key] = attach();
    else if (!want && this[key]) { this[key](); this[key] = null; clear(); }
  },

  stop() {
    if (this.unsubConfig) { this.unsubConfig(); this.unsubConfig = null; }
    if (this.unsubEvents) { this.unsubEvents(); this.unsubEvents = null; }
    if (this.unsubAttempts) { this.unsubAttempts(); this.unsubAttempts = null; }
    if (this.unsubFails) { this.unsubFails(); this.unsubFails = null; }
    if (this.ticker) { clearInterval(this.ticker); this.ticker = null; }
    this._cid = null;
    this.config = null;
    this.events = [];
    this.attempts = [];
    this.fails = {};
    this._written = new Set();
    this.map = {};
  },

  rebuild() {
    if (!this.config) { this.map = {}; return; }
    const r = Territory.replay(this.config, this.events, Date.now(), this.attempts, this.fails);
    this.map = r.map;
    this.log = r.log;
    this.materializeFails();
    if (this.onUpdate) this.onUpdate();
    else renderTerritoryLive();
  },

  /* 把「過期又沒人回報」的嘗試補寫成一筆失手紀錄。
     只有老師那一台做 —— 做完之後學生不必再讀整份嘗試紀錄。
     寫過的記在本機,不會重複寫;寫失敗也不要緊,下一秒還會再試。 */
  _written: new Set(),

  materializeFails() {
    if (!this.isTeacherSide() || !this._cid) return;
    if (!this.config || (this.config.wrongPenalty || 0) <= 0) return;

    Territory.failedAttempts(this.config, this.events, this.attempts, Date.now(), this.fails)
      .forEach(f => {
        if (this.fails[f.id] || this._written.has(f.id)) return;
        this._written.add(f.id);
        Cloud.sendTerritoryFail(this._cid, f.uid, f.id, {
          studentId: f.studentId, studentName: f.studentName,
          groupIdx: f.groupIdx, hexKey: f.hexKey,
          questionId: f.questionId, why: '逾時未作答'
        }).catch(() => {});
      });
  },

  myTargets(groupIdx) {
    return Territory.targetsFor(this.config, this.map, groupIdx);
  }
};

/* 只更新地圖與戰況,不重繪整個頁面 —— 老師正在打字時不會被打斷 */
function renderTerritoryLive() {
  const board = document.getElementById('territoryBoard');
  if (!board || !board.offsetParent) return;

  // 上千格的地圖每秒重繪很貴。狀態沒變就不動。
  const c = TerritoryGame.config;
  const sig = c ? Territory.signature(c, TerritoryGame.map) : 'none';
  if (sig === _lastMapSig) return;
  _lastMapSig = sig;

  renderTerritoryBoard();
  renderTerritoryFeed();
}
