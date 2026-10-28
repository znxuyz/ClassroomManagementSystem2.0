/* ============================================
   寵物資料(台灣特有種八神)
============================================ */
const PET_SPECIES = [
  { id: 'bear',     name: '台灣黑熊',     icon: '🐻', desc: '胸前有 V 形白毛,森林之王' },
  { id: 'cat',      name: '石虎',         icon: '🐱', desc: '夜行獵手,瀕危山林精靈' },
  { id: 'salmon',   name: '櫻花鉤吻鮭',   icon: '🐟', desc: '冰河時期遺族,清流貴族' },
  { id: 'pheasant', name: '帝雉',         icon: '🦃', desc: '霧中之鳥,千元紙鈔代言' },
  { id: 'magpie',   name: '台灣藍鵲',     icon: '🐦', desc: '長尾國寶,團隊行動之鳥' },
  { id: 'pangolin', name: '穿山甲',       icon: '🦔', desc: '鱗甲護身,夜晚的工程師' },
  { id: 'deer',     name: '山羌',         icon: '🦌', desc: '小巧山林獸,叫聲如犬' },
  { id: 'macaque',  name: '台灣獼猴',     icon: '🐵', desc: '群居靈長,聰穎山中靈' }
];

const STAGE_NAMES = ['靈卵', '幼獸', '成獸', '守護神獸'];
const STAGE_THRESHOLDS = [0, 15, 50, 150]; // 累積積分達到此值時進化

/* 圖片檔名用的階段代號,對應 assets/pets/{物種}-{階段}.png */
const STAGE_KEYS = ['egg', 'baby', 'adult', 'guardian'];

const STAGE_ICONS = {
  bear:     ['🥚', '🐻', '🐻', '🐻'],
  cat:      ['🥚', '🐱', '🐱', '🐱'],
  salmon:   ['🥚', '🐟', '🐟', '🐟'],
  pheasant: ['🥚', '🐣', '🦃', '🦃'],
  magpie:   ['🥚', '🐤', '🐦', '🐦'],
  pangolin: ['🥚', '🦔', '🦔', '🦔'],
  deer:     ['🥚', '🦌', '🦌', '🦌'],
  macaque:  ['🥚', '🐒', '🐵', '🐵']
};

const DEFAULT_RULES = [
  { name: '上課專心', points: 1 },
  { name: '舉手發言', points: 2 },
  { name: '完成作業', points: 2 },
  { name: '主動幫助同學', points: 3 },
  { name: '閱讀心得分享', points: 5 },
  { name: '小組合作優異', points: 3 },
  { name: '生活常規良好', points: 1 },
  { name: '違反班規', points: -2 }
];

/* 蜂巢戰紀每週結算的預設值。
   放在這裡而不是 territory/07-weekly.js —— 因為 02-state.js 在「載入時」
   就要用它當預設值,而那個檔案載入得比 territory 早很多。
   (同樣的坑踩過一次:常數定義在後面的檔案,開啟就 ReferenceError。) */
const TERRITORY_WEEKLY_DEFAULTS = {
  enabled: false,        // 預設關閉,由老師決定什麼時候開始
  prizes: [5, 3, 1]      // 第一、二、三名
};

/* ============================================
   蜂巢戰紀地圖的配色
   ────────────────────────────────────────────
   「自然地形」路線:藍海、綠地、灰霧。

   挑這一組不只是為了好看 —— 這三者的**明度差最大**,所以
   投影機色偏、或是從教室後排看,還是分得出哪裡是海、哪裡是空地、
   哪裡還沒開放。暖土色那一組在投影下會糊成一片。

   放在常數檔是因為 territory/04-map-view.js 用得到,
   而那支檔案載入得比較晚 —— 常數一律放最早載入的這裡。
============================================ */
const TERRITORY_ART = {
  sea:      '#2f6f8f',   // 地圖外的海
  seaDeep:  '#1d4c66',
  land:     '#cbd98b',   // 已開放、沒人佔的陸地
  landAlt:  '#b9cd79',   // 同色系深一階,交錯用,地表才不會像一片塑膠
  landLock: '#8d9a6d',   // 未開放的陸地(褪色,不是黑色)
  fog:      'rgba(26,36,30,0.5)',
  fogLine:  'rgba(255,255,255,0.5)',
  hill:     'rgba(60,90,50,0.35)',
  grid:     'rgba(60,80,45,0.2)',
  outline:  2.4          // 領地輪廓的粗細
};


/* ============================================
   改名卡
   ────────────────────────────────────────────
   學生兌換之後可以幫守護獸改一次名字。

   id 寫死是刻意的:結算的時候要認得出「這一件是改名卡」才能發放
   改名次數,而一般獎品的 id 是帶時間戳產生的。
   技能果實也是同一個做法(SKILL_FRUIT_PREFIX)。
============================================ */
const RENAME_CARD_ID = 'special_rename';

const RENAME_CARD = {
  id: RENAME_CARD_ID,
  name: '守護獸改名卡',
  icon: '✎',
  price: 20,
  description: '幫自己的守護獸換一個名字,兌換成功後在守護獸頁面改'
};

/* 守護獸的名字長度上限。
   太長的話排行榜、投影模式、報表的版面都會被撐開 —— 而那是全班一起看的。 */
const PET_NAME_MAX = 8;

/* 出席分。本來寫死 +1、遲到不給 ——
   但每個班的規矩不一樣(有的班出席 2 分、有的遲到也給 1 分鼓勵他來),
   所以改成老師自己設。0 分就是不發(按鈕會跟著收起來)。 */
const ATTENDANCE_AWARD_DEFAULTS = { present: 1, late: 0 };
