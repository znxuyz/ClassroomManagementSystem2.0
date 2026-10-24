/* ============================================
   測試共用工具
   ────────────────────────────────────────────
   這個專案沒有打包步驟,index.html 直接用 <script> 載入所有檔案,
   所以測試的做法是:用真的瀏覽器開 index.html,然後在頁面裡面
   直接呼叫那些函式。不需要 import/export、不需要改任何產品程式。

   雲端那一層全部用假的替身(stubCloud)。理由:
   · 不會動到正在上課的那個 Firestore 專案
   · 可以測「寫入失敗」「讀取失敗」這些真實環境裡很難重現的狀況
   · 不用網路,跑完一整套大概十幾秒

   測試資料一律用頁面裡真正的常數產生(DEFAULT_RULES、PET_SPECIES、
   DIFFICULTY…)。曾經有一次稽核「全過」是假的,因為當時的測試資料
   用了不存在的難度代號和不存在的守護獸 —— 那些路徑根本沒被走到。
============================================ */

/* playwright 的位置會因環境而異,所以依序試幾個 */
export async function loadPlaywright() {
  const tries = [
    'playwright',
    '/opt/node22/lib/node_modules/playwright/index.js',
    '/usr/lib/node_modules/playwright/index.js'
  ];
  for (const t of tries) {
    try {
      const m = await import(t);
      return m.chromium || (m.default && m.default.chromium);
    } catch (e) { /* 換下一個 */ }
  }
  throw new Error('找不到 playwright —— 請先 npm i -g playwright,或設好 NODE_PATH');
}

const INDEX = 'file://' + new URL('../index.html', import.meta.url).pathname;

/* 開一個頁面,等到產品程式載完。
   回傳 { page, close, errors } —— errors 會蒐集 console 錯誤與未捕捉例外。
   firebase 的 CDN 在測試環境連不到,那幾個 net:: 錯誤要忽略,
   不然每一套都會「失敗」在和程式無關的地方。 */
export async function openApp(chromium, { width = 1440, height = 900 } = {}) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on('pageerror', e => errors.push('未捕捉例外: ' + e.message));
  page.on('console', m => {
    if (m.type() === 'error' && !m.text().includes('net::')) {
      errors.push('console: ' + m.text());
    }
  });
  await page.goto(INDEX);
  await page.waitForFunction(() => typeof serializeState === 'function'
    && typeof NAV_GROUPS !== 'undefined');
  return { page, errors, close: () => browser.close() };
}

/* ============================================
   在頁面裡面跑的那一段
   ────────────────────────────────────────────
   下面兩個函式的原始碼會被字串化丟進瀏覽器,所以不能參照這個模組裡
   的任何東西 —— 它們在頁面裡是獨立的。
============================================ */

/* 假的雲端。回傳的 db 物件就是「雲端現在的內容」,測試直接檢查它。 */
export const stubCloudSrc = `
window.__db = {
  roster: null, mine: {}, tqbank: {}, archives: {}, blob: null,
  rosterWrites: 0, mineWrites: 0, shardWrites: 0, blobWrites: 0,
  fail: {}                       // 例如 { saveQuestionShards: true } 就讓它丟錯
};
(function () {
  const db = window.__db;
  const boom = name => {
    if (db.fail[name]) throw Object.assign(new Error('stub 故意失敗'), { code: 'unavailable' });
  };
  window.isCloudMode = () => true;

  Cloud.savePublicRoster = async (c, r) => { boom('savePublicRoster');
    db.rosterWrites++; db.roster = JSON.parse(JSON.stringify(r)); };
  Cloud.loadPublicRoster = async () => db.roster;
  Cloud.watchPublicRoster = (c, cb) => { db.rosterCb = cb; cb(db.roster); return () => {}; };

  Cloud.saveStudentPrivate = async (c, d) => { boom('saveStudentPrivate');
    const n = Object.keys(d).length; db.mineWrites += n;
    Object.keys(d).forEach(k => { db.mine[k] = JSON.parse(JSON.stringify(d[k])); });
    return n; };
  Cloud.loadMyPrivate = async (c, sid) => { boom('loadMyPrivate'); return db.mine[sid] || null; };

  Cloud.loadQuestionBank = async () => { boom('loadQuestionBank');
    const out = []; Object.values(db.tqbank).forEach(a => out.push(...a)); return out; };
  Cloud.saveQuestionShards = async (c, shards) => { boom('saveQuestionShards');
    const ks = Object.keys(shards); db.shardWrites += ks.length;
    ks.forEach(k => { db.tqbank[k] = JSON.parse(JSON.stringify(shards[k])); });
    return ks.length; };
  Cloud.publishTerritoryQuestions = async () => {};

  Cloud.archiveHistory = async (c, chunks) => { boom('archiveHistory');
    chunks.forEach(ch => { db.archives[ch.id] = ch; }); return chunks.length; };
  Cloud.loadStudentHistory = async (c, sid) => { boom('loadStudentHistory');
    const out = [];
    Object.values(db.archives).forEach(ch => { if (ch.studentId === sid) out.push(...ch.entries); });
    return out.sort((a, b) => (a.time || 0) - (b.time || 0)); };
  Cloud.loadAllHistory = async () => { boom('loadAllHistory');
    const out = {};
    Object.values(db.archives).forEach(ch => {
      (out[ch.studentId] = out[ch.studentId] || []).push(...ch.entries); });
    Object.values(out).forEach(a => a.sort((x, y) => (x.time || 0) - (y.time || 0)));
    return out; };

  Cloud.loadClass = async () => ({ blob: db.blob });
  Cloud.saveClassBlob = async (c, data) => { boom('saveClassBlob');
    db.blobWrites++; db.blob = JSON.parse(JSON.stringify(data)); };
  Cloud.watchClass = (c, cb) => { db.blobCb = cb; cb({ blob: db.blob }); return () => {}; };

  // 其餘用不到但會被呼叫到的,一律安靜地什麼都不做
  const nop = () => () => {};
  ['watchMyPurchases','watchPurchases','watchSkillGrants','watchSkillUses',
   'watchTerritoryConfig','watchTerritoryQuestions','watchTerritoryEvents',
   'watchTerritoryAttempts','watchTerritoryFails','watchQuizAnswers','watchSubmissions']
    .forEach(k => { Cloud[k] = nop; });
  const nil = async () => null;
  ['getMyPetChoice','getMySubmission','saveDailyBackup','pruneBackups',
   'syncRosterIndex','saveBackup','saveArchive'].forEach(k => { Cloud[k] = nil; });
  Cloud.listQuizzesForStudent = async () => [];
  Cloud.listMyQuizAnswers = async () => ({});
  Cloud.listMySkillUses = async () => [];
  Cloud.listPetChoices = async () => [];
  Cloud.myStudentId = async () => (window.__myStudentId || null);
})();
`;

