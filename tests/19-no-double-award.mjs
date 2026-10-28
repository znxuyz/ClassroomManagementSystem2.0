/* ============================================
   重複點擊不會重複加分
   ────────────────────────────────────────────
   「作業繳交」和「出席分」這兩個地方,以前按兩次就加兩次:

     · 出席分那顆按鈕完全沒有防線,按幾次加幾次
     · 作業的「發過分了沒」記在繳交標記裡,標記一改就跟著不見,
       所以「繳交 → 遲交 → 繳交」、「清空 → 重新標繳交」都會再發一次

   這一套就是釘住這件事。每一條都從老師真的會按的順序走一遍,
   然後看分數與歷程筆數對不對。
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
  const reset = () => { s.totalPoints = 100; s.currentPoints = 100; s.history = []; };
  const snap = () => [s.totalPoints, s.currentPoints, s.history.length];

  // ── 出席分 ──
  const today = state.currentAttendanceDate;
  state.attendance[today] = {};
  state.students.forEach(x => { state.attendance[today][x.id] = 'present'; });
  reset();
  awardAttendancePoints();
  out.att1 = snap();
  awardAttendancePoints();
  awardAttendancePoints();
  out.att3 = snap();

  // 換一天就該照發(不是整顆按鈕鎖死)
  state.currentAttendanceDate = '2026-01-05';
  state.attendance['2026-01-05'] = { [s.id]: 'present' };
  awardAttendancePoints();
  out.attOtherDay = snap();

  // 後來才到的學生,再按一次要補發給他、而且只給他
  const late = state.students[1];
  late.history = [];
  state.attendance['2026-01-05'][late.id] = 'present';
  awardAttendancePoints();
  out.attTopUp = [snap(), late.history.length];
  state.currentAttendanceDate = today;

  // ── 作業 ──
  state.homework = [{ id: 'h1', name: '數學習作', submissionPoints: 4, submissions: {} }];
  const hw = state.homework[0];
  reset();

  // 連按兩次「繳交」= 標記 → 取消,分數要回到原點,歷程也不留痕跡
  markHomework('h1', s.id, 'submitted');
  out.hw1 = snap();
  markHomework('h1', s.id, 'submitted');
  out.hwCancel = snap();

  // 繳交 → 遲交 → 繳交:同一份作業只能領一次
  reset();
  markHomework('h1', s.id, 'submitted');
  markHomework('h1', s.id, 'late');
  markHomework('h1', s.id, 'submitted');
  out.hwFlip = snap();

  // 清空全部標記之後再標一次繳交,也不會再領一次
  bulkMarkHomework('h1', '');
  markHomework('h1', s.id, 'submitted');
  out.hwAfterClear = snap();

  // 批次「全部標繳交」按兩次,全班也只領一次
  state.homework = [{ id: 'h2', name: '國語甲本', submissionPoints: 2, submissions: {} }];
  state.students.forEach(x => { x.totalPoints = 100; x.currentPoints = 100; x.history = []; });
  bulkMarkHomework('h2', 'submitted');
  bulkMarkHomework('h2', 'submitted');
  out.hwBulk = state.students.map(x => x.history.length);

  // 舊資料(發過分的紀錄還記在 submissions.awarded 裡)也不能再領一次
  state.homework = [{ id: 'h3', name: '舊的作業', submissionPoints: 3,
    submissions: { [s.id]: { status: 'submitted', awarded: true } } }];
  reset();
  markHomework('h3', s.id, 'late');
  markHomework('h3', s.id, 'submitted');
  out.hwLegacy = snap();

  // 收回時退的是當初發的那個數字,不是老師後來改成的新分數
  state.homework = [{ id: 'h4', name: '改過分數的作業', submissionPoints: 4, submissions: {} }];
  reset();
  markHomework('h4', s.id, 'submitted');
  state.homework[0].submissionPoints = 9;          // 老師事後把分數改大
  markHomework('h4', s.id, 'submitted');           // 取消標記
  out.hwRepriced = snap();

  return out;
});

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

ok('出席分發一次是 +1', eq(r.att1, [101, 101, 1]), JSON.stringify(r.att1));
ok('同一天再按兩次不會重複加', eq(r.att3, [101, 101, 1]), JSON.stringify(r.att3));
ok('換一天照樣發得出去', eq(r.attOtherDay, [102, 102, 2]), JSON.stringify(r.attOtherDay));
ok('晚到的學生再按一次會補發,已發過的不會再加',
   eq(r.attTopUp, [[102, 102, 2], 1]), JSON.stringify(r.attTopUp));

ok('標記繳交會加分', eq(r.hw1, [104, 104, 1]), JSON.stringify(r.hw1));
ok('再點一次取消,分數與歷程都乾淨退回', eq(r.hwCancel, [100, 100, 0]), JSON.stringify(r.hwCancel));
ok('繳交→遲交→繳交 只領一次', eq(r.hwFlip, [104, 104, 1]), JSON.stringify(r.hwFlip));
ok('清空標記後重新標繳交,不會再領一次',
   eq(r.hwAfterClear, [104, 104, 1]), JSON.stringify(r.hwAfterClear));
ok('批次全部標繳交按兩次,每個人也只有一筆',
   r.hwBulk.every(n => n === 1), JSON.stringify(r.hwBulk));
ok('舊資料已經領過的,改標記也不會再領',
   eq(r.hwLegacy, [100, 100, 0]), JSON.stringify(r.hwLegacy));
ok('取消標記退的是當初發的分數,不是後來改的',
   eq(r.hwRepriced, [100, 100, 0]), JSON.stringify(r.hwRepriced));

await close();
process.exit(report('重複點擊不會重複加分', lines, errors) ? 0 : 1);
