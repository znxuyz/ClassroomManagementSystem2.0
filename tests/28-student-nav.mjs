/* ============================================
   學生端的兩排分頁
   ────────────────────────────────────────────
   本來是七個平鋪的分頁,390px 的手機上每格只剩五十幾像素。
   改成上排五個大分類,「挑戰」底下再收測驗 / 蜂巢戰紀 / 積木冒險。

   這一套盯四件事:

   1. **收起來不會漏事情** —— 大分類上的數字是底下三項未完成的總和。
      收起來卻看不到還有事沒做,那不如不要收。
   2. **測驗是常設的**,沒有考卷時仍然進得去(裡面是空狀態)。
      戰紀和積木不一樣,那兩個是老師開了才有。
   3. 只有一項活著的時候**不要多長一排**。
   4. 正在看的那一頁被收走(戰紀打完)時要退回守護獸,
      不能把孩子留在一片空白上。

   跑在學生模擬模式的 iframe 裡 —— 那裡面載的就是真的學生端。
============================================ */
import { loadPlaywright, openApp, prepare, report } from './lib.mjs';

const chromium = await loadPlaywright();
const { page, errors, close } = await openApp(chromium, { width: 1440, height: 1000 });
await prepare(page);

const lines = [];
const ok = (n, c, e) => lines.push((c ? '✓ ' : '✗ ') + n + (e ? ' — ' + e : ''));

await page.evaluate(() => {
  window.__apply(window.__fixture({ students: 8, historyPer: 4, questions: 4 }));
  state.shopItems = [{ id: 'i1', name: '免寫一次作業', icon: '📝', price: 30,
                       stock: 3, active: true }];
  state.quizzes = [{ id: 'z1', name: '乘法小考', status: 'open',
                     questions: [{ text: '3×3', options: ['9', '6'], answer: 0, points: 1 }] }];
  state.blockTasks = [
    { id: 't1', name: '開機打招呼', spec: '開機顯示愛心', points: 3, status: 'open',
      solution: [{ t: 'on_start', body: [{ t: 'show_icon', icon: '愛心' }] }] },
    { id: 't2', name: '計步器', spec: '搖一下加一', points: 5, status: 'open',
      solution: [{ t: 'on_start', body: [{ t: 'set_var', name: 'n', v: 0 }] }] }
  ];
  state.territoryQuestions = [1, 2, 3].map(i =>
    ({ id: 'q' + i, text: '3 × ' + i, options: ['a', 'b'], answer: 0, points: 1 }));
  state.currentGroups = [['s0', 's1'], ['s2', 's3'], ['s4', 's5']];
  TerritoryGame.config = Territory.createConfig(state.currentGroups, {
    shape: 'hex', radius: 3, seed: 7, threshold: 3, battleSeconds: 90,
    answerSeconds: 30, wrongPenalty: 0, penaltyFloor: 0, maxSwaps: 0,
    cooldownWrong: 0, cooldownSeconds: 0, stageMode: 'all', stageSeconds: 300 });
  TerritoryGame.events = [];
  showApp();
  navGoItem('preview', 'preview', '');
});
await page.waitForTimeout(2600);

const frame = () => page.frames().find(f => f !== page.mainFrame());
const read = () => frame().evaluate(() => ({
  top: [...document.querySelectorAll('.student-tab')].map(b => b.textContent.trim()),
  sub: [...document.querySelectorAll('.student-subtab')].map(b => b.textContent.trim()),
  on: (document.querySelector('.student-subtab.active') || {}).textContent || '',
  pane: (document.querySelector('.student-pane') || {}).className || ''
}));

const a = await read();
ok('上排只剩五個大分類(不再是七個平鋪)',
   a.top.length === 5, a.top.join(' / '));
ok('測驗、蜂巢戰紀、積木冒險收在「挑戰」底下',
   a.top.some(t => t.startsWith('挑戰')), a.top.join(' / '));

/* 1 份沒作答的測驗 + 2 題沒交的積木 = 3 */
ok('「挑戰」上的數字是底下三項未完成的總和(收起來也不會漏事情)',
   /挑戰\s*3/.test(a.top.join(' ')), a.top.join(' / '));

await page.evaluate(() => StudentPreview.setTab('war'));
await page.waitForTimeout(600);
const b = await read();
ok('點進挑戰才長出第二排',
   b.sub.length === 3, b.sub.join(' / '));
ok('第二排會標出現在在哪一頁', b.on.startsWith('蜂巢戰紀'), b.on.trim());

/* 名字換掉了:孩子看到的是「積木冒險」 */
ok('積木那一項叫「積木冒險」',
   b.sub.some(t => t.startsWith('積木冒險')), b.sub.join(' / '));

/* ── 戰紀打完、題目收掉之後 ── */
await page.evaluate(() => {
  TerritoryGame.config = { ...TerritoryGame.config, status: 'ended' };
  state.blockTasks.forEach(t => { t.status = 'draft'; });
  StudentPreview.push();
});
await page.waitForTimeout(700);
const c = await read();
ok('只剩測驗一項時不會多長一排',
   c.sub.length === 0, c.sub.length + ' 項');
ok('沒有考卷時測驗仍然進得去(不把分頁整個收掉)',
   c.top.some(t => t.startsWith('挑戰')), c.top.join(' / '));
ok('正在看的那一頁被收走時退回守護獸,不會留在空白上',
   /pane-pet/.test(c.pane), c.pane);

await close();
process.exit(report('學生端兩排分頁', lines, errors) ? 0 : 1);
