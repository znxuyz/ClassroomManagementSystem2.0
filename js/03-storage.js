/* ============================================
   儲存模組
   ────────────────────────────────────────────
   兩種模式:
   · cloud — 已登入,資料存在 Firestore,localStorage 只當離線快取
   · local — 未登入或 Firebase 無法連線,行為與舊版完全相同

   對外只暴露 save() / Storage.load(),所有 feature-*.js 不需要修改。
============================================ */

const Storage = {
  KEY: 'guardian-classroom-v1',

  /* 每個班級各自的快取鍵,切班時不會互相覆蓋 */
  cacheKey(classId) {
    return classId ? `${this.KEY}:${classId}` : this.KEY;
  },

  load(classId) {
    try {
      const raw = localStorage.getItem(this.cacheKey(classId));
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.error('Load failed:', e);
      return null;
    }
  },

  save(data, classId) {
    try {
      localStorage.setItem(this.cacheKey(classId), JSON.stringify(data));
      return true;
    } catch (e) {
      console.error('Save failed:', e);
      return false;
    }
  },

  clear(classId) {
    localStorage.removeItem(this.cacheKey(classId));
    localStorage.removeItem(this.metaKey(classId));
  },

  /* ── 本機快取有沒有「還沒上傳的變更」 ──
     本機快取每次 save() 都立刻寫,雲端那邊是延遲 800 毫秒才送。
     所以「老師在走廊斷網、加了十個人的分、然後關掉分頁」的時候,
     那十筆只在這台裝置的 localStorage 裡 —— 而原本沒有任何地方會去讀它,
     下次開班直接拿雲端那份舊的覆蓋上去,那十筆就這樣消失了。

     這個旗標就是為了認出那種情況:排進雲端待寫時設上,寫成功才清掉。
     開班時看到它還在,就表示上一次沒寫完(見 offerLocalRecovery)。 */
  metaKey(classId) {
    return this.cacheKey(classId) + ':meta';
  },

  markDirty(classId) {
    try {
      localStorage.setItem(this.metaKey(classId),
        JSON.stringify({ dirty: true, at: Date.now() }));
    } catch (e) { /* 配額滿了也不該讓加分失敗 */ }
  },

  markSynced(classId) {
    try {
      localStorage.setItem(this.metaKey(classId),
        JSON.stringify({ dirty: false, at: Date.now() }));
    } catch (e) { /* 同上 */ }
  },

  meta(classId) {
    try {
      const raw = localStorage.getItem(this.metaKey(classId));
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }
};

/* ============================================
   把 state 抽成可儲存的純資料
   (排除 timer intervalId 這類執行期物件)
============================================ */

/* ============================================
   分組資料的格式轉換
   ────────────────────────────────────────────
   分組在記憶體裡是「陣列的陣列」:[[學生id, 學生id], [學生id]]。
   但 Firestore 不允許陣列裡再放陣列,整份儲存會被拒絕。
   所以寫出去時包成 [{members:[...]}, ...],讀回來再拆開。
   記憶體中的形狀維持不變,分組相關的程式都不用改。
============================================ */

function encodeGroups(groups) {
  return (groups || []).map(g => ({ members: Array.isArray(g) ? g : (g.members || []) }));
}

function decodeGroups(list) {
  return (list || []).map(g => Array.isArray(g) ? g : (g.members || []));
}

/* 存檔格式的版本。
   欄位有增減時就 +1 —— 下面的「比雲端舊就不准寫」靠它判斷。 */
const BLOB_SCHEMA = 1;

/* serializeState() 認得的欄位。
   不在這份清單裡、但雲端上有的東西會被原封不動帶回去(見 _carryOver)。 */
const KNOWN_BLOB_KEYS = [
  'schema', 'className', 'teacherName', 'students', 'rules', 'attendance',
  'seatingLayouts', 'groupSets', 'currentGroups', 'contactBook', 'homework',
  'classTasks', 'shopHistory', 'shopItems', 'territoryQuestions', 'quizzes',
  'skills', 'skillConsumed', 'territoryWeekly', 'tqRev'
];
/* territoryQuestions 還留在上面那張清單裡,但 serializeState() 已經不輸出它
   —— 留著是為了讓舊欄位被「認得」而不被 _carryOver 原封不動帶回去,
   這樣下一次存檔就會把主文件裡那 77 KB 清掉。 */

function serializeState() {
  return {
    /* 先鋪上「這個版本不認得的欄位」。
       存檔是整份覆蓋 blob,如果只寫自己認得的欄位,那麼一個還沒更新的
       分頁(瀏覽器快取舊的 JS)存一次,新版本才有的資料就永遠消失了。
       原封不動帶回去,舊版本就不會傷到新版本的資料。 */
    ...(state._carryOver || {}),
    schema: BLOB_SCHEMA,
    className: state.className,
    teacherName: state.teacherName,
    students: state.students,
    rules: state.rules,
    attendance: state.attendance,
    seatingLayouts: state.seatingLayouts,
    groupSets: (state.groupSets || []).map(gs => ({
      ...gs,
      groups: encodeGroups(gs.groups)
    })),
    // 未命名儲存的分組也要存,老師按過「產生分組」學生就看得到小組榜
    currentGroups: encodeGroups(state.currentGroups),
    contactBook: state.contactBook,
    homework: state.homework,
    classTasks: state.classTasks,
    shopHistory: state.shopHistory,
    shopItems: state.shopItems,
    /* territoryQuestions 不在這裡了 —— 它搬到 classes/{id}/tqbank。
       原因:主文件是整份覆蓋寫上去的,老師每按一次加分就會把整個
       題庫(529 題 ≈ 77 KB)重新上傳一次,而題庫幾乎不會變。
       詳見 js/03c-question-bank.js。 */
    tqRev: state.tqRev || 0,   // 題庫版本,別台看到它變了才去重讀分片
    quizzes: state.quizzes,
    skills: state.skills,         // 守護獸技能設定(開關、幾週刷新、起算時間)
    skillConsumed: state.skillConsumed,   // 已經結算吃掉的技能使用,避免重複套用
    territoryWeekly: state.territoryWeekly  // 蜂巢戰紀每週結算:開關、分數、已結算到第幾週
  };
}

/* ============================================
   備份用的存檔格式
   ────────────────────────────────────────────
   日常存檔(serializeState)刻意不含題庫 —— 它很大又幾乎不變,
   而主文件每按一次加分就整份重寫一次。

   但「備份」的意思是「這一份就能還原」,所以備份一定要含題庫,
   否則:
     · 下載的備份檔少了 529 題 —— 那是老師花最多時間累積的東西
     · 「還原到某一天」不會把題庫也還原回去,和它的名字不符

   還原端看到 blob 帶著 territoryQuestions 就會寫回分片
   (見 feature-settings.js 的 restoreBackup),所以兩邊是對稱的。
============================================ */
function serializeStateForBackup() {
  return {
    ...serializeState(),
    territoryQuestions: state.territoryQuestions || []
  };
}

/* ============================================
   Firestore 相容性檢查
   ────────────────────────────────────────────
   Firestore 對資料形狀有幾條硬性限制,違反時整份寫入會被拒絕,
   而 SDK 只回一句籠統的錯誤,不會告訴你是哪個欄位。
   儲存失敗時跑這個檢查,把確切路徑印到 Console。
============================================ */

const FIRESTORE_LIMITS = {
  MAX_DEPTH: 20,          // 巢狀深度上限
  MAX_DOC_BYTES: 1048576  // 單一文件 1 MiB
};

function validateForFirestore(value, path, depth, problems) {
  path = path || '(root)';
  depth = depth || 0;
  problems = problems || [];

  if (depth > FIRESTORE_LIMITS.MAX_DEPTH) {
    problems.push({ path, issue: `巢狀超過 ${FIRESTORE_LIMITS.MAX_DEPTH} 層` });
    return problems;
  }

  if (value === undefined) {
    problems.push({ path, issue: 'undefined(Firestore 不接受,請改用 null)' });
    return problems;
  }
  if (typeof value === 'number' && !isFinite(value)) {
    problems.push({ path, issue: `${value}(NaN / Infinity 不被接受)` });
    return problems;
  }
  if (typeof value === 'function') {
    problems.push({ path, issue: '函式無法儲存' });
    return problems;
  }

  if (Array.isArray(value)) {
    value.forEach((item, i) => {
      if (Array.isArray(item)) {
        problems.push({ path: `${path}[${i}]`, issue: '陣列裡不能直接放陣列' });
        return;
      }
      validateForFirestore(item, `${path}[${i}]`, depth + 1, problems);
    });
    return problems;
  }

  if (value && typeof value === 'object' && !(value instanceof Date)) {
    Object.keys(value).forEach(key => {
      // 欄位名稱不能為空,也不能含這些字元
      if (key === '') {
        problems.push({ path, issue: '有空字串的欄位名稱' });
      } else if (/[~*/[\]]/.test(key)) {
        problems.push({ path: `${path}.${key}`, issue: '欄位名稱含 ~ * / [ ] 其中之一' });
      }
      validateForFirestore(value[key], `${path}.${key}`, depth + 1, problems);
    });
  }

  return problems;
}

/* 儲存失敗時呼叫,把問題印成人看得懂的樣子 */
function diagnoseSaveFailure(data) {
  const problems = validateForFirestore(data);
  const bytes = new Blob([JSON.stringify(data)]).size;

  console.group('[Cloud] 儲存失敗診斷');
  console.log(`資料大小約 ${(bytes / 1024).toFixed(0)} KB(上限 1024 KB)`);
  if (bytes > FIRESTORE_LIMITS.MAX_DOC_BYTES) {
    console.error('超過單一文件大小上限');
  }
  if (problems.length === 0) {
    console.log('資料形狀沒有問題,失敗原因可能是權限規則或網路');
  } else {
    console.error(`找到 ${problems.length} 處不合法的資料:`);
    problems.slice(0, 30).forEach(p => console.error(`  ${p.path} — ${p.issue}`));
    if (problems.length > 30) console.error(`  …另有 ${problems.length - 30} 處`);
  }
  console.groupEnd();

  return { problems, bytes };
}

/* ============================================
   save() — 全系統唯一的儲存進入點

   雲端模式下寫入會 debounce 800ms。老師連續點五次發分時,
   只會產生一次 Firestore 寫入,省額度也避免競態。
   localStorage 則每次都立即寫,當機也不會掉資料。
============================================ */

let _cloudSaveTimer = null;
let _cloudSavePending = false;
let _staleWarned = false;

/* 只吵一次,但吵得夠清楚 —— 這種狀況老師不重新整理就會一直存不了 */
function warnStaleVersion() {
  if (_staleWarned) return;
  _staleWarned = true;
  updateSyncStatus('error');
  toast('這個分頁的版本比雲端舊,已暫停儲存以免蓋掉資料。請重新整理頁面(Ctrl+F5)');
}

function save() {
  const data = serializeState();

  // 本機快取一律立即寫入
  Storage.save(data, state.classId);

  if (!isCloudMode()) return;

  /* 這個分頁比雲端舊,寫上去會把新版本的資料弄壞。
     寧可不存也不要存錯 —— 存錯是救不回來的,不存至少資料還在雲端。 */
  if (state._blobNewer) {
    warnStaleVersion();
    return;
  }

  _cloudSavePending = true;
  Storage.markDirty(state.classId);   // 寫成功才會清掉
  updateSyncStatus('saving');

  clearTimeout(_cloudSaveTimer);
  _cloudSaveTimer = setTimeout(flushCloudSave, 800);
}

/* ============================================
   別讓「還沒送出的那 800 毫秒」掉資料
   ────────────────────────────────────────────
   存檔是延遲 800 毫秒才送出的(把連續的操作合成一次寫入)。
   老師按完最後一個加分就立刻關分頁、切到別的 App、或鎖螢幕的時候,
   那一次寫入就永遠不會發生。

   所以畫面一離開就立刻送出。visibilitychange 比 beforeunload 可靠 ——
   手機瀏覽器關分頁時常常不跑 beforeunload,但一定會先變成 hidden。
   beforeunload 仍然留著當第二道:真的還沒送完就提醒一句再走。
============================================ */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && _cloudSavePending) {
    clearTimeout(_cloudSaveTimer);
    flushCloudSave();
  }
});

