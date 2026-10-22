/* ============================================
   兩層導覽
   ────────────────────────────────────────────
   原本上面一排有 13 個分頁,又多又難找,而且標題一長就會把分頁擠掉。
   改成兩層:上面 7 個分類,點了下面才出現那一類的項目。

   做法刻意「只改導覽,不搬畫面」——
   每一個 .view 區塊與它的 render 函式都維持原樣,
   第二排只是幫你按下原本的 switchView() / switchSubTab()。
   這樣十幾個頁面一行都不用動,風險低很多,
   之後要調順序、換分類也只是改下面這張表。

   另一個好處:原本「蜂巢戰紀 → 戰況地圖/題庫」是第三層,
   現在可以把它攤平成第二排的項目,不必點三次才到。
============================================ */

const NAV_GROUPS = [
  {
    key: 'contact', icon: '✉', name: '聯絡簿',
    items: [
      { name: '今日聯絡簿', view: 'contact', sub: 'diary' },
      { name: '作業繳交',   view: 'contact', sub: 'homework' },
      { name: '訊息潤飾',   view: 'ai',      sub: 'aiPolish' }
    ]
  },
  {
    key: 'class', icon: '☰', name: '班級管理',
    items: [
      // 照使用頻率排:前兩個天天用,積分規則設好了就很少動
      { name: '學生加分',   view: 'dashboard' },
      { name: '點名出席',   view: 'tools',      sub: 'attendance' },
      { name: '座位表',     view: 'management', sub: 'seating' },
      { name: '隨機分組',   view: 'management', sub: 'grouping' },
      { name: '抽籤機',     view: 'tools',      sub: 'picker' },
      { name: '計時器',     view: 'tools',      sub: 'timer' },
      { name: '積分規則',   view: 'rules' }
    ]
  },
  {
    key: 'shop', icon: '🎁', name: '兌換商店',
    items: [
      { name: '獎品管理',     view: 'shop', sub: 'shopItems' },
      { name: '兌換申請',     view: 'shop', sub: 'purchases' },
      { name: '班級共同任務', view: 'shop', sub: 'tasks' }
    ]
  },
  {
    key: 'challenge', icon: '⬡', name: '學習挑戰',
    items: [
      { name: '學生測驗', view: 'quiz' },
      { name: '戰況地圖', view: 'territory', sub: 'tgBoard' },
      { name: '蜂巢題庫', view: 'territory', sub: 'tgQuestions' }
    ]
  },
  {
    key: 'data', icon: '◫', name: '數據成果',
    items: [
      { name: '班級概況',     view: 'overview',  sub: 'general' },
      { name: '排行榜',       view: 'overview',  sub: 'rank' },
      { name: '學期成長報表', view: 'overview',  sub: 'report' },
      { name: '投影模式',     view: 'projector' },
      { name: '評語生成',     view: 'ai',        sub: 'aiComment' },
      { name: '行為觀察分析', view: 'ai',        sub: 'aiAnalyze' }
    ]
  },
  {
    key: 'help', icon: '?', name: '使用說明',
    items: [
      { name: '教師端', view: 'help', sub: 'helpTeacher' },
      { name: '學生端', view: 'help', sub: 'helpStudent' }
    ]
  },
  {
    key: 'settings', icon: '⚙', name: '系統設定',
    items: [
      { name: '系統設定', view: 'settings' }
    ]
  }
];

/* 開班之後落在哪裡。學生加分是每天用最多的,所以就是它。 */
const NAV_HOME = { group: 'class', view: 'dashboard' };

let _navGroup = NAV_HOME.group;

/* 找出某個畫面(可含子分頁)屬於哪一個分類的哪一個項目。
   switchView() 從別處被呼叫時(例如換班後重畫),第二排也要跟著對。 */
function navFind(view, sub) {
  for (const g of NAV_GROUPS) {
    for (const it of g.items) {
      if (it.view !== view) continue;
      if (sub && it.sub && it.sub !== sub) continue;
      return { group: g, item: it };
    }
  }
  // 子分頁對不上就退而求其次,至少找到同一個畫面所屬的分類
  for (const g of NAV_GROUPS) {
    const it = g.items.find(x => x.view === view);
    if (it) return { group: g, item: it };
  }
  return null;
}

/* 外部切換畫面時,把兩排導覽校正過來。
   只改 _navGroup 與重畫,不會再呼叫 switchView,所以不會遞迴。

   同一個畫面可能屬於多個分類(AI 助手就同時出現在「聯絡簿」的訊息潤飾
   與「數據成果」的評語生成),所以:目前分類裡已經有這個畫面的話就不要動
   —— 否則使用者按了「數據成果 → 評語生成」,會被這裡拉回「聯絡簿」。 */
function navSyncTo(view) {
  const cur = NAV_GROUPS.find(g => g.key === _navGroup);
  if (!cur || !cur.items.some(it => it.view === view)) {
    const hit = navFind(view);
    if (hit) _navGroup = hit.group.key;
  }
  renderNavTabs();
}

function renderNavTabs() {
  const top = document.getElementById('navTabs');
  if (!top) return;
  top.innerHTML = NAV_GROUPS.map(g => `
    <button class="nav-tab ${g.key === _navGroup ? 'active' : ''}"
            data-nav-group="${g.key}" onclick="navGoGroup('${g.key}')">
      <span class="nav-tab-icon">${g.icon}</span>${escapeHtml(g.name)}
    </button>`).join('');
  renderNavSubTabs();
}

function renderNavSubTabs() {
  const row = document.getElementById('navSubTabs');
  if (!row) return;
  const g = NAV_GROUPS.find(x => x.key === _navGroup);
  if (!g) { row.innerHTML = ''; return; }

  const active = document.querySelector('.view.active');
  const curView = active ? active.id.replace(/View$/, '') : '';
  const curSub = active ? (active.querySelector('.sub-tab.active') || {}).dataset : null;

  // 只有一個項目(例如系統設定)就不必再畫一排
  if (g.items.length <= 1) { row.innerHTML = ''; return; }

  row.innerHTML = g.items.map(it => {
    const on = it.view === curView && (!it.sub || !curSub || curSub.subtab === it.sub);
    return `<button class="nav-sub ${on ? 'active' : ''}"
              onclick="navGoItem('${g.key}', '${it.view}', '${it.sub || ''}')">
              ${escapeHtml(it.name)}</button>`;
  }).join('');
}

/* 點上面那一排:切到該分類的第一個項目 */
function navGoGroup(key) {
  const g = NAV_GROUPS.find(x => x.key === key);
  if (!g || g.items.length === 0) return;
  const it = g.items[0];
  navGoItem(key, it.view, it.sub || '');
}

/* 點下面那一排:切到指定畫面(必要時再切子分頁) */
function navGoItem(key, view, sub) {
  _navGroup = key;
  switchView(view);
  if (sub) switchSubTab(view, sub);
  renderNavTabs();
}
