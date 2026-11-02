/* ============================================
   同一排的格子要一樣高
   ────────────────────────────────────────────
   學生加分那一頁出過這個問題:「5 天沒加分」的標籤只掛在部分學生身上,
   有標籤的那張卡片就比較高,整排格子被它撐開 —— 於是第一排比第二排高,
   同一排裡的名字與分數也對不齊。28 格排成四五排時非常明顯。

   這種事截圖不一定看得出來(每一排各自看都「正常」),所以用量的:
   把每一頁所有「格子容器」(grid 或會換行的 flex)裡的子元素依照
   top 座標分排,同一排裡的高度必須一致。

   修法的原則是「永遠留著那一行的高度」,不是「把標籤拿掉」——
   資訊要留著,版面也要穩。

   ── 例外 ──
   有幾個容器本來就不是「一排格子」,而是「一排控制項」或「一張卡片的內部」,
   高矮不同是對的,列在 SKIP 裡並寫清楚原因。
============================================ */
import { loadPlaywright, openApp, prepare, report } from './lib.mjs';

const chromium = await loadPlaywright();
const lines = [];
let allErrors = [];

/* 這幾個不是格子:
   · tg-setup      蜂巢開局設定的表單,一欄是地圖預覽、一欄是幾行輸入框
   · bulk-actions  點名頁的按鈕列,最後面掛著一個「點哪一天」的日期欄位
   · theme-choice  是一張卡片的**內部**(色塊 / 名稱 / 說明),不是並排的卡片 */
const SKIP = ['tg-setup', 'bulk-actions', 'theme-choice'];

const scanSrc = skip => `
window.__scanRows = function () {
  const skip = ${JSON.stringify(skip)};
  const out = [];
  const check = (where, root) => {
    root.querySelectorAll('*').forEach(box => {
      const cls = (box.className || '').toString();
      if (skip.some(k => cls.includes(k))) return;
      /* 絕對定位的子元素不佔位(例如那條會滑動的高亮指示器),
         不該算進「這一排有多高」。 */
      const kids = [...box.children].filter(k => {
        if (k.offsetParent === null) return false;
        const p = getComputedStyle(k).position;
        return p !== 'absolute' && p !== 'fixed';
      });
      if (kids.length < 3) return;
      const cs = getComputedStyle(box);
      if (!(cs.display === 'grid' || (cs.display === 'flex' && cs.flexWrap === 'wrap'))) return;
      const rows = {};
      kids.forEach(k => {
        const r = k.getBoundingClientRect();
        (rows[Math.round(r.top)] = rows[Math.round(r.top)] || []).push(Math.round(r.height));
      });
      Object.values(rows).forEach(hs => {
        const u = [...new Set(hs)];
        if (u.length > 1) {
          out.push(where + ' · ' + (cls.split(' ')[0] || box.tagName) + ' · ' + u.join('/') + 'px');
        }
      });
    });
  };
  if (window.__scanWhere === 'student') {
    check('學生端/' + StudentApp.tab, document.getElementById('studentView'));
  } else {
    NAV_GROUPS.forEach(g => g.items.forEach(it => {
      navGoItem(g.key, it.view, it.sub || '');
      const v = document.querySelector('.view.active');
      if (v) check(g.name + '/' + it.name, v);
    }));
  }
  return [...new Set(out)];
};
`;

for (const [w, h, tag] of [[1440, 950, '1440'], [1024, 800, '1024'], [390, 844, '390']]) {
  const { page, errors, close } = await openApp(chromium, { width: w, height: h });
  await prepare(page);
  await page.evaluate(scanSrc(SKIP));

  /* 資料要刻意「參差不齊」—— 有的學生有標籤、有的沒有,
     有的獎品有說明、有的沒有。資料整齊的話這一套什麼都測不到。 */
  await page.evaluate(() => {
    const f = window.__fixture({ students: 12, historyPer: 4, questions: 8 });
    f.blob.homework = [{ id: 'h1', name: '數學習作', submissionPoints: 2,
      assignedDate: '2026-11-01', dueDate: '2026-11-05',
      submissions: { s0: { status: 'submitted' }, s1: { status: 'late' } } }];
    f.blob.quizzes = [{ id: 'q1', title: '第五課生字', status: 'open',
      questions: [{ id: 'a', text: '題', options: ['1', '2'], answer: 0 }],
      pointsPerQuestion: 2, scoreMode: 'correct' }];
    f.blob.shopItems = [
      { id: 'i1', name: '免寫一次作業', icon: '📝', price: 30, stock: 3, active: true,
        description: '可以折抵一次回家作業' },
      { id: 'i2', name: '和老師吃午餐', icon: '🍱', price: 50, stock: null, active: true },
      { id: 'i3', name: '小禮物', icon: '🎁', price: 10, stock: 1, active: true,
        description: '一個小文具' }];
    f.blob.classTasks = [
      { id: 't1', name: '全班讀 100 本書', target: 100, current: 40, reward: '同樂會' },
      { id: 't2', name: '連續五天全到', target: 5, current: 5, reward: '' },
      { id: 't3', name: '第三個任務', target: 3, current: 1, reward: '貼紙' }];
    window.__apply(f);
    // 有的有「N 天沒加分」、有的沒有、有一位還沒選守護獸
    state.students.forEach((s, i) => {
      s.lastPointTime = i % 3 === 0 ? Date.now() : Date.now() - 5 * 86400000;
    });
    state.students[1].pet = null;
    showApp();
  });

  const bad = await page.evaluate(() => window.__scanRows());
  lines.push((bad.length === 0 ? '✓ ' : '✗ ')
    + `${tag} 老師端每一排格子都等高`
    + (bad.length ? ' — ' + bad.join(' · ') : ''));

  allErrors = allErrors.concat(errors.map(e => `${tag} ${e}`));
  await close();
}

/* 學生端是另一條渲染路徑(StudentApp),要分開量 */
{
  const { page, errors, close } = await openApp(chromium, { width: 390, height: 844 });
  await prepare(page);
  await page.evaluate(scanSrc(SKIP));
  await page.evaluate(async () => {
    window.__apply(window.__fixture({ students: 12, historyPer: 6, questions: 6 }));
    state.shopItems = [
      { id: 'i1', name: '免寫一次作業', icon: '📝', price: 30, stock: 3, active: true,
        description: '可以折抵一次回家作業' },
      { id: 'i2', name: '和老師吃午餐', icon: '🍱', price: 50, stock: null, active: true },
      { id: 'i3', name: '小禮物', icon: '🎁', price: 10, stock: 1, active: true,
        description: '一個小文具' }];
    await Roster.flush(true);
    window.__myStudentId = 's0';
    window.__scanWhere = 'student';
    await StudentApp.enter({ classId: 'C1', className: '601',
                             studentId: 's0', name: '學生0', seatNumber: '7' });
  });

  const stuBad = [];
  for (const t of ['pet', 'rank', 'quiz', 'shop', 'help']) {
    await page.evaluate(x => StudentApp.setTab(x), t);
    await page.waitForTimeout(900);          // 頒獎台有進場動畫,等它站定再量
    const bad = await page.evaluate(() => window.__scanRows());
    bad.forEach(b => stuBad.push(b));
  }
  lines.push((stuBad.length === 0 ? '✓ ' : '✗ ')
    + '學生端每一排格子都等高' + (stuBad.length ? ' — ' + stuBad.join(' · ') : ''));
  allErrors = allErrors.concat(errors);
  await close();
}

process.exit(report('同一排的格子要一樣高', lines, allErrors) ? 0 : 1);