window.addEventListener('beforeunload', e => {
  if (!_cloudSavePending) return;
  clearTimeout(_cloudSaveTimer);
  flushCloudSave();
  // 瀏覽器只會顯示它自己的制式訊息,內容不能自訂
  e.preventDefault();
  e.returnValue = '';
});

async function flushCloudSave(isRetry) {
  if (!isCloudMode() || !_cloudSavePending) return;
  if (state._blobNewer) { _cloudSavePending = false; return; }
  const classId = state.classId;

  /* 寫上去之前先把超量的加分紀錄搬到子集合。
     不搬的話,一個學年之內整份文件就會超過 1 MiB,之後完全存不進去。
     封存是「先寫成功才刪」,失敗就什麼都不動,所以這一步不會掉資料。 */
  await HistoryArchive.flush();

  const data = serializeState();
  BlobSize.check(data);        // 快滿了先提醒,不擋存檔
  try {
    await Cloud.saveClassBlob(classId, data, {
      className: state.className,
      teacherName: state.teacherName
    });
    _cloudSavePending = false;
    Storage.markSynced(classId);     // 雲端和本機一致了
    updateSyncStatus('saved');

    /* 主文件寫成功之後,才把衍生出來的公開名冊與個人資料跟著更新。
       名冊是衍生資料,寫失敗只是學生晚一點看到(而且會退回讀主文件);
       主文件才是本體,所以順序不能反。不等它完成,免得卡住存檔的回饋。 */
    Roster.flush().catch(e => console.warn('[名冊] 更新失敗:', e.message));
  } catch (e) {
    console.error('[Cloud] 儲存失敗:', e.code || '', e.message, e);
    updateSyncStatus('error');

    const { problems, bytes } = diagnoseSaveFailure(data);

    // 資料形狀有問題的話重試幾次都一樣,直接講清楚
    if (problems.length > 0) {
      _cloudSavePending = false;
      toast(`資料格式有誤(${problems[0].path}),詳情請看 Console。資料已存在本機`);
      return;
    }
    if (bytes > FIRESTORE_LIMITS.MAX_DOC_BYTES) {
      _cloudSavePending = false;
      toast(`班級資料已達 ${(bytes / 1024).toFixed(0)}KB,超過雲端單筆上限`);
      return;
    }

    if (!isRetry) {
      // 網路瞬斷之類的暫時性錯誤,再試一次通常就過了
      setTimeout(() => flushCloudSave(true), 3000);
      return;
    }

    // 兩次都失敗。資料還在 localStorage,但這個旗標不能一直留著 ——
    // 它會擋住班級的即時監聽,讓整個 App 之後都收不到任何更新。
    _cloudSavePending = false;
    toast('雲端儲存失敗(' + (e.code || e.message) + '),資料已暫存在本機');
  }
}

