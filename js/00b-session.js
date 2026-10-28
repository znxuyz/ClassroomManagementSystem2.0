/* ============================================
   登入與班級切換
   ────────────────────────────────────────────
   啟動流程:
     1. Cloud.init() 成功 → 顯示登入畫面,等 Google 登入
     2. 登入後判斷身份:
        · 名下有班級 或 role=teacher → 老師,進入班級選擇
        · rosterIndex 查得到 email     → 學生,進入學生端
        · 兩者皆無                     → 顯示「請老師先匯入你的信箱」
     3. Cloud.init() 失敗 → 完全退回舊版單機模式
============================================ */

const Session = {

  /* 系統啟動點,取代舊版直接呼叫 init() */
  async boot() {
    const ok = Cloud.init();
    if (!ok) {
      // 沒有網路或 SDK 掛掉:維持舊行為,資料存本機
      updateSyncStatus('local');
      initLocalMode();
      return;
    }

    showAuthView();
    Cloud.onAuthChanged(async user => {
      if (!user) {
        showAuthView();
        return;
      }
      try {
        state.user = await Cloud.getOrCreateUser(user);
        await this.route();
      } catch (e) {
        console.error('[Session] 登入後處理失敗:', e);
        toast('讀取帳號資料失敗:' + e.message);
        showAuthView();
      }
    });
  },

  /* 依身份決定進入老師端或學生端 */
  async route() {
    const email = (state.user.email || '').toLowerCase();
    const myClasses = await Cloud.listTeacherClasses(state.user.uid);

    if (myClasses.length > 0 || state.user.role === 'teacher') {
      /* 名下有班級就當老師用 —— 但如果帳號文件上的 role 還不是 teacher,
         安全規則會擋下「建立新班級」。先講清楚,免得按下去才發現。 */
      if (state.user.role !== 'teacher') {
        console.warn('[Session] 這個帳號有班級,但 users 文件的 role 不是 teacher');
        setTimeout(() => toast(
          '提醒:這個帳號還沒被標記為老師,無法新增班級。' +
          '請到 Firebase Console 把 users 裡你的 role 改成 teacher'
        ), 1200);
      }
      state.myClasses = myClasses;
      showClassPicker();
      return;
    }

    const studentClasses = await Cloud.findMyClasses(email);
    if (studentClasses.length > 0) {
      state.myClasses = studentClasses;
      showStudentClassPicker();
      return;
    }

    // 沒有任何身份。老師身分只能由管理者在 Firebase Console 指定,
    // 所以這裡不給「我是老師」的選項,只告訴他要請老師加入名冊。
    showNotEnrolled();
  },

  async signIn() {
    try {
      await Cloud.signInWithGoogle();
    } catch (e) {
      if (e.code === 'auth/popup-closed-by-user') return;
      console.error(e);
      toast('登入失敗:' + e.message);
    }
  },

  async signOut() {
    await flushCloudSave();
    stopWatchingClass();
    if (typeof QuizWatch !== 'undefined') QuizWatch.stopAll();
    if (typeof PurchaseWatch !== 'undefined') PurchaseWatch.stop();
    if (typeof TerritoryGame !== 'undefined') TerritoryGame.stop();
    if (typeof SkillAdmin !== 'undefined') SkillAdmin.stop();
    if (typeof TerritoryWeekly !== 'undefined') TerritoryWeekly.stop();
    if (StudentApp.unsubPurchases) StudentApp.unsubPurchases();
    if (StudentApp.unsub) StudentApp.unsub();
    if (StudentApp.unsubTQuestions) StudentApp.unsubTQuestions();
    await Cloud.signOut();
    state.classId = null;
    state.user = null;
    location.reload();
  },

  /* ---------- 老師:建立與開啟班級 ---------- */

  async createClass(className, teacherName) {
    const blank = {
      className,
      teacherName,
      students: [],
      rules: [...DEFAULT_RULES],
      attendance: {},
      seatingLayouts: [],
      groupSets: [],
      contactBook: {},
      homework: [],
      classTasks: [],
      shopHistory: [],
      shopItems: [],
      tqRev: 0,
      quizzes: [],
      skills: { ...SKILL_DEFAULTS },
      skillConsumed: {},
      territoryWeekly: { ...TERRITORY_WEEKLY_DEFAULTS }
    };
    const { id } = await Cloud.createClass(
      state.user.uid, className, teacherName, blank
    );
    state.myClasses = await Cloud.listTeacherClasses(state.user.uid);
    await this.openClass(id);
  },

  /* 載入某個班級的資料到 state,並進入主介面。
     SwitchHUD.mark() 在沒開提示時是空操作,所以正常開班也能照呼叫。 */
  async openClass(classId) {
    await SwitchHUD.step('load');
    const doc = await Cloud.loadClass(classId);
    if (!doc) {
      toast('找不到這個班級,可能已被刪除');
      SwitchHUD.fail('找不到這個班級,可能已被刪除');
      return;
    }

    await SwitchHUD.step('apply');
    resetPerClassUiState();
    applyBlobToState(doc.blob || {});
    state.classId = classId;
    state.joinCode = doc.joinCode;
    state.className = doc.className || state.className;
    state.teacherName = doc.teacherName || state.teacherName;
    updateSyncStatus('saved');

    /* 題庫不在主文件裡,要另外讀(8 筆)。開局會檢查題庫空不空,
       所以一定要等它載完才接上監聽。 */
    await QuestionBank.load(classId, doc.blob || {});

    /* 開班就先把公開名冊與個人私有資料寫上去(全部重寫一次)。
       學生端讀的是這兩份,老師開過班它們才會存在 —— 所以不能等到
       第一次加分才寫,否則剛開學還沒加分前學生什麼都看不到。 */
    Roster.reset();
    Roster.flush(true)
      .then(r => console.info(`[名冊] 已更新:公開名冊 ${r.roster} 份、個人資料 ${r.mine} 份`))
      .catch(e => console.warn('[名冊] 開班時更新失敗:', e.message));

    await SwitchHUD.step('attach');
    watchCurrentClass();
    PurchaseWatch.start();
    TerritoryGame.start();
    SkillAdmin.start();
    TerritoryWeekly.start();
    watchPetChoices();
    // 到了統一結算時間的測驗,老師一開系統就算完,不必先切到測驗分頁
    QuizWatch.startDueTimer();

    await SwitchHUD.step('render');
    showApp();
    renderActiveView();      // 換班後,目前停留的那一頁也要換成新班級的內容

    // 每天第一次開這個班時留一份快照(不擋畫面)
    /* 用 serializeStateForBackup() 而不是 doc.blob —— 內容一樣,
       但多了題庫。「還原到某一天」要把題庫也還原回去才對得起這個名字。 */
    Cloud.saveDailyBackup(classId, serializeStateForBackup())
      .then(made => { if (made) Cloud.pruneBackups(classId).catch(() => {}); })
      .catch(e => console.warn('[備份] 每日快照失敗:', e.message));

    /* 上一次有變更沒送出去的話(斷網、或存檔還沒送出就關掉分頁),
       在這裡問老師要用哪一邊 —— 放在畫面畫完之後,他才看得到是哪個班。 */
    offerLocalRecovery(classId, doc.blob || {});

    // 收進學生自己挑好的守護獸。換班時等它跑完再收起提示,
    // 這樣提示消失的瞬間畫面就是最終狀態,不會又跳一下。
    const pending = applyPendingPetChoices();
    if (SwitchHUD.active) await pending;
  },

  /* 切班前先把未送出的寫入補完,避免資料留在上一班 */
  async switchClass(classId) {
    const target = state.myClasses.find(c => c.id === classId);
    SwitchHUD.show(target ? target.className : '');

    try {
      await SwitchHUD.step('save');
      await flushCloudSave();

      await SwitchHUD.step('detach');
      stopWatchingClass();
      QuizWatch.stopAll();
      PurchaseWatch.stop();
      TerritoryGame.stop();
      SkillAdmin.stop();
      TerritoryWeekly.stop();

      await this.openClass(classId);
      await SwitchHUD.finish(state.className);
    } catch (e) {
      console.error('[Session] 切換班級失敗:', e);
      SwitchHUD.fail('切換失敗:' + e.message);
      // 下拉要退回實際還停留的班級,不然選單寫著 602、資料卻還是 601
      renderClassSwitcher();
    }
  }
};

