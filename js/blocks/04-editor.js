/* ============================================
   積木冒險 — 積木編輯器
   ────────────────────────────────────────────
   學生用它拼程式,老師用它拼參考解答 —— **同一個編輯器**。
   老師看到的畫面和學生一模一樣,出題時就不會出現「我這樣拼得出來,
   學生那邊卻做不到」的狀況。

   ── 和真的 MakeCode 對齊 ──
   分類名稱、順序、顏色都照 pxt-microbit(見 01-defs.js);積木是實色填滿
   加白字、上下有凹凸的接點、C 形積木把內容框在裡面 —— 孩子在這裡練完
   直接回去用真的 MakeCode,看到的要是同一套東西。

   ── 兩種操作都可以 ──
   · **拖曳**:和原版一樣,從左邊的面板把積木拖進工作區;
     拖的時候每一個可以放的位置都會亮出來,放開就接上去。
     拖到面板上放開 = 丟掉(原版也是這樣)。
     用的是 pointer 事件,所以滑鼠、觸控板、觸控螢幕、觸控筆同一套程式碼。
   · **點兩下**:先點工作區裡的插入點、再點積木。這一條留著是因為
     投影示範時用點的比較穩,手不穩的孩子也拖不準。

   ── 運算式的格子 ──
   數字格直接打字(大部分時候就是要打一個數字),不必為了填 0 還去
   拉一塊「0」積木;要放變數或算式時,把積木拖進去或點那一格再點積木。
============================================ */

