/* ============================================
   十個新技能的純邏輯
   ────────────────────────────────────────────
   畫面好不好按是另一回事,這一套盯的是「算出來對不對、擋不擋得住」:

   · 開放時段:跨夜要算對,沒設就是全天(舊的班不會突然打不了)
   · 偵錯 / 工具箱:**老師那一端也要算進去** ——
     學生看到三顆星、老師只給兩顆,比沒有這兩個技能更糟
   · 開路:先開起來的關卡要真的開得了
   · 刪去:畫掉哪幾個要**固定**,不能重新整理就換一組
     (換一組等於同一次技能可以看兩套刪法,慢慢就把答案刪出來了)
   · 重來:沒有技能紀錄就不算、超過題數的退回原本的、只取比較好的那一次
   · 成長:24 小時到了就失效,而且只加經驗不加可用積分
============================================ */
import { loadPlaywright, openApp, prepare, report } from './lib.mjs';

const chromium = await loadPlaywright();
const { page, errors, close } = await openApp(chromium);
await prepare(page);

const lines = [];
const ok = (n, c, e) => lines.push((c ? '✓ ' : '✗ ') + n + (e ? ' — ' + e : ''));

const r = await page.evaluate(() => {
  const out = {};
  __apply(__fixture({ students: 4, historyPer: 0, questions: 4 }));
  window.confirm = () => true;
  const s = state.students[0];

  // ── 開放時段 ──
  const at = (h, m) => new Date(2026, 0, 5, h, m).getTime();
  const win = (from, to, h, m) =>
    Territory.openWindow({ openFrom: from, openTo: to }, at(h, m)).open;
  out.allDay = [win('', '', 3, 0), win('08:00', '', 3, 0)];   // 沒設滿 = 全天
  out.sameDay = [win('08:00', '16:00', 10, 0), win('08:00', '16:00', 19, 0),
                 win('08:00', '16:00', 8, 0), win('08:00', '16:00', 16, 0)];
  out.overnight = [win('19:00', '08:00', 22, 0), win('19:00', '08:00', 3, 0),
                   win('19:00', '08:00', 12, 0)];

  // ── 偵錯 / 工具箱:星星 ──
  const task = { id: 't1', name: 'A',
    solution: [{ t: 'on_start', body: [{ t: 'show_number', v: 1 }] }] };
  const big = [{ t: 'on_start', body: [
    { t: 'show_number', v: 1 }, { t: 'pause', ms: 1 }, { t: 'pause', ms: 1 },
    { t: 'pause', ms: 1 }, { t: 'pause', ms: 1 }] }];
  out.hintCosts = starsFor(task, task.solution, { pass: true, hintsUsed: 1 });
  out.hintFree = starsFor(task, task.solution,
    { pass: true, hintsUsed: 1, hintFree: 1 });
  out.hintFreeNotEnough = starsFor(task, task.solution,
    { pass: true, hintsUsed: 3, hintFree: 1 });
  out.tooManyBlocks = starsFor(task, big, { pass: true, hintsUsed: 0 });
  out.roomBonus = starsFor(task, big, { pass: true, hintsUsed: 0, limitBonus: 4 });
  out.failStillZero = starsFor(task, task.solution,
    { pass: false, hintsUsed: 0, hintFree: 3, limitBonus: 9 });

  // ── 開路 ──
  const tasks = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const none = () => 0;
  out.lockedNormally = taskUnlocked(tasks, 1, none);
  out.openedBySkill = taskUnlocked(tasks, 1, none, new Set(['b']));
  out.firstAlwaysOpen = taskUnlocked(tasks, 0, none);

  // ── 刪去:固定的那一組 ──
  const q = { id: 'q7', type: 'choice', options: ['對', '錯1', '錯2', '錯3'], answer: 0 };
  const a1 = StudentApp.cutPick(q, 2);
  const a2 = StudentApp.cutPick(q, 2);
  out.cutStable = [a1.join(','), a2.join(',')];
  out.cutNeverAnswer = a1.includes(0);
  out.cutKeepsTwo = StudentApp.cutPick(q, 9).length;          // 四選一最多刪 2
  out.cutTwoOptions = StudentApp.cutPick(
    { id: 'q8', type: 'choice', options: ['對', '錯'], answer: 0 }, 1).length;

  // ── 重來 ──
  const quiz = { id: 'z1', questions: [
    { id: 'q1', type: 'choice', options: ['A', 'B'], answer: 0 },
    { id: 'q2', type: 'choice', options: ['A', 'B'], answer: 0 },
    { id: 'q3', type: 'choice', options: ['A', 'B'], answer: 0 }
  ] };
  state.skills = { enabled: true, weeks: 1 };
  SkillAdmin.uses = [{ id: 'u1', studentId: s.id, skillId: 'quiz_redo',
                       ref: 'z1', power: 1, at: Date.now() }];
  const sub = n => ({ studentId: s.id, answersFirst: { q1: 1, q2: 1, q3: 1 }, answers: n });

  out.noFirst = effectiveAnswers(quiz,
    { studentId: s.id, answers: { q1: 0, q2: 0, q3: 0 } });
  out.redoOne = effectiveAnswers(quiz, sub({ q1: 0, q2: 1, q3: 1 }));
  out.redoTooMany = effectiveAnswers(quiz, sub({ q1: 0, q2: 0, q3: 0 }));
  // 改完反而錯了:算原本那一次
  out.redoWorse = effectiveAnswers(quiz,
    { studentId: s.id, answersFirst: { q1: 0 }, answers: { q1: 1 } });
  SkillAdmin.uses = [];
  out.noUse = effectiveAnswers(quiz, sub({ q1: 0, q2: 0, q3: 0 }));

  // ── 成長 ──
  SkillAdmin.uses = [{ id: 'g1', studentId: s.id, skillId: 'pet_grow',
                       power: 1.5, at: Date.now() }];
  s.totalPoints = 100; s.currentPoints = 100; s.history = [];
  awardPointsCore(s, 4, '上課發言');
  out.grow = [s.totalPoints, s.currentPoints];

  SkillAdmin.uses = [{ id: 'g2', studentId: s.id, skillId: 'pet_grow',
                       power: 1.5, at: Date.now() - 25 * 3600000 }];
  s.totalPoints = 100; s.currentPoints = 100;
  awardPointsCore(s, 4, '上課發言');
  out.growExpired = [s.totalPoints, s.currentPoints];

  // 扣分不會被放大
  SkillAdmin.uses = [{ id: 'g3', studentId: s.id, skillId: 'pet_grow',
                       power: 1.5, at: Date.now() }];
  s.totalPoints = 100; s.currentPoints = 100;
  awardPointsCore(s, -4, '沒交作業');
  out.growNeg = [s.totalPoints, s.currentPoints];
  SkillAdmin.uses = [];

  return out;
});

