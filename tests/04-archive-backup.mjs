/* 加分歷程的封存,以及備份的完整性。
   最重要的一條:封存絕對不可以掉資料 —— 先寫成功才從主文件刪掉。 */
import { loadPlaywright, openApp, prepare, okSrc, report } from './lib.mjs';

const chromium = await loadPlaywright();
const { page, errors, close } = await openApp(chromium);
await page.evaluate(okSrc);
await prepare(page);

const lines = await page.evaluate(async () => {
  const t = window.__mk(), db = window.__db;
  const total = s => (s.history || []).length;

  // ── 封存:先寫成功才刪 ──
  let f = window.__fixture({ historyPer: 300 });
  window.__apply(f);
  const before = state.students.reduce((n, s) => n + total(s), 0);

  db.fail.archiveHistory = true;
  let moved = await HistoryArchive.flush();
  db.fail.archiveHistory = false;
  t.ok('封存失敗時主文件完全沒被動到',
    moved === 0 && state.students.reduce((n, s) => n + total(s), 0) === before,
    before + ' 筆都還在');

  moved = await HistoryArchive.flush();
  const left = state.students.reduce((n, s) => n + total(s), 0);
  const inCloud = Object.values(db.archives).reduce((n, c) => n + c.entries.length, 0);
  t.ok('封存成功後一筆都沒少', moved + left === before && inCloud === moved,
    `搬走 ${moved} + 留下 ${left} = ${before}`);
  t.ok('主文件每人只留 KEEP 筆',
    state.students.every(s => total(s) === HistoryArchive.KEEP), HistoryArchive.KEEP + ' 筆/人');
  t.ok('留下的是新的那一段',
    state.students[0].history[0].time > Object.values(db.archives)
      .filter(c => c.studentId === 's0')[0].entries[0].time);
  t.ok('跑第二次不會重複搬', await HistoryArchive.flush() === 0);

  // ── 讀回完整歷程 ──
  let full = await HistoryArchive.full(state.students[0]);
  t.ok('讀回完整歷程,筆數與順序都對',
    full.length === 300 && full.every((h, i) => i === 0 || full[i - 1].time <= h.time),
    full.length + ' 筆');

  // ── 重複封存(還原舊備份造成的)要被去重 ──
  const dup = Object.values(db.archives).filter(c => c.studentId === 's0')[0];
  db.archives['s0_偽造的另一份id'] = { studentId: 's0', entries: dup.entries.slice(0, 100) };
  full = await HistoryArchive.full(state.students[0]);
  t.ok('同一批紀錄被存成兩份時,讀回來會去重,不會多算分', full.length === 300,
    full.length + ' 筆');
  const sum = a => a.reduce((n, h) => n + h.points, 0);
  t.ok('去重後總分也對', sum(full) === sum(await HistoryArchive.full(state.students[0])));
  delete db.archives['s0_偽造的另一份id'];

  // ── 主文件真的變小了 ──
  const after = window.__bytes(serializeState());
  t.ok('主文件明顯變小', after < window.__bytes(db.blob),
    `${Math.round(window.__bytes(db.blob) / 1024)} → ${Math.round(after / 1024)} KB`);

  // ── 備份要完整 ──
  f = window.__fixture();
  window.__apply(f);
  const live = serializeState(), bk = serializeStateForBackup();
  t.ok('日常存檔不含題庫', !('territoryQuestions' in live));
  t.ok('備份用存檔含題庫', (bk.territoryQuestions || []).length === f.questions.length);

  // 下載的那一份還要含已封存的歷程
  db.archives = {};
  state.students.forEach(s => {
    db.archives[s.id + '_a'] = { studentId: s.id,
      entries: Array.from({ length: 250 }, (_, j) => ({ time: j, points: 1, reason: '舊加分' })) };
  });
  let saved = null;
  const OrigBlob = window.Blob;
  window.Blob = function (parts) { saved = JSON.parse(parts[0]); return new OrigBlob(parts); };
  URL.createObjectURL = () => 'blob:fake';
  URL.revokeObjectURL = () => {};
  HTMLAnchorElement.prototype.click = function () {};
  await exportClassBackup();

  t.ok('下載的備份含題庫', (saved.blob.territoryQuestions || []).length === f.questions.length);
  t.ok('下載的備份含完整歷程(封存的 + 近期的)',
    saved.blob.students[0].history.length === 300, saved.blob.students[0].history.length + ' 筆');
  t.ok('說明有講清楚裡面有什麼',
    saved.說明.includes('題庫') && saved.說明.includes('完整的加分歷程'));

  // 封存讀不到時仍然匯得出來
  db.fail.loadAllHistory = true;
  saved = null;
  window.Blob = function (parts) { saved = JSON.parse(parts[0]); return new OrigBlob(parts); };
  await exportClassBackup();
  db.fail.loadAllHistory = false;
  window.Blob = OrigBlob;
  t.ok('封存讀不到時備份照樣產出(含題庫)',
    !!saved && (saved.blob.territoryQuestions || []).length === f.questions.length);
  t.ok('那種情況歷程退回只有近期那幾筆', saved.blob.students[0].history.length === 50);

  return t.out;
});

await close();
process.exit(report('歷程封存 / 備份完整性', lines, errors) ? 0 : 1);
