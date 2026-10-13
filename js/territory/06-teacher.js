/* ============================================
   領地佔領戰 — 老師端介面
   ────────────────────────────────────────────
   題庫管理、戰況看板、遊戲中調整設定、手動開放/封鎖。
   只有老師會用到,學生端不載入這一段也能運作。
============================================ */

/* ============================================
   老師端
============================================ */

function createTerritoryQuestion() {
  const text = document.getElementById('tqText').value.trim();
  const diff = document.getElementById('tqDifficulty').value;
  const opts = ['tqA', 'tqB', 'tqC', 'tqD'].map(id => document.getElementById(id).value.trim());
  const answer = parseInt(document.querySelector('input[name="tqAnswer"]:checked')?.value ?? '0');

  if (!text) { toast('請輸入題目'); return; }
  if (opts.filter(Boolean).length < 2) { toast('至少要有兩個選項'); return; }
  if (!opts[answer]) { toast('被標為正確答案的那一格是空的'); return; }

  state.territoryQuestions.unshift({
    id: 'tq_' + Date.now(), text, options: opts, answer,
    difficulty: diff, createdAt: Date.now()
  });

  document.getElementById('tqText').value = '';
  ['tqA', 'tqB', 'tqC', 'tqD'].forEach(id => { document.getElementById(id).value = ''; });

  save();
  renderTerritoryQuestions();
  publishTerritoryQuestions();
  toast(`已新增${DIFFICULTY[diff].label}題目`);
}

function deleteTerritoryQuestion(id) {
  state.territoryQuestions = state.territoryQuestions.filter(q => q.id !== id);
  save();
  renderTerritoryQuestions();
  publishTerritoryQuestions();
}

async function publishTerritoryQuestions() {
  if (!isCloudMode()) return;
  try {
    await Cloud.publishTerritoryQuestions(state.classId, state.territoryQuestions);
  } catch (e) {
    console.error('[領地戰] 題庫發布失敗:', e);
    toast('題庫同步失敗:' + e.message);
  }
}

function renderTerritoryQuestions() {
  const el = document.getElementById('tqList');
  if (!el) return;

  const qs = state.territoryQuestions;
  if (qs.length === 0) {
    el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">◆</div><div>題庫是空的,先新增幾題</div></div>';
    return;
  }

  const byDiff = {};
  qs.forEach(q => { byDiff[q.difficulty] = (byDiff[q.difficulty] || 0) + 1; });

  el.innerHTML = `
    <div class="tq-summary">
      共 ${qs.length} 題 ·
      ${Object.entries(DIFFICULTY).map(([k, d]) =>
        `<span style="color:${d.color}">${d.label} ${byDiff[k] || 0}</span>`).join(' · ')}
    </div>` +
    qs.map(q => `
      <div class="tq-row">
        <span class="tq-diff" style="background:${DIFFICULTY[q.difficulty].color}">
          ${DIFFICULTY[q.difficulty].label} +${DIFFICULTY[q.difficulty].points}
        </span>
        <span class="tq-text">${escapeHtml(q.text)}</span>
        <span class="tq-answer">答:${'ABCD'[q.answer]}</span>
        <button class="btn btn-ghost btn-small" onclick="deleteTerritoryQuestion('${q.id}')">✕</button>
      </div>`).join('');
}

/* ---------- 開局 / 控制 ---------- */

