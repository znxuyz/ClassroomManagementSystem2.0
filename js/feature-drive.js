/* ============================================
   Google 雲端硬碟
   ────────────────────────────────────────────
   為什麼不用 Firebase 存作業檔案:免費方案的空間是以 GB 計的,
   五個班一學期的作業(照片、影片、簡報)很容易就把它吃光,
   而且吃光之後**整個系統都會開始寫不進去**,不只是作業。
   雲端硬碟本來就是老師在用的東西,空間也大得多。

   ── 權限怎麼走 ──
   學生的瀏覽器沒辦法「用老師的身分」寫東西,所以不能把老師的權杖發下去。
   走法是:

     1. 老師登入一次 Google,系統在他的硬碟裡開
        「守護獸學園 / 601 / 作業名」這樣的資料夾
     2. 那個作業資料夾設成「知道連結的人可以編輯」
     3. 學生在守護獸學園按繳交,用**他自己的** Google 帳號把檔案
        傳進那個資料夾,檔名自動改成「601-07-許伯瑋」

   用的權限範圍是 drive.file —— 這個範圍只碰得到「這個網頁自己建立的檔案」,
   碰不到老師硬碟裡其他任何東西。這一點值得在設定頁跟老師講清楚。

   ── 這個檔案只管「跟 Google 講話」 ──
   作業本身的邏輯在 feature-homework.js,學生端在 js/student/08-homework.js。
============================================ */

