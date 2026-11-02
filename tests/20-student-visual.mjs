/* ============================================
   學生端的畫面:階段階梯、積分紀錄分組、排行榜下半段
   ────────────────────────────────────────────
   這三塊都是「把已經有的資料講清楚」,不是新資料:

     · 守護獸只寫一行「成獸」,看不出那是第幾階、後面還有沒有
     · 同一天的八筆各自重複一次日期,像一張報表
     · 排行榜只有前三名和自己,中間空一大片,而「我前面那幾個是誰」
       正是孩子最想看的

   會壞的地方是邊界:只有一筆紀錄、自己是第一名、自己掉到第 10 名之外、
   全班不到四個人。這一套就是盯那些。
============================================ */
import { loadPlaywright, openApp, prepare, report } from './lib.mjs';

const chromium = await loadPlaywright();
const { page, errors, close } = await openApp(chromium, { width: 390, height: 844 });
await prepare(page);

const lines = [];
const ok = (n, c, e) => lines.push((c ? '✓ ' : '✗ ') + n + (e ? ' — ' + e : ''));

const r = await page.evaluate(async () => {
  const out = {};
  __apply(__fixture({ students: 12, historyPer: 0, questions: 4 }));

  const day = 86400000;
  const me = state.students[0];
  me.history = [
    { time: Date.now() - 3 * day, points: 1, reason: '上課發言' },
    { time: Date.now() - day,     points: 2, reason: '幫助同學' },
    { time: Date.now() - day,     points: -1, reason: '忘記帶課本' },
    { time: Date.now() - 1000,    points: 1, reason: '作業準時' },
    { time: Date.now() - 500,     points: 2, reason: '閱讀心得分享' }
  ];
  await Roster.flush(true);
  window.__myStudentId = me.id;
  await StudentApp.enter({ classId: 'C1', className: '601',
                           studentId: me.id, name: me.name, seatNumber: '7' });

  // ── 守護獸:四階階梯 ──
  StudentApp.setTab('pet');
  const steps = document.querySelectorAll('.pet-ladder-step');
  out.ladderCount = steps.length;
  out.ladderNames = [...steps].map(s => s.querySelector('.pet-ladder-name').textContent.trim());
  const nowIdx = [...steps].findIndex(s => s.classList.contains('now'));
  out.ladderNow = [nowIdx, PetEngine.getStage(StudentApp.student.totalPoints)];
  out.ladderDone = [...steps].filter(s => s.classList.contains('done')).length;

  // ── 積分紀錄:按日分組 ──
  const heads = [...document.querySelectorAll('.student-history-day')];
  out.days = heads.map(h => h.querySelector('.student-history-date').textContent.trim());
  out.sums = heads.map(h => h.querySelector('.student-history-sum').textContent.trim());
  out.rowCount = document.querySelectorAll('.student-history-row').length;
  // 日期不再重複出現在每一列裡
  out.noPerRowDate = document.querySelectorAll('.student-history-when').length === 0;

  // 只有一筆也不會壞
  StudentApp.student.history = [{ time: Date.now(), points: 1, reason: '只有一筆' }];
  StudentApp.render();
  out.single = [document.querySelectorAll('.student-history-day').length,
                document.querySelectorAll('.student-history-row').length];

  // 完全沒有紀錄
  StudentApp.student.history = [];
  StudentApp.render();
  out.empty = document.querySelectorAll('.student-empty').length > 0;

  // ── 這禮拜拿到幾分 ──
  const WEEK = 7 * 86400000;
  const start = StudentApp.weekStart(Date.now());
  StudentApp.student.history = [
    { time: start - WEEK + 3600000, points: 5, reason: '上禮拜' },
    { time: start + 3600000,        points: 2, reason: '這禮拜一' },
    { time: start + 3600000,        points: -1, reason: '這禮拜一扣分' }
  ];
  StudentApp.setTab('pet');
  const wc = document.querySelector('.week-card');
  out.week = wc ? [wc.querySelector('.week-card-num').textContent.trim(),
                   wc.querySelector('.week-card-trend').textContent.trim(),
                   wc.querySelectorAll('.week-bar-col').length,
                   wc.querySelectorAll('.week-bar-col.today').length] : null;
  // 星期一那一根是這週唯一有分的日子
  const cols = [...document.querySelectorAll('.week-bar-col')];
  out.weekMonBar = cols[0].querySelector('.week-bar').className.includes('pos');

  /* 被扣分的那天要往**下**長。只靠顏色不行 —— 綠配紅在紅綠色弱的
     眼睛裡幾乎是同一個顏色(實測分離度 6.6,安全線 8)。 */
  StudentApp.student.history = [
    { time: start + 3600000, points: 4, reason: '週一' },
    { time: start + 86400000 + 3600000, points: -3, reason: '週二扣分' }
  ];
  StudentApp.render();
  const slot = document.querySelectorAll('.week-bar-slot')[1];
  const zr = slot.querySelector('.week-zero').getBoundingClientRect();
  const nb = slot.querySelector('.week-bar');
  const pb = document.querySelectorAll('.week-bar-slot')[0].querySelector('.week-bar');
  out.weekSigned = [
    nb.className.includes('neg'),
    nb.getBoundingClientRect().top >= zr.top - 1,          // 扣分的在零線下
    pb.getBoundingClientRect().bottom <= zr.bottom + 1,    // 加分的在零線上
    [...document.querySelectorAll('.week-bar')].every(b => {
      const r = b.getBoundingClientRect();
      const s2 = b.parentElement.getBoundingClientRect();
      return r.top >= s2.top - 1 && r.bottom <= s2.bottom + 1;   // 沒有超出框
    })
  ];

  // 全部都是加分時,零線就在底部,不該有往下長的柱子
  StudentApp.student.history = [{ time: start + 3600000, points: 4, reason: '週一' }];
  StudentApp.render();
  const s0 = document.querySelectorAll('.week-bar-slot')[0];
  out.weekAllPos = [
    document.querySelectorAll('.week-bar.neg').length,
    Math.abs(s0.querySelector('.week-zero').getBoundingClientRect().bottom
             - s0.getBoundingClientRect().bottom) < 2
  ];
  // 一週從星期一算起
  out.weekStartsMonday = new Date(start).getDay() === 1;
  // 完全沒有紀錄也不會壞
  StudentApp.student.history = [];
  StudentApp.render();
  const wc2 = document.querySelector('.week-card');
  out.weekEmpty = [wc2.querySelector('.week-card-num').textContent.trim(),
                   wc2.querySelector('.week-card-trend').textContent.trim()];

  // ── 整頁的空狀態 ──
  StudentApp.quizzes = [];
  StudentApp.setTab('quiz');
  const pe = document.querySelector('.student-empty.is-page');
  out.pageEmpty = !!pe && !!pe.querySelector('.student-empty-icon')
    && !!pe.querySelector('.student-empty-hint');

  // ── 排行榜:第 4 名之後 ──
  StudentApp.setTab('rank');
  const rows = [...document.querySelectorAll('.rank-row')];
  out.restFrom = rows.length ? rows[0].querySelector('.rank-row-no').textContent.trim() : '';
  out.restTo = rows.length ? rows[rows.length - 1].querySelector('.rank-row-no').textContent.trim() : '';
  out.gapShown = rows.some(x => x.querySelector('.rank-row-gap'));

  // 自己是第一名時,榜單裡不該有人被標成「我」
  out.meNotInRest = rows.filter(x => x.classList.contains('is-me')).length === 0;

  // 自己掉到第 10 名之外:要補一列自己,而且看得到和前一位差幾分
  state.students.forEach((s, i) => { s.totalPoints = 100 - i * 2; });
  me.totalPoints = 1;
  await Roster.flush(true);
  await StudentApp.refresh();
  StudentApp.setTab('rank');
  const rows2 = [...document.querySelectorAll('.rank-row')];
  const mine = rows2.filter(x => x.classList.contains('is-me'));
  out.outsideTop10 = [mine.length,
                      mine.length ? mine[0].querySelector('.rank-row-no').textContent.trim() : '',
                      document.querySelectorAll('.rank-row-break').length];

  // 全班只有三個人:沒有第 4 名,就不該留一塊空的框
  state.students = state.students.slice(0, 3);
  await Roster.flush(true);
  await StudentApp.refresh();
  StudentApp.setTab('rank');
  out.tinyClass = document.querySelectorAll('.rank-list').length;

  return out;
});

