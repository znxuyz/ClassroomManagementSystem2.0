/* ============================================
   作業 × 雲端硬碟(老師端)
   ────────────────────────────────────────────
   一份作業對應硬碟裡一個資料夾:

     我的雲端硬碟 / 守護獸學園 / 601 / 11-20 數學習作 /

   資料夾設成「知道連結的人可以編輯」,學生才傳得進去。
   開好之後把資料夾 id 記在作業上,並跟著作業一起發給學生 ——
   學生端要知道要傳到哪裡去。

   為什麼不一人開一個資料夾:一份作業五個班一百四十三個人,
   等於一百四十三次建立 + 一百四十三次分享,每次出作業都要跑兩分鐘。
   老師選的是「全班共用一個」,代價是學生在雲端硬碟裡看得到同學的作業
   (在守護獸學園裡面看不到)—— 這個取捨寫在設定頁上,不要藏起來。
============================================ */

/* 班級資料夾:守護獸學園 / 601。一個班只開一次,id 記在班級設定裡。 */
async function ensureClassFolder() {
  const root = await Drive.ensureFolder(Drive.ROOT_NAME, null);
  const className = state.className || '班級';
  const folder = await Drive.ensureFolder(className, root.id);
  state.driveClassFolder = folder.id;
  return folder;
}

/* 一份作業的資料夾。已經開過就直接用 —— 重開一個的話,
   之前交的檔案會留在舊資料夾裡,老師會以為學生沒交。 */
async function ensureHomeworkFolder(hwId, opts) {
  const hw = state.homework.find(h => h.id === hwId);
  if (!hw) return null;
  if (hw.driveFolderId && !(opts && opts.force)) return hw.driveFolderId;

  const cls = await ensureClassFolder();
  const folder = await Drive.ensureFolder(hw.name, cls.id);
  await Drive.shareForUpload(folder.id);
  hw.driveFolderId = folder.id;
  hw.driveFolderUrl = Drive.folderUrl(folder.id);
  save();
  return folder.id;
}

/* 老師按「開資料夾並開放繳交」 */
async function linkHomeworkToDrive(hwId) {
  const hw = state.homework.find(h => h.id === hwId);
  if (!hw) return;
  if (!Drive.ready()) {
    toast('請先到「系統設定 → 雲端硬碟」設定 Google 用戶端 ID');
    navGoItem('settings', 'settings', '');
    return;
  }
  const btnLabel = hw.driveFolderId ? '重新開放' : '開資料夾';
  try {
    toast(btnLabel + '中…');
    await Drive.auth(false);
    await ensureHomeworkFolder(hwId);
    await publishHomeworkToStudents(hwId);
    renderHomeworkList();
    toast('✓ 已開好資料夾,學生可以開始繳交了');
  } catch (e) {
    console.error('[作業·雲端硬碟]', e);
    toast(e.message || '開資料夾失敗');
  }
}

/* 把作業發給學生。發出去的只有「要交什麼、交到哪裡」——
   誰交了誰沒交是老師端的資料,不發下去。 */
async function publishHomeworkToStudents(hwId) {
  if (!isCloudMode()) return;
  const hw = state.homework.find(h => h.id === hwId);
  if (!hw || !hw.driveFolderId) return;
  await Cloud.publishHomework(currentClassId(), {
    id: hw.id,
    name: hw.name,
    description: hw.description || '',
    dueDate: hw.dueDate || '',
    submissionPoints: hw.submissionPoints || 0,
    driveFolderId: hw.driveFolderId,
    className: state.className || '',
    closed: !!hw.archived
  });
}

/* 學生交了之後,老師這邊要看得到。
   學生端寫的是 classes/{id}/hwsubs/{hwId}__{uid},這裡收回來
   併進 hw.submissions —— 之後的計分、統計全部沿用原本那一套,
   不必為了「從雲端來的」另外寫一份邏輯。 */
async function pullHomeworkSubmissions(opts) {
  if (!isCloudMode()) return 0;
  const rows = await Cloud.listHomeworkSubs(currentClassId());
  let changed = 0;
  rows.forEach(r => {
    const hw = state.homework.find(h => h.id === r.hwId);
    if (!hw) return;
    const st = state.students.find(s =>
      (s.email && r.email && s.email.toLowerCase() === r.email.toLowerCase())
      || s.id === r.studentId);
    if (!st) return;
    hw.submissions = hw.submissions || {};
    const cur = hw.submissions[st.id];
    if (cur && cur.fileId === r.fileId) return;      // 已經收過這一份
    /* 遲交的判斷放在這裡,不放在學生端 —— 學生那邊的時鐘可以自己改。 */
    const late = !!(hw.dueDate
      && r.at > new Date(hw.dueDate + 'T23:59:59').getTime());

    /* 走 markHomework,不要自己填 submissions ——
       「同一份只發一次分」「遲交給一半」「取消時連歷程一起收回」
       全部在那一支裡面。自己填的話這些規則會有兩套,早晚會對不起來。 */
    markHomework(hw.id, st.id, late ? 'late' : 'submitted');
    // 再把檔案的資訊補上去(markHomework 只認得狀態)
    Object.assign(hw.submissions[st.id] || (hw.submissions[st.id] = {}), {
      fileId: r.fileId, fileName: r.fileName, fileUrl: r.fileUrl,
      submittedAt: r.at
    });
    changed++;
  });
  if (changed) {
    save();
    renderHomeworkList();
  }
  if (!(opts && opts.quiet)) {
    toast(changed ? `收到 ${changed} 份新的作業` : '目前沒有新交的作業');
  }
  return changed;
}

