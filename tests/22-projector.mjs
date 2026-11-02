/* ============================================
   投影模式:全班要在一個畫面裡
   ────────────────────────────────────────────
   這一頁和別頁不一樣:它是投到教室前面那面牆的,而**投影的時候
   沒有人會去捲動**。原本是固定 180px 的方格,1024×768 的投影機
   只看得到 8 位,其他 20 位在畫面外面 —— 等於有 20 個孩子看不到自己。

   所以這一套只釘一件事:不管班上幾個人、投影機什麼解析度,
   每一位都要在畫面裡,而且名字與分數都讀得到。
============================================ */
import { loadPlaywright, openApp, prepare, report } from './lib.mjs';

const chromium = await loadPlaywright();
const lines = [];
let allErrors = [];

/* 1024×768 是最常見的舊投影機,1920×1080 是新的電視/短焦,
   1280×800 夾在中間(很多教室的筆電外接就是這個) */
for (const [w, h] of [[1024, 768], [1280, 800], [1920, 1080]]) {
  for (const n of [6, 28, 35]) {
    const { page, errors, close } = await openApp(chromium, { width: w, height: h });
    await prepare(page);

    const r = await page.evaluate(count => {
      window.__apply(window.__fixture({ students: count, historyPer: 2, questions: 4 }));
      showApp();
      navGoItem('data', 'projector', '');
      // 真正投影時選單是收起來的
      document.documentElement.classList.add('projector-full');
      renderProjector();

      const cards = [...document.querySelectorAll('.projector-card')];
      const grid = document.getElementById('projectorGrid');
      const gb = grid.getBoundingClientRect();
      const outside = cards.filter(c => {
        const b = c.getBoundingClientRect();
        return b.bottom > gb.bottom + 1 || b.right > gb.right + 1;
      }).length;

      const textOk = cards.every(c => {
        const nm = c.querySelector('.projector-name');
        const pt = c.querySelector('.projector-points');
        return nm && pt
          && nm.getBoundingClientRect().height > 8
          && pt.getBoundingClientRect().height > 8;
      });

      const pets = cards.map(c =>
        Math.round(c.querySelector('.projector-pet').getBoundingClientRect().width));

      return {
        n: cards.length,
        outside,
        scroll: grid.scrollHeight - grid.clientHeight,
        textOk,
        cols: Number(getComputedStyle(grid).getPropertyValue('--proj-cols')),
        petMin: Math.min(...pets)
      };
    }, n);

    const tag = `${w}×${h} · ${n} 位`;
    lines.push((r.n === n && r.outside === 0 && r.scroll <= 2 ? '✓ ' : '✗ ')
      + `${tag} 全部都在畫面裡`
      + ` — ${r.cols} 欄,${r.n} 位,畫面外 ${r.outside} 位,溢出 ${r.scroll}px`);
    lines.push((r.textOk ? '✓ ' : '✗ ') + `${tag} 名字與分數都沒有被壓扁`);
    /* 守護獸是這一頁的主角,被擠到剩十幾 px 就失去意義了 */
    lines.push((r.petMin >= 36 ? '✓ ' : '✗ ')
      + `${tag} 守護獸還夠大 — 最小 ${r.petMin}px`);

    allErrors = allErrors.concat(errors.map(e => `${tag} ${e}`));
    await close();
  }
}

/* 加分的那一刻:整格亮起來 + 分數飄上去。全班一起看的就是這個。 */
{
  const { page, errors, close } = await openApp(chromium, { width: 1280, height: 800 });
  await prepare(page);
  const r = await page.evaluate(() => {
    window.__apply(window.__fixture({ students: 8, historyPer: 2, questions: 4 }));
    showApp();
    navGoItem('data', 'projector', '');
    renderProjector();
    triggerProjectorFlash('s0', 3);
    const card = document.querySelector('.projector-card[data-student-id="s0"]');
    const float = document.querySelector('.float-points');
    return {
      flashed: !!card && card.classList.contains('flash'),
      floated: !!float && float.textContent === '+3'
    };
  });
  lines.push((r.flashed ? '✓ ' : '✗ ') + '加分時那一格會亮起來');
  lines.push((r.floated ? '✓ ' : '✗ ') + '分數會飄上去');
  allErrors = allErrors.concat(errors);
  await close();
}

process.exit(report('投影模式', lines, allErrors) ? 0 : 1);
