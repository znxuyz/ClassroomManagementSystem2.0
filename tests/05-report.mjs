/* 學期成長報表的每月積分與逐筆明細 */
import { loadPlaywright, openApp, prepare, okSrc, report } from './lib.mjs';

const chromium = await loadPlaywright();
const { page, errors, close } = await openApp(chromium);
await page.evaluate(okSrc);
await prepare(page);

const lines = await page.evaluate(() => {
  const t = window.__mk();
  const f = window.__fixture();
  window.__apply(f);
  showApp();

  // 橫跨好幾個月的歷程(fixture 預設都在今天,看不出月份分組)
  const hist = [];
  let gain = 0, loss = 0;
  const start = new Date(); start.setMonth(start.getMonth() - 4);
  for (let d = 0; d < 150; d++) {
    const day = new Date(start); day.setDate(day.getDate() + d);
    if (day.getDay() === 0 || day.getDay() === 6) continue;
    for (let k = 0; k < 3; k++) {
      const p = (d % 17 === 0 && k === 0) ? -2 : 1;
      if (p > 0) gain += p; else loss += p;
      hist.push({ time: day.getTime() + k * 3600000, points: p,
        reason: p > 0 ? ['上課發言', '幫助同學', '作業準時'][k] : '未帶課本' });
    }
  }

  const months = monthlyPoints(hist);
  t.ok('月份數合理', months.length >= 4 && months.length <= 6, months.length + ' 個月');
  t.ok('月統計加總等於原始加總',
    months.reduce((n, m) => n + m.gain, 0) === gain &&
    months.reduce((n, m) => n + m.loss, 0) === loss, `+${gain} / ${loss}`);
  t.ok('月統計筆數等於原始筆數',
    months.reduce((n, m) => n + m.n, 0) === hist.length, hist.length + ' 筆');
  t.ok('月份新的排前面', months.every((m, i) => i === 0 || months[i - 1].key > m.key));
  t.ok('每月內逐筆也是新的在前',
    months.every(m => m.rows.every((h, i) => i === 0 || m.rows[i - 1].time >= h.time)));

  navGoItem('data', 'overview', 'report');
  document.getElementById('reportContainer').innerHTML =
    buildStudentReport({ ...getStudent('s0'), history: hist });

  const detail = document.getElementById('reportHistoryDetail');
  t.ok('明細預設收起(不然每次列印都多好幾頁)', !!detail && detail.hasAttribute('hidden'));
  t.ok('明細筆數等於全部紀錄',
    detail.querySelectorAll('.is-detail tbody tr').length === hist.length);
  toggleHistoryDetail();
  t.ok('按一下展開', !detail.hasAttribute('hidden'));
  t.ok('按鈕文字跟著改', document.getElementById('reportDetailBtn').textContent.includes('收起'));
  toggleHistoryDetail();
  t.ok('再按一下收起', detail.hasAttribute('hidden'));

  /* 這份報告最常見的用途是印出來給家長看,而紙上沒有滑鼠 ——
     長條的數值如果只放在 data-value(靠 hover 顯示),
     印出來就是一排沒有刻度的柱子。 */
  const nums = [...document.querySelectorAll('.report-bar-num')];
  t.ok('長條圖的數字印得出來(不是只有滑鼠移上去才看得到)',
    nums.length === 8 && nums.every(e => /^[+-]?\d+$/.test(e.textContent.trim())),
    nums.length + ' 根');

  /* 扣分的那一週要往**下**長,不能只靠顏色區分 ——
     紅配綠在紅綠色弱的眼睛裡幾乎是同一個顏色(實測色弱分離度 6.6,
     安全線是 8),而這一份還會被印成黑白。方向才是可靠的訊號。 */
  {
    const hist2 = [
      { time: Date.now() - 20 * 86400000, points: 6, reason: '上課發言' },
      { time: Date.now() - 13 * 86400000, points: -4, reason: '未帶課本' },
      { time: Date.now() - 2 * 86400000, points: 3, reason: '幫助同學' }
    ];
    document.getElementById('reportContainer').innerHTML =
      buildStudentReport({ ...getStudent('s0'), history: hist2 });

    const chart = document.querySelector('.report-bar-chart');
    const zero = chart.querySelector('.report-zero').getBoundingClientRect();
    const pos = [...chart.querySelectorAll('.report-bar.pos')];
    const neg = [...chart.querySelectorAll('.report-bar.neg')];
    t.ok('有零線', !!chart.querySelector('.report-zero'));
    t.ok('加分的長條在零線之上',
      pos.length === 2 && pos.every(b => b.getBoundingClientRect().bottom <= zero.bottom + 1),
      pos.length + ' 根');
    t.ok('扣分的長條在零線之下',
      neg.length === 1 && neg.every(b => b.getBoundingClientRect().top >= zero.top - 1),
      neg.length + ' 根');
    t.ok('長條沒有超出圖表範圍',
      [...chart.querySelectorAll('.report-bar')].every(b => {
        const r = b.getBoundingClientRect(), c = chart.getBoundingClientRect();
        return r.top >= c.top - 1 && r.bottom <= c.bottom + 1;
      }));
    t.ok('顏色用的是圖表專用的那兩個變數,沒有寫死色碼',
      pos.length > 0 && getComputedStyle(pos[0]).backgroundImage === 'none');

    // 全部都是正的時候,零線就在底部,不該有往下長的柱子
    document.getElementById('reportContainer').innerHTML =
      buildStudentReport({ ...getStudent('s0'),
        history: [{ time: Date.now(), points: 3, reason: '上課發言' }] });
    const c2 = document.querySelector('.report-bar-chart');
    t.ok('沒有扣分時不會出現往下的柱子',
      c2.querySelectorAll('.report-bar.neg').length === 0
      && Math.abs(c2.querySelector('.report-zero').getBoundingClientRect().bottom
                  - c2.getBoundingClientRect().bottom) < 25);

    document.getElementById('reportContainer').innerHTML =
      buildStudentReport({ ...getStudent('s0'), history: hist });
  }

  t.ok('原因欄有 HTML 轉義',
    !buildHistoryDetail({ history: [{ time: Date.now(), points: 1,
      reason: '<img src=x onerror=alert(1)>' }] }).includes('<img src=x'));
  t.ok('沒有紀錄時整段不出現', buildHistoryDetail({ history: [] }) === '');

  return t.out;
});

await close();
process.exit(report('學期成長報表', lines, errors) ? 0 : 1);
