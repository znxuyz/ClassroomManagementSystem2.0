/* ============================================
   積木冒險 — 全班進度牆(投影用)
   ────────────────────────────────────────────
   投到教室前面那面牆:每一位的守護獸停在他現在走到的那一關,
   後面跟著一排星星。老師一眼看得出

     · 誰已經跑到最後面了(可以去幫別人)
     · 誰還卡在第一關(該過去看一下)
     · 全班卡在同一關的話,那是**題目的問題**,不是孩子的問題

   最後一條才是這面牆真正的價值。沒有它,老師要一個一個點開才知道。

   ── 刻意的決定 ──
   · **照座號排,不照進度排。** 照進度排就是一張公開的排名表,
     最後一名每一節課都被全班看著。這是練習,不是比賽。
   · 卡住的那幾位不特別標紅。老師看得出來就夠了,不必讓全班也看到。
   · 有人過關的時候那一隻獸會跳一下 —— 那一刻是全班一起看的。
============================================ */

const BlockWall = {
  on: false,
  _timer: null,

  open() {
    this.on = true;
    document.documentElement.classList.add('projector-full');
    this.render();
    // 有人交作品時 BlockWork 會重畫;這裡再補一個慢速的心跳,
    // 免得某些更新路徑沒有通知到牆上
    this._timer = setInterval(() => this.render(), 4000);
  },

  close() {
    this.on = false;
    document.documentElement.classList.remove('projector-full');
    clearInterval(this._timer);
    this._timer = null;
    const el = document.getElementById('blockWall');
    if (el) el.remove();
    BlockTasks.render();
  },

  /* 一位學生在每一關拿了幾顆星 */
  rowOf(student, tasks) {
    return tasks.map(t => ((t.stars || {})[student.id]) || 0);
  },

  render() {
    if (!this.on) return;
    const tasks = (state.blockTasks || []).filter(t => t.status === 'open');
    let el = document.getElementById('blockWall');
    if (!el) {
      el = document.createElement('div');
      el.id = 'blockWall';
      document.body.appendChild(el);
    }

    const rows = (state.students || []).map(s => ({
      s, stars: this.rowOf(s, tasks)
    }));
    const totalStars = rows.reduce((n, r) => n + r.stars.reduce((a, b) => a + b, 0), 0);
    const maxStars = Math.max(1, rows.length * tasks.length * 3);
    const allDone = rows.filter(r => r.stars.every(n => n > 0)).length;

    /* 卡關偵測:某一關「有人在這裡停著」的人數。
       一關擋住半個班,通常是題目敘述不清楚,不是孩子不會。 */
    const stuck = tasks.map((t, i) =>
      rows.filter(r => r.stars[i] === 0 && (i === 0 || r.stars[i - 1] > 0)).length);
    const worst = stuck.indexOf(Math.max(...stuck));

    el.innerHTML = `
      <div class="wall" style="--cols:${tasks.length}; --rows:${Math.max(1, rows.length)}">
        <div class="wall-head">
          <div class="wall-title">積木冒險 · 全班進度</div>
          <div class="wall-stats">
            <span><b>${totalStars}</b> / ${maxStars} 顆星</span>
            <span><b>${allDone}</b> 位全部過關</span>
          </div>
          <button class="btn btn-ghost btn-small wall-exit"
                  onclick="BlockWall.close()">離開</button>
        </div>

        <div class="wall-cols">
          <span class="wall-col-name"></span>
          ${tasks.map((t, i) => `
            <span class="wall-col ${i === worst && stuck[i] > 2 ? 'is-stuck' : ''}">
              <b>${i + 1}</b>${escapeHtml(t.name)}
              ${i === worst && stuck[i] > 2 ? `<i>${stuck[i]} 位卡在這裡</i>` : ''}
            </span>`).join('')}
        </div>

        <div class="wall-grid">
          ${rows.map(r => `
            <div class="wall-row">
              <span class="wall-who">
                <span class="wall-pet">${r.s.pet ? PetEngine.getIcon(r.s) : '❓'}</span>
                <span class="wall-name">${escapeHtml(r.s.name)}</span>
              </span>
              ${r.stars.map((n, i) => `
                <span class="wall-cell ${n ? 'done' : ''} ${
                  n === 0 && (i === 0 || r.stars[i - 1] > 0) ? 'here' : ''}">
                  ${n ? '★'.repeat(n) : ''}
                </span>`).join('')}
            </div>`).join('')}
        </div>

        ${tasks.length === 0 ? `
          <div class="wall-empty">還沒有開放的題目 —— 開放之後這面牆才有東西。</div>` : ''}
      </div>`;
  }
};
