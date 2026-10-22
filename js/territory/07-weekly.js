/* ============================================
   蜂巢戰紀 — 每週結算
   ────────────────────────────────────────────
   每週一 00:00 依「佔領格數」發獎:第一名 +5、第二名 +3、第三名 +1
   (分數可以自己改)。獎勵發給那一組的每一位成員。

   幾個刻意的決定:

   · **同分同名次**。兩組並列第一就都拿 +5,然後跳過第二名。
     小學生的班級裡,「我們明明一樣多卻少 2 分」會吵一整個禮拜。

   · **沒佔到任何一格就沒有獎**,就算只有兩組在玩也一樣。

   · **一週只會結算一次**。結算過的週次記在班級資料裡,
     所以重新整理、換裝置、同時開兩個分頁都不會重複發。

   · 週次用的是和守護獸技能同一套算式(SkillEngine.weekIndex),
     所以兩邊的「每週一」是同一個時間點,不會差一天。

   · 由老師端執行(和其他結算一樣)。老師週一開一下系統就會補發,
     不必剛好在午夜掛著。
============================================ */

const TerritoryWeekly = {
  cfg() {
    const c = state.territoryWeekly || {};
    return {
      ...TERRITORY_WEEKLY_DEFAULTS,
      ...c,
      prizes: (c.prizes && c.prizes.length === 3) ? c.prizes : TERRITORY_WEEKLY_DEFAULTS.prizes
    };
  },

  /* 現在屬於第幾週。和守護獸技能共用算式,兩邊的週一才是同一天。 */
  week(now) {
    return SkillEngine.weekIndex(now || Date.now());
  },

  /* 名次:同分同名次,下一個名次跳過(標準競賽排名)。
     回傳 [{ groupIdx, count, rank, prize }],只含有拿到獎的組。 */
  ranked(config, map) {
    const rows = Territory.standings(config, map).filter(r => r.count > 0);
    const prizes = this.cfg().prizes;
    return rows.map(r => {
      const rank = 1 + rows.filter(x => x.count > r.count).length;
      return { ...r, rank, prize: prizes[rank - 1] || 0 };
    }).filter(r => r.prize > 0);
  },

  /* 該不該結算:開著、有這一局的設定、地圖算出來了、而且上一週還沒結算過。
     lastWeek 記的是「已經發過獎的那一週」。 */
  pending(now) {
    if (!this.cfg().enabled) return null;
    if (!isCloudMode()) return null;
    const config = TerritoryGame.config;
    if (!config) return null;
    if (Object.keys(TerritoryGame.map || {}).length === 0) return null;   // 還在載入

    const thisWeek = this.week(now);
    const last = (state.territoryWeekly || {}).lastWeek;
    // 第一次啟用時不補發過去的,只記下「從這一週開始算」
    if (last === undefined || last === null) return { init: true, week: thisWeek };
    if (last >= thisWeek) return null;
    return { init: false, week: thisWeek, settleFor: last };
  },

  /* 真正發獎。回傳發了幾個人,沒發回傳 0。 */
  settle(now) {
    const job = this.pending(now);
    if (!job) return 0;

    if (!state.territoryWeekly) state.territoryWeekly = { ...TERRITORY_WEEKLY_DEFAULTS };

    if (job.init) {
      // 剛開啟:只標記起點,不要把之前累積的戰果突然換成一筆大獎
      state.territoryWeekly.lastWeek = job.week;
      save();
      return 0;
    }

    const config = TerritoryGame.config;
    const winners = this.ranked(config, TerritoryGame.map);
    let awarded = 0;
    const lines = [];

    winners.forEach(w => {
      const members = (config.memberGroup && Object.keys(config.memberGroup)
        .filter(sid => config.memberGroup[sid] === w.groupIdx)) || [];
      members.forEach(sid => {
        const stu = state.students.find(s => s.id === sid);
        if (!stu) return;
        applyPointsToStudent(stu.id, w.prize,
          `蜂巢戰紀週結算 第 ${w.rank} 名(第 ${w.groupIdx + 1} 組,佔 ${w.count} 格)`);
        awarded++;
      });
      lines.push(`第 ${w.rank} 名:第 ${w.groupIdx + 1} 組 ${w.count} 格 +${w.prize}`);
    });

    state.territoryWeekly.lastWeek = job.week;
    // 留一份紀錄,老師之後想查「上週誰拿了獎」看得到
    if (!state.territoryWeekly.log) state.territoryWeekly.log = [];
    state.territoryWeekly.log.unshift({
      week: job.settleFor, at: Date.now(), awarded, lines
    });
    state.territoryWeekly.log = state.territoryWeekly.log.slice(0, 12);

    save();
    renderAll();
    if (awarded > 0) {
      toast(`✦ 蜂巢戰紀週結算:${lines.join('、')}(共 ${awarded} 人)`);
    }
    return awarded;
  },

  /* 老師端開班後定期檢查。沒到週一什麼都不會發生,不花任何讀取。 */
  start() {
    this.stop();
    if (!isCloudMode()) return;
    // 開班時先試一次(補發上週),之後每分鐘確認一次
    this._timer = setInterval(() => this.settle(), 60000);
    setTimeout(() => this.settle(), 4000);   // 等地圖載完再試
  },

  stop() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  }
};

