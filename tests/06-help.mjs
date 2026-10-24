/* 使用說明的分類:每一段都要有歸屬,每一個分類點了都要有內容。
   規則那幾段是依實際設定動態產生的,不在靜態 HELP 裡,要一起算。 */
import { loadPlaywright, openApp, prepare, okSrc, report } from './lib.mjs';

const chromium = await loadPlaywright();
const { page, errors, close } = await openApp(chromium);
await page.evaluate(okSrc);
await prepare(page);

const lines = await page.evaluate(() => {
  const t = window.__mk();
  window.__apply(window.__fixture());
  showApp();

  ['student', 'teacher'].forEach(which => {
    const titles = new Set(
      [...helpRuleSections(state.rules), ...HELP[which]].map(s => s.title));
    const grouped = HELP_GROUPS[which].flatMap(g => g.titles);
    const missing = grouped.filter(x => !titles.has(x));
    const orphan = [...titles].filter(x => !grouped.includes(x));
    t.ok(which + ':分類指到的段落都存在', missing.length === 0, missing.join('、'));
    t.ok(which + ':每一段都有分類(不會憑空消失)', orphan.length === 0, orphan.join('、'));
    t.ok(which + ':沒有兩個分類指同一段', grouped.length === new Set(grouped).size);
  });

  ['helpTeacher', 'helpStudent'].forEach(sub => {
    navGoItem('help', 'help', sub);
    const body = document.getElementById(
      sub === 'helpStudent' ? 'helpStudentBody' : 'helpTeacherBody');
    const btns = body.querySelectorAll('[data-help-nav]');
    t.ok(sub + ':分類列出來了', btns.length >= 2, btns.length + ' 個');
    const empty = [];
    btns.forEach(b => {
      b.click();
      const panel = body.querySelector('.help-group.active');
      if (!panel || panel.dataset.helpGroup !== b.dataset.helpNav
          || panel.querySelectorAll('.help-sec').length === 0) {
        empty.push(b.textContent.trim());
      }
    });
    t.ok(sub + ':點每個分類都會切到對應的、有內容的那一塊',
         empty.length === 0, empty.join('、'));
  });

  return t.out;
});

await close();
process.exit(report('使用說明分類', lines, errors) ? 0 : 1);