/* 作業卡上的那一排雲端硬碟按鈕 */
function homeworkDriveRow(hw) {
  if (!Drive.ready()) {
    return `<div class="hw-drive-row is-off">
      <span>作業檔案可以直接收進你的 Google 雲端硬碟 —— </span>
      <button class="btn btn-ghost btn-small"
              onclick="navGoItem('settings','settings','')">去設定</button>
    </div>`;
  }
  if (!hw.driveFolderId) {
    return `<div class="hw-drive-row">
      <button class="btn btn-primary btn-small"
              onclick="linkHomeworkToDrive('${hw.id}')">開雲端資料夾並開放繳交</button>
      <span class="hw-drive-note">開好之後學生才看得到這份作業、才交得了檔案</span>
    </div>`;
  }
  const got = Object.values(hw.submissions || {})
    .filter(s => s && (s.fileId || s.fileUrl)).length;
  return `<div class="hw-drive-row is-on">
    <a class="btn btn-ghost btn-small" target="_blank" rel="noopener"
       href="${escapeHtml(hw.driveFolderUrl || Drive.folderUrl(hw.driveFolderId))}"
       >開啟雲端資料夾</a>
    <button class="btn btn-ghost btn-small"
            onclick="pullHomeworkSubmissions()">收取新繳交</button>
    <span class="hw-drive-note">${got ? `雲端收到 ${got} 份` : '還沒有人上傳'}</span>
  </div>`;
}


/* ============================================
   設定頁:連結 Google 雲端硬碟
   ────────────────────────────────────────────
   用戶端 ID 只有老師自己開得出來(要用他自己的 Google Cloud 專案),
   所以這裡要把步驟講完,不能只放一個輸入框。
============================================ */
function renderDriveSettings() {
  const box = document.getElementById('driveBox');
  if (!box) return;
  const id = Drive.clientId();
  const origin = location.origin;

  box.innerHTML = `
    <div class="drive-intro">
      作業檔案會收進<strong>你自己的</strong> Google 雲端硬碟,不佔這個系統的空間。
      結構是「守護獸學園 / 班級 / 作業名」,檔名自動變成
      <code>601-07-許伯瑋</code>。<br>
      這個網頁要到的權限是 <code>drive.file</code> ——
      <strong>只碰得到它自己建立的檔案</strong>,看不到你硬碟裡其他任何東西。
    </div>

    <div class="drive-steps">
      <div class="drive-step"><b>1</b><span>到
        <a href="https://console.cloud.google.com/apis/credentials" target="_blank"
           rel="noopener">Google Cloud 憑證頁</a>,建立一個專案(名字隨便取)。</span></div>
      <div class="drive-step"><b>2</b><span>左邊「已啟用的 API」→ 搜尋
        <strong>Google Drive API</strong> → 啟用。</span></div>
      <div class="drive-step"><b>3</b><span>回憑證頁 →「建立憑證」→
        <strong>OAuth 用戶端 ID</strong> → 應用程式類型選
        <strong>網頁應用程式</strong>。</span></div>
      <div class="drive-step"><b>4</b><span>「已授權的 JavaScript 來源」填這一行
        (就是現在這個網址):
        <code class="drive-origin">${escapeHtml(origin)}</code></span></div>
      <div class="drive-step"><b>5</b><span>建立之後把<strong>用戶端 ID</strong>
        (<code>…apps.googleusercontent.com</code>)貼到下面。</span></div>
      <div class="drive-step"><b>6</b><span>同一頁的「OAuth 同意畫面」把學生的帳號
        或整個學校網域加進測試使用者 —— 不加的話學生按繳交會被 Google 擋下來。</span></div>
    </div>

    <div class="setup-step">
      <label class="setup-label">用戶端 ID</label>
      <input type="text" id="driveClientId" class="setup-input"
             placeholder="xxxxx.apps.googleusercontent.com"
             value="${escapeHtml(id)}" />
    </div>
    <div class="drive-actions">
      <button class="btn btn-primary" onclick="saveDriveClientId()">儲存</button>
      ${id ? `<button class="btn btn-ghost" onclick="testDriveLink()">測試連線</button>` : ''}
      ${id ? `<button class="btn btn-ghost" onclick="clearDriveClientId()"
                 style="color:var(--sick-ink)">清除</button>` : ''}
    </div>
    <div id="driveStatus" class="drive-status">${
      id ? (Drive.signedIn() ? '✓ 已登入 Google' : '已設定,還沒登入過')
         : '還沒設定 —— 作業繳交的檔案上傳功能現在是關著的'}</div>`;
}

function saveDriveClientId() {
  const v = (document.getElementById('driveClientId').value || '').trim();
  if (v && !/\.apps\.googleusercontent\.com$/.test(v)) {
    toast('用戶端 ID 的結尾應該是 .apps.googleusercontent.com —— 再檢查一次');
    return;
  }
  Drive.setClientId(v);
  renderDriveSettings();
  toast(v ? '已儲存,可以按「測試連線」確認' : '已清除');
}

function clearDriveClientId() {
  if (!confirm('清除之後,學生就不能再上傳作業檔案了(已經交的不受影響)。確定嗎?')) return;
  Drive.signOut();
  Drive.setClientId('');
  renderDriveSettings();
}

async function testDriveLink() {
  const el = document.getElementById('driveStatus');
  el.textContent = '連線中…';
  try {
    await Drive.auth(true);
    const folder = await ensureClassFolder();
    el.innerHTML = `✓ 連上了,資料夾已經開好:
      <a href="${Drive.folderUrl(folder.id)}" target="_blank" rel="noopener">
        ${escapeHtml(Drive.ROOT_NAME)} / ${escapeHtml(folder.name)}</a>`;
    save();
  } catch (e) {
    console.error('[雲端硬碟]', e);
    el.textContent = '✗ ' + (e.message || '連線失敗');
  }
}
