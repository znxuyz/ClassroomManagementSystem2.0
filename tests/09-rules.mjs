/* ============================================
   安全規則 —— 用真的規則引擎驗證
   ────────────────────────────────────────────
   其他幾套測的是前端行為:「學生端不會去讀那一份」。
   這一套測的是另一件事:「就算他去讀,也讀不到」——
   直接把 firestore.rules 丟進 Firestore 模擬器,然後用學生、老師、
   外人三種身分真的去讀寫。

   這是最值得自動化的一套。隱私和防作弊最後都靠這些規則,而規則
   不會因為寫錯就報錯 —— 它只會安靜地放行或安靜地擋掉,
   兩種錯法都要到現場才會發現(一邊是資料外流,一邊是全班進不去)。

   會自己開關模擬器。沒有 firebase CLI 或 java 就整套跳過(回傳 0),
   不會把其他測試擋下來。
============================================ */
import { spawn, execSync } from 'node:child_process';
import { openSync, readFileSync, unlinkSync } from 'node:fs';
import { report } from './lib.mjs';

const have = cmd => { try { execSync('command -v ' + cmd, { stdio: 'ignore' }); return true; }
                      catch { return false; } };
if (!have('firebase') || !have('java')) {
  console.log('\n── 安全規則 ──\n  (跳過:需要 firebase CLI 與 java)');
  process.exit(0);
}

/* 從專案根目錄跑 —— 模擬器用的是 firebase.json 裡那份 rules 設定,
   也就是真的會被發布上去的那一份,不會各走各的。 */
const DIR = new URL('../', import.meta.url).pathname;
const HOST = 'http://127.0.0.1:8411';
const PROJ = 'demo-rules-test';
const BASE = `${HOST}/v1/projects/${PROJ}/databases/(default)/documents`;

/* 模擬器的輸出留一份 —— 起不來的時候那是唯一看得出原因的東西。
   (第一次跑會先下載 Firestore 模擬器的 JAR,大約 60 MB,
    在 CI 上可能要一兩分鐘。) */
const LOG = DIR + 'firestore-emulator.log';
const logFd = openSync(LOG, 'w');
const emu = spawn('firebase',
  ['emulators:start', '--only', 'firestore', '--project', PROJ],
  { cwd: DIR, stdio: ['ignore', logFd, logFd], detached: true });
/* detached:true 才有自己的行程群組 —— 模擬器底下還有一個 java 行程,
   只殺 node 那一層的話 java 會留著佔住 port,下一次就起不來。 */
const stop = () => {
  try { process.kill(-emu.pid, 'SIGTERM'); } catch { }
  try { emu.kill('SIGTERM'); } catch { }
};
process.on('exit', stop);

/* 等它起來。180 秒是為了 CI —— 第一次跑要先下載模擬器的 JAR。
   本機第二次之後大約 15 秒就好了。 */
let up = false;
for (let i = 0; i < 180; i++) {
  await new Promise(r => setTimeout(r, 1000));
  try { const r = await fetch(HOST + '/'); if (r.status === 200) { up = true; break; } } catch { }
}
if (!up) {
  console.log('\n── 安全規則 ──\n  ✗ 模擬器起不來。它的輸出:\n');
  try { console.log(readFileSync(LOG, 'utf8').split('\n').slice(-30).join('\n')); }
  catch { console.log('  (連 log 都沒有)'); }
  stop();
  process.exit(1);
}
const cleanLog = () => { try { unlinkSync(LOG); } catch { } };

/* 模擬器接受「未簽章」的 JWT 當成已登入的使用者,
   Bearer owner 則會完全繞過規則 —— 種資料用它。 */
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = () => Math.floor(Date.now() / 1000);
const tok = (uid, email) => [
  b64({ alg: 'none', typ: 'JWT' }),
  b64({ iss: `https://securetoken.google.com/${PROJ}`, aud: PROJ, sub: uid, user_id: uid,
        email, email_verified: true, auth_time: now(), iat: now(), exp: now() + 3600,
        firebase: { sign_in_provider: 'google.com', identities: { email: [email] } } }),
  ''
].join('.');

const AS = {
  admin: 'owner',
  teacher: tok('TEACHER_UID', 'teacher@chc.edu.tw'),
  kid0: tok('KID0_UID', 'kid0@chc.edu.tw'),
  kid1: tok('KID1_UID', 'kid1@chc.edu.tw'),
  stranger: tok('STRANGER_UID', 'nobody@elsewhere.com')
};

const v = x => {
  if (x === null) return { nullValue: null };
  if (typeof x === 'string') return { stringValue: x };
  if (typeof x === 'number') return Number.isInteger(x) ? { integerValue: String(x) } : { doubleValue: x };
  if (typeof x === 'boolean') return { booleanValue: x };
  if (Array.isArray(x)) return { arrayValue: { values: x.map(v) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(x).map(([k, y]) => [k, v(y)])) } };
};
const doc = o => ({ fields: Object.fromEntries(Object.entries(o).map(([k, y]) => [k, v(y)])) });

