/* ============================================
   學生模擬模式
   ────────────────────────────────────────────
   老師在自己的畫面裡,直接看到「某一位學生登入之後會看到什麼」。

   ── 為什麼需要 ──
   關卡地圖、星星、守護獸、排行榜這些東西全都長在學生那一端。
   老師發完題目之後只能猜 —— 要嘛借學生的帳號登入(不該做),
   要嘛自己開一個假帳號(麻煩而且資料是假的)。
   結果就是老師永遠不確定孩子看到的是不是他以為的那樣。

   ── 做法:iframe ──
   不是把學生畫面「塞」進老師的版面裡,而是開一個 390 寬的 iframe
   載入同一支 index.html。這樣做的理由很實在:
   學生端的 RWD 是看**視窗寬度**的,硬塞進一個 390px 的框裡,
   媒體查詢讀到的還是老師那台 1440 —— 會看到一個擠在小框裡的電腦版,
   那不是學生看到的東西,反而更誤導。
   iframe 有自己的視窗寬度,所以手機版就是真的手機版。

   ── 資料從老師這一端送過去 ──
   不連雲端:老師手上本來就有整個班的資料,用 postMessage 把那一份
   blob 丟進 iframe,裡面用和學生端完全一樣的程式碼組出畫面
   (Roster.build / privateEntry,就是真的發給學生的那兩份)。
   所以看到的不是模擬出來的樣子,是真的那個樣子。

   ── 預覽裡不會真的送出 ──
   按兌換、交作品、選守護獸都會被攔下來並說明。
   老師是來看的,不是來幫學生操作的。
============================================ */

/* ============================================
   一、iframe 裡面(學生那一端)
============================================ */
const StudentPreviewFrame = {
  isPreview() {
    return typeof location !== 'undefined' && location.hash.indexOf('preview') >= 0;
  },

  boot() {
    document.body.classList.add('is-preview-frame');
    const view = document.getElementById('studentView');
    if (view) {
      view.classList.remove('hidden');
      view.innerHTML = '<div class="student-loading">預覽載入中…</div>';
    }
    ['gateView', 'setupView', 'appView'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });

    window.addEventListener('message', e => {
      const d = e.data;
      if (!d || d.type !== 'sgp-preview') return;
      try {
        this.show(d);
      } catch (err) {
        view.innerHTML = '<div class="student-loading">預覽出了點問題:'
          + escapeHtml(err.message) + '</div>';
      }
    });
    // 告訴老師那一端「我準備好了,可以把資料送過來」
    if (window.parent !== window) window.parent.postMessage({ type: 'sgp-ready' }, '*');
  },

  /* 把雲端的寫入全部換成「這是預覽」—— 老師是來看的,不是來幫學生按的 */
  blockWrites() {
    const no = async () => {
      toast('這是預覽畫面,不會真的送出');
      return null;
    };
    ['createPurchase', 'saveBlockWork', 'savePetChoice', 'requestPetRename',
     'submitAnswers', 'sendQuizAnswer', 'useSkill', 'sendTerritoryEvent',
     'sendTerritoryFail', 'startTerritoryAttempt'].forEach(k => { Cloud[k] = no; });
    const nil = async () => null;
    ['getMyPetChoice', 'getMySubmission', 'getMyBlockWork', 'listMyQuizAnswers',
     'listMySkillUses', 'listMySolvedQuestions', 'getMyChainTip'].forEach(k => { Cloud[k] = nil; });
    const nop = () => () => {};
    ['watchClass', 'watchPublicRoster', 'watchMyPurchases', 'watchSkillGrants',
     'watchBlockTasks', 'watchTerritoryConfig', 'watchTerritoryEvents',
     'watchTerritoryQuestions', 'watchTerritoryAttempts', 'watchTerritoryFails']
      .forEach(k => { Cloud[k] = nop; });
  },

  show(d) {
    this.blockWrites();
    applyBlobToState(d.blob);
    state.classId = d.classId || 'preview';

    const me = (state.students || []).find(s => s.id === d.studentId)
      || (state.students || [])[0];
    if (!me) throw new Error('這個班還沒有學生');

    StudentApp.preview = true;
    StudentApp.classInfo = {
      classId: state.classId, className: state.className,
      studentId: me.id, name: me.name, seatNumber: me.seatNumber
    };
    /* 用的就是真的會發出去的那兩份:公開名冊 + 他自己那一份私有資料。
       自己另外兜一份「看起來像」的資料,就會變成「預覽裡好好的,
       實際上不是這樣」—— 那比沒有預覽更糟。 */
    StudentApp.myPrivate = Roster.privateEntry(me);
    StudentApp.useRoster = true;
    StudentApp.applyClassData(Roster.build(null));

    // 測驗:開放中的才看得到(和學生端同一條規則)
    StudentApp.quizzes = (state.quizzes || []).filter(q => q.status === 'open');
    StudentApp.submissions = {};
    StudentApp.myPurchases = [];
    StudentApp.skillUses = [];

    // 積木挑戰:發出去的考卷 + 這位學生目前的星星
    StudentApp.blockTasks = (typeof BlockTasks !== 'undefined') ? BlockTasks.papers() : [];
    StudentApp.myBlockWork = {};
    (state.blockTasks || []).forEach(t => {
      const st = (t.stars || {})[me.id];
      if (st) StudentApp.myBlockWork[t.id] = { program: [], stars: st, at: Date.now() };
    });

    StudentApp.bkTask = null;
    StudentApp.activeQuiz = null;
    StudentApp.tab = d.tab || 'pet';
    StudentApp.render();
  }
};