/* ============================================
   班級資料的即時同步
   ────────────────────────────────────────────
   老師可能同時開著電腦和平板,或是學生選了守護獸。
   監聽班級文件,別的地方改了就把畫面補上。
============================================ */

let _classUnsub = null;

function watchCurrentClass() {
  stopWatchingClass();
  if (!isCloudMode()) return;

  _classUnsub = Cloud.watchClass(state.classId, doc => {
    // 自己還有沒送出的變更時先不套用,否則會把還沒寫回雲端的操作蓋掉。
    // 那筆寫入送出後,伺服器會再推一次,屆時兩邊本來就一致。
    if (_cloudSavePending) return;

    const keepSelection = state.selectedStudentId;
    const revBefore = state.tqRev || 0;
    applyBlobToState(doc.blob || {});
    state.selectedStudentId = keepSelection;
    state.className = doc.className || state.className;

    renderAll();
    updateSyncStatus('saved');

    /* 題庫不在主文件裡,所以別台改了題目這裡不會自動收到。
       主文件裡留了一個計數器 tqRev,改題時 +1 —— 看到它變了才去
       重讀分片。題庫幾乎不變,所以這 8 筆讀取平常不會發生。 */
    if ((state.tqRev || 0) !== revBefore) {
      QuestionBank.load(state.classId, doc.blob || {})
        .then(n => { console.info(`[題庫] 別台改了題庫,已重新載入 ${n} 題`); renderAll(); })
        .catch(e => console.warn('[題庫] 重新載入失敗:', e.message));
    }
  });
}

