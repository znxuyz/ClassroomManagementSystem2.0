/* ============================================
   學期成長報表
============================================ */
function renderReportStudentList() {
  const list = document.getElementById('reportStudentList');
  if (!list) return;
  
  if (state.students.length === 0) {
    list.innerHTML = '<div class="empty-state" style="grid-column: 1 / -1;">尚無學生</div>';
    return;
  }
  
  list.innerHTML = state.students.map(s => {
    const stage = s.pet ? PetEngine.getStage(s.totalPoints) : 0;
    const icon = s.pet ? PetEngine.getIcon(s) : '❓';
    return `
      <div class="report-student-card" onclick="showStudentReport('${s.id}')">
        <div class="student-avatar stage-${stage}" style="width:40px;height:40px;font-size:20px;">
          ${icon}
        </div>
        <div class="info">
          <div class="nm">${s.name}</div>
          <div class="meta">${STAGE_NAMES[stage]} · ${s.totalPoints} 經驗</div>
        </div>
      </div>
    `;
  }).join('');
  
  document.getElementById('reportContainer').innerHTML = '';
}

async function showStudentReport(studentId) {
  const container = document.getElementById('reportContainer');
  const student = getStudent(studentId);
  if (!student) return;

  container.innerHTML = '<div class="empty-state">讀取完整歷程中…</div>';
  container.scrollIntoView({ behavior: 'smooth', block: 'start' });

  /* 主文件只留最近幾筆(見 03b-history-archive.js),所以報表要自己把
     封存的那段讀回來 —— 否則「積分來源分類」與「最近 8 週」會少算。
     只有打開某一位學生的報表時才讀,所以不影響日常的讀取量。 */
  const full = await HistoryArchive.full(student);
  container.innerHTML = buildStudentReport({ ...student, history: full });
}

