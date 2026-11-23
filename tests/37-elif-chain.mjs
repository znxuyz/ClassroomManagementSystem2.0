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

   後半段釘的是另一件事:**同一個功能用哪一種寫法都算對**。
   「如果、如果、如果」、「如果 否則{如果 否則}」、「如果 否則如果 否則」——
   只要跑出來的畫面一樣就要過。判題本來就是比行為,所以這些現在就會過;
   釘起來是為了以後改 sameStep / frames 時不會默默把它弄壞。

   但有一條界線要同時釘住:**條件之間不互斥的時候,拆開就真的不一樣**
   (「>5」和「>3」拆成兩個如果,6 會把兩支都跑過一遍)。
   那不是寫法不同,是做出來的事不同,本來就該被擋。
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

/* ============================================
   同一個功能,換哪一種寫法都算對
============================================ */
const shapes = await page.evaluate(() => {
  const out = {};
  const V = n => ({ t: 'var', name: n });
  const show = n => ({ t: 'show_number', v: n });
  const eq = n => ({ t: 'cmp', a: V('n'), op: '=', b: n });
  const draw = { t: 'set_var', name: 'n', v: { t: 'random', from: 1, to: 3 } };
  const wrap = body => [{ t: 'on_gesture', g: '晃動', body: [draw, ...body] }];

  // 三種寫法,同一個功能:抽 1~3,照抽到的顯示 1 / 2 / 3
  const 鏈 = wrap([{ t: 'if', cond: eq(1), body: [show(1)],
    elseBody: [{ t: 'if', cond: eq(2), body: [show(2)], elseBody: [show(3)] }] }]);
  const 三個如果 = wrap([{ t: 'if', cond: eq(1), body: [show(1)] },
                         { t: 'if', cond: eq(2), body: [show(2)] },
                         { t: 'if', cond: eq(3), body: [show(3)] }]);
  const 全部嵌起來 = wrap([{ t: 'if', cond: eq(1), body: [show(1)],
    elseBody: [{ t: 'if', cond: eq(2), body: [show(2)],
      elseBody: [{ t: 'if', cond: eq(3), body: [show(3)] }] }] }]);
  const 倒過來寫 = wrap([{ t: 'if', cond: eq(3), body: [show(3)] },
                         { t: 'if', cond: eq(2), body: [show(2)] },
                         { t: 'if', cond: eq(1), body: [show(1)] }]);

  // 老師用鏈出題 → 其他三種都要過
  const byChain = BlockJudge.compile({ solution: 鏈 });
  out.鏈收三個如果 = BlockJudge.runCompiled(byChain, 三個如果).pass;
  out.鏈收全部嵌起來 = BlockJudge.runCompiled(byChain, 全部嵌起來).pass;
  out.鏈收倒過來寫 = BlockJudge.runCompiled(byChain, 倒過來寫).pass;

  // 反過來:老師用三個如果出題 → 鏈也要過
  const byIfs = BlockJudge.compile({ solution: 三個如果 });
  out.三個如果收鏈 = BlockJudge.runCompiled(byIfs, 鏈).pass;

  // 真的做錯事還是要擋:先多顯示一個 9(畫面會多閃一下)
  const 多顯示 = wrap([show(9), { t: 'if', cond: eq(1), body: [show(1)] },
                       { t: 'if', cond: eq(2), body: [show(2)] },
                       { t: 'if', cond: eq(3), body: [show(3)] }]);
  out.多閃一下 = BlockJudge.runCompiled(byChain, 多顯示).pass;

  // 少一支就不行
  const 少一支 = wrap([{ t: 'if', cond: eq(1), body: [show(1)] },
                       { t: 'if', cond: eq(2), body: [show(2)] }]);
  out.少一支 = BlockJudge.runCompiled(byChain, 少一支).pass;

  /* ── 界線:條件不互斥的時候,拆開是真的不一樣 ──
     「>5」和「>3」:n=6 時鏈只走第一支(100),
     拆成兩個如果會兩支都跑,最後停在 50。 */
  const gt = n => ({ t: 'cmp', a: V('n'), op: '>', b: n });
  const w2 = body => [{ t: 'on_button', btn: 'A',
                        body: [{ t: 'set_var', name: 'n', v: 6 }, ...body] }];
  const 鏈2 = w2([{ t: 'if', cond: gt(5), body: [show(100)],
                    elseBody: [{ t: 'if', cond: gt(3), body: [show(50)] }] }]);
  const 拆開2 = w2([{ t: 'if', cond: gt(5), body: [show(100)] },
                    { t: 'if', cond: gt(3), body: [show(50)] }]);
  const p2 = BlockJudge.compile({ solution: 鏈2 });
  const r2 = BlockJudge.runCompiled(p2, 拆開2);
  out.不互斥拆開 = r2.pass;
  out.不互斥說明 = BlockJudge.explain(r2);
  out.不互斥畫面 = [
    BlockVM.describeScreen(p2.expect.find(e => e.screen.kind === 'number').screen),
    BlockVM.describeScreen(BlockJudge.compile({ solution: 拆開2 })
      .expect.find(e => e.screen.kind === 'number').screen)
  ];
  /* ── 亂數題目要換幾種亂數各跑一遍 ──
     只跑一種的話,「抽到 3 才會走到」的那一支整場都沒被考到,
     少寫一支的作品就會矇混過關。 */
  out.亂數題跑幾輪 = (byChain.expectAll || []).length;
  out.亂數題劇本長度 = byChain.script.length;
  const 看過的畫面 = new Set();
  (byChain.expectAll || []).forEach(tr => tr.forEach(e => {
    if (e.screen && e.screen.kind === 'number') 看過的畫面.add(e.screen.value); }));
  out.三支都被考到 = 看過的畫面.size;

  // 沒用到亂數的題目維持原樣(不要讓每一題的考卷都大三倍)
  const 不用亂數 = BlockJudge.compile({
    solution: [{ t: 'on_start', body: [show(7)] }] });
  out.不用亂數有expectAll = !!不用亂數.expectAll;
  out.不用亂數劇本長度 = 不用亂數.script.length;

  return out;
});

