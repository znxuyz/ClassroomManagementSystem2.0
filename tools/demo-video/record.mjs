/* ============================================
   功能介紹影片 — 錄影
   ────────────────────────────────────────────
   用真的程式錄,不是做動畫:畫面上看到的每一個反應都是系統真的跑出來的。
   資料用 tests/lib.mjs 的假雲端 + 一份像真班級的 fixture,
   所以不會動到正在上課的那個 Firestore。

   分成兩段錄:
     teacher  1280×720   老師端(電腦)
     student   390×844   學生端(手機)—— 之後由 build.sh 放進手機外框裡

   字幕是**燒在畫面上**的(投影時不必另外載字幕檔),
   同時也輸出一份 .srt,之後要上字幕平台或翻譯都用得上。

   用法:
     node tools/demo-video/record.mjs teacher
     node tools/demo-video/record.mjs student
============================================ */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { loadPlaywright, prepare } from '../../tests/lib.mjs';

const part = process.argv[2] || 'teacher';
const OUT = process.argv[3] || '/tmp/demo';
mkdirSync(OUT, { recursive: true });

const SIZE = part === 'student' ? { width: 390, height: 844 }
                                : { width: 1280, height: 720 };

const chromium = await loadPlaywright();
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: SIZE,
  deviceScaleFactor: 2,                 // 錄出來才不會糊
  recordVideo: { dir: OUT + '/raw-' + part, size: SIZE }
});
const page = await context.newPage();
page.on('pageerror', e => console.log('  ⚠ 頁面錯誤:', e.message));

const INDEX = 'file://' + new URL('../../index.html', import.meta.url).pathname;
await page.goto(INDEX);
await page.waitForFunction(() => typeof serializeState === 'function');

/* 疊層先上,而且立刻蓋一張標題卡 ——
   後面所有的準備工作(塞資料、開班)都在它後面做完,
   影片從第一格開始就是乾淨的。 */
await page.addScriptTag({ content: readFileSync(
  new URL('./overlay.js', import.meta.url).pathname, 'utf8') });
await page.evaluate(() => { window.__demo.init(); });
await page.evaluate(() => window.__demo.title('守護獸學園', ''));

await prepare(page);
await page.addScriptTag({ content: readFileSync(
  new URL('./fixture.js', import.meta.url).pathname, 'utf8') });
await page.evaluate(() => { window.__apply(window.__demoFixture()); });

/* 學生端是用 390 寬錄的:字幕燒在那個寬度上會變成四行、蓋掉半個畫面。
   所以這一段**不在頁面上畫字幕**,只記下時間,
   之後在 1280×720 的成品上用字幕檔燒 —— 那裡才有寬度可以排。 */
const burnCaption = part !== 'student';

/* ---------- 小工具 ---------- */
const t0 = Date.now();
const subs = [];
let cur = null;

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* 字幕。前一句的結束時間就是這一句的開始時間 —— 中間不留空白,
   觀眾的眼睛才不會一直在「有字/沒字」之間跳。 */
async function cap(text) {
  const at = Date.now() - t0;
  if (cur) { cur.end = at; subs.push(cur); }
  cur = text ? { start: at, end: at, text } : null;
  if (burnCaption) await page.evaluate(t => window.__demo.caption(t), text || '');
}

async function chapter(text) {
  if (burnCaption) await page.evaluate(t => window.__demo.chapter(t), text || '');
}

async function point(sel, opt) {
  await page.evaluate(([s, o]) => window.__demo.point(s, o), [sel, opt || {}]);
  await sleep(520);
}

/* 點下去:游標先移過去、閃一下,再真的按。
   直接按的話,觀眾只會看到畫面自己變了。 */
async function click(sel, opt) {
  await point(sel, opt);
  await page.evaluate(() => window.__demo.tap());
  await sleep(160);
  await page.evaluate(s => {
    const el = document.querySelector(s);
    if (el) el.click();
  }, sel);
  await sleep((opt && opt.after) || 700);
}

async function go(group, view, sub) {
  await page.evaluate(([g, v, s]) => navGoItem(g, v, s), [group, view, sub || '']);
  await sleep(600);
}

/* ---------- 場景 ---------- */
const scenes = (await import(`./scenes-${part}.mjs`)).default;

for (const scene of scenes) {
  if (scene.chapter !== undefined) await chapter(scene.chapter);
  await scene.run({ page, cap, click, point, go, sleep, chapter });
}
await cap(null);
await sleep(600);

await context.close();
await browser.close();

/* ---------- 字幕檔 ---------- */
const ts = ms => {
  const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
  const m = String(Math.floor(ms / 60000) % 60).padStart(2, '0');
  const s = String(Math.floor(ms / 1000) % 60).padStart(2, '0');
  const x = String(ms % 1000).padStart(3, '0');
  return `${h}:${m}:${s},${x}`;
};
writeFileSync(OUT + `/${part}.srt`,
  subs.map((s, i) => `${i + 1}\n${ts(s.start)} --> ${ts(s.end)}\n${s.text}\n`).join('\n'));
writeFileSync(OUT + `/${part}.json`, JSON.stringify({ ms: Date.now() - t0, subs }, null, 2));
console.log(`${part}:${Math.round((Date.now() - t0) / 1000)} 秒,${subs.length} 句字幕`);
