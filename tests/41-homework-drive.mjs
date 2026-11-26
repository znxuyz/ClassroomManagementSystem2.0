/* ============================================
   作業繳交到 Google 雲端硬碟
   ────────────────────────────────────────────
   為什麼要有這一套:作業檔案如果存進 Firebase,免費方案的空間
   一個學期就會被吃光 —— 而吃光之後**整個系統都會開始寫不進去**,
   不只是作業。所以檔案走老師自己的雲端硬碟。

   這裡不可能真的連上 Google(測試機沒有也不該有老師的帳號),
   所以把 fetch / XHR 換成假的,驗的是**我們這一端送出去的東西對不對**:

     1. 檔名:班級-座號-姓名,座號補兩位(不補的話雲端硬碟裡會排成 1,10,2)
     2. 檔名裡不能留下 Windows 開不起來的字元
     3. 資料夾:有就用、沒有才開 —— 老師按第二次不該多出一個同名資料夾
     4. 作業資料夾一定要設成「知道連結的可以編輯」,不然學生傳不進去
     5. 上傳時 parents 要指到那個作業資料夾
     6. 權杖過期(401)要自己換一張重試,不要把老師丟出去
     7. Google 的英文錯誤要翻成老師看得懂的話
     8. 沒設定用戶端 ID 的時候,學生端不會看到半份作業
============================================ */
import { loadPlaywright, openApp, prepare, report } from './lib.mjs';

const chromium = await loadPlaywright();
const { page, errors, close } = await openApp(chromium);
await prepare(page);

const lines = [];
const ok = (n, c, e) => lines.push((c ? '✓ ' : '✗ ') + n + (e ? ' — ' + e : ''));

const r = await page.evaluate(async () => {
  const out = {};

  /* ---------- 檔名 ---------- */
  out.name1 = Drive.fileName('601', 7, '許伯瑋', '我的作業.pdf');
  out.name2 = Drive.fileName('601', 23, '王小明', 'IMG_0042.JPG');
  out.nameDirty = Drive.fileName('6/01', 3, '李*小花', 'a:b?c.png');
  out.noExt = Drive.fileName('601', 5, '陳大同', '掃描檔');

  /* ---------- 把 Google 換成假的 ---------- */
  const calls = [];
  Drive.token = 'fake-token';
  Drive.tokenAt = Date.now();

  let existing = [];        // 假裝硬碟裡已經有的資料夾
  let nextId = 1;
  let failNext401 = false;

  window.fetch = async (url, opt) => {
    opt = opt || {};
    const body = opt.body ? JSON.parse(opt.body) : null;
    calls.push({ url, method: opt.method || 'GET', body,
                 auth: (opt.headers || {}).Authorization });

    if (failNext401) {
      failNext401 = false;
      return { ok: false, status: 401, text: async () => '{}' };
    }
    const json = v => ({ ok: true, status: 200, json: async () => v });

    if (url.includes('?q=')) {
      const q = decodeURIComponent(url.split('/files?q=')[1].split('&')[0]);
      const m = q.match(/name='([^']*)'/);
      const parent = (q.match(/'([^']*)' in parents/) || [])[1];
      const hit = existing.find(f => f.name === m[1] && f.parent === parent);
      return json({ files: hit ? [hit] : [] });
    }
    if (url.includes('/permissions')) return json({ id: 'perm' });
    if (url.includes('/files/') && (opt.method || 'GET') === 'GET') {
      const id = url.split('/files/')[1];
      return json(existing.find(f => f.id === id) || { id });
    }
    if (url.includes('/files')) {
      if (!body) throw new Error('沒想到的 GET:' + url);
      const f = { id: 'f' + (nextId++), name: body.name,
                  parent: (body.parents || [])[0] || 'root' };
      existing.push(f);
      return json(f);
    }
    return json({});
  };

  /* ---------- 資料夾 ---------- */
  state.className = '601';
  state.homework = [{ id: 'hw1', name: '11-20 數學習作', submissionPoints: 2,
                      dueDate: '2026-12-01', submissions: {} }];

  await ensureHomeworkFolder('hw1');
  const hw = state.homework[0];
  out.folderId = hw.driveFolderId;
  out.folderUrl = hw.driveFolderUrl;
  out.created = existing.map(f => f.name);
  out.shared = calls.some(c => c.url.includes('/permissions')
    && c.body && c.body.role === 'writer' && c.body.type === 'anyone');

  // 再按一次不可以多開資料夾
  const before = existing.length;
  delete hw.driveFolderId;              // 假裝老師在別台電腦按的
  await ensureHomeworkFolder('hw1');
  out.noDuplicate = existing.length === before;
  out.sameFolder = hw.driveFolderId === out.folderId;

  /* ---------- 權杖過期 ---------- */
  Drive._reauth = 0;
  Drive.auth = async () => { Drive._reauth++; return 'fresh-token'; };
  failNext401 = true;
  const got = await Drive.api('/files/' + out.folderId);
  out.retried = Drive._reauth >= 2 && !!got;

  /* ---------- 上傳 ---------- */
  const sent = {};
  window.XMLHttpRequest = function () {
    this.upload = {};
    this.open = (m, u) => { sent.url = u; sent.method = m; };
    this.setRequestHeader = (k, v) => { sent[k] = v; };
    this.send = form => {
      sent.form = form;
      this.status = 200;
      this.responseText = JSON.stringify(
        { id: 'up1', name: '601-07-許伯瑋-我的作業.pdf', webViewLink: 'https://x/1' });
      setTimeout(() => this.onload(), 0);
    };
  };
  const file = new File(['hello'], '我的作業.pdf', { type: 'application/pdf' });
  const res = await Drive.upload(file, out.folderId, '601-07-許伯瑋-我的作業.pdf');
  out.uploadUrl = sent.url;
  out.uploadAuth = sent.Authorization;
  out.uploadedId = res.id;
  const meta = JSON.parse(await sent.form.get('metadata').text());
  out.uploadParents = meta.parents;
  out.uploadName = meta.name;

  /* ---------- 錯誤訊息 ---------- */
  out.sayQuota = Drive.explain(403,
    '{"error":{"message":"The user has exceeded their Drive storageQuota."}}');
  out.say404 = Drive.explain(404, '{}');
  out.say429 = Drive.explain(429, '{}');

  /* ---------- 沒設定的時候 ---------- */
  Drive.setClientId('');
  out.notReady = Drive.ready();

  return out;
});

