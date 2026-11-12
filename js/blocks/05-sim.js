/* ============================================
   積木冒險 — 模擬器(那一台假的 micro:bit)
   ────────────────────────────────────────────
   孩子要先**看到自己的程式在動**,才有辦法自己找出哪裡不對。
   所以按「檢查」之前,他可以先在這裡按按鈕、搖一搖,看螢幕有什麼反應。

   刻意的決定:

   · 「自己玩」和「判對錯」走的是**同一支直譯器**(BlockVM.fire)。
     兩邊用不同的程式碼,就會出現「我自己試明明是對的,按檢查卻說錯」——
     那種事會讓孩子完全不信任這個系統。

   · 數字與文字不做跑馬燈。真的 micro:bit 是一格一格捲過去的,
     但那樣要等好幾秒才看得到結果;這裡直接把數字顯示在螢幕中間,
     看得更清楚。圖案則是真的 5×5。

   · 程式一改,模擬器就自動重新開機 —— 否則畫面停在舊程式的結果,
     孩子會以為是自己改壞了。
============================================ */

const BlockSim = {
  el: null,
  ctx: null,
  program: [],
  error: null,

  mount(el, program) {
    this.el = typeof el === 'string' ? document.getElementById(el) : el;
    this.setProgram(program);
    if (!this._wired) {
      document.addEventListener('click', e => {
        if (!this.el || !this.el.contains(e.target)) return;
        const b = e.target.closest('[data-sim]');
        if (!b) return;
        this.act(b.dataset.sim, b.dataset.btn);
      });
      this._wired = true;
    }
  },

  setProgram(program) {
    this.program = program || [];
    this.reset();
  },

  reset() {
    this.ctx = BlockVM.newCtx(this.program);
    this.error = null;
    this.act('start');
  },

  act(what, btn) {
    if (!this.ctx) return;
    try {
      if (what === 'start') {
        this.ctx = BlockVM.newCtx(this.program);
        BlockVM.fire(this.ctx, { do: 'start' });
      } else if (what === 'press') {
        BlockVM.fire(this.ctx, { do: 'press', btn });
      } else if (what === 'shake') {
        BlockVM.fire(this.ctx, { do: 'gesture', g: '晃動' });
      } else if (what === 'gesture') {
        BlockVM.fire(this.ctx, { do: 'gesture', g: btn });
      } else if (what === 'pin') {
        BlockVM.fire(this.ctx, { do: 'pin', pin: btn });
      }
      this.error = null;
    } catch (e) {
      this.error = e.message;
    }
    this.render();
  },

  /* 螢幕現在的樣子 */
  renderScreen() {
    const s = this.ctx ? this.ctx.screen : null;
    if (s && s.kind === 'leds') {
      const g = String(s.value || LED_BLANK);
      return `<div class="sim-leds">${Array.from({ length: 25 }, (_, i) =>
        `<span class="sim-led ${g[i] === '1' ? 'on' : ''}"></span>`).join('')}</div>`;
    }
    if (s && (s.kind === 'number' || s.kind === 'string')) {
      const txt = String(s.value);
      return `<div class="sim-text ${txt.length > 3 ? 'is-long' : ''}">${escapeHtml(txt)}</div>`;
    }
    return `<div class="sim-leds">${Array.from({ length: 25 },
      () => '<span class="sim-led"></span>').join('')}</div>`;
  },

  /* 這支程式用到哪些姿勢、哪些引腳 —— 只長出按得到的那幾顆。
     全部列出來的話,一排按鈕裡有一大半按了什麼事都不會發生,
     孩子會以為是自己拼錯了。 */
  triggers() {
    const g = [], pins = [];
    walkBlocks(this.program || [], b => {
      if (b.t === 'on_gesture' && !g.includes(b.g)) g.push(b.g);
      if (b.t === 'on_pin' && !pins.includes(b.pin)) pins.push(b.pin);
    });
    if (!g.length) g.push('晃動');      // 沒用到姿勢時仍給一顆,他可以先試試看
    return { g, pins };
  },

  render() {
    if (!this.el) return;
    const vars = this.ctx ? Object.keys(this.ctx.vars) : [];
    const tr = this.triggers();
    this.el.innerHTML = `
      <div class="sim">
        <div class="sim-board">
          ${this.renderScreen()}
          <button class="sim-btn sim-btn-a" data-sim="press" data-btn="A">A</button>
          <button class="sim-btn sim-btn-b" data-sim="press" data-btn="B">B</button>
        </div>
        <div class="sim-acts">
          <button class="btn btn-ghost btn-small" data-sim="press" data-btn="A+B">A+B</button>
          ${tr.g.map(g => `<button class="btn btn-ghost btn-small"
             data-sim="gesture" data-btn="${escapeHtml(g)}">${escapeHtml(g)}</button>`).join('')}
          ${tr.pins.map(p => `<button class="btn btn-ghost btn-small"
             data-sim="pin" data-btn="${p}">碰 ${p}</button>`).join('')}
          <button class="btn btn-ghost btn-small" data-sim="start">重新開機</button>
        </div>
        ${this.error ? `<div class="sim-error">${escapeHtml(this.error)}</div>` : ''}
        ${vars.length ? `
          <div class="sim-vars">
            ${vars.map(n => `<span class="sim-var"><b>${escapeHtml(n)}</b>
              ${escapeHtml(String(this.ctx.vars[n]))}</span>`).join('')}
          </div>` : ''}
      </div>`;
  }
};
