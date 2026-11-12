/* ============================================
   廣播,以及那兩台 micro:bit
   ────────────────────────────────────────────
   一台 micro:bit **收不到自己發出去的廣播**。只給一台的話,孩子把程式
   拼對了也什麼都不會發生,然後開始亂改 —— 所以用到廣播時模擬器會變成
   兩台,跑同一支程式(就像兩片板子燒同一個檔案)。

   這一套盯四件事:

   1. 用到廣播才變兩台,沒用到就還是一台(平常不要多一台沒用的)。
   2. 在第 1 台按,第 2 台要真的收到;**第 1 台自己不會收到**。
   3. **群組不一樣就收不到** —— 不然「廣播群組設為」那塊積木是裝飾品。
   4. 判題要把「發出去的封包」也算進去。只看螢幕的話,
      「該廣播卻沒廣播」會被判成對的,那一題等於沒在考廣播。
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

  /* 按 A 廣播 7;收到廣播就把收到的數字顯示出來 */
  const prog = [
    { t: 'on_start', body: [{ t: 'radio_group', n: 1 }] },
    { t: 'on_button', btn: 'A', body: [{ t: 'radio_number', v: 7 }] },
    { t: 'on_radio_number', name: 'receivedNumber',
      body: [{ t: 'show_number', v: { t: 'var', name: 'receivedNumber' } }] }
  ];

  // ── 判題 ──
  const paper = BlockJudge.compile({ solution: prog });
  out.script = paper.script.map(s => s.label);
  out.self = BlockJudge.runCompiled(paper, prog).pass;

  // 忘記廣播:螢幕完全一樣,但應該要被擋下來
  const noSend = deep(prog);
  noSend[1].body = [];
  const bad = BlockJudge.runCompiled(paper, noSend);
  out.badPass = bad.pass;
  out.badWhy = BlockJudge.explain(bad);

  // 廣播錯的數字
  const wrongNum = deep(prog);
  wrongNum[1].body[0].v = 3;
  out.wrongNum = BlockJudge.runCompiled(paper, wrongNum).pass;

  // 不管收到什麼都顯示同一個數字 —— 劇本送了三個不同的值,所以擋得下來
  const fixed = deep(prog);
  fixed[2].body[0].v = 1;
  out.fixed = BlockJudge.runCompiled(paper, fixed).pass;

  // ── 模擬器 ──
  const host = document.createElement('div');
  document.body.appendChild(host);

  BlockSim.mount(host, [{ t: 'on_button', btn: 'A',
                          body: [{ t: 'show_number', v: 1 }] }]);
  out.oneDevice = BlockSim.devs.length;

  BlockSim.setProgram(prog);
  out.twoDevices = BlockSim.devs.length;
  out.pairUi = !!host.querySelector('.sim-pair');

  BlockSim.act('press', 'A', 0);
  out.afterPress = BlockSim.devs.map(d => BlockVM.describeScreen(d.ctx.screen));

  // 第 2 台按,換第 1 台收到
  BlockSim.act('press', 'A', 1);
  out.afterPress2 = BlockSim.devs.map(d => BlockVM.describeScreen(d.ctx.screen));

  // ── 群組不一樣就收不到 ──
  BlockSim.setProgram(prog);
  BlockSim.devs[1].ctx.group = 5;
  BlockSim.act('press', 'A', 0);
  out.otherGroup = BlockSim.devs.map(d => BlockVM.describeScreen(d.ctx.screen));

  // ── 從 MakeCode 匯入 ──
  const im = BlockImport.parse(
    'radio.setGroup(1)\n' +
    'input.onButtonPressed(Button.A, function () {\n    radio.sendNumber(7)\n})\n' +
    'radio.onReceivedNumber(function (receivedNumber) {\n' +
    '    basic.showNumber(receivedNumber)\n})\n');
  out.imWarn = im.warnings;
  out.imTop = im.program.map(b => b.t);
  out.imSame = BlockJudge.runCompiled(paper, im.program).pass;

  return out;
});

ok('劇本會送幾個**不一樣**的值進來(才看得出是不是照收到的做)',
   r.script.filter(s => s.indexOf('收到廣播數字') === 0).length === 3,
   r.script.join(' / '));
ok('參考解答自己跑得過', r.self === true);

ok('忘記廣播要被擋下來(螢幕一樣,但沒送出去)', r.badPass === false);
ok('而且講得出是廣播的問題,不是螢幕的問題',
   /應該廣播數字 7/.test(r.badWhy), r.badWhy);
ok('廣播錯的數字也擋得下來', r.wrongNum === false);
ok('不管收到什麼都顯示同一個數字 → 擋得下來', r.fixed === false);

ok('沒用到廣播就只有一台', r.oneDevice === 1, r.oneDevice + ' 台');
ok('用到廣播就變成兩台', r.twoDevices === 2 && r.pairUi, r.twoDevices + ' 台');
ok('在第 1 台按,第 2 台收到;**第 1 台自己收不到**',
   r.afterPress[0] === '(空白)' && r.afterPress[1] === '7',
   r.afterPress.join(' / '));
ok('反過來也一樣', r.afterPress2[0] === '7', r.afterPress2.join(' / '));
ok('群組不一樣就收不到',
   r.otherGroup[0] === '(空白)' && r.otherGroup[1] === '(空白)',
   r.otherGroup.join(' / '));

ok('MakeCode 的廣播程式匯得進來,一個看不懂的都沒有',
   r.imWarn.length === 0, r.imWarn.join('/'));
ok('匯進來的事件是分開的三塊,不會被包進「當啟動時」',
   JSON.stringify(r.imTop) === '["on_start","on_button","on_radio_number"]',
   JSON.stringify(r.imTop));
ok('而且判起來和手拼的那一份一樣', r.imSame === true);

await close();
process.exit(report('廣播與兩台 micro:bit', lines, errors) ? 0 : 1);
