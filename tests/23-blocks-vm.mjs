/* ============================================
   積木挑戰:直譯器與判對錯
   ────────────────────────────────────────────
   這一套盯的是整個模式成立與否的那一件事:

     **同一個功能的不同拼法,都要被判對。**

   如果這件事不成立,孩子會明明做出來了卻被判錯 —— 那比沒有這個功能
   更傷。所以下面用「計步器」這一題,寫了五種真的會出現在課堂上的
   正確拼法,五種都必須過;另外寫了幾種真的錯的,必須不過。

   還有兩件事也在這裡釘住:
   · 無限迴圈要被攔下來,而且要講出「可能是無限迴圈」
   · 參考解答自己跑不動時要標成「題目有問題」,不要算學生錯
============================================ */
import { loadPlaywright, openApp, prepare, report } from './lib.mjs';

const chromium = await loadPlaywright();
const { page, errors, close } = await openApp(chromium);
await prepare(page);

const lines = [];
const ok = (n, c, e) => lines.push((c ? '✓ ' : '✗ ') + n + (e ? ' — ' + e : ''));

const r = await page.evaluate(() => {
  const out = {};
  const N = v => ({ t: 'num', v });
  const V = name => ({ t: 'var', name });

  /* ── 題目:計步器 ──
     開機步數歸零並顯示;搖一下 +1 並顯示;A+B 歸零並顯示。 */
  const solution = [
    { t: 'on_start', body: [
      { t: 'set_var', name: '步數', v: N(0) },
      { t: 'show_number', v: V('步數') }
    ] },
    { t: 'on_gesture', g: '搖動', body: [
      { t: 'change_var', name: '步數', v: N(1) },
      { t: 'show_number', v: V('步數') }
    ] },
    { t: 'on_button', btn: 'A+B', body: [
      { t: 'set_var', name: '步數', v: N(0) },
      { t: 'show_number', v: V('步數') }
    ] }
  ];

  const task = { solution, script: BlockJudge.scriptFor(solution) };
  out.scriptLen = task.script.length;
  out.scriptLabels = task.script.map(s => s.label);

  const judge = p => BlockJudge.run(task, p);

  // 1. 一模一樣 —— 當然要過
  out.same = judge(JSON.parse(JSON.stringify(solution))).pass;

  // 2. 變數名字不一樣(英文)
  const renamed = JSON.parse(JSON.stringify(solution).replace(/步數/g, 'steps'));
  out.renamed = judge(renamed).pass;

  // 3. 顯示放在「重複無限次」裡,事件裡只算數 —— 這是很常見的寫法
  const forever = [
    { t: 'on_start', body: [{ t: 'set_var', name: 'n', v: N(0) }] },
    { t: 'forever', body: [{ t: 'show_number', v: V('n') }] },
    { t: 'on_gesture', g: '搖動', body: [{ t: 'change_var', name: 'n', v: N(1) }] },
    { t: 'on_button', btn: 'A+B', body: [{ t: 'set_var', name: 'n', v: N(0) }] }
  ];
  out.forever = judge(forever).pass;

  // 4. 歸零用「改變 -目前值」而不是「設為 0」
  const minus = JSON.parse(JSON.stringify(solution));
  minus[2].body[0] = { t: 'change_var', name: '步數',
    v: { t: 'op', op: '×', a: V('步數'), b: N(-1) } };
  out.minus = judge(minus).pass;

  // 5. 多包一層沒有影響的「如果 1 = 1」
  const wrapped = JSON.parse(JSON.stringify(solution));
  wrapped[1].body = [{ t: 'if', cond: { t: 'cmp', op: '=', a: N(1), b: N(1) },
                       body: wrapped[1].body, elseBody: [] }];
  out.wrapped = judge(wrapped).pass;

  // ── 真的錯的,必須不過 ──
  // A. 搖動用「設為 1」而不是「加 1」(搖第二下還是 1)
  const setOne = JSON.parse(JSON.stringify(solution));
  setOne[1].body[0] = { t: 'set_var', name: '步數', v: N(1) };
  const rSetOne = judge(setOne);
  out.setOne = [rSetOne.pass, rSetOne.steps[rSetOne.firstFail] &&
                               rSetOne.steps[rSetOne.firstFail].label];

  // B. 忘了做 A+B 歸零
  const noReset = [solution[0], solution[1]];
  out.noReset = judge(noReset).pass;

  // C. 算了但沒顯示
  const noShow = JSON.parse(JSON.stringify(solution));
  noShow[1].body.pop();
  out.noShow = judge(noShow).pass;

  // D. 開機沒有歸零(顯示的是空白)
  const noInit = [solution[1], solution[2]];
  out.noInit = judge(noInit).pass;

  // ── 失敗時的說明要講得出「哪一步、應該多少、你是多少」──
  out.explain = BlockJudge.explain(rSetOne);

  // ── 無限迴圈要被攔下來 ──
  const loop = [{ t: 'on_start', body: [
    { t: 'while', cond: { t: 'cmp', op: '=', a: N(1), b: N(1) },
      body: [{ t: 'change_var', name: 'x', v: N(1) }] }
  ] }];
  const rLoop = judge(loop);
  out.loop = [rLoop.pass, !!rLoop.error, rLoop.error && rLoop.error.message.includes('無限迴圈')];

  // ── 參考解答自己壞掉時,要標成題目有問題 ──
  const badTask = { solution: loop, script: [{ do: 'start', label: '開機' }] };
  out.badTask = BlockJudge.run(badTask, []).badTask === true;

  // ── 拼不完整的,先講清楚,不要讓他等判完 ──
  out.pre = [
    BlockJudge.precheck([]),
    BlockJudge.precheck([{ t: 'show_number', v: N(1) }]),
    BlockJudge.precheck([{ t: 'on_gesture', g: '搖動', body: [] }]),
    BlockJudge.precheck([{ t: 'on_start', body: [{ t: 'show_number', v: null }] }]),
    BlockJudge.precheck(solution)
  ];

  // ── 圖示與自己畫的同一個圖案,要判成同一件事 ──
  const icon = [{ t: 'on_start', body: [{ t: 'show_icon', icon: '愛心' }] }];
  const leds = [{ t: 'on_start', body: [{ t: 'show_leds', grid: LED_ICONS['愛心'] }] }];
  out.iconSame = BlockJudge.run(
    { solution: icon, script: [{ do: 'start', label: '開機' }] }, leds).pass;

  // ── 隨機數要可以重現(同一支程式判兩次結果一樣)──
  const rnd = [{ t: 'on_start', body: [
    { t: 'show_number', v: { t: 'random', from: N(1), to: N(100) } }] }];
  const t1 = BlockVM.runScript(rnd, [{ do: 'start' }]);
  const t2 = BlockVM.runScript(rnd, [{ do: 'start' }]);
  out.rndStable = JSON.stringify(t1.trace) === JSON.stringify(t2.trace);

  // ── 進度分數:對一半就該看得到一半 ──
  out.partial = BlockJudge.score(judge(noReset));

  return out;
});

