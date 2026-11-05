/* ============================================
   積木挑戰:編輯器(真的用點的拼一題出來)
   ────────────────────────────────────────────
   這一套不是檢查函式,是**從頭用點擊拼出一支程式**:
   點事件 → 點插入點 → 點積木 → 填格子 → 把變數放進數字格,
   最後按判題,要過。

   會這樣測是因為這個編輯器的風險不在「函式對不對」,而在
   「點下去到底有沒有照預期插進那個位置」—— 那只有真的點才看得出來。

   順便釘住兩條給小學生的保護:
   · 一般積木不能掉在最外層(要放在事件裡面)
   · 運算式要先點格子才放得進去
============================================ */
import { loadPlaywright, openApp, prepare, report } from './lib.mjs';

const chromium = await loadPlaywright();
const { page, errors, close } = await openApp(chromium, { width: 1440, height: 950 });
await prepare(page);

const lines = [];
const ok = (n, c, e) => lines.push((c ? '✓ ' : '✗ ') + n + (e ? ' — ' + e : ''));

await page.evaluate(() => {
  window.__apply(window.__fixture({ students: 4, historyPer: 2, questions: 4 }));
  showApp();
  navGoItem('challenge', 'blocks', '');
  // 變數用的 prompt 先固定答案
  window.prompt = () => '步數';
  document.getElementById('bkName').value = '計步器';
  document.getElementById('bkSpec').value = '開機歸零、搖一下加一、A+B 歸零';
  BlockTasks.create();
});
await page.waitForTimeout(200);

/* 點面板上的某一塊積木(用上面的字找) */
const chip = async label => {
  const got = await page.evaluate(t => {
    const b = [...document.querySelectorAll('.bk-chip')]
      .find(x => x.textContent.trim().startsWith(t));
    if (!b) return false;
    b.click();
    return true;
  }, label);
  if (!got) throw new Error('面板上找不到積木:' + label);
  await page.waitForTimeout(40);
};

/* 點某一個插入點:第 n 個「放這裡」的位置(從 0 算) */
const cursor = async n => {
  await page.evaluate(i => {
    const c = document.querySelectorAll('.bk-cursor');
    if (c[i]) c[i].click();
  }, n);
  await page.waitForTimeout(40);
};

const setField = async (idx, value) => {
  await page.evaluate(([i, v]) => {
    const f = document.querySelectorAll('[data-bk-field]')[i];
    if (!f) return;
    f.value = v;
    f.dispatchEvent(new Event('change', { bubbles: true }));
  }, [idx, value]);
  await page.waitForTimeout(40);
};

// ── 1. 當啟動時 → 新增變數 → 將 步數 設為 0 ──
await chip('當啟動時');
await chip('＋ 新增變數');
await chip('將');
ok('點一下事件、再點一塊指令,就插在事件裡面',
   await page.evaluate(() => BlockEditor.program.length === 1
     && (BlockEditor.program[0].body || []).length === 1
     && BlockEditor.program[0].body[0].t === 'set_var'));

await setField(0, '步數');          // 將 [步數] 設為
ok('變數下拉選得到剛才新增的變數',
   await page.evaluate(() => BlockEditor.program[0].body[0].name === '步數'));

// ── 2. 顯示數字,並把「步數」放進那個數字格 ──
await chip('顯示數字');
await page.evaluate(() => {
  // 點開「改成放積木」的小箭頭
  const b = [...document.querySelectorAll('.bk-slot-mini')].pop();
  if (b) b.click();
});
await page.waitForTimeout(40);
await chip('步數');                  // 變數積木(面板上顯示的就是變數名稱)
ok('數字格可以換成變數積木',
   await page.evaluate(() => {
     const show = BlockEditor.program[0].body[1];
     return show && show.t === 'show_number' && show.v && show.v.t === 'var';
   }));

// ── 3. 當搖動時 → 改變 步數 1 → 顯示數字 步數 ──
await chip('當搖動時');
await chip('改變');
await setField(await page.evaluate(() =>
  [...document.querySelectorAll('[data-bk-field]')].findIndex(f =>
    f.dataset.type === 'var' && f.closest('.bk-blk').textContent.includes('改變'))), '步數');
