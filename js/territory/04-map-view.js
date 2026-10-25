/* ============================================
   蜂巢戰紀 — 地圖繪製
   ────────────────────────────────────────────
   把地圖畫成 SVG,以及縮放、捲動、定位到某一組的領地。
   老師端與學生端共用。
============================================ */

/* ============================================
   地圖繪製(老師端與學生端共用)
============================================ */

/* 大地圖有上千格,重繪成本高。指紋沒變就整段跳過。 */
let _lastMapSig = null;

/* 捲動位置要跨重繪保留。
   地圖每秒會因為戰況更新而重畫,如果不記住捲動位置,學生一放大想看別的地方
   就會被彈回原點,根本沒辦法看地圖。
   重繪的 innerHTML 由呼叫端負責,所以這裡排一個 microtask,等新的 DOM 進去了再還原。
   捲動幅度也要一起記:縮放後畫布變大變小,用比例還原才會停在同一塊地。 */
let _hexScroll = { l: 0, t: 0, w: 0, h: 0 };
let _hexScrollLock = false;

function _hexScrollSave(el) {
  if (_hexScrollLock) return;
  _hexScroll = {
    l: el.scrollLeft, t: el.scrollTop,
    w: Math.max(1, el.scrollWidth - el.clientWidth),
    h: Math.max(1, el.scrollHeight - el.clientHeight)
  };
}

function _hexScrollRestore() {
  const el = document.querySelector('.hex-map-scroll');
  if (!el || (!_hexScroll.l && !_hexScroll.t)) return;
  const w = Math.max(1, el.scrollWidth - el.clientWidth);
  const h = Math.max(1, el.scrollHeight - el.clientHeight);
  _hexScrollLock = true;                       // 還原本身會觸發 onscroll,別讓它蓋掉紀錄
  el.scrollLeft = (_hexScroll.l / _hexScroll.w) * w;
  el.scrollTop  = (_hexScroll.t / _hexScroll.h) * h;
  _hexScrollLock = false;
}