/* 一份符合實際使用的班級資料。
   students 的欄位、難度代號、守護獸物種都取自頁面裡真正的常數。 */
export const fixtureSrc = `
window.__fixture = function (opt) {
  opt = opt || {};
  const n = opt.students || 28;
  const histPer = opt.historyPer === undefined ? 50 : opt.historyPer;
  const SP = PET_SPECIES.map(p => p.id);
  const DIFF = Object.keys(DIFFICULTY);

  const students = Array.from({ length: n }, (_, i) => ({
    id: 's' + i,
    name: '學生' + i,
    email: 'kid' + i + '@school.edu.tw',
    totalPoints: 100 - i,
    currentPoints: 50 - (i % 20),
    pet: SP[i % SP.length],
    petName: '小獸',
    inventory: [],
    quizResults: { q1: { score: 80 - (i % 30), at: Date.now() - 86400000 } },
    history: Array.from({ length: histPer }, (_, j) => ({
      time: Date.now() - (histPer - j) * 3600000,
      points: j % 7 === 0 ? -2 : 1,
      reason: j % 7 === 0 ? '未帶課本' : ['上課發言', '幫助同學', '作業準時'][j % 3]
    }))
  }));

  const blob = {
    className: '測試班', teacherName: '王老師',
    students: students,
    rules: DEFAULT_RULES,
    attendance: {}, seatingLayouts: [], groupSets: [],
    currentGroups: [students.slice(0, 5).map(s => s.id), students.slice(5, 10).map(s => s.id)],
    contactBook: {}, homework: [], classTasks: [], shopHistory: [],
    shopItems: [{ id: 'i1', name: '獎品', cost: 10 }],
    quizzes: [],
    skills: { ...SKILL_DEFAULTS },
    territoryWeekly: { ...TERRITORY_WEEKLY_DEFAULTS }
  };

  const questions = Array.from({ length: opt.questions === undefined ? 529 : opt.questions },
    (_, i) => ({
      id: 'tq_' + i, text: '題目 ' + i, options: ['甲', '乙', '丙', '丁'],
      answer: i % 4, difficulty: DIFF[i % DIFF.length], createdAt: 1000 + i
    }));

  return { blob: blob, questions: questions };
};

/* 套進 state,並把題庫放好(題庫不在 blob 裡,見 js/03c-question-bank.js) */
window.__apply = function (f) {
  applyBlobToState(JSON.parse(JSON.stringify(f.blob)));
  state.classId = 'C1';
  state.territoryQuestions = JSON.parse(JSON.stringify(f.questions));
  /* 深拷貝:serializeState() 回傳的物件裡 students 等欄位是**同一個陣列**,
     不拷貝的話之後在 state 上做的修改(例如封存把 history 砍短)
     也會同時改到這份「雲端快照」,測試就比較不出差異了。
     真實環境沒這個問題 —— Firestore SDK 收下去的瞬間就序列化了。 */
  window.__db.blob = JSON.parse(JSON.stringify(serializeState()));
};
`;

/* 把上面兩段注入頁面 */
export async function prepare(page) {
  await page.evaluate(stubCloudSrc + fixtureSrc);
}

/* ============================================
   結果輸出
============================================ */
export function report(name, lines, errors) {
  // 行首可能被加了前綴(例如寬度),所以看有沒有勾/叉,而不是看開頭
  const fail = lines.filter(l => l.includes('✗'));
  const pass = lines.filter(l => l.includes('✓') && !l.includes('✗')).length;
  console.log(`\n── ${name} ──`);
  lines.forEach(l => console.log('  ' + l));
  if (errors && errors.length) {
    console.log('  ✗ 頁面有錯誤:');
    errors.forEach(e => console.log('    ' + e));
  }
  const bad = fail.length + ((errors && errors.length) ? 1 : 0);
  console.log(`  → ${pass} 項通過,${bad} 項失敗`);
  return bad === 0;
}

/* 在頁面裡用的小工具:ok(名稱, 條件, 補充說明) */
export const okSrc = `
window.__mk = function () {
  const out = [];
  return {
    out: out,
    ok: function (name, cond, extra) {
      out.push((cond ? '✓ ' : '✗ ') + name + (extra ? ' — ' + extra : ''));
    }
  };
};
window.__bytes = o => new TextEncoder().encode(JSON.stringify(o)).length;
`;
