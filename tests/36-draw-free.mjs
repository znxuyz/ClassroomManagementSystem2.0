/* ============================================
   圖案自己畫
   ────────────────────────────────────────────
   老師出了一題「剪刀石頭布」:搖一下隨機 1~3,照抽到的顯示剪刀 / 石頭 / 布。
   micro:bit 沒有這三個內建圖示,所以孩子一定得自己拿 LED 畫 ——
   而**每個人畫出來的剪刀都不一樣**。比對點陣的話,只有跟老師畫得一模一樣的
   那一個會過,其他全錯,這種題目就出不了。

   但也不能完全不管,否則這一題等於沒在考。所以比的不是「畫成什麼樣」,
   是**用得一不一致**:

     1. 同一種情況每次要顯示同一張
     2. 不同情況要畫得看得出差別
     3. 每張至少亮 3 顆燈(空白或一個點不算一張圖)

   這一套就是釘住這三條,以及「沒開這個選項時照舊嚴格比對」。
============================================ */
import { loadPlaywright, openApp, prepare, report } from './lib.mjs';

const chromium = await loadPlaywright();
const { page, errors, close } = await openApp(chromium);
await prepare(page);

const lines = [];
const ok = (n, c, e) => lines.push((c ? '✓ ' : '✗ ') + n + (e ? ' — ' + e : ''));

const r = await page.evaluate(() => {
  const out = {};
  const deep = x => JSON.parse(JSON.stringify(x));

  /* 老師的解答:搖一下抽 1~3,照抽到的顯示三張圖之一。
     老師畫的剪刀 / 石頭 / 布。 */
  const SCISSORS = '1000101010001000101010001';
  const ROCK     = '0111011111111111111101110';
  const PAPER    = '1111110001100011000111111';

  const task = (grids, drawFree) => ({
    id: 't1', name: '剪刀石頭布', drawFree,
    solution: [{ t: 'on_gesture', g: '晃動', body: [
      { t: 'set_var', name: 'g', v: { t: 'random', from: 1, to: 3 } },
      { t: 'if', cond: { t: 'cmp', a: { t: 'var', name: 'g' }, op: '=', b: 1 },
        body: [{ t: 'show_leds', grid: grids[0] }],
        elseBody: [{ t: 'if',
          cond: { t: 'cmp', a: { t: 'var', name: 'g' }, op: '=', b: 2 },
          body: [{ t: 'show_leds', grid: grids[1] }],
          elseBody: [{ t: 'show_leds', grid: grids[2] }] }] }
    ] }]
  });

  const teacher = task([SCISSORS, ROCK, PAPER], true);
  const paper = BlockJudge.compile(teacher);
  out.selfPass = BlockJudge.runCompiled(paper, teacher.solution).pass;

  /* 學生畫的三張 —— 和老師完全不一樣,但三張彼此不同 */
  const S2 = '0101001010001000101010001';
  const R2 = '0111011011110111101101110';
  const P2 = '1111110001101011000111111';
  const student = task([S2, R2, P2], true).solution;
  const rStu = BlockJudge.runCompiled(paper, student);
  out.ownDrawing = rStu.pass;

  /* 同一份作品,但沒開「圖案自己畫」→ 照舊嚴格比,要被擋下來 */
  const strict = BlockJudge.compile(task([SCISSORS, ROCK, PAPER], false));
  out.strictBlocks = BlockJudge.runCompiled(strict, student).pass;
  out.strictSelf = BlockJudge.runCompiled(strict, teacher.solution).pass;

  /* 三種情況都畫同一張 → 擋下來 */
  const same = task([S2, S2, S2], true).solution;
  const rSame = BlockJudge.runCompiled(paper, same);
  out.allSame = rSame.pass;
  out.allSameWhy = BlockJudge.explain(rSame);

  /* 幾乎空白(只亮一顆)→ 擋下來 */
  const blankish = '0000000000001000000000000';
  const rThin = BlockJudge.runCompiled(paper, task([blankish, R2, P2], true).solution);
  out.tooEmpty = rThin.pass;
  out.tooEmptyWhy = BlockJudge.explain(rThin);

  /* 同一種情況畫兩張不一樣的 → 擋下來。
     把「抽到 1」那一支改成每次畫不同張做不到(程式是固定的),
     所以改成測對應表本身:同一個老師圖案對到兩個學生圖案。 */
  const ctx = BlockJudge.drawCtx({ drawFree: true });
  const A = { kind: 'leds', value: SCISSORS };
  out.mapFirst = BlockJudge.screenMatch(A, { kind: 'leds', value: S2 }, ctx);
  out.mapAgainSame = BlockJudge.screenMatch(A, { kind: 'leds', value: S2 }, ctx);
  out.mapAgainOther = BlockJudge.screenMatch(A, { kind: 'leds', value: R2 }, ctx);
  out.mapWhy = ctx.why;

  /* 數字與文字不受影響 —— 只有 LED 圖案走對應表 */
  const numTask = { id: 't2', name: '數字', drawFree: true,
    solution: [{ t: 'on_start', body: [{ t: 'show_number', v: 7 }] }] };
  const numPaper = BlockJudge.compile(numTask);
  const wrongNum = [{ t: 'on_start', body: [{ t: 'show_number', v: 8 }] }];
  out.numberStillStrict = BlockJudge.runCompiled(numPaper, wrongNum).pass;

  /* 清空畫面還是清空畫面(空白不會被當成「一張圖」) */
  const clearTask = { id: 't3', name: '清空', drawFree: true,
    solution: [{ t: 'on_start', body: [{ t: 'show_leds', grid: ROCK },
                                       { t: 'clear' }] }] };
  const clearPaper = BlockJudge.compile(clearTask);
  const noClear = [{ t: 'on_start', body: [{ t: 'show_leds', grid: R2 }] }];
  out.clearStillRequired = BlockJudge.runCompiled(clearPaper, noClear).pass;

  /* 老師端要把這個設定一起發給學生(不然學生端不知道規則) */
  state.blockTasks = [{ ...teacher, status: 'open', points: 3 }];
  out.published = (BlockTasks.papers()[0] || {}).drawFree;

  return out;
});

ok('老師自己的解答跑得過', r.selfPass === true);
ok('**學生畫自己的剪刀石頭布也算對**', r.ownDrawing === true);

ok('沒開這個選項時照舊嚴格比,學生自己畫的會被擋',
   r.strictBlocks === false && r.strictSelf === true);

ok('三種情況都畫同一張 → 擋下來', r.allSame === false);
ok('而且講得出是「畫成同一張」', /看得出差別/.test(r.allSameWhy), r.allSameWhy);

ok('幾乎空白(只亮一顆)→ 擋下來', r.tooEmpty === false);
ok('而且講得出「至少亮幾顆燈」', /至少亮 3 顆燈/.test(r.tooEmptyWhy), r.tooEmptyWhy);

ok('同一種情況第二次畫同一張 → 可以', r.mapFirst === true && r.mapAgainSame === true);
ok('同一種情況改畫另一張 → 擋下來,並說得出原因',
   r.mapAgainOther === false && r.mapWhy === 'inconsistent', r.mapWhy);

ok('數字與文字不受影響,照舊嚴格比', r.numberStillStrict === false);
ok('「清空畫面」還是要真的清空(空白不算一張圖)',
   r.clearStillRequired === false);

ok('這個設定會跟著題目發給學生', r.published === true);

await close();
process.exit(report('圖案自己畫', lines, errors) ? 0 : 1);
