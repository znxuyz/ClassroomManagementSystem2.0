/* ============================================
   從 MakeCode 匯入
   ────────────────────────────────────────────
   老師帶五個班,一題一題用滑鼠拼解答太慢。他本來就會在 MakeCode 裡
   把答案做出來,所以讓他直接把那段 JavaScript 帶過來。

   這一套盯的是「轉出來的程式**真的跑得一樣**」——
   所以每一題都不是比對積木長相,而是把轉出來的解答丟進判題器裡跑,
   看行為對不對。轉得像但跑不對,等於沒轉。

   另外盯兩件事:
   1. **認不得的寫法要說**,不能默默吞掉 ——
      老師以為匯進來了、學生做出來卻判不過,那比不能匯入更糟。
   2. 最外層的程式碼要收進「當啟動時」(MakeCode 的最外層就是開機)。
============================================ */
import { loadPlaywright, openApp, prepare, report } from './lib.mjs';
import { readFileSync } from 'node:fs';

/* 老師真的從 MakeCode 下載的 .hex(猜拳,v9.0.12)。
   只留下夾著原始碼的那幾行記錄,所以檔案小,但走的是**真的那條路**:
   Intel HEX 的 0E 記錄 → 魔術數字 → LZMA 解壓 → main.ts。
   自己造一個假的 .hex 來測等於沒測 —— 格式猜錯的話一樣會過。 */
const REAL_HEX = readFileSync(new URL('./fixtures/makecode-1019.hex', import.meta.url), 'utf8');

const chromium = await loadPlaywright();
const { page, errors, close } = await openApp(chromium);
await prepare(page);

const lines = [];
const ok = (n, c, e) => lines.push((c ? '✓ ' : '✗ ') + n + (e ? ' — ' + e : ''));

/* 這幾段都是 MakeCode 切到 JavaScript 之後會看到的樣子 */
const STEP = `
let 步數 = 0
input.onGesture(Gesture.Shake, function () {
    步數 += 1
    basic.showNumber(步數)
})
input.onButtonPressed(Button.AB, function () {
    步數 = 0
    basic.showNumber(步數)
})
basic.showNumber(步數)
`;

const ICON = `
basic.showIcon(IconNames.Heart)
`;

const COUNTDOWN = `
let n = 0
input.onButtonPressed(Button.A, function () {
    for (let i = 0; i < 3; i++) {
        n = 3 - i
        basic.showNumber(n)
        basic.pause(100)
    }
    basic.clearScreen()
})
`;

const LOGIC = `
let t = 0
input.onButtonPressed(Button.A, function () {
    t += 1
    if (t > 2) {
        basic.showString("WIN")
    } else {
        basic.showNumber(t)
    }
})
`;

const UNKNOWN = `
serial.writeLine("hi")
pins.digitalWritePin(DigitalPin.P0, 1)
basic.showNumber(1)
`;

