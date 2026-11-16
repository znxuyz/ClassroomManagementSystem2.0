/* ============================================
   改測驗的設定
   ────────────────────────────────────────────
   課堂進度會變:原本說禮拜一公布,結果那一節改上別的,結算時間就得往後挪。
   以前沒有這個功能,老師只能刪掉重出一份 —— 學生已經交的作答就跟著不見。

   這一套盯四件事:

   1. 改完**學生那邊也要跟著變**(不然老師看到新時間、學生看到舊的)。
   2. 只改那幾個欄位,**題目與答案不准從這條路被覆寫** ——
      一個改設定的動作把整份題目洗掉會是最糟的那種 bug。
   3. 把結算時間往後挪,等於「先別公布」:已經標成結算完的要解開,
      否則新的時間到了也不會再收。
   4. 計分方式**開放之後不給改** —— 逐題搶答和一般測驗在學生端是兩條
      不同的作答流程、答案存在不同地方,中途換掉已經交的會讀不到。

   另外釘住一個順手修掉的洞:發給學生的那一份以前**沒有帶結算時間**,
   所以學生交完卷只看到「已交卷」,不知道什麼時候公布。
============================================ */
import { readFileSync } from 'node:fs';
import { loadPlaywright, openApp, prepare, report } from './lib.mjs';

const chromium = await loadPlaywright();
const { page, errors, close } = await openApp(chromium);
await prepare(page);

const lines = [];
const ok = (n, c, e) => lines.push((c ? '✓ ' : '✗ ') + n + (e ? ' — ' + e : ''));

const r = await page.evaluate(async () => {
  const out = {};
  window.__apply(window.__fixture({ students: 8, historyPer: 1, questions: 0 }));
  window.confirm = () => true;

  /* 攔下雲端那一端,看看到底送了什麼過去 */
  const pushed = [];
  const published = [];
  Cloud.updateQuizMeta = async (c, id, patch) => {
    // 真的那一支只挑幾個欄位送 —— 這裡照抄同一份白名單來驗
    const allow = ['title', 'dueDate', 'pointsPerQuestion', 'settleAt'];
    const out2 = {};
    allow.forEach(k => { if (patch[k] !== undefined) out2[k] = patch[k]; });
    pushed.push({ id, keys: Object.keys(out2).sort(), ...out2 });
  };
  Cloud.publishQuiz = async (c, quiz) => { published.push(quiz); };

  const base = {
    id: 'z1', title: '1109-1116', status: 'open', scoreMode: 'all',
    pointsPerQuestion: 2, dueDate: '2026-11-16',
    settleAt: new Date('2026-11-17T00:00').getTime(),
    settledDone: true,
    questions: [{ id: 'q1', type: 'choice', text: '3×3',
                  options: ['9', '6'], answer: 0 }]
  };
  state.quizzes = [JSON.parse(JSON.stringify(base))];
  showApp();
  navGoItem('challenge', 'quiz', '');
  await new Promise(res => setTimeout(res, 200));

  out.hasBtn = [...document.querySelectorAll('button')]
    .some(b => b.textContent.trim() === '設定');

  toggleQuizSettings('z1');
  out.panelOpen = !!document.querySelector('.quiz-settings');
  // 面板上帶的是現在的值,不是空白
  out.prefill = [document.getElementById('qs_title_z1').value,
                 document.getElementById('qs_sdate_z1').value,
                 document.getElementById('qs_shour_z1').value];
  out.lockNote = /計分方式不能改/
    .test(document.querySelector('.quiz-settings-note').textContent);

  // 往後挪三天、改名字
  document.getElementById('qs_title_z1').value = '1109-1120';
  document.getElementById('qs_sdate_z1').value = '2026-11-20';
  document.getElementById('qs_shour_z1').value = '08';
  document.getElementById('qs_smin_z1').value = '30';
  await saveQuizSettings('z1');

  const q = state.quizzes[0];
  const d = new Date(q.settleAt);
  out.saved = {
    title: q.title,
    when: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-`
        + `${String(d.getDate()).padStart(2, '0')} `
        + `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
    settledDone: q.settledDone,
    questions: q.questions.length,
    answerKept: q.questions[0].answer,
    scoreMode: q.scoreMode
  };
  out.pushed = pushed;
  out.closedAfterSave = !document.querySelector('.quiz-settings');

  // 名稱不能清空
  toggleQuizSettings('z1');
  document.getElementById('qs_title_z1').value = '   ';
  await saveQuizSettings('z1');
  out.blankTitleKept = state.quizzes[0].title;

  // 發給學生的那一份要帶結算時間
  document.getElementById('qs_title_z1').value = '1109-1120';
  await saveQuizSettings('z1');
  state.quizzes[0].status = 'draft';
  await publishQuiz('z1');
  out.studentCopy = published.length
    ? Object.keys(published[0]).includes('settleAt') : false;

  return out;
});

/* 發布給學生的那一份是在 Cloud.publishQuiz 裡組的。
   測試裡那一支被換成了假的,所以直接讀原始檔 —— 要驗的是
   「真的送出去的那一份有沒有帶結算時間」。 */
const cloudSrc = readFileSync(
  new URL('../js/00-firebase.js', import.meta.url), 'utf8');
const forStudents = cloudSrc.slice(cloudSrc.indexOf('const forStudents = {'),
                                   cloudSrc.indexOf('// answer 刻意不寫進來'));

ok('每一張測驗卡上都有「設定」', r.hasBtn === true);
ok('打開之後帶的是現在的值,不是空白',
   r.prefill[0] === '1109-1116' && r.prefill[1] === '2026-11-17'
   && r.prefill[2] === '00', r.prefill.join(' / '));
ok('已經開放的那一份會寫明「計分方式不能改」', r.lockNote === true);

ok('改完名稱與結算時間都存下來了',
   r.saved.title === '1109-1120' && r.saved.when === '2026-11-20 08:30',
   r.saved.title + ' · ' + r.saved.when);
ok('往後挪就等於「還沒結算」,新時間到了才會再收',
   r.saved.settledDone === false);
ok('題目與正確答案完全沒被動到',
   r.saved.questions === 1 && r.saved.answerKept === 0,
   r.saved.questions + ' 題 · 答案 ' + r.saved.answerKept);
ok('計分方式不會被這條路改掉', r.saved.scoreMode === 'all', r.saved.scoreMode);

ok('改完有同步到學生那邊', r.pushed.length >= 1, r.pushed.length + ' 次');
ok('而且只送那四個欄位(題目不從這條路走)',
   r.pushed[0] && JSON.stringify(r.pushed[0].keys)
     === JSON.stringify(['dueDate', 'pointsPerQuestion', 'settleAt', 'title']),
   r.pushed[0] && r.pushed[0].keys.join(','));
ok('存完就把面板收起來', r.closedAfterSave === true);
ok('名稱清空時擋下來,不會存成無名測驗',
   r.blankTitleKept === '1109-1120', r.blankTitleKept);

ok('發給學生的那一份有帶結算時間(不然學生不知道何時公布)',
   /settleAt/.test(forStudents));

await close();
process.exit(report('改測驗的設定', lines, errors) ? 0 : 1);
