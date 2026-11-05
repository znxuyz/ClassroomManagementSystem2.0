/* ============================================
   積木挑戰 — 直譯器(把積木真的跑一遍)
   ────────────────────────────────────────────
   判對錯的依據是「程式跑起來的行為」,所以要有一台虛擬的 micro:bit。
   這裡就是那一台。

   ── 幾個刻意的決定 ──

   · **時間是假的。** 「暫停 500 毫秒」不會真的等半秒,只是把虛擬時鐘
     往前撥 500。不然判一題要等好幾秒,而且老師按「執行」時會以為當掉了。

   · **只記錄螢幕上的東西。** 變數叫什麼、用了幾塊積木都不管 ——
     那是學生自己的選擇,不該影響對錯(見 01-defs.js 的說明)。

   · **一定會停。** 學生很容易寫出「當 true 重複」這種無限迴圈,
     所以每一次執行都有步數上限,超過就當成「跑太久」,
     並且**明確告訴他可能是無限迴圈**(這是最常見的卡關,要講清楚)。

   · **重複無限次不是指令,是排程。** 它和事件一樣掛在最外層,
     由這裡的 settle() 每次跑幾圈,而不是真的無限跑下去。
============================================ */

/* 跑一步算一步,超過就停。
   8000 步對課堂上的題目綽綽有餘(重複 100 次裡面放三塊也才 300 步),
   但足以在零點幾秒內攔下無限迴圈。 */
const VM_MAX_STEPS = 8000;

/* 每一個步驟裡,「重複無限次」最多跑幾圈。
   畫面會停在穩定的樣子,不會因為跑的圈數不同而判出不一樣的結果。 */
const VM_FOREVER_ROUNDS = 4;

/* 一次執行裡最多記幾張畫面 —— 閃爍的程式不會把紀錄撐爆 */
const VM_MAX_FRAMES = 40;

function vmError(code, msg) {
  const e = new Error(msg);
  e.vmCode = code;
  return e;
}

