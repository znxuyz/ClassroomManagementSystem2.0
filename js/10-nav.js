/* ============================================
   切換頁面
============================================ */
function switchView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(name + 'View').classList.add('active');

  /* 導覽改成兩層之後,上面那排按的是「分類」不是畫面。
     switchView 也可能從別處被呼叫(換班後重畫、程式內部跳頁),
     所以這裡要把兩排導覽校正到對的位置 —— 否則會出現
     「畫面換了但選單還停在上一個」。 */
  if (typeof navSyncTo === 'function') navSyncTo(name);
  
  if (name === 'projector') renderProjector();
  if (name === 'overview') renderOverviewView();
  if (name === 'tools') renderToolsView();
  if (name === 'management') renderManagementView();
  if (name === 'contact') renderContactView();
  if (name === 'shop') renderShopView();
  if (name === 'ai') renderAiView();
  if (name === 'quiz') renderQuizList();
  if (name === 'territory') renderTerritoryView();
  if (name === 'help') renderHelpView();
  if (name === 'settings') renderSettings();
}

/* 重畫目前停留的那一頁。
   renderAll() 只負責後台、測驗、報表那幾塊;座位表、點名、聯絡簿、
   商店、蜂巢戰紀是切到該分頁時才畫的,所以換班之後若不補這一下,
   畫面會停在上一個班級的內容。 */
function renderActiveView() {
  const view = document.querySelector('.view.active');
  if (!view) return;
  const name = view.id.replace(/View$/, '');
  switchView(name);

  const sub = view.querySelector('.sub-tab.active');
  if (sub) switchSubTab(name, sub.dataset.subtab);
}

/* 系統設定本來是一頁長長的捲動,八塊不相干的設定疊在一起。
   拆成四個子分頁之後,副標題要跟著換,不然每一頁都寫「管理班級資料」。 */
const SETTINGS_SUBTITLES = {
  setClass: '班級名稱、老師稱呼、學生名單',
  setGame:  '守護獸技能的開關與刷新',
  setData:  '備份、還原、用量與封存',
  setLook:  '配色主題與 AI 助手'
};

function switchSubTab(parent, subtab) {
  const container = document.getElementById(parent + 'View');
  container.querySelectorAll('.sub-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.subtab === subtab);
  });
  container.querySelectorAll('.sub-view').forEach(v => {
    v.classList.toggle('active', v.id === subtab + 'SubView');
  });
  
  if (subtab === 'attendance') renderAttendance();
  if (subtab === 'picker') renderPicker();
  if (subtab === 'seating') renderSeating();
  if (subtab === 'grouping') renderGroupingControls();
  if (subtab === 'diary') renderContactDiary();
  if (subtab === 'homework') renderHomeworkList();
  if (subtab === 'shopItems') renderShopItems();
  if (subtab === 'purchases') renderPurchaseList();
  if (subtab === 'tasks') renderTasksList();
  if (subtab === 'tgBoard') { renderTerritoryBoard(); renderTerritoryFeed(); }
  if (subtab === 'tgQuestions') renderTerritoryQuestions();
  if (subtab === 'helpTeacher' || subtab === 'helpStudent') renderHelpView();
  if (subtab === 'general') renderOverview();
  if (subtab === 'rank') renderTeacherRank();
  if (subtab === 'report') renderReportStudentList();
  if (subtab === 'aiComment') renderAiCommentStudentList();
  if (subtab === 'aiPolish') {} // 純表單,不需特別渲染
  if (subtab === 'aiAnalyze') renderAiAnalyzeStudentList();
  if (SETTINGS_SUBTITLES[subtab]) {
    const el = document.querySelector('#settingsView .view-subtitle');
    if (el) el.textContent = SETTINGS_SUBTITLES[subtab];
  }
  /* 系統設定的四個子分頁都是 renderAll() 一次畫好的(renderSettings、
     renderSkillBoard、renderDataUsage),切分頁不必再畫一次。
     唯一要補的是備份清單 —— 它是按「查看備份」才去雲端讀的。 */
}

function renderOverviewView() {
  const activeSubtab = document.querySelector('#overviewView .sub-tab.active');
  if (activeSubtab) {
    const subtabName = activeSubtab.dataset.subtab;
    if (subtabName === 'general') renderOverview();
    if (subtabName === 'rank') renderTeacherRank();
    if (subtabName === 'report') renderReportStudentList();
  }
}

function renderAiView() {
  // 檢查是否有 API Key
  const hasKey = AI.hasKey();
  document.getElementById('aiKeySetupBox').style.display = hasKey ? 'none' : 'block';
  document.getElementById('aiMainArea').style.display = hasKey ? 'block' : 'none';
  
  const statusEl = document.getElementById('aiStatus');
  if (hasKey) {
    statusEl.innerHTML = '<span class="ai-status-dot connected"></span><span>已連接 · ' + AI.getModel() + '</span>';
  } else {
    statusEl.innerHTML = '<span class="ai-status-dot disconnected"></span><span>未設定 API Key</span>';
  }
  
  if (hasKey) {
    const activeSubtab = document.querySelector('#aiView .sub-tab.active');
    if (activeSubtab) {
      const subtabName = activeSubtab.dataset.subtab;
      if (subtabName === 'aiComment') renderAiCommentStudentList();
      if (subtabName === 'aiAnalyze') renderAiAnalyzeStudentList();
    }
  }
}

function renderToolsView() {
  const activeSubtab = document.querySelector('#toolsView .sub-tab.active');
  if (activeSubtab) {
    const subtabName = activeSubtab.dataset.subtab;
    if (subtabName === 'attendance') renderAttendance();
    if (subtabName === 'picker') renderPicker();
  }
}

function renderManagementView() {
  const activeSubtab = document.querySelector('#managementView .sub-tab.active');
  if (activeSubtab) {
    const subtabName = activeSubtab.dataset.subtab;
    if (subtabName === 'seating') renderSeating();
    if (subtabName === 'grouping') renderGroupingControls();
  }
}

function renderContactView() {
  const activeSubtab = document.querySelector('#contactView .sub-tab.active');
  if (activeSubtab) {
    const subtabName = activeSubtab.dataset.subtab;
    if (subtabName === 'diary') renderContactDiary();
    if (subtabName === 'homework') renderHomeworkList();
  }
}

/* renderShopView 定義在 feature-shop.js */
