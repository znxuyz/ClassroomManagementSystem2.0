/* ============================================
   學生個人歷程 — 匯出成一個檔案
   ────────────────────────────────────────────
   報表那一頁本來就看得到、也印得出來(或存成 PDF)。
   缺的是**一份可以直接傳給家長的檔案**:

   · 家長用手機點開就能看,不必登入、不必裝 App、不必有網路
   · 內容和老師看到的那份一樣,包含每月積分與逐筆明細
   · 一個檔案,方便用 LINE 或 email 傳出去

   所以做成「自成一體的 HTML」:樣式全部內嵌,不連任何外部資源。
   守護獸的圖會試著轉成 base64 一起包進去;轉不成(離線、檔案不在)
   就退回用表情符號 —— 不會因此壞掉,只是少一張圖。

   刻意不做 PDF:要嘛得載一個幾百 KB 的函式庫,要嘛得靠伺服器。
   HTML 檔在手機上一樣點開就看,而且家長想印的話瀏覽器自己會印。
============================================ */

/* 把守護獸的圖轉成 base64 塞進檔案裡,這樣家長那邊不必連網。

   但**要先縮小**:原圖是給大畫面用的(單張 300~400 KB),
   直接塞進去整份檔案會變成快 500 KB —— 用 LINE 傳會卡,
   而檔案裡它只顯示成一個 88px 的小圓。
   縮到 208px(高解析螢幕的 2 倍)再轉 webp,大約剩 20~40 KB。

   失敗就回 null,呼叫端退回用表情符號 —— 少一張圖,不會壞掉。 */
async function _inlinePetImage(src, size) {
  /* file:// 底下 fetch 一定會失敗,而且會在 Console 留一行紅字 ——
     明明是預期中的情況,看起來卻像壞掉了。直接不要試。
     (正式站是 https,走得到下面那段。) */
  if (location.protocol === 'file:') return null;
  try {
    const res = await fetch(src);
    if (!res.ok) return null;
    const blob = await res.blob();
    const bmp = await createImageBitmap(blob);

    const px = size || 208;
    const cv = document.createElement('canvas');
    cv.width = px;
    cv.height = px;
    const ctx = cv.getContext('2d');
    // 維持比例置中,不要把獸拉變形
    const scale = Math.min(px / bmp.width, px / bmp.height);
    const w = bmp.width * scale, h = bmp.height * scale;
    ctx.drawImage(bmp, (px - w) / 2, (px - h) / 2, w, h);
    bmp.close?.();

    const webp = cv.toDataURL('image/webp', 0.9);
    // 有些瀏覽器不支援 webp,toDataURL 會悄悄回傳 png —— 那也可以用
    const out = webp.startsWith('data:image/') ? webp : cv.toDataURL('image/png');
    return out.length > 600 * 1024 ? null : out;
  } catch (e) {
    return null;
  }
}