function renderHexMap(config, map, opts) {
  const o = opts || {};
  // microtask 通常就緊接在 innerHTML 之後,不會閃;若呼叫端中間有 await
  // 導致那時 DOM 還沒進去,再用 rAF 補一次。
  Promise.resolve().then(_hexScrollRestore);
  requestAnimationFrame(_hexScrollRestore);
  const now = Date.now();
  const size = 26;
  const cells = Object.keys(map);

  const pos = {};
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  cells.forEach(k => {
    const { q, r } = Hex.parse(k);
    const p = Hex.toPixel(q, r, size);
    pos[k] = p;
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  });
  const pad = size * 1.4;
  const vw = (maxX - minX) + pad * 2;
  const vh = (maxY - minY) + pad * 2;
  const vb = [minX - pad, minY - pad, vw, vh];

  const targets = o.groupIdx != null
    ? Territory.targetsFor(config, map, o.groupIdx, now) : new Set();
  const editing = !!o.editMode;
  const selected = o.selected || new Set();

  const A = TERRITORY_ART;
  const gc = i => GROUP_COLORS[i % GROUP_COLORS.length];
  /* 同一格永遠配到同一種地表(交錯色、有沒有小山丘)。
     用亂數的話每秒重繪一次地表就會閃。 */
  const hashOf = k => {
    let h = 2166136261;
    for (let i = 0; i < k.length; i++) { h ^= k.charCodeAt(i); h = Math.imul(h, 16777619); }
    return Math.abs(h);
  };

  /* 大地圖特效會拖慢重繪(戰況每秒更新一次),所以格子一多就收斂:
     霧的模糊與地表顆粒都關掉,顏色與輪廓保留 —— 那兩樣才是看得懂的關鍵。 */
  const heavy = cells.length <= 600;

  const openOf = {};
  cells.forEach(k => { openOf[k] = Territory.isOpenCell(config, k, map[k].depth, now); });

  /* 每一格的六個角。輪廓與旗幟都要用,算一次就好。 */
  const cornersOf = k => {
    const c = pos[k];
    const out = [];
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 180 * (60 * i - 90);
      out.push([c.x + size * Math.cos(a), c.y + size * Math.sin(a)]);
    }
    return out;
  };

  /* 共用的那條邊 = 離鄰居中心最近的兩個角。
     這樣寫就不必去記「第幾個方向對應第幾條邊」—— 那是最容易寫錯的地方。 */
  const sharedEdge = (corners, np) =>
    corners.map((pt, i) => ({ i, d: (pt[0] - np.x) ** 2 + (pt[1] - np.y) ** 2 }))
           .sort((a, b) => a.d - b.d).slice(0, 2).map(e => e.i);

  const centerOf = nk => map[nk]
    ? pos[nk]
    : Hex.toPixel(Hex.parse(nk).q, Hex.parse(nk).r, size);

  /* ---------- 1. 格子本體(這一層才接點擊) ---------- */
  const polys = cells.map(k => {
    const cell = map[k];
    const p = pos[k];
    const open = openOf[k];
    const owned = cell.owner !== null;
    const canAttack = targets.has(k);
    const pts = Hex.corners(p.x, p.y, size);
    const h = hashOf(k);

    if (!open) {
      /* 未開放 = 褪色的陸地,上面再蓋一層薄霧(見下面的霧層)。
         以前這裡畫深灰色塊加斜線,整片看起來像「世界破了一個洞」,
         看不出那裡其實也是可以打的地。 */
      return `<g class="hex locked ${selected.has(k) ? 'picked' : ''}"
        ${editing ? `onclick="territoryPick('${k}')"` : ''}>
        <polygon points="${pts}" fill="${A.landLock}" stroke="${A.grid}" stroke-width="1" />
        ${selected.has(k) ? `<polygon points="${pts}" class="pick-ring" />` : ''}
      </g>`;
    }

    const fill = owned
      ? `url(#tgGrad${cell.owner % GROUP_COLORS.length})`
      : (h % 3 === 0 ? A.landAlt : A.land);
    // 偶爾來一座小山丘。地表有一點起伏才不像色塊
    const hill = (!owned && h % 7 === 0)
      ? `<path d="M${(p.x - size * 0.2).toFixed(1)} ${(p.y + size * 0.16).toFixed(1)}
                  l${(size * 0.2).toFixed(1)} ${(-size * 0.3).toFixed(1)}
                  l${(size * 0.2).toFixed(1)} ${(size * 0.3).toFixed(1)} z"
              fill="${A.hill}" />` : '';

    return `<g class="hex ${canAttack && !editing ? 'attackable' : ''} ${cell.isBase ? 'base' : ''}
                 ${cell.battle ? 'in-battle' : ''} ${selected.has(k) ? 'picked' : ''}"
      ${owned ? `data-owner="${cell.owner}"` : ''}
      ${canAttack ? 'data-attackable="1"' : ''}
      ${editing ? `onclick="territoryPick('${k}')"`
                : (canAttack && o.onClick ? `onclick="${o.onClick}('${k}')"` : '')}>
      <polygon points="${pts}" fill="${fill}"
               stroke="${owned ? 'rgba(255,255,255,.16)' : A.grid}" stroke-width="1" />
      ${hill}
      ${selected.has(k) ? `<polygon points="${pts}" class="pick-ring" />` : ''}
    </g>`;
  }).join('');

  /* ---------- 2. 霧:未開放區域 ----------
     一整片合成「一個 path」再模糊一次,不要每格各自模糊 ——
     上千格的地圖那樣會卡到不能用。 */
  const lockedKeys = cells.filter(k => !openOf[k]);
  let fogLayer = '';
  if (lockedKeys.length > 0) {
    const veil = lockedKeys.map(k => {
      const c = Hex.corners(pos[k].x, pos[k].y, size * 1.12).split(' ');
      return 'M' + c.join('L') + 'Z';
    }).join('');

    // 邊界畫虛線,一看就知道是「還沒開放」,不是「這裡沒東西」
    const edges = [];
    lockedKeys.forEach(k => {
      const { q, r } = Hex.parse(k);
      const corners = cornersOf(k);
      Hex.neighbors(q, r).forEach(nk => {
        if (map[nk] && !openOf[nk]) return;          // 鄰居也是未開放,內部邊不畫
        const [i1, i2] = sharedEdge(corners, centerOf(nk));
        edges.push(`M${corners[i1][0].toFixed(1)} ${corners[i1][1].toFixed(1)}`
                 + `L${corners[i2][0].toFixed(1)} ${corners[i2][1].toFixed(1)}`);
      });
    });

    fogLayer = `
      <g class="tg-fog" pointer-events="none">
        <path d="${veil}" fill="${A.fog}" ${heavy ? 'filter="url(#tgSoft)"' : ''} />
        ${edges.length ? `<path d="${edges.join('')}" fill="none" stroke="${A.fogLine}"
          stroke-width="2" stroke-dasharray="7 6" stroke-linecap="round" />` : ''}
      </g>`;
  }

  /* ---------- 3. 領地輪廓 ----------
     只畫「和鄰居不同主人」的那幾條邊,整塊領地就有一圈輪廓。
     以前每一格都描白邊,看起來像一張塗了顏色的試算表。 */
  const edgesByGroup = {};
  cells.forEach(k => {
    const cell = map[k];
    if (cell.owner === null || !openOf[k]) return;
    const { q, r } = Hex.parse(k);
    const corners = cornersOf(k);
    Hex.neighbors(q, r).forEach(nk => {
      if (map[nk] && map[nk].owner === cell.owner) return;
      const [i1, i2] = sharedEdge(corners, centerOf(nk));
      (edgesByGroup[cell.owner] = edgesByGroup[cell.owner] || []).push(
        `M${corners[i1][0].toFixed(1)} ${corners[i1][1].toFixed(1)}`
        + `L${corners[i2][0].toFixed(1)} ${corners[i2][1].toFixed(1)}`);
    });
  });
  const outlines = Object.keys(edgesByGroup).map(g => {
    const d = edgesByGroup[g].join('');
    return `<path d="${d}" fill="none" stroke="${gc(Number(g))}"
                  stroke-width="${(A.outline * 2.2).toFixed(1)}"
                  stroke-linecap="round" opacity=".35" />
            <path d="${d}" fill="none" stroke="#fff" stroke-width="${A.outline}"
                  stroke-linecap="round" opacity=".9" />`;
  }).join('');

  /* ---------- 4. 組別旗幟 ----------
     地圖上只有顏色的話,老師得自己記「紫色是第幾組」。
     旗面寬度跟著字長算,重心不算基地那一格,太小的領地不插旗
     —— 否則旗子會蓋住基地徽章。 */
  const flags = Object.keys(edgesByGroup).map(gs => {
    const g = Number(gs);
    const own = cells.filter(k => map[k].owner === g);
    const body = own.filter(k => !map[k].isBase);
    if (body.length < 4) return '';
    let cx = body.reduce((t, k) => t + pos[k].x, 0) / body.length;
    let cy = body.reduce((t, k) => t + pos[k].y, 0) / body.length;
    const label = `第 ${g + 1} 組 · ${own.length} 格`;
    const fs = size * 0.46;
    const w = label.length * fs * 0.72 + fs * 1.6;
    const hh = fs * 1.75;
    /* 旗子是橫的而且不短,所以不能只看「重心離基地多遠」——
       重心在右邊,旗面的左端照樣會壓到基地的徽章。
       要比的是旗面實際蓋到的範圍。壓到就往下挪一格,兩個都看得見。 */
    const baseKey = own.find(k => map[k].isBase);
    if (baseKey) {
      const bx = pos[baseKey].x, by = pos[baseKey].y;
      const overlapX = Math.abs(cx - bx) < w / 2 + size * 0.55;
      const overlapY = Math.abs(cy - by) < hh / 2 + size * 0.55;
      if (overlapX && overlapY) cy += (by >= cy ? -1 : 1) * size * 1.5;
    }
    return `
      <g transform="translate(${cx.toFixed(1)} ${cy.toFixed(1)})">
        <path d="M${(-w / 2).toFixed(1)} ${(-hh / 2).toFixed(1)} h${w.toFixed(1)}
                 l${(-hh * 0.4).toFixed(1)} ${(hh / 2).toFixed(1)}
                 l${(hh * 0.4).toFixed(1)} ${(hh / 2).toFixed(1)} h${(-w).toFixed(1)} z"
              fill="${gc(g)}" stroke="#fff" stroke-width="1.6" opacity=".96" />
        <text x="${(-hh * 0.18).toFixed(1)}" y="${(fs * 0.36).toFixed(1)}" text-anchor="middle"
              font-size="${fs.toFixed(1)}" font-weight="900" fill="#fff">${label}</text>
      </g>`;
  }).join('');

  /* ---------- 5. 基地徽章 / 交戰 ---------- */
  const marks = cells.map(k => {
    const cell = map[k];
    const p = pos[k];
    let out = '';

    if (cell.isBase && cell.owner !== null) {
      // 以前是一個小小的 ★,在大地圖上幾乎看不見
      const c = gc(cell.owner);
      const s1 = size * 0.11, s2 = size * 0.22, s3 = size * 0.24, s4 = size * 0.19,
            s5 = size * 0.07, s6 = size * 0.23, s7 = size * 0.14;
      out += `
        <g class="tg-base">
          <circle cx="${p.x}" cy="${p.y}" r="${(size * 0.6).toFixed(1)}" fill="#fff" opacity=".92" />
          <circle cx="${p.x}" cy="${p.y}" r="${(size * 0.52).toFixed(1)}" fill="${c}" />
          <path d="M${p.x} ${(p.y - size * 0.34).toFixed(1)}
                   l${s1.toFixed(1)} ${s2.toFixed(1)} l${s3.toFixed(1)} .03
                   l-${s4.toFixed(1)} ${(size * 0.15).toFixed(1)}
                   l${s5.toFixed(1)} ${s6.toFixed(1)} l-${s6.toFixed(1)} -${s7.toFixed(1)}
                   l-${s6.toFixed(1)} ${s7.toFixed(1)} l${s5.toFixed(1)} -${s6.toFixed(1)}
                   l-${s4.toFixed(1)} -${(size * 0.15).toFixed(1)} l${s3.toFixed(1)} -.03 z"
                fill="#fff" />
        </g>`;
    }

    if (cell.battle) {
      /* 交戰中。以前是一個 ⚔ 字 —— 而那個字型裡沒有,實際畫出來是方框,
         外加一條看不懂的細長條。
         改成「各組佔比的分環 + 領先者還差幾分」:
         環上每一段的長度就是那一組的佔比,中間的數字是還差多少就拿下。
         既是裝飾也是資訊,一眼看得出這一格快被誰吃掉。 */
      const ranked = Object.entries(cell.battle.points)
        .map(([g, v]) => ({ g: Number(g), v })).sort((a, b) => b.v - a.v);
      const total = ranked.reduce((t, e) => t + Math.max(0, e.v), 0) || 1;
      const lead = ranked[0] || { g: 0, v: 0 };
      const need = Math.max(0, (config.threshold || 5) - lead.v);
      const R = size * 0.72, C = 2 * Math.PI * R;
      let off = 0;
      const arcs = ranked.filter(e => e.v > 0).map(e => {
        const len = C * (e.v / total);
        const seg = `<circle cx="${p.x}" cy="${p.y}" r="${R.toFixed(1)}" fill="none"
          stroke="${gc(e.g)}" stroke-width="5"
          stroke-dasharray="${Math.max(0, len - 1.5).toFixed(1)} ${(C - len + 1.5).toFixed(1)}"
          stroke-dashoffset="${(-off).toFixed(1)}"
          transform="rotate(-90 ${p.x} ${p.y})" />`;
        off += len;
        return seg;
      }).join('');
      out += `
        <g class="tg-battle">
          <circle cx="${p.x}" cy="${p.y}" r="${(R * 1.35).toFixed(1)}" fill="url(#tgPulse)" />
          <circle cx="${p.x}" cy="${p.y}" r="${R.toFixed(1)}" fill="rgba(0,0,0,.35)"
                  stroke="rgba(255,255,255,.3)" stroke-width="1" />
          ${arcs}
          <text x="${p.x}" y="${(p.y + size * 0.2).toFixed(1)}" text-anchor="middle"
                font-size="${(size * 0.62).toFixed(0)}" font-weight="900" fill="#fff"
                style="paint-order:stroke" stroke="rgba(0,0,0,.45)" stroke-width="3">${need}</text>
        </g>`;
    }
    return out;
  }).join('');

  /* 大地圖放進可捲動的容器,並提供縮放。
     關鍵是用「地圖的原始尺寸」當 100%,不要硬塞進固定寬度 ——
     以前是 min(vw, 1100),於是半徑 15 的世界地圖被壓到 1100px 寬,
     每一格只剩十幾像素,學生根本看不清楚,也因為塞得下而完全不能捲動,
     「帶我回自己的領地」自然也就沒有意義。 */
  const zoom = o.zoom || 1;
  const width = Math.round(vw * zoom);

  return `
    <div class="hex-map-wrap">
      <div class="hex-map-tools">
        <button class="btn btn-ghost btn-small" onclick="territoryZoom(-1)">－</button>
        <span class="hex-zoom-label">${Math.round(zoom * 100)}%</span>
        <button class="btn btn-ghost btn-small" onclick="territoryZoom(1)">＋</button>
        <button class="btn btn-ghost btn-small" onclick="territoryFit()" title="縮到看得見整張地圖">整張</button>
        ${editing ? `
          <span class="hex-edit-count">已選 ${selected.size} 格</span>
          <button class="btn btn-primary btn-small" onclick="territoryApplyPick(true)">開放選取</button>
          <button class="btn btn-ghost btn-small" onclick="territoryApplyPick(false)">封鎖選取</button>
          <button class="btn btn-ghost btn-small" onclick="territoryApplyPick(null)">恢復自動</button>
          <button class="btn btn-ghost btn-small" onclick="TerritoryEdit.clear()">清除選取</button>
          <button class="btn btn-accent btn-small" onclick="TerritoryEdit.exit()">完成</button>
        ` : `
          <span class="hex-legend">
            <span class="lg lg-open"></span>空地
            <span class="lg lg-lock"></span>未開放
            <span class="lg lg-battle"></span>交戰中
            <span class="lg lg-sea"></span>海洋
          </span>`}
      </div>
      <div class="hex-map-scroll" onscroll="_hexScrollSave(this)">
        <svg class="hex-map" width="${width}" viewBox="${vb.join(' ')}"
             preserveAspectRatio="xMidYMid meet">
          <defs>
            <radialGradient id="tgSea" cx="50%" cy="45%" r="75%">
              <stop offset="0%" stop-color="${A.sea}" />
              <stop offset="100%" stop-color="${A.seaDeep}" />
            </radialGradient>
            ${GROUP_COLORS.map((c, i) => `
              <linearGradient id="tgGrad${i}" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="${c}" stop-opacity="1" />
                <stop offset="100%" stop-color="${c}" stop-opacity=".72" />
              </linearGradient>`).join('')}
            <filter id="tgSoft"><feGaussianBlur stdDeviation="${(size * 0.5).toFixed(1)}" /></filter>
            <radialGradient id="tgPulse" cx="50%" cy="50%" r="50%">
              <stop offset="40%" stop-color="#fff" stop-opacity="0" />
              <stop offset="75%" stop-color="#fff" stop-opacity=".22" />
              <stop offset="100%" stop-color="#fff" stop-opacity="0" />
            </radialGradient>
          </defs>

          <!-- 海。地圖外面不是「背景」,是海 -->
          <rect x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}" fill="url(#tgSea)" />

          <!-- 格子在最下層,而且只有這一層接點擊;
               上面的裝飾一律 pointer-events:none,否則基地徽章與交戰環
               會把攻擊的點擊吃掉。 -->
          ${polys}

          ${fogLayer}
          <g pointer-events="none">${outlines}</g>
          <g pointer-events="none">${flags}</g>
          <g pointer-events="none">${marks}</g>
        </svg>
      </div>
    </div>`;
}

