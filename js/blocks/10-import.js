/* ============================================
   從 MakeCode 匯入 —— 把 JavaScript 轉成積木
   ────────────────────────────────────────────
   老師帶五個班,一題一題用滑鼠拼解答太慢。
   他本來就會在 MakeCode 裡把答案做出來,那就讓他直接帶過來。

   ── 為什麼吃的是 JavaScript,不是 .hex ──
   MakeCode 的 .hex 檔裡**確實**夾著原始碼,但夾的就是這份 main.ts
   (以及一份 Blockly XML)。也就是說,不管從哪一條路進來,
   最後都要把這段文字轉成積木 —— 這個檔案就是那一段。
   .hex 的拆封只是外面一層殼(見 BlockImport.fromHex)。

   在 MakeCode 編輯器上方把「積木」切成「JavaScript」,
   整段複製貼過來就可以了。

   ── 只認得我們有的那 22 塊積木 ──
   認不得的那一行**不會被默默丟掉**,會收進 warnings 回報給老師 ——
   默默丟掉最糟:老師以為匯進來了,學生做出來卻判不過。

   ── 為什麼自己寫剖析器 ──
   這裡要吃的是 MakeCode 產生的程式碼,格式固定、用到的語法很窄
   (事件、指派、if、for、while、幾個內建函式),
   所以一個小的遞迴下降剖析器就夠了,不需要搬整個 TypeScript 編譯器進來。
   不在這個範圍裡的寫法一律老實說「這一行看不懂」。
============================================ */

