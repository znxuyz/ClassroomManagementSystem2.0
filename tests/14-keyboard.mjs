/* 鍵盤操作。

   專案原本一個鍵盤事件都沒有 —— 表單填完不能按 Enter 送出,
   每一次都得把手離開鍵盤去點按鈕。老師一天要在「學生加分」按幾十次、
   出題時要連續新增幾十題,這個其實很有感。

   這一套最重要的一項是**中文輸入法**:注音、倉頡在選字時也是按 Enter
   確認的。不判斷「正在組字」的話,老師打「陳怡安」按 Enter 選字,
   表單就直接送出去了 —— 那在中文介面是會真的壞掉的。 */
import { loadPlaywright, openApp, prepare, okSrc, report } from './lib.mjs';

const chromium = await loadPlaywright();
const { page, errors, close } = await openApp(chromium, { width: 1440, height: 1000 });
await page.evaluate(okSrc);
await prepare(page);

await page.evaluate(() => {
  const f = window.__fixture({ students: 8, questions: 0 });
  f.blob.shopItems = [];
  f.blob.classTasks = [];
  f.blob.homework = [];
  f.blob.quizzes = [];
  window.__apply(f);
  state.territoryQuestions = [];
  showApp();
  // 不要讓真的送出跳對話框卡住測試
  window.confirm = () => true;
  window.alert = () => { };
  window.toast = () => { };
});

const lines = [];
const ok = (n, c, e) => lines.push((c ? '✓ ' : '✗ ') + n + (e ? ' — ' + e : ''));

/* 一排一排地測:填好欄位 → 游標放在第一格 → 按 Enter → 東西有沒有被建立 */
const CASES = [
  { name: '兌換商店 → 獎品管理', nav: ['shop', 'shop', 'shopItems'],
    fill: { shopItemName: '免寫作業', shopItemPrice: '30' },
    first: 'shopItemName', count: () => state.shopItems.length },
  { name: '兌換商店 → 班級共同任務', nav: ['shop', 'shop', 'tasks'],
    fill: { taskName: '閱讀王', taskTarget: '100' },
    first: 'taskName', count: () => state.classTasks.length },
  { name: '聯絡簿 → 作業繳交', nav: ['contact', 'contact', 'homework'],
    fill: { hwName: '數學習作' },
    first: 'hwName', count: () => state.homework.length },
  { name: '學習挑戰 → 學生測驗', nav: ['challenge', 'quiz', ''],
    fill: { quizTitle: '第三單元小考' },
    first: 'quizTitle', count: () => state.quizzes.length }
];

for (const c of CASES) {
  const before = await page.evaluate(x => {
    navGoItem(...x.nav);
    Object.entries(x.fill).forEach(([id, v]) => { document.getElementById(id).value = v; });
    document.getElementById(x.first).focus();
    return eval('(' + x.count + ')')();
  }, { nav: c.nav, fill: c.fill, first: c.first, count: c.count.toString() });

  await page.keyboard.press('Enter');
  await page.waitForTimeout(120);

  const after = await page.evaluate(x => eval('(' + x + ')')(), c.count.toString());
  ok(`${c.name}:按 Enter 就建立`, after === before + 1, `${before} → ${after}`);

  // 送出之後焦點要回到第一格,才能接著打下一筆
  const focused = await page.evaluate(id => document.activeElement &&
    document.activeElement.id === id, c.first);
  ok(`${c.name}:送出後焦點回到第一格`, focused);
}

/* ---- 中文輸入法選字時的 Enter 不可以送出 ---- */
const imeOk = await page.evaluate(() => {
  navGoItem('shop', 'shop', 'shopItems');
  document.getElementById('shopItemName').value = '測試獎品';
  document.getElementById('shopItemPrice').value = '10';
  const el = document.getElementById('shopItemName');
  el.focus();
  const before = state.shopItems.length;
  // 模擬輸入法組字中的 Enter
  el.dispatchEvent(new KeyboardEvent('keydown',
    { key: 'Enter', isComposing: true, bubbles: true, cancelable: true }));
  const mid = state.shopItems.length;
  // 組字結束後的 Enter 才算
  el.dispatchEvent(new KeyboardEvent('keydown',
    { key: 'Enter', isComposing: false, bubbles: true, cancelable: true }));
  return { blocked: mid === before, then: state.shopItems.length === before + 1 };
});
ok('注音/倉頡選字中的 Enter 不會誤送出', imeOk.blocked);
ok('選完字之後的 Enter 才送出', imeOk.then);

/* ---- 不可以按到「刪除」那種按鈕 ---- */
const safe = await page.evaluate(() => {
  navGoItem('class', 'rules', '');
  const row = document.querySelector('.rule-editor-row:not(.is-head)');
  if (!row) return 'no-row';
  const input = row.querySelector('input');
  const before = state.rules.length;
  input.focus();
  input.dispatchEvent(new KeyboardEvent('keydown',
    { key: 'Enter', bubbles: true, cancelable: true }));
  return state.rules.length === before ? 'safe' : 'deleted';
});
ok('在只有「✕ 刪除」的列裡按 Enter 不會刪掉東西', safe === 'safe', safe);

/* ---- Esc ---- */
const esc = await page.evaluate(async () => {
  navGoItem('class', 'dashboard', '');
  selectStudent('s0');
  const on = document.getElementById('dashboardLayout').classList.contains('has-selection');
  document.body.focus();
  document.dispatchEvent(new KeyboardEvent('keydown',
    { key: 'Escape', bubbles: true, cancelable: true }));
  return { on, off: !document.getElementById('dashboardLayout').classList.contains('has-selection') };
});
ok('選到學生之後按 Esc 收起加分面板', esc.on && esc.off);

/* ---- 焦點看得見 ----
   原本這一項是「先 focus() 一顆按鈕再按 Tab」,結果落在哪個元素上
   並不確定,量到的是別人的樣式 —— 那是一個會隨機通過/失敗的測試。
   改成從頭開始按 Tab,直到停在一顆按鈕上,再看那一顆。 */
let ringInfo = null;
await page.evaluate(() => {
  navGoItem('shop', 'shop', 'shopItems');
  document.body.focus();
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
});
for (let i = 0; i < 25 && !ringInfo; i++) {
  await page.keyboard.press('Tab');
  ringInfo = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el || !el.classList || !el.classList.contains('btn')) return null;
    const cs = getComputedStyle(el);
    return { cls: el.className.toString().slice(0, 26),
             fv: el.matches(':focus-visible'),
             shadow: cs.boxShadow };
  });
}
ok('用鍵盤 Tab 到按鈕時焦點看得見',
  !!ringInfo && ringInfo.fv && !!ringInfo.shadow
  && !/rgba\(0, 0, 0, 0\)|oklab\(0 0 0 \/ 0\)|^none$/.test(ringInfo.shadow),
  ringInfo ? `${ringInfo.cls} → ${ringInfo.shadow.slice(0, 44)}` : '25 次 Tab 都沒停在按鈕上');

await close();
process.exit(report('鍵盤操作', lines, errors) ? 0 : 1);