/* 把畫面捲到某一組的領地中央。
   地圖動輒上千格,學生打開常常不知道自己在哪一角 —— 與其叫他們找,
   不如直接帶過去。用畫面實際座標算,不必再推一次六角座標。 */
function centerOnGroup(groupIdx, opts) {
  const box = document.querySelector('.hex-map-scroll');
  if (!box) return false;

  let marks = [...box.querySelectorAll(`.hex[data-owner="${groupIdx}"]`)];
  // 還沒佔到任何格子(或剛被打下來)就退而求其次,帶到可攻擊的地方
  if (marks.length === 0) marks = [...box.querySelectorAll('.hex[data-attackable="1"]')];
  if (marks.length === 0) return false;

  const bb = box.getBoundingClientRect();
  let sx = 0, sy = 0;
  marks.forEach(el => {
    const r = el.getBoundingClientRect();
    sx += r.left + r.width / 2;
    sy += r.top + r.height / 2;
  });
  const cx = sx / marks.length - bb.left + box.scrollLeft;
  const cy = sy / marks.length - bb.top + box.scrollTop;

  box.scrollTo({
    left: Math.max(0, cx - box.clientWidth / 2),
    top: Math.max(0, cy - box.clientHeight / 2),
    behavior: (opts && opts.instant) ? 'auto' : 'smooth'
  });
  _hexScrollSave(box);
  return true;
}