const BlockImport = {

  /* ---------- 詞法 ----------
     只切出我們需要的東西:字串、數字、識別字、符號。
     註解與換行直接丟掉(換行在 MakeCode 的輸出裡沒有語意)。 */
  lex(src) {
    const out = [];
    let i = 0;
    const s = String(src || '');
    const idStart = c => /[A-Za-z_$一-鿿]/.test(c);
    const idPart = c => /[A-Za-z0-9_$一-鿿]/.test(c);

    while (i < s.length) {
      const c = s[i];
      if (c === ' ' || c === '\t' || c === '\r' || c === '\n') { i++; continue; }
      // 註解
      if (c === '/' && s[i + 1] === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
      if (c === '/' && s[i + 1] === '*') {
        i += 2;
        while (i < s.length && !(s[i] === '*' && s[i + 1] === '/')) i++;
        i += 2; continue;
      }
      // 字串(含樣板字串 —— showLeds 用的就是它)
      if (c === '"' || c === "'" || c === '`') {
        const q = c; let v = ''; i++;
        while (i < s.length && s[i] !== q) {
          if (s[i] === '\\' && q !== '`') { v += s[i + 1]; i += 2; }
          else { v += s[i]; i++; }
        }
        i++;
        out.push({ k: q === '`' ? 'tpl' : 'str', v });
        continue;
      }
      // 數字
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(s[i + 1] || ''))) {
        let j = i;
        while (j < s.length && /[0-9.]/.test(s[j])) j++;
        out.push({ k: 'num', v: Number(s.slice(i, j)) });
        i = j; continue;
      }
      // 識別字
      if (idStart(c)) {
        let j = i;
        while (j < s.length && idPart(s[j])) j++;
        out.push({ k: 'id', v: s.slice(i, j) });
        i = j; continue;
      }
      // 符號:長的先比,否則 >= 會被切成 > 和 =
      const three = s.substr(i, 3);
      const two = s.substr(i, 2);
      if (['===', '!=='].includes(three)) { out.push({ k: 'op', v: three }); i += 3; continue; }
      if (['==', '!=', '<=', '>=', '&&', '||', '+=', '-=', '*=', '/=', '++', '--']
          .includes(two)) { out.push({ k: 'op', v: two }); i += 2; continue; }
      out.push({ k: 'op', v: c });
      i++;
    }
    return out;
  },

  /* ---------- 剖析 ----------
     回傳 { program, warnings }。warnings 是「看不懂的那幾行」,
     一定要交回去讓老師看到。 */
  parse(src) {
    const toks = this.lex(src);
    let p = 0;
    const warnings = [];

    const peek = (n) => toks[p + (n || 0)] || { k: 'eof', v: '' };
    const at = (k, v) => peek().k === k && (v === undefined || peek().v === v);
    const next = () => toks[p++] || { k: 'eof', v: '' };
    const eat = (k, v) => { if (at(k, v)) { p++; return true; } return false; };
    const warn = m => { if (warnings.length < 20 && !warnings.includes(m)) warnings.push(m); };

    /* 跳過一個看不懂的語句:往前走到這一層的 ; 或 } 為止,
       不然一個看不懂的地方會把後面全部帶壞。 */
    const skipStatement = () => {
      let depth = 0;
      while (p < toks.length) {
        const t = peek();
        if (t.k === 'op' && '([{'.includes(t.v)) depth++;
        if (t.k === 'op' && ')]}'.includes(t.v)) {
          if (depth === 0) return;
          depth--;
        }
        if (t.k === 'op' && t.v === ';' && depth === 0) { p++; return; }
        p++;
      }
    };

    /* ---- 運算式 ---- */
    // 數字/變數/括號/函式呼叫
    const primary = () => {
      if (eat('op', '(')) { const e = expr(); eat('op', ')'); return e; }
      if (eat('op', '-')) {
        const e = primary();
        return typeof e === 'number' ? -e : { t: 'op', a: 0, op: '−', b: e };
      }
      if (eat('op', '!')) { primary(); warn('「!」(不是)還沒有對應的積木'); return null; }
      const t = next();
      if (t.k === 'num') return t.v;
      if (t.k === 'str' || t.k === 'tpl') return { t: 'str', v: t.v };
      if (t.k === 'id') {
        // 可能是 a.b.c(...) 這種呼叫
        let name = t.v;
        while (at('op', '.')) { p++; name += '.' + (next().v || ''); }
        if (at('op', '(')) return this.callExpr(name, args(), warn);
        if (name === 'true') return true;
        if (name === 'false') return false;
        // Button.A / Gesture.Shake 這種列舉,原樣交給呼叫端判斷
        if (name.indexOf('.') > 0) return { t: '_enum', v: name };
        return { t: 'var', name };
      }
      warn(`看不懂的寫法:${t.v}`);
      return null;
    };

    const args = () => {
      const list = [];
      eat('op', '(');
      if (eat('op', ')')) return list;
      for (;;) {
        if (at('id', 'function')) { list.push({ t: '_fn', body: fnBody() }); }
        else list.push(expr());
        if (eat('op', ',')) continue;
        eat('op', ')');
        return list;
      }
    };

    const fnBody = () => {
      eat('id', 'function');
      eat('op', '('); eat('op', ')');
      return block();
    };

    const MUL = { '*': '×', '/': '÷' };
    const ADD = { '+': '+', '-': '−' };
    const CMP = { '==': '=', '===': '=', '!=': '≠', '!==': '≠',
                  '<': '<', '<=': '≤', '>': '>', '>=': '≥' };

    const mul = () => {
      let a = primary();
      while (at('op', '*') || at('op', '/')) {
        const op = next().v;
        a = { t: 'op', a, op: MUL[op], b: primary() };
      }
      return a;
    };
    const add = () => {
      let a = mul();
      while (at('op', '+') || at('op', '-')) {
        const op = next().v;
        a = { t: 'op', a, op: ADD[op], b: mul() };
      }
      return a;
    };
    const cmp = () => {
      let a = add();
      while (peek().k === 'op' && CMP[peek().v] !== undefined) {
        const op = next().v;
        a = { t: 'cmp', a, op: CMP[op], b: add() };
      }
      return a;
    };
    const expr = () => {
      let a = cmp();
      while (at('op', '&&') || at('op', '||')) {
        const op = next().v;
        a = { t: 'logic', a, op: op === '&&' ? '且' : '或', b: cmp() };
      }
      return a;
    };

    /* ---- 語句 ---- */
    const block = () => {
      const out = [];
      eat('op', '{');
      while (p < toks.length && !at('op', '}')) {
        const before = p;
        const st = statement();
        if (st) out.push(...(Array.isArray(st) ? st : [st]));
        if (p === before) p++;          // 保險:絕對不原地打轉
      }
      eat('op', '}');
      return out;
    };

    const statement = () => {
      if (eat('op', ';')) return null;

      // let x = 0 / const x = 0
      if (at('id', 'let') || at('id', 'var') || at('id', 'const')) {
        p++;
        const name = next().v;
        if (eat('op', '=')) {
          const v = expr(); eat('op', ';');
          return { t: 'set_var', name: String(name), v };
        }
        eat('op', ';');
        return { t: 'set_var', name: String(name), v: 0 };
      }

      // if / else
      if (at('id', 'if')) {
        p++; eat('op', '(');
        const cond = expr();
        eat('op', ')');
        const node = { t: 'if', cond, body: block() };
        if (at('id', 'else')) {
          p++;
          // else if 也接得起來:把它整個當成 else 裡的一塊
          node.elseBody = at('id', 'if') ? [statement()].flat().filter(Boolean) : block();
        }
        return node;
      }

      // for (let i = 0; i < n; i++)  →  重複 n 次
      if (at('id', 'for')) {
        p++; eat('op', '(');
        let n = null;
        // 只認 MakeCode 產生的那一種計數迴圈
        if (at('id', 'let') || at('id', 'var')) {
          p++; const v = next().v; eat('op', '='); const from = expr(); eat('op', ';');
          const c = expr(); eat('op', ';');
          while (p < toks.length && !at('op', ')')) p++;
          eat('op', ')');
          const zero = (from === 0 || from === undefined);
          if (zero && c && c.t === 'cmp' && c.a && c.a.t === 'var' && c.a.name === v
              && (c.op === '<' || c.op === '≤')) {
            n = c.op === '<' ? c.b : { t: 'op', a: c.b, op: '+', b: 1 };
          }
          const body = block();
          if (n === null) {
            warn('這個 for 迴圈不是「重複幾次」的形狀,已改成重複 4 次');
            n = 4;
          }
          return { t: 'repeat', n, body };
        }
        while (p < toks.length && !at('op', ')')) p++;
        eat('op', ')');
        warn('看不懂的 for 迴圈');
        return { t: 'repeat', n: 4, body: block() };
      }

      if (at('id', 'while')) {
        p++; eat('op', '(');
        const cond = expr(); eat('op', ')');
        return { t: 'while', cond, body: block() };
      }

      // 指派 / 複合指派 / ++ --
      if (peek().k === 'id' && peek(1).k === 'op'
          && ['=', '+=', '-=', '++', '--'].includes(peek(1).v)) {
        const name = String(next().v);
        const op = next().v;
        if (op === '++' || op === '--') {
          eat('op', ';');
          return { t: 'change_var', name, v: op === '++' ? 1 : -1 };
        }
        const v = expr(); eat('op', ';');
        if (op === '=') return { t: 'set_var', name, v };
        if (op === '-=') {
          return { t: 'change_var', name,
                   v: typeof v === 'number' ? -v : { t: 'op', a: 0, op: '−', b: v } };
        }
        return { t: 'change_var', name, v };
      }

      // 其他:一定是函式呼叫
      if (peek().k === 'id') {
        let name = String(next().v);
        while (at('op', '.')) { p++; name += '.' + (next().v || ''); }
        if (!at('op', '(')) { skipStatement(); warn(`看不懂這一行:${name}`); return null; }
        const a = args();
        eat('op', ';');
        return this.callStatement(name, a, warn);
      }

      const t = next();
      warn(`看不懂的寫法:${t.v}`);
      skipStatement();
      return null;
    };

    /* 最外層:事件處理器各自成為一塊帽子積木,
       **其他語句全部收進「當啟動時」** —— MakeCode 裡放在最外層的程式碼
       就是開機時跑一次,這和「當啟動時」是同一件事。 */
    const tops = [];
    const loose = [];
    while (p < toks.length) {
      const before = p;
      const st = statement();
      [].concat(st || []).filter(Boolean).forEach(b => {
        if (b.t === 'on_start' || b.t === 'forever'
            || b.t === 'on_button' || b.t === 'on_gesture') tops.push(b);
        else loose.push(b);
      });
      if (p === before) p++;
    }

    const program = [];
    if (loose.length) {
      const existing = tops.find(b => b.t === 'on_start');
      if (existing) existing.body = loose.concat(existing.body || []);
      else program.push({ t: 'on_start', body: loose });
    }
    program.push(...tops);

    return { program, warnings };
  },

  /* ---------- 函式呼叫 → 積木 ---------- */
  ICONS: {
    Heart: '愛心', SmallHeart: '愛心', Happy: '笑臉', Smile: '笑臉',
    Sad: '哭臉', Confused: '哭臉', Yes: '打勾', No: '打叉',
    ArrowNorth: '箭頭上', ArrowSouth: '箭頭下'
  },

  callStatement(name, a, warn) {
    const fn = name.split('.').pop();
    const body = (x) => (x && x.t === '_fn') ? x.body : [];

    switch (fn) {
      case 'showNumber':  return { t: 'show_number', v: a[0] === undefined ? 0 : a[0] };
      case 'showString':  return { t: 'show_string', v: this.asText(a[0]) };
      case 'clearScreen': return { t: 'clear' };
      case 'pause':       return { t: 'pause', ms: a[0] === undefined ? 500 : a[0] };
      case 'forever':     return { t: 'forever', body: body(a[0]) };

      case 'showIcon': {
        const key = String((a[0] && a[0].v) || '').split('.').pop();
        const icon = this.ICONS[key];
        if (!icon) { warn(`還沒有「${key}」這個圖示,已改用愛心`); }
        return { t: 'show_icon', icon: icon || '愛心' };
      }

      case 'showLeds': {
        const grid = this.ledsFrom(a[0]);
        if (!grid) { warn('看不懂這個 LED 圖樣'); return { t: 'show_leds', grid: LED_BLANK }; }
        return { t: 'show_leds', grid };
      }

      case 'onButtonPressed': {
        const btn = { A: 'A', B: 'B', AB: 'A+B' }[
          String((a[0] && a[0].v) || '').split('.').pop()] || 'A';
        return { t: 'on_button', btn, body: body(a[1]) };
      }

      case 'onGesture': {
        const g = { Shake: '搖動', LogoUp: '朝上', LogoDown: '朝下',
                    ScreenUp: '朝上', ScreenDown: '朝下' }[
          String((a[0] && a[0].v) || '').split('.').pop()];
        if (!g) { warn('還沒有這個手勢的積木,已改用「搖動」'); }
        return { t: 'on_gesture', g: g || '搖動', body: body(a[1]) };
      }

      /* MakeCode 的 on_start 在 JavaScript 裡沒有對應的函式
         (最外層就是開機),但有些人會自己包一層 */
      case 'onStart': return { t: 'on_start', body: body(a[0]) };

      default:
        warn(`還沒有「${name}」這塊積木`);
        return null;
    }
  },

  callExpr(name, a, warn) {
    const fn = name.split('.').pop();
    switch (fn) {
      case 'buttonIsPressed': {
        const btn = { A: 'A', B: 'B' }[
          String((a[0] && a[0].v) || '').split('.').pop()] || 'A';
        return { t: 'btn_down', btn };
      }
      case 'randint':
      case 'randomRange':
        return { t: 'random', from: a[0] === undefined ? 0 : a[0],
                 to: a[1] === undefined ? 10 : a[1] };
      case 'abs':
      case 'min':
      case 'max':
      default:
        warn(`還沒有「${name}()」這塊積木`);
        return null;
    }
  },

  asText(v) {
    if (v && v.t === 'str') return v.v;
    if (typeof v === 'number') return String(v);
    return v === undefined ? '' : v;
  },

  /* showLeds 的樣板字串:
       . # . # .
       # # # # #
     轉成 25 個 0/1。# 或任何非 . 的字都算亮。 */
  ledsFrom(v) {
    if (!v || (v.t !== 'str' && typeof v !== 'string')) return null;
    const raw = typeof v === 'string' ? v : v.v;
    const cells = String(raw).replace(/[\s\n\r]/g, '');
    if (cells.length < 25) return null;
    return cells.slice(0, 25).split('').map(c => (c === '.' || c === '0') ? '0' : '1').join('');
  },

  /* ---------- 從 .hex 拆出原始碼 ----------
     MakeCode 把專案的原始碼夾在 .hex 檔裡。拆出來之後走的還是上面那條路
     —— 夾的就是同一份 main.ts。

     夾法有好幾代,所以這裡不賭單一一種:先找得出 JSON 的話用 JSON,
     找不到就退回「整個檔案裡撈 main.ts 那一段」。
     兩種都失敗就老實回 null,讓畫面請老師改用貼上 JavaScript。 */
  fromHex(text) {
    const s = String(text || '');

    // 1) 原始碼有時直接以 JSON 夾在檔尾
    const jsonHit = /\{[^{}]*"main\.ts"\s*:\s*"/.exec(s);
    if (jsonHit) {
      const tail = s.slice(jsonHit.index);
      const end = tail.lastIndexOf('}');
      try {
        const obj = JSON.parse(tail.slice(0, end + 1));
        if (obj && obj['main.ts']) return String(obj['main.ts']);
      } catch (e) { /* 換下一種 */ }
    }

    // 2) base64 夾層:把看起來像 base64 的長片段解開來找 main.ts
    const b64 = s.match(/[A-Za-z0-9+/]{100,}={0,2}/g) || [];
    for (const chunk of b64) {
      let dec = '';
      try { dec = this.b64(chunk); } catch (e) { continue; }
      const m = /"main\.ts"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(dec);
      if (m) { try { return JSON.parse('"' + m[1] + '"'); } catch (e) { return m[1]; } }
    }

    return null;
  },

  b64(str) {
    if (typeof atob === 'function') {
      const bin = atob(str.replace(/[^A-Za-z0-9+/=]/g, ''));
      // MakeCode 夾的是 UTF-8,直接讀會變亂碼
      const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
      return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    }
    return Buffer.from(str, 'base64').toString('utf8');
  }
};

