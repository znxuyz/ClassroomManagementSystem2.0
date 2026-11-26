/* ============================================
   編輯區不要動不動就整個重畫
   ────────────────────────────────────────────
   老師回報:「放一塊積木或點一下指示燈就刷新一次編輯區,會很難用。」

   整塊工作區 innerHTML 重寫一次的代價:
     · 捲動位置回到最上面 —— 放完一塊積木,剛剛在看的那一段不見了
     · 正在打字的格子失去焦點
     · 畫一張 LED 圖要點十幾下,每一下都閃一次

   所以這一套盯三件事:
     1. 點指示燈:格子的狀態要變、資料要變,但**不重畫**
     2. 在格子裡打字:同樣不重畫(變數名稱例外 —— 別的下拉要跟著變)
     3. 真的需要重畫的時候(放積木),捲動位置要留著

   另外釘住「圖案自己畫」的講法:剪刀石頭布少寫一支的時候,
   以前會說「畫面變化的過程和預期的不一樣」,孩子看不懂那是什麼意思。
============================================ */
import { loadPlaywright, openApp, prepare, report } from './lib.mjs';

const chromium = await loadPlaywright();
const { page, errors, close } = await openApp(chromium);
await prepare(page);

const lines = [];
const ok = (n, c, e) => lines.push((c ? '✓ ' : '✗ ') + n + (e ? ' — ' + e : ''));

const r = await page.evaluate(() => {
  const out = {};
  const host = document.createElement('div');
  host.id = 'bk_live';
  document.body.appendChild(host);

  BlockEditor.mount(host, { program: [
    { t: 'on_start', body: [{ t: 'show_leds', grid: '0'.repeat(25) }] }
  ] });

  /* 重畫就會換掉節點 —— 比對同一顆燈的 DOM 節點還在不在,
     就知道有沒有重畫(比「看有沒有閃」可靠)。 */
  const ledAt = i => host.querySelectorAll('.bk-work .bk-led')[i];
  const before = ledAt(7);
  before.click();

  out.ledSameNode = ledAt(7) === before;          // 沒有重畫
  out.ledOn = ledAt(7).classList.contains('on');  // 但看得出亮了
  out.ledData = BlockEditor.value()[0].body[0].grid[7];

  // 再點一下要熄掉(狀態不是單向的)
  ledAt(7).click();
  out.ledOff = !ledAt(7).classList.contains('on');
  out.ledData2 = BlockEditor.value()[0].body[0].grid[7];

  /* 在格子裡打字:顯示文字那一塊 */
  BlockEditor.mount(host, { program: [
    { t: 'on_start', body: [{ t: 'show_string', v: 'Hello!' }] }
  ] });
  const field = host.querySelector('[data-bk-field][data-arg="v"]');
  field.value = '早安';
  field.dispatchEvent(new Event('change', { bubbles: true }));
  out.fieldSameNode = host.querySelector('[data-bk-field][data-arg="v"]') === field;
  out.fieldData = BlockEditor.value()[0].body[0].v;

  /* 放積木是真的要重畫的 —— 但捲動位置要留著 */
  const many = { t: 'on_start', body: [] };
  for (let i = 0; i < 40; i++) many.body.push({ t: 'show_number', v: i });
  BlockEditor.mount(host, { program: [many] });
  const work = host.querySelector('.bk-work');
  work.style.maxHeight = '200px';
  work.style.overflow = 'auto';
  work.scrollTop = 120;
  const scrolled = work.scrollTop;
  BlockEditor.render();
  const work2 = host.querySelector('.bk-work');
  out.rerendered = work2 !== work;
  out.scrollKept = scrolled > 0 && work2.scrollTop === scrolled;
  out.scrolledTo = scrolled + ' → ' + work2.scrollTop;

  host.remove();
  return out;
});

ok('點指示燈不會把整個工作區重畫一次', r.ledSameNode === true);
ok('但那一顆燈看得出亮了,資料也跟著變',
   r.ledOn === true && r.ledData === '1');