function buildStudentReport(s) {
  const stage = s.pet ? PetEngine.getStage(s.totalPoints) : 0;
  const species = s.pet ? PET_SPECIES.find(p => p.id === s.pet) : null;
  const icon = s.pet ? PetEngine.getIcon(s) : '❓';
  
  // 統計總出席
  let presentDays = 0, absentDays = 0, lateDays = 0, totalDays = 0;
  Object.values(state.attendance).forEach(day => {
    if (day[s.id]) {
      totalDays++;
      if (day[s.id] === 'present') presentDays++;
      else if (day[s.id] === 'absent') absentDays++;
      else if (day[s.id] === 'late') lateDays++;
    }
  });
  const attendanceRate = totalDays > 0 ? Math.round((presentDays + lateDays) / totalDays * 100) : 0;
  
  // 作業
  let hwSubmitted = 0, hwLate = 0, hwMissing = 0, hwTotal = 0;
  state.homework.forEach(hw => {
    hwTotal++;
    const sub = hw.submissions?.[s.id];
    if (sub) {
      if (sub.status === 'submitted') hwSubmitted++;
      else if (sub.status === 'late') hwLate++;
      else if (sub.status === 'missing') hwMissing++;
    } else {
      hwMissing++;
    }
  });
  const hwRate = hwTotal > 0 ? Math.round((hwSubmitted + hwLate) / hwTotal * 100) : 100;
  
  // 積分來源分類
  const reasonGroups = {};
  (s.history || []).forEach(h => {
    if (!reasonGroups[h.reason]) reasonGroups[h.reason] = 0;
    reasonGroups[h.reason] += h.points;
  });
  const topReasons = Object.entries(reasonGroups).sort((a,b) => b[1] - a[1]).slice(0, 5);
  
  // 週累積積分(取最近 8 週)
  const weeklyPoints = computeWeeklyPoints(s);
  const maxWeek = Math.max(...weeklyPoints.map(w => Math.abs(w.points)), 1);
  
  // 商店購買
  const purchases = state.shopHistory.filter(h => h.studentId === s.id);
  const itemCounts = {};
  purchases.forEach(p => {
    const item = findShopItem(p.itemId);
    if (item) itemCounts[item.name] = (itemCounts[item.name] || 0) + 1;
  });
  
  return `
    <div class="report-page" id="reportPrintArea">
      <h1>${state.className} · 學期成長報告</h1>
      <div class="report-meta">${s.name} · ${state.teacherName} · 截至 ${formatChineseDate(getTodayDate())}</div>
      
      <div class="report-hero">
        <div class="report-hero-pet">
          ${icon}
        </div>
        <div class="report-hero-info">
          <div class="name">${s.name}</div>
          <div class="desc">守護獸 ${species ? species.name : '尚未選擇'}${s.petName ? '「' + s.petName + '」' : ''} · 已成長至「<strong>${STAGE_NAMES[stage]}</strong>」階段</div>
          <div class="report-stats">
            <div class="report-stat"><span class="label">累積經驗</span><span class="val">${s.totalPoints}</span></div>
            <div class="report-stat"><span class="label">可用積分</span><span class="val">${s.currentPoints}</span></div>
            <div class="report-stat"><span class="label">出席率</span><span class="val">${attendanceRate}%</span></div>
            <div class="report-stat"><span class="label">作業完成率</span><span class="val">${hwRate}%</span></div>
          </div>
        </div>
      </div>
      
      <h2>成長軌跡(週累積積分)</h2>
      <div class="report-chart-wrap">
        <div class="report-bar-chart">
          ${weeklyPoints.map(w => `
            <div class="report-bar" 
              style="height: ${Math.max(3, (Math.abs(w.points) / maxWeek * 100))}%; ${w.points < 0 ? 'background: linear-gradient(180deg, #B5563D, #8B3A4E);' : ''}"
              data-value="${w.label}: ${w.points > 0 ? '+' : ''}${w.points} 分"><span
              class="report-bar-num">${w.points > 0 ? '+' : ''}${w.points}</span></div>
          `).join('')}
        </div>
        <div class="report-chart-labels">
          ${weeklyPoints.map(w => `<span>${w.label}</span>`).join('')}
        </div>
      </div>
      
      <h2>積分來源分布</h2>
      <div class="report-breakdown">
        <div class="report-breakdown-block">
          <h3>主要得分項目</h3>
          <ul class="report-breakdown-list">
            ${topReasons.length > 0 ? topReasons.map(([r, p]) => 
              `<li><span>${r}</span><strong>${p > 0 ? '+' : ''}${p}</strong></li>`
            ).join('') : '<li>尚無紀錄</li>'}
          </ul>
        </div>
        <div class="report-breakdown-block">
          <h3>出席與作業</h3>
          <ul class="report-breakdown-list">
            <li><span>出席天數</span><strong>${presentDays} 天</strong></li>
            <li><span>遲到天數</span><strong>${lateDays} 天</strong></li>
            <li><span>缺席天數</span><strong>${absentDays} 天</strong></li>
            <li><span>已繳作業</span><strong>${hwSubmitted}/${hwTotal}</strong></li>
            <li><span>遲交作業</span><strong>${hwLate}/${hwTotal}</strong></li>
          </ul>
        </div>
      </div>
      
      ${Object.keys(itemCounts).length > 0 ? `
        <h2>守護獸照料(商店紀錄)</h2>
        <div class="report-narrative">
          ${s.name} 在本學期共為守護獸購買了 ${purchases.length} 次物品,包含:${Object.entries(itemCounts).map(([n, c]) => n + (c > 1 ? ' × ' + c : '')).join('、')}。
        </div>
      ` : ''}
      
      ${buildHistoryDetail(s)}

      <h2>導師評語</h2>
      <div class="report-narrative" id="reportNarrative" contenteditable="true" 
        style="border: 1px dashed #ccc; min-height: 80px;">${buildAutoNarrative(s, stage, attendanceRate, hwRate, topReasons)}</div>
      <div style="font-size: 11px; color: #999; margin-top: 4px;">✦ 此區域可直接點擊編輯;若已設定 AI 助手,可於 AI 頁面用更詳細的觀察生成更個人化的評語。</div>
      
      <div class="report-footer">
        守護獸學園 · ${state.className} · 班導:${state.teacherName}
      </div>
    </div>
    
    <div class="report-actions">
      <button class="btn btn-primary" onclick="printStudentReport()">🖨 列印此報告</button>
      <!-- 給家長的那一份:一個檔案,手機點開就看得到,不必登入也不必有網路 -->
      <button class="btn btn-ghost" onclick="exportStudentReport('${s.id}')"
              title="下載成一個檔案,可以用 LINE 或 email 傳給家長">⤓ 下載給家長</button>
      <button class="btn btn-ghost" onclick="document.getElementById('reportContainer').innerHTML=''; renderReportStudentList();">返回列表</button>
    </div>
  `;
}