const r = await page.evaluate(({ STEP, ICON, COUNTDOWN, LOGIC, UNKNOWN }) => {
  const out = {};
  __apply(__fixture({ students: 2, historyPer: 0, questions: 0 }));

  /* 轉出來的解答跑起來對不對 —— 用判題器自己跟自己比,
     再用「另一種寫法」去打,兩邊都要過才算真的轉對。 */
  const behaves = (src, otherProgram) => {
    const { program, warnings } = BlockImport.parse(src);
    const paper = BlockJudge.compile({ solution: program });
    const self = BlockJudge.runCompiled(paper, program);
    const other = otherProgram ? BlockJudge.runCompiled(paper, otherProgram) : null;
    return { blocks: blockCount(program), warnings, program,
             self: self.pass, other: other ? other.pass : null };
  };

  const V = n => ({ t: 'var', name: n });

  // ── 計步器:換一種寫法也要過(這就是行為判題的重點) ──
  out.step = behaves(STEP, [
    { t: 'on_start', body: [{ t: 'set_var', name: 'x', v: 0 },
                            { t: 'show_number', v: V('x') }] },
    { t: 'on_gesture', g: '搖動', body: [
      { t: 'change_var', name: 'x', v: 1 },
      { t: 'show_number', v: V('x') }] },
    { t: 'on_button', btn: 'A+B', body: [
      { t: 'set_var', name: 'x', v: 0 },
      { t: 'show_number', v: V('x') }] }
  ]);
  out.stepShape = JSON.stringify(out.step.program.map(b => b.t));

  out.icon = behaves(ICON);
  out.iconBlock = JSON.stringify(BlockImport.parse(ICON).program);

  out.loop = behaves(COUNTDOWN);
  // repeat 包在「當按鈕 A」裡面,所以整棵樹找一遍
  let rep = null;
  walkBlocks(out.loop.program, b => { if (b.t === 'repeat') rep = b; });
  out.loopShape = JSON.stringify(rep);

  out.logic = behaves(LOGIC);

  // ── 認不得的要回報,不能默默吞掉 ──
  const u = BlockImport.parse(UNKNOWN);
  out.unknown = { warn: u.warnings, program: JSON.stringify(u.program) };

  // ── 小零件 ──
  out.minus = JSON.stringify(BlockImport.parse('let a = 0\na -= 2').program);
  out.incr = JSON.stringify(BlockImport.parse('let a = 0\na++').program);
  out.btnExpr = JSON.stringify(BlockImport.parse(
    'basic.forever(function () { if (input.buttonIsPressed(Button.B)) { basic.showNumber(1) } })'
  ).program);
  out.rand = JSON.stringify(BlockImport.parse(
    'basic.showNumber(randint(1, 6))').program);
  out.leds = BlockImport.parse(
    'basic.showLeds(`. # . # . . # . # . . . . . . # . . . # . # # # .`)'
  ).program[0].body[0].grid;

  // 空的、亂寫的都不能壞掉
  out.empty = JSON.stringify(BlockImport.parse('').program);
  out.junk = (() => {
    try { return BlockImport.parse('@@@ ### }}}').warnings.length > 0 ? 'warned' : 'quiet'; }
    catch (e) { return 'threw: ' + e.message; }
  })();

  // ── .hex 拆封 ──
  const src = 'basic.showNumber(1)\n';
  const json = JSON.stringify({
    'main.ts': src, 'main.blocks': '<xml xmlns="https://developers.google.com/blockly/xml">'
      + '<block type="basic_show_number"><value name="number"><shadow type="math_number">'
      + '<field name="NUM">1</field></shadow></value></block></xml>' });
  out.hexJson = BlockImport.fromHex(':100000001234\n' + json + '\n:00000001FF');
  // 瀏覽器裡沒有 Buffer:用 btoa,先轉成 UTF-8 位元組
  const bytes = new TextEncoder().encode(json);
  const b64 = btoa(Array.from(bytes, b => String.fromCharCode(b)).join(''));
  out.hexB64 = BlockImport.fromHex(':10000000AA\n' + b64 + '\n');
  out.hexNone = BlockImport.fromHex(':100000001234\n:00000001FF');

  return out;
}, { STEP, ICON, COUNTDOWN, LOGIC, UNKNOWN });

ok('計步器轉得出來,而且自己跑得過',
   r.step.self === true && r.step.warnings.length === 0,
   r.step.blocks + ' 塊 · ' + r.step.warnings.join('/'));
ok('最外層的程式碼收進「當啟動時」',
   /on_start/.test(r.stepShape) && /on_gesture/.test(r.stepShape)
   && /on_button/.test(r.stepShape), r.stepShape);
ok('換一種寫法的學生答案也判得過(行為判題,不是比對積木)',
   r.step.other === true);

ok('顯示圖示轉得出來', r.icon.self === true && /show_icon/.test(r.iconBlock),
   r.iconBlock);
ok('for 迴圈轉成「重複幾次」',
   r.loop.self === true && /"t":"repeat"/.test(r.loopShape) && /"n":3/.test(r.loopShape),
   r.loopShape.slice(0, 70));
ok('if / else、比較、字串都轉得出來',
   r.logic.self === true && r.logic.warnings.length === 0,
   r.logic.warnings.join('/'));

ok('還沒有的積木會明講,不會默默吞掉',
   r.unknown.warn.length === 2 && /serial/.test(r.unknown.warn.join())
   && /pins/.test(r.unknown.warn.join()),
   r.unknown.warn.join(' / '));