const Drive = {
  SCOPE: 'https://www.googleapis.com/auth/drive.file',
  CLIENT_STORAGE: 'guardian-drive-client-id',
  ROOT_NAME: '守護獸學園',

  token: null,
  tokenAt: 0,
  _client: null,

  /* ---------- 設定 ---------- */
  clientId() {
    return (localStorage.getItem(this.CLIENT_STORAGE) || '').trim();
  },

  setClientId(id) {
    const v = (id || '').trim();
    if (v) localStorage.setItem(this.CLIENT_STORAGE, v);
    else localStorage.removeItem(this.CLIENT_STORAGE);
    // 換了用戶端就等於換了一套授權,舊的權杖不能再用
    this.token = null;
    this._client = null;
  },

  ready() { return !!this.clientId(); },

  /* Google 的登入程式庫是用 <script> 從外面載的 ——
     網路慢或被擋的時候它不會存在,要講清楚而不是丟一個
     「google is not defined」給老師看。 */
  loaded() {
    return typeof google !== 'undefined'
        && google.accounts && google.accounts.oauth2;
  },

  /* ---------- 取得權杖 ----------
     權杖大約一小時過期。過期之後再要一次通常不會再跳視窗
     (瀏覽器還記得這個帳號已經授權過),所以不必存起來。 */
  async auth(interactive) {
    if (this.token && Date.now() - this.tokenAt < 50 * 60 * 1000) return this.token;
    if (!this.ready()) throw new Error('還沒設定 Google 用戶端 ID');
    if (!this.loaded()) throw new Error('Google 登入程式庫沒有載入 —— 檢查網路或防火牆');

    return new Promise((resolve, reject) => {
      if (!this._client) {
        this._client = google.accounts.oauth2.initTokenClient({
          client_id: this.clientId(),
          scope: this.SCOPE,
          callback: resp => {
            if (resp && resp.access_token) {
              this.token = resp.access_token;
              this.tokenAt = Date.now();
              this._resolve && this._resolve(this.token);
            } else {
              this._reject && this._reject(new Error('沒有拿到授權'));
            }
          },
          error_callback: err => {
            this._reject && this._reject(
              new Error(err && err.type === 'popup_closed'
                ? '授權視窗被關掉了' : '授權失敗:' + ((err && err.type) || '不明原因')));
          }
        });
      }
      this._resolve = resolve;
      this._reject = reject;
      // prompt 留空 = 已經授權過的話就不要再問一次
      this._client.requestAccessToken({ prompt: interactive ? 'consent' : '' });
    });
  },

  signedIn() { return !!this.token; },

  signOut() {
    if (this.token && this.loaded()) {
      try { google.accounts.oauth2.revoke(this.token); } catch (e) { /* 失敗就算了 */ }
    }
    this.token = null;
    this.tokenAt = 0;
  },

  /* ---------- 跟 Drive 講話 ---------- */
  async api(path, opt) {
    const o = opt || {};
    const token = await this.auth(false);
    const res = await fetch('https://www.googleapis.com/drive/v3' + path, {
      method: o.method || 'GET',
      headers: Object.assign({ Authorization: 'Bearer ' + token },
                             o.body ? { 'Content-Type': 'application/json' } : {}),
      body: o.body ? JSON.stringify(o.body) : undefined
    });
    if (!res.ok) {
      const text = await res.text();
      /* 權杖過期(401)的時候重新要一次再試 ——
         老師上課上到一半被丟出去是最糟的體驗。 */
      if (res.status === 401 && !o._retried) {
        this.token = null;
        return this.api(path, Object.assign({}, o, { _retried: true }));
      }
      throw new Error(this.explain(res.status, text));
    }
    return res.json();
  },

  /* Google 的錯誤訊息是英文的 JSON,直接丟給老師看沒有意義。 */
  explain(status, text) {
    let detail = '';
    try { detail = (JSON.parse(text).error || {}).message || ''; } catch (e) { detail = ''; }
    if (status === 403 && /storageQuota/i.test(detail)) {
      return '雲端硬碟空間滿了 —— 清一些東西再試。';
    }
    if (status === 403) {
      return '沒有權限 —— 這個資料夾可能被改成不能編輯了,或帳號不對。'
           + (detail ? '(' + detail + ')' : '');
    }
    if (status === 404) return '找不到那個資料夾 —— 可能被刪掉或移走了。';
    if (status === 429 || status === 503) return '雲端硬碟忙線中,等一下再試一次。';
    return '雲端硬碟回了錯誤 ' + status + (detail ? ':' + detail : '');
  },

  /* ---------- 資料夾 ----------
     drive.file 這個權限範圍只看得到「這個網頁建立的檔案」,
     所以搜尋得到的一定是我們自己開的 —— 不會翻到老師私人的資料夾。 */
  async findFolder(name, parentId) {
    const q = [
      "mimeType='application/vnd.google-apps.folder'",
      "trashed=false",
      "name='" + String(name).replace(/'/g, "\\'") + "'",
      parentId ? "'" + parentId + "' in parents" : "'root' in parents"
    ].join(' and ');
    const r = await this.api('/files?q=' + encodeURIComponent(q)
                             + '&fields=files(id,name)&pageSize=5');
    return (r.files || [])[0] || null;
  },

  async createFolder(name, parentId) {
    return this.api('/files?fields=id,name,webViewLink', {
      method: 'POST',
      body: {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: parentId ? [parentId] : undefined
      }
    });
  },

  /* 有就用,沒有就開。老師按第二次不會多出一個同名資料夾。 */
  async ensureFolder(name, parentId) {
    const hit = await this.findFolder(name, parentId);
    if (hit) return hit;
    return this.createFolder(name, parentId);
  },

  /* 作業資料夾要讓學生傳得進去:知道連結的人可以編輯。
     (Google 沒有「只能丟進去、看不到別人」的分享方式 ——
      真的要各看各的,得一個學生開一個資料夾。) */
  async shareForUpload(folderId) {
    return this.api('/files/' + folderId + '/permissions', {
      method: 'POST',
      body: { role: 'writer', type: 'anyone' }
    });
  },

  folderUrl(id) { return 'https://drive.google.com/drive/folders/' + id; },

  /* ---------- 上傳 ----------
     學生端用的也是這一支:用他自己的 Google 帳號,
     把檔案放進老師那個「可以編輯」的資料夾。 */
  async upload(file, folderId, filename, onProgress) {
    const token = await this.auth(false);
    const meta = { name: filename || file.name, parents: [folderId] };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(meta)],
                                     { type: 'application/json' }));
    form.append('file', file);

    /* 用 XHR 而不是 fetch,只是為了拿得到上傳進度 ——
       一份二十 MB 的影片傳三十秒,沒有進度條學生會以為當掉了。 */
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', 'https://www.googleapis.com/upload/drive/v3/files'
                     + '?uploadType=multipart&fields=id,name,webViewLink');
      xhr.setRequestHeader('Authorization', 'Bearer ' + token);
      if (onProgress) {
        xhr.upload.onprogress = e => {
          if (e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 100));
        };
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText)); }
          catch (e) { reject(new Error('上傳完成,但回應讀不懂')); }
        } else {
          reject(new Error(this.explain(xhr.status, xhr.responseText)));
        }
      };
      xhr.onerror = () => reject(new Error('上傳中斷 —— 檢查網路再試一次'));
      xhr.send(form);
    });
  },

  /* ---------- 檔名 ----------
     班級 + 座號 + 姓名。座號補成兩位數,這樣在雲端硬碟裡
     依名稱排序就等於依座號排序(1, 10, 2 那種排法會讓老師找不到人)。
     檔名裡不能有 / \ : * ? " < > |,Windows 下載下來會出問題。 */
  fileName(className, seat, studentName, originalName) {
    const ext = (originalName.match(/\.[^.]{1,8}$/) || [''])[0];
    const base = originalName.slice(0, originalName.length - ext.length);
    const seatText = String(seat || '').padStart(2, '0');
    const safe = s => String(s || '').replace(/[\/\\:*?"<>|]/g, '').trim();
    return [safe(className), seatText, safe(studentName)].filter(Boolean).join('-')
         + (base ? '-' + safe(base).slice(0, 40) : '') + ext;
  }
};