/* ============================================
   逐筆積分明細
   ────────────────────────────────────────────
   報表原本只給「最近 8 週」的長條圖和「前 5 名得分項目」。
   家長在親師座談最常問的卻是具體的那一件事 ——
   「上個月為什麼扣分?」「這個加分是什麼?」原本答不出來。

   加分紀錄封存之後(見 03b-history-archive.js),showStudentReport()
   已經會把整學期的歷程讀回來,只是沒拿來用。這裡就用它。

   版面上分兩層:
   · **每月統計**一直顯示。一個學期大概 5~10 列,印出來只多半頁,
     而且剛好是家長要的粒度(「九月得 42 分、扣 5 分」)。
   · **逐筆明細**預設收起來。整學期可能四五百筆,全部攤開是好幾頁,
     不能每次列印都塞給家長 —— 老師要給的時候自己按開再印。
============================================ */

function monthlyPoints(history) {
  const byMonth = {};
  (history || []).forEach(h => {
    const d = new Date(h.time || 0);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const m = byMonth[key] || (byMonth[key] = { key, gain: 0, loss: 0, n: 0, rows: [] });
    if (h.points >= 0) m.gain += h.points; else m.loss += h.points;
    m.n++;
    m.rows.push(h);
  });
  // 新的月份排前面;每個月裡面也是新的在前面
  return Object.values(byMonth)
    .sort((a, b) => (a.key < b.key ? 1 : -1))
    .map(m => ({ ...m, rows: m.rows.slice().sort((a, b) => (b.time || 0) - (a.time || 0)) }));
}

function buildHistoryDetail(s) {
  const months = monthlyPoints(s.history);
  if (months.length === 0) return '';

  const total = (s.history || []).length;
  const gain = months.reduce((t, m) => t + m.gain, 0);
  const loss = months.reduce((t, m) => t + m.loss, 0);

  const monthName = key => {
    const [y, m] = key.split('-');
    return `${y} 年 ${parseInt(m)} 月`;
  };

  return `
    <h2>每月積分</h2>
    <div class="report-narrative" style="margin-bottom:8px;">
      本學期共 ${total} 筆紀錄,累計得分 <strong>+${gain}</strong>、
      扣分 <strong>${loss}</strong>,淨值 <strong>${gain + loss}</strong>。
    </div>
    <table class="report-month-table">
      <thead><tr><th>月份</th><th>得分</th><th>扣分</th><th>淨值</th><th>筆數</th></tr></thead>
      <tbody>
        ${months.map(m => `
          <tr>
            <td>${monthName(m.key)}</td>
            <td class="is-gain">+${m.gain}</td>
            <td class="is-loss">${m.loss === 0 ? '—' : m.loss}</td>
            <td><strong>${m.gain + m.loss}</strong></td>
            <td>${m.n}</td>
          </tr>`).join('')}
      </tbody>
    </table>

    <div class="report-detail-toggle">
      <button class="btn btn-ghost btn-small" onclick="toggleHistoryDetail()"
              id="reportDetailBtn">展開逐筆明細(${total} 筆)</button>
      <span class="report-detail-note">明細展開後才會跟著列印</span>
    </div>

    <div id="reportHistoryDetail" class="report-detail" hidden>
      ${months.map(m => `
        <h3 class="report-detail-month">${monthName(m.key)}</h3>
        <table class="report-month-table is-detail">
          <tbody>
            ${m.rows.map(h => `
              <tr>
                <td class="report-detail-date">${new Date(h.time || 0)
                    .toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}</td>
                <td>${escapeHtml(h.reason || '(未註明)')}</td>
                <td class="${h.points >= 0 ? 'is-gain' : 'is-loss'}">
                  ${h.points >= 0 ? '+' : ''}${h.points}</td>
              </tr>`).join('')}
          </tbody>
        </table>`).join('')}
    </div>`;
}

function toggleHistoryDetail() {
  const box = document.getElementById('reportHistoryDetail');
  const btn = document.getElementById('reportDetailBtn');
  if (!box || !btn) return;
  const open = box.hasAttribute('hidden');
  if (open) box.removeAttribute('hidden'); else box.setAttribute('hidden', '');
  btn.textContent = open
    ? '收起逐筆明細'
    : `展開逐筆明細(${box.querySelectorAll('.is-detail tbody tr').length} 筆)`;
}

function computeWeeklyPoints(student) {
  const weeks = [];
  const now = new Date();
  // 取最近 8 週
  for (let i = 7; i >= 0; i--) {
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() - i * 7);
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekStart.getDate() - 6);
    const startMs = weekStart.setHours(0,0,0,0);
    const endMs = weekEnd.setHours(23,59,59,999);
    
    const weekPts = (student.history || [])
      .filter(h => h.time >= startMs && h.time <= endMs)
      .reduce((s, h) => s + h.points, 0);
    
    const label = (weekStart.getMonth() + 1) + '/' + weekStart.getDate();
    weeks.push({ label, points: weekPts });
  }
  return weeks;
}

