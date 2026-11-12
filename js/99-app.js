/* ============================================
   渲染:整體
   呼叫所有區塊的渲染函式,當資料變動時可呼叫此函式重新繪製整個 App
============================================ */

function renderAll() {
  // 雲端模式的班級名稱由頁首的下拉選單顯示,這裡就不重複一次
  const header = document.getElementById('headerClassName');
  if (header) {
    header.textContent = state.className;
    header.style.display = state.classId ? 'none' : '';
  }
  
  const teacher = document.getElementById('headerTeacherName');
  if (teacher) teacher.textContent = state.teacherName;
  
  const proj = document.getElementById('projClassName');
  if (proj) proj.textContent = state.className;
  
  renderStudentList();
  renderQuizList();
  renderSelectedStudent();
  renderRuleGrid();
  renderProjector();
  renderRulesEditor();
  renderAttendanceAward();
  renderDataUsage();
  renderSkillBoard();
  renderWeeklyPanel();
  renderOverview();
  renderSettings();
  updateTimerDisplay();
}

/* ============================================
   啟動
============================================ */

document.addEventListener('DOMContentLoaded', () => {
  /* 學生模擬模式:這一份 index.html 是被老師那一頁用 iframe 載進來的,
     不要去連雲端、不要跑登入流程 —— 資料會由父視窗送進來。 */
  if (StudentPreviewFrame.isPreview()) { StudentPreviewFrame.boot(); return; }
  Session.boot();
});