async function startTerritoryGame() {
  if (!isCloudMode()) { toast('需要登入雲端才能進行領地戰'); return; }

  const groups = state.currentGroups && state.currentGroups.length
    ? state.currentGroups
    : (state.groupSets.length ? state.groupSets[state.groupSets.length - 1].groups : []);

  if (groups.length < 2) { toast('請先到「班級管理 → 隨機分組」分出至少兩組'); return; }
  if (state.territoryQuestions.length === 0) { toast('題庫是空的,先新增幾題'); return; }
  if (TerritoryGame.config && !confirm('目前有一局進行中,重新開始會清空現有戰況。確定嗎?')) return;

  const sizeId = document.getElementById('tgSize').value;
  const size = MAP_SIZES.find(s => s.id === sizeId) || MAP_SIZES[1];
  const config = Territory.createConfig(groups, {
    shape: document.getElementById('tgShape').value,
    radius: size.radius,
    seed: Date.now() % 2147483647,
    threshold: parseInt(document.getElementById('tgThreshold').value) || 5,
    battleSeconds: parseInt(document.getElementById('tgBattle').value) || 90,
    answerSeconds: Math.max(0, parseInt(document.getElementById('tgAnswerSeconds').value) || 0),
    wrongPenalty: parseInt(document.getElementById('tgWrongPenalty').value) || 0,
    penaltyFloor: parseInt(document.getElementById('tgPenaltyFloor').value) || 0,
    maxSwaps: Math.max(0, parseInt(document.getElementById('tgMaxSwaps').value) || 0),
    stageMode: document.getElementById('tgStageMode').value,
    stageSeconds: parseInt(document.getElementById('tgStageSeconds').value) || 300
  });

  try {
    await publishTerritoryQuestions();
    await Cloud.clearTerritoryEvents(state.classId);
    await Cloud.saveTerritoryConfig(state.classId, config);  // config 本身不含 snapshot,等於重置
    toast(`✦ 領地戰開始!${MAP_SHAPES[config.shape].name} ${Territory.cellsOf(config).length} 格,${groups.length} 組`);
  } catch (e) {
    console.error(e);
    toast('開局失敗:' + e.message);
  }
}

async function endTerritoryGame() {
  if (!TerritoryGame.config) return;
  if (!confirm('確定結束這一局?')) return;
  await Cloud.saveTerritoryConfig(state.classId,
    { ...TerritoryGame.config, status: 'ended', endedAt: Date.now() });
  toast('領地戰已結束');
}

/* 手動模式下,老師按一次往中心多開一圈 */
async function openNextRing() {
  const c = TerritoryGame.config;
  if (!c) return;
  const depth = Math.min(c.maxDepth + 1, (c.openDepth || 1) + 1);
  await Cloud.saveTerritoryConfig(state.classId, { ...c, openDepth: depth });
  toast(`已開放到基地外第 ${depth} 圈`);
}

function renderTerritoryBoard() {
  const el = document.getElementById('territoryBoard');
  if (!el) return;

  if (!isCloudMode()) {
    el.innerHTML = '<div class="empty-state">需要登入雲端才能進行領地戰</div>';
    return;
  }
  const c = TerritoryGame.config;
  if (!c) {
    el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⬡</div><div>尚未開局。設定好上方選項後按「開始新的一局」</div></div>';
    return;
  }

  const nextAt = Territory.nextStageAt(c);
  const depth = Territory.openDepthAt(c, Date.now());

  el.innerHTML = `
    <div class="territory-status">
      <span class="territory-badge ${c.status}">${c.status === 'running' ? '進行中' : '已結束'}</span>
      <span>${MAP_SHAPES[c.shape] ? MAP_SHAPES[c.shape].name : ''} ·
            ${Object.keys(TerritoryGame.map).length} 格 · 門檻 ${c.threshold} 分 ·
            爭奪 ${c.battleSeconds} 秒</span>
      <span class="territory-stage">
        基地外 ${depth}/${c.maxDepth} 圈${
          nextAt ? ` · 下一圈 ${formatCountdown(nextAt - Date.now())}` : ' · 已全部開放'}
      </span>
      <div style="flex:1"></div>
      ${c.stageMode === 'manual' && depth <= c.maxDepth
        ? '<button class="btn btn-accent btn-small" onclick="openNextRing()">往外開一圈</button>' : ''}
      ${c.status === 'running' && !TerritoryEdit.active
        ? '<button class="btn btn-ghost btn-small" onclick="TerritoryEdit.enter()">手動開放/封鎖</button>' : ''}
      ${c.status === 'running'
        ? '<button class="btn btn-ghost btn-small" onclick="toggleLiveSettings()">調整設定</button>' : ''}
      ${TerritoryGame.events.length >= COMPACT_SUGGEST_AT
        ? `<button class="btn btn-accent btn-small" onclick="compactTerritory()"
             title="作答紀錄已累積 ${TerritoryGame.events.length} 筆,壓縮可加快所有人的載入">
             壓縮戰況(${TerritoryGame.events.length})</button>`
        : ''}
      ${c.status === 'running'
        ? '<button class="btn btn-ghost btn-small" onclick="endTerritoryGame()">結束這一局</button>' : ''}
    </div>
    ${_liveSettingsOpen ? renderLiveSettings(c) : ''}
    ${renderStandings(c, TerritoryGame.map)}
    ${renderHexMap(c, TerritoryGame.map, {
        zoom: _territoryZoom,
        editMode: TerritoryEdit.active,
        selected: TerritoryEdit.selected
      })}`;
}