/* ============================================
   開班時把「上次沒送出去的變更」救回來
   ────────────────────────────────────────────
   本機快取每次 save() 都立刻寫,雲端是延遲 800 毫秒;而且網路斷掉時
   雲端那次寫入會失敗。兩種情況都會留下「本機比雲端新」的狀態。

   原本沒有任何地方會去讀本機那一份 —— 下次開班直接拿雲端的覆蓋上去,
   離線時加的那幾筆就這樣消失了,而且畫面上看不出來。

   這裡用 Storage 的 dirty 旗標認出那種情況,算出差多少,然後問老師。
   **不自動套用**:老師也可能在另一台裝置上繼續上課,那台才是對的。
   所以兩邊的時間和差異都攤開來給他決定。
============================================ */

function compareBlobs(local, cloud) {
  const byId = b => new Map((b.students || []).map(s => [s.id, s]));
  const L = byId(local), C = byId(cloud);

  let changed = 0, delta = 0, names = [];
  L.forEach((s, id) => {
    const c = C.get(id);
    const lp = s.totalPoints || 0;
    const cp = c ? (c.totalPoints || 0) : 0;
    if (!c || lp !== cp) {
      changed++;
      delta += lp - cp;
      if (names.length < 5) names.push(s.name);
    }
  });

  // 積分之外的東西也可能改了(點名、聯絡簿、作業…)
  const KEYS = ['attendance', 'contactBook', 'homework', 'classTasks',
                'shopHistory', 'shopItems', 'rules', 'quizzes', 'seatingLayouts'];
  const LABEL = {
    attendance: '點名紀錄', contactBook: '聯絡簿', homework: '作業',
    classTasks: '班級任務', shopHistory: '兌換紀錄', shopItems: '獎品',
    rules: '積分規則', quizzes: '測驗', seatingLayouts: '座位表'
  };
  const others = KEYS
    .filter(k => JSON.stringify(local[k]) !== JSON.stringify(cloud[k]))
    .map(k => LABEL[k]);

  return { changed, delta, names, others, any: changed > 0 || others.length > 0 };
}

