/* ============================================
   蜂巢戰紀 — 連線與重播
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
  shielded: new Set(),   // 被守護獸「護盾」罩住、不倒扣的那幾筆
  map: {},
  log: [],
  onUpdate: null,      // 學生端掛自己的重繪

  // classId 要能外傳:學生端不會設定 state.classId(那是老師端載入班級才有的),
  // 所以不能沿用 isCloudMode(),否則學生永遠收不到戰況、看不到蜂巢戰紀分頁。
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
    /* 壓縮點往前推時,已經訂好的那幾條要重接 —— 重接之後讀到的
       就只剩壓縮點之後那一小段,這正是壓縮省讀取量的地方。 */
    const since = hasGame ? (this.config.compactedAt || 0) : 0;
    if (since !== this._since) {
      this._since = since;
      ['unsubEvents', 'unsubAttempts', 'unsubFails'].forEach(k => {
        if (this[k]) { this[k](); this[k] = null; }
      });
      this.events = []; this.attempts = []; this.fails = {};
    }

    this._stream('unsubEvents', hasGame,
      () => Cloud.watchTerritoryEvents(cid, list => { this.events = list; this.rebuild(); }, since),
      () => { this.events = []; });

    /* 嘗試紀錄是所有集合裡最大的一份(每點開一題就一筆,換題、答對的
       也都算),而且只為了一件事存在:抓出「點開題目就把分頁關掉、
       想躲掉倒扣」的人。為了這件事讓全班每台裝置都抓一次整份,
       代價太高 —— 所以只有老師那一台訂,由老師那台把過期沒回報的
       補寫成一筆 tfails,學生端只要讀 tfails 就夠了。
       老師的畫面開著時行為完全一樣;沒開的時候那幾筆會晚一點才補上。 */
    this._stream('unsubAttempts', needPenalty && this.isTeacherSide(),
      () => Cloud.watchTerritoryAttempts(cid, list => { this.attempts = list; this.rebuild(); }, since),
      () => { this.attempts = []; });

    this._stream('unsubFails', needPenalty,
      () => Cloud.watchTerritoryFails(cid, m => { this.fails = m; this.rebuild(); }, since),
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
    this._since = undefined;
    this._lastCompact = 0;
    this.config = null;
    this.events = [];
    this.attempts = [];
    this.fails = {};
    this.shielded = new Set();
    this._written = new Set();
    this.map = {};
  },

  rebuild() {
    if (!this.config) { this.map = {}; return; }
    const r = Territory.replay(this.config, this.events, Date.now(), this.attempts,
                               this.fails, this.shielded);
    this.map = r.map;
    this.log = r.log;
    this.materializeFails();
    this.autoCompact();
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

  /* ---------- 自動壓縮 ----------
     事件累積多了,每個新進來的人都要把整串重播一次才看得到地圖 ——
     那是讀取量最大的來源。壓縮就是把「現在誰佔哪一格」寫進設定檔,
     並記下壓縮點;之後大家只讀壓縮點之後那幾筆。

     不刪任何資料。舊事件留著,「誰答過哪一題」就還擋得住,
     所以壓縮完不會讓舊題目重新開放 —— 這是以前手動壓縮最麻煩的地方。

     打到一半的爭奪(累積分數與倒數)也一起存進快照,所以任何時候
     壓縮都是無損的 —— 不必等到沒人在搶地,正熱鬧的時候照樣能壓。 */
  /* 門檻直接決定「一個人進來要讀幾筆」—— 壓得越勤,新進來的人讀得越少。
     但壓縮會改寫設定檔,全班的監聽各會被叫醒一次(每人 1 筆),
     所以也不能壓得太頻繁。150 筆 / 至少隔 2 分鐘是兩邊的平衡點:
     每個人每次進來最多讀 150 筆,而最糟情況下每小時的喚醒成本
     也只有 30 次 × 班級人數。 */
  COMPACT_AT: 150,
  COMPACT_COOLDOWN: 120000,

  autoCompact() {
    if (!this.isTeacherSide() || !this._cid) return;
    const c = this.config;
    if (!c || c.status !== 'running') return;
    if (this.events.length < this.COMPACT_AT) return;
    if (Date.now() - (this._lastCompact || 0) < this.COMPACT_COOLDOWN) return;

    /* 壓縮點用「最後一筆被納入快照的事件」的時間,不是現在 ——
       用現在的話,這一瞬間剛寫進來的事件會被跳過,那一格就不見了。 */
    const since = this.events[this.events.length - 1].at;
    this._lastCompact = Date.now();
    const n = this.events.length;

    Cloud.saveTerritoryConfig(this._cid, {
      ...c,
      snapshot: Territory.snapshotOf(this.map),
      battles: Territory.battlesOf(this.map),
      compactedAt: since
    }).then(() => {
      console.info(`[蜂巢戰紀] 已自動壓縮 ${n} 筆戰況,之後只讀新的`);
    }).catch(e => {
      console.warn('[蜂巢戰紀] 自動壓縮失敗:', e.message);
      this._lastCompact = 0;        // 失敗就讓它下次再試
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
