/* ============================================
   守護獸的房間(2.5D)+ 家具
   ────────────────────────────────────────────
   房間是 Blender 預先算好的一圈圖,拖曳就換圖 —— 看起來像在轉 3D,
   其實只是在翻圖片。為什麼不用 three.js:畫質是 Cycles 的全域光
   (地板的反光、窗戶的光斑、家具的落影,即時渲染做不出來),
   而且載入的只是幾張圖,教室的筆電和學生的手機都跑得動。

   守護獸本身是**那 32 張插畫**,不是 3D 模型 ——
   那些圖的品質比任何 image-to-3D 出來的都好,而且一毛錢都不用再花。

   ── 讓 2D 的東西真的站在地板上 ──
   地板是一個平面,所以「地板座標 ↔ 畫面座標」是一個 3×3 的單應矩陣。
   Blender 算圖時把每一個角度的矩陣一起導出來(room-data.js 裡的 H)。

     · 地板 → 畫面:H @ (x, y, 1),用來擺東西
     · 畫面 → 地板:H 的反矩陣,用來知道「學生把家具拖到哪裡」

   大小用 unit:地面上一個單位高投影出來佔畫面高的幾成,
   站得越後面這個數字越小 —— 拿它當縮放,透視就是對的,不是猜的係數。

   ── 誰擋住誰 ──
   離相機近的畫在上面。每一件東西都有地板座標,算一下到相機的距離排序就好。
   不排的話,守護獸會站在睡墊「後面」卻畫在睡墊上面。
============================================ */

