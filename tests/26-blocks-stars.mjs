/* ============================================
   積木挑戰:關卡、星星、提示
   ────────────────────────────────────────────
   釘住的是「這一層會不會讓孩子卡死或洩題」:

   · 第一關永遠開著,後面的關要前一關拿到星星才開
     —— 中間卡住一題就整條路斷掉的話,孩子只能乾等
   · 老師可以把某一題設成「隨時可挑戰」,跳過那條鎖
   · 三顆星的規則學生端與老師端算出來要一樣
     (不一樣的話,畫面說三顆、紀錄上卻兩顆,孩子會覺得被坑)
   · 換提示會少一顆星,但**不影響分數**
   · 考卷裡只有「幾塊積木以內」這個數字,沒有老師的積木
============================================ */
import { loadPlaywright, openApp, prepare, report } from './lib.mjs';

const chromium = await loadPlaywright();
const { page, errors, close } = await openApp(chromium, { width: 1280, height: 900 });
await prepare(page);

const lines = [];
const ok = (n, c, e) => lines.push((c ? '✓ ' : '✗ ') + n + (e ? ' — ' + e : ''));

const r = await page.evaluate(async () => {
  const out = {};
  const N = v => v;
  const V = n => ({ t: 'var', name: n });
  window.__apply(window.__fixture({ students: 6, historyPer: 2, questions: 4 }));

  const cloud = { published: null, work: {} };
  Cloud.publishBlockTasks = async (c, p) => { cloud.published = p; };
  Cloud.watchBlockWork = () => () => {};

  /* 三關:計步器 → 骰子 → 自由題(隨時可挑戰) */
  const pedo = [
    { t: 'on_start', body: [{ t: 'set_var', name: 's', v: 0 },
                            { t: 'show_number', v: V('s') }] },
    { t: 'on_gesture', g: '搖動', body: [{ t: 'change_var', name: 's', v: 1 },
                                         { t: 'show_number', v: V('s') }] }
  ];
  state.blockTasks = [
    { id: 't1', name: '計步器', spec: '搖一下加一', points: 5, status: 'open',
      solution: pedo, hints: ['搖動的時候要讓步數變多'] },
    { id: 't2', name: '骰子', spec: '搖一搖出數字', points: 5, status: 'open',
      solution: [{ t: 'on_gesture', g: '搖動',
                   body: [{ t: 'show_number', v: { t: 'random', from: 1, to: 6 } }] }] },
    { id: 't3', name: '自由題', spec: '隨便做', points: 3, status: 'open', free: true,
      solution: [{ t: 'on_start', body: [{ t: 'show_icon', icon: '愛心' }] }] }
  ];

  // ── 考卷:有星星門檻與提示,沒有解答 ──
  await BlockTasks.publish();
  const papers = cloud.published.tasks;
  out.paper = {
    limit: papers[0].starLimitPublic,
    hasHint: (papers[0].hints || []).length === 1,
    noSolution: !JSON.stringify(papers).includes('change_var'),
    free: papers[2].free === true
  };

  // ── 星星的算法 ──
  const t1 = state.blockTasks[0];
  out.limitDefault = starBlockLimit(t1);              // 解答 8 塊 + 2
  out.stars = [
    starsFor(t1, pedo, { pass: false, hintsUsed: 0 }),                 // 沒過 = 0
    starsFor(t1, pedo, { pass: true, hintsUsed: 1 }),                  // 用了提示 = 1
    starsFor(t1, pedo, { pass: true, hintsUsed: 0 }),                  // 乾淨過關 = 3(夠精簡)
  ];
  // 塞一堆沒用的積木 → 第三顆星拿不到
  const fat = JSON.parse(JSON.stringify(pedo));
  for (let i = 0; i < 6; i++) fat[0].body.push({ t: 'clear' });
  out.fatStars = starsFor(t1, fat, { pass: true, hintsUsed: 0 });
  // 老師自己設上限
  t1.starLimit = 4;
  out.tightStars = starsFor(t1, pedo, { pass: true, hintsUsed: 0 });
  t1.starLimit = 0;

  // ── 解鎖 ──
  const starsOf = {};
  const get = id => starsOf[id] || 0;
  out.lock0 = taskUnlocked(state.blockTasks, 0, get);   // 第一關永遠開
  out.lock1 = taskUnlocked(state.blockTasks, 1, get);   // 還沒過第一關 → 鎖
  out.lock2free = taskUnlocked(state.blockTasks, 2, get); // 隨時可挑戰 → 開
  starsOf.t1 = 1;
  out.lock1after = taskUnlocked(state.blockTasks, 1, get);

  // ── 學生端:地圖畫得出來、鎖住的點不開 ──
  StudentApp.classInfo = { classId: 'C1', className: '601', studentId: 's0', name: '學生0' };
  StudentApp.student = state.students[0];
  StudentApp.blockTasks = papers;
  StudentApp.myBlockWork = {};
  StudentApp.tab = 'blocks';
  StudentApp.bkTask = null;
  const html = StudentApp.renderBlocksTab();
  document.getElementById('studentView').innerHTML = html;
  out.nodes = document.querySelectorAll('.bk-node').length;
  out.locked = document.querySelectorAll('.bk-node.is-locked').length;
  out.hereIsFirst = !!document.querySelectorAll('.bk-node')[0].classList.contains('is-here');
  StudentApp.bkOpen('t2');
  out.cantOpenLocked = StudentApp.bkTask === null;

  // 過了第一關之後第二關就開了
  StudentApp.myBlockWork = { t1: { program: pedo, stars: 2, at: 1 } };
  document.getElementById('studentView').innerHTML = StudentApp.renderBlocksTab();
  out.lockedAfter = document.querySelectorAll('.bk-node.is-locked').length;

  // ── 提示:換一條少一顆星 ──
  StudentApp.bkTask = papers[0];
  StudentApp.bkHints = 0;
  StudentApp.bkUseHint();
  out.hintUsed = StudentApp.bkHints;
  BlockEditor.mount(document.createElement('div'), { program: pedo });
  StudentApp.bkCheck();
  out.afterHint = StudentApp.bkResult.stars;

  StudentApp.bkHints = 0;
  StudentApp.bkCheck();
  out.clean = StudentApp.bkResult.stars;

  // ── 老師端重算:星星進紀錄,分數照舊只給一次 ──
  const before = state.students[0].totalPoints;
  BlockWork.all = [{ uid: 'U0', studentId: 's0', name: '學生0',
    work: { t1: { program: pedo, at: 1, hintsUsed: 1, stars: 3 } } }];   // 學生謊報 3 顆
  BlockWork.settle();
  out.awarded = state.students[0].totalPoints - before;
  out.recorded = (state.blockTasks[0].stars || {})['s0'];
  out.totalStars = BlockWork.starsOf('s0');

  return out;
});