ok('守護獸有四階的階梯', r.ladderCount === 4, r.ladderCount + ' 階');
ok('階梯寫的是真正的階段名稱',
   JSON.stringify(r.ladderNames) === JSON.stringify(['靈卵', '幼獸', '成獸', '守護神獸']),
   r.ladderNames.join('、'));
ok('現在那一階標在對的位置', r.ladderNow[0] === r.ladderNow[1], r.ladderNow.join(' vs '));
ok('走過的階段都填實了', r.ladderDone === r.ladderNow[1], r.ladderDone + ' 個');

ok('積分紀錄按日分組',
   JSON.stringify(r.days) === JSON.stringify(['今天', '昨天', '10 月 30 日'])
   || (r.days.length === 3 && r.days[0] === '今天' && r.days[1] === '昨天'),
   r.days.join(' / '));
ok('每一天右邊寫那一天的淨得分',
   JSON.stringify(r.sums) === JSON.stringify(['+3', '+1', '+1']), r.sums.join(' / '));
ok('每一筆都還在', r.rowCount === 5, r.rowCount + ' 筆');
ok('日期不再重複寫在每一列', r.noPerRowDate);
ok('只有一筆也不會壞', JSON.stringify(r.single) === JSON.stringify([1, 1]),
   JSON.stringify(r.single));
