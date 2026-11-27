/* ============================================
   學生端:作業繳交
   ────────────────────────────────────────────
   檔案傳到**老師的 Google 雲端硬碟**,不經過這個系統的資料庫 ——
   Firebase 的免費空間是以 GB 計的,一個學期的作業照片就吃得完,
   而且吃完之後連點名和積分都會開始寫不進去。

   學生這邊只做三件事:
     1. 用他自己的 Google 帳號授權一次(只會碰到他自己上傳的那幾個檔案)
     2. 把檔案傳進老師那個作業資料夾
     3. 回報一筆「我交了,檔案在這裡」給老師

   檔名由系統決定(601-07-許伯瑋-…),學生不必自己改 ——
   這本來就是老師最花時間的地方。
============================================ */
Object.assign(StudentApp, {

  hwUploading: null,     // { hwId, percent }

  /* 哪些作業還要交。已經交過的留著給他看,但不再催。 */
  homeworkList() {
    return (this.homework || []).filter(h => h && h.driveFolderId);
  },

  homeworkPending() {
    return this.homeworkList().filter(h => !(this.myHwSubs || {})[h.id]).length;
  },

  renderHomeworkTab() {
    const list = this.homeworkList();
    if (!list.length) {
      return this.pageEmpty('📝', '目前沒有要交的作業',
        '老師開放繳交之後,作業會出現在這裡。');
    }
    const mine = this.myHwSubs || {};
    return `
      <div class="hw-stu-list">
        ${list.map(h => this.homeworkCard(h, mine[h.id])).join('')}
      </div>`;
  },

  homeworkCard(hw, sub) {
    const up = this.hwUploading && this.hwUploading.hwId === hw.id
      ? this.hwUploading : null;
    const overdue = hw.dueDate && !sub
      && Date.now() > new Date(hw.dueDate + 'T23:59:59').getTime();

    return `
      <div class="hw-stu-card ${sub ? 'is-done' : ''}">
        <div class="hw-stu-head">
          <div>
            <div class="hw-stu-name">${escapeHtml(hw.name)}</div>
            ${hw.description
              ? `<div class="hw-stu-desc">${escapeHtml(hw.description)}</div>` : ''}
          </div>
          ${sub ? '<span class="hw-stu-chip done">已繳交</span>'
                : overdue ? '<span class="hw-stu-chip over">已逾期</span>' : ''}
        </div>
        <div class="hw-stu-meta">
          ${hw.dueDate ? `<span>期限:${escapeHtml(hw.dueDate)}</span>` : ''}
          ${hw.submissionPoints
            ? `<span>繳交可得 ${hw.submissionPoints} 分</span>` : ''}
        </div>

        ${up ? `
          <div class="hw-stu-progress"><i style="width:${up.percent}%"></i></div>
          <div class="hw-stu-note">上傳中 ${up.percent}%…先別關掉這一頁</div>`
        : sub ? `
          <div class="hw-stu-note">
            你交的是「${escapeHtml(sub.fileName || '檔案')}」。
            再傳一次會換成新的那一份。
          </div>
          <label class="btn btn-ghost btn-small hw-stu-pick">
            重新繳交
            <input type="file" hidden
                   onchange="StudentApp.pickHomeworkFile('${hw.id}', this)" />
          </label>`
        : `
          <label class="btn btn-accent btn-small hw-stu-pick">
            選擇檔案繳交
            <input type="file" hidden
                   onchange="StudentApp.pickHomeworkFile('${hw.id}', this)" />
          </label>
          <span class="hw-stu-note">檔名會自動改成你的班級和座號,不用自己改</span>`}
      </div>`;
  },

  /* 一份作業最大 50MB。不是技術限制,是教學判斷:
     小學生交的作業不該是一支未剪輯的長片,而且教室的上傳頻寬
     會讓全班卡在那裡。擋在這裡比傳到一半失敗好。 */
  HW_MAX_MB: 50,

  async pickHomeworkFile(hwId, input) {
    const file = input.files && input.files[0];
    input.value = '';                        // 讓同一個檔案可以再選一次
    if (!file) return;

    const hw = this.homeworkList().find(h => h.id === hwId);
    if (!hw) return;

    if (file.size > this.HW_MAX_MB * 1024 * 1024) {
      toast(`檔案太大了(上限 ${this.HW_MAX_MB}MB)—— 影片請先壓縮或剪短`);
      return;
    }

    const me = this.student || {};
    const name = Drive.fileName(
      hw.className || (this.classInfo && this.classInfo.name) || '',
      me.seatNumber || me.number || '', me.name || '', file.name);

    try {
      this.hwUploading = { hwId, percent: 0 };
      this.render();

      await Drive.auth(false);
      const res = await Drive.upload(file, hw.driveFolderId, name, p => {
        this.hwUploading = { hwId, percent: p };
        const bar = document.querySelector('.hw-stu-card .hw-stu-progress i');
        if (bar) bar.style.width = p + '%';
      });

      await Cloud.submitHomework(this.classId, hwId, {
        fileId: res.id, fileName: res.name, fileUrl: res.webViewLink || '',
        studentId: me.id || ''
      });

      this.myHwSubs = this.myHwSubs || {};
      this.myHwSubs[hwId] = { fileName: res.name, at: Date.now() };
      toast('✓ 交出去了');
    } catch (e) {
      console.error('[作業繳交]', e);
      toast(e.message || '繳交失敗,再試一次');
    } finally {
      this.hwUploading = null;
      this.render();
    }
  }
});


/* ============================================
   學生端:守護獸的房間(擺設)
============================================ */
Object.assign(StudentApp, {

  toggleRoomEdit() {
    PetRoom.setEditing(!PetRoom.editing);
    this.render();
  },

  /* 換房間風格。只能換自己有的 —— 資料被改過也不會憑空多一種。 */
  pickRoomStyle(id) {
    if (!RoomShop.hasStyle(this.student, id)) {
      toast('這一種房間風格還沒換到');
      return;
    }
    if (!PetRoom.setStyle(id)) return;
    if (PetRoom.onChange) PetRoom.onChange(PetRoom.placed);
    this.render();
  },

  /* 下面那一排:點一下擺進房間,再點一下收起來。
     沒買過的擺不進去 —— 資料被改過也不會憑空多一件家具。 */
  toggleRoomItem(id) {
    if (!RoomShop.has(this.student, id)) {
      toast('這件家具還沒換到');
      return;
    }
    const inRoom = PetRoom.placed.some(p => p.id === id);
    if (inRoom) PetRoom.remove(id);
    else PetRoom.add(id);
    this.render();
  }
});
