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
  ticker: null,
  config: null,
  events: [],
  attempts: [],
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

    this.unsubConfig = Cloud.watchTerritoryConfig(cid, c => {
      this.config = c;
      this.rebuild();
    });
    this.unsubEvents = Cloud.watchTerritoryEvents(cid, list => {
      this.events = list;
      this.rebuild();
    });
    // 失手的嘗試要倒扣時才用得到,但一律訂閱比較單純
    this.unsubAttempts = Cloud.watchTerritoryAttempts(cid, list => {
      this.attempts = list;
      this.rebuild();
    });

    // 戰役到期與階段開放都是「時間到了才發生」,沒有新事件也要重算
    this.ticker = setInterval(() => this.rebuild(), 1000);
  },

  stop() {
    if (this.unsubConfig) { this.unsubConfig(); this.unsubConfig = null; }
    if (this.unsubEvents) { this.unsubEvents(); this.unsubEvents = null; }
    if (this.unsubAttempts) { this.unsubAttempts(); this.unsubAttempts = null; }
    if (this.ticker) { clearInterval(this.ticker); this.ticker = null; }
    this.config = null;
    this.events = [];
    this.attempts = [];
    this.map = {};
  },

  rebuild() {
    if (!this.config) { this.map = {}; return; }
    const r = Territory.replay(this.config, this.events, Date.now(), this.attempts);
    this.map = r.map;
    this.log = r.log;
    if (this.onUpdate) this.onUpdate();
    else renderTerritoryLive();
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