ok('自動排出來的劇本涵蓋每一種事件,而且不只做一次',
   r.scriptLen >= 7 && r.scriptLabels.includes('搖動第 2 次')
   && r.scriptLabels.includes('按下 A+B'),
   r.scriptLabels.join(' / '));

ok('和老師一模一樣 → 過', r.same);
ok('變數改名字 → 一樣過', r.renamed);
ok('顯示放在「重複無限次」裡 → 一樣過', r.forever);
ok('歸零用「改變 −目前值」 → 一樣過', r.minus);
ok('多包一層不影響的「如果」 → 一樣過', r.wrapped);

ok('搖動用「設為 1」→ 不過(而且指得出是搖第二下開始錯)',
   r.setOne[0] === false && String(r.setOne[1]).includes('第 2 次'), r.setOne[1]);
ok('忘了 A+B 歸零 → 不過', r.noReset === false);
ok('有算但沒顯示 → 不過', r.noShow === false);
ok('開機沒歸零 → 不過', r.noInit === false);

ok('說明講得出「哪一步、應該多少、你是多少」',
   r.explain.includes('搖動第 2 次') && r.explain.includes('應該') && r.explain.includes('2'),
   r.explain);

ok('無限迴圈會被攔下來,而且講得出可能是無限迴圈',
   r.loop[0] === false && r.loop[1] && r.loop[2]);
ok('參考解答自己跑不動時,標成題目有問題(不算學生錯)', r.badTask);

ok('空工作區有提示', (r.pre[0] || '').includes('空的'));
ok('積木沒放在事件裡有提示', (r.pre[1] || '').includes('事件'));
ok('事件裡面是空的有提示', (r.pre[2] || '').includes('空的'));
ok('有空格沒填有提示', (r.pre[3] || '').includes('空格'));
ok('拼得完整時不囉嗦', r.pre[4] === null);

ok('「顯示圖示 愛心」和「自己畫出愛心」判成同一件事', r.iconSame);
ok('隨機數可以重現(同一支程式判兩次一樣)', r.rndStable);
ok('只做對一部分時看得到進度', r.partial > 0 && r.partial < 100, r.partial + '%');

await close();
process.exit(report('積木挑戰:直譯器與判對錯', lines, errors) ? 0 : 1);