function stopWatchingClass() {
  if (_classUnsub) {
    _classUnsub();
    _classUnsub = null;
  }
  if (_petChoiceUnsub) {
    _petChoiceUnsub();
    _petChoiceUnsub = null;
  }
}

/* ============================================
   換班時要清掉的暫存狀態
   ────────────────────────────────────────────
   這些不在雲端 blob 裡,但都屬於某一個班:座位表排到一半的樣子、
   抽籤紀錄、正在看的日期。不清掉的話,換班後座位表還擺著上一班的人
   (學生 id 對不上,格子會變成空的),抽籤紀錄也還是上一班的。

   只在開啟/切換班級時呼叫,不能放進 applyBlobToState() ——
   那個函式每次雲端推送都會跑,會把老師正在排的座位表洗掉。
============================================ */
function resetPerClassUiState() {
  state.currentLayout = null;
  state.pickerHistory = [];
  state.pickerLastResult = [];
  state.pendingPetSelection = null;
  state.pendingPetSpecies = null;
  state.currentAttendanceDate = null;
  state.currentContactDate = null;
  /* 題庫已經不在主文件裡了(見 js/03c-question-bank.js),所以換班時
     不會被新班級的 blob 蓋掉 —— 要在這裡清掉,否則會看到上一班的題目。
     清完由 openClass() 的 QuestionBank.load() 指派。 */
  state.territoryQuestions = [];
}

/* ============================================
   把雲端 blob 套進 state,並補齊舊資料缺少的欄位
============================================ */
function applyBlobToState(blob) {
  /* 把這個版本不認得的欄位留著,存檔時原封不動寫回去。
     沒有這一步,舊分頁存一次就會把新版本的資料整個抹掉。 */
  state._carryOver = {};
  Object.keys(blob || {}).forEach(k => {
    if (!KNOWN_BLOB_KEYS.includes(k)) state._carryOver[k] = blob[k];
  });

  /* 雲端的格式比這個分頁新,代表這個分頁是舊的(通常是瀏覽器快取)。
     讓它繼續寫會把新版本的資料寫壞,所以直接封鎖寫入並要求重新整理。 */
  state._blobNewer = Number(blob && blob.schema || 0) > BLOB_SCHEMA;
  if (state._blobNewer) warnStaleVersion();

  state.className     = blob.className || '';
  state.teacherName   = blob.teacherName || '';
  state.students      = blob.students || [];
  state.rules         = blob.rules && blob.rules.length ? blob.rules : [...DEFAULT_RULES];
  state.attendance    = blob.attendance || {};
  state.seatingLayouts = blob.seatingLayouts || [];
  state.groupSets     = (blob.groupSets || []).map(gs => ({
    ...gs,
    groups: decodeGroups(gs.groups)
  }));
  state.currentGroups = decodeGroups(blob.currentGroups);
  state.contactBook   = blob.contactBook || {};
  state.homework      = blob.homework || [];
  state.classTasks    = blob.classTasks || [];
  state.shopHistory   = blob.shopHistory || [];
  state.shopItems     = blob.shopItems || [];
  /* 題庫搬到 classes/{id}/tqbank 了(見 js/03c-question-bank.js)。
     這裡只在「blob 真的帶著這個欄位」時才套用 ——
       · 舊班級、以及還原回來的舊備份:帶著,當成搬移的來源
       · 現在的 blob:沒有這個欄位。這時候絕對不能設成 []
         —— applyBlobToState() 每次雲端推送都會跑,設空的話
         老師改題改到一半,題庫會憑空消失。
     正常開班時由 openClass() 的 QuestionBank.load() 指派。 */
  if ('territoryQuestions' in blob) state.territoryQuestions = blob.territoryQuestions || [];
  state.tqRev         = blob.tqRev || 0;
  state.quizzes       = blob.quizzes || [];
  state.skills        = SkillEngine.cfg(blob.skills);
  state.skillConsumed = blob.skillConsumed || {};
  state.territoryWeekly = blob.territoryWeekly || { ...TERRITORY_WEEKLY_DEFAULTS };
  state.selectedStudentId = null;
  state.students.forEach(migrateStudent);

}

