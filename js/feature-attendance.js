/* ============================================
   點名 / 出席管理
============================================ */
function getTodayDate() {
  const d = new Date();
  return d.getFullYear() + '-' + 
         String(d.getMonth() + 1).padStart(2, '0') + '-' + 
         String(d.getDate()).padStart(2, '0');
}

function formatChineseDate(dateStr) {
  const d = new Date(dateStr);
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日 · ' + weekdays[d.getDay()];
}

function renderAttendance() {
  if (!state.currentAttendanceDate) {
    state.currentAttendanceDate = getTodayDate();
  }
  const date = state.currentAttendanceDate;
  
  renderAttendanceAward();
  document.getElementById('attendanceDate').textContent = formatChineseDate(date);
  document.getElementById('attendanceDatePicker').value = date;
  
  const dayData = state.attendance[date] || {};
  
  // 渲染統計
  let present = 0, absent = 0, late = 0;
  state.students.forEach(s => {
    const status = dayData[s.id];
    if (status === 'present') present++;
    else if (status === 'absent') absent++;
    else if (status === 'late') late++;
  });
  const unmarked = state.students.length - present - absent - late;
  
  document.getElementById('attendanceSummary').innerHTML = `
    <div class="summary-item">
      <div class="summary-item-value summary-present">${present}</div>
      <div class="summary-item-label">出席</div>
    </div>
    <div class="summary-item">
      <div class="summary-item-value summary-absent">${absent}</div>
      <div class="summary-item-label">缺席</div>
    </div>
    <div class="summary-item">
      <div class="summary-item-value summary-late">${late}</div>
      <div class="summary-item-label">遲到</div>
    </div>
    <div class="summary-item">
      <div class="summary-item-value" style="color: var(--ink-muted);">${unmarked}</div>
      <div class="summary-item-label">未點</div>
    </div>
  `;
  
  // 渲染學生列表
  const grid = document.getElementById('attendanceGrid');
  grid.innerHTML = state.students.map(s => {
    const status = dayData[s.id] || '';
    const icon = s.pet ? PetEngine.getIcon(s) : '❓';
    return `
      <div class="attendance-row status-${status}">
        <div class="student-avatar" style="width:36px;height:36px;font-size:18px;">${icon}</div>
        <div class="attendance-row-name">
          ${s.seatNumber ? `<span class="seat-no">${escapeHtml(String(s.seatNumber))}</span>` : ''}
          ${escapeHtml(s.name)}
        </div>
        <div class="status-btns">
          <button class="status-btn btn-present ${status === 'present' ? 'active' : ''}" 
            onclick="setAttendance('${s.id}', 'present')" title="出席">✓</button>
          <button class="status-btn btn-late ${status === 'late' ? 'active' : ''}" 
            onclick="setAttendance('${s.id}', 'late')" title="遲到">↻</button>
          <button class="status-btn btn-absent ${status === 'absent' ? 'active' : ''}" 
            onclick="setAttendance('${s.id}', 'absent')" title="缺席">✕</button>
        </div>
      </div>
    `;
  }).join('');
}

function setAttendance(studentId, status) {
  const date = state.currentAttendanceDate;
  if (!state.attendance[date]) state.attendance[date] = {};
  
  // 如果再次點擊相同狀態,則取消
  if (state.attendance[date][studentId] === status) {
    delete state.attendance[date][studentId];
  } else {
    state.attendance[date][studentId] = status;
  }
  
  save();
  renderAttendance();
}

function bulkAttendance(status) {
  const date = state.currentAttendanceDate;
  if (!state.attendance[date]) state.attendance[date] = {};
  
  if (status === 'absent') {
    // 清空(實際上是把這個動作當「清空」)
    delete state.attendance[date];
  } else {
    state.students.forEach(s => {
      state.attendance[date][s.id] = status;
    });
  }
  
  save();
  renderAttendance();
  toast(status === 'present' ? '全班標記為出席' : '已清空今日點名');
}

/* 出席分幾分由老師自己設(積分規則 → 自動發分),這裡只負責讀。
   舊資料沒有這個欄位時用預設值,所以不會因為更新而突然不發分。 */
