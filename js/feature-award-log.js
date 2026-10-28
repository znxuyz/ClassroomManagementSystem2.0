/* ============================================
   加分紀錄與調整
   ────────────────────────────────────────────
   加錯分是每天都會發生的事:點到隔壁那一位、規則按錯一格、
   同一件事被按了兩次。以前唯一的辦法是手動加一筆相反的分數,
   紀錄上就留下兩筆錯誤的痕跡,家長看報表時反而更難懂。

   這一塊直接接在加分面板下面,列出最近的幾筆,可以

     · 撤銷 —— 那一筆整個拿掉,分數退回去
     · 調整 —— 改分數或改原因,紀錄上只留下改好的那一筆

   撤銷正分會連 totalPoints 一起退,所以守護獸有可能退回上一階段 ——
   這是對的(那些經驗本來就不該給),但一定要講出來,不然老師會
   以為系統壞了。

   一個先天的誤差要說清楚:扣分當下如果可用積分不夠,是扣到 0 為止
   (見 awardPointsCore)。那一筆再撤銷,退回去的會比當初真正扣掉的多。
   這種情形很少,而且方向是對學生有利,所以就這樣。
============================================ */

const AwardLog = {
  /* 'student' = 只看選到的那一位;'class' = 全班最近的 */
  scope: 'student',
  LIMIT: 12,

  setScope(s) {
    this.scope = s;
    this.render();
  },

  /* 最近的幾筆。回傳的 time 就是鍵 —— 撤銷時靠它找回那一筆,
     用索引會因為前一次操作而整個錯位。 */
  recent() {
    const pool = (this.scope === 'student' && state.selectedStudentId)
      ? state.students.filter(s => s.id === state.selectedStudentId)
      : state.students;

    const out = [];
    pool.forEach(s => {
      (s.history || []).forEach(e => {
        out.push({
          sid: s.id, name: s.name,
          time: e.time || 0, points: e.points || 0, reason: e.reason || ''
        });
      });
    });
    return out.sort((a, b) => b.time - a.time).slice(0, this.LIMIT);
  },

  find(sid, time) {
    const student = getStudent(sid);
    if (!student) return null;
    const i = (student.history || []).findIndex(e => (e.time || 0) === time);
    return i < 0 ? null : { student, i, entry: student.history[i] };
  },

  /* 把一筆的影響倒回去(不動 history 本身) */
  _unapply(student, entry) {
    const p = entry.points || 0;
    if (p >= 0) {
      student.totalPoints = Math.max(0, student.totalPoints - p);
      student.currentPoints = Math.max(0, student.currentPoints - p);
    } else {
      student.currentPoints += -p;
    }
  },

  /* 把一筆的影響套上去 */
  _apply(student, points) {
    if (points >= 0) {
      student.totalPoints += points;
      student.currentPoints += points;
    } else {
      student.currentPoints = Math.max(0, student.currentPoints + points);
    }
  },

  undo(sid, time) {
    const hit = this.find(sid, time);
    if (!hit) { toast('這一筆已經不在了'); return; }
    const { student, i, entry } = hit;
    const label = `${entry.points > 0 ? '+' : ''}${entry.points} 分 · ${entry.reason || '未填原因'}`;
    if (!confirm(`要撤銷 ${student.name} 的「${label}」嗎?分數會退回去。`)) return;

    const before = student.pet ? PetEngine.getStage(student.totalPoints) : 0;
    this._unapply(student, entry);
    student.history.splice(i, 1);
    this._finish(student, before, `已撤銷 ${student.name} 的 ${label}`);
  },

  /* 安靜地收回某一筆 —— 不問、不跳提示、不重畫。
     給別的功能用的:作業取消標記、出席分收回,都要把當初發的那一筆
     原樣收回去。它們本來各自手算一次(而且都只退可用積分、歷程還留著
     那一筆),現在統一走這裡。
     回傳有沒有真的收回。 */
  revertAt(sid, time) {
    const hit = this.find(sid, time);
    if (!hit) return false;
    const { student, i, entry } = hit;
    this._unapply(student, entry);
    student.history.splice(i, 1);
    return true;
  },

  adjust(sid, time) {
    const hit = this.find(sid, time);
    if (!hit) { toast('這一筆已經不在了'); return; }
    const { student, entry } = hit;

    const raw = prompt(`${student.name} —— 改成幾分?(可正可負)`, String(entry.points));
    if (raw === null) return;
    const points = parseInt(raw, 10);
    if (isNaN(points) || points === 0) { toast('請輸入不是 0 的分數'); return; }

    const reason = (prompt('原因', entry.reason || '') || '').trim() || entry.reason || '自訂積分';
    if (points === entry.points && reason === entry.reason) return;

    const before = student.pet ? PetEngine.getStage(student.totalPoints) : 0;
    this._unapply(student, entry);
    this._apply(student, points);
    entry.points = points;
    entry.reason = reason;
    entry.editedAt = Date.now();          // 留下「被改過」的痕跡
    this._finish(student, before,
      `已改成 ${points > 0 ? '+' : ''}${points} 分 · ${reason}`);
  },

  /* 兩個操作共用的收尾:存檔、重畫、該講的話講出來 */
  _finish(student, stageBefore, msg) {
    updateClassTasksProgress();
    save();
    renderStudentList();
    renderSelectedStudent();
    renderProjector();

    const after = student.pet ? PetEngine.getStage(student.totalPoints) : 0;
    if (after < stageBefore) {
      toast(`${msg} —— 守護獸退回「${STAGE_NAMES[after]}」`);
    } else {
      toast(msg);
    }
  },

  render() {
    const box = document.getElementById('awardLogPanel');
    if (!box) return;

    /* 沒選人又沒在批次模式的時候,整塊收起來 —— 加分面板本身也是收起來的 */
    if (!state.selectedStudentId && !BatchAward.active) {
      box.style.display = 'none';
      return;
    }
    box.style.display = '';

    const list = this.recent();
    const one = this.scope === 'student' && state.selectedStudentId;
    const who = one ? (getStudent(state.selectedStudentId) || {}).name || '' : '';

    box.innerHTML = `
      <div class="panel-title award-log-head">
        <span>加分紀錄${one && who ? ' · ' + escapeHtml(who) : ' · 全班'}</span>
        <span class="award-log-scope">
          <button class="award-log-chip ${one ? 'on' : ''}" onclick="AwardLog.setScope('student')"
                  ${state.selectedStudentId ? '' : 'disabled'}>這一位</button>
          <button class="award-log-chip ${one ? '' : 'on'}" onclick="AwardLog.setScope('class')">全班</button>
        </span>
      </div>
      ${list.length === 0 ? `
        <div class="award-log-empty">還沒有紀錄</div>
      ` : `
        <div class="award-log-list">
          ${list.map(e => `
            <div class="award-log-row">
              <span class="award-log-pts ${e.points < 0 ? 'neg' : ''}">${e.points > 0 ? '+' : ''}${e.points}</span>
              <span class="award-log-text">
                ${one ? '' : `<b>${escapeHtml(e.name)}</b> · `}${escapeHtml(e.reason || '未填原因')}
                <span class="award-log-time">${this.when(e.time)}</span>
              </span>
              <span class="award-log-acts">
                <button class="award-log-btn"
                        onclick="AwardLog.adjust('${e.sid}', ${e.time})">調整</button>
                <button class="award-log-btn danger"
                        onclick="AwardLog.undo('${e.sid}', ${e.time})">撤銷</button>
              </span>
            </div>
          `).join('')}
        </div>
      `}
    `;
  },

  /* 「三分鐘前」比「14:32」好認 —— 老師找的是「我剛剛按錯的那一筆」 */
  when(t) {
    if (!t) return '';
    const d = Date.now() - t;
    if (d < 60000) return '剛剛';
    if (d < 3600000) return Math.floor(d / 60000) + ' 分鐘前';
    const dt = new Date(t);
    const hm = String(dt.getHours()).padStart(2, '0') + ':'
             + String(dt.getMinutes()).padStart(2, '0');
    if (d < 86400000 && dt.getDate() === new Date().getDate()) return hm;
    return (dt.getMonth() + 1) + '/' + dt.getDate() + ' ' + hm;
  }
};