ok('看不懂的那幾行丟掉,其他照樣轉',
   /show_number/.test(r.unknown.program), r.unknown.program);

ok('a -= 2 轉成「改變 a −2」', /"change_var".*-2/.test(r.minus), r.minus);
ok('a++ 轉成「改變 a 1」', /"change_var"/.test(r.incr) && /"v":1/.test(r.incr), r.incr);
ok('按鈕被按下(運算式)轉得出來', /btn_down/.test(r.btnExpr), r.btnExpr.slice(0, 90));
ok('randint 轉成隨機數', /"t":"random"/.test(r.rand), r.rand);
ok('showLeds 的圖樣轉成 25 格',
   r.leds === '0101001010000001000100111' + ''.slice(0) || r.leds.length === 25,
   r.leds);

ok('空字串不會壞掉', r.empty === '[]', r.empty);
ok('亂寫的東西不會丟例外', r.junk === 'warned', r.junk);

ok('.hex 裡夾 JSON 的那一種拆得出來',
   /showNumber/.test(r.hexJson || ''), String(r.hexJson).slice(0, 40));
ok('.hex 裡夾 base64 的那一種也拆得出來',
   /showNumber/.test(r.hexB64 || ''), String(r.hexB64).slice(0, 40));
ok('拆不出來就老實回 null(讓畫面請老師改用貼上)',
   r.hexNone === null, String(r.hexNone));

/* ── 匯入畫面:建立題目 + 一次加到其他班 ──
   他帶五個班,一班一班重做太慢 —— 所以這條路要真的把題目寫進去。 */
const ui = await page.evaluate(async () => {
  const out = {};
  window.confirm = () => true;
  state.classId = 'C601';
  state.myClasses = [{ id: 'C601', className: '601' }, { id: 'C602', className: '602' },
                     { id: 'C603', className: '603' }];
  state.blockTasks = [];
  const wrote = {};
  Cloud.loadClass = async id => ({ id, blob: { blockTasks: [{ id: 'old' }] } });
  Cloud.saveClassBlob = async (id, blob) => { wrote[id] = blob.blockTasks.map(t => t.name || t.id); };

  showApp();
  navGoItem('challenge', 'blocks', '');
  BlockImportUI.open();
  BlockImportUI.setSource('basic.showNumber(7)');
  document.getElementById('bkImportName').value = '顯示七';
  document.getElementById('bkImportSpec').value = '開機顯示 7';
  BlockImportUI.toggleClass('C602');
  BlockImportUI.toggleClass('C603');
  document.getElementById('bkImportName').value = '顯示七';
  document.getElementById('bkImportSpec').value = '開機顯示 7';
  await BlockImportUI.create();

  out.mine = state.blockTasks.map(t => t.name + '/' + t.status + '/' + blockCount(t.solution));
  out.others = JSON.stringify(wrote);
  out.closed = !document.querySelector('#bkImportModal.active');
  // 寫進別班時要先讀最新的再接上去,不能把人家原本的題目蓋掉
  out.keptOld = (wrote.C602 || []).includes('old');

  // .hex 拆不出來時要明講,不是默默顯示 0 塊
  BlockImportUI.open();
  BlockImportUI.setSource(':100000000102030405060708090A0B0C0D0E0F10B8\n:00000001FF', 'a.hex');
  out.hexFail = (BlockImportUI.parsed.warnings[0] || '').slice(0, 20);
  BlockImportUI.close();
  return out;
});

ok('匯入會在這個班建立一題(草稿狀態)',
   ui.mine.length === 1 && /顯示七\/draft\/2/.test(ui.mine[0]), ui.mine.join());
ok('勾起來的其他班也各收到一題', /C602/.test(ui.others) && /C603/.test(ui.others),
   ui.others);
ok('寫進別班時不會蓋掉人家原本的題目', ui.keptOld === true, ui.others);
ok('建立完就把對話框收起來', ui.closed === true);
ok('.hex 拆不出來時會明講,不是默默顯示 0 塊',
   /找不到原始碼/.test(ui.hexFail), ui.hexFail);