ok('開放時段沒設滿就是全天(舊的班不會突然打不了)',
   r.allDay.every(Boolean), JSON.stringify(r.allDay));
ok('同一天之內的時段算得對(含頭不含尾)',
   r.sameDay[0] && !r.sameDay[1] && r.sameDay[2] && !r.sameDay[3],
   JSON.stringify(r.sameDay));
ok('跨夜的時段也算得對(19:00～08:00)',
   r.overnight[0] && r.overnight[1] && !r.overnight[2],
   JSON.stringify(r.overnight));

ok('沒有偵錯:看提示就只剩一顆星', r.hintCosts === 1, String(r.hintCosts));
ok('🔍 偵錯:看提示不扣星', r.hintFree === 3, String(r.hintFree));
ok('偵錯擋不了的提示數照常扣', r.hintFreeNotEnough === 1,
   String(r.hintFreeNotEnough));
ok('積木太多拿不到第三顆星', r.tooManyBlocks === 2, String(r.tooManyBlocks));
ok('🧰 工具箱:上限放寬就拿得到', r.roomBonus === 3, String(r.roomBonus));
ok('沒過就是 0 顆,技能幫不上忙', r.failStillZero === 0, String(r.failStillZero));

ok('前一關沒星星,下一關是鎖的', r.lockedNormally === false);
ok('🔓 開路:先開起來的關卡進得去', r.openedBySkill === true);
ok('第一關永遠開著', r.firstAlwaysOpen === true);

ok('🧹 刪去畫掉的那幾個是固定的(重新整理不會換一組)',
   r.cutStable[0] === r.cutStable[1], r.cutStable.join(' / '));
ok('刪去永遠不會把正確答案畫掉', r.cutNeverAnswer === false);
ok('四選一最多畫掉兩個(最少留兩個可選)', r.cutKeepsTwo === 2,
   String(r.cutKeepsTwo));
ok('只剩兩個選項時一個都不畫', r.cutTwoOptions === 0, String(r.cutTwoOptions));

ok('沒有原始那一份就直接用現在的(等於沒有重來)',
   r.noFirst.q1 === 0 && r.noFirst.q3 === 0, JSON.stringify(r.noFirst));
ok('🔁 重來:改的那一題算數', r.redoOne.q1 === 0, JSON.stringify(r.redoOne));
ok('超過可改題數的,退回原本的答案',
   r.redoTooMany.q1 === 0 && r.redoTooMany.q2 === 1 && r.redoTooMany.q3 === 1,
   JSON.stringify(r.redoTooMany));
ok('改完反而錯了就算原本那一次(不然沒人敢用)',
   r.redoWorse.q1 === 0, JSON.stringify(r.redoWorse));
ok('沒有技能紀錄:交完再偷改的一律不算',
   r.noUse.q1 === 1 && r.noUse.q2 === 1 && r.noUse.q3 === 1,
   JSON.stringify(r.noUse));

ok('🌱 成長:經驗變多,可用積分不變(所以不影響兌換)',
   r.grow[0] === 106 && r.grow[1] === 104, r.grow.join(' / '));
ok('過了 24 小時就失效', r.growExpired[0] === 104 && r.growExpired[1] === 104,
   r.growExpired.join(' / '));
ok('扣分不會被放大', r.growNeg[0] === 100 && r.growNeg[1] === 96,
   r.growNeg.join(' / '));

await close();
process.exit(report('十個新技能', lines, errors) ? 0 : 1);