async function req(method, path, who, body) {
  const r = await fetch(BASE + path, {
    method,
    headers: { Authorization: 'Bearer ' + AS[who], 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  return r.status;
}
const seed = (path, data) => req('PATCH', path, 'admin', doc(data));

async function query(who, body) {
  const r = await fetch(`${BASE}:runQuery`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + AS[who], 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const txt = await r.text();
  return { status: r.status, hits: (txt.match(/"document"/g) || []).length };
}

await seed('/users/TEACHER_UID', { role: 'teacher', email: 'teacher@chc.edu.tw' });
await seed('/users/KID0_UID', { role: 'student', email: 'kid0@chc.edu.tw' });
await seed('/classes/C1', { teacherUid: 'TEACHER_UID', className: '601',
  blob: { students: [{ id: 's0', name: '小明', email: 'kid0@chc.edu.tw',
                       history: [{ reason: '與同學爭執' }] }] } });
await seed('/classes/C1/public/roster', { className: '601',
  students: [{ id: 's0', name: '小明', totalPoints: 10 }] });
await seed('/classes/C1/mine/s0', { currentPoints: 5, history: [{ reason: '與同學爭執' }] });
await seed('/classes/C1/mine/s1', { currentPoints: 7, history: [] });
await seed('/classes/C1/tqbank/s0', { questions: [{ id: 'q1', answer: 2 }] });
await seed('/classes/C1/territory/answers', { key: { q1: { a: 2, p: 1 } } });
await seed('/rosterIndex/kid0@chc.edu.tw', { classes: { C1: { classId: 'C1', studentId: 's0' } } });
await seed('/rosterIndex/kid1@chc.edu.tw', { classes: { C1: { classId: 'C1', studentId: 's1' } } });

const lines = [];
const ok = (n, c, e) => lines.push((c ? '✓ ' : '✗ ') + n + (e ? ' — ' + e : ''));
const ALLOW = 200, DENY = 403;
let s;

// ── 主文件:只有導師 ──
ok('導師讀得到自己的班級主文件', await req('GET', '/classes/C1', 'teacher') === ALLOW);
s = await req('GET', '/classes/C1', 'kid0');
ok('學生讀不到班級主文件(裡面有全班的扣分原因)', s === DENY, 'HTTP ' + s);
s = await req('GET', '/classes/C1', 'stranger');
ok('外人讀不到班級主文件', s === DENY, 'HTTP ' + s);

// 老師的班級清單是一個 where 查詢,收緊之後仍然要能用 ——
// 這條規則寫錯的話老師會整個登不進去,比學生看到扣分原因還嚴重
const q = await query('teacher', { structuredQuery: {
  from: [{ collectionId: 'classes' }],
  where: { fieldFilter: { field: { fieldPath: 'teacherUid' }, op: 'EQUAL',
                          value: { stringValue: 'TEACHER_UID' } } } } });
ok('導師仍然列得出自己的班級(where teacherUid == 自己)',
   q.status === ALLOW && q.hits === 1, `HTTP ${q.status} · ${q.hits} 筆`);
const q2 = await query('kid0', { structuredQuery: { from: [{ collectionId: 'classes' }] } });
ok('學生不能把全部班級撈出來', q2.status === DENY || q2.hits === 0,
   `HTTP ${q2.status} · ${q2.hits} 筆`);

// ── 公開名冊 ──
ok('學生讀得到公開名冊', await req('GET', '/classes/C1/public/roster', 'kid0') === ALLOW);
ok('學生改不了公開名冊',
   await req('PATCH', '/classes/C1/public/roster', 'kid0', doc({ className: '駭' })) === DENY);
ok('導師寫得了公開名冊',
   await req('PATCH', '/classes/C1/public/roster', 'teacher', doc({ className: '601' })) === ALLOW);

// ── 個人私有資料 ──
ok('學生讀得到自己那一份', await req('GET', '/classes/C1/mine/s0', 'kid0') === ALLOW);
s = await req('GET', '/classes/C1/mine/s1', 'kid0');
ok('學生讀不到同學那一份(扣分原因、可用積分)', s === DENY, 'HTTP ' + s);
ok('同學本人讀得到自己那一份', await req('GET', '/classes/C1/mine/s1', 'kid1') === ALLOW);
ok('導師讀得到任何一份', await req('GET', '/classes/C1/mine/s1', 'teacher') === ALLOW);
ok('學生改不了自己那一份(積分不能自己加)',
   await req('PATCH', '/classes/C1/mine/s0', 'kid0', doc({ currentPoints: 9999 })) === DENY);
s = await req('GET', '/classes/C1/mine/s0', 'stranger');
ok('不在名冊裡的人讀不到任何一份', s === DENY, 'HTTP ' + s);

// ── 題庫含答案 ──
s = await req('GET', '/classes/C1/tqbank/s0', 'kid0');
ok('學生讀不到題庫分片(裡面有正確答案)', s === DENY, 'HTTP ' + s);
ok('導師讀得到題庫分片', await req('GET', '/classes/C1/tqbank/s0', 'teacher') === ALLOW);

// ── 名冊索引 ──
ok('學生讀得到自己的名冊索引',
   await req('GET', '/rosterIndex/kid0@chc.edu.tw', 'kid0') === ALLOW);
s = await req('GET', '/rosterIndex/kid1@chc.edu.tw', 'kid0');
ok('學生讀不到別人的名冊索引(等於全班信箱)', s === DENY, 'HTTP ' + s);

// ── 歷程:誰都不能改 ──
await seed('/classes/C1/history/s0_1_0', { studentId: 's0', entries: [] });
ok('學生改不了加分歷程',
   await req('PATCH', '/classes/C1/history/s0_1_0', 'kid0', doc({ studentId: 's0' })) === DENY);

// ── 舊學期封存:只有導師 ──
await seed('/classes/C1/archives/2026-04-01', { at: 1 });
s = await req('GET', '/classes/C1/archives/2026-04-01', 'kid0');
ok('學生碰不到舊學期封存', s === DENY, 'HTTP ' + s);

stop();
cleanLog();
process.exit(report('安全規則(真的規則引擎)', lines, []) ? 0 : 1);
