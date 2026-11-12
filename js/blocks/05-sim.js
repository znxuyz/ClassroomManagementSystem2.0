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

   · **用到廣播就自動變成兩台**。一台 micro:bit 收不到自己發出去的廣播,
     只給一台的話,孩子把程式拼對了也什麼都不會發生,然後開始亂改。
     兩台跑的是**同一支程式**(就像兩片板子燒同一個檔案),
     A 送出去 B 就收到 —— 這和 MakeCode 模擬器看到的是同一件事。
============================================ */

const BlockSim = {
  el: null,
  ctx: null,          // 單機時用這一個;兩台時是 devs[0].ctx
  devs: [],           // [{ ctx, error }]
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
        this.act(b.dataset.sim, b.dataset.btn, b.dataset.dev);
      });
      this._wired = true;
    }
  },

  setProgram(program) {
    this.program = program || [];
    this.reset();
  },

  /* 這支程式有沒有用到廣播 —— 有的話就要兩台 */
  usesRadio() {
    let yes = false;
    walkBlocks(this.program || [], b => {
      if (b.t && b.t.indexOf('radio') === 0) yes = true;
      if (b.t === 'on_radio_number' || b.t === 'on_radio_string'
          || b.t === 'on_radio_value') yes = true;
    });
    return yes;
  },

  reset() {
    const n = this.usesRadio() ? 2 : 1;
    this.devs = Array.from({ length: n }, () => ({
      ctx: BlockVM.newCtx(this.program), error: null
    }));
    this.ctx = this.devs[0].ctx;      // 舊的呼叫端還是看得到
    this.error = null;
    this.devs.forEach((d, i) => this.fireOn(i, { do: 'start' }));
    this.render();
  },

  /* 在第 i 台上做一件事,然後把它發出去的廣播送到別台。
     群組不一樣就收不到 —— 和實機一樣,這一條要留著,
     不然「廣播群組設為」那塊積木就變成裝飾品。 */
  fireOn(i, stepDef) {
    const me = this.devs[i];
    if (!me) return;
    try {
      const r = BlockVM.fire(me.ctx, stepDef);
      me.error = null;
      this.hear(r.sound, me.ctx);
      (r.sent || []).forEach(pk => {
        this.devs.forEach((other, j) => {
          if (j === i || other.ctx.group !== pk.group) return;
          try {
            BlockVM.fire(other.ctx, { do: 'radio', kind: pk.kind,
                                      value: pk.value, key: pk.key });
            other.error = null;
          } catch (e) { other.error = e.message; }
        });
      });
    } catch (e) {
      me.error = e.message;
    }
    this.error = this.devs.map(d => d.error).filter(Boolean)[0] || null;
  },

  act(what, btn, dev) {
    if (!this.devs.length) return;
    const i = Number(dev) || 0;
    if (what === 'start') { this.reset(); return; }
    if (what === 'press') this.fireOn(i, { do: 'press', btn });
    else if (what === 'shake') this.fireOn(i, { do: 'gesture', g: '晃動' });
    else if (what === 'gesture') this.fireOn(i, { do: 'gesture', g: btn });
    else if (what === 'pin') this.fireOn(i, { do: 'pin', pin: btn });
    this.ctx = this.devs[0].ctx;
    this.render();
  },

  /* 螢幕現在的樣子 */
  renderScreen(ctx) {
    const s = ctx ? ctx.screen : null;
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

  /* ---------- 真的發出聲音 ----------
     音效那一類如果只是畫面上寫「播了中音 C」,孩子根本不知道對不對。
     用和蜂巢戰紀同一支發聲器,照音名換成頻率、照速度換成長度。
     一步裡的好幾個音要**依序**播,不然會疊成一團。 */
  hear(list, ctx) {
    if (!list || !list.length || typeof SFX === 'undefined' || !SFX.enabled()) return;
    const tempo = (ctx && ctx.tempo) || 120;
    const vol = Math.max(0, Math.min(1, ((ctx && ctx.volume) || 127) / 255)) * 0.22;
    let at = 0;
    list.forEach(p => {
      const sec = ((p.beats || 1) * 60) / tempo;
      if (p.kind === 'tone') {
        SFX.tone(NOTE_HZ[p.note] || 262, Math.min(1.2, sec),
                 { type: 'triangle', delay: at, vol });
        at += Math.min(1.2, sec);
      } else if (p.kind === 'rest') {
        at += Math.min(1.2, sec);
      } else if (p.kind === 'melody') {
        (MELODY_NOTES[p.name] || [262, 330, 392]).forEach((f, i) => {
          SFX.tone(f, 0.16, { type: 'triangle', delay: at + i * 0.17, vol });
        });
        at += 0.17 * (MELODY_NOTES[p.name] || [0, 0, 0]).length;
      }
    });
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

  renderDevice(i) {
    const d = this.devs[i];
    const heard = (d.ctx && d.ctx.sound || []).map(p =>
      p.kind === 'melody' ? '♪ ' + p.name
        : p.kind === 'rest' ? '𝄽'
        : p.kind === 'stop' ? '■'
        : '♪ ' + p.note).join('  ');
    const tr = this.triggers();
    const vars = d.ctx ? Object.keys(d.ctx.vars) : [];
    const two = this.devs.length > 1;
    return `
      <div class="sim ${two ? 'is-one-of-two' : ''}">
        ${two ? `<div class="sim-name">${i === 0 ? '第 1 台' : '第 2 台'}
          <small>群組 ${d.ctx.group}</small></div>` : ''}
        <div class="sim-board">
          ${this.renderScreen(d.ctx)}
          <button class="sim-btn sim-btn-a" data-sim="press" data-btn="A"
                  data-dev="${i}">A</button>
          <button class="sim-btn sim-btn-b" data-sim="press" data-btn="B"
                  data-dev="${i}">B</button>
        </div>
        <div class="sim-acts">
          <button class="btn btn-ghost btn-small" data-sim="press" data-btn="A+B"
                  data-dev="${i}">A+B</button>
          ${tr.g.map(g => `<button class="btn btn-ghost btn-small"
             data-sim="gesture" data-dev="${i}"
             data-btn="${escapeHtml(g)}">${escapeHtml(g)}</button>`).join('')}
          ${tr.pins.map(p => `<button class="btn btn-ghost btn-small"
             data-sim="pin" data-dev="${i}" data-btn="${p}">碰 ${p}</button>`).join('')}
          ${two ? '' : '<button class="btn btn-ghost btn-small" data-sim="start">重新開機</button>'}
        </div>
        ${heard ? `<div class="sim-sound">${escapeHtml(heard)}</div>` : ''}
        ${d.error ? `<div class="sim-error">${escapeHtml(d.error)}</div>` : ''}
        ${vars.length ? `
          <div class="sim-vars">
            ${vars.map(n => `<span class="sim-var"><b>${escapeHtml(n)}</b>
              ${escapeHtml(String(d.ctx.vars[n]))}</span>`).join('')}
          </div>` : ''}
      </div>`;
  },

  render() {
    if (!this.el || !this.devs.length) return;
    const two = this.devs.length > 1;
    this.el.innerHTML = two ? `
      <div class="sim-pair-note">
        用到廣播了,所以這裡有<strong>兩台</strong> —— 一台收不到自己發出去的廣播。
        兩台跑的是<strong>同一支程式</strong>,在一台上按,另一台就會收到。
      </div>
      <div class="sim-pair">
        ${this.devs.map((d, i) => this.renderDevice(i)).join('')}
      </div>
      <div class="sim-acts sim-acts-all">
        <button class="btn btn-ghost btn-small" data-sim="start">兩台都重新開機</button>
      </div>`
      : this.renderDevice(0);
  }
};