function buildAutoNarrative(s, stage, attRate, hwRate, topReasons) {
  let n = '';
  const stageText = STAGE_NAMES[stage];
  n += `${s.name}在本學期將守護獸培育至「${stageText}」階段,累積 ${s.totalPoints} 點經驗。`;
  
  if (attRate >= 95) n += '出席表現極為穩定,';
  else if (attRate >= 85) n += '出席狀況良好,';
  else if (attRate < 70) n += '出席率偏低需要關注,';
  
  if (hwRate >= 90) n += '作業繳交準時,展現責任感。';
  else if (hwRate >= 70) n += '作業繳交大致準時,偶有遺漏。';
  else n += '作業繳交需要再加強。';
  
  if (topReasons.length > 0) {
    n += '\n\n主要表現在「' + topReasons.slice(0, 2).map(r => r[0]).join('」與「') + '」方面,';
    if (topReasons[0][1] > 30) n += '展現相當突出的能力。';
    else n += '持續穩定累積。';
  }
  
  return n;
}

function printStudentReport() {
  window.print();
}

async function downloadClassReport() {
  toast('讀取完整歷程中…');
  // 主文件只留最近幾筆,整班報表要把封存的那段也併回來
  const archived = await HistoryArchive.fullAll();
  const studentsForReport = state.students.map(s =>
    ({ ...s, history: archived[s.id] || s.history || [] }));

  // 開新視窗匯出全班報表
  const win = window.open('', '_blank');
  let html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>${state.className} 班級總報表</title>
    <style>
      body { font-family: 'Noto Serif TC', 'PingFang TC', serif; padding: 40px; max-width: 900px; margin: 0 auto; color: #1A1612; }
      h1 { text-align: center; border-bottom: 3px solid #2D5F47; padding-bottom: 12px; }
      h2 { color: #2D5F47; margin-top: 30px; }
      .student-block { page-break-inside: avoid; border: 1px solid #ddd; padding: 16px; margin: 16px 0; border-radius: 8px; background: #FBF6E9; }
      .name { font-size: 18px; font-weight: 700; color: #2D5F47; }
      .meta { font-size: 13px; color: #666; }
      .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 10px; font-size: 13px; }
      .stat { background: white; padding: 8px; border-radius: 4px; }
      .stat .v { font-weight: 700; font-size: 16px; color: #2D5F47; }
      table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px; }
      th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
      th { background: #2D5F47; color: white; }
      @media print { .student-block { page-break-inside: avoid; } }
    </style></head><body>
    <h1>${state.className} · 班級成長總報表</h1>
    <p style="text-align:center; color: #666;">截至 ${formatChineseDate(getTodayDate())} · ${state.teacherName}</p>
    
    <h2>班級總覽</h2>
    <table>
      <thead><tr>
        <th>學生</th><th>守護獸</th><th>階段</th>
        <th>累積經驗</th><th>出席率</th><th>作業完成率</th>
      </tr></thead>
      <tbody>
  `;
  
  studentsForReport.forEach(s => {
    const stage = s.pet ? PetEngine.getStage(s.totalPoints) : 0;
    const species = s.pet ? PET_SPECIES.find(p => p.id === s.pet) : null;
    let pres = 0, lat = 0, tot = 0;
    Object.values(state.attendance).forEach(day => {
      if (day[s.id]) {
        tot++;
        if (day[s.id] === 'present') pres++;
        else if (day[s.id] === 'late') lat++;
      }
    });
    let hwS = 0, hwL = 0, hwTot = state.homework.length;
    state.homework.forEach(hw => {
      const sub = hw.submissions?.[s.id];
      if (sub?.status === 'submitted') hwS++;
      else if (sub?.status === 'late') hwL++;
    });
    
    html += `<tr>
      <td><strong>${s.name}</strong></td>
      <td>${species ? species.name : '—'}</td>
      <td>${s.pet ? STAGE_NAMES[stage] : '—'}</td>
      <td>${s.totalPoints}</td>
      <td>${tot > 0 ? Math.round((pres+lat)/tot*100) : 0}%</td>
      <td>${hwTot > 0 ? Math.round((hwS+hwL)/hwTot*100) : 100}%</td>
    </tr>`;
  });
  
  html += `</tbody></table>
    <p style="text-align:center; margin-top: 40px; color: #999; font-size: 12px;">守護獸學園 · 班級養成系統</p>
    <script>setTimeout(() => window.print(), 500);<\/script>
    </body></html>`;
  
  win.document.write(html);
  win.document.close();
}
