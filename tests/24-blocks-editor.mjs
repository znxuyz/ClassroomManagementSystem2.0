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

/* 點面板上的某一塊積木(用上面的字找)。
   面板和 MakeCode 一樣是分類抽屜,所以要先切到那一類 —— 這一步就是
   孩子真的會做的動作。 */
const openCatFor = async label => page.evaluate(t => {
  for (const c of BLOCK_CATS) {
    BlockEditor.cat = c.id;
    BlockEditor.render();
    if ([...document.querySelectorAll('.bk-chip')]
        .some(x => x.textContent.trim().startsWith(t))) return c.id;
  }
  return null;
}, label);

const chip = async label => {
  const cat = await openCatFor(label);
  if (!cat) throw new Error('面板上找不到積木:' + label);
  await page.evaluate(t => {
    [...document.querySelectorAll('.bk-chip')]
      .find(x => x.textContent.trim().startsWith(t)).click();
  }, label);
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

/* ── 0. 面板的分類真的切得動 ──
   這一條是修完 bug 之後補的:分類按鈕畫出來了、按下去也有焦點框,
   但抽屜裡的積木完全沒換 —— 看起來像「其他類別的積木都不能用」。 */
const cats = await page.evaluate(() => {
  const out = [];
  const n = document.querySelectorAll('.bk-cat-tab').length;
  for (let i = 0; i < n; i++) {
    /* 每一輪都要重新抓 —— 點下去之後面板整個重畫,
       舊的那些按鈕已經不在畫面上了(抓著舊的點,事件根本不會發生)。 */
    const tab = document.querySelectorAll('.bk-cat-tab')[i];
    tab.click();
    out.push({
      name: tab.textContent.trim(),
      cat: BlockEditor.cat,
      chips: [...document.querySelectorAll('.bk-chip')].map(c => c.textContent.trim())
    });
  }
  return out;
});
ok('每一個分類按下去都會換成那一類的積木',
   cats.length >= 6
   && cats.every(c => c.chips.length > 0)
   && new Set(cats.map(c => c.chips.join('|'))).size === cats.length,
   cats.map(c => c.name + ':' + c.chips.length).join(' / '));
ok('分類裡真的是那一類的積木',
   (cats.find(c => c.name === '迴圈') || {}).chips?.join().includes('重複')
   && (cats.find(c => c.name === '變數') || {}).chips?.join().includes('設為'),
   JSON.stringify((cats.find(c => c.name === '迴圈') || {}).chips));

// 回到基本,下面的步驟才從同一個起點開始
await page.evaluate(() => { BlockEditor.cat = 'basic'; BlockEditor.render(); });

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

/* ============================================
   拖曳(和真的 MakeCode 一樣)
   ────────────────────────────────────────────
   用 pointer 事件,所以滑鼠、觸控板、觸控螢幕走同一條路;
   這裡用 Playwright 的滑鼠模擬,等於真的拖一次。
============================================ */
const chipBox = async label => {
  await openCatFor(label);
  /* 先把編輯器捲進畫面 —— 面板在畫面外的話,滑鼠事件根本落不到它身上
     (而那不是產品的問題,是測試沒把它捲進來) */
  await page.evaluate(() => {
    document.querySelector('.bk-editor').scrollIntoView({ block: 'center' });
  });
  return page.evaluate(t => {
    const b = [...document.querySelectorAll('.bk-chip')]
      .find(x => x.textContent.trim().startsWith(t));
    if (!b) return null;
    b.scrollIntoView({ block: 'nearest' });
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, label);
};

const dragTo = async (from, to) => {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 20, from.y + 10, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.waitForTimeout(60);
  await page.mouse.up();
  await page.waitForTimeout(80);
};

// 清空,從頭用拖的
await page.evaluate(() => { BlockEditor.program = []; BlockEditor.changed(); });

const workBox = await page.evaluate(() => {
  document.querySelector('.bk-editor').scrollIntoView({ block: 'center' });
  const r = document.querySelector('.bk-work').getBoundingClientRect();
  return { x: r.left + 120, y: r.top + 40 };
});
await dragTo(await chipBox('當啟動時'), workBox);
ok('從面板把帽子拖進工作區',
   await page.evaluate(() => BlockEditor.program.length === 1
     && BlockEditor.program[0].t === 'on_start'));

const bodyBox = await page.evaluate(() => {
  document.querySelector('.bk-editor').scrollIntoView({ block: 'center' });
  const c = document.querySelector('.bk-body .bk-cursor');
  if (!c) throw new Error('沒有可以放的位置,目前的程式是:'
    + JSON.stringify(BlockEditor.value()));
  const r = c.getBoundingClientRect();
  return { x: r.left + 40, y: r.top + 8 };
});
await dragTo(await chipBox('顯示數字'), bodyBox);
ok('拖進帽子的肚子裡就會變成它的內容',
   await page.evaluate(() => (BlockEditor.program[0].body || []).length === 1
     && BlockEditor.program[0].body[0].t === 'show_number'));

// 變數拖進數字格
await page.evaluate(() => { BlockEditor.vars = ['步數']; BlockEditor.render(); });
const numSlot = await page.evaluate(() => {
  document.querySelector('.bk-editor').scrollIntoView({ block: 'center' });
  const w = document.querySelector('.bk-numwrap');
  const r = w.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
await dragTo(await chipBox('步數'), numSlot);
ok('把變數拖進數字格,那一格就變成變數',
   await page.evaluate(() => {
     const v = BlockEditor.program[0].body[0].v;
     return v && v.t === 'var' && v.name === '步數';
   }));

// 拖回面板 = 丟掉
const blkHead = await page.evaluate(() => {
  document.querySelector('.bk-editor').scrollIntoView({ block: 'center' });
  const h = document.querySelectorAll('.bk-body .bk-blk > .bk-head')[0];
  const r = h.getBoundingClientRect();
  return { x: r.left + 30, y: r.top + r.height / 2 };
});
const paletteBox = await page.evaluate(() => {
  const r = document.querySelector('.bk-palette').getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + 60 };
});
await dragTo(blkHead, paletteBox);
ok('把積木拖回面板就是丟掉',
   await page.evaluate(() => (BlockEditor.program[0].body || []).length === 0));

// 不能把積木放進它自己的肚子裡(會變成一個圈,畫面直接當掉)
const selfDrop = await page.evaluate(() => {
  const outer = BlockEditor.program[0];
  BlockEditor.drag = { blk: outer, from: null, ghost: document.createElement('div'),
                       kind: 'event', offX: 0, offY: 0 };
  const fake = document.createElement('div');
  fake.dataset.parent = outer.id;
  fake.dataset.list = 'body';
  fake.dataset.index = '0';
  BlockEditor.finishDrag(fake, false);
  // 沒有變成自己包自己,而且還在最外層
  return BlockEditor.program.length === 1
    && (BlockEditor.program[0].body || []).every(b => b.id !== outer.id);
});
ok('不能把積木放進它自己的肚子裡', selfDrop);

await close();
process.exit(report('積木挑戰:編輯器', lines, errors) ? 0 : 1);
