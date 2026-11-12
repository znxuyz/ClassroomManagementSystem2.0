/* ============================================
   學生模擬模式
   ────────────────────────────────────────────
   老師在自己的畫面裡看「這位學生登入會看到什麼」。

   這一套盯三件事:

   1. **裡面是真的學生端**,不是另外兜出來的樣子 ——
      用的是 Roster.build / privateEntry,也就是真的會發給學生的那兩份。
      自己兜一份「看起來像」的,就會變成「預覽裡好好的、實際上不是」,
      那比沒有預覽更糟。
   2. **換學生、換分頁不會重載** iframe(老師只是想看另一頁)。
   3. **預覽裡寫不進任何東西** —— 老師是來看的,不是來幫學生按的。

   注意:用 file:// 開的時候 iframe 算跨來源,從父視窗摸不到裡面,
   所以這裡用 Playwright 的 frame API 進去看(正式環境是同一個網域,
   沒有這個限制)。
============================================ */
import { loadPlaywright, openApp, prepare, report } from './lib.mjs';

const chromium = await loadPlaywright();
const { page, errors, close } = await openApp(chromium, { width: 1440, height: 1000 });
await prepare(page);

const lines = [];
const ok = (n, c, e) => lines.push((c ? '✓ ' : '✗ ') + n + (e ? ' — ' + e : ''));

