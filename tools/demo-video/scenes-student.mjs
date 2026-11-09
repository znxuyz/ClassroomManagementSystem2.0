/* ============================================
   學生端的場景(用手機的尺寸錄)
   ────────────────────────────────────────────
   孩子看到的東西和老師完全不一樣:他只看得到自己的守護獸、自己的明細、
   和現在可以做的事。這一段要讓老師看懂「發出去之後,孩子那邊會長什麼樣」。
============================================ */
export default [

{ chapter: '學生看到的', async run({ page, cap, sleep }) {
  await page.evaluate(async () => {
    const papers = BlockTasks.papers();
    await Roster.flush(true);
    window.__myStudentId = 's0';
    await StudentApp.enter({ classId: 'C1', className: '601',
      studentId: 's0', name: '許伯瑋', seatNumber: '1' });
    StudentApp.blockTasks = papers;
    StudentApp.myBlockWork = { bt1: { program: [], stars: 3, at: Date.now() } };
    StudentApp.setTab('pet');
  });
  await page.evaluate(() => window.__demo.title(null));
  await sleep(900);

  await cap('學生用 Google 帳號登入,看到的是自己的守護獸');
  await sleep(3600);
  await cap('四階成長:靈卵 → 幼獸 → 成獸 → 守護神獸,走過的那幾階會亮起來');
  await sleep(3800);
} },

{ async run({ page, cap, point, sleep }) {
  await cap('「這禮拜拿到幾分」—— 七根柱子是每天的得分,被扣分的那天往下長');
  await point('.week-card');
  await sleep(4000);
  await cap('下面是自己的積分明細,按日期分組,每一天寫著那天的淨得分');
  await point('.student-history-day');
  await sleep(3800);
  await cap('扣分的原因只有他自己和老師看得到 —— 同學之間互相看不到');
  await sleep(3600);
} },

{ async run({ page, cap, sleep }) {
  await page.evaluate(() => StudentApp.setTab('rank'));
  await sleep(1600);
  await cap('排行榜:前三名站上頒獎台,下面列到第十名,還會寫「差幾分」');
  await sleep(4200);
  await page.evaluate(() => StudentApp.setTab('shop'));
  await sleep(1200);
  await cap('兌換商店:點數不夠的時候,按鈕上會直接寫「還差幾點」');
  await sleep(3800);
} },

{ chapter: '積木挑戰', async run({ page, cap, click, point, sleep }) {
  await page.evaluate(() => StudentApp.setTab('blocks'));
  await sleep(1400);
  await cap('積木挑戰排成一條路,守護獸站在現在該挑戰的那一關');
  await sleep(3800);
  await cap('過了一關才解開下一關;每一關最多三顆星');
  await point('.bk-node.is-locked');
  await sleep(3600);

  await page.evaluate(() => StudentApp.bkOpen('bt2'));
  await sleep(1400);
  await cap('題目寫的是「要做出什麼功能」,不是「要用哪幾塊積木」');
  await sleep(3600);

  /* 拼出計步器的一半 —— 觀眾要看到積木真的被放進去 */
  await cap('從面板把積木拖進來,縮排就是「誰包著誰」');
  await page.evaluate(() => {
    BlockEditor.vars = ['步數'];
    BlockEditor.program = [{ id: 'd1', t: 'on_start', body: [
      { id: 'd2', t: 'set_var', name: '步數', v: 0 },
      { id: 'd3', t: 'show_number', v: { id: 'd4', t: 'var', name: '步數' } }] }];
    BlockEditor.changed();
  });
  await sleep(3600);

  await cap('上面那台是假的 micro:bit —— 可以自己按 A、B、搖一搖,先看看對不對');
  await page.evaluate(() => { BlockSim.act('shake'); });
  await sleep(1200);
  await page.evaluate(() => { BlockSim.act('shake'); });
  await sleep(2600);

  await cap('按「檢查看看」,它會告訴你卡在哪一步');
  await page.evaluate(() => StudentApp.bkCheck());
  await sleep(3800);

  await cap('「搖動第 1 次之後,螢幕上應該是 1,但你的程式是 0」—— 講得出哪一步、差在哪');
  await sleep(4000);

  await cap('補上缺的那兩塊,再檢查一次');
  await page.evaluate(() => {
    BlockEditor.program.push(
      { id: 'd5', t: 'on_gesture', g: '搖動', body: [
        { id: 'd6', t: 'change_var', name: '步數', v: 1 },
        { id: 'd7', t: 'show_number', v: { id: 'd8', t: 'var', name: '步數' } }] },
      { id: 'd9', t: 'on_button', btn: 'A+B', body: [
        { id: 'd10', t: 'set_var', name: '步數', v: 0 },
        { id: 'd11', t: 'show_number', v: { id: 'd12', t: 'var', name: '步數' } }] });
    BlockEditor.changed();
  });
  await sleep(2600);
  await page.evaluate(() => StudentApp.bkCheck());
  await sleep(1000);
  await page.evaluate(() => {
    const el = document.querySelector('.bk-stu-msg');
    if (el) el.scrollIntoView({ block: 'center' });
  });
  await cap('三顆星:做出來了、沒用提示、積木夠精簡');
  await sleep(4200);
  await cap('怎麼拼不限 —— 顯示放在事件裡或「重複無限次」裡都算對,變數叫什麼也隨你');
  await sleep(4200);
} }

];
