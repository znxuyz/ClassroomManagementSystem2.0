/* 斷網或關太快時的資料救援。
   最重要的一條:不可以自動覆蓋 —— 老師也可能在另一台裝置上繼續上課。 */
import { loadPlaywright, openApp, prepare, okSrc, report } from './lib.mjs';

const chromium = await loadPlaywright();
const { page, errors, close } = await openApp(chromium);
await page.evaluate(okSrc);
await prepare(page);

const lines = await page.evaluate(() => {
  const t = window.__mk();
  window.renderAll = () => {};
  window.renderActiveView = () => {};
  window.flushCloudSave = async () => {};

  const mk = pts => {
    const f = window.__fixture({ students: 2, historyPer: 0 });
    f.blob.students[0].totalPoints = pts;
    f.blob.students[0].currentPoints = pts;
    return serializeStateCopy(f.blob);
  };
  // 做一份和 serializeState 同形狀的 blob
  function serializeStateCopy(blob) {
    applyBlobToState(JSON.parse(JSON.stringify(blob)));
    state.classId = 'C1';
    return JSON.parse(JSON.stringify(serializeState()));
  }

  // ── 沒有旗標就不要問 ──
  Storage.clear('C1');
  let asked = 0;
  window.confirm = () => { asked++; return true; };
  t.ok('沒有未送出的變更時不會問',
    offerLocalRecovery('C1', mk(10)) === false && asked === 0);

  // ── 旗標還在但內容其實一樣 ──
  const cloud10 = mk(10);
  Storage.save(mk(10), 'C1'); Storage.markDirty('C1');
  asked = 0;
  t.ok('內容其實一樣:不問,而且把旗標清掉',
    offerLocalRecovery('C1', cloud10) === false && asked === 0
    && Storage.meta('C1').dirty === false);

  // ── 本機比雲端新 → 問 ──
  Storage.save(mk(35), 'C1'); Storage.markDirty('C1');
  let msg = '';
  window.confirm = m => { msg = m; return true; };
  applyBlobToState(JSON.parse(JSON.stringify(cloud10)));
  t.ok('有差異時會問', offerLocalRecovery('C1', cloud10) === true);
  t.ok('訊息講出差幾位、合計差幾分',
    msg.includes('1 位學生') && msg.includes('+25'),
    (msg.split('\n').find(l => l.includes('位學生')) || '').trim());
  t.ok('訊息有提醒「另一台裝置才是新的」的風險', msg.includes('另一台裝置'));
  t.ok('按確定之後用的是本機版本', getStudent('s0').totalPoints === 35);

  // ── 按取消 ──
  Storage.save(mk(50), 'C1'); Storage.markDirty('C1');
  window.confirm = () => false;
  applyBlobToState(JSON.parse(JSON.stringify(cloud10)));
  t.ok('按取消不套用', offerLocalRecovery('C1', cloud10) === false
    && getStudent('s0').totalPoints === 10);
  t.ok('按取消之後旗標清掉,不會每次開班都問', Storage.meta('C1').dirty === false);

  // ── 積分之外的改動 ──
  const other = mk(10);
  other.attendance = { '2026-10-20': { s0: 'present' } };
  other.homework = [{ id: 'h1', title: '作業' }];
  Storage.save(other, 'C1'); Storage.markDirty('C1');
  msg = ''; window.confirm = m => { msg = m; return false; };
  offerLocalRecovery('C1', cloud10);
  t.ok('點名與作業的差異也列得出來',
    msg.includes('點名紀錄') && msg.includes('作業'),
    (msg.split('\n').find(l => l.includes('也不一樣')) || '').trim());

  // ── 旗標的生命週期 ──
  Storage.markDirty('C1');
  t.ok('markDirty 之後是 dirty', Storage.meta('C1').dirty === true);
  Storage.markSynced('C1');
  t.ok('markSynced 之後不是 dirty', Storage.meta('C1').dirty === false);
  Storage.clear('C1');
  t.ok('clear 會把 meta 一起清掉', Storage.meta('C1') === null);

  // ── compareBlobs ──
  const d = compareBlobs(mk(99), cloud10);
  t.ok('compareBlobs 算出 1 位、+89', d.changed === 1 && d.delta === 89,
    `${d.changed} 位 / ${d.delta} 分`);
  t.ok('完全一樣時 any 是 false', compareBlobs(mk(10), cloud10).any === false);

  return t.out;
});

await close();
process.exit(report('離線資料救援', lines, errors) ? 0 : 1);
