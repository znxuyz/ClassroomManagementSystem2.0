/* 版面:每一個頁面、三種寬度。
   抓三件事:render 時的例外、水平溢出、console 錯誤。

   「點開某一位學生的報告」是刻意單獨走一次的 —— 之前只走到學生清單
   那一層,所以報告在手機上整個被推出畫面外的問題一直沒被抓到。 */
import { loadPlaywright, openApp, prepare, okSrc, report } from './lib.mjs';

const chromium = await loadPlaywright();
const WIDTHS = [390, 768, 1440];
const lines = [];
let allErrors = [];

for (const width of WIDTHS) {
  const { page, errors, close } = await openApp(chromium, { width });
  await page.evaluate(okSrc);
  await prepare(page);

  const r = await page.evaluate(() => {
    const t = window.__mk();
    const f = window.__fixture();
    window.__apply(f);
    showApp();

    const over = [], ex = [];
    const probe = label => {
      document.querySelectorAll('.view.active *').forEach(el => {
        if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX === 'visible')
          over.push(`${label} · ${el.tagName}.${el.className} ${el.scrollWidth}>${el.clientWidth}`);
      });
      if (document.documentElement.scrollWidth > window.innerWidth + 1)
        over.push(label + ' · 整頁橫向捲動');
    };

    let pages = 0;
    NAV_GROUPS.forEach(g => g.items.forEach(it => {
      try { navGoItem(g.key, it.view, it.sub || ''); pages++; probe(g.name + '/' + it.name); }
      catch (e) { ex.push(`${g.name}/${it.name}: ${e.message}`); }
    }));

    // 點開一位學生的報告(含每月積分與逐筆明細)
    try {
      navGoItem('data', 'overview', 'report');
      document.getElementById('reportContainer').innerHTML =
        buildStudentReport({ ...getStudent('s3'), history: f.blob.students[3].history });
      probe('學生報告(明細收起)');
      toggleHistoryDetail();
      probe('學生報告(明細展開)');
    } catch (e) { ex.push('學生報告: ' + e.message); }

    const expected = NAV_GROUPS.reduce((n, g) => n + g.items.length, 0);
    t.ok('每個頁面都畫得出來', pages === expected && ex.length === 0,
         `${pages}/${expected}` + (ex.length ? ' · ' + ex.join(' | ') : ''));
    t.ok('沒有水平溢出', over.length === 0, over.slice(0, 4).join(' | '));
    return t.out;
  });

  r.forEach(l => lines.push(`${width}px ${l}`));
  allErrors = allErrors.concat(errors.map(e => `${width}px ${e}`));
  await close();
}

process.exit(report('版面 / 25 個頁面 × 3 種寬度', lines, allErrors) ? 0 : 1);