function offerLocalRecovery(classId, cloudBlob) {
  const meta = Storage.meta(classId);
  if (!meta || !meta.dirty) return false;

  const local = Storage.load(classId);
  if (!local) { Storage.markSynced(classId); return false; }

  const d = compareBlobs(local, cloudBlob);
  if (!d.any) {
    // 旗標沒清掉但內容其實一樣(例如寫成功後剛好關掉分頁),清掉就好
    Storage.markSynced(classId);
    return false;
  }

  const when = new Date(meta.at).toLocaleString('zh-TW');
  const lines = [
    '這台裝置上有一批變更沒有成功上傳到雲端。',
    '(可能是當時網路斷了,或是存檔還沒送出就關掉分頁)',
    '',
    `本機最後一次變更:${when}`,
    ''
  ];
  if (d.changed > 0) {
    lines.push(`· ${d.changed} 位學生的積分不一樣` +
      (d.delta !== 0 ? `,本機合計多 ${d.delta > 0 ? '+' : ''}${d.delta} 分` : '') +
      `(${d.names.join('、')}${d.changed > d.names.length ? ' 等' : ''})`);
  }
  if (d.others.length > 0) lines.push('· 以下也不一樣:' + d.others.join('、'));
  lines.push('',
    '按「確定」= 用這台裝置的版本覆蓋雲端',
    '按「取消」= 保留雲端的版本,丟掉這台的變更',
    '',
    '⚠ 如果你中間用過另一台裝置上課,那一台才是新的 —— 請按取消。');

  if (!confirm(lines.join('\n'))) {
    Storage.markSynced(classId);     // 老師選擇放棄,不要每次開班都問
    toast('已保留雲端的版本');
    return false;
  }

  applyBlobToState(local);
  save();                            // 推回雲端(連帶更新公開名冊)
  renderAll();
  renderActiveView();
  toast(`✦ 已套用這台裝置的版本(${d.changed} 位學生的積分)`, 5000);
  return true;
}

function isCloudMode() {
  return !!(Cloud.ready && Cloud.uid && state.classId);
}

/* 同步狀態指示燈 — 元素不存在時安靜略過 */
function updateSyncStatus(status) {
  const el = document.getElementById('syncStatus');
  if (!el) return;
  const map = {
    saving: { text: '同步中…', cls: 'syncing' },
    saved:  { text: '已同步',   cls: 'synced' },
    error:  { text: '同步失敗', cls: 'error' },
    local:  { text: '單機模式', cls: 'local' }
  };
  const s = map[status] || map.local;
  el.textContent = s.text;
  el.className = 'sync-status ' + s.cls;
}
