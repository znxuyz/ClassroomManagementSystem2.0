/* 不開瀏覽器就能查的事 —— 幾個踩過不只一次的坑。
   跑在最前面,因為它最快而且錯了就不必再跑後面的。 */
import { readFileSync, readdirSync } from 'node:fs';
import { report } from './lib.mjs';

const root = new URL('..', import.meta.url).pathname;
const read = p => readFileSync(root + p, 'utf8');
const html = read('index.html');
const lines = [];
const ok = (n, c, e) => lines.push((c ? '✓ ' : '✗ ') + n + (e ? ' — ' + e : ''));

/* ── 1. 每個 js 檔都真的被 index.html 載入 ── */
const walk = d => readdirSync(root + d, { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? walk(d + e.name + '/')
                                : (e.name.endsWith('.js') ? [d + e.name] : []));
const files = walk('js/');
const missing = files.filter(f => !html.includes('src="' + f));
ok('每個 js 檔都有被 index.html 載入', missing.length === 0, missing.join(', '));

/* ── 2. 快取版號要一致 ──
   漏掉一個的話,老師的瀏覽器會拿舊的那一支配新的其他支,
   症狀是「某個函式不存在」,而且只在部分裝置上發生,很難查。 */
const vers = [...html.matchAll(/\?v=([0-9a-z]+)/g)].map(m => m[1]);
ok('所有 ?v= 快取版號都一樣', new Set(vers).size === 1,
   [...new Set(vers)].join(', '));

/* ── 3. CSS 變數都有定義 ──
   踩過兩次:新的 css 用了一組根本不存在的變數名,畫面看起來「沒套到樣式」
   但 console 不會報任何錯。 */
const css = readdirSync(root + 'css').filter(f => f.endsWith('.css'))
  .map(f => read('css/' + f)).join('\n');
/* 變數也可能是 JS 在 style="--g:…" 裡逐個元素設的(例如每一組的顏色),
   所以定義要連 js/ 一起找,不然會誤報。 */
const jsAll = files.map(f => read(f)).join('\n');
const defined = new Set([
  ...[...css.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gmi)].map(m => m[1]),
  ...[...jsAll.matchAll(/(--[a-z0-9-]+)\s*:/g)].map(m => m[1])
]);
const used = new Set([...css.matchAll(/var\(\s*(--[a-z0-9-]+)/g)].map(m => m[1]));
const undef = [...used].filter(v => !defined.has(v));
ok('CSS 變數都有定義', undef.length === 0, undef.join(', '));

/* ── 3b. 卡片層級的圓角要用代幣 ──
   盤點過一次:卡片類的元素曾經用了 3/4/6/8/9/10/12/16px 八種圓角,
   同一種東西在不同頁面長得不一樣 —— 這是整個專案看起來「東拼西湊」
   最主要的原因之一,而且比配色更容易被看出來。
   收斂成 --r-card / --r-tile / --r-pill 三階之後,這一項負責讓它不再漂掉。

   判斷方式:一個規則如果同時有 border-radius、padding ≥ 10px、
   以及 background 或 border,那它就是「一塊卡片」,圓角必須用代幣。
   小的裝飾(徽章、圓點、進度條)不在此限。 */
const cardBlocks = [];
for (const f of readdirSync(root + 'css').filter(x => x.endsWith('.css'))) {
  const text = read('css/' + f);
  for (const m of text.matchAll(/([.#][^{}]*?)\{([^}]*)\}/g)) {
    const sel = m[1].trim(), body = m[2];
    const r = body.match(/border-radius:\s*([0-9]+)px/);
    if (!r) continue;
    const pad = body.match(/padding:\s*([0-9]+)px/);
    if (!pad || Number(pad[1]) < 10) continue;
    if (!/background|border:/.test(body)) continue;
    const px = Number(r[1]);
    if (px < 3 || px > 20) continue;          // 50%、999px 這種不是卡片圓角
    cardBlocks.push(`${f} ${sel.split('\n')[0].slice(0, 40)} = ${px}px`);
  }
}
ok('卡片層級的圓角都用代幣(--r-card / --r-tile)',
   cardBlocks.length === 0, cardBlocks.slice(0, 6).join(' · '));

/* ── 3c. 卡片的內距也要用代幣 ──
   同樣是「一塊卡片」,內距曾經出現 33 種不同的值。圓角統一之後,
   這就變成最明顯的不整齊。收斂成 --pad-sm / --pad / --pad-lg 三階
   (保留「緊湊 / 一般 / 寬鬆」的意圖,不是壓成同一個值)。

   列印版面、登入頁、投影模式、全螢幕浮層刻意不在此限 ——
   那些是「另一種介面」,照一般卡片的尺度反而會怪。 */
const PAD_FREE = ['.report-page', '.gate-card', '.modal', '.contact-print-preview',
  '.setup-container', '.projector-card', '.hud-panel', '.pet-picker',
  '.war-result-card', '.ai-key-setup', '.action-panel', '.timer-stage', '.picker-stage'];
const rawPad = [];
for (const f of readdirSync(root + 'css').filter(x => x.endsWith('.css'))) {
  const text = read('css/' + f);
  for (const m of text.matchAll(/([.#][^{}]*?)\{([^}]*)\}/g)) {
    const sel = m[1].trim(), body = m[2];
    if (!body.includes('border-radius: var(--r-card)')) continue;
    if (PAD_FREE.some(x => sel.includes(x))) continue;
    const pm = body.match(/padding:\s*([^;]+);/);
    if (!pm) continue;
    const raw = pm[1].trim();
    if (raw.includes('var(') || raw.includes('env(')) continue;
    rawPad.push(`${f} ${sel.split('\n')[0].slice(0, 34)} = ${raw}`);
  }
}
ok('卡片的內距都用代幣(--pad-sm / --pad / --pad-lg)',
   rawPad.length === 0, rawPad.slice(0, 5).join(' · '));

/* ── 4. 存檔是對稱的 ──
   serializeState() 寫出去的欄位,applyBlobToState() 要讀回來,
   而且都要列在 KNOWN_BLOB_KEYS 裡(沒列的會被當成「未知欄位」原封帶回,
   等於這個版本永遠改不動它)。 */
const storage = read('js/03-storage.js');
const session = read('js/00b-session.js');
const known = new Set([...(storage.match(/KNOWN_BLOB_KEYS = \[[^\]]*\]/s) || [''])[0]
  .matchAll(/'([a-zA-Z]+)'/g)].map(m => m[1]));
const written = new Set([...(storage.match(/function serializeState\(\)[\s\S]*?\n}/) || [''])[0]
  .matchAll(/^\s{4}([a-zA-Z]+):/gm)].map(m => m[1]));
const notKnown = [...written].filter(k => !known.has(k));
ok('serializeState 寫的每個欄位都列在 KNOWN_BLOB_KEYS',
   notKnown.length === 0, notKnown.join(', '));
const notRead = [...written].filter(k =>
  k !== 'schema' && !new RegExp('blob\\.' + k + '\\b').test(session));
ok('serializeState 寫的每個欄位都有被讀回來', notRead.length === 0, notRead.join(', '));

/* ── 5. 每個子集合都要有安全規則 ──
   少一條的話那個集合會沿用上層規則,通常就是「誰都讀得到」。 */
const firebase = read('js/00-firebase.js');
const rules = read('firestore.rules');
const collections = new Set([...firebase.matchAll(/\.collection\('([a-zA-Z]+)'\)/g)]
  .map(m => m[1]).filter(c => c !== 'classes' && c !== 'users'));
const noRule = [...collections].filter(c => !rules.includes('match /' + c + '/'));
ok('每個用到的子集合都有安全規則', noRule.length === 0, noRule.join(', '));

/* ── 6. 相容 SDK 沒有 .create() ──
   踩過一次:.create() 是伺服器端 SDK 才有的,相容版沒有,
   而且錯誤訊息完全看不出是這個原因。 */
ok('沒有用到相容 SDK 不存在的 .create()', !/\.doc\([^)]*\)\.create\(/.test(firebase));

/* ── 7. 載入時就用到的常數,要在更早載入的檔案裡定義 ──
   踩過兩次:常數寫在後面才載入的檔案裡,但 02-state.js 的初始值就用到了,
   開班直接 ReferenceError(而且只在雲端模式才會走到,本機測不出來)。 */
const order = [...html.matchAll(/src="(js\/[^"?]+)/g)].map(m => m[1]);
const stateIdx = order.indexOf('js/02-state.js');
const earlier = order.slice(0, stateIdx).map(f => read(f)).join('\n');
const usedConsts = [...read('js/02-state.js').matchAll(/\.\.\.([A-Z][A-Z0-9_]+)/g)].map(m => m[1]);
const lateConsts = [...new Set(usedConsts)]
  .filter(c => !new RegExp('const ' + c + '\\b').test(earlier));
ok('02-state.js 用到的常數都在更早載入的檔案裡定義',
   lateConsts.length === 0, lateConsts.join(', '));

process.exit(report('靜態檢查', lines, []) ? 0 : 1);
