/* ============================================
   「如果 / 否則如果 / 否則」可以一直加
   ────────────────────────────────────────────
   MakeCode 的「如果」底下有一顆 ⊕,按幾次就多幾列「否則如果」。
   原本這裡只做得到一層「否則」,所以剪刀石頭布那種三選一的題目
   要嵌好幾層才拼得出來,和孩子在 MakeCode 看到的完全不一樣。

   做法上**刻意不動資料結構**:一串 if / 否則如果 / 否則,存的還是
   一層一層包起來的 if(下一列放在上一列的 elseBody 裡)——
   這和 MakeCode 的 JavaScript 輸出一模一樣,直譯器、判題、匯入
   本來就都會跑了。改的只有「怎麼畫」:拉平成同一層的幾列。

   所以這一套盯兩件事:
   1. 畫面上真的是平的幾列,而且 ⊕ ⊖ 加得掉也減得掉
   2. **跑起來的結果**和一層一層嵌的完全一樣(資料沒被畫面帶壞)
============================================ */
import { loadPlaywright, openApp, prepare, report } from './lib.mjs';

const chromium = await loadPlaywright();
const { page, errors, close } = await openApp(chromium, { width: 1440, height: 1000 });
await prepare(page);

const lines = [];
const ok = (n, c, e) => lines.push((c ? '✓ ' : '✗ ') + n + (e ? ' — ' + e : ''));

const r = await page.evaluate(async () => {
  const out = {};
  window.__apply(window.__fixture({ students: 3, historyPer: 0, questions: 0 }));
  window.confirm = () => true;

  state.blockTasks = [{
    id: 'bt1', name: '猜拳', spec: '', points: 4, status: 'draft',
    solution: [{ t: 'on_start', body: [{ t: 'if', cond: null, body: [], elseBody: [] }] }],
    palette: null, hints: [], starLimit: 0, free: false, createdAt: Date.now()
  }];
  showApp();
  navGoItem('challenge', 'blocks', '');
  BlockTasks.edit('bt1');
  await new Promise(res => setTimeout(res, 300));

  const count = () => ({
    elif: document.querySelectorAll('.bk-else.is-elif').length,
    els: [...document.querySelectorAll('.bk-else')]
      .filter(e => !e.classList.contains('is-elif') && !e.classList.contains('is-add')).length,
    plus: document.querySelectorAll('[data-bk="addelif"]').length
  });
  const press = sel => { const b = document.querySelector(sel); if (b) b.click(); };

  out.start = count();
  for (let i = 0; i < 3; i++) press('[data-bk="addelif"]');
  out.after3 = count();

  // ⊕ 只有一顆(在整串最下面),不是每一列都長一顆
  out.onePlus = out.after3.plus === 1;

  // 拿掉中間那一列
  const mid = [...document.querySelectorAll('[data-bk="delelif"]')][1];
  mid.click();
  out.afterDrop = count();

  /* 每一列都是真的積木:條件格點得到、肚子裡放得進東西 */
  const rows = [...document.querySelectorAll('.bk-else.is-elif')];
  out.hasSlots = rows.every(r2 => !!r2.querySelector('.bk-slot'));
  out.hasBodies = document.querySelectorAll('.bk-else.is-elif + .bk-body').length
    === rows.length;

  /* ---------- 跑起來對不對 ----------
     手拼一串「晃動 → 隨機 1~3 → 三選一顯示不同數字」,
     和「一層一層嵌」的寫法比,兩邊的行為必須一模一樣。 */
  const chain = [{ t: 'on_gesture', g: '晃動', body: [
    { t: 'set_var', name: 'g', v: { t: 'random', from: 1, to: 3 } },
    { t: 'if', cond: { t: 'cmp', a: { t: 'var', name: 'g' }, op: '=', b: 1 },
      body: [{ t: 'show_number', v: 11 }],
      elseBody: [{ t: 'if',
        cond: { t: 'cmp', a: { t: 'var', name: 'g' }, op: '=', b: 2 },
        body: [{ t: 'show_number', v: 22 }],
        elseBody: [{ t: 'show_number', v: 33 }] }] }
  ] }];
  const paper = BlockJudge.compile({ solution: chain });
  out.chainSelf = BlockJudge.runCompiled(paper, chain).pass;
  out.chainScreens = paper.expect.map(e => BlockVM.describeScreen(e.screen));

  // 少一個分支 → 要被擋下來(不是三條都走同一支)
  const broken = JSON.parse(JSON.stringify(chain));
  broken[0].body[1].elseBody[0].body[0].v = 11;
  out.brokenCaught = BlockJudge.runCompiled(paper, broken).pass;

  /* 畫面把這一串拉平之後,value() 吐出來的樹要**原封不動** */
  const before = JSON.stringify(chain);
  BlockEditor.mount(document.createElement('div'), { program: chain });
  const after = JSON.stringify(BlockEditor.value());
  out.treeKept = before === after;
  /* 這一串是 if(g=1) → 否則如果(g=2) → 否則,所以**兩塊** if 串在一起
     (最後那個「否則」不是 if,它是最後一塊的 elseBody) */
  const head = BlockEditor.program[0].body[1];
  out.flatRows = BlockEditor.elifChain(head).length;
  out.tailIsElse = !!BlockEditor.elifChain(head).slice(-1)[0].elseBody;

  return out;
});

ok('一開始是「如果 + 否則」,沒有否則如果',
   r.start.elif === 0 && r.start.els === 1, JSON.stringify(r.start));
ok('**按三次 ⊕ 就多三列「否則如果」**',
   r.after3.elif === 3, r.after3.elif + ' 列');
ok('而且原本的「否則」還留在最後面',
   r.after3.els === 1, r.after3.els + ' 個否則');
ok('⊕ 整串只有一顆(在最下面),不是每列各一顆', r.onePlus === true);

ok('⊖ 拿得掉中間那一列,後面幾列不會跟著不見',
   r.afterDrop.elif === 2 && r.afterDrop.els === 1,
   JSON.stringify(r.afterDrop));

ok('每一列都有自己的條件格', r.hasSlots === true);
ok('每一列都有自己的肚子(放得進積木)', r.hasBodies === true);

ok('三選一跑得過,三種情況顯示不同的東西',
   r.chainSelf === true && new Set(r.chainScreens).size > 1,
   r.chainScreens.join(' / '));
ok('其中一支做錯事就擋得下來', r.brokenCaught === false);

ok('畫面拉平不會動到資料(value() 吐出來的樹原封不動)',
   r.treeKept === true);
ok('「if → 否則如果 → 否則」認得出是兩塊 if 串在一起,最後掛一個否則',
   r.flatRows === 2 && r.tailIsElse === true, r.flatRows + ' 塊');

await close();
process.exit(report('否則如果可以一直加', lines, errors) ? 0 : 1);