/* ============================================
   二、老師那一端(放 iframe 的那一頁)
============================================ */
const StudentPreview = {
  studentId: null,
  tab: 'pet',
  device: 'phone',     // phone | tablet
  ready: false,

  DEVICES: {
    phone:  { w: 390, h: 760, name: '手機' },
    tablet: { w: 768, h: 740, name: '平板' }
  },

  TABS: [
    { id: 'pet',    name: '守護獸' },
    { id: 'rank',   name: '排行榜' },
    { id: 'quiz',   name: '測驗' },
    { id: 'shop',   name: '兌換' },
    { id: 'blocks', name: '積木挑戰' },
    { id: 'help',   name: '說明' }
  ],

  render() {
    const host = document.getElementById('previewBody');
    if (!host) return;
    const list = state.students || [];
    if (!list.length) {
      host.innerHTML = `<div class="empty-state">
        <div class="empty-state-icon">⌸</div>
        <div>這個班還沒有學生</div>
        <div class="empty-state-action">先到「系統設定 → 班級與學生」匯入名單。</div>
      </div>`;
      return;
    }
    if (!this.studentId || !list.some(s => s.id === this.studentId)) {
      this.studentId = list[0].id;
    }
    const dev = this.DEVICES[this.device];

    host.innerHTML = `
      <div class="pv-bar">
        <label class="field">
          <span class="field-label">看哪一位</span>
          <select class="rule-editor-input" onchange="StudentPreview.pick(this.value)">
            ${list.map(s => `<option value="${s.id}" ${s.id === this.studentId ? 'selected' : ''}
              >${escapeHtml((s.seatNumber ? s.seatNumber + ' ' : '') + s.name)}</option>`).join('')}
          </select>
        </label>
        <label class="field">
          <span class="field-label">裝置</span>
          <select class="rule-editor-input" onchange="StudentPreview.setDevice(this.value)">
            ${Object.entries(this.DEVICES).map(([k, d]) =>
              `<option value="${k}" ${k === this.device ? 'selected' : ''}>${d.name} ${d.w}px</option>`).join('')}
          </select>
        </label>
        <div class="pv-tabs">
          ${this.TABS.map(t => `
            <button class="pv-tab ${t.id === this.tab ? 'on' : ''}"
                    onclick="StudentPreview.setTab('${t.id}')">${t.name}</button>`).join('')}
        </div>
        <div style="flex:1"></div>
        <button class="btn btn-ghost btn-small" onclick="StudentPreview.reload()">重新載入</button>
      </div>

      <div class="pv-note">
        這是<strong>唯讀的預覽</strong>:畫面與資料都是真的(就是這位學生登入會看到的),
        但在這裡按兌換、交作品、選守護獸都不會真的送出。
      </div>

      <div class="pv-stage">
        <div class="pv-phone" style="width:${dev.w}px; height:${dev.h}px;">
          <iframe id="pvFrame" title="學生畫面預覽"
                  src="index.html#preview" style="width:${dev.w}px; height:${dev.h}px;"></iframe>
        </div>
      </div>`;

    this.ready = false;
    const frame = document.getElementById('pvFrame');
    frame.addEventListener('load', () => { this.push(); });
  },

  /* iframe 說它準備好了(或 load 完)就把資料送進去 */
  push() {
    const frame = document.getElementById('pvFrame');
    if (!frame || !frame.contentWindow) return;
    frame.contentWindow.postMessage({
      type: 'sgp-preview',
      blob: JSON.parse(JSON.stringify(serializeState())),
      classId: state.classId,
      studentId: this.studentId,
      tab: this.tab
    }, '*');
  },

  pick(id) { this.studentId = id; this.push(); },

  /* 換分頁、換裝置都**不要重載 iframe** —— 重載一次要等它整個跑完,
     老師只是想看另一頁而已。換分頁直接把資料再送一次就好;
     換裝置只要改框的大小,裡面的 RWD 自己會跟著變。 */
  setTab(t) {
    this.tab = t;
    document.querySelectorAll('.pv-tab').forEach(b =>
      b.classList.toggle('on', b.textContent.trim() ===
        (this.TABS.find(x => x.id === t) || {}).name));
    this.push();
  },

  setDevice(d) {
    this.device = d;
    const dev = this.DEVICES[d];
    const phone = document.querySelector('.pv-phone');
    const frame = document.getElementById('pvFrame');
    if (!phone || !frame) return;
    phone.style.width = dev.w + 'px';
    phone.style.height = dev.h + 'px';
    frame.style.width = dev.w + 'px';
    frame.style.height = dev.h + 'px';
  },

  reload() { this.render(); }
};

/* iframe 裡面的那一邊會主動說「我好了」 */
if (typeof window !== 'undefined') {
  window.addEventListener('message', e => {
    if (e.data && e.data.type === 'sgp-ready' && typeof StudentPreview !== 'undefined') {
      StudentPreview.push();
    }
  });
}

function renderPreviewView() {
  StudentPreview.render();
}