await chip('顯示數字');
await page.evaluate(() => {
  const b = [...document.querySelectorAll('.bk-slot-mini')].pop();
  if (b) b.click();
});
await page.waitForTimeout(40);
await chip('步數');

// ── 4. 當按鈕 A 被按下時 → 改成 A+B → 將 步數 設為 0 → 顯示 ──
await chip('當按鈕');
await page.evaluate(() => {
  const sel = [...document.querySelectorAll('[data-bk-field][data-type="pick"]')].pop();
  sel.value = 'A+B';
  sel.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(40);
await chip('將');
await setField(await page.evaluate(() =>
  [...document.querySelectorAll('[data-bk-field]')].findIndex(f =>
    f.dataset.type === 'var' && !f.value)), '步數');
await chip('顯示數字');
await page.evaluate(() => {
  const b = [...document.querySelectorAll('.bk-slot-mini')].pop();
  if (b) b.click();
});
await page.waitForTimeout(40);
await chip('步數');

const built = await page.evaluate(() => JSON.stringify(BlockEditor.value()));
ok('拼出三個事件', JSON.parse(built).length === 3,
   JSON.parse(built).map(b => b.t).join(' / '));

// ── 5. 試跑:自己的答案判自己,必須全過 ──
await page.evaluate(() => BlockTasks.tryRun());
await page.waitForTimeout(200);
const judged = await page.evaluate(() => ({
  pass: BlockTasks._judge && BlockTasks._judge.pass,
  steps: (BlockTasks._judge && BlockTasks._judge.steps || []).map(s => s.label + '=' +
    BlockVM.describeScreen(s.expect))
}));
ok('試跑全過,而且劇本看得出「搖一下加一」',
   judged.pass && judged.steps.join('|').includes('搖動第 2 次=2'),
   judged.steps.join(' / '));

// ── 6. 模擬器:按下去真的有反應 ──
const sim = await page.evaluate(() => {
  BlockSim.setProgram(BlockEditor.value());
  const before = BlockVM.describeScreen(BlockSim.ctx.screen);
  BlockSim.act('shake');
  BlockSim.act('shake');
  const after = BlockVM.describeScreen(BlockSim.ctx.screen);
  BlockSim.act('press', 'A+B');
  const reset = BlockVM.describeScreen(BlockSim.ctx.screen);
  return { before, after, reset };
});
ok('模擬器:開機 0、搖兩下 2、按 A+B 回到 0',
   sim.before === '0' && sim.after === '2' && sim.reset === '0',
   `${sim.before} → ${sim.after} → ${sim.reset}`);

// ── 7. 保護:一般積木不能掉在最外層 ──
const guard = await page.evaluate(() => {
  BlockEditor.cursor = null;
  const before = BlockEditor.program.length;
  BlockEditor.addFromPalette('show_number');
  return BlockEditor.program.length === before;
});
ok('沒有選插入點時,一般積木不會掉在最外層', guard);

const guard2 = await page.evaluate(() => {
  BlockEditor.slot = null;
  const before = JSON.stringify(BlockEditor.value());
  BlockEditor.addFromPalette('var');
  return JSON.stringify(BlockEditor.value()) === before;
});
ok('沒有點格子時,運算式積木不會亂插', guard2);

// ── 8. 開放題目前會擋掉跑不動的 ──
const open = await page.evaluate(() => {
  const t = BlockTasks.byId(BlockTasks.editing);
  t.solution = [{ t: 'on_start', body: [
    { t: 'while', cond: { t: 'cmp', op: '=', a: { t: 'num', v: 1 }, b: { t: 'num', v: 1 } },
      body: [] } ] }];
  BlockTasks.toggleOpen(t.id);
  const blocked = t.status !== 'open';
  t.solution = JSON.parse(localStorage.getItem('__sol') || 'null') || t.solution;
  return blocked;
});
ok('參考解答跑不動時,擋住不讓開放', open);

await close();
process.exit(report('積木挑戰:編輯器', lines, errors) ? 0 : 1);