/* ============================================
   教師端設定面板
============================================ */

function renderWeeklyPanel() {
  const box = document.getElementById('tgWeeklyPanel');
  if (!box) return;
  const c = TerritoryWeekly.cfg();
  const log = (state.territoryWeekly || {}).log || [];
  const map = TerritoryGame.map || {};
  const preview = TerritoryGame.config && Object.keys(map).length
    ? TerritoryWeekly.ranked(TerritoryGame.config, map) : [];

  box.innerHTML = `
    <div class="tg-live-row">
      <label class="tg-live-check">
        <input type="checkbox" id="twEnabled" ${c.enabled ? 'checked' : ''}
               onchange="applyWeeklySettings()" />
        每週一自動依佔領格數發獎
      </label>
      <label style="margin-left:10px;">第一名</label>
      <input type="number" id="twP1" class="rule-editor-input" style="width:70px;"
             value="${c.prizes[0]}" min="0" max="50" onchange="applyWeeklySettings()" />
      <label>第二名</label>
      <input type="number" id="twP2" class="rule-editor-input" style="width:70px;"
             value="${c.prizes[1]}" min="0" max="50" onchange="applyWeeklySettings()" />
      <label>第三名</label>
      <input type="number" id="twP3" class="rule-editor-input" style="width:70px;"
             value="${c.prizes[2]}" min="0" max="50" onchange="applyWeeklySettings()" />
      <label>分</label>
    </div>

    <div class="quiz-mode-hint">
      獎勵發給那一組的<strong>每一位成員</strong>,會進入個人積分與守護獸經驗。
      <strong>同分同名次</strong>(兩組並列第一就都拿第一名的分,然後跳過第二名)——
      「我們明明一樣多卻少 2 分」在小學班級裡會吵一整個禮拜。
      沒佔到任何一格就沒有獎。<br>
      一週只會結算一次,結算過的週次記在班級資料裡,所以重新整理、換裝置、
      開兩個分頁都不會重複發。<strong>週一開一下系統就會補發上週的</strong>,
      不必剛好在午夜掛著。
      ${c.enabled ? '' : '<strong>目前是關閉狀態。</strong>'}
    </div>

    ${preview.length ? `
      <div class="student-section-title" style="margin-top:14px;">
        照目前戰況,下週一會發:
      </div>
      <div class="territory-standings">
        ${preview.map(w => `
          <div class="standing-row">
            <span class="standing-name">第 ${w.rank} 名 · 第 ${w.groupIdx + 1} 組</span>
            <span class="standing-count">${w.count} 格 → +${w.prize}</span>
          </div>`).join('')}
      </div>` : ''}

    ${log.length ? `
      <div class="student-section-title" style="margin-top:14px;">最近幾次結算</div>
      ${log.map(l => `
        <div class="skill-use-row">
          <span>${new Date(l.at).toLocaleDateString('zh-TW')}</span>
          <span class="skill-stage-meta">${escapeHtml(l.lines.join('、'))} · ${l.awarded} 人</span>
        </div>`).join('')}` : ''}`;
}

function applyWeeklySettings() {
  const prev = TerritoryWeekly.cfg();
  const enabled = document.getElementById('twEnabled').checked;
  const p = ['twP1', 'twP2', 'twP3'].map(id =>
    Math.max(0, parseInt(document.getElementById(id).value) || 0));

  state.territoryWeekly = {
    ...(state.territoryWeekly || {}),
    enabled,
    prizes: p,
    // 關掉再開啟時重新抓起點,免得補發一大筆
    lastWeek: enabled ? (prev.enabled ? (state.territoryWeekly || {}).lastWeek : undefined)
                      : (state.territoryWeekly || {}).lastWeek
  };
  save();
  TerritoryWeekly.settle();
  renderWeeklyPanel();
  toast(enabled ? '✦ 每週結算已開啟' : '每週結算已關閉');
}
