/* ============================================
   積木挑戰 — 積木編輯器
   ────────────────────────────────────────────
   學生用它拼程式,老師用它拼參考解答 —— **同一個編輯器**。
   老師看到的畫面和學生一模一樣,出題時就不會出現「我這樣拼得出來,
   學生那邊卻做不到」的狀況。

   ── 為什麼不做拖曳 ──
   拖曳在教室裡很脆弱:Chromebook 的觸控板、平板的手指、投影時老師用
   滑鼠示範,三種操作要各自調一次,而且拖到一半放掉就會掉積木。
   這裡改成「點一下放一塊」:

     1. 先點工作區裡的**虛線插入點**(就是「要放在這裡」)
     2. 再點左邊的積木 → 它就插在那裡,插入點自動往後移

   連點三塊就是三行,不必瞄準。小學生第一次就會,而且投影示範時
   全班看得懂老師在做什麼。

   ── 運算式的格子 ──
   數字格直接打字(大部分時候就是要打一個數字),不必為了填 0 還去
   拉一塊「0」積木;要放變數或算式時,點那一格再點積木就會換成積木。
============================================ */

const BlockEditor = {
  el: null,
  program: [],
  vars: [],
  palette: null,        // 只開放這幾塊(null = 全部)
  readonly: false,
  onChange: null,
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
  addFromPalette(t, varName) {
    const d = blockDef(t);
    if (!d) return;
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

    if (d.kind === 'expr') {
      if (!this.slot) { toast('先點一下要放進去的那一格(虛線的那個)'); return; }
      const hit = this.find(this.slot.id);
      if (!hit) { this.slot = null; return; }
      hit.block[this.slot.arg] = blk;
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

  renderPalette() {
    const allowed = this.palette;
    const cats = BLOCK_CATS.map(c => {
      const blocks = BLOCK_DEFS.filter(d => d.cat === c.id
        && (!allowed || allowed.includes(d.t)));
      if (!blocks.length) return '';
      return `
        <div class="bk-cat">
          <div class="bk-cat-name" style="--c:${c.color}">${c.name}</div>
          ${blocks.map(d => {
            /* 變數積木和 MakeCode 一樣:有幾個變數就擺幾塊,上面寫的就是
               變數的名字。寫成「◻」的話,孩子根本不知道那一塊是什麼。 */
            if (d.t === 'var') {
              return this.vars.map(n => `
                <button class="bk-chip" data-bk="add" data-t="var" data-var="${escapeHtml(n)}"
                  style="--c:${c.color}">${escapeHtml(n)}</button>`).join('');
            }
            return `
            <button class="bk-chip" data-bk="add" data-t="${d.t}" style="--c:${c.color}"
              >${this.labelPreview(d)}</button>`;
          }).join('')}
          ${c.id === 'var' ? `<button class="bk-chip bk-chip-new" data-bk="addvar"
              style="--c:${c.color}">＋ 新增變數</button>` : ''}
        </div>`;
    }).join('');
    return `<div class="bk-palette">${cats}</div>`;
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
    const tools = this.readonly ? '' : `
      <span class="bk-tools">
        <button class="bk-tool" data-bk="up" data-id="${b.id}" title="往上">↑</button>
        <button class="bk-tool" data-bk="down" data-id="${b.id}" title="往下">↓</button>
        <button class="bk-tool danger" data-bk="del" data-id="${b.id}" title="刪掉">✕</button>
      </span>`;

    return `
      <div class="bk-blk ${d.kind === 'event' ? 'is-event' : ''}" style="--c:${cat.color}">
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
    if (v && typeof v === 'object' && v.t) {
      return `<span class="bk-sub">${this.renderBlock(v)}</span>`;
    }
    if (a.type === 'bool') {
      const on = this.slot && this.slot.id === b.id && this.slot.arg === name;
      return `<button class="bk-slot ${on ? 'on' : ''}" data-bk="slot" data-id="${b.id}"
        data-arg="${name}">${on ? '放這裡 ▸' : '條件'}</button>`;
    }
    const on = this.slot && this.slot.id === b.id && this.slot.arg === name;
    return `<span class="bk-numwrap ${on ? 'on' : ''}">
      <input class="bk-field bk-num" type="number" data-bk-field data-id="${b.id}"
        data-arg="${name}" data-type="num" value="${Number(v) || 0}"
        ${this.readonly ? 'disabled' : ''} />
      ${this.readonly ? '' : `<button class="bk-slot-mini" data-bk="slot" data-id="${b.id}"
        data-arg="${name}" title="改成放積木(變數、算式)">▸</button>`}
    </span>`;
  }
};
