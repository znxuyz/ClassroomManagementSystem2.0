/* ============================================
   學生端 — 分頁畫面
   ────────────────────────────────────────────
   守護獸、排行榜、兌換、以及自選守護獸與積分紀錄。
   都是純粹把資料畫出來,沒有寫入動作。
============================================ */

Object.assign(StudentApp, {
  /* ---------- 分頁列 ----------
     本來是七個平鋪的分頁,在 390px 的手機上每格只剩五十幾像素,
     字快要疊在一起了。改成兩排(和老師端同一套做法):
     上排是五個大分類,點到「挑戰」才長出第二排。

     為什麼挑戰要包在一起:測驗、蜂巢戰紀、積木冒險**是同一件事的三種形式**
     —— 都是「老師出題、孩子去闖」。分開平鋪的時候孩子看不出這層關係,
     而且這三個是來來去去的(測驗考完就收、戰紀打完就關),
     平鋪會讓整排分頁一直在變位置,孩子每次都要重新找。

     收起來之後怎麼不漏事情:大分類上的數字是**底下三項未完成的總和**,
     所以即使收著,「我還有兩件事沒做」這件事仍然看得到。 */
  NAV: [
    { key: 'pet',  name: '守護獸' },
    { key: 'rank', name: '排行榜' },
    { key: 'challenge', name: '挑戰', items: [
      { key: 'quiz',   name: '測驗' },
      { key: 'war',    name: '蜂巢戰紀' },
      { key: 'blocks', name: '積木冒險' }
    ] },
    { key: 'shop', name: '兌換' },
    { key: 'help', name: '說明' }
  ],

  /* 每一個葉分頁「現在看不看得到」與「上面要掛幾」。
     看不到的直接不畫 —— 學生端和老師端不一樣,
     孩子看到一個點不開的分頁只會覺得被擋住。 */
  tabState(key, pending) {
    /* 測驗是常設的 —— 沒有考卷的時候仍然進得去,裡面是一塊
       「目前沒有待作答的測驗」的空狀態。把分頁整個收掉的話,
       孩子會以為功能不見了。戰紀和積木不一樣:那兩個本來就是
       老師開了才有的活動。 */
    if (key === 'quiz') return { live: true, badge: pending || 0 };
    if (key === 'war') {
      return { live: !!(typeof TerritoryGame !== 'undefined' && TerritoryGame.config
                        && TerritoryGame.config.status === 'running'), badge: 0 };
    }
    if (key === 'blocks') {
      const list = this.blockTasks || [];
      return { live: list.length > 0,
               badge: list.filter(t => !(this.myBlockWork || {})[t.id]).length };
    }
    return { live: true, badge: 0 };
  },

  /* 這個葉分頁屬於哪一個大分類 */
  groupOf(tab) {
    const g = this.NAV.find(x => x.key === tab
      || (x.items || []).some(i => i.key === tab));
    return g ? g.key : 'pet';
  },

  renderTabs(pending) {
    /* 正在看的那一頁被收走了(測驗結算、戰紀打完),就退回守護獸 ——
       不退的話孩子會停在一片空白上,而且分頁列上沒有任何一個是亮的。 */
    if (!this.tabState(this.tab, pending).live) this.tab = 'pet';
    const cur = this.groupOf(this.tab);
    const badge = n => n > 0 ? `<span class="student-tab-badge">${n}</span>` : '';

    const top = this.NAV.map(g => {
      if (!g.items) {
        const st = this.tabState(g.key, pending);
        if (!st.live) return '';
        return `<button class="student-tab ${cur === g.key ? 'active' : ''}"
                   onclick="StudentApp.setTab('${g.key}')">${g.name}${badge(st.badge)}</button>`;
      }
      const live = g.items.map(i => ({ ...i, ...this.tabState(i.key, pending) }))
                          .filter(i => i.live);
      if (!live.length) return '';
      const sum = live.reduce((a, i) => a + i.badge, 0);
      /* 只有一項的時候不必多一排,直接跳過去 */
      const go = live.length === 1 ? live[0].key : live[0].key;
      return `<button class="student-tab is-group ${cur === g.key ? 'active' : ''}"
                 onclick="StudentApp.setTab('${this.tab && cur === g.key ? this.tab : go}')"
                 >${g.name}${badge(sum)}</button>`;
    }).join('');

    // 第二排:只有停在「挑戰」而且底下不只一項時才長出來
    const grp = this.NAV.find(g => g.key === cur && g.items);
    let sub = '';
    if (grp) {
      const live = grp.items.map(i => ({ ...i, ...this.tabState(i.key, pending) }))
                            .filter(i => i.live);
      if (live.length > 1) {
        sub = `<nav class="student-subtabs">${live.map(i => `
          <button class="student-subtab ${this.tab === i.key ? 'active' : ''}"
                  onclick="StudentApp.setTab('${i.key}')">${i.name}${badge(i.badge)}</button>`
        ).join('')}</nav>`;
      }
    }

    return `<nav class="student-tabs">${top}</nav>${sub}`;
  },

  /* 整頁空白的提示。
     本來這幾頁只有一行灰字(「目前沒有待作答的測驗」)飄在整片空白上,
     看起來像壞掉。給它一個圖示和一句「什麼時候會出現」,
     小朋友才知道不是自己的問題。
     卡片裡面那種小空狀態(積分紀錄)維持原樣,不要用這個。 */
  pageEmpty(icon, title, hint) {
    return `
      <div class="student-empty is-page">
        <div class="student-empty-icon">${icon}</div>
        <div class="student-empty-title">${escapeHtml(title)}</div>
        ${hint ? `<div class="student-empty-hint">${escapeHtml(hint)}</div>` : ''}
      </div>`;
  },

  /* ---------- 分頁:我的守護獸 ---------- */

  renderPetTab() {
    const s = this.student;
    const petHtml = s && s.pet
      ? this.renderPet(s)
      : this.petChoice
        ? this.renderPendingPet()
        : this.renderPetPicker();

    return `
      <section class="student-pet-section">${petHtml}</section>
      ${s && s.pet ? this.renderWeekCard(s) : ''}
      ${this.renderSkillsPanel()}
      <section class="student-section">
        <div class="student-section-title">最近的積分紀錄</div>
        ${this.renderHistory()}
      </section>`;
  },

  /* ---------- 這禮拜 ----------
     累積經驗與可用積分都是「總量」,看不出最近有沒有在進步。
     小朋友真正關心的是「我這禮拜拿了幾分」、「比上禮拜多還是少」。

     一週從星期一算起(和老師的課表一致,也和蜂巢戰紀的週次同一天)。
     七根小柱子是這一週每天的淨得分,今天那一根標起來 ——
     「昨天被扣了兩分」這種事,看圖比看清單快。 */

  weekStart(t) {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    // getDay():星期日是 0,我們要的是「星期一為一週之始」
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.getTime();
  },

  renderWeekCard(s) {
    const WEEK = 7 * 86400000;
    const start = this.weekStart(Date.now());
    const hist = (s.history || []).filter(r => r.time);

    const sum = (from, to) => hist
      .filter(r => r.time >= from && r.time < to)
      .reduce((a, r) => a + (r.points || 0), 0);

    const now = sum(start, start + WEEK);
    const prev = sum(start - WEEK, start);
    const diff = now - prev;

    // 每天的淨得分,星期一到星期日
    const days = Array.from({ length: 7 }, (_, i) =>
      sum(start + i * 86400000, start + (i + 1) * 86400000));

    /* 被扣分的那天要往**下**長,不能只靠顏色區分 ——
       綠配紅在紅綠色弱的眼睛裡幾乎是同一個顏色(實測 ΔE 6.6,
       安全線是 8),所以方向才是真正可靠的那個訊號。
       零線的位置依「最多往下幾分」決定,七根柱子共用同一條線。 */
    const SLOT = 52;                       // 柱子區的高度(px),和 CSS 一致
    const maxUp = Math.max(0, ...days);
    const maxDown = Math.max(0, ...days.map(v => -v));
    const zero = maxDown === 0 ? 0
      : Math.round(SLOT * maxDown / (maxUp + maxDown));
    const todayIdx = Math.floor((Date.now() - start) / 86400000);
    const names = ['一', '二', '三', '四', '五', '六', '日'];

    const bars = days.map((v, i) => {
      // 最小 3px:那天真的有加減分就要看得到,不然和「沒紀錄」分不出來
      const px = v > 0 ? Math.max(3, Math.round((SLOT - zero) * v / (maxUp || 1)))
               : v < 0 ? Math.max(3, Math.round(zero * -v / (maxDown || 1)))
               : 0;
      const cls = v > 0 ? 'pos' : v < 0 ? 'neg' : 'zero';
      return `
        <div class="week-bar-col ${i === todayIdx ? 'today' : ''} ${
          i > todayIdx && v === 0 ? 'future' : ''}">
          <div class="week-bar-slot">
            <div class="week-zero"></div>
            ${v === 0 ? '' : `<div class="week-bar ${cls}" style="height:${px}px"
                 title="${v > 0 ? '+' : ''}${v} 分"></div>`}
          </div>
          <div class="week-bar-day">${names[i]}</div>
        </div>`;
    }).join('');

    const trend = prev === 0 && now === 0 ? '這禮拜還沒有紀錄'
      : diff > 0 ? `比上禮拜多 ${diff} 分`
      : diff < 0 ? `比上禮拜少 ${-diff} 分`
      : '和上禮拜一樣';

    return `
      <section class="week-card">
        <div class="week-card-head">
          <span class="week-card-label">這禮拜拿到</span>
          <span class="week-card-num ${now < 0 ? 'neg' : ''}">${now > 0 ? '+' : ''}${now}</span>
        </div>
        <div class="week-bars" style="--zero:${zero}px">${bars}</div>
        <div class="week-card-trend">${escapeHtml(trend)}</div>
      </section>`;
  },

  /* ---------- 分頁:測驗 ---------- */

  renderQuizTab() {
    if (this.quizzes.length === 0) {
      return this.pageEmpty('✎', '目前沒有待作答的測驗',
        '老師開放測驗時會出現在這裡。答對拿到的分數會變成守護獸的經驗。');
    }
    const results = (this.student && this.student.quizResults) || {};

    return `<div class="quiz-grid">` + this.quizzes.map(q => {
      const race = q.scoreMode === 'perQuestion';
      const answered = race ? (this.qProgress[q.id] || 0) : 0;
      const done = race ? answered >= q.questions.length : !!this.submissions[q.id];
      const r = results[q.id];
      const waiting = !!q.settleAt && Date.now() < q.settleAt;

      let action;
      if (r) {
        action = `<span class="student-quiz-score">+${r.awarded} 分</span>`;
      } else if (race && !done && q.status === 'open') {
        action = `<button class="btn btn-accent btn-small"
                    onclick="StudentApp.openQuiz('${q.id}')">${
                      answered > 0 ? `繼續作答 (${answered}/${q.questions.length})` : '開始作答'
                    }</button>`;
      } else if (done) {
        /* 🔁 重來:交卷之後、老師結算之前,挑幾題重答。
           逐題搶答沒有「重答」這回事(一題一份、只能建立不能改),
           所以只給一般測驗用。 */
        const canRedo = !race && this.canUse('quiz_redo') && q.status === 'open';
        action = `<span class="student-quiz-done">✓ ${race ? '已答完' : '已交卷'}${
          waiting ? '<br><small>' + formatSettleAt(q.settleAt) + ' 公布</small>' : ''}${
          canRedo ? `<br><button class="btn btn-ghost btn-small" style="margin-top:6px;"
                       onclick="StudentApp.openRedo('${q.id}')"
                       title="挑 ${this.skillPower('quiz_redo')} 題重答,只取比較好的那一次"
                       >🔁 重來(剩 ${this.skillLeft('quiz_redo')})</button>` : ''}</span>`;
      } else if (q.status !== 'open') {
        action = '<span class="student-quiz-done">已結束</span>';
      } else {
        action = `<button class="btn btn-accent btn-small"
                    onclick="StudentApp.openQuiz('${q.id}')">開始作答</button>`;
      }

      return `
      <div class="student-quiz-card ${done ? 'done' : ''}">
        <div class="student-quiz-main">
          <div class="student-quiz-title">${escapeHtml(q.title)}</div>
          <div class="student-quiz-meta">
            ${q.questions.length} 題${q.dueDate ? ' · 截止 ' + q.dueDate : ''}
            ${q.scoreMode === 'topN' ? ` · 前 ${q.topN} 名得分` : ''}
          </div>
          ${r ? this.renderMyQuizResult(q, r) : ''}
          ${!r && q.status === 'open' ? this.renderQuizSkills(q) : ''}
        </div>
        ${action}
      </div>`;
    }).join('') + `</div>`;
  },

  /* 測驗卡片上的技能。只在「還沒結算」時給用 ——
     結算完才用就沒意義了,而且老師那邊也不會再重算。
     保險只對搶分類的測驗有用,所以其他類型不顯示。 */
  renderQuizSkills(q) {
    if (!this.skillsOn()) return '';
    const race = q.scoreMode === 'topN' || q.scoreMode === 'perQuestion';
    // 保險只對搶分類有意義(其他模式答對就有分,沒有「沒進名次」這回事)
    const list = ['quiz_double', 'quiz_insure', 'quiz_gift']
      .filter(id => id !== 'quiz_insure' || race)
      .filter(id => this.owns(id) && SkillEngine.usesAt(id, this.myStage()) > 0)
      .map(id => SkillEngine.byId(id));
    if (list.length === 0) return '';

    return `
      <div class="quiz-skill-row">
        ${list.map(sk => {
          const used = this.quizSkillUsed(sk.id, q.id);
          const left = this.skillLeft(sk.id);
          const lv = SkillEngine.levelAt(sk.id, this.myStage());
          return `<button class="skill-chip ${used ? 'on' : ''}"
                    ${used || left <= 0 ? 'disabled' : ''}
                    title="${escapeHtml(sk.desc + ' — ' + (lv.text || ''))}"
                    onclick="StudentApp.useQuizSkill('${sk.id}', '${q.id}')">
                    ${skillIconHtml(sk, 18)} ${escapeHtml(sk.name)}${
                      used ? ' ✓' : `<small>剩 ${left}</small>`}</button>`;
        }).join('')}
      </div>`;
  },

  /* 成績公布後,學生看得到自己每一題的對錯。
     marks 是老師端批改時存下來的 '1/0/-' 字串,裡面沒有正確答案。 */
  renderMyQuizResult(quiz, r) {
    const marks = r.marks || '';
    const ranks = (r.qRanks || '').split(',');     // 逐題搶答才有

    const dots = quiz.questions.map((q, i) => {
      const m = marks[i] || '-';
      const rank = Number(ranks[i] || 0);
      const label = m === '1' ? '✓' : m === '0' ? '✗' : '—';
      const cls = m === '1' ? 'ok' : m === '0' ? 'no' : 'skip';
      // 這一題搶到名次的話,把名次標在格子上
      return `<span class="qmark ${cls} ${rank ? 'won' : ''}"
                title="第 ${i + 1} 題${rank ? ':第 ' + rank + ' 個答對' : ''}"
              >${rank ? rank : label}</span>`;
    }).join('');

    const fast = ranks.filter(x => Number(x) > 0).length;

    return `
      <div class="student-quiz-result">
        <div class="sqr-line">
          答對 <strong>${r.score}/${r.total}</strong> 題
          ${quiz.scoreMode === 'perQuestion'
            ? ` · 搶到 <strong>${fast}</strong> 題的前 ${quiz.topN} 名`
            : ''}
          ${quiz.scoreMode === 'topN' && r.rank ? ` · 第 <strong>${r.rank}</strong> 名` : ''}
          ${r.awarded === 0 && quiz.scoreMode === 'topN'
            ? ' <span class="sqr-miss">(未進得分名額)</span>' : ''}
          ${r.skillNote ? ` <span class="sqr-skill">${escapeHtml(r.skillNote)}</span>` : ''}
        </div>
        <div class="sqr-marks">${dots}</div>
        ${quiz.scoreMode === 'perQuestion'
          ? '<div class="sqr-legend">格子裡的數字 = 那一題你是第幾個答對的</div>' : ''}
      </div>`;
  },

  /* ---------- 分頁:兌換商店 ----------
     學生按下兌換只是送出一張申請單,實際扣點在老師端執行。
     所以這裡顯示的餘額純粹是給孩子參考,不是判斷的依據。

     技能果實與改名卡是系統內建的,老師不必親手交什麼東西給學生,
     所以扣完點就直接記成已發放(見 isSystemShopItem),
     紀錄上寫「可以使用了」而不是「等老師發放」。 */

  /* 這位學生還有幾顆星可以花。
     earned 來自公開名冊(每個人都看得到,星星榜要用),
     spent 來自他自己那一份私有資料 —— 兩個數字分開存,
     重做一題讓星星長回來也不會多出餘額。 */
  myStars() {
    /* this.student 是「公開名冊 + 自己那一份」合起來的,
       earned 來自公開那一份(星星榜要用)、spent 來自私有那一份,
       所以兩個都在這裡讀得到;退回讀主文件時也一樣。 */
    const me = this.student || {};
    return Math.max(0, (me.starsEarned || 0) - (me.starSpent || 0));
  },

  renderShopTab() {
    const items = (this.shopItems || []).filter(i => i.active);
    const points = this.student ? this.student.currentPoints : 0;
    const stars = this.myStars();

    const pendingIds = (this.myPurchases || [])
      .filter(p => p.status === 'pending')
      .map(p => p.itemId);

    const cards = items.length === 0
      ? this.pageEmpty('🎁', '老師還沒上架任何獎品',
          '獎品上架之後,就可以用可用積分來換。')
      : items.map(item => {
          const soldOut  = item.stock !== null && item.stock <= 0;
          const waiting  = pendingIds.includes(item.id);
          /* 雙貨幣:老師可以只填一種價錢。
             兩種都填就兩顆按鈕,買得起哪一種就亮哪一種。 */
          const byPoint = Number(item.price) > 0 || !(Number(item.starPrice) > 0);
          const byStar  = Number(item.starPrice) > 0;
          const tooPoor = byPoint && points < item.price;
          const tooFew  = byStar && stars < item.starPrice;
          // 技能果實用技能自己的圖示(帶統一外框),其他獎品照舊用 emoji
          const fruitOf = SkillEngine.skillOfFruit(item.id);
          // 已經有的果實不能再買。按下去本來就會被擋,但按鈕該先變灰 ——
          // 讓學生按了才被拒絕是很差的體驗
          const owned = !!fruitOf && SkillEngine.owns(this.student, fruitOf.id);
          // 兩種都付不起才算真的買不起
          const broke = (!byPoint || tooPoor) && (!byStar || tooFew);
          const disabled = soldOut || broke || waiting || owned;

          return `
          <div class="prize-card ${disabled ? 'disabled' : ''} ${fruitOf ? 'is-fruit' : ''}">
            <div class="prize-icon">${fruitOf
              ? skillIconHtml(fruitOf, 56)
              : escapeHtml(item.icon || '🎁')}</div>
            <div class="prize-body">
              <div class="prize-name">${escapeHtml(item.name)}</div>
              ${item.description
                ? `<div class="prize-desc">${escapeHtml(item.description)}</div>` : ''}
              <div class="prize-meta">
                ${byPoint ? `<span class="prize-price">${item.price} 點</span>` : ''}
                ${byStar ? `<span class="prize-price is-star">★ ${item.starPrice}</span>` : ''}
                ${item.stock !== null
                  ? `<span class="prize-stock">${soldOut ? '已兌完' : '剩 ' + item.stock + ' 份'}</span>`
                  : ''}
              </div>
            </div>
            ${owned || waiting || soldOut || broke ? `
            <button class="btn btn-accent btn-small" disabled>
              ${owned ? '已擁有' : waiting ? '處理中' : soldOut ? '已兌完'
                : byPoint && byStar
                  ? `還差 ${Math.min(item.price - points, item.starPrice - stars)}`
                  : byStar ? `還差 ${item.starPrice - stars} ★`
                           : `還差 ${item.price - points} 點`}
            </button>` : `
            <div class="prize-pay">
              ${byPoint ? `<button class="btn btn-accent btn-small" ${tooPoor ? 'disabled' : ''}
                      onclick="StudentApp.buy('${item.id}','point')"
                      >${tooPoor ? `還差 ${item.price - points} 點` : byStar ? `${item.price} 點` : '兌換'}</button>` : ''}
              ${byStar ? `<button class="btn btn-small btn-star" ${tooFew ? 'disabled' : ''}
                      onclick="StudentApp.buy('${item.id}','star')"
                      >${tooFew ? `還差 ${item.starPrice} ★` : `★ ${item.starPrice}`}</button>` : ''}
            </div>`}
          </div>`;
        }).join('');

    return `
      <div class="prize-balance">
        <span>我的可用積分</span>
        <strong>${points}</strong>
        ${(this.student && this.student.starsEarned)
          ? `<span class="prize-balance-star" title="積木冒險拿到的星星,也可以在這裡花掉">
               <span>星星</span><strong>★ ${stars}</strong></span>` : ''}
      </div>
      <div class="prize-grid">${cards}</div>
      ${this.renderMyPurchases()}`;
  },

  renderMyPurchases() {
    const list = (this.myPurchases || [])
      .filter(p => p.status !== 'pending')
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, 10);
    if (list.length === 0) return '';

    const label = p => ({
      paid: p.currency === 'star' ? '已扣星星,等老師發放' : '已扣點,等老師發放',
      delivered: '已領取',
      rejected: '未成立',
      refunded: p.currency === 'star' ? '已退星星' : '已退點'
    })[p.status] || p.status;

    return `
      <section class="student-section">
        <div class="student-section-title">我的兌換紀錄</div>
        <div class="student-history">
          ${list.map(p => `
            <div class="student-history-row">
              <span class="student-history-reason">
                ${escapeHtml(p.itemIcon || '🎁')} ${escapeHtml(p.itemName)}
                <span class="prize-status ${p.status}">${
                  p.status === 'delivered' && p.auto ? '可以使用了' : label(p)
                }</span>
                ${p.status === 'rejected' && p.reason
                  ? `<span class="prize-reason">${escapeHtml(p.reason)}</span>` : ''}
              </span>
              <span class="student-history-points neg">
                ${p.settledPrice != null
                  ? (p.currency === 'star' ? '-★' + p.settledPrice : '-' + p.settledPrice) : ''}
              </span>
            </div>`).join('')}
        </div>
      </section>`;
  },

  async buy(itemId, currency) {
    const item = (this.shopItems || []).find(i => i.id === itemId);
    if (!item) return;
    const cur = currency === 'star' ? 'star' : 'point';
    const cost = cur === 'star' ? Number(item.starPrice) : Number(item.price);
    const unit = cur === 'star' ? '★' : '點';
    if (cur === 'star' && !(cost > 0)) { toast('這項獎品不能用星星換'); return; }

    const fruit = SkillEngine.skillOfFruit(item.id);
    if (fruit && SkillEngine.owns(this.student, fruit.id)) {
      toast('這顆果實你已經有了,一個技能買一次就永久擁有');
      return;
    }
    if (!confirm(fruit
        ? `用 ${cost} ${unit}買「${item.name}」嗎?\n\n` +
          `買一次就永久擁有,守護獸每進化一次這個技能就更強。\n\n` +
          SkillEngine.fruitDescription(fruit)
        : `用 ${cost} ${unit}兌換「${item.name}」嗎?`)) return;

    /* 議價要先登記,再把它的 id 寫進申請單 —— 老師結算時照著打折。
       取消或用不了就是原價兌換。技能果實本身不給打折(買一次就永久)。 */
    /* 議價只打積分的折 —— 星星沒有「折扣」這回事(數字太小,
       打完折常常和原價一樣,孩子會覺得被騙)。 */
    const useId = (cur === 'point' && this.skillsOn() && !SkillEngine.isFruit(item.id))
      ? await this.askDiscount(item) : null;

    try {
      await Cloud.createPurchase(this.classInfo.classId, Cloud.uid, {
        studentId: this.classInfo.studentId,
        studentName: this.classInfo.name,
        itemId: item.id,
        itemName: item.name,
        itemIcon: item.icon || '🎁',
        currency: cur,
        requestedPrice: cost,
        skillId: useId ? 'shop_discount' : '',
        skillUseId: useId || ''
      });
      toast(useId
        ? '✦ 已送出兌換(帶著 🏷️ 議價)'
        : '✦ 已送出兌換,老師確認後就會扣點');
    } catch (e) {
      console.error(e);
      toast('兌換失敗:' + e.message);
    }
  },

  /* ---------- 分頁:排行榜 ---------- */

  /* 分組來源:老師存過的分組優先,否則用目前螢幕上那份(按過「產生分組」就有)。
     老師只按產生沒按儲存也看得到,不用多教一個步驟。 */
  readGroups(blob) {
    const sets = blob.groupSets || [];
    if (sets.length > 0) {
      const latest = sets[sets.length - 1];
      this.groups = decodeGroups(latest.groups);
      this.groupsName = latest.name;
    } else {
      this.groups = decodeGroups(blob.currentGroups);
      this.groupsName = null;
    }
  },

  renderRankTab() {
    const hasGroups = !!(this.groups && this.groups.length);
    /* 星星榜只有在真的有人拿過星星時才出現 ——
       還沒開積木冒險的班,多一顆永遠是空的按鈕只會讓人困惑。 */
    const starRows = Leaderboard.stars(this.allStudents);
    const hasStars = starRows.length > 0;
    const showStar = this.rankTab === 'star' && hasStars;
    const showGroup = this.rankTab === 'group' && hasGroups && !showStar;

    const rows = showStar ? starRows
      : showGroup ? Leaderboard.groups(this.allStudents, this.groups)
      : Leaderboard.individual(this.allStudents);

    // 小組榜要高亮的是「我所屬的那一組」
    const myId = showGroup ? this.myGroupId() : this.classInfo.studentId;

    const switcher = (hasGroups || hasStars) ? `
      <div class="rank-switch">
        <button class="rank-switch-btn ${!showGroup && !showStar ? 'active' : ''}"
                onclick="StudentApp.setRankTab('individual')">個人榜</button>
        ${hasGroups ? `<button class="rank-switch-btn ${showGroup ? 'active' : ''}"
                onclick="StudentApp.setRankTab('group')">小組榜</button>` : ''}
        ${hasStars ? `<button class="rank-switch-btn ${showStar ? 'active' : ''}"
                onclick="StudentApp.setRankTab('star')">星星榜</button>` : ''}
      </div>` : '';

    // 前三名沒變動就不重播動畫
    const sig = this.rankTab + '::' + Leaderboard.signature(rows);
    const animate = sig !== this.lastPodiumSig;
    this.lastPodiumSig = sig;

    return `
      ${switcher}
      ${showGroup && this.groupsName
        ? `<div class="rank-groupset-name">依「${escapeHtml(this.groupsName)}」分組</div>` : ''}
      ${Leaderboard.renderPodium(rows, { highlightId: myId, animate })}
      ${Leaderboard.renderMyRank(rows, myId,
          showGroup ? '我這組的名次' : showStar ? '我的星星' : '我的名次')}
      ${Leaderboard.renderRest(rows, myId)}
    `;
  },

  setRankTab(tab) {
    this.rankTab = tab;
    this.render();
  },

  /* 找出自己在哪一組 */
  myGroupId() {
    if (!this.groups) return null;
    const idx = this.groups.findIndex(members =>
      (members || []).some(m => Leaderboard.memberId(m) === this.classInfo.studentId));
    return idx >= 0 ? 'g' + idx : null;
  },

  renderPet(s) {
    const stage = PetEngine.getStage(s.totalPoints);
    const species = PET_SPECIES.find(p => p.id === s.pet);
    const nextThreshold = STAGE_THRESHOLDS[stage + 1];
    const pct = nextThreshold
      ? Math.min(100, Math.round(s.totalPoints / nextThreshold * 100))
      : 100;

    return `
      <div class="student-pet-card stage-${stage}">
        <div class="student-pet-icon">${PetEngine.getIcon(s)}</div>
        <div class="student-pet-name">
          ${escapeHtml(s.petName || (species ? species.name : '守護獸'))}
          ${(s.renameLeft || 0) > 0 ? `
            <button class="btn btn-ghost btn-small student-rename-btn"
                    onclick="StudentApp.renamePet()"
                    title="用掉一張改名卡">✎ 改名(剩 ${s.renameLeft})</button>` : ''}
        </div>
        <div class="student-pet-stage">${STAGE_NAMES[stage]}</div>
        <div class="pet-ladder" aria-hidden="true">
          ${STAGE_NAMES.map((n, i) => `
            <span class="pet-ladder-step ${i < stage ? 'done' : ''} ${i === stage ? 'now' : ''}">
              <span class="pet-ladder-dot"></span>
              <span class="pet-ladder-name">${escapeHtml(n)}</span>
            </span>`).join('')}
        </div>
        <div class="student-points">
          <div><span class="student-points-num">${s.totalPoints}</span><span>累積經驗</span></div>
          <div><span class="student-points-num">${s.currentPoints}</span><span>可用積分</span></div>
        </div>
        <div class="student-progress">
          <div class="student-progress-bar" style="width:${pct}%"></div>
        </div>
        <div class="student-progress-label">
          ${nextThreshold
            ? `再 ${nextThreshold - s.totalPoints} 分進化到下一階段`
            : '已達最高階段'}
        </div>
      </div>`;
  },

  /* ---------- 自選守護獸 ---------- */

  renderPetPicker() {
    const cards = PET_SPECIES.map(p => `
      <div class="pet-choice ${this.pickedPet === p.id ? 'selected' : ''}"
           onclick="StudentApp.pickPet('${p.id}')">
        <div class="pet-choice-icon">${p.icon}</div>
        <div class="pet-choice-name">${escapeHtml(p.name)}</div>
        <div class="pet-choice-desc">${escapeHtml(p.desc)}</div>
      </div>`).join('');

    return `
      <div class="pet-picker">
        <div class="pet-picker-title">選擇你的守護獸</div>
        <div class="pet-picker-sub">— 台 灣 山 林 八 神 —</div>
        <div class="pet-picker-desc">
          牠們都是台灣特有種,真實住在這座島上。<br>
          選好之後就不能更換了,慢慢挑。
        </div>
        <div class="pet-choice-grid">${cards}</div>
        <input type="text" id="petNickname" class="student-short-input"
               placeholder="幫牠取個名字(可留空)" style="margin-top:16px;" />
        <button class="btn btn-primary btn-block btn-large" style="margin-top:14px;"
                ${this.pickedPet ? '' : 'disabled'}
                onclick="StudentApp.confirmPet()">
          ${this.pickedPet ? '就選牠了' : '請先選一隻'}
        </button>
      </div>`;
  },

  pickPet(petId) {
    this.pickedPet = petId;
    // 保留使用者已經打好的名字,重繪不要清掉
    const input = document.getElementById('petNickname');
    this.draftNickname = input ? input.value : (this.draftNickname || '');
    this.render();
    const restored = document.getElementById('petNickname');
    if (restored) restored.value = this.draftNickname || '';
  },

  async confirmPet() {
    if (!this.pickedPet) return;
    const species = PET_SPECIES.find(p => p.id === this.pickedPet);
    const input = document.getElementById('petNickname');
    const nickname = (input ? input.value : '').trim();

    if (!confirm(`確定選擇「${species.name}」嗎?選好之後就不能更換了。`)) return;

    try {
      await Cloud.savePetChoice(this.classInfo.classId, Cloud.uid, {
        studentId: this.classInfo.studentId,
        studentName: this.classInfo.name,
        pet: this.pickedPet,
        petName: nickname || null
      });
      toast('✦ 守護獸已選定!');
      this.pickedPet = null;
      this.draftNickname = '';
      await this.refresh();
    } catch (e) {
      console.error(e);
      toast('選擇失敗:' + e.message);
    }
  },

  /* 已送出選擇,但老師還沒開過班級後台,尚未收進正式資料 */
  renderPendingPet() {
    const species = PET_SPECIES.find(p => p.id === this.petChoice.pet);
    if (!species) return '<div class="student-pet-empty">守護獸資料有誤,請告訴老師</div>';
    return `
      <div class="student-pet-card">
        <div class="student-pet-icon">🥚</div>
        <div class="student-pet-name">${escapeHtml(this.petChoice.petName || species.name)}</div>
        <div class="student-pet-stage">${escapeHtml(species.name)} · 靈卵</div>
        <div class="student-progress-label" style="margin-top:16px;">
          你選好了 ${species.icon} ${escapeHtml(species.name)}。<br>
          老師下次打開班級後台時,牠就會正式住進來。
        </div>
      </div>`;
  },

  /* 「11/2」在同一天的八筆上重複八次,看起來像一張報表。
     改成按日分組:今天 / 昨天 / 11月1日,每一天的抬頭右邊寫那一天的
     淨得分 —— 小朋友最想知道的就是「我今天拿了幾分」。 */
  historyDayLabel(t) {
    const d = new Date(t);
    const midnight = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((midnight(new Date()) - midnight(d)) / 86400000);
    if (diff === 0) return '今天';
    if (diff === 1) return '昨天';
    return (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日';
  },

  renderHistory() {
    const h = (this.student && this.student.history) || [];
    if (h.length === 0) return '<div class="student-empty">還沒有積分紀錄</div>';

    // 分組要保持「新的在上面」,所以先反轉再依序堆進去
    const days = [];
    h.slice(-20).reverse().forEach(r => {
      const key = r.time ? this.historyDayLabel(r.time) : '更早以前';
      const last = days[days.length - 1];
      if (last && last.key === key) last.rows.push(r);
      else days.push({ key, rows: [r] });
    });

    return days.map(d => {
      const net = d.rows.reduce((a, r) => a + (r.points || 0), 0);
      return `
        <div class="student-history-day">
          <span class="student-history-date">${escapeHtml(d.key)}</span>
          <span class="student-history-sum ${net >= 0 ? 'pos' : 'neg'}">${
            net >= 0 ? '+' : ''}${net}</span>
        </div>
        <div class="student-history">` +
        d.rows.map(r => `
          <div class="student-history-row">
            <span class="student-history-reason">${escapeHtml(r.reason)}</span>
            <span class="student-history-points ${r.points >= 0 ? 'pos' : 'neg'}">
              ${r.points >= 0 ? '+' : ''}${r.points}
            </span>
          </div>`).join('') + `</div>`;
    }).join('');
  },
});
