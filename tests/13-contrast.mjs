/* 文字對比。

   小學生、投影到教室後排、老師在陽光下看平板 —— 這個系統的使用情境
   對「看不看得清楚」特別敏感,而淡灰色的小字是最容易出事的地方:
   它不會報錯,只會讓人瞇著眼睛。

   標準用 WCAG AA:一般文字 4.5、大字(24px 或 18.66px 粗體)3.0。

   ── 關於背景 ──
   難的地方不是算對比,是「這段字到底疊在什麼顏色上」。
   很多面板的底是漸層(投影模式、計時器、抽籤機、AI 橫幅),
   那時候 backgroundColor 是透明的,一路往上找會找到白色的頁面底 ——
   於是白字被判成「白底白字」,報出一堆 1.13 的假警報。
   我第一版就是這樣,48 個問題裡有一半是假的。
   所以這裡會連 background-image 裡的漸層一起解析。
*/
import { loadPlaywright, openApp, prepare, okSrc, report } from './lib.mjs';

const chromium = await loadPlaywright();
const { page, errors, close } = await openApp(chromium, { width: 1440, height: 1050 });
await page.evaluate(okSrc);
await prepare(page);

const lines = await page.evaluate(() => {
  const t = window.__mk();
  const f = window.__fixture({ students: 12, questions: 0 });
  const today = new Date().toISOString().slice(0, 10);
  f.blob.attendance = { [today]: { s0: 'present', s1: 'absent' } };
  f.blob.homework = [{ id: 'h1', title: '數學習作', due: today, submissions: {} }];
  f.blob.classTasks = [{ id: 't1', name: '閱讀王', target: 100, current: 40, reward: 5 }];
  f.blob.groupSets = [{ name: '第一次', groups: [['s0', 's1'], ['s2', 's3']] }];
  f.blob.quizzes = [{ id: 'q1', title: '小考', status: 'closed', scoreMode: 'all',
    pointsPerQuestion: 1, questions: [{ id: 'qq1', type: 'choice', text: '1+1',
    options: ['1', '2'], answer: 1 }] }];
  f.blob.students[3].pet = null;
  window.__apply(f);
  showApp();

  const lin = v => (v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4));
  const lum = c => .2126 * lin(c[0] / 255) + .7152 * lin(c[1] / 255) + .0722 * lin(c[2] / 255);
  const nums = s => (s.match(/[\d.]+/g) || []).map(Number);
  const ratio = (a, b) => {
    const x = lum(a) + .05, y = lum(b) + .05;
    return x > y ? x / y : y / x;
  };
  /* 漸層裡抓一個代表色。取最後一個 rgb(...) —— 180deg 的漸層通常
     越往下越深,而文字多半落在中下段,取深的那一端比較保守。 */
  const fromGradient = img => {
    const all = [...img.matchAll(/rgba?\(([^)]+)\)/g)]
      .map(m => nums(m[1]))
      .filter(c => c.length >= 3 && (c[3] === undefined || c[3] > .5));
    return all.length ? all[all.length - 1].slice(0, 3) : null;
  };
  const bgOf = el => {
    let n = el;
    while (n && n !== document.documentElement) {
      const cs = getComputedStyle(n);
      const c = nums(cs.backgroundColor);
      if (c.length >= 3 && (c[3] === undefined || c[3] > .85)) return c.slice(0, 3);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') {
        const g = fromGradient(cs.backgroundImage);
        if (g) return g;
      }
      n = n.parentElement;
    }
    return [255, 255, 255];
  };

  /* 兩個主題都要掃。
     同一段 CSS 在兩個主題底下是不同顏色,而「只量了其中一個」
     正是這次找到的問題的根源 —— 極光的次要文字只量過白底、
     森林的金色文字根本沒量過(2.21)。 */
  const bad = [];
  const themes = ['aurora', ''];
  themes.forEach(theme => {
  if (theme) document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
  const tName = theme || '森林(預設)';
  NAV_GROUPS.forEach(g => g.items.forEach(it => {
    navGoItem(g.key, it.view, it.sub || '');
    const view = document.querySelector('.view.active');
    if (!view) return;
    view.querySelectorAll('*').forEach(el => {
      if (el.children.length > 0) return;              // 只看真正裝文字的節點
      const txt = (el.textContent || '').trim();
      if (txt.length < 2) return;
      /* 純表情符號不算。它們是用自己的顏色畫的(彩色字形),
         CSS 的 color 根本管不到,量出來的數字沒有意義。 */
      if (!/[\p{L}\p{N}]/u.test(txt)) return;
      if (el.offsetParent === null) return;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden') return;
      const fg = nums(cs.color);
      if (fg.length >= 4 && fg[3] < .9) return;        // 半透明的字另計
      const size = parseFloat(cs.fontSize);
      const need = (size >= 24 || (size >= 18.66 && parseInt(cs.fontWeight) >= 700)) ? 3 : 4.5;
      const r = ratio(fg.slice(0, 3), bgOf(el));
      if (r + 0.02 < need) {
        bad.push(`[${tName}] ${(el.className || el.tagName).toString().split(' ')[0]} `
          + `${Math.round(size)}px ${r.toFixed(2)}/${need} 「${txt.slice(0, 12)}」 @${g.name}/${it.name}`);
      }
    });
  }));
  });
  document.documentElement.dataset.theme = 'aurora';

  const uniq = [...new Set(bad)];
  t.ok('每一段文字都達到 WCAG AA 的對比', uniq.length === 0,
    '\n      ' + uniq.join('\n      ') || '全部達標');

  /* 次要文字是重災區:它在白底、暖底、頁面底三種背景上都要讀得到。
     原本只量了白底,所以在另外兩種底上是不合格的。 */
  const probe = document.createElement('span');
  document.body.appendChild(probe);
  const read = v => {
    probe.style.color = `var(${v})`;
    return nums(getComputedStyle(probe).color).slice(0, 3);
  };
  const checkTheme = theme => {
    if (theme) document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
    const muted = read('--ink-muted');
    const goldInk = read('--gold-ink');
    const out = [];
    [['--paper', read('--paper')], ['--paper-warm', read('--paper-warm')]].forEach(([n, c]) => {
      out.push([`${theme || '森林'} ${n}`, ratio(muted, c), ratio(goldInk, c)]);
    });
    return out;
  };
  const rows = [...checkTheme('aurora'), ...checkTheme('')];
  document.documentElement.dataset.theme = 'aurora';
  t.ok('兩個主題的次要文字與金色文字,在每一種底色上都達標',
    rows.every(r => r[1] >= 4.5 && r[2] >= 4.5),
    rows.map(r => `${r[0]} 灰${r[1].toFixed(2)}/金${r[2].toFixed(2)}`).join(' · '));

  /* 白字的小徽章。原色當底時對比不夠(量過:3.47 / 2.95 / 3.81),
     所以另外給了一組 -deep 只用在這裡。 */
  const white = [255, 255, 255];
  const deeps = ['--moss-deep', '--mild-deep', '--sunset-deep'];
  const badDeep = deeps.filter(v => ratio(white, read(v)) < 4.5);
  t.ok('白字徽章的底色夠深', badDeep.length === 0,
    deeps.map(v => `${v} ${ratio(white, read(v)).toFixed(2)}`).join(' · '));
  probe.remove();

  return t.out;
});

await close();
process.exit(report('文字對比(WCAG AA)', lines, errors) ? 0 : 1);