const BlockEditor = {
  el: null,
  program: [],
  vars: [],
  palette: null,        // 只開放這幾塊(null = 全部)
  readonly: false,
  onChange: null,
  cat: 'basic',         // 面板上正在看哪一類
  cursor: null,         // { parentId: null|id, list: 'body'|'elseBody', index }
  slot: null,           // { id, arg } 選中的運算式格子
  _uid: 1,

  /* ---------- 掛上去 ---------- */
  mount(el, opt) {
    const o = opt || {};
    this.el = typeof el === 'string' ? document.getElementById(el) : el;
    this.program = o.program ? JSON.parse(JSON.stringify(o.program)) : [];
    this.palette = o.palette || null;
    this.readonly = !!o.readonly;
    this.onChange = o.onChange || null;
    this.cursor = null;
    this.slot = null;
    this._uid = 1;
    this.ensureIds(this.program);
    this.vars = blockVars(this.program);
    this.render();
    if (!this._wired) {
      document.addEventListener('click', e => this.onClick(e));
      document.addEventListener('change', e => this.onInput(e));
      document.addEventListener('pointerdown', e => this.onPointerDown(e));
      this._wired = true;
    }
  },

  ensureIds(list) {
    (list || []).forEach(b => {
      if (!b || typeof b !== 'object') return;
      if (!b.id) b.id = 'b' + (this._uid++);
      const d = blockDef(b.t);
      (d && d.args || []).forEach(a => {
        const v = b[a.name];
        if (v && typeof v === 'object' && v.t) this.ensureIds([v]);
      });
      if (b.body) this.ensureIds(b.body);
      if (b.elseBody) this.ensureIds(b.elseBody);
    });
  },

  /* 乾淨的程式(拿掉 id,存檔與判題用) */
  value() {
    const strip = list => (list || []).map(b => {
      const out = {};
      Object.keys(b).forEach(k => {
        if (k === 'id') return;
        const v = b[k];
        if (Array.isArray(v)) out[k] = strip(v);
        else if (v && typeof v === 'object' && v.t) out[k] = strip([v])[0];
        else out[k] = v;
      });
      return out;
    });
    return strip(this.program);
  },

  changed() {
    this.vars = [...new Set(this.vars.concat(blockVars(this.program)))];
    this.render();
    if (this.onChange) this.onChange(this.value());
  },

  /* ---------- 找積木 ---------- */
  find(id, list, parent) {
    list = list || this.program;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (!b) continue;
      if (b.id === id) return { block: b, list, index: i, parent: parent || null };
      const inBody = b.body && this.find(id, b.body, b);
      if (inBody) return inBody;
      const inElse = b.elseBody && this.find(id, b.elseBody, b);
      if (inElse) return inElse;
      const d = blockDef(b.t);
      for (const a of (d && d.args || [])) {
        const v = b[a.name];
        if (v && typeof v === 'object' && v.id === id) {
          return { block: v, slotOf: b, slotArg: a.name };
        }
        if (v && typeof v === 'object' && v.t) {
          const deep = this.find(id, [v], b);
          if (deep) return deep;
        }
      }
    }
    return null;
  },

  /* ---------- 操作 ---------- */
  makeBlock(t, varName) {
    const d = blockDef(t);
    if (!d) return null;
    const blk = { id: 'b' + (this._uid++), t };
    if (varName) blk.name = varName;
    (d.args || []).forEach(a => {
      if (blk[a.name] !== undefined) return;         // 面板已經給好的(變數名稱)
      if (a.type === 'num' || a.type === 'rawnum') blk[a.name] = a.def;
      else if (a.type === 'bool') blk[a.name] = null;
      else if (a.type === 'var') blk[a.name] = this.vars[0] || '';
      else blk[a.name] = a.def;
    });
    if (d.body) blk.body = [];
    if (d.else) blk.elseBody = [];
    return blk;
  },

  addFromPalette(t, varName) {
    const d = blockDef(t);
    if (!d) return;
    const blk = this.makeBlock(t, varName);
    if (!blk) return;

    if (d.kind === 'expr') {
      if (!this.slot) { toast('先點一下要放進去的那一格(虛線的那個)'); return; }
      const hit = this.find(this.slot.id);
      if (!hit) { this.slot = null; return; }
      hit.block[this.slot.arg] = this.plainIfNumber(blk);
      this.slot = null;
      this.changed();
      return;
    }

    if (d.kind === 'event') {
      // 帽子一律放最外層,不必先點插入點
      this.program.push(blk);
      this.cursor = { parentId: blk.id, list: 'body', index: 0 };
      this.changed();
      return;
    }

    // 一般指令:放在目前的插入點
    if (!this.cursor || this.cursor.parentId === null) {
      toast('一般積木要放在事件積木「裡面」 —— 先點一下事件裡的虛線位置');
      return;
    }
    const hit = this.find(this.cursor.parentId);
    if (!hit) { this.cursor = null; return; }
    const list = hit.block[this.cursor.list] = hit.block[this.cursor.list] || [];
    list.splice(this.cursor.index, 0, blk);
    this.cursor = { ...this.cursor, index: this.cursor.index + 1 };
    // 新加的如果本身能裝東西,插入點就跳進它裡面 —— 那幾乎一定是下一步
    if (d.body) this.cursor = { parentId: blk.id, list: 'body', index: 0 };
    this.changed();
  },

  removeBlock(id) {
    const hit = this.find(id);
    if (!hit) return;
    if (hit.slotOf) { hit.slotOf[hit.slotArg] = blockDef(hit.slotOf.t)
        .args.find(a => a.name === hit.slotArg).type === 'bool' ? null : 0; }
    else hit.list.splice(hit.index, 1);
    this.cursor = null;
    this.changed();
  },

  moveBlock(id, dir) {
    const hit = this.find(id);
    if (!hit || hit.slotOf) return;
    const j = hit.index + dir;
    if (j < 0 || j >= hit.list.length) return;
    const [b] = hit.list.splice(hit.index, 1);
    hit.list.splice(j, 0, b);
    this.changed();
  },

  addVar() {
    const name = (prompt('變數的名字(例:步數)') || '').trim();
    if (!name) return;
    if (name.length > 10) { toast('名字太長了,十個字以內'); return; }
    if (!this.vars.includes(name)) this.vars.push(name);
    this.render();
  },

  /* ============================================
     拖曳
     ────────────────────────────────────────────
     用 pointer 事件,不用 HTML5 的 dragstart —— 後者在觸控螢幕上
     根本不會觸發,而教室裡有觸控筆電。

     流程:按下去記位置 → 移動超過 4px 才算在拖(不然點一下會被當成拖)
     → 把被拖的那一塊從樹上拔下來,畫一個跟著手指跑的影子
     → 同時把所有「放得進去」的位置亮出來
     → 放開時接到最近的那一個;沒接到就放回原位(從面板拖出來的則丟掉)。
  ============================================ */
  drag: null,

  onPointerDown(e) {
    if (this.readonly || e.button === 1 || e.button === 2) return;
    if (!this.el || !this.el.contains(e.target)) return;
    // 在輸入框、下拉、LED 格子上按下去是要操作它們,不是要拖
    if (e.target.closest('input, select, .bk-led, .bk-tool, .bk-slot-mini')) return;

    const chip = e.target.closest('.bk-chip[data-t]');
    const head = e.target.closest('.bk-head');
    if (!chip && !head) return;

    const src = chip
      ? { t: chip.dataset.t, varName: chip.dataset.var }
      : { id: head.parentElement.dataset.id };
    if (!chip && !src.id) return;

    this._pending = { src, x: e.clientX, y: e.clientY };
    this._moveH = ev => this.onPointerMove(ev);
    this._upH = ev => this.onPointerUp(ev);
    window.addEventListener('pointermove', this._moveH);
    window.addEventListener('pointerup', this._upH);
    window.addEventListener('pointercancel', this._upH);
  },

  onPointerMove(e) {
    if (!this.drag) {
      if (!this._pending) return;
      const dx = e.clientX - this._pending.x, dy = e.clientY - this._pending.y;
      if (Math.abs(dx) + Math.abs(dy) < 5) return;      // 還不算拖
      if (!this.beginDrag(this._pending.src)) { this.endPointer(); return; }
    }
    e.preventDefault();
    const g = this.drag.ghost;
    g.style.left = (e.clientX - this.drag.offX) + 'px';
    g.style.top = (e.clientY - this.drag.offY) + 'px';
    this.highlightTarget(e.clientX, e.clientY);
  },

  onPointerUp(e) {
    if (this.drag) {
      const target = this.findTarget(e.clientX, e.clientY);
      const overPalette = !!document.elementFromPoint(e.clientX, e.clientY)?.closest('.bk-palette');
      this.finishDrag(target, overPalette);
    }
    this.endPointer();
  },

  endPointer() {
    this._pending = null;
    window.removeEventListener('pointermove', this._moveH);
    window.removeEventListener('pointerup', this._upH);
    window.removeEventListener('pointercancel', this._upH);
  },

  beginDrag(src) {
    let blk = null, from = null;
    if (src.id) {
      const hit = this.find(src.id);
      if (!hit) return false;
      blk = hit.block;
      if (hit.slotOf) {
        from = { slotOf: hit.slotOf, arg: hit.slotArg };
        hit.slotOf[hit.slotArg] = this.defaultFor(hit.slotOf, hit.slotArg);
      } else {
        from = { list: hit.list, index: hit.index };
        hit.list.splice(hit.index, 1);
      }
    } else {
      blk = this.makeBlock(src.t, src.varName);
      if (!blk) return false;
    }

    const def = blockDef(blk.t);
    const ghost = document.createElement('div');
    ghost.className = 'bk-ghost';
    ghost.innerHTML = this.renderBlock(blk);
    document.body.appendChild(ghost);
    const r = ghost.getBoundingClientRect();

    this.drag = { blk, from, ghost, kind: def.kind, offX: Math.min(40, r.width / 2), offY: 16 };
    this.el.querySelector('.bk-editor').classList.add('is-dragging');
    this.cursor = null;
    this.slot = null;
    this.render();
    this.el.querySelector('.bk-editor').classList.add('is-dragging');
    return true;
  },

  /* 「數字」這一塊放進格子之後就存成單純的數字。
     MakeCode 裡的數字本來就只是積木上的一個白色小格,不是另一塊積木 ——
     畫成一塊紫色的大積木看起來會很怪,而且佔掉半行。 */
  plainIfNumber(blk) {
    return (blk && blk.t === 'num') ? (Number(blk.v) || 0) : blk;
  },

  /* 這一格空的時候該放什麼(把積木拖走之後要還原成空格) */
  defaultFor(block, arg) {
    const d = blockDef(block.t);
    const a = (d && d.args || []).find(x => x.name === arg);
    return (a && a.type === 'bool') ? null : 0;
  },

  /* 現在可以放的位置 */
  targets() {
    if (!this.drag) return [];
    const sel = this.drag.kind === 'expr'
      ? '.bk-slot, .bk-numwrap'
      : '.bk-cursor';
    return [...this.el.querySelectorAll(sel)].filter(el => {
      if (this.drag.kind === 'expr') return true;
      const top = !el.dataset.parent;
      // 帽子只能放最外層,一般積木只能放在事件裡面
      return this.drag.kind === 'event' ? top : !top;
    });
  },

  findTarget(x, y) {
    let best = null, bestD = 150;
    this.targets().forEach(el => {
      const r = el.getBoundingClientRect();
      const cx = Math.max(r.left, Math.min(x, r.right));
      const cy = Math.max(r.top, Math.min(y, r.bottom));
      const d = Math.hypot(x - cx, y - cy);
      if (d < bestD) { bestD = d; best = el; }
    });
    return best;
  },

  highlightTarget(x, y) {
    const hit = this.findTarget(x, y);
    this.el.querySelectorAll('.is-drop').forEach(el => el.classList.remove('is-drop'));
    if (hit) hit.classList.add('is-drop');
  },

  finishDrag(target, overPalette) {
    const { blk, from } = this.drag;
    this.drag.ghost.remove();
    const wasDrag = this.drag;
    this.drag = null;

    if (overPalette) { this.changed(); return; }      // 拖回面板 = 丟掉

    if (target) {
      if (wasDrag.kind === 'expr') {
        const id = target.dataset.id || target.querySelector('[data-id]')?.dataset.id;
        const arg = target.dataset.arg
          || target.querySelector('[data-arg]')?.dataset.arg;
        const hit = id && this.find(id);
        if (hit) { hit.block[arg] = this.plainIfNumber(blk); this.changed(); return; }
      } else {
        const parentId = target.dataset.parent || null;
        const list = target.dataset.list || 'body';
        const index = Number(target.dataset.index) || 0;
        if (parentId) {
          const hit = this.find(parentId);
          /* 不能把積木放進它自己的肚子裡 —— 樹會變成一個圈,畫面直接當掉 */
          if (hit && !this.contains(blk, parentId)) {
            const arr = hit.block[list] = hit.block[list] || [];
            arr.splice(Math.min(index, arr.length), 0, blk);
            this.changed();
            return;
          }
        } else {
          this.program.splice(Math.min(index, this.program.length), 0, blk);
          this.changed();
          return;
        }
      }
    }

    // 沒接到:原本就在樹上的放回去,從面板拖出來的就算了
    if (from) {
      if (from.slotOf) from.slotOf[from.arg] = blk;
      else from.list.splice(Math.min(from.index, from.list.length), 0, blk);
    }
    this.changed();
  },

  /* blk 的肚子裡有沒有 id 這一塊 */
  contains(blk, id) {
    let found = false;
    walkBlocks([blk], b => { if (b.id === id) found = true; });
    return found;
  },

  /* ---------- 事件 ---------- */
  onClick(e) {
    if (!this.el || !this.el.contains(e.target)) return;
    const t = e.target.closest('[data-bk]');
    if (!t) return;
    const act = t.dataset.bk;
    if (this.readonly && act !== 'cursor') return;

    if (act === 'add') { this.addFromPalette(t.dataset.t, t.dataset.var); }
    else if (act === 'del') { this.removeBlock(t.dataset.id); }
    else if (act === 'up') { this.moveBlock(t.dataset.id, -1); }
    else if (act === 'down') { this.moveBlock(t.dataset.id, 1); }
    else if (act === 'cursor') {
      this.cursor = { parentId: t.dataset.parent || null,
                      list: t.dataset.list || 'body',
                      index: Number(t.dataset.index) || 0 };
      this.slot = null;
      this.render();
    } else if (act === 'slot') {
      this.slot = { id: t.dataset.id, arg: t.dataset.arg };
      this.cursor = null;
      this.render();
    } else if (act === 'cat') {
      // 換一類積木(面板左邊那一欄)
      this.cat = t.dataset.cat;
      this.render();
    } else if (act === 'addvar') { this.addVar(); }
    else if (act === 'led') {
      const hit = this.find(t.dataset.id);
      if (!hit) return;
      const i = Number(t.dataset.i);
      const g = (hit.block.grid || LED_BLANK).split('');
      g[i] = g[i] === '1' ? '0' : '1';
      hit.block.grid = g.join('');
      this.changed();
    }
    e.stopPropagation();
  },

  onInput(e) {
    if (!this.el || !this.el.contains(e.target) || this.readonly) return;
    const f = e.target.closest('[data-bk-field]');
    if (!f) return;
    const hit = this.find(f.dataset.id);
    if (!hit) return;
    const arg = f.dataset.arg;
    const type = f.dataset.type;
    let v = f.value;
    if (type === 'num' || type === 'rawnum') v = Number(v) || 0;
    if (type === 'var' && v === '__new__') { this.addVar(); return; }
    hit.block[arg] = v;
    this.changed();
  },

  /* ---------- 畫面 ---------- */
  render() {
    if (!this.el) return;
    this.el.innerHTML = `
      <div class="bk-editor ${this.readonly ? 'is-readonly' : ''}">
        ${this.readonly ? '' : this.renderPalette()}
        <div class="bk-work">
          ${this.renderList(this.program, null, 'body')}
        </div>
      </div>`;
  },

  /* 面板的樣子照 MakeCode:左邊一欄分類,點了才展開那一類的積木。
     全部攤成一長條的話,「變數」要捲很久才找得到 ——
     而孩子在真的 MakeCode 裡學到的動作就是「先點分類」。 */
  renderPalette() {
    const allowed = this.palette;
    const live = BLOCK_CATS.filter(c =>
      BLOCK_DEFS.some(d => d.cat === c.id && (!allowed || allowed.includes(d.t))));
    if (!live.length) return '';
    if (!live.some(c => c.id === this.cat)) this.cat = live[0].id;

    const cur = live.find(c => c.id === this.cat) || live[0];
    const blocks = BLOCK_DEFS.filter(d => d.cat === cur.id
      && (!allowed || allowed.includes(d.t)));

    return `
      <div class="bk-palette">
        <div class="bk-cats">
          ${live.map(c => `
            <button class="bk-cat-tab ${c.id === cur.id ? 'is-on' : ''}"
                    data-bk="cat" data-cat="${c.id}" style="--c:${c.color}">
              <i></i>${escapeHtml(c.name)}
            </button>`).join('')}
        </div>
        <div class="bk-chips" style="--c:${cur.color}">
          ${blocks.map(d => {
            /* 變數積木和 MakeCode 一樣:有幾個變數就擺幾塊,上面寫的就是
               變數的名字。寫成「◻」的話,孩子根本不知道那一塊是什麼。 */
            if (d.t === 'var') {
              return this.vars.map(n => `
                <button class="bk-chip" data-bk="add" data-t="var" data-var="${escapeHtml(n)}"
                  style="--c:${cur.color}">${escapeHtml(n)}</button>`).join('');
            }
            return `
              <button class="bk-chip" data-bk="add" data-t="${d.t}" style="--c:${cur.color}"
                >${this.labelPreview(d)}</button>`;
          }).join('')}
          ${cur.id === 'var' ? `<button class="bk-chip bk-chip-new" data-bk="addvar"
              style="--c:${cur.color}">＋ 新增變數</button>` : ''}
        </div>
      </div>`;
  },

  /* 面板上只給一個「大概長這樣」的名字,插槽用底線代替 */
  labelPreview(d) {
    return escapeHtml(d.label.replace(/\$\{(\w+)\}/g, (m, k) => {
      const a = (d.args || []).find(x => x.name === k);
      if (a && a.type === 'pick') return a.def;
      if (a && a.type === 'leds') return '▦';
      return '◻';
    }));
  },

  renderList(list, parentId, which) {
    const items = (list || []).map((b, i) => `
      ${this.renderCursor(parentId, which, i)}
      ${this.renderBlock(b)}`).join('');
    return items + this.renderCursor(parentId, which, (list || []).length, true);
  },

  renderCursor(parentId, which, index, last) {
    const on = this.cursor && this.cursor.parentId === (parentId || null)
      && this.cursor.list === which && this.cursor.index === index;
    if (this.readonly) return '';
    return `<button class="bk-cursor ${on ? 'on' : ''} ${last ? 'is-last' : ''}"
      data-bk="cursor" data-parent="${parentId || ''}" data-list="${which}"
      data-index="${index}">${on ? '放這裡 ▸' : ''}</button>`;
  },

  renderBlock(b) {
    const d = blockDef(b.t);
    if (!d) return '';
    const cat = BLOCK_CATS.find(c => c.id === d.cat) || {};
    const label = d.label.replace(/\$\{(\w+)\}/g, (m, k) => this.renderArg(b, d, k));
    /* 運算式(橢圓的那種)不掛小工具:它們很小,三顆按鈕會把積木撐成
       兩倍寬,而且 MakeCode 也沒有 —— 要移除就把它拖出來。 */
    const tools = (this.readonly || d.kind === 'expr') ? '' : `
      <span class="bk-tools">
        <button class="bk-tool" data-bk="up" data-id="${b.id}" title="往上">↑</button>
        <button class="bk-tool" data-bk="down" data-id="${b.id}" title="往下">↓</button>
        <button class="bk-tool danger" data-bk="del" data-id="${b.id}" title="刪掉">✕</button>
      </span>`;

    /* 形狀和 MakeCode 對齊:
         帽子(事件)—— 上面是圓頂,接不了別的東西
         C 形(有 body)—— 把內容框在裡面,左邊那一條就是「誰包著誰」
         一般指令 —— 上下有凹凸的接點,疊起來像接上去的 */
    return `
      <div class="bk-blk ${d.kind === 'event' ? 'is-hat' : ''} ${d.body ? 'is-c' : ''}
                  ${d.kind === 'expr' ? 'is-expr' : ''}"
           data-id="${b.id}" style="--c:${cat.color}">
        <div class="bk-head">${label}${tools}</div>
        ${d.body ? `<div class="bk-body">${this.renderList(b.body, b.id, 'body')}</div>` : ''}
        ${d.else ? `<div class="bk-else">否則</div>
                    <div class="bk-body">${this.renderList(b.elseBody, b.id, 'elseBody')}</div>` : ''}
        ${d.body ? '<div class="bk-foot"></div>' : ''}
      </div>`;
  },

  renderArg(b, d, name) {
    const a = (d.args || []).find(x => x.name === name);
    if (!a) return '';
    const v = b[name];

    if (a.type === 'pick') {
      return `<select class="bk-field" data-bk-field data-id="${b.id}" data-arg="${name}"
        data-type="pick" ${this.readonly ? 'disabled' : ''}>${
        a.options.map(o => `<option ${o === v ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('')
      }</select>`;
    }

    if (a.type === 'var') {
      const opts = this.vars.map(n =>
        `<option ${n === v ? 'selected' : ''}>${escapeHtml(n)}</option>`).join('');
      return `<select class="bk-field bk-var" data-bk-field data-id="${b.id}" data-arg="${name}"
        data-type="var" ${this.readonly ? 'disabled' : ''}>
        ${v ? '' : '<option value="">選一個變數</option>'}${opts}
        ${this.readonly ? '' : '<option value="__new__">＋ 新增變數…</option>'}</select>`;
    }

    if (a.type === 'text') {
      return `<input class="bk-field bk-text" data-bk-field data-id="${b.id}" data-arg="${name}"
        data-type="text" value="${escapeHtml(String(v == null ? '' : v))}"
        ${this.readonly ? 'disabled' : ''} />`;
    }

    if (a.type === 'rawnum') {
      return `<input class="bk-field bk-num" type="number" data-bk-field data-id="${b.id}"
        data-arg="${name}" data-type="rawnum" value="${Number(v) || 0}"
        ${this.readonly ? 'disabled' : ''} />`;
    }

    if (a.type === 'leds') {
      const g = String(v || LED_BLANK);
      return `<span class="bk-leds">${Array.from({ length: 25 }, (_, i) =>
        `<button class="bk-led ${g[i] === '1' ? 'on' : ''}" data-bk="led"
          data-id="${b.id}" data-i="${i}" ${this.readonly ? 'disabled' : ''}></button>`).join('')}</span>`;
    }

    /* 數字格:預設就是一個可以直接打字的小框;
       放了積木進去就改成顯示那塊積木。真假格沒有「直接打字」這回事,
       一定要放積木,所以空的時候是虛線。 */
    /* 舊資料裡可能是 { t:'num', v:3 } —— 一樣畫成白色小格(見 plainIfNumber) */
    if (v && typeof v === 'object' && v.t && v.t !== 'num') {
      return `<span class="bk-sub">${this.renderBlock(v)}</span>`;
    }
    const numValue = (v && typeof v === 'object' && v.t === 'num') ? (Number(v.v) || 0)
                                                                   : (Number(v) || 0);
    if (a.type === 'bool') {
      const on = this.slot && this.slot.id === b.id && this.slot.arg === name;
      return `<button class="bk-slot ${on ? 'on' : ''}" data-bk="slot" data-id="${b.id}"
        data-arg="${name}">${on ? '放這裡 ▸' : '條件'}</button>`;
    }
    const on = this.slot && this.slot.id === b.id && this.slot.arg === name;
    return `<span class="bk-numwrap ${on ? 'on' : ''}" data-id="${b.id}" data-arg="${name}">
      <input class="bk-field bk-num" type="number" data-bk-field data-id="${b.id}"
        data-arg="${name}" data-type="num" value="${numValue}"
        ${this.readonly ? 'disabled' : ''} />
      ${this.readonly ? '' : `<button class="bk-slot-mini" data-bk="slot" data-id="${b.id}"
        data-arg="${name}" title="改成放積木(變數、算式)">▸</button>`}
    </span>`;
  }
};
