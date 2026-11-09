/* ============================================
   老師端的場景
   ────────────────────────────────────────────
   每一段都照「老師真的會怎麼操作」排:先看到畫面、再按下去、
   然後看到系統的反應。順序照一天的流程走(加分 → 點名 → 作業 →
   商店 → 挑戰 → 數據 → 投影),不是照選單的順序。
============================================ */
export default [

/* ---------- 片頭 ---------- */
{ chapter: '', async run({ page, cap, sleep }) {
  await page.evaluate(() => window.__demo.title('守護獸學園', '一套給國小班級的經營系統'));
  await cap('每個孩子有一隻台灣特有種守護獸,靠平常的表現把牠養大');
  await sleep(4200);
  await cap('老師這一端:加分、點名、作業、測驗、程式挑戰,都在同一個地方');
  await sleep(4000);
  await page.evaluate(() => { showApp(); navGoItem('class', 'dashboard', ''); });
  await page.evaluate(() => window.__demo.title(null));
  await sleep(900);
} },

/* ---------- 學生加分 ---------- */
{ chapter: '班級管理', async run({ cap, click, point, sleep, page }) {
  await cap('全班一個畫面。守護獸就是學生的頭像,養得越大圈圈越亮');
  await sleep(3800);
  await cap('頭像右上角的數字是「幾天沒被加分」—— 久沒被關注的那幾位,一眼就看到');
  await point('.student-item:nth-child(4) .student-avatar');
  await sleep(3400);

  await cap('點一位學生,右邊就出現他的守護獸和加分面板');
  await click('.student-item:nth-child(2)', { after: 1100 });
  await sleep(2200);

  await cap('按一下規則就加分 —— 積分規則是老師自己訂的');
  await click('.rule-card:nth-child(2)', { after: 1400 });
  await sleep(2600);
} },

/* ---------- 批次加分 ---------- */
{ async run({ cap, click, sleep, page }) {
  await cap('整組一起加分:按「批次加分」,再按小組的快捷鍵');
  await click('#batchToggleBtn', { after: 900 });
  await sleep(900);
  await page.evaluate(() => { BatchAward.pickGroup(2); renderStudentList(); renderSelectedStudent(); });
  await sleep(1200);
  await cap('第 3 組四個人一起勾起來,按一次規則,四個人同時加分');
  await sleep(2600);
  await click('.rule-card:nth-child(4)', { after: 1500 });
  await cap('按錯了?提示上就有「復原」,整批還原');
  await sleep(2800);
  await page.evaluate(() => { BatchAward.toggle(); clearStudentSelection(); });
  await sleep(500);
} },

/* ---------- 加分紀錄 ---------- */
{ async run({ cap, click, point, sleep, page }) {
  await page.evaluate(() => { selectStudent('s1'); });
  await sleep(700);
  await cap('加錯分每天都在發生 —— 點到隔壁那一位、同一件事按了兩次');
  await point('.award-log-list');
  await sleep(3200);
  await cap('加分面板下面就是紀錄:可以「撤銷」整筆拿掉,或「調整」改分數與原因');
  await point('.award-log-row:nth-child(1) .award-log-btn');
  await sleep(3600);
  await cap('調整是換掉原來那一筆,不會在明細上多一筆相反的分數 —— 家長看報表才看得懂');
  await sleep(3400);
  await page.evaluate(() => clearStudentSelection());
} },

/* ---------- 點名 ---------- */
{ async run({ cap, click, go, sleep, page }) {
  await go('class', 'tools', 'attendance');
  await cap('點名:一個畫面點完全班,也可以一鍵全部出席');
  await sleep(3000);
  await click('.bulk-actions .btn-ghost', { after: 1100 });
  await cap('出席分幾分由老師自己訂,按鈕上直接寫著現在會發幾分');
  await sleep(3000);
  await click('#attAwardBtn', { after: 1600 });
  await cap('同一天只發得出去一次 —— 再按一次會告訴你已經發過了');
  await sleep(1200);
  await click('#attAwardBtn', { after: 1800 });
  await sleep(1600);
} },

/* ---------- 作業 ---------- */
{ chapter: '聯絡簿與作業', async run({ cap, click, point, go, sleep }) {
  await go('contact', 'contact', 'homework');
  await cap('作業繳交:一位學生三顆按鈕,繳交、遲交、未繳');
  await point('.hw-student-buttons');
  await sleep(3200);
  await cap('繳交自動加分,而且同一份作業一個人只領一次 —— 改來改去也不會多領');
  await sleep(3400);
  await cap('期限旁邊會直接寫「還有 3 天」「今天到期」「逾期 2 天 · 25 位未批」');
  await point('.hw-due-chip');
  await sleep(3400);
} },

/* ---------- 聯絡簿 ---------- */
{ async run({ cap, go, sleep }) {
  await go('contact', 'contact', 'diary');
  await cap('今日聯絡簿會自動把今天的加分、作業、任務整理成草稿,直接列印');
  await sleep(4200);
} },

/* ---------- 商店 ---------- */
{ chapter: '兌換商店', async run({ cap, click, point, go, sleep }) {
  await go('shop', 'shop', 'shopItems');
  await cap('獎品商店:老師自己上架,訂點數與庫存');
  await sleep(3000);
  await cap('學生在自己的手機上按兌換,扣點在老師這一端執行 —— 學生改不了自己的點數');
  await sleep(3600);
  await go('shop', 'shop', 'purchases');
  await cap('技能果實和改名卡是系統內建的,扣完點就自動發放,不佔你的待發放清單');
  await sleep(3800);
} },

/* ---------- 測驗 ---------- */
{ chapter: '學習挑戰', async run({ cap, go, point, sleep }) {
  await go('challenge', 'quiz', '');
  await cap('線上測驗:可以從 Excel 一次把整份測驗連題目建好');
  await sleep(3200);
  await cap('三種計分:答對就得分、逐題搶答、整份前幾名');
  await sleep(3000);
} },

/* ---------- 蜂巢戰紀 ---------- */
{ async run({ cap, go, sleep, page }) {
  await go('challenge', 'territory', 'tgBoard');
  await cap('蜂巢戰紀:各組答題搶地盤,答對就把相鄰的格子變成自己的顏色');
  await sleep(4000);
  await cap('每週結算一次,照佔領的格數發獎 —— 同分同名次');
  await sleep(3400);
} },

/* ---------- 積木挑戰 ---------- */
{ chapter: '積木挑戰', async run({ cap, click, point, go, sleep, page }) {
  await go('challenge', 'blocks', '');
  await cap('積木挑戰:給「認得積木但拼不起來」的孩子練的 micro:bit 題目');
  await sleep(3800);

  await page.evaluate(() => BlockTasks.edit('bt2'));
  await sleep(900);
  await cap('出一題只要三步:寫下功能敘述、把答案拼一次、按試跑');
  await page.evaluate(() => {
    document.querySelector('.bk-editor').scrollIntoView({ block: 'center' });
  });
  await sleep(3600);

  await cap('編輯器和真的 MakeCode 一樣:同一套分類、同一套顏色,拖進來就接上');
  await point('.bk-palette');
  await sleep(3600);

  await cap('測試案例不必自己想 —— 系統看你的答案用到哪些事件,自動排一齣劇本');
  await page.evaluate(() => { BlockTasks.tryRun(); });
  await sleep(1200);
  await page.evaluate(() => {
    const el = document.querySelector('.bk-judge');
    if (el) el.scrollIntoView({ block: 'center' });
  });
  await sleep(3400);

  await cap('判的是「功能」不是「積木」:不同拼法只要做出一樣的結果,都算對');
  await sleep(4000);
} },

/* ---------- 數據 ---------- */
{ chapter: '數據與報表', async run({ cap, go, point, sleep, page }) {
  await go('data', 'overview', 'general');
  await cap('班級概況:全班的積分、守護獸成長分布、需要關心的孩子');
  await sleep(3800);

  await go('data', 'overview', 'report');
  await page.evaluate(() => { showStudentReport('s3'); });
  await sleep(1800);
  await cap('每位學生一份學期成長報告:成長曲線、主要得分項目、出席與作業');
  await sleep(3800);
  await cap('可以直接列印,也可以輸出成一個檔案給家長 —— 離線打開也看得到');
  await sleep(3600);
} },

/* ---------- 投影 ---------- */
{ chapter: '投影模式', async run({ cap, go, sleep, page }) {
  await go('data', 'projector', '');
  await page.evaluate(() => {
    document.documentElement.classList.add('projector-full');
    renderProjector();
  });
  await sleep(900);
  await cap('投影模式:全班一個畫面,不用捲動');
  await sleep(3200);
  await cap('加分的那一刻,那一格會亮起來,分數飄上去 —— 全班一起看著');
  await page.evaluate(() => {
    ['s4', 's11', 's19'].forEach((id, i) =>
      setTimeout(() => { applyPointsToStudent(id, 2, '舉手發言'); }, i * 900));
  });
  await sleep(4200);
  await page.evaluate(() => document.documentElement.classList.remove('projector-full'));
} }

];