ok('完全沒有紀錄時有提示', r.empty);

ok('這禮拜的卡片算的是本週淨得分',
   r.week && r.week[0] === '+1', r.week && r.week[0]);
ok('會和上禮拜比', r.week && r.week[1] === '比上禮拜少 4 分', r.week && r.week[1]);
ok('七天各一根柱子,今天標起來',
   r.week && r.week[2] === 7 && r.week[3] === 1, JSON.stringify(r.week && r.week.slice(2)));
ok('一週從星期一算起', r.weekStartsMonday);
ok('有得分的那一天柱子是正的顏色', r.weekMonBar);
ok('被扣分的那天往下長(不是只有顏色不一樣)',
   r.weekSigned && r.weekSigned.every(Boolean), JSON.stringify(r.weekSigned));
ok('全部都是加分時,零線在底部、沒有往下的柱子',
   r.weekAllPos && r.weekAllPos[0] === 0 && r.weekAllPos[1] === true,
   JSON.stringify(r.weekAllPos));
ok('完全沒有紀錄時不會壞',
   r.weekEmpty && r.weekEmpty[0] === '0' && r.weekEmpty[1] === '這禮拜還沒有紀錄',
   JSON.stringify(r.weekEmpty));

ok('沒有測驗時是一整塊有圖示與說明的空狀態,不是一行灰字', r.pageEmpty);

ok('排行榜從第 4 名開始列', r.restFrom === '4', '從第 ' + r.restFrom + ' 名');
ok('列到第 10 名', r.restTo === '10', '到第 ' + r.restTo + ' 名');
ok('看得到和前一位差幾分', r.gapShown);
ok('自己在前三名時,下面不會再標一次自己', r.meNotInRest);
ok('自己掉到第 10 名之外會補一列自己(虛線斷開)',
   r.outsideTop10[0] === 1 && r.outsideTop10[1] === '12' && r.outsideTop10[2] === 1,
   JSON.stringify(r.outsideTop10));
ok('全班只有三個人時不會留一塊空框', r.tinyClass === 0);

await close();
process.exit(report('學生端畫面', lines, errors) ? 0 : 1);