/* ============================================
   遊戲中調整設定
   ────────────────────────────────────────────
   地圖不是存檔、是由事件重播出來的,所以門檻、爭奪秒數、答錯倒扣
   這幾項「改了會連過去一起重算」—— 把門檻調高,之前打下來的地可能
   直接被吐回去。所以改這些之前會先把目前戰況存成快照鎖住,
   改動只從現在開始生效。
============================================ */

let _liveSettingsOpen = false;

function toggleLiveSettings() {
  _liveSettingsOpen = !_liveSettingsOpen;
  _lastMapSig = null;
  renderTerritoryBoard();
}

function renderLiveSettings(c) {
  return `
    <div class="tg-live-settings">
      <div class="tg-live-title">遊戲中調整設定</div>
      <div class="tg-live-row">
        <label>佔領門檻</label>
        <input type="number" id="lsThreshold" class="rule-editor-input" style="width:80px;"
               value="${c.threshold}" min="1" max="30" />
        <label>分</label>

        <label style="margin-left:10px;">爭奪時間</label>
        <input type="number" id="lsBattle" class="rule-editor-input" style="width:90px;"
               value="${c.battleSeconds}" min="15" max="600" />
        <label>秒</label>

        <label style="margin-left:10px;">每題限時</label>
        <input type="number" id="lsAnswer" class="rule-editor-input" style="width:90px;"
               value="${c.answerSeconds || 0}" min="0" max="300" />
        <label>秒(0=不限)</label>

        <label style="margin-left:10px;">答錯倒扣</label>
        <input type="number" id="lsPenalty" class="rule-editor-input" style="width:80px;"
               value="${c.wrongPenalty || 0}" min="0" max="10" />
        <label>分,最多扣到</label>
        <input type="number" id="lsFloor" class="rule-editor-input" style="width:80px;"
               value="${c.penaltyFloor || 0}" min="0" max="30" />
        <label>分(0=無下限)</label>
      </div>

      <div class="tg-live-row">
        <label>可換題</label>
        <input type="number" id="lsSwaps" class="rule-editor-input" style="width:80px;"
               value="${c.maxSwaps === undefined ? 3 : c.maxSwaps}" min="0" max="5" />
        <label>次(難度降一階)</label>

        <label class="tg-live-check" style="margin-left:10px;">
          <input type="checkbox" id="lsStrict" ${c.strictMode !== false ? 'checked' : ''} />
          嚴格作答(全螢幕,離開或切分頁就作廢)
        </label>
        <div style="flex:1"></div>
        <button class="btn btn-ghost btn-small" onclick="toggleLiveSettings()">取消</button>
        <button class="btn btn-primary btn-small" onclick="applyLiveSettings()">套用</button>
      </div>

      <div class="tg-live-note">
        門檻、爭奪時間、答錯倒扣會影響「重新計算整場戰況」的結果。
        套用前系統會先把目前的地圖鎖成快照,所以<strong>已經打下來的地不會被吐回去</strong>,
        改動從現在開始算。
      </div>
    </div>`;
}