function _esc(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* 一位學生的完整歷程,組成一份獨立的 HTML。 */
async function buildStudentExport(student, fullHistory) {
  const s = student;
  const stage = s.pet ? PetEngine.getStage(s.totalPoints) : 0;
  const species = s.pet ? PET_SPECIES.find(p => p.id === s.pet) : null;
  const hist = fullHistory || s.history || [];

  // 守護獸的圖:能內嵌就內嵌,不能就用表情符號
  let petImg = null;
  if (s.pet) {
    petImg = await _inlinePetImage(`assets/pets/${s.pet}-${STAGE_KEYS[stage]}.png`);
  }
  const petFallback = s.pet ? STAGE_ICONS[s.pet][stage] : '❓';

  // 出席
  let present = 0, absent = 0, late = 0, total = 0;
  Object.values(state.attendance || {}).forEach(day => {
    const v = day[s.id];
    if (!v) return;
    total++;
    if (v === 'present') present++;
    else if (v === 'absent') absent++;
    else if (v === 'late') late++;
  });
  const attRate = total > 0 ? Math.round((present + late) / total * 100) : 0;

  // 作業
  let hwDone = 0, hwLate = 0;
  const hwTotal = (state.homework || []).length;
  (state.homework || []).forEach(hw => {
    const sub = (hw.submissions || {})[s.id];
    if (sub && sub.status === 'submitted') hwDone++;
    else if (sub && sub.status === 'late') hwLate++;
  });
  const hwRate = hwTotal > 0 ? Math.round((hwDone + hwLate) / hwTotal * 100) : 100;

  const months = monthlyPoints(hist);
  const gain = months.reduce((t, m) => t + m.gain, 0);
  const loss = months.reduce((t, m) => t + m.loss, 0);

  // 主要得分項目
  const byReason = {};
  hist.forEach(h => { byReason[h.reason] = (byReason[h.reason] || 0) + h.points; });
  const top = Object.entries(byReason).sort((a, b) => b[1] - a[1]).slice(0, 6);

  // 老師在報表裡打的評語(有打才帶過去)
  const noteEl = document.getElementById('reportNarrative');
  const note = noteEl ? noteEl.textContent.trim() : '';

  const monthName = k => {
    const [y, m] = k.split('-');
    return `${y} 年 ${parseInt(m)} 月`;
  };
  const d = new Date();
  const stamp = `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`;

  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${_esc(s.name)} · 學習歷程 — ${_esc(state.className)}</title>
<style>
  /* 全部內嵌,不連任何外部資源 —— 家長離線也看得到 */
  :root { --ink:#242b35; --soft:#55606e; --muted:#7b8694; --line:#e3e7ee;
          --paper:#fff; --bg:#f4f6fa; --accent:#2f5c46; --gold:#8a6a1f; --warn:#b1301f; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink);
         font-family:"Noto Sans TC","PingFang TC","Microsoft JhengHei",system-ui,sans-serif;
         line-height:1.75; -webkit-text-size-adjust:100%; }
  .wrap { max-width:760px; margin:0 auto; padding:20px 16px 56px; }
  .card { background:var(--paper); border:1px solid var(--line); border-radius:12px;
          padding:20px; margin-bottom:14px; }
  h1 { font-size:21px; margin:0 0 2px; }
  .sub { color:var(--muted); font-size:13px; margin-bottom:18px; }
  h2 { font-size:15px; margin:0 0 12px; display:flex; align-items:center; gap:9px; }
  h2::before { content:""; width:4px; height:16px; border-radius:2px; background:var(--gold); }
  .hero { display:flex; gap:18px; align-items:center; }
  .pet { width:104px; height:104px; border-radius:50%; flex-shrink:0;
         display:flex; align-items:center; justify-content:center; font-size:52px;
         background:var(--bg); box-shadow:0 0 0 3px var(--line); overflow:hidden; }
  .pet img { width:88px; height:88px; object-fit:contain; }
  .hero-name { font-size:19px; font-weight:700; }
  .hero-meta { color:var(--soft); font-size:13px; }
  .stats { display:flex; flex-wrap:wrap; gap:18px; margin-top:12px; }
  .stat .k { font-size:11px; color:var(--muted); letter-spacing:.08em; }
  .stat .v { font-size:22px; font-weight:800; }
  table { width:100%; border-collapse:collapse; font-size:13px; }
  th,td { border-bottom:1px solid var(--line); padding:7px 9px; text-align:left; }
  th { color:var(--muted); font-weight:600; font-size:12px; }
  td.n, th.n { text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums; }
  .up { color:var(--accent); font-weight:600; }
  .down { color:var(--warn); font-weight:600; }
  .mth { font-size:14px; font-weight:700; margin:16px 0 4px; }
  .note { background:var(--bg); border-radius:8px; padding:14px; white-space:pre-wrap;
          font-size:14px; }
  .foot { text-align:center; color:var(--muted); font-size:12px; margin-top:22px; }
  details > summary { cursor:pointer; color:var(--soft); font-size:13px; padding:4px 0; }
  @media print {
    body { background:#fff; }
    .card { border:none; padding:0 0 10px; margin-bottom:10px; page-break-inside:avoid; }
    details { open:true; }
    details > summary { display:none; }
    details > *:not(summary) { display:block !important; }
  }
</style>
</head>
<body>
<div class="wrap">
  <h1>${_esc(s.name)} 的學習歷程</h1>
  <div class="sub">${_esc(state.className)} · ${_esc(state.teacherName)} · 截至 ${stamp}</div>

  <div class="card">
    <div class="hero">
      <div class="pet">${petImg
        ? `<img src="${petImg}" alt="守護獸">`
        : _esc(petFallback)}</div>
      <div>
        <div class="hero-name">${_esc(s.petName || (species ? species.name : '守護獸'))}</div>
        <div class="hero-meta">${species ? _esc(species.name) + ' · ' : ''}${
          _esc(STAGE_NAMES[stage])}</div>
        <div class="stats">
          <div class="stat"><div class="k">累積經驗</div><div class="v">${s.totalPoints}</div></div>
          <div class="stat"><div class="k">出席率</div><div class="v">${attRate}%</div></div>
          <div class="stat"><div class="k">作業完成率</div><div class="v">${hwRate}%</div></div>
        </div>
      </div>
    </div>
  </div>

  ${months.length ? `
  <div class="card">
    <h2>每月積分</h2>
    <p style="font-size:13px;color:var(--soft);margin:0 0 10px">
      共 ${hist.length} 筆紀錄,累計得分 <b class="up">+${gain}</b>、
      扣分 <b class="down">${loss}</b>,淨值 <b>${gain + loss}</b>。
    </p>
    <table>
      <thead><tr><th>月份</th><th class="n">得分</th><th class="n">扣分</th>
        <th class="n">淨值</th><th class="n">筆數</th></tr></thead>
      <tbody>${months.map(m => `
        <tr><td>${monthName(m.key)}</td>
          <td class="n up">+${m.gain}</td>
          <td class="n down">${m.loss === 0 ? '—' : m.loss}</td>
          <td class="n"><b>${m.gain + m.loss}</b></td>
          <td class="n">${m.n}</td></tr>`).join('')}
      </tbody>
    </table>
  </div>` : ''}

  ${top.length ? `
  <div class="card">
    <h2>主要表現</h2>
    <table><tbody>${top.map(([r, p]) => `
      <tr><td>${_esc(r)}</td>
        <td class="n ${p >= 0 ? 'up' : 'down'}">${p > 0 ? '+' : ''}${p}</td></tr>`).join('')}
    </tbody></table>
  </div>` : ''}

  <div class="card">
    <h2>出席與作業</h2>
    <table><tbody>
      <tr><td>出席天數</td><td class="n">${present} 天</td></tr>
      <tr><td>遲到天數</td><td class="n">${late} 天</td></tr>
      <tr><td>缺席天數</td><td class="n">${absent} 天</td></tr>
      <tr><td>已繳作業</td><td class="n">${hwDone} / ${hwTotal}</td></tr>
      <tr><td>遲交作業</td><td class="n">${hwLate} / ${hwTotal}</td></tr>
    </tbody></table>
  </div>

  ${note ? `<div class="card"><h2>導師評語</h2><div class="note">${_esc(note)}</div></div>` : ''}

  ${months.length ? `
  <div class="card">
    <h2>逐筆明細</h2>
    <details>
      <summary>展開全部 ${hist.length} 筆</summary>
      ${months.map(m => `
        <div class="mth">${monthName(m.key)}</div>
        <table><tbody>${m.rows.map(h => `
          <tr>
            <td class="n" style="color:var(--muted);width:1%">${
              new Date(h.time || 0).toLocaleDateString('zh-TW',
                { month: 'numeric', day: 'numeric' })}</td>
            <td>${_esc(h.reason || '(未註明)')}</td>
            <td class="n ${h.points >= 0 ? 'up' : 'down'}">${
              h.points >= 0 ? '+' : ''}${h.points}</td>
          </tr>`).join('')}
        </tbody></table>`).join('')}
    </details>
  </div>` : ''}

  <div class="foot">守護獸學園 · ${_esc(state.className)} · 班導:${_esc(state.teacherName)}</div>
</div>
</body>
</html>`;
}

/* 下載某一位學生的歷程檔。 */
async function exportStudentReport(studentId) {
  const s = getStudent(studentId);
  if (!s) return;

  toast('整理歷程中…');
  let hist;
  try {
    hist = await HistoryArchive.full(s);
  } catch (e) {
    console.warn('[匯出] 讀取封存歷程失敗,只用主文件裡的:', e.message);
    hist = s.history || [];
  }

  const html = await buildStudentExport(s, hist);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const d = new Date();
  const p2 = n => String(n).padStart(2, '0');
  a.href = url;
  a.download = `${state.className || '班級'}_${s.name}_學習歷程_`
    + `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}.html`;
  a.click();
  URL.revokeObjectURL(url);
  toast(`✦ 已下載 ${s.name} 的學習歷程(${hist.length} 筆)`);
}