ok('老師用「否則如果」出題,學生用**三個獨立的如果**也算對',
   shapes.鏈收三個如果 === true);
ok('學生**全部嵌起來**寫也算對', shapes.鏈收全部嵌起來 === true);
ok('學生把三支**順序倒過來**寫也算對', shapes.鏈收倒過來寫 === true);
ok('反過來:老師用三個如果出題,學生用鏈也算對', shapes.三個如果收鏈 === true);

ok('但畫面多閃一下就不算對(那是真的做了別的事)', shapes.多閃一下 === false);
ok('少做一支也不算對', shapes.少一支 === false);

ok('**條件不互斥時,拆開是真的不一樣**,要擋下來',
   shapes.不互斥拆開 === false,
   '鏈停在 ' + shapes.不互斥畫面[0] + ',拆開停在 ' + shapes.不互斥畫面[1]);
ok('而且講得出差在哪', /應該是 100/.test(shapes.不互斥說明), shapes.不互斥說明);

ok('用到亂數的題目會換幾種亂數各跑一遍',
   shapes.亂數題跑幾輪 === 3, shapes.亂數題跑幾輪 + ' 輪');
ok('而且劇本會拉長,三支都考得到',
   shapes.亂數題劇本長度 >= 10 && shapes.三支都被考到 === 3,
   shapes.亂數題劇本長度 + ' 步 · 考到 ' + shapes.三支都被考到 + ' 支');
ok('沒用到亂數的題目維持原樣(考卷不會平白大三倍)',
   shapes.不用亂數有expectAll === false && shapes.不用亂數劇本長度 <= 3,
   shapes.不用亂數劇本長度 + ' 步');

await close();
process.exit(report('否則如果可以一直加', lines, errors) ? 0 : 1);
