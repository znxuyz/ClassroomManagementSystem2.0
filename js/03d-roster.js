/* ============================================
   公開名冊 / 個人私有資料
   ────────────────────────────────────────────
   學生端原本直接監聽整份班級文件。那份文件裡有每一位學生的

     · history     加分明細,含**扣分原因**(「未帶課本」「與同學爭執」)
     · quizResults 每一份測驗的分數
     · currentPoints 可用積分
     · email       Google 帳號

   也就是說任何一個學生打開開發者工具,就能看到全班的這些東西。
   積分互相看得到是刻意的(排行榜、投影模式本來就全班一起看),
   但扣分原因不是 —— 那是會在小學班級裡出事的東西。

   Firestore 的安全規則是「整份文件」的粒度,擋不了個別欄位,
   所以唯一的辦法是把資料分開存:

     classes/{id}/public/roster   別人該看得到的(姓名、累積經驗、守護獸)
     classes/{id}/mine/{學號}      只有本人與導師看得到的

   順便省下很多流量:主文件約 74 KB,其中四成是別人的 history。
   老師按一次加分,原本全班 28 台裝置各收一次 74 KB;
   現在收的是約 2 KB 的名冊,只有被加分的那一位會多讀自己那一份。

   ── 上線順序 ──
   學生端讀不到名冊時會自動退回讀主文件(見 js/student/01-app.js),
   所以這一版推上去不會有空窗:老師開過的班就用名冊,還沒開過的
   照舊。等五個班都開過一次、名冊都在了,才把主文件的讀取權限
   收成「只有導師」—— 那一步才是真正把洞補起來,而且不能更早做,
   否則老師還沒開過的班,學生會整個進不去。
============================================ */

const Roster = {
  /* 上一次寫上去的內容,用來判斷誰真的變了 —— 只寫變了的那幾位。 */
  _lastRoster: null,
  _lastMine: {},

  /* 別人看得到的部分。刻意列舉而不是「扣掉幾個欄位」——
     以後有人在 student 上加了新欄位,預設就是不外流。 */
  publicEntry(s) {
    return {
      id: s.id,
      name: s.name,
      totalPoints: s.totalPoints || 0,
      pet: s.pet || null,
      petName: s.petName || ''
    };
  },

  /* 只有本人看得到的部分。 */
  privateEntry(s) {
    return {
      id: s.id,
      currentPoints: s.currentPoints || 0,
      totalPoints: s.totalPoints || 0,
      history: s.history || [],
      quizResults: s.quizResults || {},
      inventory: s.inventory || [],
      renameLeft: s.renameLeft || 0,   // 還剩幾次改名(改名卡兌換來的)
      at: Date.now()
    };
  },

  /* 從一份 blob 蓋出公開名冊。
     預設用目前開著的班(state),但也接受別的班的 blob ——
     這樣才能不開班就幫所有班級補建名冊(見 buildAllRosters)。

     blob 裡的 groupSets/currentGroups 已經是存檔格式(encodeGroups 過的),
     而 state 裡的是解碼後的,所以兩邊要分開處理。 */
  build(blob) {
    if (blob) {
      return {
        className: blob.className || '',
        students: (blob.students || []).map(s => this.publicEntry(s)),
        rules: blob.rules || [],
        shopItems: blob.shopItems || [],
        skills: blob.skills || null,
        currentGroups: blob.currentGroups || [],
        groupSets: blob.groupSets || [],
        at: Date.now()
      };
    }
    return {
      className: state.className,
      students: (state.students || []).map(s => this.publicEntry(s)),
      rules: state.rules || [],
      shopItems: state.shopItems || [],
      skills: state.skills || null,
      currentGroups: encodeGroups(state.currentGroups),
      groupSets: (state.groupSets || []).map(gs => ({
        ...gs, groups: encodeGroups(gs.groups)
      })),
      at: Date.now()
    };
  },

  /* 幫「不是現在開著的那個班」建名冊。
     老師不必一個一個班開過去 —— 直接讀那個班的主文件,蓋出名冊寫回去。
     回傳寫了幾份個人資料。 */
  async flushFor(classId, blob) {
    await Cloud.savePublicRoster(classId, this.build(blob));
    const docs = {};
    (blob.students || []).forEach(s => { docs[s.id] = this.privateEntry(s); });
    await Cloud.saveStudentPrivate(classId, docs);
    return Object.keys(docs).length;
  },

  /* 老師端每次存檔後跟著寫。回傳 { roster, mine } 各寫了幾份。

     刻意放在主文件寫入**之後**:名冊是衍生資料,主文件才是本體。
     名冊寫失敗只是學生晚一點看到(而且會退回讀主文件),
     但主文件寫失敗就是真的掉資料。 */
  async flush(all) {
    if (!isCloudMode()) return { roster: 0, mine: 0 };
    const classId = state.classId;
    let wroteRoster = 0;

    try {
      const next = this.build();
      // at 每次都不一樣,比較時要排除,否則永遠判定「變了」
      const cmp = o => JSON.stringify({ ...o, at: 0 });
      if (all || !this._lastRoster || cmp(this._lastRoster) !== cmp(next)) {
        await Cloud.savePublicRoster(classId, next);
        this._lastRoster = next;
        wroteRoster = 1;
      }
    } catch (e) {
      console.warn('[名冊] 公開名冊寫入失敗:', e.code || e.message);
    }

    let wroteMine = 0;
    try {
      const docs = {};
      (state.students || []).forEach(s => {
        const entry = this.privateEntry(s);
        const key = JSON.stringify({ ...entry, at: 0 });
        if (all || this._lastMine[s.id] !== key) {
          docs[s.id] = entry;
          this._lastMine[s.id] = key;
        }
      });
      wroteMine = await Cloud.saveStudentPrivate(classId, docs);
    } catch (e) {
      /* 寫失敗就把基準清掉,下一次整批重試 ——
         不清的話那幾位會被當成「已經寫過」,永遠補不上。 */
      console.warn('[名冊] 個人資料寫入失敗,下次重試:', e.code || e.message);
      this._lastMine = {};
    }

    return { roster: wroteRoster, mine: wroteMine };
  },

  /* 換班時基準要清掉,否則會拿上一班的內容來比對,
     結果判定「沒變」而什麼都不寫。 */
  reset() {
    this._lastRoster = null;
    this._lastMine = {};
  }
};
