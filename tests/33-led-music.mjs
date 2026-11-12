/* ============================================
   LED 與音效
   ────────────────────────────────────────────
   這兩類和前面幾類不一樣:它們做出來的東西**不一定在螢幕上**。
   所以這一套盯的是「看不見的那一半有沒有被判到」:

   1. 點亮 / 不點亮 / 切換 改的是**同一塊畫面** ——
      和「顯示 指示燈」「顯示 圖示」共用一份,
      不共用的話「顯示愛心之後再點亮一格」就會算錯。
   2. **聲音算在行為裡**:播錯音、沒播,都要被擋下來。
      只比螢幕的話,一首用聲音做的題目等於沒在判。
   3. 舊題目裡的「笑臉 / 哭臉」要自動換成 MakeCode 的講法,
      不換的話老師出好的題目會變成一塊空白畫面。
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
  const run = prog => {
    const paper = BlockJudge.compile({ solution: prog });
    return { paper, self: BlockJudge.runCompiled(paper, prog) };
  };

  // ── LED:點亮改的是同一塊畫面 ──
  const led = [{ t: 'on_start', body: [
    { t: 'show_icon', icon: '愛心' },
    { t: 'unplot', x: 0, y: 1 },
    { t: 'plot', x: 2, y: 0 },
    { t: 'toggle_point', x: 2, y: 0 }
  ] }];
  const ctx = BlockVM.newCtx(led);
  BlockVM.fire(ctx, { do: 'start' });
  out.leds = ctx.leds;
  out.heart = LED_ICONS['愛心'];

  // 點的狀態讀得到剛才點的那一格
  const ask = [{ t: 'on_start', body: [
    { t: 'plot', x: 1, y: 1 },
    { t: 'if', cond: { t: 'point', x: 1, y: 1 },
      body: [{ t: 'show_number', v: 7 }] }
  ] }];
  const c2 = BlockVM.newCtx(ask);
  const f2 = BlockVM.fire(c2, { do: 'start' });
  out.pointAsk = BlockVM.describeScreen(f2.screen);

  // 範圍外不要讓整支程式當掉
  const oob = [{ t: 'on_start', body: [{ t: 'plot', x: 9, y: 9 },
                                       { t: 'show_number', v: 1 }] }];
  const c3 = BlockVM.newCtx(oob);
  out.oob = BlockVM.describeScreen(BlockVM.fire(c3, { do: 'start' }).screen);

  // 長條圖
  const bar = [{ t: 'on_start', body: [{ t: 'bar_graph', v: 5, hi: 10 }] }];
  const c4 = BlockVM.newCtx(bar);
  BlockVM.fire(c4, { do: 'start' });
  out.bar = (c4.leds.match(/1/g) || []).length;

  // ── 音效 ──
  const song = [
    { t: 'on_start', body: [{ t: 'set_tempo', v: 120 }] },
    { t: 'on_button', btn: 'A', body: [
      { t: 'play_tone', note: '中音 C', beats: '1 拍', mode: 'until done' },
      { t: 'play_tone', note: '中音 E', beats: '1/2 拍', mode: 'until done' }] }
  ];
  const s1 = run(song);
  out.songSelf = s1.self.pass;
  out.songTrace = (s1.paper.expect.find(e => (e.sound || []).length) || {}).sound;

  // 播錯音
  const wrongNote = deep(song);
  wrongNote[1].body[1].note = '中音 G';
  const w1 = BlockJudge.runCompiled(s1.paper, wrongNote);
  out.wrongNote = w1.pass;
  out.wrongWhy = BlockJudge.explain(w1);

  // 完全沒播
  const silent = deep(song);
  silent[1].body = [];
  out.silent = BlockJudge.runCompiled(s1.paper, silent).pass;

  // 內建旋律
  const mel = [{ t: 'on_button', btn: 'A',
                 body: [{ t: 'play_sound', name: '快樂', mode: 'until done' }] }];
  const m1 = run(mel);
  const melWrong = deep(mel);
  melWrong[0].body[0].name = '悲傷';
  out.melSelf = m1.self.pass;
  out.melWrong = BlockJudge.runCompiled(m1.paper, melWrong).pass;

  // ── 舊名字自動換新 ──
  const oldProg = [{ t: 'on_start', body: [{ t: 'show_icon', icon: '笑臉' }] }];
  migrateProgram(oldProg);
  out.migrated = oldProg[0].body[0].icon;
  out.migratedDraws = BlockVM.describeScreen(
    BlockVM.fire(BlockVM.newCtx(oldProg), { do: 'start' }).screen);

  // ── 形狀:布林回傳的積木要標成六角形 ──
  out.boolShapes = ['point', 'cmp', 'logic', 'not', 'bool', 'btn_down', 'rand_bool']
    .every(t => blockDef(t).ret === 'bool');
  out.numShapes = ['op', 'random', 'volume', 'tempo', 'var']
    .every(t => blockDef(t).ret !== 'bool');

  // ── 匯入 ──
  const im = BlockImport.parse(
    'led.plot(1, 2)\nled.unplot(0, 0)\nmusic.setTempo(150)\n'
    + 'music.playTone(330, 250)\nmusic.stopAllSounds()\n');
  out.imWarn = im.warnings;
  out.imBlocks = im.program[0].body.map(b => b.t + (b.note ? ':' + b.note : ''));

  return out;
});

ok('點亮 / 不點亮 / 切換 改的是同一塊畫面(和顯示圖示共用)',
   r.leds !== r.heart && r.leds[5] === '0' && r.leds[2] === r.heart[2],
   r.leds);
ok('「點的狀態」讀得到剛才點亮的那一格', r.pointAsk === '7', r.pointAsk);
ok('座標超出範圍不會讓整支程式當掉', r.oob === '1', r.oob);
ok('長條圖:一半的值點亮一半的燈', r.bar === 13 || r.bar === 12, r.bar + ' 格');

ok('聲音會被記進行為裡', (r.songTrace || []).length === 2,
   JSON.stringify(r.songTrace));
ok('參考解答自己跑得過', r.songSelf === true);
ok('播錯一個音就擋得下來', r.wrongNote === false);
ok('而且講得出是聲音的問題', /應該播/.test(r.wrongWhy), r.wrongWhy);
ok('完全沒播也擋得下來(螢幕一樣,但沒出聲)', r.silent === false);
ok('內建旋律選錯一首也擋得下來',
   r.melSelf === true && r.melWrong === false);

ok('舊題目的「笑臉」自動換成 MakeCode 的「快樂」', r.migrated === '快樂', r.migrated);
ok('換名之後畫得出來(不會變成空白畫面)', r.migratedDraws === '圖案',
   r.migratedDraws);

ok('回傳是非題的積木都標成六角形', r.boolShapes === true);
ok('回傳數字的積木不是六角形', r.numShapes === true);

ok('MakeCode 的 LED 與音效程式匯得進來', r.imWarn.length === 0, r.imWarn.join('/'));
ok('而且音高換回最接近的音名',
   JSON.stringify(r.imBlocks) ===
   '["plot","unplot","set_tempo","play_tone:中音 E","stop_sound"]',
   JSON.stringify(r.imBlocks));

await close();
process.exit(report('LED 與音效', lines, errors) ? 0 : 1);