const BlockVM = {
  /* 空白畫面的樣子 */
  blankScreen() { return { kind: 'blank' }; },

  screenEq(a, b) {
    if (!a || !b) return a === b;
    return a.kind === b.kind && String(a.value) === String(b.value);
  },

  /* 給人看的描述,學生端與老師端都用這一份 */
  describeScreen(s) {
    if (!s || s.kind === 'blank') return '(空白)';
    if (s.kind === 'number') return String(s.value);
    if (s.kind === 'string') return '「' + s.value + '」';
    return '圖案';
  },

  /* ---------- 執行環境 ---------- */

  newCtx(program) {
    const handlers = { start: [], forever: [], button: {}, gesture: {} };
    (program || []).forEach(b => {
      if (!b || !isEventBlock(b.t)) return;
      if (b.t === 'on_start') handlers.start.push(b.body || []);
      else if (b.t === 'forever') handlers.forever.push(b.body || []);
      else if (b.t === 'on_button') {
        const k = b.btn || 'A';
        (handlers.button[k] = handlers.button[k] || []).push(b.body || []);
      } else if (b.t === 'on_gesture') {
        const k = b.g || '搖動';
        (handlers.gesture[k] = handlers.gesture[k] || []).push(b.body || []);
      }
    });

    return {
      vars: {},
      screen: this.blankScreen(),
      time: 0,
      steps: 0,
      buttons: { A: false, B: false },
      frames: [],        // 畫面變過的樣子(連續重複的只記一次)
      handlers,
      /* 隨機數要可以重現,不然同一支程式判兩次會得到不同結果。
         用固定種子的簡單亂數就夠了。 */
      seed: 20260101
    };
  },

  rand(ctx, from, to) {
    // xorshift,夠亂又完全可重現
    let x = ctx.seed |= 0;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    ctx.seed = x;
    const lo = Math.min(from, to), hi = Math.max(from, to);
    return lo + (Math.abs(x) % (hi - lo + 1));
  },

  setScreen(ctx, screen) {
    if (this.screenEq(ctx.screen, screen)) return;
    ctx.screen = screen;
    if (ctx.frames.length < VM_MAX_FRAMES) ctx.frames.push(screen);
  },

  step(ctx) {
    if (++ctx.steps > VM_MAX_STEPS) {
      throw vmError('too-long',
        '程式跑太久停不下來,可能有無限迴圈 —— 檢查看看「當…重複」裡面有沒有東西會讓它結束。');
    }
  },

  /* ---------- 運算式 ---------- */

  evalExpr(e, ctx) {
    this.step(ctx);
    if (e === null || e === undefined) return 0;
    if (typeof e === 'number') return e;
    if (typeof e === 'string') return e;
    if (typeof e === 'boolean') return e;

    switch (e.t) {
      case 'num': return Number(e.v) || 0;
      case 'str': return String(e.v == null ? '' : e.v);
      case 'var': return ctx.vars[e.name] === undefined ? 0 : ctx.vars[e.name];
      case 'op': {
        const a = Number(this.evalExpr(e.a, ctx)) || 0;
        const b = Number(this.evalExpr(e.b, ctx)) || 0;
        if (e.op === '−') return a - b;
        if (e.op === '×') return a * b;
        if (e.op === '÷') return b === 0 ? 0 : a / b;
        return a + b;
      }
      case 'cmp': {
        const a = this.evalExpr(e.a, ctx), b = this.evalExpr(e.b, ctx);
        switch (e.op) {
          case '≠': return a !== b;
          case '<': return a < b;
          case '≤': return a <= b;
          case '>': return a > b;
          case '≥': return a >= b;
          default:  return a === b;
        }
      }
      case 'logic': {
        const a = !!this.evalExpr(e.a, ctx);
        if (e.op === '或') return a || !!this.evalExpr(e.b, ctx);
        return a && !!this.evalExpr(e.b, ctx);
      }
      case 'random':
        return this.rand(ctx, Number(this.evalExpr(e.from, ctx)) || 0,
                              Number(this.evalExpr(e.to, ctx)) || 0);
      case 'btn_down':
        return !!ctx.buttons[e.btn === 'B' ? 'B' : 'A'];
      default:
        return 0;
    }
  },

  /* ---------- 指令 ---------- */

  exec(list, ctx) {
    (list || []).forEach(b => {
      if (!b || !b.t) return;
      this.step(ctx);
      switch (b.t) {
        case 'show_number':
          this.setScreen(ctx, { kind: 'number', value: Number(this.evalExpr(b.v, ctx)) || 0 });
          ctx.time += 400;      // 數字會捲過去,實機上本來就要一點時間
          break;
        case 'show_string':
          this.setScreen(ctx, { kind: 'string', value: String(b.v == null ? '' : b.v) });
          ctx.time += 600;
          break;
        case 'show_icon':
          this.setScreen(ctx, { kind: 'leds', value: LED_ICONS[b.icon] || LED_BLANK });
          ctx.time += 400;
          break;
        case 'show_leds':
          this.setScreen(ctx, { kind: 'leds', value: b.grid || LED_BLANK });
          ctx.time += 400;
          break;
        case 'clear':
          this.setScreen(ctx, this.blankScreen());
          break;
        case 'pause':
          ctx.time += Math.max(0, Number(this.evalExpr(b.ms, ctx)) || 0);
          break;
        case 'set_var':
          if (b.name) ctx.vars[b.name] = this.evalExpr(b.v, ctx);
          break;
        case 'change_var':
          if (b.name) {
            const cur = ctx.vars[b.name] === undefined ? 0 : Number(ctx.vars[b.name]) || 0;
            ctx.vars[b.name] = cur + (Number(this.evalExpr(b.v, ctx)) || 0);
          }
          break;
        case 'if':
          if (this.evalExpr(b.cond, ctx)) this.exec(b.body, ctx);
          else this.exec(b.elseBody, ctx);
          break;
        case 'repeat': {
          const n = Math.max(0, Math.min(500, Math.floor(Number(this.evalExpr(b.n, ctx)) || 0)));
          for (let i = 0; i < n; i++) { this.step(ctx); this.exec(b.body, ctx); }
          break;
        }
        case 'while': {
          let guard = 0;
          while (this.evalExpr(b.cond, ctx)) {
            this.step(ctx);
            this.exec(b.body, ctx);
            if (++guard > 500) {
              throw vmError('too-long',
                '「當…重複」停不下來,這是無限迴圈 ——'
                + '裡面要有東西讓那個條件變成不成立,它才會結束。');
            }
          }
          break;
        }
        default:
          break;     // 運算式積木被放到指令的位置:當作什麼都沒做
      }
    });
  },

  /* 把這一輪的事件跑完,並讓「重複無限次」轉幾圈,
     畫面才會停在它該停的樣子。 */
  settle(ctx) {
    for (let i = 0; i < VM_FOREVER_ROUNDS; i++) {
      ctx.handlers.forever.forEach(body => this.exec(body, ctx));
    }
  },

  /* ---------- 一步一步照劇本跑 ----------
     劇本是一串動作:
       { do: 'start' }                   按下重置(跑「當啟動時」)
       { do: 'press', btn: 'A' }         按一下按鈕
       { do: 'shake' }                   搖一下
       { do: 'gesture', g: '朝上' }
       { do: 'wait' }                    什麼都不做,只是讓它繼續跑
     回傳每一步之後「畫面變成什麼樣子」。 */
  /* 跑一步。學生按下模擬器上的按鈕時用的也是這一支 ——
     「自己玩」和「判對錯」走同一條路,才不會出現
     「我自己試明明是對的,按檢查卻說錯」。 */
  fire(ctx, stepDef) {
    ctx.frames = [];
    switch (stepDef.do) {
      case 'start':
        ctx.vars = {};
        ctx.screen = this.blankScreen();
        ctx.handlers.start.forEach(body => this.exec(body, ctx));
        break;
      case 'press': {
        const btn = stepDef.btn || 'A';
        if (btn === 'A+B') { ctx.buttons.A = true; ctx.buttons.B = true; }
        else ctx.buttons[btn] = true;
        (ctx.handlers.button[btn] || []).forEach(body => this.exec(body, ctx));
        ctx.buttons.A = false; ctx.buttons.B = false;
        break;
      }
      case 'shake':
        (ctx.handlers.gesture['搖動'] || []).forEach(body => this.exec(body, ctx));
        break;
      case 'gesture':
        (ctx.handlers.gesture[stepDef.g] || []).forEach(body => this.exec(body, ctx));
        break;
      default:
        break;
    }
    this.settle(ctx);
    return { frames: ctx.frames.slice(), screen: ctx.screen };
  },

  runScript(program, script) {
    const ctx = this.newCtx(program);
    const trace = [];
    let error = null;

    try {
      (script || []).forEach(stepDef => { trace.push(this.fire(ctx, stepDef)); });
    } catch (e) {
      error = { code: e.vmCode || 'error', message: e.message };
    }

    return { trace, error, vars: ctx.vars, steps: ctx.steps, time: ctx.time };
  }
};
