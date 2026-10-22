/* ============================================
   蜂巢戰紀 — 地圖形狀
   ────────────────────────────────────────────
   八種地圖的產生器,以及尺寸、顏色、難度表。
   全部是純函式:同樣的 seed 永遠長出同樣的地圖,
   所以老師和每個學生看到的地形才會一致。
============================================ */

/* ============================================
   地圖形狀
   ────────────────────────────────────────────
   每個產生器吃 (radius, seed) 回傳格子清單。
   全部都是純函式 —— 同樣的輸入永遠得到同樣的地圖。
============================================ */

const MAP_SHAPES = {

  hexagon: {
    name: '六角大陸', desc: '最平衡的形狀,各組推進距離相同',
    build(radius) {
      const cells = [];
      for (let q = -radius; q <= radius; q++) {
        const r1 = Math.max(-radius, -q - radius);
        const r2 = Math.min(radius, -q + radius);
        for (let r = r1; r <= r2; r++) cells.push(Hex.key(q, r));
      }
      return cells;
    }
  },

  rectangle: {
    name: '橫向大陸', desc: '東西狹長,適合兩軍對峙',
    build(radius) {
      const cells = [];
      const h = Math.round(radius * 1.1), w = Math.round(radius * 2.0);
      for (let r = -h; r <= h; r++) {
        const offset = -Math.floor(r / 2);
        for (let q = offset - w; q <= offset + w; q++) cells.push(Hex.key(q, r));
      }
      return cells;
    }
  },

  ring: {
    name: '環形群島', desc: '中央是海,只能沿著環推進',
    build(radius) {
      const inner = Math.floor(radius * 0.42);
      return MAP_SHAPES.hexagon.build(radius).filter(k => {
        const { q, r } = Hex.parse(k);
        return Hex.ring(q, r) > inner;
      });
    }
  },

  cross: {
    name: '十字要塞', desc: '四條走廊交會於中心,中央是兵家必爭之地',
    build(radius) {
      const arm = Math.max(1, Math.round(radius * 0.34));
      return MAP_SHAPES.hexagon.build(radius).filter(k => {
        const { q, r } = Hex.parse(k);
        const s = -q - r;
        return Math.abs(q) <= arm || Math.abs(r) <= arm || Math.abs(s) <= arm;
      });
    }
  },

  star: {
    name: '星形大陸', desc: '六個尖角,各組從角落起家',
    build(radius) {
      return MAP_SHAPES.hexagon.build(radius).filter(k => {
        const { q, r } = Hex.parse(k);
        const s = -q - r;
        const d = Hex.ring(q, r);
        if (d <= radius * 0.45) return true;
        // 留下三軸附近的尖角,其餘挖掉
        const nearAxis = Math.min(Math.abs(q), Math.abs(r), Math.abs(s));
        return nearAxis <= radius * 0.22;
      });
    }
  },

  islands: {
    name: '破碎群島', desc: '不規則島嶼與海灣,推進路線每一局都不同',
    build(radius, seed) {
      const rand = seededRandom(seed || 1);
      const base = MAP_SHAPES.hexagon.build(radius);

      // 撒下若干「島核」,離島核夠近的格子成為陸地
      const coreCount = Math.max(5, Math.round(radius * 1.6));
      const cores = [];
      for (let i = 0; i < coreCount; i++) {
        const ang = rand() * Math.PI * 2;
        const dist = Math.sqrt(rand()) * radius * 0.92;
        cores.push({
          q: Math.round(Math.cos(ang) * dist),
          r: Math.round(Math.sin(ang) * dist),
          rad: radius * (0.18 + rand() * 0.22)
        });
      }

      const land = base.filter(k => {
        const { q, r } = Hex.parse(k);
        return cores.some(c =>
          Hex.distance(k, Hex.key(c.q, c.r)) <= c.rad);
      });

      // 島嶼之間必須走得到,否則有的組會被困在孤島上
      return MAP_SHAPES._connect(land, base, rand);
    }
  },

  cave: {
    name: '洞窟迷宮', desc: '蜿蜒的通道與死路,適合長期戰',
    build(radius, seed) {
      const rand = seededRandom(seed || 1);
      const base = MAP_SHAPES.hexagon.build(radius);
      const set = new Set(base);

      // 隨機挖掉一部分,再補上連通性 —— 得到有機的洞窟輪廓
      const wall = new Set();
      base.forEach(k => {
        const { q, r } = Hex.parse(k);
        const edge = Hex.ring(q, r) > radius - 1;
        if (!edge && rand() < 0.34) wall.add(k);
      });

      const land = base.filter(k => !wall.has(k));
      return MAP_SHAPES._connect(land, base, rand);
    }
  },

  world: {
    name: '世界地圖', desc: '七大洲輪廓,大陸之間以陸橋相連',
    build(radius) {
      // 用一張輪廓圖取樣。# 是陸地,. 是海洋。
      // 解析度固定,再依 radius 縮放到需要的格數。
      const art = WORLD_ART;
      const artH = art.length, artW = art[0].length;

      const h = Math.round(radius * 1.15);
      const w = Math.round(radius * 2.1);
      const cells = [];

      for (let row = -h; row <= h; row++) {
        const offset = -Math.floor(row / 2);
        for (let col = -w; col <= w; col++) {
          // 把 (col,row) 映到輪廓圖的座標
          const ax = Math.floor((col + w) / (2 * w + 1) * artW);
          const ay = Math.floor((row + h) / (2 * h + 1) * artH);
          const line = art[Math.min(artH - 1, Math.max(0, ay))];
          if (line[Math.min(artW - 1, Math.max(0, ax))] === '#') {
            cells.push(Hex.key(offset + col, row));
          }
        }
      }

      // 各大洲本來就分離,補上陸橋才不會有組被困在自己的洲
      return MAP_SHAPES._connect(cells, cells, seededRandom(1));
    }
  },

  /* 把不相連的區塊接起來。
     不連通的地圖會讓某些組被困在孤島上,整局動彈不得,
     所以這一步是必要的,不是美化。 */
  _connect(land, universe, rand) {
    let set = new Set(land);

    // 最多修幾輪。正常一兩輪就收斂,這只是避免萬一無限迴圈
    for (let round = 0; round < 40; round++) {
      const blobs = this._components(set);
      if (blobs.length <= 1) break;

      blobs.sort((a, b) => b.length - a.length);
      const main = blobs[0];
      const mainSet = new Set(main);

      for (let i = 1; i < blobs.length; i++) {
        const blob = blobs[i];
        // 太小的碎島直接丟掉,不值得為它挖路
        if (blob.length < 3) {
          blob.forEach(k => set.delete(k));
          continue;
        }
        // 用重心找出大概方向,再各自取最近的一格 —— 避免兩兩比對的 O(n²)
        const c = this._centroid(blob);
        const anchor = this._nearest(main, c);
        const from = this._nearest(blob, Hex.parse(anchor));
        this._carve(set, from, anchor);
        blob.forEach(k => mainSet.add(k));
      }
    }

    return [...set];
  },

  _components(set) {
    const seen = new Set();
    const blobs = [];
    set.forEach(start => {
      if (seen.has(start)) return;
      const blob = [];
      const queue = [start];
      seen.add(start);
      while (queue.length) {
        const k = queue.pop();
        blob.push(k);
        const { q, r } = Hex.parse(k);
        Hex.neighbors(q, r).forEach(n => {
          if (set.has(n) && !seen.has(n)) { seen.add(n); queue.push(n); }
        });
      }
      blobs.push(blob);
    });
    return blobs;
  },

  _centroid(cells) {
    let q = 0, r = 0;
    cells.forEach(k => { const p = Hex.parse(k); q += p.q; r += p.r; });
    return { q: q / cells.length, r: r / cells.length };
  },

  _nearest(cells, point) {
    let best = null, bestD = Infinity;
    cells.forEach(k => {
      const p = Hex.parse(k);
      // 立方座標下的距離,不用開根號也準確
      const d = (Math.abs(p.q - point.q) + Math.abs(p.r - point.r)
               + Math.abs(p.q + p.r - point.q - point.r)) / 2;
      if (d < bestD) { bestD = d; best = k; }
    });
    return best;
  },

  /* 沿六角格的直線挖出一條走廊。
     用立方座標內插再取整,每一步都保證相鄰,不會跳格 —— 
     這是前一版用平面內插造成地圖斷開的原因。 */
  _carve(set, fromKey, toKey) {
    const A = Hex.parse(fromKey), B = Hex.parse(toKey);
    const a = { x: A.q, y: A.r, z: -A.q - A.r };
    const b = { x: B.q, y: B.r, z: -B.q - B.r };
    const N = Math.max(1, (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z)) / 2);

    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const p = this._cubeRound(
        a.x + (b.x - a.x) * t,
        a.y + (b.y - a.y) * t,
        a.z + (b.z - a.z) * t
      );
      set.add(Hex.key(p.x, p.y));
    }
  },

  /* 立方座標取整:三個軸各自四捨五入後,把誤差最大的那一軸
     反推回來,確保 x + y + z 仍然等於 0 */
  _cubeRound(x, y, z) {
    let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
    const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
    if (dx > dy && dx > dz) rx = -ry - rz;
    else if (dy > dz) ry = -rx - rz;
    else rz = -rx - ry;
    return { x: rx, y: ry, z: rz };
  }
};

/* 地圖規模。半徑決定格子數,實際數量依形狀而異 */
const MAP_SIZES = [
  { id: 'S',  label: '小',   radius: 6,  note: '一節課' },
  { id: 'M',  label: '中',   radius: 10, note: '幾節課' },
  { id: 'L',  label: '大',   radius: 15, note: '一個月' },
  { id: 'XL', label: '超大', radius: 21, note: '一學期' },
  { id: 'XXL',label: '史詩', radius: 26, note: '一學年' }
];

const GROUP_COLORS = [
  '#c25b4e', '#4a7c62', '#5b8ba8', '#c8a44d',
  '#8a5a72', '#d97742', '#6b7f4a', '#7a6aa8'
];

const DIFFICULTY = {
  easy:   { label: '簡單', points: 1, color: '#7d9b8a' },
  medium: { label: '普通', points: 2, color: '#c8a44d' },
  hard:   { label: '困難', points: 3, color: '#c25b4e' }
};