ok('考卷帶了三顆星的積木數門檻', r.paper.limit > 0, r.paper.limit + ' 塊');
ok('考卷帶了提示', r.paper.hasHint);
ok('考卷裡沒有老師的解答', r.paper.noSolution);
ok('「隨時可挑戰」會跟著發下去', r.paper.free);

ok('三顆星的預設門檻是「解答 + 2 塊」', r.limitDefault === 10, r.limitDefault + ' 塊');
ok('沒過 0 顆、用提示 1 顆、乾淨過關 3 顆',
   JSON.stringify(r.stars) === JSON.stringify([0, 1, 3]), JSON.stringify(r.stars));
ok('塞一堆沒用的積木拿不到第三顆星', r.fatStars === 2, r.fatStars + ' 顆');
ok('老師可以自己把門檻訂更嚴', r.tightStars === 2, r.tightStars + ' 顆');

ok('第一關永遠開著', r.lock0 === true);
ok('還沒過第一關,第二關是鎖的', r.lock1 === false);
ok('設成「隨時可挑戰」的那一關不受鎖', r.lock2free === true);
ok('過了第一關,第二關就開了', r.lock1after === true);

ok('地圖上每一關都畫得出來', r.nodes === 3, r.nodes + ' 關');
ok('鎖住的關看得到但點不開', r.locked === 1 && r.cantOpenLocked);
ok('守護獸站在現在該挑戰的那一關', r.hereIsFirst);
ok('過關之後鎖就解開', r.lockedAfter === 0);

ok('換一條提示會記下來', r.hintUsed === 1);
ok('用了提示只有一顆星', r.afterHint === 1, r.afterHint + ' 顆');
ok('沒用提示而且夠精簡就是三顆星', r.clean === 3, r.clean + ' 顆');

ok('老師端照常發分', r.awarded === 5, r.awarded + ' 分');
ok('星星由老師端重算 —— 學生謊報三顆也只記一顆',
   r.recorded === 1, r.recorded + ' 顆');
ok('算得出一位學生總共幾顆星', r.totalStars === 1, r.totalStars + ' 顆');

await close();
process.exit(report('積木挑戰:關卡與星星', lines, errors) ? 0 : 1);
