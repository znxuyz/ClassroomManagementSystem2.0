/* ============================================
   錄影用的疊層:字幕、標題卡、假游標
   ────────────────────────────────────────────
   這一段只在錄影時注入,不會進到正式畫面。

   為什麼要假游標:Playwright 錄下來的影片裡沒有滑鼠。
   少了它,觀眾會看到「東西自己動」,不知道是誰按的 ——
   示範影片最重要的就是「我按了這裡,所以發生那件事」。
============================================ */
window.__demo = {
  init() {
    if (document.getElementById('demoLayer')) return;
    const el = document.createElement('div');
    el.id = 'demoLayer';
    /* 順序就是疊的順序:標題卡要在最下面,字幕才蓋得到它 ——
       不然片頭片尾那幾句字幕會被整片標題卡蓋住(第一次錄就是這樣)。 */
    el.innerHTML = `
      <div id="demoTitle"><div class="t"></div><div class="s"></div></div>
      <div id="demoCursor"></div>
      <div id="demoChapter"></div>
      <div id="demoCaption"><span></span></div>`;
    document.body.appendChild(el);

    const css = document.createElement('style');
    css.textContent = `
      #demoLayer { position: fixed; inset: 0; z-index: 99999; pointer-events: none;
                   font-family: "WenQuanYi Zen Hei", "Noto Sans TC", sans-serif; }

      /* 字幕:黑底白字,壓在最下面一條。
         不用半透明 —— 投影或手機上看,半透明的字幕會糊在畫面裡。 */
      #demoCaption { position: absolute; left: 0; right: 0; bottom: 0;
        padding: 18px 60px 20px; text-align: center;
        background: linear-gradient(transparent, rgba(8,12,20,.86) 38%);
        opacity: 0; transition: opacity .35s ease; }
      #demoCaption span { display: inline-block; color: #fff; font-size: 25px;
        font-weight: 700; line-height: 1.5; letter-spacing: .02em;
        text-shadow: 0 2px 10px rgba(0,0,0,.9); }
      #demoCaption.on { opacity: 1; }

      /* 章節標籤。放在字幕那一條的左端 —— 它有自己的深色底,
         放在畫面其他地方都會壓到東西(左上角壓 logo、左下角壓卡片,
         兩個都實際錄到過)。 */
      #demoChapter { position: absolute; left: 30px; bottom: 24px;
        padding: 7px 16px; border-radius: 999px;
        background: rgba(8,12,20,.78); color: #ffd166;
        font-size: 17px; font-weight: 700; letter-spacing: .06em;
        opacity: 0; transition: opacity .4s ease; }
      #demoChapter.on { opacity: 1; }

      /* 標題卡:片頭片尾整片蓋上 */
      #demoTitle { position: absolute; inset: 0; display: flex;
        flex-direction: column; align-items: center; justify-content: center;
        gap: 18px; background: radial-gradient(ellipse at 50% 35%, #16243a, #080c14 70%);
        opacity: 0; transition: opacity .6s ease; }
      #demoTitle.on { opacity: 1; }
      #demoTitle .t { color: #fff; font-size: 62px; font-weight: 900;
        letter-spacing: .14em; text-shadow: 0 4px 30px rgba(0,0,0,.6); }
      #demoTitle .s { color: #ffd166; font-size: 24px; letter-spacing: .1em; }

      /* 假游標 */
      #demoCursor { position: absolute; width: 22px; height: 22px; left: -50px; top: -50px;
        border-radius: 50%; background: rgba(255,209,102,.35);
        box-shadow: 0 0 0 2px #ffd166, 0 2px 10px rgba(0,0,0,.4);
        transform: translate(-50%, -50%);
        transition: left .45s cubic-bezier(.4,0,.2,1), top .45s cubic-bezier(.4,0,.2,1),
                    width .12s ease, height .12s ease; }
      #demoCursor.tap { width: 34px; height: 34px; background: rgba(255,209,102,.6); }
    `;
    document.head.appendChild(css);
  },

  /* 學生端是用手機的尺寸錄的,之後會被縮進手機外框裡 ——
     字幕要先放大,縮完才讀得到。 */
  capScale(k) {
    const el = document.querySelector('#demoCaption span');
    if (el) el.style.fontSize = Math.round(25 * k) + 'px';
    const ch = document.getElementById('demoChapter');
    if (ch) ch.style.fontSize = Math.round(17 * k) + 'px';
  },

  caption(text) {
    const c = document.getElementById('demoCaption');
    if (!text) { c.classList.remove('on'); return; }
    c.querySelector('span').textContent = text;
    c.classList.add('on');
  },

  chapter(text) {
    const c = document.getElementById('demoChapter');
    if (!text) { c.classList.remove('on'); return; }
    c.textContent = text;
    c.classList.add('on');
  },

  title(t, s) {
    const el = document.getElementById('demoTitle');
    if (t === null) { el.classList.remove('on'); return; }
    el.querySelector('.t').textContent = t;
    el.querySelector('.s').textContent = s || '';
    el.classList.add('on');
  },

  /* 把游標移到某個元素上(並捲到看得見的地方) */
  point(sel, opt) {
    const o = opt || {};
    const el = typeof sel === 'string' ? document.querySelector(sel) : sel;
    if (!el) return null;
    el.scrollIntoView({ block: o.block || 'center', behavior: 'instant' });
    const r = el.getBoundingClientRect();
    const x = r.left + (o.dx === undefined ? r.width / 2 : o.dx);
    const y = r.top + (o.dy === undefined ? r.height / 2 : o.dy);
    const c = document.getElementById('demoCursor');
    c.style.left = x + 'px';
    c.style.top = y + 'px';
    return { x, y };
  },

  tap() {
    const c = document.getElementById('demoCursor');
    c.classList.add('tap');
    setTimeout(() => c.classList.remove('tap'), 180);
  }
};