ok('再點一下會熄掉', r.ledOff === true && r.ledData2 === '0');
ok('在格子裡打字也不重畫(游標才不會跳掉)', r.fieldSameNode === true);
ok('打的字有存進去', r.fieldData === '早安', r.fieldData);
ok('放積木該重畫的時候還是會重畫', r.rerendered === true);
ok('重畫之後捲動位置留在原地,不會彈回最上面',
   r.scrollKept === true, r.scrolledTo);

/* ---------- 圖案自己畫:少寫一支要講人話 ---------- */
const d = await page.evaluate(() => {
  const g = s => s.replace(/\//g, '');
  const A = g('01100/01100/00110/00011/00011');
  const B = g('01110/11111/11111/11111/01110');
  const C = g('11111/10001/10001/10001/11111');
  const show = grid => ({ t: 'show_leds', grid });
  const eq = n => ({ t: 'cmp', a: { t: 'var', name: 'n' }, op: '=',
                     b: { t: 'num', v: n } });
  /* 剪刀石頭布:晃一下抽 1~3,重複無限次依照抽到的顯示圖 */
  const mk = (a, b, c) => ([
    { t: 'on_gesture', g: '晃動', body: [
      { t: 'set_var', name: 'n',
        v: { t: 'random', from: { t: 'num', v: 1 }, to: { t: 'num', v: 3 } } } ] },
    { t: 'forever', body: [
      { t: 'if', cond: eq(1), body: [a], elseBody: [
        { t: 'if', cond: eq(2), body: [b], elseBody: [c] } ] } ] }
  ]);
  const paper = BlockJudge.compile(
    { id: 't', drawFree: true, solution: mk(show(A), show(B), show(C)) });
  const t = p => {
    const res = BlockJudge.runCompiled(paper, p);
    return { pass: res.pass, msg: BlockJudge.explain(res) };
  };
  // 學生自己畫的三張,和老師的完全不一樣
  const X = g('10001/01010/00100/01010/10001');
  const Y = g('00100/01110/11111/01110/00100');
  const Z = g('11111/11111/00000/11111/11111');
  return {
    seeds: paper.seeds.length,
    same: t(mk(show(A), show(B), show(C))),
    mine: t(mk(show(X), show(Y), show(Z))),
    dup: t(mk(show(X), show(X), show(X))),
    missing: t([
      mk(show(X), show(Y), show(Z))[0],
      { t: 'forever', body: [
        { t: 'if', cond: { t: 'cmp', a: { t: 'var', name: 'n' }, op: '=',
                           b: { t: 'num', v: 1 } }, body: [show(X)] } ] }
    ]),
    tiny: t(mk(show(X), show(Y), g('00000/00000/00100/00000/00000')
      ? show(g('00000/00000/00100/00000/00000')) : null))
  };
});

ok('用到亂數的題目會跑好幾種亂數(少寫一支才躲不掉)', d.seeds === 3);
ok('老師自己的解答當然要過', d.same.pass === true, d.same.msg);
ok('學生自己畫的三張、畫得和老師完全不同,照樣算對',
   d.mine.pass === true, d.mine.msg);
ok('三種情況都畫同一張要擋下來', d.dup.pass === false);
ok('而且要說清楚是「和另一種情況畫成同一張」',
   /同一張/.test(d.dup.msg), d.dup.msg);
ok('每張至少要亮 3 顆燈,一個點不算一張圖',
   d.tiny.pass === false && /亮 3 顆燈/.test(d.tiny.msg), d.tiny.msg);
ok('只寫了一支(漏掉兩種情況)要擋下來', d.missing.pass === false);
ok('而且要講「這一種情況是不是還沒寫」,不是「畫面變化的過程不一樣」',
   /還沒寫|沒有換圖/.test(d.missing.msg)
   && !/畫面變化的過程/.test(d.missing.msg), d.missing.msg);

await close();
process.exit(report('編輯區不重畫 · 圖案自己畫的講法', lines, errors) ? 0 : 1);
