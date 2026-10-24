/* 蜂巢題庫:搬出主文件、依題號雜湊分片、只重寫變了的那幾片。
   最重要的一條:任何失敗的情況都不可以弄壞雲端已經有的題庫。 */
import { loadPlaywright, openApp, prepare, okSrc, report } from './lib.mjs';

const chromium = await loadPlaywright();
const { page, errors, close } = await openApp(chromium);
await page.evaluate(okSrc);
await prepare(page);

const lines = await page.evaluate(async () => {
  const t = window.__mk(), db = window.__db;
  const f = window.__fixture();
  const QS = f.questions;

  // ── 分片本身 ──
  const split = QuestionBank.split(QS);
  const counts = Object.keys(split).sort().map(k => split[k].length);
  t.ok('八片都在(空的也要有,不然刪光的那片會留在雲端)',
    Object.keys(split).length === 8);
  t.ok('分片沒有遺漏題目', counts.reduce((a, c) => a + c, 0) === QS.length, counts.join('/'));
  t.ok('最大一片離 1 MiB 還很遠',
    Math.max(...Object.values(split).map(window.__bytes)) < 100 * 1024,
    Math.round(Math.max(...Object.values(split).map(window.__bytes)) / 1024) + ' KB');

  const diff = (a, b) => Object.keys(a).filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k])).length;
  const added = [{ id: 'tq_NEW', text: '新', options: ['a', 'b'], answer: 0,
                   difficulty: Object.keys(DIFFICULTY)[0], createdAt: 9e12 }, ...QS];
  t.ok('新增一題只動一片(所以不是用陣列位置分片)', diff(split, QuestionBank.split(added)) === 1);
  t.ok('刪一題只動一片',
    diff(split, QuestionBank.split(QS.filter(q => q.id !== 'tq_300'))) === 1);

  // ── 順序要能還原 ──
  const flat = [];
  Object.keys(split).sort().forEach(k => flat.push(...split[k]));
  const expect = QS.slice().sort((a, b) => b.createdAt - a.createdAt).map(q => q.id);
  t.ok('打散再排回來就是「新的在上面」',
    JSON.stringify(QuestionBank.sort(flat).map(q => q.id)) === JSON.stringify(expect));

  // ── 主文件不再帶題庫 ──
  window.__apply(f);
  const live = serializeState();
  t.ok('日常存檔不含題庫(省掉每次加分重傳 77 KB)', !('territoryQuestions' in live));
  t.ok('日常存檔有題庫版本號 tqRev', 'tqRev' in live);

  // ── 舊班級自動搬移 ──
  db.tqbank = {};
  state.territoryQuestions = [];
  let n = await QuestionBank.load('C1', { territoryQuestions: QS });
  t.ok('舊班級自動搬移,題數不變', n === QS.length, n + ' 題');
  t.ok('搬移後八片都寫上去了', Object.keys(db.tqbank).length === 8);
  t.ok('搬移沒有遺漏',
    Object.values(db.tqbank).reduce((a, c) => a + c.length, 0) === QS.length);

  // ── 重開班從分片讀 ──
  const before = db.shardWrites;
  state.territoryQuestions = [];
  n = await QuestionBank.load('C1', {});
  t.ok('重開班從分片載入', n === QS.length);
  t.ok('載入不會寫任何東西', db.shardWrites === before);
  t.ok('順序是新的在上面', state.territoryQuestions[0].id === 'tq_' + (QS.length - 1));

  // ── 增量寫入 ──
  state.territoryQuestions.unshift({ id: 'tq_X', text: '新', options: ['a', 'b'],
    answer: 0, difficulty: Object.keys(DIFFICULTY)[0], createdAt: 9e12 });
  t.ok('新增一題只重寫一片', await QuestionBank.persist('C1') === 1);
  t.ok('沒改動就不寫', await QuestionBank.persist('C1') === 0);
  state.territoryQuestions = state.territoryQuestions.filter(q => q.id !== 'tq_300');
  t.ok('刪一題只重寫一片', await QuestionBank.persist('C1') === 1);

  // ── 失敗處理 ──
  state.territoryQuestions.unshift({ id: 'tq_Y', text: '再一題', options: ['a', 'b'],
    answer: 0, difficulty: Object.keys(DIFFICULTY)[0], createdAt: 9e12 + 1 });
  db.fail.saveQuestionShards = true;
  let threw = false;
  try { await QuestionBank.persist('C1'); } catch (e) { threw = true; }
  db.fail.saveQuestionShards = false;
  t.ok('寫失敗會往上拋,呼叫端才提示得出來', threw);
  t.ok('失敗之後重試寫得成功', await QuestionBank.persist('C1') >= 1);

  // ── 整批取代 ──
  state.territoryQuestions = QS.slice(0, 3);
  t.ok('整批取代八片全寫', await QuestionBank.persist('C1', true) === 8);
  t.ok('取代後舊題沒殘留',
    Object.values(db.tqbank).reduce((a, c) => a + c.length, 0) === 3);

  // ── 讀取失敗時不可以拿空題庫去蓋掉雲端 ──
  const snapshot = JSON.stringify(db.tqbank), w = db.shardWrites;
  db.fail.loadQuestionBank = true;
  await QuestionBank.load('C1', {});
  db.fail.loadQuestionBank = false;
  t.ok('讀取失敗時雲端完全沒被動到',
    JSON.stringify(db.tqbank) === snapshot && db.shardWrites === w);

  return t.out;
});

await close();
process.exit(report('蜂巢題庫分片', lines, errors) ? 0 : 1);
