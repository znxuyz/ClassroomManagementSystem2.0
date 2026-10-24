/* 公開名冊 / 個人私有資料
   最重要的一條:同學之間不可以看到彼此的加分明細(含扣分原因)、
   測驗成績、可用積分與 Google 帳號。 */
import { loadPlaywright, openApp, prepare, okSrc, report } from './lib.mjs';

const chromium = await loadPlaywright();
const { page, errors, close } = await openApp(chromium, { width: 390, height: 844 });
await page.evaluate(okSrc);
await prepare(page);

const lines = await page.evaluate(async () => {
  const t = window.__mk(), db = window.__db;
  const f = window.__fixture();
  window.__apply(f);
  window.__myStudentId = 's0';
  state.user = { email: 'kid0@school.edu.tw' };

  // ── 老師端寫出名冊 ──
  let w = await Roster.flush(true);
  t.ok('開班時寫出名冊與全部個人資料', w.roster === 1 && w.mine === 28, `${w.roster} / ${w.mine}`);

  const PRIVATE = ['history', 'quizResults', 'currentPoints', 'email', 'inventory'];
  const leaked = PRIVATE.filter(k => db.roster.students.some(s => k in s));
  t.ok('公開名冊不含任何私有欄位', leaked.length === 0, leaked.join(', '));
  t.ok('公開名冊的欄位就是那五個',
    JSON.stringify(Object.keys(db.roster.students[0]).sort()) ===
    JSON.stringify(['id', 'name', 'pet', 'petName', 'totalPoints']),
    Object.keys(db.roster.students[0]).join(','));
  t.ok('公開名冊比主文件小很多', window.__bytes(db.roster) < window.__bytes(db.blob) / 3,
    `${Math.round(window.__bytes(db.blob) / 1024)} KB → ${Math.round(window.__bytes(db.roster) / 1024)} KB`);
  t.ok('私有那份有明細與可用積分',
    db.mine.s0.history.length === 50 && typeof db.mine.s0.currentPoints === 'number');
  t.ok('私有那份不含信箱', !('email' in db.mine.s0));

  // ── 只寫變了的 ──
  w = await Roster.flush();
  t.ok('沒改動時什麼都不寫', w.roster === 0 && w.mine === 0);
  state.students[5].totalPoints += 3;
  state.students[5].history.push({ time: Date.now(), points: 3, reason: '幫助同學' });
  w = await Roster.flush();
  t.ok('一人加分:名冊 1 份 + 個人 1 份', w.roster === 1 && w.mine === 1, `${w.roster} / ${w.mine}`);

  // ── 寫失敗要能自己補回來 ──
  db.fail.saveStudentPrivate = true;
  state.students[7].totalPoints += 1;
  await Roster.flush();
  db.fail.saveStudentPrivate = false;
  w = await Roster.flush();
  t.ok('個人資料寫失敗後,下一次整批重試補上', w.mine === 28, w.mine + ' 份');

  // ── 學生端(名冊模式) ──
  await StudentApp.enter({ classId: 'C1', className: '測試班', studentId: 's0', name: '學生0' });
  t.ok('學生端用的是公開名冊', StudentApp.useRoster === true);
  t.ok('看得到自己的明細', (StudentApp.student.history || []).length === 50);
  t.ok('看得到自己的可用積分', typeof StudentApp.student.currentPoints === 'number');
  t.ok('看得到自己的測驗成績', !!(StudentApp.student.quizResults || {}).q1);
  t.ok('姓名與累積經驗以名冊為準',
    StudentApp.student.name === '學生0' && StudentApp.student.totalPoints === 100);

  const others = StudentApp.allStudents.filter(s => s.id !== 's0');
  t.ok('看不到同學的加分明細', others.every(s => !('history' in s)));
  t.ok('看不到同學的測驗成績', others.every(s => !('quizResults' in s)));
  t.ok('看不到同學的信箱', others.every(s => !('email' in s)));
  t.ok('看不到同學的可用積分', others.every(s => !('currentPoints' in s)));

  t.ok('個人排行榜照樣算得出來', Leaderboard.individual(StudentApp.allStudents).length === 28);
  t.ok('小組排行榜照樣算得出來',
    Leaderboard.groups(StudentApp.allStudents, StudentApp.groups).length === 2);

  // ── 加分後自己的明細會補讀 ──
  state.students[0].totalPoints += 5;
  state.students[0].history.push({ time: Date.now(), points: 5, reason: '新加分' });
  await Roster.flush();
  db.rosterCb(db.roster);
  await new Promise(r => setTimeout(r, 80));
  t.ok('加分後自己的明細也跟著更新',
    (StudentApp.student.history || []).length === 51 && StudentApp.student.totalPoints === 105,
    `${(StudentApp.student.history || []).length} 筆 / ${StudentApp.student.totalPoints} 分`);

  // ── 學號失效時用名冊索引補正 ──
  await StudentApp.enter({ classId: 'C1', className: '測試班', studentId: '不存在的學號', name: '學生0' });
  t.ok('學號失效時用名冊索引補正', StudentApp.classInfo.studentId === 's0');

  // ── 沒有名冊時退回讀主文件 ──
  const keep = db.roster; db.roster = null;
  await StudentApp.enter({ classId: 'C1', className: '測試班', studentId: 's0', name: '學生0' });
  t.ok('沒有名冊時退回讀主文件', StudentApp.useRoster === false);
  t.ok('退回模式照樣看得到自己的明細', (StudentApp.student.history || []).length >= 50);
  t.ok('退回模式排行榜也正常', Leaderboard.individual(StudentApp.allStudents).length === 28);
  db.roster = keep;

  // ── 私有那份讀不到時不要整頁空白 ──
  db.fail.loadMyPrivate = true;
  await StudentApp.enter({ classId: 'C1', className: '測試班', studentId: 's0', name: '學生0' });
  t.ok('私有那份讀不到時,守護獸與排行榜還在',
    !!StudentApp.student && StudentApp.student.name === '學生0'
    && Leaderboard.individual(StudentApp.allStudents).length === 28);
  t.ok('那種情況明細是空的,不是當掉', (StudentApp.student.history || []).length === 0);
  db.fail.loadMyPrivate = false;

  // ── 名冊和主文件都讀不到時(第二步收緊權限後漏掉的班)── 
  db.roster = null;
  db.fail.loadClass = true;
  Cloud.loadClass = async () => { throw Object.assign(new Error('denied'), { code: 'permission-denied' }); };
  await StudentApp.enter({ classId: 'C1', className: '測試班', studentId: 's0', name: '學生0' });
  const txt = document.getElementById('studentView').textContent;
  t.ok('兩邊都讀不到時給看得懂的訊息,不是「找不到班級資料」',
    txt.includes('請老師開一下系統') && !txt.includes('找不到班級資料'),
    txt.trim().slice(0, 30));
  Cloud.loadClass = async () => ({ blob: db.blob });
  db.fail.loadClass = false;
  db.roster = keep;

  // ── 換班 ──
  Roster.reset();
  t.ok('換班時基準清掉了',
    Roster._lastRoster === null && Object.keys(Roster._lastMine).length === 0);

  return t.out;
});

await close();
process.exit(report('公開名冊 / 個人私有資料', lines, errors) ? 0 : 1);
