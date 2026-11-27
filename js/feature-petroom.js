/* ============================================
   守護獸的房間(2.5D)
   ────────────────────────────────────────────
   房間是 Blender 預先算好的一圈圖,拖曳就換圖 —— 看起來像在轉 3D,
   其實只是在翻圖片。為什麼不用 three.js:畫質是 Cycles 的全域光
   (地板的反光、窗戶的光斑、家具的落影,即時渲染做不出來),
   而且載入的只是幾張圖,教室的筆電和學生的手機都跑得動。

   守護獸本身是**那 32 張插畫**,不是 3D 模型 ——
   那些圖的品質比任何 image-to-3D 出來的都好,而且一毛錢都不用再花。

   難的地方是讓那張圖**真的站在地板上**。房間一轉,牠得跟著走到對的位置、
   縮成對的大小。這件事不能用猜的:tools/blender/room.py 在算圖的時候,
   順便把每一個站位在每一個角度的螢幕座標與縮放投影出來,存成 room.json。
   這支程式只是照著那張表擺,所以牠永遠踩在地板上,不是貼在畫面上。
============================================ */

const PetRoom = {
  DATA: 'assets/room/room.json',
  BASE: 'assets/room/',

  meta: null,
  frame: 0,
  spot: 'rug',
  mood: 'idle',
  el: null,
  _drag: null,

  /* ---------- 載入 ----------
     資料從 assets/room/room-data.js 進來(index.html 用 <script> 載),
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
    } else {
      this.meta = false;
    }
    return this.meta;
  },

  available() { return !!this.meta; },

  /* ---------- 畫 ---------- */
  html(pet) {
    if (!this.meta) return '';
    const m = this.meta;
    const f = m.frames[this.frame];
    return `
      <div class="room" id="petRoom" style="aspect-ratio:${m.width}/${m.height}">
        ${m.frames.map((fr, i) => `
          <img class="room-bg ${i === this.frame ? 'on' : ''}"
               data-i="${i}" alt=""
               ${i === this.frame || Math.abs(i - this.frame) <= 1
                 ? `src="${this.BASE}${fr.file}"` : `data-src="${this.BASE}${fr.file}"`}
               loading="${i === this.frame ? 'eager' : 'lazy'}" />`).join('')}

        <div class="room-pet" id="roomPet">
          <div class="room-shadow"></div>
          <img class="room-pet-img" src="${escapeHtml(pet.img)}"
               alt="${escapeHtml(pet.name)}" draggable="false" />
        </div>

        <div class="room-hint">拖曳可以轉動房間</div>
      </div>`;
  },

  /* 掛上去之後才量得到實際寬高,所以位置在這裡算 */
  mount() {
    if (!this.meta) return;
    this.el = document.getElementById('petRoom');
    if (!this.el) return;
    this.place();
    this.wire();
  },

  /* 把守護獸放到這一格的站位上。
     unit 是「地面上一個單位高,投影後佔畫面高的幾成」——
     直接拿它當縮放,透視就是對的,不必自己調係數。 */
  place() {
    if (!this.el) return;
    const f = this.meta.frames[this.frame];
    const s = f.spots[this.spot] || f.spots.rug;
    const pet = document.getElementById('roomPet');
    if (!pet || !s) return;
    pet.style.left = (s.x * 100) + '%';
    pet.style.top = (s.y * 100) + '%';
    /* 守護獸的圖大約是一個半單位高。數字小一點牠就站在房間裡,
       大一點就會撐出房間 —— 這是唯一一個靠眼睛調的數字。 */
    pet.style.setProperty('--h', (s.unit * 1.55 * 100) + '%');
  },

  show(i) {
    const n = this.meta.frames.length;
    i = Math.max(0, Math.min(n - 1, i));
    if (i === this.frame) return;
    this.frame = i;
    this.el.querySelectorAll('.room-bg').forEach(img => {
      const k = Number(img.dataset.i);
      // 轉到哪裡就把附近的圖補載進來,不要一開始就抓十三張
      if (Math.abs(k - i) <= 1 && !img.src && img.dataset.src) {
        img.src = img.dataset.src;
      }
      img.classList.toggle('on', k === i);
    });
    this.place();
  },

  wire() {
    const el = this.el;
    const n = this.meta.frames.length;

    /* 拖曳轉動。用 pointer 事件,滑鼠和觸控同一套 ——
       教室裡有觸控筆電,分兩套寫一定會有一邊忘記測。 */
    const down = e => {
      if (e.target.closest('.room-pet')) return;      // 點寵物是逗牠,不是轉房間
      this._drag = { x: e.clientX, from: this.frame };
      el.setPointerCapture(e.pointerId);
      el.classList.add('is-drag');
    };
    const move = e => {
      if (!this._drag) return;
      const w = el.clientWidth || 1;
      // 拖過整個寬度 = 從頭轉到尾
      const d = (e.clientX - this._drag.x) / w;
      this.show(Math.round(this._drag.from - d * (n - 1)));
    };
    const up = e => {
      if (!this._drag) return;
      this._drag = null;
      el.classList.remove('is-drag');
      try { el.releasePointerCapture(e.pointerId); } catch (err) { /* 已經放開了 */ }
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);

    // 鍵盤:左右鍵也能轉(有些孩子用鍵盤比較順,而且這是無障礙的基本)
    el.tabIndex = 0;
    el.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft') { this.show(this.frame - 1); e.preventDefault(); }
      if (e.key === 'ArrowRight') { this.show(this.frame + 1); e.preventDefault(); }
    });

    // 點守護獸 → 牠會跳一下
    const pet = document.getElementById('roomPet');
    if (pet) {
      pet.addEventListener('pointerdown', e => {
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

  /* 換站位(之後餵食、睡覺會用到) */
  goTo(spot) {
    if (!this.meta || !this.meta.frames[0].spots[spot]) return;
    this.spot = spot;
    this.place();
  }
};
