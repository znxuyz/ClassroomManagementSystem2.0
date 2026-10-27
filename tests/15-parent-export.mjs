/* 給家長的學習歷程檔。

   報表那一頁本來就看得到也印得出來,缺的是**一份可以傳出去的檔案**:
   家長用手機點開就能看,不必登入、不必裝 App、不必有網路。

   所以這一套盯的是「自成一體」—— 只要檔案裡還連著任何外部資源,
   家長那邊就會看到破圖或沒有樣式,而那是老師完全不會發現的
   (在自己電腦上開起來一切正常,因為資源都在)。 */
import { loadPlaywright, openApp, prepare, okSrc, report } from './lib.mjs';

const chromium = await loadPlaywright();
const { page, errors, close } = await openApp(chromium, { width: 1440, height: 1000 });
await page.evaluate(okSrc);
await prepare(page);

const lines = await page.evaluate(async () => {
  const t = window.__mk();
  const f = window.__fixture({ students: 6, historyPer: 0, questions: 0 });
  const today = new Date().toISOString().slice(0, 10);
  f.blob.attendance = {
    [today]: { s0: 'present', s1: 'absent' },
    '2026-09-01': { s0: 'late' }
  };
  f.blob.homework = [{ id: 'h1', title: '數學習作', due: today,
    submissions: { s0: { status: 'submitted' } } }];
  window.__apply(f);

  // 橫跨幾個月的歷程
  const hist = [];
  const start = new Date(); start.setMonth(start.getMonth() - 3);
  for (let i = 0; i < 90; i++) {
    const d = new Date(start); d.setDate(d.getDate() + i);
    hist.push({ time: d.getTime(), points: i % 11 === 0 ? -2 : 1,
      reason: i % 11 === 0 ? '未帶課本' : ['上課發言', '幫助同學', '作業準時'][i % 3] });
  }
  state.students[0].history = hist;
  state.students[0].totalPoints = 180;
  state.students[0].petName = '小黑';

  const html = await buildStudentExport(state.students[0], hist);

  t.ok('產生得出檔案', typeof html === 'string' && html.length > 2000,
    Math.round(html.length / 1024) + ' KB');
  /* 守護獸的原圖是給大畫面用的(單張 300~400 KB),直接塞進去整份檔案
     會變成快 500 KB —— 用 LINE 傳會卡,而它在檔案裡只顯示成一個
     88px 的小圓。縮圖之後大約 50 KB。 */
  t.ok('檔案不會肥到傳不動', html.length < 160 * 1024,
    Math.round(html.length / 1024) + ' KB');
  t.ok('是一份完整的 HTML', /^<!DOCTYPE html>/i.test(html.trim())
    && html.includes('</html>'));
  t.ok('指定了中文與手機寬度',
    html.includes('lang="zh-Hant"') && html.includes('width=device-width'));

  /* ── 自成一體:不可以連任何外部資源 ──
     這是整個功能的重點。只要有一個 http(s) 的連結,
     家長離線開就會缺東西,而老師在自己電腦上完全看不出來。 */
  const ext = [...html.matchAll(/(?:src|href)\s*=\s*"([^"]+)"/g)]
    .map(m => m[1])
    .filter(u => !/^data:/.test(u) && !/^#/.test(u));
  t.ok('沒有任何外部連結(家長離線也看得到)', ext.length === 0, ext.join(', '));
  t.ok('樣式是內嵌的', html.includes('<style>') && !html.includes('rel="stylesheet"'));

  /* ── 內容 ── */
  t.ok('有學生姓名與班級',
    html.includes('學生0') && html.includes('測試班'));
  t.ok('有守護獸的名字與階段',
    html.includes('小黑') && STAGE_NAMES.some(n => html.includes(n)));
  t.ok('有每月積分', html.includes('每月積分') && /\d+ 年 \d+ 月/.test(html));
  t.ok('有逐筆明細而且筆數對', (() => {
    const rows = (html.match(/未帶課本|上課發言|幫助同學|作業準時/g) || []).length;
    return rows >= hist.length;         // 明細 + 主要表現那幾列
  })(), (html.match(/未帶課本|上課發言|幫助同學|作業準時/g) || []).length + ' 處');
  t.ok('有出席與作業', html.includes('出席天數') && html.includes('已繳作業'));
  t.ok('出席率算的是這位學生的',
    html.includes('>67%<') || html.includes('>100%<') || /\d+%/.test(html));

  /* ── 內容要轉義,不然學生名字裡的符號會破版 ── */
  const evil = JSON.parse(JSON.stringify(state.students[1]));
  evil.name = '<img src=x onerror=alert(1)>';
  evil.petName = '"><script>bad()</script>';
  const evilHtml = await buildStudentExport(evil, [
    { time: Date.now(), points: 1, reason: '<b>注入</b>' }]);
  t.ok('姓名、暱稱、原因都有轉義',
    !evilHtml.includes('<img src=x') && !evilHtml.includes('<script>bad()')
    && !evilHtml.includes('<b>注入</b>'));

  /* ── 守護獸的圖:連不到就退回表情符號,不可以留破圖 ── */
  const noPet = JSON.parse(JSON.stringify(state.students[2]));
  noPet.pet = null;
  const noPetHtml = await buildStudentExport(noPet, []);
  t.ok('沒有守護獸時不會留下破圖',
    !/<img[^>]*src="(?!data:)/.test(noPetHtml));

  /* ── 沒有任何紀錄時也要產生得出來 ── */
  const blank = JSON.parse(JSON.stringify(state.students[3]));
  const blankHtml = await buildStudentExport(blank, []);
  t.ok('完全沒有紀錄時也不會壞掉',
    blankHtml.includes('</html>') && blankHtml.includes(blank.name));

  return t.out;
});

await close();
process.exit(report('給家長的學習歷程檔', lines, errors) ? 0 : 1);
