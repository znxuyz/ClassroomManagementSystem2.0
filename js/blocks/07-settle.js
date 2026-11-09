/* ============================================
   積木挑戰 — 收作品與給分(老師端)
   ────────────────────────────────────────────
   學生交出來的是**程式本身**,不是「我過了」。分數在這一端重判一次
   才發 —— 和測驗、兌換一樣,前端說的話不算數。
   (學生那邊自己檢查是為了即時知道哪裡錯,不是為了給分。)

   一位學生一題只給一次分:發過的記在 task.paid 裡,和作業繳交同一招
   (見 js/feature-homework.js 的 hw.paid)。學生改完再交一次不會再領一次,
   但老師看得到他後來交的版本。
============================================ */

const BlockWork = {
  unsub: null,
  all: [],          // [{ uid, studentId, name, work: { taskId: {program, at} } }]
  processing: false,

  start() {
    this.stop();
    if (!isCloudMode()) return;
    this.unsub = Cloud.watchBlockWork(state.classId, list => {
      this.all = list;
      this.settle();
      if (document.querySelector('#blocksView.view.active')) BlockTasks.render();
      this.updateBadge();
    });
  },

  stop() {
    if (this.unsub) { this.unsub(); this.unsub = null; }
    this.all = [];
  },

  /* 這一題這一位有沒有領過分 */
  paidOf(task) {
    if (!task.paid) task.paid = {};
    return task.paid;
  },

  /* 判全班、發分。
     只要有人交了新的東西就會跑一次 —— 老師開著系統就會自動收。 */
  settle() {
    if (this.processing) return;
    this.processing = true;
    try {
      let awarded = 0;
      const papers = {};
      (state.blockTasks || []).forEach(t => {
        if (t.status !== 'open') return;
        papers[t.id] = BlockJudge.compile(t);
      });

      this.all.forEach(doc => {
        const student = (state.students || []).find(s => s.id === doc.studentId)
          || (state.students || []).find(s => (s.email || '').toLowerCase() === (doc.email || '').toLowerCase());
        if (!student) return;

        Object.keys(doc.work || {}).forEach(taskId => {
          const task = (state.blockTasks || []).find(t => t.id === taskId);
          const paper = papers[taskId];
          if (!task || !paper || paper.error) return;

          const paid = this.paidOf(task);
          if (paid[student.id]) return;              // 已經發過了

          const r = BlockJudge.runCompiled(paper, doc.work[taskId].program);
          if (!r.pass) return;

          /* 星星在這一端重算一次 —— 學生交上來的那個數字只是他看到的,
             真正算數的是這裡(和分數一樣,前端說的話不算數)。
             用掉幾條提示沒辦法在這一端驗證,就採信學生那一邊,
             因為那只影響榮譽,不影響分數。 */
          const w = doc.work[taskId];
          task.stars = task.stars || {};
          const got = starsFor(task, w.program,
            { pass: true, hintsUsed: w.hintsUsed || 0 });
          if (got > (task.stars[student.id] || 0)) task.stars[student.id] = got;

          paid[student.id] = Date.now();
          if ((task.points || 0) > 0) {
            applyPointsToStudent(student.id, task.points, '積木挑戰「' + task.name + '」');
          }
          awarded++;
        });
      });

      if (awarded > 0) {
        save();
        renderAll();
        toast(`✦ 積木挑戰:${awarded} 位同學完成,已發分`);
      }
    } finally {
      this.processing = false;
    }
  },

  /* 某一題的完成狀況 */
  statusOf(taskId) {
    const task = (state.blockTasks || []).find(t => t.id === taskId);
    const paid = task ? (task.paid || {}) : {};
    const stars = task ? (task.stars || {}) : {};
    let submitted = 0;
    this.all.forEach(d => { if (d.work && d.work[taskId]) submitted++; });
    return {
      submitted,
      passed: Object.keys(paid).length,
      three: Object.values(stars).filter(n => n >= 3).length
    };
  },

  /* 某一位學生總共拿了幾顆星(技能解鎖與投影牆都要用) */
  starsOf(studentId) {
    return (state.blockTasks || []).reduce(
      (n, t) => n + (((t.stars || {})[studentId]) || 0), 0);
  },

  /* 某一位學生在某一題交了什麼(老師想看學生怎麼拼的) */
  workOf(taskId, studentId) {
    const doc = this.all.find(d => d.studentId === studentId);
    return (doc && doc.work && doc.work[taskId]) || null;
  },

  updateBadge() {
    const el = document.getElementById('blocksBadge');
    if (!el) return;
    let waiting = 0;
    (state.blockTasks || []).forEach(t => {
      if (t.status !== 'open') return;
      const paid = t.paid || {};
      this.all.forEach(d => {
        if (d.work && d.work[t.id] && !paid[d.studentId]) waiting++;
      });
    });
    el.textContent = waiting > 0 ? waiting : '';
    el.style.display = waiting > 0 ? '' : 'none';
  }
};