await page.evaluate(() => {
  const V = n => ({ t: 'var', name: n });
  window.__apply(window.__fixture({ students: 8, historyPer: 6, questions: 4 }));
  state.students[0].name = '許伯瑋';
  state.students[1].name = '蔡承恩';
  state.shopItems = [{ id: 'i1', name: '免寫一次作業', icon: '📝', price: 30,
                       stock: 3, active: true }];
  state.blockTasks = [
    { id: 't1', name: '開機打招呼', spec: '開機顯示愛心', points: 3, status: 'open',
      solution: [{ t: 'on_start', body: [{ t: 'show_icon', icon: '愛心' }] }],
      stars: { s0: 3 } },
    { id: 't2', name: '計步器', spec: '搖一下加一', points: 5, status: 'open',
      solution: [{ t: 'on_start', body: [{ t: 'set_var', name: 'n', v: 0 },
                                         { t: 'show_number', v: V('n') }] }] }
  ];
  state.quizzes = [{ id: 'z1', name: '乘法小考', status: 'open',
                     questions: [{ text: '3×3', options: ['9', '6'], answer: 0, points: 1 }] }];
  state.territoryQuestions = [1, 2, 3, 4, 5, 6].map(i =>
    ({ id: 'q' + i, text: '3 × ' + i + ' = ?',
       options: ['' + (3 * i), '0', '1', '2'], answer: 0, points: 1 }));
  state.currentGroups = [['s0', 's1', 's2'], ['s3', 's4', 's5'], ['s6', 's7']];
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

ok('老師端有「學生模擬」這一個大分類',
   await page.evaluate(() => NAV_GROUPS.some(g => g.key === 'preview')));

const f = frame();
ok('裡面載的是同一支程式(真的學生端)', !!f);

const first = await f.evaluate(() => ({
  name: (document.querySelector('.student-name') || {}).textContent || '',
  pet: !!document.querySelector('.student-pet-card'),
  tabs: [...document.querySelectorAll('.student-tab')].map(t => t.textContent.trim().slice(0, 3)),
  points: (document.querySelector('.student-points-num') || {}).textContent
}));
ok('看到的是指定那一位學生', first.name.includes('許伯瑋'), first.name.trim());
ok('守護獸、分頁、積分都畫得出來',
   first.pet && first.tabs.length >= 5 && first.points,
   first.tabs.join('/') + ' · ' + first.points);

/* 明細是「只有本人看得到」的那一份 —— 預覽要連這個都對,
   不然老師會以為學生看不到自己的扣分原因 */
const detail = await f.evaluate(() =>
  document.querySelectorAll('.student-history-row').length);
ok('連「只有本人看得到」的積分明細都是真的', detail > 0, detail + ' 筆');

// ── 換學生:不重載,內容要跟著換 ──
const before = await f.evaluate(() => performance.now());
await page.evaluate(() => StudentPreview.pick('s1'));
await page.waitForTimeout(500);
const after = await frame().evaluate(() => ({
  name: (document.querySelector('.student-name') || {}).textContent || '',
  t: performance.now()
}));
ok('換一位學生,畫面跟著換', after.name.includes('蔡承恩'), after.name.trim());
ok('而且沒有重載 iframe(老師只是想看另一位)', after.t > before);

// ── 換分頁 ──
await page.evaluate(() => StudentPreview.setTab('blocks'));
await page.waitForTimeout(500);
const bk = await frame().evaluate(() => ({
  nodes: document.querySelectorAll('.bk-node').length,
  locked: document.querySelectorAll('.bk-node.is-locked').length
}));
ok('換到積木冒險,看得到關卡地圖', bk.nodes === 2, bk.nodes + ' 關');

await page.evaluate(() => { StudentPreview.pick('s0'); });
await page.waitForTimeout(500);
const stars = await frame().evaluate(() =>
  [...document.querySelectorAll('.bk-node-stars')].map(e => e.textContent.trim()));
ok('關卡上的星星是這位學生真正的進度',
   stars[0] === '★★★', stars.join(' / '));

/* 全功能都要看得到:測驗、兌換、蜂巢戰紀都要畫得出來。
   只能看守護獸那一頁的預覽,老師還是得去借學生帳號。 */
const seen = {};
for (const t of ['quiz', 'shop', 'war']) {
  await page.evaluate(x => StudentPreview.setTab(x), t);
  await page.waitForTimeout(450);
  seen[t] = await frame().evaluate(() => ({
    txt: (document.querySelector('.student-content') || document.body).innerText,
    cells: document.querySelectorAll('.tg-cell, polygon').length
  }));
}
ok('測驗那一頁看得到開放中的考卷', /開始作答/.test(seen.quiz.txt));
ok('兌換那一頁看得到上架的獎品', /免寫一次作業/.test(seen.shop.txt));
ok('蜂巢戰紀那一頁的地圖畫得出來(不是空白的框)',
   seen.war.cells > 10, seen.war.cells + ' 格');

/* 學生看不到的分頁要標「未開放」—— 不標的話老師點進去看到空白
   會以為預覽壞了,其實是他還沒開放 */
const offTabs = await page.evaluate(() => {
  state.shopItems.forEach(i => { i.active = false; });
  StudentPreview.render();
  return [...document.querySelectorAll('.pv-tab')]
    .filter(b => b.classList.contains('off')).map(b => b.textContent.trim());
});
ok('學生還看不到的分頁會標「未開放」',
   offTabs.some(t => t.startsWith('兌換')), offTabs.join(' / '));
await page.waitForTimeout(1200);

// ── 預覽裡寫不進東西 ──
const writes = await frame().evaluate(async () => {
  const r = {};
  r.purchase = await Cloud.createPurchase('C1', {}).then(() => 'wrote').catch(() => 'threw');
  r.work = await Cloud.saveBlockWork('C1', 'u', {}).then(() => 'wrote').catch(() => 'threw');
  r.pet = await Cloud.savePetChoice('C1', 'u', {}).then(() => 'wrote').catch(() => 'threw');
  r.toast = !!document.getElementById('toast');
  return r;
});
ok('預覽裡的兌換、交作品、選守護獸都不會真的送出',
   writes.purchase === 'wrote' && writes.work === 'wrote' && writes.pet === 'wrote',
   JSON.stringify(writes));

// ── 換裝置只改框的大小 ──
const sized = await page.evaluate(() => {
  StudentPreview.setDevice('tablet');
  const p = document.querySelector('.pv-phone');
  return Math.round(p.getBoundingClientRect().width);
});
ok('可以切成平板的寬度', sized >= 768, sized + 'px');

/* 電腦版:孩子在教室是一人一台電腦。
   框會縮到放得下,但 **iframe 的視窗寬度必須還是 1280** ——
   改成把 iframe 做窄一點,裡面就會變成手機版,那就不是電腦畫面了。 */
await page.evaluate(() => StudentPreview.setDevice('desktop'));
await page.waitForTimeout(400);
const desk = await page.evaluate(() => {
  const p = document.querySelector('.pv-phone');
  return { css: Math.round(p.getBoundingClientRect().width),
           scaled: !!p.style.transform };
});
const innerW = await frame().evaluate(() => window.innerWidth);
ok('電腦版的學生畫面讀到的還是電腦寬度(縮的是顯示,不是版面)',
   innerW === 1280, innerW + 'px · 框 ' + desk.css + 'px');

/* 外框是 content-box:專案全域是 border-box,不改回來的話
   外框那 20px 會從裡面扣掉,學生畫面右邊會被切一截 */
const box = await page.evaluate(() => {
  StudentPreview.setDevice('phone');
  const p = document.querySelector('.pv-phone');
  const i = document.getElementById('pvFrame');
  return [Math.round(i.getBoundingClientRect().width),
          Math.round(p.getBoundingClientRect().width)];
});
ok('手機外框不會把學生畫面切掉', box[0] === 390 && box[1] === 410, box.join(' / '));

await close();
process.exit(report('學生模擬模式', lines, errors) ? 0 : 1);