function attendanceAward() {
  const a = state.attendanceAward || {};
  const n = v => (Number.isFinite(+v) ? Math.max(0, Math.min(20, Math.round(+v))) : null);
  return {
    present: n(a.present) === null ? ATTENDANCE_AWARD_DEFAULTS.present : n(a.present),
    late:    n(a.late)    === null ? ATTENDANCE_AWARD_DEFAULTS.late    : n(a.late)
  };
}

/* 把設定值填回「積分規則」那兩個欄位,並且讓點名頁的按鈕寫出實際分數 ——
   「發放出席分」看不出會發幾分,老師得切到另一頁才知道。 */
function renderAttendanceAward() {
  const pts = attendanceAward();
  const p = document.getElementById('attPresentPts');
  const l = document.getElementById('attLatePts');
  if (p && document.activeElement !== p) p.value = pts.present;
  if (l && document.activeElement !== l) l.value = pts.late;

  const btn = document.getElementById('attAwardBtn');
  if (btn) {
    btn.textContent = pts.present === 0 && pts.late === 0
      ? '出席分設為 0'
      : '發放出席分(出席 +' + pts.present
        + (pts.late > 0 ? '、遲到 +' + pts.late : '') + ')';
    btn.disabled = pts.present === 0 && pts.late === 0;
  }
}

function saveAttendanceAward() {
  const get = id => {
    const el = document.getElementById(id);
    return el ? Math.max(0, Math.min(20, parseInt(el.value, 10) || 0)) : 0;
  };
  state.attendanceAward = { present: get('attPresentPts'), late: get('attLatePts') };
  save();
  renderAttendance();
  toast('已更新出席分');
}

function awardAttendancePoints() {
  const date = state.currentAttendanceDate;
  const dayData = state.attendance[date] || {};
  const pts = attendanceAward();

  /* 遲到也可以給分(有的班給 1 分鼓勵他至少來了),設成 0 就只發出席的。 */
  const targets = Object.keys(dayData)
    .map(id => ({ id, give: dayData[id] === 'present' ? pts.present
                        : dayData[id] === 'late' ? pts.late : 0,
                  status: dayData[id] }))
    .filter(t => t.give > 0);

  if (targets.length === 0) {
    const marked = Object.keys(dayData).some(id => dayData[id] === 'present' || dayData[id] === 'late');
    toast(marked ? '出席分設成 0 分,沒有要發的分數' : '沒有人標記為出席');
    return;
  }

  /* 同一天不會發第二次。
     這顆按鈕本來按幾次就加幾次 —— 而點完名順手多按一下、或是「咦我按過了嗎」
     再按一次,都是每天會發生的事。判斷的依據就是歷程裡有沒有這一天的出席分
     (原因字串裡帶著日期),所以不必另外存一份「發過了沒」的紀錄,
     也對先前已經發過的那些天同樣有效。

     出席與遲到的原因字串不一樣,但判斷時兩種都算「這一天發過了」——
     不然老師把某人從出席改成遲到,他就會再領一次。 */
  const reasonOf = st => (st === 'late' ? '遲到出席分(' : '出席分(') + date + ')';
  const gotIt = id => {
    const s = getStudent(id);
    return !!s && (s.history || []).some(e =>
      e.reason === '出席分(' + date + ')' || e.reason === '遲到出席分(' + date + ')');
  };
  const fresh = targets.filter(t => !gotIt(t.id));

  if (fresh.length === 0) {
    toast('這一天的出席分已經發過了,沒有重複加');
    return;
  }

  /* 一律走共用的發分函式。
     這裡本來是自己改欄位,而且寫了 currentPoints = totalPoints ——
     等於把學生在商店花掉的點數全部還給他:花了 90 點的學生只要被記一次
     出席,可用積分就跳回累積經驗的數字。 */
  fresh.forEach(t => {
    applyPointsToStudent(t.id, t.give, reasonOf(t.status));
  });

  save();
  renderAttendance();
  const skipped = targets.length - fresh.length;
  toast('已為 ' + fresh.length + ' 位同學發出席分'
        + (skipped > 0 ? `(另外 ${skipped} 位先前已經發過了)` : ''));
}

function changeAttendanceDate() {
  const newDate = document.getElementById('attendanceDatePicker').value;
  if (newDate) {
    state.currentAttendanceDate = newDate;
    renderAttendance();
  }
}
