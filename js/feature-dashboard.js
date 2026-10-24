/* ============================================
   渲染:選中學生
============================================ */
function selectStudent(id) {
  state.selectedStudentId = id;
  const student = getStudent(id);
  
  if (student && !student.pet) {
    openPetPicker(id);
    return;
  }
  
  renderStudentList();
  renderSelectedStudent();
}

function getStudent(id) {
  return state.students.find(s => s.id === id);
}

/* 收起加分面板(手機上它是蓋在畫面下方的浮層,一定要有辦法關掉) */
function clearStudentSelection() {
  state.selectedStudentId = null;
  BatchAward.picked.clear();
  renderStudentList();
  renderSelectedStudent();
}

function renderSelectedStudent() {
  const display = document.getElementById('selectedStudentDisplay');
  const panel = document.getElementById('quickAssignPanel');

  /* 有沒有選到人,版面差很多:手機上沒選人時那塊浮層不該佔住畫面。
     用 class 控制,CSS 才能依寬度決定要用浮層還是接在下面。 */
  const layout = document.getElementById('dashboardLayout');
  if (layout) {
    const on = BatchAward.active
      ? BatchAward.picked.size > 0
      : !!state.selectedStudentId;
    layout.classList.toggle('has-selection', on);
  }

  // 批次模式:上面換成「選了誰」,下面的積分規則照舊,只是套用到所有勾選的人
  if (BatchAward.active) {
    display.innerHTML = BatchAward.renderPanel();
    panel.style.display = BatchAward.picked.size > 0 ? '' : 'none';
    return;
  }

  if (!state.selectedStudentId) {
    display.innerHTML = `
      <div class="empty-state" style="color: var(--moss);">
        <div class="empty-state-icon">❋</div>
        <div>點一位學生開始加分</div>
      </div>
    `;
    panel.style.display = 'none';
    return;
  }
  
  const student = getStudent(state.selectedStudentId);
  if (!student) return;
  
  const stage = student.pet ? PetEngine.getStage(student.totalPoints) : 0;
  const health = PetEngine.getHealth(student);
  const icon = student.pet ? PetEngine.getIcon(student) : '❓';
  const species = student.pet ? PET_SPECIES.find(p => p.id === student.pet) : null;
  const next = PetEngine.getNextStageInfo(student.totalPoints);
  const petLabel = student.petName ? `「${student.petName}」 · ` : '';
  
  display.innerHTML = `
    <div class="selected-display">
      <div class="selected-pet-large stage-${stage} health-${health}">
        ${icon}
      </div>
      <div class="selected-info">
        <div class="selected-name">${student.name}</div>
        <div class="selected-species">
          ${petLabel}${species ? species.name + ' · ' + STAGE_NAMES[stage] : '尚未選擇守護獸'}
          ${health === 'mild' ? ' · 微恙' : health === 'sick' ? ' · 生病了' : ''}

        </div>
        <div class="selected-stats">
          <div class="stat-block">
            <div class="stat-label">累積經驗</div>
            <div class="stat-value">${student.totalPoints}</div>
          </div>
          <div class="stat-block">
            <div class="stat-label">可用積分</div>
            <div class="stat-value" style="color: var(--gold);">${student.currentPoints}</div>
          </div>
          <div class="stat-block">
            <div class="stat-label">階段</div>
            <div class="stat-value">${stage + 1}<span style="font-size:14px;color:var(--moss);"> / 4</span></div>
          </div>
        </div>
        ${next.isMax ? `
          <div class="progress-text" style="color: var(--gold);">✦ 已達最高階段:守護神獸</div>
        ` : `
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${next.progress}%"></div>
          </div>
          <div class="progress-text">
            <span>距離「${STAGE_NAMES[next.nextStage]}」</span>
            <span>還差 ${next.neededInStage - next.currentInStage} 分</span>
          </div>
        `}
      </div>
    </div>
  `;
  
  panel.style.display = 'block';
}

/* ============================================
   渲染:積分規則按鈕
============================================ */
function renderRuleGrid() {
  const grid = document.getElementById('ruleGrid');
  grid.innerHTML = state.rules.map((rule, i) => `
    <button class="rule-card ${rule.points < 0 ? 'negative' : ''}" onclick="assignPoints(${i})">
      <div class="rule-card-name">${rule.name}</div>
      <div class="rule-card-points">${rule.points > 0 ? '+' : ''}${rule.points}</div>
    </button>
  `).join('');
}

/* ============================================
   發放積分
============================================ */
function assignPoints(ruleIndex) {
  const rule = state.rules[ruleIndex];
  if (BatchAward.active) { BatchAward.award(rule.points, rule.name); return; }

  if (!state.selectedStudentId) {
    toast('請先選擇一位學生');
    return;
  }
  applyPointsToStudent(state.selectedStudentId, rule.points, rule.name);
}

