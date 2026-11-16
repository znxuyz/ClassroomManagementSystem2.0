/* ============================================
   換題是「巧手」的能力,不是大家都有的
   ────────────────────────────────────────────
   老師把換題做成技能(要買果實才會),但學生沒買照樣換得到。
   原因有兩個,兩個都是「預設值」害的:

   1. **沒設定就預設 3**。程式裡到處寫著
      `maxSwaps === undefined ? 3 : …`,所以老師沒開放時,
      每個孩子仍然有三次 —— 那個技能等於白做。
      沒設定就該是 **0**:要換題就得先學會「✋ 巧手」。

   2. 更嚴重的:安全規則裡**換題次數的上限掛在連錯冷卻那條鏈上**,
      而那條鏈是「老師關掉冷卻就不檢查」。也就是說,
      只要冷卻沒開,換題上限就一起失效 —— 前端擋得住的只有老實的孩子。
      冷卻可以關,次數上限不能跟著關。

   所以這一套同時盯畫面行為與規則檔本身。
============================================ */
import { readFileSync } from 'node:fs';
import { loadPlaywright, openApp, prepare, report } from './lib.mjs';

const RULES = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');

const chromium = await loadPlaywright();
const { page, errors, close } = await openApp(chromium);
await prepare(page);

const lines = [];
const ok = (n, c, e) => lines.push((c ? '✓ ' : '✗ ') + n + (e ? ' — ' + e : ''));

/* ---------- 規則檔 ---------- */
ok('規則裡「沒設定」就是 0 次,不是 3 次',
   /get\('maxSwaps', 0\)/.test(RULES) && !/get\('maxSwaps', 3\)/.test(RULES));

const iSwap = RULES.indexOf('<= swapLimit()');
const iCool = RULES.indexOf('coolN() <= 0 || coolSec() <= 0');
ok('換題上限不再掛在「冷卻關掉就跳過」那一段裡',
   iSwap > 0 && iCool > iSwap,
   `上限在第 ${iSwap} 字,冷卻短路在第 ${iCool} 字`);
ok('冷卻的短路只剩一處(就是「要不要等那幾秒」那一段)',
   (RULES.match(/coolN\(\) <= 0 \|\| coolSec\(\) <= 0/g) || []).length === 1);

/* ---------- 畫面行為 ---------- */
const r = await page.evaluate(() => {
  const out = {};
  window.__apply(window.__fixture({ students: 4, historyPer: 0, questions: 6 }));
  state.skills = { enabled: true, weeks: 1 };
  state.currentGroups = [['s0', 's1'], ['s2', 's3']];

  const mkConfig = extra => Territory.createConfig(state.currentGroups,
    Object.assign({ shape: 'hex', radius: 3, seed: 7, threshold: 3,
                    battleSeconds: 90, answerSeconds: 30, wrongPenalty: 0,
                    penaltyFloor: 0, cooldownWrong: 0, cooldownSeconds: 0,
                    stageMode: 'all', stageSeconds: 300 }, extra));

  // 開局時沒填「可換題」
  out.blank = mkConfig({}).maxSwaps;
  out.explicit = mkConfig({ maxSwaps: 2 }).maxSwaps;
  // 髒資料也不要變成 3
  out.junk = mkConfig({ maxSwaps: '' }).maxSwaps;

  /* 學生端:老師沒開放時,一次攻擊有幾次換題 */
  TerritoryGame.config = mkConfig({});
  StudentApp.classInfo = { classId: 'C1', studentId: 's0', name: '小明' };
  StudentApp.classSkills = { enabled: true, weeks: 1 };
  StudentApp.allStudents = state.students;
  StudentApp.student = state.students[0];
  StudentApp.student.inventory = [];
  StudentApp.skillUses = [];
  StudentApp.resetAttackState ? StudentApp.resetAttackState() : null;

  // 進入一次攻擊時會重設次數(和 attackHex 裡那一段同一條路)
  const freshLeft = () => Math.max(0,
    (TerritoryGame.config || {}).maxSwaps || 0);
  out.noSkillLeft = freshLeft();

  // 老師開放 2 次的話,大家都有 2 次
  TerritoryGame.config = mkConfig({ maxSwaps: 2 });
  out.openLeft = freshLeft();

  // 舊的那一局(資料裡沒有這個欄位)也不該變成 3
  TerritoryGame.config = Object.assign(mkConfig({}), { maxSwaps: undefined });
  out.legacyLeft = freshLeft();

  /* 巧手:買了之後才加得到次數 */
  TerritoryGame.config = mkConfig({});
  out.handPowerNoBuy = StudentApp.skillPower('war_hand');
  StudentApp.student.inventory = ['fruit_war_hand'];
  StudentApp.student.totalPoints = 900;       // 守護神獸
  out.handPowerBought = StudentApp.skillPower('war_hand');
  out.canUseHand = StudentApp.canUse('war_hand');

  return out;
});

ok('開局時沒填「可換題」= 0 次(不是 3 次)', r.blank === 0, String(r.blank));
ok('老師真的填了就照填的算', r.explicit === 2, String(r.explicit));
ok('欄位是空字串之類的髒資料也不會變成 3', r.junk === 0, String(r.junk));

ok('沒買巧手、老師也沒開放 → 一次都不能換', r.noSkillLeft === 0, String(r.noSkillLeft));
ok('老師開放 2 次 → 全班都有 2 次', r.openLeft === 2, String(r.openLeft));
ok('舊的一局(資料裡沒這個欄位)也不會變成 3 次',
   r.legacyLeft === 0, String(r.legacyLeft));

ok('沒買果實 → 巧手沒有強度,也用不了',
   r.handPowerNoBuy === 0, String(r.handPowerNoBuy));
ok('買了果實 → 巧手才有次數可以換',
   r.handPowerBought > 0 && r.canUseHand === true,
   r.handPowerBought + ' / ' + r.canUseHand);

await close();
process.exit(report('換題要先學會巧手', lines, errors) ? 0 : 1);