/* ============================================
   匯入畫面(老師端)
   ────────────────────────────────────────────
   一個對話框做三件事:
     1. 把 MakeCode 的程式帶進來(貼上,或把檔案丟進來)
     2. **當場試跑一次**再建立 —— 轉得出來不代表跑得對,
        先跑過再按下去,老師才不會把一題壞掉的題目發給全班
     3. 一次加到好幾個班(他帶五個班,一班一班重做太慢)
============================================ */
const BlockImportUI = {
  src: '',
  parsed: null,
  classes: [],       // 要同時加進去的其他班級 id

  open() {
    this.src = '';
    this.parsed = null;
    this.classes = [];
    let host = document.getElementById('bkImportModal');
    if (!host) {
      host = document.createElement('div');
      host.id = 'bkImportModal';
      host.className = 'modal-overlay';
      document.body.appendChild(host);
    }
    host.classList.add('active');
    this.render();
  },

  close() {
    const host = document.getElementById('bkImportModal');
    if (host) { host.classList.remove('active'); host.innerHTML = ''; }
  },

  /* 貼上或丟檔案之後都走這裡 */
  setSource(text, fileName) {
    const s = String(text || '');
    /* .hex 要先拆封。拆不出來就直說 —— 不要讓老師對著一個
       「匯入了 0 塊積木」的畫面猜原因。 */
    if (/^:[0-9A-Fa-f]{8}/.test(s.trim()) || /\.hex$/i.test(fileName || '')) {
      const inner = BlockImport.fromHex(s);
      if (!inner) {
        this.src = '';
        this.parsed = { program: [], warnings: [
          '這個 .hex 檔裡找不到原始碼。請在 MakeCode 上方把「積木」切到' +
          '「JavaScript」,整段複製貼進來 —— 那是同一份東西。'] };
        this.render();
        return;
      }
      this.src = inner;
    } else {
      this.src = s;
    }
    this.parsed = BlockImport.parse(this.src);
    this.render();
  },

  onFile(input) {
    const f = input.files && input.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => this.setSource(r.result, f.name);
    r.readAsText(f);
  },

  onDrop(ev) {
    ev.preventDefault();
    const f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => this.setSource(r.result, f.name);
    r.readAsText(f);
  },

  toggleClass(id) {
    const i = this.classes.indexOf(id);
    if (i >= 0) this.classes.splice(i, 1); else this.classes.push(id);
    this.render();
  },

  /* 試跑:用轉出來的解答自己當考卷跑一次。
     不會過的話多半是用到了還沒有的積木,那種題目發出去學生永遠做不對。 */
  trial() {
    if (!this.parsed || !this.parsed.program.length) return null;
    try {
      const paper = BlockJudge.compile({ solution: this.parsed.program });
      if (paper.error) return { ok: false, why: paper.error };
      const r = BlockJudge.runCompiled(paper, this.parsed.program);
      return { ok: r.pass, why: r.pass ? '' : BlockJudge.explain(r) };
    } catch (e) {
      return { ok: false, why: e.message };
    }
  },

  render() {
    const host = document.getElementById('bkImportModal');
    if (!host) return;
    const p = this.parsed;
    const n = p ? blockCount(p.program) : 0;
    const t = this.trial();
    const others = (state.myClasses || []).filter(c => (c.id || c.classId) !== state.classId);

    host.innerHTML = `
      <div class="modal bk-import">
        <div class="modal-title">從 MakeCode 匯入</div>
        <div class="modal-subtitle">
          在 MakeCode 上方把「積木」切到「JavaScript」,整段複製貼進來
        </div>

        <div class="bk-import-drop" ondragover="event.preventDefault()"
             ondrop="BlockImportUI.onDrop(event)">
          把 <strong>.hex</strong> 或 <strong>.ts</strong> 檔丟進來,或
          <label class="bk-import-file">選擇檔案
            <input type="file" accept=".hex,.ts,.js,.txt"
                   onchange="BlockImportUI.onFile(this)" />
          </label>
        </div>

        <label class="field">
          <span class="field-label">MakeCode 的 JavaScript</span>
          <textarea id="bkImportSrc" class="rule-editor-input bk-import-src"
                    rows="10" spellcheck="false"
                    placeholder="input.onGesture(Gesture.Shake, function () {&#10;    步數 += 1&#10;    basic.showNumber(步數)&#10;})"
                    onchange="BlockImportUI.setSource(this.value)"
                    >${escapeHtml(this.src)}</textarea>
        </label>
        <div class="bk-import-acts">
          <button class="btn btn-ghost btn-small"
                  onclick="BlockImportUI.setSource(document.getElementById('bkImportSrc').value)"
            >看看轉出來長什麼樣</button>
        </div>

        ${p ? `
          <div class="bk-import-result ${n && t && t.ok ? 'ok' : 'bad'}">
            ${n
              ? `轉出 <strong>${n}</strong> 塊積木 · ${
                  t && t.ok ? '試跑通過 ✓' : '試跑沒過:' + escapeHtml((t && t.why) || '')}`
              : '一塊都沒轉出來'}
          </div>
          ${p.warnings.length ? `
            <ul class="bk-import-warn">
              ${p.warnings.map(w => `<li>${escapeHtml(w)}</li>`).join('')}
            </ul>
            <div class="bk-import-note">
              上面這幾項<strong>沒有被匯進來</strong>。要嘛改用現有的積木,
              要嘛把那一段從題目裡拿掉 —— 否則學生永遠做不出一樣的結果。
            </div>` : ''}
        ` : ''}

        <div class="field-row">
          <label class="field grow">
            <span class="field-label">題目名稱<span class="req">*</span></span>
            <input type="text" id="bkImportName" class="rule-editor-input"
                   placeholder="例:計步器" />
          </label>
          <label class="field narrow">
            <span class="field-label">完成得分</span>
            <input type="number" id="bkImportPoints" class="rule-editor-input"
                   value="5" min="0" max="20" />
          </label>
        </div>
        <label class="field">
          <span class="field-label">功能敘述(學生看到的題目)</span>
          <input type="text" id="bkImportSpec" class="rule-editor-input"
                 placeholder="例:開機時步數歸零並顯示,搖一下加一,A+B 歸零" />
        </label>

        ${others.length ? `
          <div class="bk-import-classes">
            <div class="field-label">同時加到其他班級</div>
            ${others.map(c => {
              const id = c.id || c.classId;
              return `<label class="bk-import-cls">
                <input type="checkbox" ${this.classes.includes(id) ? 'checked' : ''}
                       onchange="BlockImportUI.toggleClass('${id}')" />
                ${escapeHtml(c.className || id)}</label>`;
            }).join('')}
            <div class="bk-import-note">
              勾起來的班會直接收到同一題(草稿狀態),你再各自決定什麼時候開放。
            </div>
          </div>` : ''}

        <div class="modal-actions">
          <button class="btn btn-ghost" onclick="BlockImportUI.close()">取消</button>
          <button class="btn btn-primary" ${n ? '' : 'disabled'}
                  onclick="BlockImportUI.create()">建立題目</button>
        </div>
      </div>`;
  },

  async create() {
    const p = this.parsed;
    if (!p || !p.program.length) { toast('還沒有轉出任何積木'); return; }
    const name = (document.getElementById('bkImportName').value || '').trim();
    if (!name) { toast('先給這一題一個名字'); return; }
    const spec = (document.getElementById('bkImportSpec').value || '').trim();
    const points = Math.max(0, parseInt(
      document.getElementById('bkImportPoints').value, 10) || 5);

    const t = this.trial();
    if (!(t && t.ok) && !confirm(
      '這一題試跑沒有通過,學生可能永遠做不對。\n\n還是要建立嗎?')) return;

    const make = () => ({
      id: 'bt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      name, spec, points,
      solution: JSON.parse(JSON.stringify(p.program)),
      palette: null, hints: [], starLimit: 0, free: false,
      status: 'draft', createdAt: Date.now()
    });

    BlockTasks.all().push(make());
    save();

    let pushed = 0;
    for (const id of this.classes) {
      try { await this.pushToClass(id, make()); pushed++; }
      catch (e) { console.warn('[匯入] 寫不進班級', id, e.message); }
    }

    this.close();
    BlockTasks.render();
    toast(pushed
      ? `✦ 已建立「${name}」,另外 ${pushed} 個班也加好了`
      : `✦ 已建立「${name}」`);
  },

  /* 寫進另一個班的資料。
     刻意**重讀一次那個班的最新資料再寫回去** —— 不這樣做的話,
     會把那個班在這段時間的其他改動蓋掉。 */
  async pushToClass(classId, task) {
    const doc = await Cloud.loadClass(classId);
    if (!doc || !doc.blob) throw new Error('讀不到這個班');
    const blob = doc.blob;
    blob.blockTasks = blob.blockTasks || [];
    blob.blockTasks.push(task);
    await Cloud.saveClassBlob(classId, blob);
  }
};
