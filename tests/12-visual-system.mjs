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

  return t.out;
});

await close();
process.exit(report('美術共通底子', lines, errors) ? 0 : 1);
