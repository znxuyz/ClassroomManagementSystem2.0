/* ============================================
   積木挑戰:老師出題 → 學生做 → 老師給分
   ────────────────────────────────────────────
   釘住整條路,而且特別釘住三件會出事的事:

   1. **答案不會跟著題目送到學生那邊。** 發出去的是「考卷」
      (劇本 + 每一步預期的畫面),不含老師的積木 ——
      否則打開開發者工具就看得到答案。
   2. **分數由老師端重判一次才發。** 學生交的是程式本身,不是「我過了」。
   3. **一題一人只給一次分。** 改完再交一次不會再領一次。
============================================ */
import { loadPlaywright, openApp, prepare, report } from './lib.mjs';

const chromium = await loadPlaywright();
const { page, errors, close } = await openApp(chromium, { width: 1280, height: 900 });
await prepare(page);

const lines = [];
const ok = (n, c, e) => lines.push((c ? '✓ ' : '✗ ') + n + (e ? ' — ' + e : ''));

const r = await page.evaluate(async () => {
  const out = {};
  const N = v => ({ t: 'num', v });
  const V = n => ({ t: 'var', name: n });

  window.__apply(window.__fixture({ students: 6, historyPer: 2, questions: 4 }));

  /* 假的雲端:記下發出去的題目與學生交回來的作品 */
  const cloud = { published: null, work: {} };
  Cloud.publishBlockTasks = async (c, payload) => { cloud.published = payload; };
  Cloud.saveBlockWork = async (c, uid, data) => { cloud.work[uid] = data; };
  Cloud.getMyBlockWork = async (c, uid) => cloud.work[uid] || null;
  Cloud.watchBlockWork = (c, cb) => { cloud.workCb = cb; return () => {}; };
  Cloud.watchBlockTasks = (c, cb) => { cloud.taskCb = cb; return () => {}; };
  /* Cloud.uid 是 getter(看 auth 的 currentUser),測試裡直接蓋掉 */
  Object.defineProperty(Cloud, 'uid', { get: () => 'KID0', configurable: true });

  // ── 老師出一題 ──
  state.blockTasks = [{
    id: 'bt1', name: '計步器', spec: '開機歸零、搖一下加一、A+B 歸零', points: 5,
    status: 'open', createdAt: Date.now(),
    solution: [
      { t: 'on_start', body: [{ t: 'set_var', name: '步數', v: N(0) },
                              { t: 'show_number', v: V('步數') }] },
      { t: 'on_gesture', g: '搖動', body: [{ t: 'change_var', name: '步數', v: N(1) },
                                           { t: 'show_number', v: V('步數') }] },
      { t: 'on_button', btn: 'A+B', body: [{ t: 'set_var', name: '步數', v: N(0) },
                                           { t: 'show_number', v: V('步數') }] }
    ]
  }];
  await BlockTasks.publish();

  out.publishedTasks = (cloud.published && cloud.published.tasks || []).length;
  const paper = cloud.published.tasks[0];
  out.hasPaper = !!(paper.script && paper.script.length && paper.expect && paper.expect.length);
  out.noSolution = !('solution' in paper) && !JSON.stringify(paper).includes('change_var');
  out.keepsSpec = paper.spec.includes('搖一下');

  // ── 學生拿到考卷,用**不一樣的拼法**做出來 ──
  const mine = [
    { t: 'on_start', body: [{ t: 'set_var', name: 'n', v: N(0) }] },
    { t: 'forever', body: [{ t: 'show_number', v: V('n') }] },
    { t: 'on_gesture', g: '搖動', body: [{ t: 'change_var', name: 'n', v: N(1) }] },
    { t: 'on_button', btn: 'A+B', body: [{ t: 'set_var', name: 'n', v: N(0) }] }
  ];
  const self = BlockJudge.runCompiled({ script: paper.script, expect: paper.expect }, mine);
  out.studentSelfCheck = self.pass;

  // 交出去
  StudentApp.classInfo = { classId: 'C1', className: '601', studentId: 's0', name: '學生0' };
  StudentApp.blockTasks = cloud.published.tasks;
  StudentApp.myBlockWork = {};
  StudentApp.bkTask = StudentApp.blockTasks[0];
  BlockEditor.mount(document.createElement('div'), { program: mine });
  await StudentApp.bkSubmit();
  out.submitted = !!(cloud.work.KID0 && cloud.work.KID0.work.bt1);
  out.submittedIsProgram = !!(cloud.work.KID0.work.bt1.program || []).length
    && !('pass' in cloud.work.KID0.work.bt1);

  // ── 老師端收到 → 判 → 發分 ──
  const before = state.students[0].totalPoints;
  BlockWork.all = [{ uid: 'KID0', studentId: 's0', name: '學生0',
                     work: cloud.work.KID0.work }];
  BlockWork.settle();
  out.awarded = state.students[0].totalPoints - before;
  out.history = (state.students[0].history || []).slice(-1)[0];

  // 再收一次(學生改完又交)不會再發一次
  BlockWork.settle();
  out.awardedTwice = state.students[0].totalPoints - before;

  // ── 沒做對的不給分 ──
  const wrong = [{ t: 'on_start', body: [{ t: 'show_number', v: N(0) }] }];
  BlockWork.all = [{ uid: 'KID1', studentId: 's1', name: '學生1',
                     work: { bt1: { program: wrong, at: Date.now() } } }];
  const b1 = state.students[1].totalPoints;
  BlockWork.settle();
  out.wrongNoPoints = state.students[1].totalPoints === b1;

  // ── 老師看得到誰交了、誰過了 ──
  BlockWork.all = [
    { uid: 'KID0', studentId: 's0', name: '學生0', work: cloud.work.KID0.work },
    { uid: 'KID1', studentId: 's1', name: '學生1', work: { bt1: { program: wrong, at: 1 } } }
  ];
  out.status = BlockWork.statusOf('bt1');

  // ── 收起來的題目不會發出去 ──
  state.blockTasks[0].status = 'closed';
  BlockTasks._lastPublished = null;
  await BlockTasks.publish();
  out.closedNotPublished = (cloud.published.tasks || []).length === 0;

  return out;
});

ok('開放中的題目會發給學生', r.publishedTasks === 1);
ok('發出去的是「考卷」(劇本 + 每一步預期的畫面)', r.hasPaper);
ok('**參考解答不會跟著送出去**', r.noSolution);
ok('題目敘述會送(學生要看得到要做什麼)', r.keepsSpec);

ok('學生用完全不同的拼法做出同樣功能 → 自己檢查就是過', r.studentSelfCheck);
ok('交出去的是程式本身,不是「我過了」', r.submitted && r.submittedIsProgram);

ok('老師端重判一次,通過才發分', r.awarded === 5, r.awarded + ' 分');
ok('歷程上寫得出是哪一題',
   r.history && String(r.history.reason).includes('計步器'), r.history && r.history.reason);
ok('同一題同一人只發一次分', r.awardedTwice === 5, r.awardedTwice + ' 分');
ok('沒做對的不給分', r.wrongNoPoints);

ok('老師看得到交出幾位、完成幾位',
   r.status.submitted === 2 && r.status.passed === 1, JSON.stringify(r.status));
ok('收起來的題目就不再發出去', r.closedNotPublished);

await close();
process.exit(report('積木挑戰:出題 → 學生 → 給分', lines, errors) ? 0 : 1);
