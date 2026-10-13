/* ============================================
   學生端 — 測驗作答
   ────────────────────────────────────────────
   一般交卷與逐題搶答兩種流程。逐題搶答一次只給一題、
   送出才看得到下一題,而且不當場告知對錯 ——
   否則先答完的人可以把答案傳出去。
============================================ */

Object.assign(StudentApp, {
  /* ---------- 作答 ---------- */

  async openQuiz(quizId) {
    const quiz = this.quizzes.find(q => q.id === quizId);
    if (!quiz) return;
    this.activeQuiz = quiz;
    this.draftAnswers = {};

    // 逐題搶答:先查自己已經答過哪幾題,重新整理或換裝置都接得回去
    if (quiz.scoreMode === 'perQuestion') {
      this.qAnswered = await Cloud.listMyQuizAnswers(
        this.classInfo.classId, quiz.id, Cloud.uid);
      this.qPicked = null;
    }
    this.render();
  },

  async closeQuiz() {
    const quiz = this.activeQuiz;
    this.activeQuiz = null;
    this.draftAnswers = {};
    this.qPicked = null;
    // 逐題搶答離開時把進度更新回列表,不然還是顯示舊的題數
    if (quiz && quiz.scoreMode === 'perQuestion') {
      this.qProgress[quiz.id] = Object.keys(this.qAnswered).length;
    }
    this.qAnswered = {};
    this.render();
  },

  setAnswer(qId, value) {
    this.draftAnswers[qId] = value;
  },

  /* ---------- 逐題搶答 ----------
     一次只看一題,送出才看得到下一題,不能回頭改。
     每一題的時間戳由伺服器蓋,所以「誰最快答對這一題」是伺服器認定的。
     對錯不會當場告訴學生 —— 正確答案留在老師那裡,結算時才批改,
     否則先答的人可以把答案傳給還沒答的人。 */

  currentQIndex() {
    const quiz = this.activeQuiz;
    const i = quiz.questions.findIndex(q => !this.qAnswered[q.id]);
    return i;                                  // -1 = 全部答完
  },

  pickQAnswer(value) {
    this.qPicked = value;
    this.render();
  },

  /* 簡答題邊打字邊切換送出鈕。這裡不整頁重繪 —— 會把游標踢掉。 */
  syncQSendBtn() {
    const btn = document.getElementById('qSendBtn');
    if (btn) btn.disabled = !String(this.qPicked || '').trim();
  },

  async sendQAnswer() {
    if (this.qPicked === null || this.qPicked === undefined || this.qSending) return;
    const quiz = this.activeQuiz;
    const q = quiz.questions[this.currentQIndex()];
    if (!q) return;

    this.qSending = true;
    this.render();
    try {
      await Cloud.sendQuizAnswer(this.classInfo.classId, quiz.id, Cloud.uid, {
        studentId: this.classInfo.studentId,
        studentName: this.classInfo.name,
        questionId: q.id,
        answer: this.qPicked
      });
      this.qAnswered[q.id] = { answer: this.qPicked };
      this.qPicked = null;
    } catch (e) {
      console.error(e);
      toast(e.code === 'permission-denied'
        ? '這一題已經答過了,或測驗已經結束'
        : '送出失敗:' + e.message);
    } finally {
      this.qSending = false;
      this.render();
    }
  },

  renderPerQuestionPage() {
    const quiz = this.activeQuiz;
    const idx = this.currentQIndex();
    const total = quiz.questions.length;
    const doneCount = total - quiz.questions.filter(q => !this.qAnswered[q.id]).length;

    const head = `
      <header class="student-header">
        <div class="student-class">${escapeHtml(quiz.title)}</div>
        <button class="btn btn-ghost btn-small" onclick="StudentApp.closeQuiz()">← 返回</button>
      </header>`;

    if (idx < 0) {
      return `${head}
        <main class="student-main">
          <div class="qrace-done">
            <div class="qrace-done-mark">✓</div>
            <div class="qrace-done-text">${total} 題都答完了</div>
            <div class="qrace-done-note">
              ${quiz.settleAt && Date.now() < quiz.settleAt
                ? formatSettleAt(quiz.settleAt) + ' 公布成績'
                : '老師結算後就會看到成績'}
            </div>
          </div>
          <button class="btn btn-primary btn-block btn-large"
                  onclick="StudentApp.closeQuiz()">回到測驗列表</button>
        </main>`;
    }

    const q = quiz.questions[idx];
    const picked = this.qPicked;

    let options = '';
    if (q.type === 'choice') {
      options = q.options.map((opt, oi) => opt ? `
        <div class="student-option ${picked === oi ? 'picked' : ''}"
             onclick="StudentApp.pickQAnswer(${oi})">
          <span class="student-option-letter">${'ABCD'[oi]}</span>
          <span>${escapeHtml(opt)}</span>
        </div>` : '').join('');
    } else if (q.type === 'truefalse') {
      options = `
        <div class="student-option ${picked === true ? 'picked' : ''}"
             onclick="StudentApp.pickQAnswer(true)">○ 正確</div>
        <div class="student-option ${picked === false ? 'picked' : ''}"
             onclick="StudentApp.pickQAnswer(false)">✕ 錯誤</div>`;
    } else {
      options = `<input type="text" class="student-short-input" placeholder="在這裡作答"
                   value="${picked ? escapeHtml(String(picked)) : ''}"
                   oninput="StudentApp.qPicked = this.value; StudentApp.syncQSendBtn()" />`;
    }

    return `${head}
      <main class="student-main">
        <div class="qrace-bar">
          <div class="qrace-progress">第 ${idx + 1} / ${total} 題</div>
          <div class="qrace-hint">每題各自比快 · 前 ${quiz.topN} 名答對得分</div>
        </div>
        <div class="qrace-track">
          ${quiz.questions.map((_, i) =>
            `<span class="qrace-dot ${i < doneCount ? 'done' : i === idx ? 'now' : ''}"></span>`
          ).join('')}
        </div>

        <div class="student-question">
          <div class="student-question-text">${escapeHtml(q.text)}</div>
          ${options}
        </div>

        <button class="btn btn-primary btn-block btn-large" id="qSendBtn"
                ${this.qSending || picked === null || picked === undefined || picked === '' ? 'disabled' : ''}
                onclick="StudentApp.sendQAnswer()">
          ${this.qSending ? '送出中…' : idx + 1 === total ? '送出最後一題' : '送出,下一題'}
        </button>
        <div class="student-note">送出後不能修改,也不會馬上告訴你對不對。</div>
      </main>`;
  },

  renderQuizPage() {
    const quiz = this.activeQuiz;
    if (quiz.scoreMode === 'perQuestion') {
      document.getElementById('studentView').innerHTML = this.renderPerQuestionPage();
      return;
    }
    const questions = quiz.questions.map((q, i) => `
      <div class="student-question">
        <div class="student-question-text">
          <span class="student-question-num">${i + 1}</span>${escapeHtml(q.text)}
        </div>

        ${q.type === 'choice' ? q.options.map((opt, oi) => `
          <label class="student-option">
            <input type="radio" name="sq_${q.id}" value="${oi}"
                   onchange="StudentApp.setAnswer('${q.id}', ${oi})" />
            <span class="student-option-letter">${'ABCD'[oi]}</span>
            <span>${escapeHtml(opt)}</span>
          </label>`).join('') : ''}

        ${q.type === 'truefalse' ? `
          <label class="student-option">
            <input type="radio" name="sq_${q.id}"
                   onchange="StudentApp.setAnswer('${q.id}', true)" /> ○ 正確
          </label>
          <label class="student-option">
            <input type="radio" name="sq_${q.id}"
                   onchange="StudentApp.setAnswer('${q.id}', false)" /> ✕ 錯誤
          </label>` : ''}

        ${q.type === 'short' ? `
          <input type="text" class="student-short-input" placeholder="在這裡作答"
                 oninput="StudentApp.setAnswer('${q.id}', this.value)" />` : ''}
      </div>
    `).join('');

    document.getElementById('studentView').innerHTML = `
      <header class="student-header">
        <div class="student-class">${escapeHtml(quiz.title)}</div>
        <button class="btn btn-ghost btn-small" onclick="StudentApp.closeQuiz()">← 返回</button>
      </header>
      <main class="student-main">
        ${questions}
        <button class="btn btn-primary btn-block btn-large" id="submitQuizBtn"
                onclick="StudentApp.submit()">交 卷</button>
        <div class="student-note">交卷後無法修改,請確認每題都作答了。</div>
      </main>
    `;
  },

  async submit() {
    const quiz = this.activeQuiz;
    const unanswered = quiz.questions.filter(q => {
      const a = this.draftAnswers[q.id];
      return a === undefined || a === null || a === '';
    });

    if (unanswered.length > 0) {
      if (!confirm(`還有 ${unanswered.length} 題沒作答,確定要交卷嗎?`)) return;
    }

    const btn = document.getElementById('submitQuizBtn');
    if (btn) { btn.disabled = true; btn.textContent = '送出中…'; }

    try {
      await Cloud.submitAnswers(this.classInfo.classId, quiz.id, Cloud.uid, {
        studentId: this.classInfo.studentId,
        studentName: this.classInfo.name,
        answers: this.draftAnswers
      });
      toast(quiz.settleAt && Date.now() < quiz.settleAt
        ? `✦ 已交卷!交卷順序已記錄,成績 ${formatSettleAt(quiz.settleAt)} 公布`
        : '✦ 已交卷!老師結算後積分會加到你的守護獸');
      this.activeQuiz = null;
      await this.refresh();
    } catch (e) {
      console.error(e);
      toast('交卷失敗:' + e.message);
      if (btn) { btn.disabled = false; btn.textContent = '交 卷'; }
    }
  }
});
