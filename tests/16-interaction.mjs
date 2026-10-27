/* 「滑過去有沒有反應」。

   可點卻沒反應,使用者會懷疑自己是不是按錯地方 —— 尤其是那些
   長得像文字、不像按鈕的切換。這種問題**靜態截圖完全看不出來**,
   只能真的把滑鼠移上去量。

   這一套抓到過一個我自己造成的回歸:學生加分改成方格版面時,
   卡片的基底色剛好設成和原本 hover 同樣的值,於是全系統按最多次的
   那一頁,滑鼠移過去什麼都沒發生。

   ── 三種不算「沒反應」的情況 ──
   · 子元素:它的父卡片會反應就夠了(頭像、名字在卡片裡)
   · 已經是 active 的切換:它本來就長得不一樣了
   · 停用中的按鈕
*/
import { loadPlaywright, openApp, prepare, okSrc, report } from './lib.mjs';

const chromium = await loadPlaywright();
const { page, errors, close } = await openApp(chromium, { width: 1440, height: 1050 });
await page.evaluate(okSrc);
await prepare(page);

await page.evaluate(() => {
  const f = window.__fixture({ students: 8, questions: 0 });
  const today = new Date().toISOString().slice(0, 10);
  f.blob.attendance = { [today]: { s0: 'present' } };
  f.blob.homework = [{ id: 'h1', title: '作業', due: today, submissions: {} }];
  f.blob.classTasks = [{ id: 't1', name: '任務', target: 10, current: 4, reward: 5 }];
  f.blob.shopItems = [{ id: 'i1', name: '獎品', price: 10, stock: 3, active: true, icon: '🎁' }];
  f.blob.groupSets = [{ name: 'g', groups: [['s0', 's1'], ['s2', 's3']] }];
  f.blob.currentGroups = [['s0', 's1'], ['s2', 's3']];
  window.__apply(f);
  state.territoryQuestions = [];
  showApp();
  /* 戰況與每週結算有計時器會定期重繪整塊面板。
     量測是「摸之前讀一次、摸之後讀一次」,中途被重繪的話拿到的是
     兩個不同的節點 —— 於是「沒有變化」,測試就隨機紅一次。
     flaky 的測試比沒有測試更糟,它會訓練人忽略紅燈,所以先把計時器停掉。 */
  if (typeof TerritoryGame !== 'undefined') TerritoryGame.stop();
  if (typeof TerritoryWeekly !== 'undefined') TerritoryWeekly.stop();
});

/* 一種類別取一個代表就好 —— 同一種元素的樣式一定一樣 */
const targets = await page.evaluate(() => {
  const seen = new Set(), out = [];
  NAV_GROUPS.forEach(g => g.items.forEach(it => {
    navGoItem(g.key, it.view, it.sub || '');
    const v = document.querySelector('.view.active');
    if (!v) return;
    v.querySelectorAll('*').forEach(el => {
      const cs = getComputedStyle(el);
      const clickable = el.onclick || cs.cursor === 'pointer' || /^(BUTTON|A)$/.test(el.tagName);
      if (!clickable || el.offsetParent === null) return;
      if (el.closest('.hex-map')) return;                 // SVG 的互動另有測試
      if (el.disabled || el.classList.contains('active')) return;
      /* 父層已經是可點的 → 由父層負責回應就好。
         要連 cursor:pointer 的 <label> 一起算 —— 選項列的 A/B/C/D
         就是那種:它們是標籤裡的裝飾文字,不是各自可點的東西。 */
      let anc = el.parentElement, covered = false;
      while (anc && anc !== document.body) {
        const acs = getComputedStyle(anc);
        if (anc.onclick || acs.cursor === 'pointer'
            || /^(BUTTON|A|LABEL)$/.test(anc.tagName)) { covered = true; break; }
        anc = anc.parentElement;
      }
      if (covered) return;
      const cls = (el.className || '').toString().trim().split(' ')[0] || el.tagName;
      if (seen.has(cls)) return;
      seen.add(cls);
      el.dataset.probe = cls;
      out.push({ nav: [g.key, it.view, it.sub || ''], cls, page: `${g.name}/${it.name}` });
    });
  }));
  return out;
});

const PROPS = e => {
  const c = getComputedStyle(e);
  return [c.backgroundColor, c.borderColor, c.color, c.transform,
          c.boxShadow, c.opacity, c.textDecorationLine, c.filter].join('|');
};
const dead = [];
for (const t of targets) {
  await page.evaluate(n => navGoItem(...n), t.nav);
  const el = await page.$(`[data-probe="${t.cls}"]`);
  if (!el) continue;
  const before = await el.evaluate(PROPS);
  try { await el.hover({ timeout: 900 }); } catch { continue; }
  await page.waitForTimeout(220);
  // 中途被重繪的話這個節點已經不在畫面上了,量到的不是同一個東西
  const alive = await el.evaluate(e => e.isConnected).catch(() => false);
  if (!alive) continue;
  const after = await el.evaluate(PROPS);
  if (before === after) dead.push(`${t.cls} @${t.page}`);
}

const lines = [];
lines.push((dead.length === 0 ? '✓ ' : '✗ ')
  + `每一個可點的東西,滑過去都有反應(共 ${targets.length} 種)`
  + (dead.length ? ' — ' + dead.join(' · ') : ''));

/* 學生加分的卡片特別盯一次 —— 它是按最多次的,而且已經壞過一次 */
const card = await page.evaluate(() => {
  navGoItem('class', 'dashboard', '');
  const el = document.querySelector('.student-item');
  return el ? getComputedStyle(el).backgroundColor : null;
});
await page.evaluate(() => navGoItem('class', 'dashboard', ''));
const cardEl = await page.$('.student-item');
await cardEl.hover();
await page.waitForTimeout(220);
const cardHover = await cardEl.evaluate(e => getComputedStyle(e).backgroundColor);
lines.push((card !== cardHover ? '✓ ' : '✗ ')
  + '學生加分的卡片滑過去會變色' + ` — ${card} → ${cardHover}`);

await close();
process.exit(report('滑過去有沒有反應', lines, errors) ? 0 : 1);
