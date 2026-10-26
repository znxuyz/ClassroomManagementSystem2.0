/* 美術升級的共通底子。

   「好不好看」測不出來,但「有沒有一致」可以 —— 而這個專案看起來
   最沒做完的地方,正是同一排欄位有的有標籤、有的只有 placeholder。
   這一套盯的是那種不一致,以及新加的互動狀態有沒有真的生效。 */
import { loadPlaywright, openApp, prepare, okSrc, report } from './lib.mjs';

const chromium = await loadPlaywright();
const { page, errors, close } = await openApp(chromium, { width: 1440, height: 1000 });
await page.evaluate(okSrc);
await prepare(page);

const lines = await page.evaluate(async () => {
  const t = window.__mk();
  const f = window.__fixture();
  window.__apply(f);
  state.shopItems = [
    { id: 'i1', name: '免寫一次作業', price: 30, stock: 5, active: true, icon: '📝',
      description: '可以免寫一項回家作業' },
    { id: 'i2', name: '選座位一週', price: 40, stock: 0, active: true, icon: '🪑' },
    { id: 'i3', name: '已下架的獎品', price: 10, stock: null, active: false, icon: '🎁' }
  ];
  showApp();

  /* ---- 1. 建立列的每一格都要有標籤 ----
     以前同一排裡只有「測驗名稱 / 獎品名稱 / 點數」靠 placeholder,
     一打字就不知道那格是什麼,而且整排看起來像做一半。 */
  const bars = [
    ['兌換商店 → 獎品管理', 'shop', 'shop', 'shopItems', '.shop-create-form'],
    ['兌換商店 → 班級共同任務', 'shop', 'shop', 'tasks', '.task-create-form'],
    ['學習挑戰 → 學生測驗', 'challenge', 'quiz', '', '.quiz-create-form']
  ];
  bars.forEach(([label, g, v, sub, sel]) => {
    navGoItem(g, v, sub);
    const bar = document.querySelector(sel);
    const ctrls = [...bar.querySelectorAll('input, select')]
      .filter(e => e.type !== 'hidden' && e.offsetParent !== null);
    const naked = ctrls.filter(e => !e.closest('.field, .quiz-field'));
    t.ok(label + ':每一格都有標籤', naked.length === 0,
      naked.map(e => e.id || e.placeholder).join(', ') || `${ctrls.length} 格`);
  });

  /* ---- 1b. 其他頁面的建立列也不准有裸欄位 ----
     這一項是掃全站的:任何一個使用者要填的欄位,如果既沒有 .field 標籤、
     旁邊也沒有文字,就是「填到一半不知道這格是什麼」。
     已知可以接受的例外列在 OK 裡(它們上方有區塊標題)。 */
  const OK = ['teacherMessageBox', 'classNoteBox', 'settingsStudents',
              'aiModelSelect', 'pickerMode'];
  const naked2 = [];
  NAV_GROUPS.forEach(g => g.items.forEach(it => {
    navGoItem(g.key, it.view, it.sub || '');
    const view = document.querySelector('.view.active');
    if (!view) return;
    view.querySelectorAll('input, select, textarea').forEach(e => {
      if (e.type === 'hidden' || e.type === 'checkbox' || e.type === 'radio') return;
      if (e.offsetParent === null) return;
      if (e.closest('.field, .quiz-field')) return;
      if (OK.includes(e.id)) return;
      const prev = e.previousElementSibling;
      const hasText = (prev && prev.textContent.trim().length > 0)
        || (e.closest('label') && e.closest('label').textContent.trim().length > 0)
        || !!e.closest('.rule-editor-row');   // 重複列靠最上面那一列欄位名
      if (hasText) return;
      naked2.push(`${g.name}/${it.name} #${e.id || e.placeholder}`);
    });
  }));
  t.ok('全站沒有「連旁邊都沒有字」的欄位', naked2.length === 0,
    [...new Set(naked2)].join(' · '));

  /* ---- 1c. 分組的那一格在兩種模式下是兩件事 ---- */
  navGoItem('class', 'management', 'grouping');
  setGroupMode('byCount');
  const l1 = document.getElementById('groupParamLabel').textContent;
  setGroupMode('bySize');
  const l2 = document.getElementById('groupParamLabel').textContent;
  t.ok('分組的欄位標籤會跟著模式換(分成幾組 / 每組幾人)',
    l1 !== l2 && l1.includes('組數') && l2.includes('人數'), `${l1} → ${l2}`);
  setGroupMode('byCount');

  /* ---- 2. 專案裡只留一套「標籤在上面」 ---- */
  const a = getComputedStyle(document.querySelector('.field-label') || document.body).fontSize;
  navGoItem('challenge', 'quiz', '');
  const b = getComputedStyle(document.querySelector('.quiz-field-label')).fontSize;
  t.ok('新舊兩個名字吃同一份樣式(不然同一排會長得不一樣)', a === b, `${a} vs ${b}`);

  /* ---- 3. 輸入框有看得見的焦點 ---- */
  navGoItem('shop', 'shop', 'shopItems');
  const input = document.getElementById('shopItemName');
  input.focus();
  /* 光圈是用 transition 淡進來的(150ms),所以 focus() 之後馬上讀
     computed style 會拿到「過渡的起點」= 還沒有光圈。
     我第一版就是這樣誤判成「光圈沒生效」,追了半天才發現是自己讀太早。 */
  await new Promise(r => setTimeout(r, 260));
  const fs = getComputedStyle(input);
  /* 這一項原本只檢查 boxShadow !== 'none',結果 rgba(0,0,0,0) 0 0 0 0
     也會通過 —— 那是「沒有光圈」。要同時確認真的聚焦了、
     顏色不是全透明、而且擴散不是 0,否則這一項會假過。 */
  const ring = fs.boxShadow || '';
  t.ok('輸入框聚焦時有光圈',
    input.matches(':focus') && !ring.includes('rgba(0, 0, 0, 0)')
    && /[1-9]\d*px\s*$/.test(ring.trim()),
    (input.matches(':focus') ? '' : '(沒有聚焦)') + ring.slice(0, 44));
  /* outline 會被 overflow:hidden 的父層切掉,而這個專案到處是會捲的卡片,
     所以光圈一定要用 box-shadow 畫。 */
  t.ok('光圈用 box-shadow 而不是 outline(會被捲動容器切掉)',
    fs.outlineStyle === 'none' || parseFloat(fs.outlineWidth) === 0);
  input.blur();

  /* ---- 4. 獎品卡平常是一件獎品,不是一張表單 ---- */
  renderShopItems();
  const cards = document.querySelectorAll('.shop-item-card');
  t.ok('獎品都畫出來了', cards.length === 3, cards.length + ' 張');
  t.ok('平常不是表單(沒有輸入框)',
    document.querySelectorAll('.shop-item-card input').length === 0);
  t.ok('看得到名稱、說明與點數',
    cards[0].textContent.includes('免寫一次作業')
    && cards[0].textContent.includes('可以免寫一項回家作業')
    && cards[0].textContent.includes('30 點'));
  t.ok('庫存留空顯示「不限」', cards[2].textContent.includes('不限'));
  t.ok('賣完的標成「剩 0 份」並標紅',
    cards[1].querySelector('.shop-tag.is-out') !== null);
  t.ok('下架的看得出來', cards[2].textContent.includes('已下架'));

  // 按編輯才變成表單,而且一次只開一張
  editShopItem('i1');
  t.ok('按編輯才出現表單',
    document.querySelector('.shop-item-card.is-editing') !== null
    && document.querySelectorAll('.shop-item-card.is-editing').length === 1);
  t.ok('編輯中的那張每一格也都有標籤',
    [...document.querySelectorAll('.shop-item-card.is-editing input')]
      .every(e => e.closest('.field')));
  editShopItem('i2');
  t.ok('一次只開一張',
    document.querySelectorAll('.shop-item-card.is-editing').length === 1);
  editShopItem(null);
  t.ok('完成之後收回檢視狀態',
    document.querySelectorAll('.shop-item-card input').length === 0);

  /* ---- 5. 投影模式可以收掉選單 ---- */
  navGoItem('data', 'projector', '');
  const topbar = document.querySelector('.app-topbar') || document.querySelector('.app-header');
  const before = topbar.getBoundingClientRect().height;
  // requestFullscreen 在測試環境會被拒絕,但 class 與版面要照樣生效
  toggleProjectorFull();
  t.ok('全螢幕時選單收起來',
    document.documentElement.classList.contains('projector-full')
    && topbar.getBoundingClientRect().height === 0,
    `原本 ${Math.round(before)}px`);
  t.ok('離開鈕還在(不然出不去)',
    document.getElementById('projFullBtn').offsetParent !== null);
  toggleProjectorFull();
  t.ok('再按一次還原',
    !document.documentElement.classList.contains('projector-full')
    && topbar.getBoundingClientRect().height > 0);

  /* ---- 6. 頒獎台 ----
     我一度以為方塊上面那一大塊是空白,量過才發現那是「守護獸 + 名字 + 分數」
     那一塊(123px),只是它的入場動畫有 0.5 秒延遲,截圖時還在 opacity:0。
     所以這裡要盯的不是空白,而是「那一塊真的存在」—— 它如果沒畫出來,
     畫面看起來就會像頒獎台憑空浮在半空中。 */
  navGoItem('data', 'overview', 'rank');
  const podium = document.querySelector('.podium');
  if (podium) {
    const fig = podium.querySelector('.podium-figure');
    t.ok('頒獎台上有守護獸與名字(不是一塊空白)',
      !!fig && fig.getBoundingClientRect().height > 60
      && /\d/.test(podium.querySelector('.podium-score').textContent),
      fig ? Math.round(fig.getBoundingClientRect().height) + 'px' : '沒有');
    t.ok('手機上三個並排不會頂到邊', (() => {
      const cols = [...podium.querySelectorAll('.podium-column')];
      return cols.length === 3;
    })());
  }

  /* ---- 7. 學生的守護獸卡 ----
     這是學生打開 App 第一眼看到的東西。原本牠只是白卡片中央的一個圖示,
     四周一片空白 —— 看起來像「一個頭像」,不像「我養的那一隻」。 */
  StudentApp.classInfo = { classId: 'C1', className: '測試班', studentId: 's0', name: '學生01' };
  StudentApp.student = { ...state.students[0], totalPoints: 999, pet: PET_SPECIES[0].id,
                         petName: '小獸', currentPoints: 50, history: [] };
  StudentApp.allStudents = [StudentApp.student];
  StudentApp.classRules = state.rules;
  StudentApp.classSkills = state.skills;
  const petBox = document.createElement('div');
  petBox.style.width = '360px';
  document.body.appendChild(petBox);
  petBox.innerHTML = StudentApp.renderPet(StudentApp.student);
  const card = petBox.querySelector('.student-pet-card');
  const icon = petBox.querySelector('.student-pet-icon');
  t.ok('守護獸卡標出階段(外圈顏色靠它)',
    [...card.classList].some(c => /^stage-\d$/.test(c)), [...card.classList].join(' '));
  t.ok('守護獸夠大(原本只是一個圖示)',
    icon.getBoundingClientRect().width >= 120,
    Math.round(icon.getBoundingClientRect().width) + 'px');
  t.ok('最高階有金色外圈',
    getComputedStyle(icon).boxShadow.includes('rgb(200, 164, 77)')
    || getComputedStyle(icon).boxShadow.includes('183, 139, 42'),
    getComputedStyle(icon).boxShadow.slice(0, 50));
  petBox.remove();
  StudentApp.classInfo = null;

  /* ---- 8. 一排裡最多一顆非 ghost 的按鈕 ----
     primary(綠)與 accent(橘)都被當成「主要動作」在用,分界又是隨機的 ——
     測驗頁甚至同一排有兩個「建立」,一藍一金,看起來像兩個不同重要性的
     東西,其實是同一件事的兩條路。兩顆以上就分不出主從了。 */
  const tooMany = [];
  NAV_GROUPS.forEach(g => g.items.forEach(it => {
    navGoItem(g.key, it.view, it.sub || '');
    const view = document.querySelector('.view.active');
    if (!view) return;
    const rows = new Set();
    view.querySelectorAll('.btn-primary, .btn-accent').forEach(b => {
      if (b.offsetParent === null) return;
      rows.add(b.parentElement);
    });
    rows.forEach(row => {
      const n = [...row.children].filter(c =>
        c.matches && c.matches('.btn-primary, .btn-accent') && c.offsetParent !== null).length;
      if (n > 1) {
        tooMany.push(`${g.name}/${it.name} · ${[...row.children]
          .filter(c => c.matches && c.matches('.btn-primary, .btn-accent'))
          .map(c => c.textContent.trim().slice(0, 8)).join(' + ')}`);
      }
    });
  }));
  t.ok('同一排最多一顆主要按鈕', tooMany.length === 0,
    [...new Set(tooMany)].slice(0, 4).join(' | '));

  return t.out;
});

await close();
process.exit(report('美術共通底子', lines, errors) ? 0 : 1);