const PetRoom = {
  BASE: 'assets/room/',

  meta: null,
  items: null,        // 型錄:買得到哪些家具
  placed: [],         // 這位學生擺了哪些、擺在哪 [{id, x, y}]
  frame: 0,
  petSpot: { x: 0, y: -0.4 },
  el: null,
  editing: false,
  _drag: null,
  onChange: null,     // 擺好之後要存起來(學生端接雲端)

  /* ---------- 載入 ----------
     資料從 assets/room/*-data.js 進來(index.html 用 <script> 載),
     **不是 fetch 一份 JSON** —— 老師是雙擊 index.html 打開這個系統的,
     而 file:// 下 fetch 讀本機檔案會被瀏覽器擋掉,房間就永遠不會出現。

     房間的圖是額外的資產,老師可能根本沒放(或還沒 git pull)。
     沒有就安靜退回原本的守護獸畫面 —— 不要讓一個裝飾功能把整個分頁弄壞。 */
  async load() {
    if (this.meta !== null) return this.meta;
    const data = (typeof window !== 'undefined') ? window.PET_ROOM : null;
    if (data && data.frames && data.frames.length) {
      this.meta = data;
      this.frame = Math.floor((data.frames.length - 1) / 2);   // 從正面開始
      this.items = (typeof window !== 'undefined' && window.PET_ROOM_ITEMS) || [];
    } else {
      this.meta = false;
      this.items = [];
    }
    return this.meta;
  },

  available() { return !!this.meta; },

  itemById(id) { return (this.items || []).find(i => i.id === id) || null; },

  /* ---------- 幾何 ---------- */

  /* 地板 (x, y) → 畫面上的比例座標 (0~1) */
  toScreen(f, x, y) {
    const H = f.H;
    const w = H[2][0] * x + H[2][1] * y + H[2][2];
    const cx = (H[0][0] * x + H[0][1] * y + H[0][2]) / w;
    const cy = (H[1][0] * x + H[1][1] * y + H[1][2]) / w;
    return { x: cx * 0.5 + 0.5, y: 1 - (cy * 0.5 + 0.5) };
  },

  /* 畫面上的比例座標 → 地板 (x, y)。
     3×3 反矩陣,自己寫比拉一個矩陣函式庫進來划算。 */
  toFloor(f, sx, sy) {
    const H = f.H;
    const cx = (sx - 0.5) * 2, cy = ((1 - sy) - 0.5) * 2;
    /* H @ (x,y,1) = w·(cx, cy, 1) 整理成兩條二元一次方程式:
         (H00 - cx·H20)x + (H01 - cx·H21)y = cx·H22 - H02
         (H10 - cy·H20)x + (H11 - cy·H21)y = cy·H22 - H12 */
    const a = H[0][0] - cx * H[2][0], b = H[0][1] - cx * H[2][1];
    const c = H[1][0] - cy * H[2][0], d = H[1][1] - cy * H[2][1];
    const e = cx * H[2][2] - H[0][2], g = cy * H[2][2] - H[1][2];
    const det = a * d - b * c;
    if (!det) return { x: 0, y: 0 };
    return { x: (e * d - b * g) / det, y: (a * g - e * c) / det };
  },

  /* 這一點的透視縮放。unit0 是房間正中央的基準,所以中央 = 1。 */
  scaleAt(f, x, y) {
    /* unit 本身只有在中央那一點算過,其他位置用「到相機的距離」換算 ——
       透視是 1/距離,所以近的大、遠的小,和真的投影一致。 */
    const c = f.cam;
    const d = Math.hypot(c[0] - x, c[1] - y, c[2]);
    const d0 = Math.hypot(c[0], c[1], c[2]);
    return d0 / d;
  },

  depthAt(f, x, y) {
    const c = f.cam;
    return -Math.hypot(c[0] - x, c[1] - y, c[2]);   // 近的大 → 畫在上面
  },

  /* 不要讓東西被拖到牆外面去 */
  clampFloor(p) {
    const half = (this.meta.room || 5) / 2 - 0.35;
    return { x: Math.max(-half, Math.min(half, p.x)),
             y: Math.max(-half, Math.min(half, p.y)) };
  },

  /* ---------- 畫 ---------- */
  html(pet) {
    if (!this.meta) return '';
    const m = this.meta;
    return `
      <div class="room ${this.editing ? 'is-editing' : ''}" id="petRoom"
           style="aspect-ratio:${m.width}/${m.height}">
        ${m.frames.map((fr, i) => `
          <img class="room-bg ${i === this.frame ? 'on' : ''}"
               data-i="${i}" alt=""
               ${Math.abs(i - this.frame) <= 1
                 ? `src="${this.BASE}${fr.file}"` : `data-src="${this.BASE}${fr.file}"`}
               loading="${i === this.frame ? 'eager' : 'lazy'}" />`).join('')}

        <div class="room-stage" id="roomStage">
          ${this.placed.map((p, i) => this.itemHtml(p, i)).join('')}
          <div class="room-pet" id="roomPet">
            <div class="room-shadow"></div>
            <img class="room-pet-img" src="${escapeHtml(pet.img)}"
                 alt="${escapeHtml(pet.name)}" draggable="false" />
          </div>
        </div>

        <div class="room-hint">${this.editing
          ? '拖曳家具擺到喜歡的位置'
          : '拖曳可以轉動房間'}</div>
      </div>`;
  },

  itemHtml(p, i) {
    const it = this.itemById(p.id);
    if (!it) return '';
    return `
      <div class="room-item" data-idx="${i}" title="${escapeHtml(it.name)}">
        ${this.meta.frames.map((fr, k) => `
          <img class="room-item-img ${k === this.frame ? 'on' : ''}"
               data-i="${k}" alt="${escapeHtml(it.name)}" draggable="false"
               ${Math.abs(k - this.frame) <= 1
                 ? `src="${this.BASE}items/${p.id}/${String(k).padStart(2, '0')}.webp"`
                 : `data-src="${this.BASE}items/${p.id}/${String(k).padStart(2, '0')}.webp"`} />`).join('')}
      </div>`;
  },

  mount() {
    if (!this.meta) return;
    this.el = document.getElementById('petRoom');
    if (!this.el) return;
    this.place();
    this.wire();
  },

  /* 把守護獸和每一件家具擺到這一格該在的位置、該有的大小、該有的前後順序。
     家具的圖是在**原點**算的,所以擺法是「把原點那一點搬到目標那一點」——
     縮放中心也設在原點的畫面位置,縮起來才不會飄。 */
  place() {
    if (!this.el) return;
    const f = this.meta.frames[this.frame];
    const o = this.toScreen(f, 0, 0);

    const pet = document.getElementById('roomPet');
    if (pet) {
      const s = this.toScreen(f, this.petSpot.x, this.petSpot.y);
      const k = this.scaleAt(f, this.petSpot.x, this.petSpot.y);
      pet.style.left = (s.x * 100) + '%';
      pet.style.top = (s.y * 100) + '%';
      /* 守護獸的圖大約一個半單位高。這是唯一一個靠眼睛調的數字。 */
      pet.style.setProperty('--h', (f.unit0 * 1.55 * k * 100) + '%');
      pet.style.zIndex = String(Math.round(1000 + this.depthAt(f, this.petSpot.x, this.petSpot.y) * 10));
    }

    this.el.querySelectorAll('.room-item').forEach(el => {
      const p = this.placed[Number(el.dataset.idx)];
      if (!p) return;
      const s = this.toScreen(f, p.x, p.y);
      const k = this.scaleAt(f, p.x, p.y);
      el.style.transformOrigin = (o.x * 100) + '% ' + (o.y * 100) + '%';
      el.style.transform =
        `translate(${(s.x - o.x) * 100}%, ${(s.y - o.y) * 100}%) scale(${k})`;
      el.style.zIndex = String(Math.round(1000 + this.depthAt(f, p.x, p.y) * 10));
    });
  },

  show(i) {
    const n = this.meta.frames.length;
    i = Math.max(0, Math.min(n - 1, i));
    if (i === this.frame) return;
    this.frame = i;
    // 轉到哪裡就把附近的圖補載進來,不要一開始就抓一百多張
    this.el.querySelectorAll('.room-bg, .room-item-img').forEach(img => {
      const k = Number(img.dataset.i);
      if (Math.abs(k - i) <= 1 && !img.getAttribute('src') && img.dataset.src) {
        img.src = img.dataset.src;
      }
      img.classList.toggle('on', k === i);
    });
    this.place();
  },

  /* ---------- 操作 ---------- */
  wire() {
    const el = this.el;
    const n = this.meta.frames.length;

    /* 用 pointer 事件,滑鼠和觸控同一套 ——
       教室裡有觸控筆電,分兩套寫一定會有一邊忘記測。 */
    const down = e => {
      const item = this.editing && e.target.closest('.room-item');
      if (item) {
        // 搬家具
        this._drag = { kind: 'item', el: item, idx: Number(item.dataset.idx) };
        item.classList.add('is-moving');
      } else if (e.target.closest('.room-pet') && !this.editing) {
        return;                                   // 點守護獸是逗牠
      } else {
        this._drag = { kind: 'turn', x: e.clientX, from: this.frame };
      }
      el.setPointerCapture(e.pointerId);
      el.classList.add('is-drag');
    };

    const move = e => {
      if (!this._drag) return;
      if (this._drag.kind === 'turn') {
        const w = el.clientWidth || 1;
        const d = (e.clientX - this._drag.x) / w;   // 拖過整個寬度 = 從頭轉到尾
        this.show(Math.round(this._drag.from - d * (n - 1)));
        return;
      }
      // 把滑鼠的位置換回地板座標 —— 這就是單應矩陣的反矩陣在做的事
      const r = el.getBoundingClientRect();
      const f = this.meta.frames[this.frame];
      const p = this.clampFloor(
        this.toFloor(f, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height));
      const cur = this.placed[this._drag.idx];
      if (cur) { cur.x = p.x; cur.y = p.y; this.place(); }
    };

    const up = e => {
      if (!this._drag) return;
      if (this._drag.kind === 'item') {
        this._drag.el.classList.remove('is-moving');
        if (this.onChange) this.onChange(this.placed);
      }
      this._drag = null;
      el.classList.remove('is-drag');
      try { el.releasePointerCapture(e.pointerId); } catch (err) { /* 已經放開了 */ }
    };

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);

    // 左右鍵也能轉。有些孩子用鍵盤比較順,而且這是無障礙的基本。
    el.tabIndex = 0;
    el.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft') { this.show(this.frame - 1); e.preventDefault(); }
      if (e.key === 'ArrowRight') { this.show(this.frame + 1); e.preventDefault(); }
    });

    const pet = document.getElementById('roomPet');
    if (pet) {
      pet.addEventListener('pointerdown', e => {
        if (this.editing) return;
        e.stopPropagation();
        this.poke();
      });
    }
  },

  /* 逗牠。動畫跑完要把 class 拿掉,不然第二次點不會再播。 */
  poke() {
    const pet = document.getElementById('roomPet');
    if (!pet || pet.classList.contains('is-happy')) return;
    pet.classList.add('is-happy');
    setTimeout(() => pet.classList.remove('is-happy'), 900);
  },

  /* ---------- 家具 ---------- */

  /* 擺一件新的。放在房間中央偏前,學生再自己拖。 */
  add(id) {
    if (!this.itemById(id)) return false;
    if (this.placed.some(p => p.id === id)) return false;   // 一樣的只有一件
    this.placed.push({ id, x: 0, y: -1.2 });
    if (this.onChange) this.onChange(this.placed);
    return true;
  },

  remove(id) {
    const i = this.placed.findIndex(p => p.id === id);
    if (i < 0) return false;
    this.placed.splice(i, 1);
    if (this.onChange) this.onChange(this.placed);
    return true;
  },

  /* 從存起來的資料還原。擋掉不存在的家具與壞掉的座標 ——
     型錄改過、或資料被改過的時候,不要讓房間整個畫不出來。 */
  setPlaced(list) {
    this.placed = (list || [])
      .filter(p => p && this.itemById(p.id))
      .map(p => Object.assign({ id: p.id },
        this.clampFloor({ x: Number(p.x) || 0, y: Number(p.y) || 0 })))
      .slice(0, 12);
    return this.placed;
  },

  setEditing(on) {
    this.editing = !!on;
    if (this.el) this.el.classList.toggle('is-editing', this.editing);
    const hint = this.el && this.el.querySelector('.room-hint');
    if (hint) hint.textContent = this.editing ? '拖曳家具擺到喜歡的位置' : '拖曳可以轉動房間';
  }
};