/* ============================================
   套用學生自選的守護獸
   ────────────────────────────────────────────
   老師端每次開班時自動執行。只填補「還沒有守護獸」的學生,
   老師已經指定過的不會被學生的選擇蓋掉。
============================================ */
async function applyPendingPetChoices() {
  if (!isCloudMode()) return;

  let choices;
  try {
    choices = await Cloud.listPetChoices(state.classId);
  } catch (e) {
    console.warn('[Cloud] 讀取守護獸選擇失敗:', e);
    return;
  }
  if (choices.length === 0) return;

  const n = applyChoiceList(choices);
  if (n.picked > 0 || n.renamed > 0) {
    save();
    renderAll();
    const parts = [];
    if (n.picked > 0) parts.push(`${n.picked} 位選好守護獸`);
    if (n.renamed > 0) parts.push(`${n.renamed} 位改了名字`);
    toast('✦ ' + parts.join('、'));
  }
}

/* ============================================
   套用學生送過來的「選守護獸」與「改名」
   ────────────────────────────────────────────
   學生寫不了班級資料(那一份只有導師碰得到),所以他們是把請求寫到
   petChoices 子集合,由老師這一端套用。

   改名的次數記在老師這邊 —— 學生那邊看得到還剩幾次,但真正扣的是
   這裡。所以買一張改名卡就只能改一次,改前端也沒有用。
============================================ */
function applyChoiceList(choices) {
  let picked = 0, renamed = 0;

  (choices || []).forEach(c => {
    const student = state.students.find(s => s.id === c.studentId);
    if (!student) return;

    // 選守護獸:只填補「還沒有」的,老師指定過的不會被蓋掉
    if (!student.pet && PET_SPECIES.some(p => p.id === c.pet)) {
      student.pet = c.pet;
      if (c.petName) student.petName = c.petName;
      picked++;
    }

    /* 改名。三個條件缺一不可:
       · 真的還有次數(買一張卡只能改一次)
       · 這一筆請求還沒套用過(比對時間戳,不然每次重畫都會再扣一次)
       · 名字合法 */
    const want = (c.rename || '').trim();
    if (want
        && (student.renameLeft || 0) > 0
        && c.renameAt
        && c.renameAt !== student.renameAppliedAt
        && want.length <= PET_NAME_MAX
        && want !== student.petName) {
      student.petName = want;
      student.renameLeft = Math.max(0, (student.renameLeft || 0) - 1);
      student.renameAppliedAt = c.renameAt;
      renamed++;
    }
  });

  return { picked, renamed };
}

/* 老師開著的時候即時套用 —— 學生改完名字不必等到下次開班。 */
let _petChoiceUnsub = null;

function watchPetChoices() {
  if (_petChoiceUnsub) { _petChoiceUnsub(); _petChoiceUnsub = null; }
  if (!isCloudMode()) return;
  _petChoiceUnsub = Cloud.watchPetChoices(state.classId, list => {
    const n = applyChoiceList(list);
    if (n.picked === 0 && n.renamed === 0) return;
    save();
    renderAll();
    if (n.renamed > 0) toast(`✦ ${n.renamed} 位學生幫守護獸改了名字`);
    else toast(`✦ ${n.picked} 位學生選好守護獸`);
  });
}

/* ============================================
   單機模式 — 與改版前行為相同
============================================ */
function initLocalMode() {
  const saved = Storage.load();
  if (saved) {
    applyBlobToState(saved);
    showApp();
  } else {
    showSetup();
  }
}
