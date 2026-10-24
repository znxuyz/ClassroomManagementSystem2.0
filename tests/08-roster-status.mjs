/* 系統設定裡的「各班名冊」狀態與一鍵補建。
   重點:狀態要真的去查雲端(不能只看這個分頁寫過沒),
   而且補建不必一個班一個班開。 */
import { loadPlaywright, openApp, prepare, okSrc, report } from './lib.mjs';

const chromium = await loadPlaywright();
const { page, errors, close } = await openApp(chromium);
await page.evaluate(okSrc);
await prepare(page);

const lines = await page.evaluate(async () => {
  const t = window.__mk(), db = window.__db;
  const f = window.__fixture();
  window.__apply(f);
  showApp();

  // 五個班,各自有自己的主文件
  const blobs = {};
  ['C1', 'C2', 'C3', 'C4', 'C5'].forEach((id, i) => {
    const b = JSON.parse(JSON.stringify(db.blob));
    b.className = '測試班' + (i + 1);
    b.students = b.students.slice(0, 5 + i);
    blobs[id] = b;
  });
  state.myClasses = Object.keys(blobs).map(id => ({ id, className: blobs[id].className }));

  const rosters = {}, mine = {};
  Cloud.loadClass = async id => ({ blob: blobs[id] });
  Cloud.loadPublicRoster = async id => rosters[id] || null;
  Cloud.savePublicRoster = async (id, r) => { rosters[id] = JSON.parse(JSON.stringify(r)); };
  Cloud.saveStudentPrivate = async (id, d) => {
    mine[id] = { ...(mine[id] || {}), ...JSON.parse(JSON.stringify(d)) };
    return Object.keys(d).length;
  };

  // ── 一個都沒有 ──
  await renderRosterStatus();
  let box = document.getElementById('rosterStatus');
  t.ok('五個班都列出來', box.querySelectorAll('.roster-row').length === 5);
  t.ok('全部標示為尚未建立', box.querySelectorAll('.roster-mark.is-miss').length === 5);
  t.ok('有「還有幾班沒建立」的提示', box.textContent.includes('還有 5 班沒建立'));
  t.ok('有一鍵補建的按鈕', /幫這 5 個班建立名冊/.test(box.innerHTML));

  // ── 一鍵補建 ──
  window.toast = () => {};
  await buildAllRosters();
  t.ok('五個班的名冊都建好了', Object.keys(rosters).length === 5, Object.keys(rosters).join(','));
  /* C1 是現在開著的那個班,刻意用 state 而不是雲端讀回來的主文件 ——
     state 可能有還沒存上去的變更,讀回來的會是舊的。 */
  const others = Object.keys(blobs).filter(id => id !== 'C1');
  t.ok('沒開著的班:人數照該班的主文件',
    others.every(id => rosters[id].students.length === blobs[id].students.length));
  t.ok('開著的那個班:用目前畫面上的資料(可能有還沒存上去的變更)',
    rosters.C1.students.length === state.students.length,
    `${rosters.C1.students.length} 位 vs state ${state.students.length} 位`);
  t.ok('班名也帶過去了', rosters.C3.className === '測試班3');
  t.ok('每個班的個人私有資料也寫了',
    others.every(id => Object.keys(mine[id] || {}).length === blobs[id].students.length)
    && Object.keys(mine.C1 || {}).length === state.students.length);

  const PRIVATE = ['history', 'quizResults', 'currentPoints', 'email', 'inventory'];
  t.ok('補建出來的名冊一樣不含私有欄位',
    Object.values(rosters).every(r => r.students.every(s => PRIVATE.every(k => !(k in s)))));

  box = document.getElementById('rosterStatus');
  t.ok('建完之後顯示全部完成', box.textContent.includes('全部完成'));
  t.ok('建完之後不再出現補建按鈕', !/幫這 \d+ 個班建立名冊/.test(box.innerHTML));

  // ── 已經有的不要重做 ──
  const before = JSON.stringify(rosters.C2);
  await new Promise(r => setTimeout(r, 5));
  await buildAllRosters();
  t.ok('已經有名冊的班不會被重寫', JSON.stringify(rosters.C2) === before);

  // ── 某個班讀不到時,其他班照樣建 ──
  delete rosters.C4; delete rosters.C5;
  Cloud.loadClass = async id => (id === 'C4' ? null : { blob: blobs[id] });
  let msg = '';
  window.toast = m => { msg = m; };
  await buildAllRosters();
  t.ok('一個班失敗不影響其他班', !!rosters.C5 && !rosters.C4);
  t.ok('失敗的班會講出來', msg.includes('測試班4'), msg);

  // ── 狀態是查雲端,不是看這個分頁寫過沒 ──
  Roster.reset();
  Cloud.loadClass = async id => ({ blob: blobs[id] });
  await renderRosterStatus();
  box = document.getElementById('rosterStatus');
  t.ok('換個分頁(基準被清掉)也不會誤報沒建立',
    box.querySelectorAll('.roster-mark.is-ok').length === 4,
    box.querySelectorAll('.roster-mark.is-ok').length + ' 個已建立');

  return t.out;
});

await close();
process.exit(report('各班名冊狀態', lines, errors) ? 0 : 1);