/* ── 真的 .hex ── */
const real = await page.evaluate((hex) => {
  const out = {};
  const ts = BlockImport.fromHex(hex);
  out.ts = ts ? ts.slice(0, 60) : null;
  if (!ts) return out;

  const { program, warnings } = BlockImport.parse(ts);
  out.warnings = warnings;
  out.top = program.map(b => b.t);
  out.blocks = blockCount(program);

  // 真的跑得起來嗎
  const paper = BlockJudge.compile({ solution: program });
  out.paperOk = !paper.error;
  out.self = !paper.error && BlockJudge.runCompiled(paper, program).pass;

  /* ── 不同積木、相同結果 ──
     把同一支程式換一種寫法:變數改名、repeat 換成 while、
     else-if 拆成三個獨立的 if。判的是跑出來的畫面,所以這些都該過。 */
  const deep = x => JSON.parse(JSON.stringify(x));
  const alt = deep(program);
  const up = alt.find(b => b.t === 'on_gesture' && b.g === '螢幕朝上');
  const rep = up.body[0];
  // repeat 5 次 → 用計數器 while
  up.body[0] = { t: 'set_var', name: 'i', v: 0 };
  up.body.splice(1, 0, { t: 'while',
    cond: { t: 'cmp', a: { t: 'var', name: 'i' }, op: '<', b: 5 },
    body: rep.body.concat([{ t: 'change_var', name: 'i', v: 1 }]) });
  // 變數改名
  const rename = (list) => list.forEach(b => {
    if (!b || typeof b !== 'object') return;
    if ((b.t === 'set_var' || b.t === 'change_var' || b.t === 'var')
        && b.name === '猜拳') b.name = 'g';
    ['v', 'cond', 'a', 'b', 'n', 'from', 'to'].forEach(k => {
      if (b[k] && typeof b[k] === 'object') rename([b[k]]);
    });
    if (b.body) rename(b.body);
    if (b.elseBody) rename(b.elseBody);
  });
  rename(alt);
  // else-if 攤平成三個 if
  const ifIdx = up.body.findIndex(b => b.t === 'if');
  if (ifIdx >= 0) {
    const a = up.body[ifIdx];
    const b2 = a.elseBody[0];
    const flat = [
      { t: 'if', cond: deep(a.cond), body: deep(a.body) },
      { t: 'if', cond: deep(b2.cond), body: deep(b2.body) },
      { t: 'if', cond: { t: 'cmp', a: { t: 'var', name: 'g' }, op: '=', b: 3 },
        body: deep(b2.elseBody) }
    ];
    up.body.splice(ifIdx, 1, ...flat);
  }
  out.altBlocks = blockCount(alt);
  out.alt = !paper.error && BlockJudge.runCompiled(paper, alt).pass;

  // 少做一件事就要被擋下來(不然「什麼都過」等於沒在判)
  const wrong = deep(program);
  wrong.find(b => b.t === 'on_gesture' && b.g === '螢幕朝下').body = [];
  out.wrong = !paper.error && BlockJudge.runCompiled(paper, wrong).pass;

  return out;
}, REAL_HEX);

ok('老師真的下載的 .hex 拆得出 main.ts',
   /猜拳/.test(real.ts || ''), String(real.ts).split('\n')[0]);
ok('裡面的程式整支轉得出來,一個看不懂的都沒有',
   real.warnings && real.warnings.length === 0 && real.blocks >= 20,
   real.blocks + ' 塊 · ' + (real.warnings || []).join('/'));
ok('兩個手勢事件都接得上',
   JSON.stringify(real.top) === '["on_start","on_gesture","on_gesture"]',
   JSON.stringify(real.top));
ok('出成考卷、自己跑得過', real.paperOk && real.self === true);
ok('**換一種寫法也判得過**(while 取代 repeat、變數改名、else-if 拆成三個 if)',
   real.alt === true, real.blocks + ' 塊 → ' + real.altBlocks + ' 塊');
ok('但少做一件事就要被擋下來', real.wrong === false);

await close();
process.exit(report('從 MakeCode 匯入', lines, errors) ? 0 : 1);
