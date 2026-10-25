/* ============================================
   積分規則編輯
============================================ */
function renderRulesEditor() {
  const editor = document.getElementById('rulesEditor');
  /* 這一欄是重複的列,每一列都加標籤會變成一堆重複的小字 ——
     在最上面放一列欄位名就夠了(和表格的表頭同一個道理)。 */
  const head = state.rules.length === 0 ? '' : `
    <div class="rule-editor-row is-head">
      <span class="field-label">規則名稱</span>
      <span class="field-label">分數</span>
      <span></span>
    </div>`;
  editor.innerHTML = head + state.rules.map((rule, i) => `
    <div class="rule-editor-row">
      <input type="text" class="rule-editor-input" value="${rule.name}" 
        onchange="updateRule(${i}, 'name', this.value)" placeholder="規則名稱" />
      <input type="number" class="rule-editor-input" value="${rule.points}" 
        onchange="updateRule(${i}, 'points', parseInt(this.value))" placeholder="分數" />
      <button class="icon-btn" onclick="deleteRule(${i})">✕</button>
    </div>
  `).join('');
}

function addRule() {
  state.rules.push({ name: '新規則', points: 1 });
  save();
  renderRulesEditor();
  renderRuleGrid();
}

function updateRule(i, field, value) {
  state.rules[i][field] = value;
  save();
  renderRuleGrid();
}

function deleteRule(i) {
  if (!confirm('確定刪除這條規則?')) return;
  state.rules.splice(i, 1);
  save();
  renderRulesEditor();
  renderRuleGrid();
}
