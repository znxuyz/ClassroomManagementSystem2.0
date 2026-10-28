/* ============================================
   加分紀錄:撤銷與調整
   ────────────────────────────────────────────
   這一塊會直接改學生的分數,所以每一條路徑都要對得起來:
   撤銷正分要連累積經驗一起退(守護獸可能退階)、撤銷扣分只還可用積分、
   調整是「換掉那一筆」而不是「再加一筆」、而且撤銷之後那一筆要真的
   從明細裡消失(家長報表看的就是那份明細)。
============================================ */
import { loadPlaywright, openApp, prepare, report } from './lib.mjs';

const chromium = await loadPlaywright();
const { page, errors, close } = await openApp(chromium);
await prepare(page);

const lines = [];
const ok = (n, c, e) => lines.push((c ? '✓ ' : '✗ ') + n + (e ? ' — ' + e : ''));

const r = await page.evaluate(() => {
  const out = {};
  __apply(__fixture({ students: 4, historyPer: 0, questions: 4 }));
  window.confirm = () => true;

  const s = state.students[0];
  s.totalPoints = 100; s.currentPoints = 100; s.history = [];
  state.selectedStudentId = s.id;

  // ── 撤銷一筆正分 ──
  applyPointsToStudent(s.id, 5, '上課發言');
  const t1 = s.history[s.history.length - 1].time;
  out.afterAward = [s.totalPoints, s.currentPoints, s.history.length];
  AwardLog.undo(s.id, t1);
  out.afterUndo = [s.totalPoints, s.currentPoints, s.history.length];

  // ── 撤銷一筆扣分:只還可用積分,累積經驗本來就沒動 ──
  applyPointsToStudent(s.id, -3, '未帶課本');
  const t2 = s.history[s.history.length - 1].time;
  out.afterMinus = [s.totalPoints, s.currentPoints];
  AwardLog.undo(s.id, t2);
  out.afterUndoMinus = [s.totalPoints, s.currentPoints, s.history.length];

  // ── 調整:換掉那一筆,不是再加一筆 ──
  applyPointsToStudent(s.id, 1, '打錯了');
  const t3 = s.history[s.history.length - 1].time;
  window.prompt = (q, d) => (String(q).indexOf('幾分') >= 0 ? '4' : '幫助同學');
  AwardLog.adjust(s.id, t3);
  out.afterAdjust = [s.totalPoints, s.currentPoints, s.history.length];
  const last = s.history[s.history.length - 1];
  out.adjusted = [last.points, last.reason, !!last.editedAt];

  // 取消(按 prompt 的取消)不該動到任何東西
  window.prompt = () => null;
  AwardLog.adjust(s.id, t3);
  out.afterCancel = [s.totalPoints, s.currentPoints, s.history.length];

  // ── 撤銷正分會讓守護獸退階 ──
  const th = STAGE_THRESHOLDS[1];
  s.totalPoints = th - 1; s.currentPoints = 50; s.history = [];
  applyPointsToStudent(s.id, 10, '衝到下一階');
  out.stageUp = PetEngine.getStage(s.totalPoints);
  AwardLog.undo(s.id, s.history[s.history.length - 1].time);
  out.stageBack = PetEngine.getStage(s.totalPoints);

  // ── 已經不存在的那一筆,按了不會爆 ──
  let threw = false;
  try { AwardLog.undo(s.id, 1); } catch (e) { threw = true; }
  out.ghostSafe = !threw;

  // ── 畫面:全班模式會列出別人的 ──
  s.history = [{ time: Date.now() - 1000, points: 1, reason: '自己這一筆' }];
  state.students[1].history = [{ time: Date.now(), points: 2, reason: '幫忙搬東西' }];
  AwardLog.setScope('class');
  const box = document.getElementById('awardLogPanel');
  out.rows = box.querySelectorAll('.award-log-row').length;
  out.showsOther = box.textContent.indexOf(state.students[1].name) >= 0;
  AwardLog.setScope('student');
  out.onlyMine = box.textContent.indexOf(state.students[1].name) < 0;

  // ── 原因有轉義(學生姓名與原因都是老師自己打的,但還是不能生 HTML)──
  s.history = [{ time: Date.now(), points: 1, reason: '<img src=x onerror=alert(1)>' }];
  AwardLog.render();
  out.escaped = box.querySelectorAll('img').length === 0;

  // ── 沒選人就整塊收起來 ──
  state.selectedStudentId = null;
  AwardLog.render();
  out.hidden = box.style.display === 'none';

  return out;
});

ok('加分之後紀錄裡有那一筆',
   JSON.stringify(r.afterAward) === JSON.stringify([105, 105, 1]), JSON.stringify(r.afterAward));
ok('撤銷正分會把累積經驗與可用積分都退回去',
   JSON.stringify(r.afterUndo) === JSON.stringify([100, 100, 0]), JSON.stringify(r.afterUndo));
ok('扣分只扣可用積分',
   JSON.stringify(r.afterMinus) === JSON.stringify([100, 97]), JSON.stringify(r.afterMinus));
ok('撤銷扣分只還可用積分',
   JSON.stringify(r.afterUndoMinus) === JSON.stringify([100, 100, 0]),
   JSON.stringify(r.afterUndoMinus));
ok('調整是換掉那一筆,不是再加一筆',
   JSON.stringify(r.afterAdjust) === JSON.stringify([104, 104, 1]), JSON.stringify(r.afterAdjust));
ok('調整後分數、原因都換了,而且留下改過的痕跡',
   r.adjusted[0] === 4 && r.adjusted[1] === '幫助同學' && r.adjusted[2] === true,
   JSON.stringify(r.adjusted));
ok('按取消不會動到任何東西',
   JSON.stringify(r.afterCancel) === JSON.stringify([104, 104, 1]), JSON.stringify(r.afterCancel));
ok('撤銷正分會讓守護獸退回上一階段',
   r.stageUp === 1 && r.stageBack === 0, `${r.stageUp} → ${r.stageBack}`);
ok('撤銷已經不存在的那一筆不會爆', r.ghostSafe);
ok('全班模式列得出別人的紀錄', r.rows >= 2 && r.showsOther, r.rows + ' 筆');
ok('只看這一位時不會混進別人的', r.onlyMine);
ok('原因有轉義,不會生出 HTML', r.escaped);
ok('沒選人的時候整塊收起來', r.hidden);

await close();
process.exit(report('加分紀錄與調整', lines, errors) ? 0 : 1);