/* 縮放級距。上千格的地圖預設會縮得很小,放大才看得清楚 */
let _territoryZoom = 1;
function territoryZoom(dir) {
  // 下限放到 0.25:史詩尺寸的地圖要縮很多才看得到全貌
  const step = _territoryZoom <= 0.5 ? 0.125 : 0.25;
  _territoryZoom = Math.max(0.25, Math.min(4, _territoryZoom + dir * step));
  _territoryZoom = Math.round(_territoryZoom * 1000) / 1000;
  _lastMapSig = null;                       // 強制重繪
  if (typeof StudentApp !== 'undefined' && StudentApp.tab === 'war') StudentApp.render();
  else renderTerritoryLive();
}

/* 縮到整張地圖剛好看得見 */
function territoryFit() {
  const box = document.querySelector('.hex-map-scroll');
  const svg = box && box.querySelector('.hex-map');
  if (!box || !svg) return;
  const natural = svg.getBoundingClientRect().width / _territoryZoom;
  if (!natural) return;
  _territoryZoom = Math.max(0.25, Math.min(4,
    Math.floor((box.clientWidth - 8) / natural * 100) / 100));
  _lastMapSig = null;
  if (typeof StudentApp !== 'undefined' && StudentApp.tab === 'war') StudentApp.render();
  else renderTerritoryLive();
}

function renderStandings(config, map, highlightGroup) {
  const total = Object.keys(map).length;
  return `<div class="territory-standings">` +
    Territory.standings(config, map).map(s => {
      const pct = total > 0 ? (s.count / total * 100) : 0;
      const color = GROUP_COLORS[s.groupIdx % GROUP_COLORS.length];
      return `
        <div class="standing-row ${s.groupIdx === highlightGroup ? 'is-me' : ''}">
          <span class="standing-name" style="color:${color}">第 ${s.groupIdx + 1} 組</span>
          <span class="standing-bar">
            <span class="standing-fill" style="width:${pct}%; background:${color}"></span>
          </span>
          <span class="standing-count">${s.count}</span>
        </div>`;
    }).join('') + `</div>`;
}

/* 剩餘時間寫成 3:05 */
function formatCountdown(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
