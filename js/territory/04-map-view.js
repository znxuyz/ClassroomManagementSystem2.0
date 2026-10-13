/* ============================================
   領地佔領戰 — 地圖繪製
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

  const polys = cells.map(k => {
    const cell = map[k];
    const p = pos[k];
    const open = Territory.isOpenCell(config, k, cell.depth, now);
    const owned = cell.owner !== null;
    const canAttack = targets.has(k);
    const pts = Hex.corners(p.x, p.y, size);

    // 未開放的區域用深色石板 + 斜線紋,和「空白但可打」的淺色明顯區隔
    if (!open) {
      return `<g class="hex locked ${selected.has(k) ? 'picked' : ''}"
        ${editing ? `onclick="territoryPick('${k}')"` : ''}>
        <polygon points="${pts}" fill="#7d7368" stroke="#585047" stroke-width="1.5" />
        <polygon points="${pts}" fill="url(#lockHatch)" />
        ${selected.has(k) ? `<polygon points="${pts}" class="pick-ring" />` : ''}
      </g>`;
    }

    // 已開放但無人佔領的陸地。用暖草色而不是接近背景的米白,
    // 在深色海面上才看得出「這裡是可以搶的地」。
    const fill = owned ? GROUP_COLORS[cell.owner % GROUP_COLORS.length] : '#e3d9ae';

    let battleMarks = '';
    if (cell.battle) {
      const ranked = Object.entries(cell.battle.points)
        .map(([g, pts2]) => ({ g: Number(g), pts: pts2 }))
        .sort((a, b) => b.pts - a.pts);
      const total = ranked.reduce((s2, e) => s2 + e.pts, 0) || 1;
      let x = p.x - size * 0.62;
      battleMarks = ranked.map(e => {
        const w = (size * 1.24) * (e.pts / total);
        const rect = `<rect x="${x.toFixed(1)}" y="${(p.y + size * 0.42).toFixed(1)}"
          width="${w.toFixed(1)}" height="5" fill="${GROUP_COLORS[e.g % GROUP_COLORS.length]}" />`;
        x += w;
        return rect;
      }).join('') +
      `<text x="${p.x.toFixed(1)}" y="${(p.y + 5).toFixed(1)}" class="hex-battle-mark">⚔</text>`;
    }

    return `<g class="hex ${canAttack && !editing ? 'attackable' : ''} ${cell.isBase ? 'base' : ''}
                 ${cell.battle ? 'in-battle' : ''} ${selected.has(k) ? 'picked' : ''}"
      ${owned ? `data-owner="${cell.owner}"` : ''}
      ${canAttack ? 'data-attackable="1"' : ''}
      ${editing ? `onclick="territoryPick('${k}')"`
                : (canAttack && o.onClick ? `onclick="${o.onClick}('${k}')"` : '')}>
      <polygon points="${pts}" fill="${fill}" stroke="#fbf8f0" stroke-width="2" />
      ${cell.isBase ? `<text x="${p.x.toFixed(1)}" y="${(p.y + 6).toFixed(1)}" class="hex-base-mark">★</text>` : ''}
      ${battleMarks}
      ${selected.has(k) ? `<polygon points="${pts}" class="pick-ring" />` : ''}
    </g>`;
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
            <pattern id="lockHatch" width="7" height="7" patternUnits="userSpaceOnUse"
                     patternTransform="rotate(45)">
              <rect width="7" height="7" fill="rgba(0,0,0,0)" />
              <line x1="0" y1="0" x2="0" y2="7" stroke="rgba(255,255,255,0.22)" stroke-width="3" />
            </pattern>
          </defs>
          ${polys}
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
