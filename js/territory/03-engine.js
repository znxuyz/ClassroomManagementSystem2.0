/* ============================================
   領地佔領戰 — 規則引擎
   ────────────────────────────────────────────
   把「作答事件」重播成「地圖現況」的核心。完全不碰畫面,
   老師端與學生端跑的是同一份,所以兩邊看到的必然一致。
============================================ */

/* ============================================
   遊戲引擎
============================================ */

const Territory = {

  /* 產生地圖格子。config 只存形狀與種子,格子每次算出來 */
  cellsOf(config) {
    const shape = MAP_SHAPES[config.shape] || MAP_SHAPES.hexagon;
    return shape.build(config.radius, config.seed || 1);
  },

  /* ---------- 開局設定 ---------- */

  createConfig(groups, opts) {
    const shape = MAP_SHAPES[opts.shape] ? opts.shape : 'hexagon';
    const radius = opts.radius || 10;
    const seed = opts.seed || (Date.now() % 2147483647);
    const cells = MAP_SHAPES[shape].build(radius, seed);

    // 挑基地時用「離地圖邊界幾步」,基地才會落在外圍
    const borderDepth = this.computeDepth(cells);
    const bases = {};
    this.pickStarts(cells, borderDepth, groups.length).forEach((key, i) => {
      if (key) bases[key] = i;
    });

    // 開放範圍則用「離最近基地幾步」
    const baseDist = this.computeBaseDist(cells, Object.keys(bases));
    const maxDepth = Math.max(...Object.values(baseDist));

    const memberGroup = {};
    groups.forEach((members, i) => {
      (members || []).forEach(m => {
        const id = typeof m === 'string' ? m : (m && m.id);
        if (id) memberGroup[id] = i;
      });
    });

    return {
      shape, radius, seed, maxDepth,
      threshold: opts.threshold || 5,           // 拿下一格至少要累積幾分
      battleSeconds: opts.battleSeconds || 90,  // 一場地塊爭奪持續多久
      /* 每一題的作答時限(秒)。點開題目起算,超過就不接受答案 ——
         這是為了壓掉「複製題目去問 AI」的時間。由安全規則強制。 */
      answerSeconds: opts.answerSeconds === 0 ? 0 : (opts.answerSeconds || 45),
      /* 答錯要不要倒扣佔領分(0 = 不扣)。一題只有一次機會,
         再加上扣分,用猜的就不划算了。 */
      wrongPenalty: opts.wrongPenalty || 0,
      /* 一組在同一格最多被扣到幾分(0 = 不設下限)。
         沒有下限的話,一組亂猜幾次就等於永久放棄那一格。 */
      penaltyFloor: opts.penaltyFloor || 0,
      /* 連錯幾題就要冷卻(0 = 不冷卻)。連續答錯累積到這個數字,
         下一題要等 cooldownSeconds 秒才能點開 —— 專治「一直猜」。
         答對一次就歸零,正常作答的學生不會碰到。 */
      cooldownWrong: opts.cooldownWrong === 0 ? 0 : (opts.cooldownWrong || 3),
      cooldownSeconds: opts.cooldownSeconds === 0 ? 0 : (opts.cooldownSeconds || 60),
      /* 嚴格作答:全螢幕作答,離開全螢幕或切到別的分頁就作廢。
         擋的是「複製題目、開新分頁問 AI」這條路。 */
      strictMode: opts.strictMode !== false,
      /* 每次攻擊最多可以換幾次題目。換到的題目難度降一階,
         分數也跟著降 —— 代價內建在規則裡,不需要另外罰。 */
      maxSwaps: opts.maxSwaps === 0 ? 0 : (opts.maxSwaps || 3),
      stageMode: opts.stageMode || 'auto',      // auto = 依倒數自動開放 / manual = 老師手動
      stageSeconds: opts.stageSeconds || 300,   // 自動模式下每階段的間隔
      openDepth: 1,                             // 手動模式用:已開放到第幾層
      overrides: {},                            // 老師個別指定 { hexKey: true=開放 / false=封鎖 }
      groupCount: groups.length,
      bases, memberGroup,
      status: 'running',
      startedAt: Date.now()
    };
  },

  /* ---------- 內陸深度 ----------
     從地圖外緣往內做 BFS,每一格記下離邊界幾步。
     用這個取代原本的「第幾圈」,任何形狀都適用 ——
     不規則地圖也能正確地由外往內開放。 */

  computeDepth(cells) {
    const set = new Set(cells);
    const depth = {};
    const queue = [];

    cells.forEach(k => {
      const { q, r } = Hex.parse(k);
      // 六個鄰居沒住滿就是邊界
      const isEdge = Hex.neighbors(q, r).some(n => !set.has(n));
      if (isEdge) { depth[k] = 0; queue.push(k); }
    });

    for (let i = 0; i < queue.length; i++) {
      const k = queue[i];
      const { q, r } = Hex.parse(k);
      Hex.neighbors(q, r).forEach(n => {
        if (set.has(n) && depth[n] === undefined) {
          depth[n] = depth[k] + 1;
          queue.push(n);
        }
      });
    }
    return depth;
  },

  /* ---------- 離最近基地幾步 ----------
     開放範圍是從各組的起始基地往外擴散,不是從地圖外緣往內。
     從地圖邊緣開放的話,基地靠邊的組一開始就有一大片空地可拿,
     靠內陸的組卻無處可去 —— 不公平。從基地擴散則每一組
     在每個階段能碰到的格子數大致相同。 */

  computeBaseDist(cells, baseKeys) {
    const set = new Set(cells);
    const dist = {};
    const queue = [];

    baseKeys.forEach(k => {
      if (set.has(k)) { dist[k] = 0; queue.push(k); }
    });

    for (let i = 0; i < queue.length; i++) {
      const k = queue[i];
      const { q, r } = Hex.parse(k);
      Hex.neighbors(q, r).forEach(n => {
        if (set.has(n) && dist[n] === undefined) {
          dist[n] = dist[k] + 1;
          queue.push(n);
        }
      });
    }

    // 走不到的格子(理論上不該有,連通修復已經處理過)當成最遠
    let max = 0;
    Object.values(dist).forEach(d => { if (d > max) max = d; });
    cells.forEach(k => { if (dist[k] === undefined) dist[k] = max + 1; });

    return dist;
  },

  /* 距離表每次重播都要用,但只跟地圖與基地有關,算一次就好 */
  depthOf(config) {
    const key = `${config.shape}_${config.radius}_${config.seed}_${Object.keys(config.bases || {}).join()}`;
    if (this._depthCache && this._depthCache.key === key) return this._depthCache.depth;
    const depth = this.computeBaseDist(this.cellsOf(config), Object.keys(config.bases || {}));
    this._depthCache = { key, depth };
    return depth;
  },

  /* ---------- 起始基地 ----------
     從最外緣挑,並且盡量互相遠離。用貪婪的最遠點取樣:
     先挑一個,之後每次挑「離已選點最遠」的那一格。
     這對任何形狀都有效,不像照角度排序只適用於規則圖形。 */

  pickStarts(cells, depth, groupCount) {
    const edge = cells.filter(k => depth[k] === 0);
    if (edge.length === 0) return cells.slice(0, groupCount);

    const picked = [edge[0]];
    while (picked.length < groupCount) {
      let best = null, bestD = -1;
      edge.forEach(k => {
        if (picked.includes(k)) return;
        const d = Math.min(...picked.map(p => Hex.distance(k, p)));
        if (d > bestD) { bestD = d; best = k; }
      });
      if (!best) break;
      picked.push(best);
    }
    return picked;
  },

  /* ---------- 階段開放 ----------
     由外緣往內陸開。自動模式由經過的時間算出來,
     不需要任何人定時寫資料 —— 每台裝置各自算,結果一樣。 */

  openDepthAt(config, atTime) {
    if (config.stageMode === 'manual') return config.openDepth || 1;
    const elapsed = Math.max(0, (atTime - config.startedAt) / 1000);
    return Math.min(config.maxDepth + 1, 1 + Math.floor(elapsed / config.stageSeconds));
  },

  /* 某一格現在開放了嗎?
     老師個別指定的優先於階段開放 —— 他可以提早開放某片區域,
     也可以把已經到期的區域鎖起來當禁區。 */
  isOpenCell(config, hexKey, depth, atTime) {
    const ov = config.overrides && config.overrides[hexKey];
    if (ov === true) return true;
    if (ov === false) return false;
    return depth <= this.openDepthAt(config, atTime);
  },

  nextStageAt(config) {
    if (config.stageMode === 'manual') return null;
    const d = this.openDepthAt(config, Date.now());
    if (d > config.maxDepth) return null;
    return config.startedAt + d * config.stageSeconds * 1000;
  },

  /* ---------- 重播 ----------
     events 必須已依伺服器時間排序。 */

  /* attempts 是「點開題目」的紀錄。沒有對應成功事件、而且作答時限已過的,
     就是答錯或放生 —— 老師若設了 wrongPenalty 就倒扣那一格的佔領分。
     時限還沒到的不算,那可能只是學生正在作答。 */
  /* ---------- 連錯冷卻 ----------
     每一筆嘗試都記著「它是我的第幾筆」(seq)、「上一筆是哪一筆」(prev)
     以及「點開它之前已經連錯幾題」(streak)。三個欄位把一個學生的嘗試
     接成一條單向鏈,文件 id 就是 {uid}_{seq} 且不准修改 —— 所以同一個
     seq 只會存在一份,學生沒辦法跳過或重接那條鏈來躲冷卻。

     下面兩個函式是前端與安全規則共用的同一套算式:前端用它顯示倒數,
     規則用它擋寫入。兩邊算出來一樣,畫面上看到的就是真的。 */

  /* 接著 last 這筆嘗試之後,新的一筆該帶的 streak。
     solved 是「我已經答對的題目」—— 由 tevents 推出來,學生偽造不了。 */
  nextStreak(last, solved, isSwap) {
    if (!last) return 0;
    if (isSwap) return last.streak || 0;        // 換題不算答錯
    if ((solved || {})[last.questionId]) return 0;  // 上一題答對了,歸零
    return (last.streak || 0) + 1;
  },

  /* 冷卻到什麼時候為止(0 = 現在就能答)。
     連錯數剛好踩到倍數時冷卻一次,所以是「每連錯三題罰一次」,
     不是「錯三題之後每一題都要等」。 */
  cooldownUntil(config, last, solved) {
    const n = config.cooldownWrong || 0;
    const sec = config.cooldownSeconds || 0;
    if (n <= 0 || sec <= 0 || !last) return 0;
    const s = this.nextStreak(last, solved, false);
    if (s <= 0 || s % n !== 0) return 0;
    return last.at + sec * 1000;
  },

  /* fails 是 { attemptId: 失手的伺服器時間 } —— 學生答錯/超時/作廢/放棄的
     當下自己寫下的一筆。有這筆就「當下、就那一格」扣,不必等期限,
     也不會波及他同時點開過的其他格子。

     為什麼還留著期限兜底:關掉分頁想躲掉倒扣的人不會自己寫那一筆。
     但期限只是兜底,所以放得很寬 —— 沒設時限時原本用 50 秒當期限,
     讀題慢的學生還在想,那一格就先被扣了(答完才又加回來),
     老師看起來就像「好幾塊正在進攻的地同時被扣分」。 */
  failedAttempts(config, events, attempts, now, fails, shielded) {
    const penalty = config.wrongPenalty || 0;
    if (penalty <= 0) return [];
    attempts = attempts || [];
    // 學生端不訂嘗試紀錄,倒扣全部來自失手紀錄 —— 所以不能因為
    // attempts 是空的就提早結束,那會讓學生看不到任何扣分
    if (attempts.length === 0 && Object.keys(fails || {}).length === 0) return [];

    // 事件上記著它是由哪一筆嘗試換來的,一題多次嘗試才對得起來
    const won = new Set((events || []).map(e => e.attemptId).filter(Boolean));
    /* 被「換題」取代掉的那一筆不算失手 —— 學生只是換了一題,沒有答錯。
       新的那筆會記著它取代了誰(append-only,不去改舊文件)。 */
    const replaced = new Set(attempts.map(a => a.replaces).filter(Boolean));
    // 有時限就以時限為準(多給 5 秒送出);沒時限的兜底期限放寬到 10 分鐘
    const window = config.answerSeconds > 0
      ? (config.answerSeconds + 5) * 1000
      : 10 * 60 * 1000;

    const out = [];
    const done = new Set();
    // 守護獸的「護盾」技能:被罩住的那一次不倒扣(技能次數由安全規則把關)
    const safe = shielded || new Set();

    /* (1) 有回報的失手。這一份自己就帶著「扣哪一格、哪一組、什麼時候」,
           所以不需要原本那筆嘗試紀錄 —— 學生端只訂這一條就夠了。 */
    Object.values(fails || {}).forEach(f => {
      if (!f || !f.hexKey) return;
      if (won.has(f.id) || replaced.has(f.id)) return;
      done.add(f.id);
      if (safe.has(f.id)) return;
      out.push({ ...f, points: -penalty, isPenalty: true });
    });

    /* (2) 沒回報又過了期限的。只有老師那一台拿得到嘗試紀錄,
           由它補寫成 (1) 的那種紀錄,其他人就看得到了。 */
    attempts.forEach(a => {
      if (done.has(a.id) || won.has(a.id) || replaced.has(a.id) || safe.has(a.id)) return;
      if (a.at + window < now) out.push({ ...a, points: -penalty, isPenalty: true });
    });

    return out;
  },

  replay(config, events, now, attempts, fails, shielded) {
    now = now || Date.now();
    const depth = this.depthOf(config);

    const map = {};
    this.cellsOf(config).forEach(k => {
      map[k] = { owner: null, battle: null, depth: depth[k] || 0 };
    });
    Object.entries(config.bases || {}).forEach(([k, g]) => {
      if (map[k]) { map[k].owner = Number(g); map[k].isBase = true; }
    });
    // 快照:壓縮過的戰況。從這裡起算,快照之前的事件不必再重播
    Object.entries(config.snapshot || {}).forEach(([k, g]) => {
      if (map[k]) map[k].owner = Number(g);
    });

    const log = [];
    // 只追蹤交戰中的格子。地圖上千格時,每筆事件都掃全圖會慢到不能用
    const active = new Set();

    // 快照裡打到一半的爭奪,接著打下去
    Object.entries(config.battles || {}).forEach(([k, b]) => {
      if (!map[k] || map[k].isBase || !b) return;
      map[k].battle = { endsAt: b.endsAt, points: { ...(b.points || {}) } };
      active.add(k);
    });

    // 成功與失手合在一起依時間重播,順序才和實際發生的一致
    const stream = (events || []).concat(this.failedAttempts(config, events, attempts, now, fails, shielded))
      .sort((a, b) => a.at - b.at);

    stream.forEach(ev => {
      const at = ev.at;
      this.resolveBattles(config, map, active, at, log);

      const cell = map[ev.hexKey];
      if (!cell) return;                                          // 不存在的格子
      if (cell.isBase) return;                                    // 基地不可攻佔
      if (cell.owner === ev.groupIdx) return;                     // 自己的地不用打
      if (!this.isOpenCell(config, ev.hexKey, cell.depth, at)) return;  // 還沒開放
      if (!this.adjacentTo(map, ev.hexKey, ev.groupIdx)) return;  // 必須與自己領地相鄰

      // 倒扣只會削弱已經開打的格子,不會自己掀起一場爭奪
      if (!cell.battle) {
        if (ev.isPenalty) return;
        cell.battle = { endsAt: at + config.battleSeconds * 1000, points: {} };
        active.add(ev.hexKey);
      }
      /* 允許扣成負分(判定勝負是 points >= threshold,負分自然出局),
         但老師可以設下限,免得一組亂猜幾次就等於永久放棄那一格。 */
      const g = String(ev.groupIdx);
      let pts = (cell.battle.points[g] || 0) + ev.points;
      const floor = config.penaltyFloor || 0;
      if (floor > 0) pts = Math.max(-floor, pts);
      cell.battle.points[g] = pts;

      /* 空白地塊:達到門檻就立刻插旗,不用等爭奪時間結束。
         那塊地沒有人守,沒有道理讓佔領方空等 —— 計時是給「搶別組的地」
         用的,雙方才有來回攻防的機會。 */
      if (cell.owner === null && pts >= config.threshold) {
        log.push({ at, hexKey: ev.hexKey, from: null, to: ev.groupIdx, points: pts });
        cell.owner = ev.groupIdx;
        cell.battle = null;
        active.delete(ev.hexKey);
      }
    });

    this.resolveBattles(config, map, active, now, log);

    return { map, log };
  },

  /* 結算已到期的戰役。達到門檻且分數最高的一組拿下;
     同分或都沒達標就沒人拿到,地塊維持原狀。 */
  resolveBattles(config, map, active, atTime, log) {
    if (active.size === 0) return;
    const done = [];

    active.forEach(k => {
      const cell = map[k];
      if (!cell || !cell.battle || cell.battle.endsAt > atTime) return;
      done.push(k);

      const ranked = Object.entries(cell.battle.points)
        .map(([g, p]) => ({ groupIdx: Number(g), points: p }))
        .filter(e => e.points >= config.threshold)
        .sort((a, b) => b.points - a.points);

      const tied = ranked[1] && ranked[1].points === ranked[0].points;

      if (ranked.length > 0 && !tied) {
        log.push({
          at: cell.battle.endsAt, hexKey: k,
          from: cell.owner, to: ranked[0].groupIdx, points: ranked[0].points
        });
        cell.owner = ranked[0].groupIdx;
      } else if (ranked.length > 0) {
        log.push({ at: cell.battle.endsAt, hexKey: k, draw: true });
      }
      cell.battle = null;
    });

    done.forEach(k => active.delete(k));
  },

  adjacentTo(map, hexKey, groupIdx) {
    const { q, r } = Hex.parse(hexKey);
    return Hex.neighbors(q, r).some(n => map[n] && map[n].owner === groupIdx);
  },

  /* ---------- 查詢 ---------- */

  targetsFor(config, map, groupIdx, now) {
    now = now || Date.now();
    const targets = new Set();
    Object.keys(map).forEach(k => {
      if (map[k].owner !== groupIdx) return;
      const { q, r } = Hex.parse(k);
      Hex.neighbors(q, r).forEach(n => {
        const t = map[n];
        if (!t || t.owner === groupIdx || t.isBase) return;
        if (!this.isOpenCell(config, n, t.depth, now)) return;
        targets.add(n);
      });
    });
    return targets;
  },

  standings(config, map) {
    const counts = Array.from({ length: config.groupCount }, () => 0);
    Object.values(map).forEach(c => {
      if (c.owner !== null && counts[c.owner] !== undefined) counts[c.owner]++;
    });
    return counts
      .map((count, groupIdx) => ({ groupIdx, count }))
      .sort((a, b) => b.count - a.count);
  },

  /* 把目前的戰況壓成一份快照:每格只留擁有者,交戰中的格子不收
     (它們還沒結算,壓縮後會從頭開始,這是刻意的取捨 —— 壓縮前
      老師會先看到提示)。回傳的物件小到可以直接放進設定裡。 */
  snapshotOf(map) {
    const snap = {};
    Object.entries(map).forEach(([k, cell]) => {
      if (cell.owner !== null && !cell.isBase) snap[k] = cell.owner;
    });
    return snap;
  },

  /* 正在交戰的格子也要存下來,壓縮才不會把打到一半的爭奪歸零。
     有了這個,任何時候壓縮都是無損的,不必等到沒人在搶地。 */
  battlesOf(map) {
    const out = {};
    Object.entries(map).forEach(([k, cell]) => {
      if (cell.battle) out[k] = { endsAt: cell.battle.endsAt, points: { ...cell.battle.points } };
    });
    return out;
  },

  /* 畫面用的指紋。地圖上千格時,沒變就不該重繪 */
  signature(config, map, now) {
    const parts = [this.openDepthAt(config, now || Date.now()),
                   JSON.stringify(config.overrides || {})];
    Object.keys(map).forEach(k => {
      const c = map[k];
      if (c.owner !== null) parts.push(k + ':' + c.owner);
      if (c.battle) {
        parts.push(k + '!' + Object.entries(c.battle.points).map(e => e.join('')).join(''));
      }
    });
    return parts.join('|');
  }
};
