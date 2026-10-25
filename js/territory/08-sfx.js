/* ============================================
   音效
   ────────────────────────────────────────────
   全部用 Web Audio 當場合成,**不載任何音檔**。理由:

   · 教室網路時好時壞,音檔沒載到就等於沒有音效,而且是靜靜地沒有
   · 幾個 mp3 放進 repo 會讓 GitHub Pages 的首次載入變慢
   · 這種「嗶一聲」的回饋用合成反而更準 —— 想調短一點、低一點,
     改一個數字就好,不必重新做檔案

   ── 預設值是刻意的 ──
   **學生端預設關閉,老師端預設開啟。**
   28 台平板同時嗶是教室災難;但老師投影的那一台需要聲音,
   因為「有人搶下一格了」是全班都該聽到的事。
   兩邊都可以自己開關,記在這台裝置上。
============================================ */

const SFX = {
  KEY: 'guardian_sfx',

  _ctx: null,
  _on: null,

  /* 預設:老師端開、學生端關。
     判斷依據是「現在是不是學生畫面」—— 學生端是另一組 DOM。 */
  defaultOn() {
    return !(typeof StudentApp !== 'undefined' && StudentApp.classInfo);
  },

  enabled() {
    if (this._on !== null) return this._on;
    try {
      const v = localStorage.getItem(this.KEY);
      this._on = v === null ? this.defaultOn() : v === '1';
    } catch (e) {
      this._on = this.defaultOn();
    }
    return this._on;
  },

  toggle() {
    this._on = !this.enabled();
    try { localStorage.setItem(this.KEY, this._on ? '1' : '0'); } catch (e) { }
    if (this._on) this.play('tick');       // 開起來的時候給個確認聲
    return this._on;
  },

  /* 瀏覽器不准在使用者互動之前出聲,所以 AudioContext 要等到
     第一次真的要發聲時才建立 —— 太早建立會是 suspended 狀態,
     而且 Console 會跳警告。 */
  ctx() {
    if (!this._ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this._ctx = new AC();
    }
    if (this._ctx.state === 'suspended') this._ctx.resume().catch(() => { });
    return this._ctx;
  },

  /* 一個音。freq 可以是陣列,就會依序滑過去(拿來做上行/下行音階)。 */
  tone(freq, dur, opt) {
    const o = opt || {};
    const ctx = this.ctx();
    if (!ctx) return;
    const t0 = ctx.currentTime + (o.delay || 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = o.type || 'sine';

    const list = Array.isArray(freq) ? freq : [freq];
    osc.frequency.setValueAtTime(list[0], t0);
    list.slice(1).forEach((f, i) => {
      osc.frequency.exponentialRampToValueAtTime(f, t0 + dur * ((i + 1) / (list.length - 1)));
    });

    // 起音快、收尾柔 —— 方波直接切斷會「啪」一聲
    const vol = (o.vol === undefined ? 0.16 : o.vol);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  },

  SOUNDS: {
    // 答對:短促的上行三度
    correct:  s => { s.tone([660, 880], 0.14, { type: 'triangle' });
                     s.tone([880, 1320], 0.18, { type: 'triangle', delay: 0.1, vol: 0.12 }); },
    // 答錯:低沉的下行,不刺耳 —— 小學生答錯已經夠難過了
    wrong:    s => s.tone([300, 190], 0.26, { type: 'sine', vol: 0.13 }),
    // 搶下一格:這是整個遊戲最該被聽到的瞬間,所以給它一個小號角
    capture:  s => { s.tone([523, 784], 0.16, { type: 'triangle', vol: 0.18 });
                     s.tone([784, 1047], 0.3, { type: 'triangle', delay: 0.13, vol: 0.16 }); },
    // 自己的地被搶走
    lost:     s => { s.tone([440, 330], 0.22, { type: 'sine', vol: 0.15 });
                     s.tone([330, 220], 0.3, { type: 'sine', delay: 0.18, vol: 0.12 }); },
    // 冷卻結束,可以再出手了
    ready:    s => s.tone([880, 1175], 0.16, { type: 'sine', vol: 0.12 }),
    // 一般的小回饋(開關音效、點開題目)
    tick:     s => s.tone(880, 0.07, { type: 'sine', vol: 0.09 })
  },

  play(name) {
    if (!this.enabled()) return;
    const f = this.SOUNDS[name];
    if (!f) return;
    try { f(this); } catch (e) { /* 不能讓出不了聲變成一個錯誤 */ }
  },

  /* 一次搶下好幾格時不要疊成噪音,只放一次並稍微錯開。 */
  playCaptures(n) {
    if (!this.enabled() || n <= 0) return;
    this.play('capture');
    if (n > 1) setTimeout(() => this.play('tick'), 180);
  }
};

/* 右上角的開關。老師端與學生端共用。 */
function sfxToggleHtml() {
  const on = SFX.enabled();
  return `<button class="btn btn-ghost btn-small sfx-toggle" onclick="sfxToggle(this)"
            title="${on ? '關掉音效' : '打開音效'}">${on ? '🔊' : '🔇'}</button>`;
}

function sfxToggle(btn) {
  const on = SFX.toggle();
  if (btn) {
    btn.textContent = on ? '🔊' : '🔇';
    btn.title = on ? '關掉音效' : '打開音效';
  }
  toast(on ? '音效已開啟' : '音效已關閉');
}