ok('檔名是「班級-座號-姓名」,座號補成兩位',
   r.name1 === '601-07-許伯瑋-我的作業.pdf', r.name1);
ok('兩位數的座號不會被補壞,副檔名原樣留著',
   r.name2 === '601-23-王小明-IMG_0042.JPG', r.name2);
ok('檔名裡的 / : * ? 會拿掉(Windows 下載下來會開不起來)',
   !/[\/\\:*?"<>|]/.test(r.nameDirty), r.nameDirty);
ok('沒有副檔名的檔案也處理得了', r.noExt === '601-05-陳大同-掃描檔', r.noExt);

ok('會開出「守護獸學園 / 班級 / 作業名」三層',
   JSON.stringify(r.created) === JSON.stringify(['守護獸學園', '601', '11-20 數學習作']),
   r.created.join(' / '));
ok('作業資料夾設成「知道連結的可以編輯」(不然學生傳不進去)', r.shared === true);
ok('資料夾連結存起來了', /drive\.google\.com\/drive\/folders\//.test(r.folderUrl || ''),
   r.folderUrl);

ok('再按一次不會多開一個同名資料夾', r.noDuplicate === true);
ok('而且認得出是原來那一個', r.sameFolder === true);

ok('權杖過期(401)會自己換一張重試,不會把老師丟出去', r.retried === true);

ok('上傳走 multipart 的上傳網址',
   /upload\/drive\/v3\/files\?uploadType=multipart/.test(r.uploadUrl || ''), r.uploadUrl);
ok('上傳有帶授權', /^Bearer /.test(r.uploadAuth || ''));
ok('檔案放進那一份作業的資料夾',
   JSON.stringify(r.uploadParents) === JSON.stringify([r.folderId]),
   (r.uploadParents || []).join());
ok('送出去的檔名是改好的那一個',
   r.uploadName === '601-07-許伯瑋-我的作業.pdf', r.uploadName);

ok('硬碟滿了會講「空間滿了」,不是丟英文 JSON',
   /空間滿了/.test(r.sayQuota), r.sayQuota);
ok('找不到資料夾講人話', /找不到/.test(r.say404), r.say404);
ok('忙線中請他等一下', /等一下/.test(r.say429), r.say429);

ok('清掉用戶端 ID 之後就不算設定好了', r.notReady === false);

/* ---------- 學生端 ---------- */
const s = await page.evaluate(() => {
  const out = {};
  StudentApp.homework = [
    { id: 'a', name: '還沒開資料夾的作業', driveFolderId: '' },
    { id: 'b', name: '數學習作', driveFolderId: 'f3', className: '601',
      dueDate: '2026-12-01', submissionPoints: 2 }
  ];
  StudentApp.myHwSubs = {};
  out.onlyReady = StudentApp.homeworkList().map(h => h.id);
  out.pending = StudentApp.homeworkPending();
  out.tabLive = StudentApp.tabState('homework', 0).live;
  out.tabBadge = StudentApp.tabState('homework', 0).badge;

  StudentApp.myHwSubs = { b: { fileName: '601-07-許伯瑋-x.pdf' } };
  out.afterSubmit = StudentApp.homeworkPending();
  out.cardShowsFile = /601-07-許伯瑋-x\.pdf/.test(
    StudentApp.homeworkCard(StudentApp.homework[1], StudentApp.myHwSubs.b));

  StudentApp.homework = [];
  out.tabHidden = StudentApp.tabState('homework', 0).live;
  return out;
});

ok('老師還沒開資料夾的作業,學生端看不到(交不了的東西不要給他看)',
   JSON.stringify(s.onlyReady) === JSON.stringify(['b']), s.onlyReady.join());
ok('分頁上的數字是「還沒交幾份」', s.pending === 1 && s.tabBadge === 1);
ok('交完之後就不再催', s.afterSubmit === 0);
ok('交過的那一份會寫出交的是哪個檔案', s.cardShowsFile === true);
ok('一份作業都沒有的時候整個分頁收起來', s.tabLive === true && s.tabHidden === false);

await close();
process.exit(report('作業繳交到雲端硬碟', lines, errors) ? 0 : 1);