async function applyLiveSettings() {
  const c = TerritoryGame.config;
  if (!c) return;

  const next = {
    threshold: parseInt(document.getElementById('lsThreshold').value) || c.threshold,
    battleSeconds: parseInt(document.getElementById('lsBattle').value) || c.battleSeconds,
    answerSeconds: Math.max(0, parseInt(document.getElementById('lsAnswer').value) || 0),
    wrongPenalty: parseInt(document.getElementById('lsPenalty').value) || 0,
    penaltyFloor: parseInt(document.getElementById('lsFloor').value) || 0,
    maxSwaps: Math.max(0, parseInt(document.getElementById('lsSwaps').value) || 0),
    strictMode: document.getElementById('lsStrict').checked
  };

  // 會影響重播結果的三項,改了就得先鎖住現況
  const rewrites = next.threshold !== c.threshold
                || next.battleSeconds !== c.battleSeconds
                || next.wrongPenalty !== (c.wrongPenalty || 0)
                || next.penaltyFloor !== (c.penaltyFloor || 0);

  const inBattle = Object.values(TerritoryGame.map).filter(x => x.battle).length;
  if (rewrites && !confirm(
      `這次調整會影響整場戰況的重新計算,所以會先把目前的地圖鎖成快照。\n\n` +
      `· 已經打下來的地維持不變\n` +
      (inBattle > 0 ? `· 目前有 ${inBattle} 格正在交戰,會重新開始累積\n` : '') +
      `· 新的設定從現在開始生效\n\n要套用嗎?`)) return;

  try {
    toast('套用中…');
    const merged = { ...c, ...next };
    if (rewrites) {
      merged.snapshot = Territory.snapshotOf(TerritoryGame.map);
      merged.compactedAt = Date.now();
    }
    await Cloud.saveTerritoryConfig(state.classId, merged);
    if (rewrites) await Cloud.clearTerritoryEvents(state.classId);

    _liveSettingsOpen = false;
    _lastMapSig = null;
    toast('✦ 設定已更新');
  } catch (e) {
    console.error(e);
    toast('套用失敗:' + e.message);
  }
}

function renderTerritoryFeed() {
  const el = document.getElementById('territoryFeed');
  if (!el) return;

  const log = [...TerritoryGame.log].reverse().slice(0, 20);
  if (log.length === 0) {
    el.innerHTML = '<div class="empty-state" style="padding:20px;">還沒有任何地塊易主</div>';
    return;
  }

  el.innerHTML = log.map(e => e.draw
    ? `<div class="feed-row void"><span class="feed-msg">${e.hexKey} 平手,無人佔領</span></div>`
    : `<div class="feed-row correct">
         <span class="feed-name" style="color:${GROUP_COLORS[e.to % GROUP_COLORS.length]}">
           第 ${e.to + 1} 組</span>
         <span class="feed-msg">以 ${e.points} 分拿下 ${e.hexKey}${
           e.from !== null ? `(原屬第 ${e.from + 1} 組)` : ''}</span>
       </div>`).join('');
}

function renderTerritoryView() {
  fillTerritoryOptions();
  const activeSubtab = document.querySelector('#territoryView .sub-tab.active');
  const name = activeSubtab ? activeSubtab.dataset.subtab : 'tgBoard';
  if (name === 'tgBoard') { renderTerritoryBoard(); renderTerritoryFeed(); }
  if (name === 'tgQuestions') renderTerritoryQuestions();
}

/* 手動開放模式下,倒數秒數的欄位沒有意義 */
function toggleStageSeconds() {
  const auto = document.getElementById('tgStageMode').value === 'auto';
  document.getElementById('tgStageSeconds').style.display = auto ? '' : 'none';
  document.getElementById('tgStageUnit').style.display = auto ? '' : 'none';
}

/* 把形狀與規模的選項填進下拉選單,並顯示這一組合有幾格 */
function fillTerritoryOptions() {
  const shapeSel = document.getElementById('tgShape');
  const sizeSel = document.getElementById('tgSize');
  if (!shapeSel || shapeSel.options.length > 0) return;

  Object.entries(MAP_SHAPES)
    .filter(([k]) => !k.startsWith('_'))
    .forEach(([id, sh]) => {
      shapeSel.insertAdjacentHTML('beforeend',
        `<option value="${id}">${sh.name}</option>`);
    });

  MAP_SIZES.forEach(sz => {
    sizeSel.insertAdjacentHTML('beforeend',
      `<option value="${sz.id}" ${sz.id === 'M' ? 'selected' : ''}>${sz.label} · ${sz.note}</option>`);
  });

  describeShape();
}

function describeShape() {
  const el = document.getElementById('tgShapeDesc');
  if (!el) return;
  const shape = MAP_SHAPES[document.getElementById('tgShape').value];
  const size = MAP_SIZES.find(s => s.id === document.getElementById('tgSize').value);
  if (!shape || !size) return;

  // 不規則地圖的格子數會因種子而異,這裡取一個樣本讓老師有概念
  const count = shape.build(size.radius, 20260810).length;
  el.innerHTML = `
    <strong>${shape.name}</strong> · ${shape.desc}<br>
    這個組合約 <strong>${count}</strong> 格,預估可玩 <strong>${size.note}</strong>。`;
}

