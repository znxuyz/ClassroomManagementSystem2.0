/* ============================================
   作業繳交
============================================ */
function createHomework() {
  const name = document.getElementById('hwName').value.trim();
  const desc = document.getElementById('hwDesc').value.trim();
  const due = document.getElementById('hwDueDate').value || getTodayDate();
  const points = parseInt(document.getElementById('hwPoints').value) || 2;
  
  if (!name) {
    toast('請輸入作業名稱');
    return;
  }
  
  state.homework.push({
    id: 'hw_' + Date.now(),
    name,
    description: desc,
    assignedDate: getTodayDate(),
    dueDate: due,
    submissionPoints: points,
    submissions: {},
    archived: false
  });
  
  save();
  document.getElementById('hwName').value = '';
  document.getElementById('hwDesc').value = '';
  document.getElementById('hwDueDate').value = '';
  renderHomeworkList();
  toast('已新增作業「' + name + '」');
}

function renderHomeworkList() {
  const list = document.getElementById('hwList');
  const active = state.homework.filter(h => !h.archived);
  const archived = state.homework.filter(h => h.archived);
  
  if (state.homework.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📝</div>
        <div>還沒有作業,從上方表單新增一筆</div>
      </div>
    `;
    return;
  }
  
  let html = '';
  active.forEach(hw => {
    html += renderHomeworkCard(hw, false);
  });
  
  if (archived.length > 0) {
    html += `<div style="margin-top: 24px; padding-top: 16px; border-top: 1px dashed var(--paper-shadow); color: var(--ink-muted); font-size: 13px; font-weight: 600;">已封存(${archived.length})</div>`;
    archived.forEach(hw => {
      html += renderHomeworkCard(hw, true);
    });
  }
  
  list.innerHTML = html;
}

function renderHomeworkCard(hw, isArchived) {
  const subs = hw.submissions || {};
  let submitted = 0, late = 0, missing = 0;
  state.students.forEach(s => {
    const st = subs[s.id]?.status;
    if (st === 'submitted') submitted++;
    else if (st === 'late') late++;
    else if (st === 'missing') missing++;
  });
  const notMarked = state.students.length - submitted - late - missing;
  
  return `
    <div class="hw-card ${isArchived ? 'archived' : ''}">
      <div class="hw-card-header">
        <div class="hw-card-info">
          <div class="hw-card-title">${hw.name}</div>
          ${hw.description ? `<div class="hw-card-desc">${hw.description}</div>` : ''}
          <div class="hw-card-meta">
            <span>指定:${hw.assignedDate}</span>
            <span>繳交期限:${hw.dueDate}</span>
            <span>繳交可得 ${hw.submissionPoints} 分</span>
          </div>
        </div>
        <div class="hw-card-stats">
          <span class="hw-stat-pill green">繳 ${submitted}</span>
          <span class="hw-stat-pill yellow">遲 ${late}</span>
          <span class="hw-stat-pill red">缺 ${missing}</span>
          ${notMarked > 0 ? `<span class="hw-stat-pill">未批 ${notMarked}</span>` : ''}
        </div>
      </div>
      
      <div class="hw-submissions">
        <div class="hw-bulk-row">
          <button class="btn btn-primary btn-small" onclick="bulkMarkHomework('${hw.id}', 'submitted')">全部標記繳交</button>
          <button class="btn btn-ghost btn-small" onclick="bulkMarkHomework('${hw.id}', '')">清空標記</button>
          <div style="flex:1;"></div>
          ${isArchived ? 
            `<button class="btn btn-ghost btn-small" onclick="toggleHomeworkArchive('${hw.id}')">取消封存</button>` :
            `<button class="btn btn-ghost btn-small" onclick="toggleHomeworkArchive('${hw.id}')">封存</button>`
          }
          <button class="btn btn-ghost btn-small" onclick="deleteHomework('${hw.id}')" style="color: var(--sick-ink);">刪除</button>
        </div>
        
        <div class="hw-student-grid">
          ${state.students.map(s => {
            const sub = subs[s.id];
            const status = sub?.status || '';
            const icon = s.pet ? PetEngine.getIcon(s) : '❓';
            return `
              <div class="hw-student-row ${status}">
                <div style="font-size:16px;">${icon}</div>
                <span class="hw-student-name">${s.name}</span>
                <div class="hw-student-buttons">
                  <button class="hw-mini-btn sub-yes ${status === 'submitted' ? 'active' : ''}" 
                    onclick="markHomework('${hw.id}', '${s.id}', 'submitted')" title="已繳交">✓</button>
                  <button class="hw-mini-btn sub-late ${status === 'late' ? 'active' : ''}" 
                    onclick="markHomework('${hw.id}', '${s.id}', 'late')" title="遲交">⏰</button>
                  <button class="hw-mini-btn sub-no ${status === 'missing' ? 'active' : ''}" 
                    onclick="markHomework('${hw.id}', '${s.id}', 'missing')" title="未繳">✕</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>
  `;
}

/* hw.paid:這一份作業誰已經領過分了。
   舊資料的這個資訊記在 submissions[sid].awarded 裡,第一次碰到就搬過來 ——
   不搬的話,已經領過的人在改一次標記之後會再領一次。 */
function ensureHomeworkPaid(hw) {
  if (hw.paid) return hw.paid;
  hw.paid = {};
  Object.keys(hw.submissions || {}).forEach(sid => {
    const r = hw.submissions[sid];
    if (r && r.awarded) hw.paid[sid] = r.awardTime || 0;
  });
  return hw.paid;
}

function markHomework(hwId, studentId, status) {
  const hw = state.homework.find(h => h.id === hwId);
  if (!hw) return;
  if (!hw.submissions) hw.submissions = {};
  ensureHomeworkPaid(hw);
  const prev = hw.submissions[studentId];

  /* 「誰已經領過這份作業的分」記在 hw.paid,而不是記在 submissions 裡。
     記在 submissions 裡會跟著標記一起被清掉,於是
     「繳交 → 遲交 → 繳交」、「清空全部 → 重新標繳交」都會再發一次分,
     同一份作業領兩次。hw.paid 不受標記變動影響,所以一份作業一個人
     就是一次,不管中間改過幾輪。
     值是當初那一筆歷程的時間,收回時靠它收得乾淨。 */

  // 取消邏輯:再次點同樣狀態 = 清除
  if (prev && prev.status === status) {
    /* 之前發過的那一筆要原樣收回 —— 連歷程裡那一筆一起拿掉。
       本來這裡是自己算「currentPoints 減掉 submissionPoints」,有兩個問題:
       一是老師事後改了作業的分數,收回的就不是當初發的那個數字;
       二是歷程裡那一筆「繳交某某作業」還留著,家長看明細會看到一筆
       對不上分數的紀錄。 */
    if (studentId in hw.paid) {
      if (hw.paid[studentId]) AwardLog.revertAt(studentId, hw.paid[studentId]);
      delete hw.paid[studentId];
    }
    delete hw.submissions[studentId];
    save();
    renderHomeworkList();
    return;
  }

  hw.submissions[studentId] = { status, submittedAt: Date.now() };

  // 這一份作業一位學生只發一次分,不管中間改過幾次狀態
  /* 用 in 而不是真假值 —— 當初發的是 0 分(或分數是 0 的作業)也算領過,
     寫成 !hw.paid[id] 的話那些人每改一次標記就會再發一次。 */
  if (!(studentId in hw.paid) && (status === 'submitted' || status === 'late')) {
    const late = status === 'late';
    // 遲交給一半分數(無條件捨去)
    const pts = late ? Math.floor(hw.submissionPoints / 2) : hw.submissionPoints;
    const entry = pts > 0
      ? applyPointsToStudent(studentId, pts, (late ? '遲交「' : '繳交「') + hw.name + '」')
      : null;
    // 分數是 0 的作業也要記一筆,否則下一次又會走進這裡
    hw.paid[studentId] = entry ? entry.time : 0;
  }

  save();
  renderHomeworkList();
}

function bulkMarkHomework(hwId, status) {
  const hw = state.homework.find(h => h.id === hwId);
  if (!hw) return;
  if (!hw.submissions) hw.submissions = {};
  ensureHomeworkPaid(hw);

  if (status === '') {
    if (!confirm('清空此作業的所有繳交標記?(已加分數會保留)')) return;
    hw.submissions = {};
  } else {
    state.students.forEach(s => {
      const prev = hw.submissions[s.id];
      if (!prev || prev.status !== status) {
        if (!hw.submissions[s.id]) hw.submissions[s.id] = {};
        hw.submissions[s.id].status = status;
        hw.submissions[s.id].submittedAt = Date.now();
        // 同樣看 hw.paid —— 清空過再按一次「全部標繳交」不會再發一次分
        if (status === 'submitted' && !(s.id in hw.paid)) {
          const entry = hw.submissionPoints > 0
            ? applyPointsToStudent(s.id, hw.submissionPoints, '繳交「' + hw.name + '」')
            : null;
          hw.paid[s.id] = entry ? entry.time : 0;
        }
      }
    });
  }
  
  save();
  renderHomeworkList();
  toast(status === '' ? '已清空' : '批次操作完成');
}

function toggleHomeworkArchive(hwId) {
  const hw = state.homework.find(h => h.id === hwId);
  if (!hw) return;
  hw.archived = !hw.archived;
  save();
  renderHomeworkList();
}

function deleteHomework(hwId) {
  if (!confirm('確定刪除此作業?(已發放的分數不會被取消)')) return;
  state.homework = state.homework.filter(h => h.id !== hwId);
  save();
  renderHomeworkList();
}