function assignCustomPoints() {
  if (!BatchAward.active && !state.selectedStudentId) {
    toast('請先選擇一位學生');
    return;
  }
  const pointsInput = document.getElementById('customPoints');
  const reasonInput = document.getElementById('customReason');
  const points = parseInt(pointsInput.value);
  const reason = reasonInput.value.trim() || '自訂積分';
  
  if (isNaN(points) || points === 0) {
    toast('請輸入有效的分數');
    return;
  }
  
  if (BatchAward.active) BatchAward.award(points, reason);
  else applyPointsToStudent(state.selectedStudentId, points, reason);
  pointsInput.value = '';
  reasonInput.value = '';
}

/* 真正改資料的那一段。批次發分要連續叫很多次,所以不在這裡
   存檔、重繪或跳提示 —— 那些由呼叫端收尾,28 個學生才不會
   存 28 次、跳 28 個提示。
   回傳復原所需的快照,批次發分的「復原」靠它。 */
function awardPointsCore(student, points, reason) {
  const before = {
    id: student.id,
    total: student.totalPoints,
    current: student.currentPoints,
    lastPointTime: student.lastPointTime,
    historyLen: (student.history || []).length
  };

  // 正分:totalPoints 與 currentPoints 都加
  // 負分:只扣 currentPoints,totalPoints 不減(寵物不會退化)
  if (points >= 0) {
    student.totalPoints += points;
    student.currentPoints += points;
  } else {
    student.currentPoints = Math.max(0, student.currentPoints + points);
  }

  student.lastPointTime = Date.now();
  if (!student.history) student.history = [];
  student.history.push({ time: Date.now(), points, reason });
  return before;
}

/* 把 awardPointsCore 的快照倒回去 */
function revertPointsCore(before) {
  const student = getStudent(before.id);
  if (!student) return;
  student.totalPoints = before.total;
  student.currentPoints = before.current;
  student.lastPointTime = before.lastPointTime;
  if (student.history) student.history.length = before.historyLen;
}

function applyPointsToStudent(studentId, points, reason) {
  const student = getStudent(studentId);
  if (!student) return;

  const oldStage = student.pet ? PetEngine.getStage(student.totalPoints) : 0;
  awardPointsCore(student, points, reason);
  const newStage = student.pet ? PetEngine.getStage(student.totalPoints) : 0;

  // 更新班級任務進度
  updateClassTasksProgress();

  save();
  renderStudentList();
  renderSelectedStudent();
  renderProjector();

  if (newStage > oldStage) {
    toast(`✦ ${student.name} 的守護獸進化為「${STAGE_NAMES[newStage]}」!`);
    // 在今日聯絡簿留下記錄
    logToContactBook('petLevelup', `${student.name} 的守護獸進化為「${STAGE_NAMES[newStage]}」`);
  } else {
    toast(`${student.name} ${points > 0 ? '+' : ''}${points} 分 · ${reason}`);
  }

  triggerProjectorFlash(studentId, points);
}

/* ============================================
   寵物選擇器
============================================ */
function openPetPicker(studentId) {
  state.pendingPetSelection = studentId;
  state.pendingPetSpecies = null;
  
  const student = getStudent(studentId);
  document.getElementById('petPickerStudent').textContent = student.name;
  
  const grid = document.getElementById('petPickerGrid');
  grid.innerHTML = PET_SPECIES.map(pet => `
    <div class="pet-option" data-pet-id="${pet.id}" onclick="selectPetOption('${pet.id}')">
      <span class="pet-option-icon">${pet.icon}</span>
      <div class="pet-option-name">${pet.name}</div>
      <div class="pet-option-desc">${pet.desc}</div>
    </div>
  `).join('');
  
  document.getElementById('petPickerConfirm').disabled = true;
  document.getElementById('petPickerModal').classList.add('active');
}

function selectPetOption(petId) {
  state.pendingPetSpecies = petId;
  document.querySelectorAll('.pet-option').forEach(el => {
    el.classList.toggle('selected', el.dataset.petId === petId);
  });
  document.getElementById('petPickerConfirm').disabled = false;
}

function confirmPetSelection() {
  if (!state.pendingPetSelection || !state.pendingPetSpecies) {
    toast('請先選擇一隻守護獸');
    return;
  }
  const student = getStudent(state.pendingPetSelection);
  student.pet = state.pendingPetSpecies;
  
  closeModal('petPickerModal');
  save();
  renderAll();
  state.selectedStudentId = student.id;
  renderSelectedStudent();
  
  const species = PET_SPECIES.find(p => p.id === student.pet);
  toast(`✦ ${student.name} 領養了「${species.name}」!`);
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}