/* ============================================
   老師手動編輯開放區域
   ────────────────────────────────────────────
   進入編輯模式後,點地圖上的格子加入選取,再一次套用。
   個別指定會蓋過階段開放 —— 可以提早開放某片區域當獎勵,
   也可以把某些格子封起來當禁區或障礙。
============================================ */

const TerritoryEdit = {
  active: false,
  selected: new Set(),

  enter() {
    if (!TerritoryGame.config) { toast('尚未開局'); return; }
    this.active = true;
    this.selected.clear();
    _lastMapSig = null;
    renderTerritoryBoard();
    toast('點地圖上的格子選取,可連續點多格');
  },

  exit() {
    this.active = false;
    this.selected.clear();
    _lastMapSig = null;
    renderTerritoryBoard();
  },

  clear() {
    this.selected.clear();
    _lastMapSig = null;
    renderTerritoryBoard();
  },

  toggle(hexKey) {
    if (this.selected.has(hexKey)) this.selected.delete(hexKey);
    else this.selected.add(hexKey);
    _lastMapSig = null;
    renderTerritoryBoard();
  }
};

function territoryPick(hexKey) {
  TerritoryEdit.toggle(hexKey);
}

/* value: true = 強制開放 / false = 強制封鎖 / null = 交還給階段開放 */
async function territoryApplyPick(value) {
  const c = TerritoryGame.config;
  if (!c) return;
  if (TerritoryEdit.selected.size === 0) { toast('請先選取格子'); return; }

  const overrides = { ...(c.overrides || {}) };
  TerritoryEdit.selected.forEach(k => {
    if (value === null) delete overrides[k];
    else overrides[k] = value;
  });

  const n = TerritoryEdit.selected.size;
  TerritoryEdit.selected.clear();

  try {
    await Cloud.saveTerritoryConfig(state.classId, { ...c, overrides });
    toast(value === null ? `${n} 格恢復自動開放`
        : value ? `已開放 ${n} 格` : `已封鎖 ${n} 格`);
  } catch (e) {
    console.error(e);
    toast('儲存失敗:' + e.message);
  }
}

/* ============================================
   壓縮戰況
   ────────────────────────────────────────────
   作答事件是這一局的完整歷史,不壓縮的話會一路累積:
   一學期下來可能上萬筆,而每位學生每次開啟頁面都要把它們全部
   下載回來重播。壓縮的做法是把當下的戰況存成一份快照放進設定,
   再刪掉已經反映在快照裡的事件 —— 地圖不變,重播成本歸零。

   代價:正在交戰中的格子會從頭開始,所以壓縮前會先提醒老師。
============================================ */

const COMPACT_SUGGEST_AT = 600;   // 超過這個事件數就提示老師壓縮

async function compactTerritory() {
  const c = TerritoryGame.config;
  if (!c) return;

  const inBattle = Object.values(TerritoryGame.map).filter(x => x.battle).length;
  const n = TerritoryGame.events.length;

  if (!confirm(
    `把目前戰況壓縮成快照,並清掉 ${n} 筆作答紀錄?\n\n` +
    `地圖不會改變,之後載入會快很多。\n` +
    `但「誰答過哪一題」是記在作答紀錄裡的,清掉之後舊題目會重新開放作答。\n` +
    `建議壓縮前先換一批新題目。\n` +
    (inBattle > 0
      ? `\n注意:目前有 ${inBattle} 格正在交戰,壓縮後這些爭奪會歸零重來。`
      : '\n目前沒有正在交戰的格子,是壓縮的好時機。')
  )) return;

  try {
    toast('壓縮中…');
    await Cloud.saveTerritoryConfig(state.classId, {
      ...c,
      snapshot: Territory.snapshotOf(TerritoryGame.map),
      compactedAt: Date.now()
    });
    await Cloud.clearTerritoryEvents(state.classId);
    toast(`✦ 已壓縮,清掉 ${n} 筆紀錄`);
  } catch (e) {
    console.error(e);
    toast('壓縮失敗:' + e.message);
  }
}
