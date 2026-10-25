/* 蜂巢戰紀地圖的畫法。

   美術的事沒辦法用測試判斷好不好看,但「有沒有壞掉」可以 ——
   而這一塊壞掉的方式都很安靜:圖示變成方框、裝飾層把點擊吃掉、
   圖例指著一個已經不存在的顏色。這一套盯的就是那些。 */
import { loadPlaywright, openApp, prepare, okSrc, report } from './lib.mjs';

const chromium = await loadPlaywright();
const { page, errors, close } = await openApp(chromium, { width: 1400, height: 1000 });
await page.evaluate(okSrc);
await prepare(page);

const lines = await page.evaluate(() => {
  const t = window.__mk();
  window.__apply(window.__fixture());

  // 一局有戰況的地圖:五組、各自擴張、留幾個交戰中的格子
  const groups = Array.from({ length: 5 }, (_, g) =>
    Array.from({ length: 5 }, (_, j) => 's' + (g * 5 + j)));
  const config = Territory.createConfig(groups, {
    shape: 'hexagon', radius: 9, seed: 20260810, threshold: 5, battleSeconds: 90,
    answerSeconds: 0, wrongPenalty: 0, penaltyFloor: 6, maxSwaps: 3,
    cooldownWrong: 3, cooldownSeconds: 60, stageMode: 'auto', stageSeconds: 300
  });
  config.status = 'running';
  config.startedAt = Date.now() - 1000 * 60 * 25;
  const map = Territory.replay(config, [], Date.now(), {}, {}, {}).map;
  Object.keys(config.bases).forEach(bk => {
    const g = config.bases[bk];
    Object.keys(map).forEach(k => { if (Hex.distance(bk, k) <= 2 + (g % 2)) map[k].owner = g; });
    map[bk].owner = g; map[bk].isBase = true;
  });
  let n = 0;
  for (const k of Object.keys(map)) {
    if (map[k].owner === null && !map[k].isBase && n < 7) {
      map[k].battle = { endsAt: Date.now() + 40000, points: { 0: 4, 2: 2 } }; n++;
    }
  }

  const host = document.createElement('div');
  document.body.appendChild(host);
  host.innerHTML = renderHexMap(config, map, { zoom: 1, groupIdx: 0, onClick: 'window.__hit' });

  const svg = host.querySelector('svg.hex-map');
  t.ok('地圖畫得出來', !!svg);
  t.ok('每一格都在', host.querySelectorAll('.hex').length === Object.keys(map).length,
    host.querySelectorAll('.hex').length + ' 格');
  t.ok('已佔領的格子帶 data-owner(帶我回領地要靠它)',
    host.querySelectorAll('.hex[data-owner]').length > 0);
  t.ok('未開放的格子還在而且不是黑色',
    host.querySelectorAll('.hex.locked').length > 0 &&
    host.querySelector('.hex.locked polygon').getAttribute('fill') === TERRITORY_ART.landLock);

  // ── 新的美術元素 ──
  t.ok('領地有整塊的輪廓,不是每格白邊',
    [...svg.querySelectorAll('path')].some(p => (p.getAttribute('stroke') === '#fff')
      && p.getAttribute('fill') === 'none'));
  t.ok('每一組的領地上都插了旗', (svg.innerHTML.match(/第 \d 組 ·/g) || []).length >= 4,
    (svg.innerHTML.match(/第 \d 組 ·/g) || []).length + ' 面');
  t.ok('基地畫成徽章', host.querySelectorAll('.tg-base').length === 5,
    host.querySelectorAll('.tg-base').length + ' 個');
  t.ok('交戰中畫成分環', host.querySelectorAll('.tg-battle').length === 7,
    host.querySelectorAll('.tg-battle').length + ' 個');
  t.ok('交戰環中間寫著還差幾分',
    [...host.querySelectorAll('.tg-battle text')].every(e => /^\d+$/.test(e.textContent.trim())));
  /* 以前這裡是一個 ⚔ —— 而那個字在 Noto 裡沒有,實際畫出來是方框。
     任何「用字型當圖示」的東西都要擋,不然下次又會悄悄變成豆腐。 */
  t.ok('沒有用字型當圖示的符號(⚔ 在字型裡不存在,會變方框)',
    !svg.innerHTML.includes('⚔'));
  t.ok('霧有畫出來', host.querySelectorAll('.tg-fog').length === 1);

  // ── 裝飾層不可以吃掉點擊 ──
  const decoBad = [...svg.querySelectorAll('g')].filter(g =>
    (g.querySelector('.tg-base, .tg-battle') || g.classList.contains('tg-fog'))
    && getComputedStyle(g).pointerEvents !== 'none');
  t.ok('裝飾層都是 pointer-events:none(否則點不到格子)',
    decoBad.length === 0, decoBad.length + ' 層會擋');

  // 可攻擊的格子仍然掛得上 onclick
  const atk = host.querySelector('.hex[data-attackable="1"]');
  t.ok('可攻擊的格子仍然可以點', !!atk && !!atk.getAttribute('onclick'),
    atk ? atk.getAttribute('onclick') : '沒有可攻擊的格子');

  // ── 圖例要和地圖同一組顏色 ──
  const lg = host.querySelector('.lg-open');
  t.ok('圖例的「空地」和地圖同色',
    getComputedStyle(lg).backgroundColor === 'rgb(203, 217, 139)',
    getComputedStyle(lg).backgroundColor);
  t.ok('圖例的「海洋」和地圖同色',
    getComputedStyle(host.querySelector('.lg-sea')).backgroundColor === 'rgb(47, 111, 143)',
    getComputedStyle(host.querySelector('.lg-sea')).backgroundColor);

  // ── 旗子不可以蓋住基地徽章 ──
  const flagBoxes = [...svg.querySelectorAll('g > path')].filter(p =>
    p.parentElement.querySelector('text') &&
    /第 \d 組/.test(p.parentElement.querySelector('text').textContent));
  const baseCircles = [...svg.querySelectorAll('.tg-base circle')].filter(c =>
    parseFloat(c.getAttribute('r')) > 10);
  const hit = flagBoxes.some(f => {
    const a = f.getBoundingClientRect();
    return baseCircles.some(c => {
      const b2 = c.getBoundingClientRect();
      return a.left < b2.right && a.right > b2.left && a.top < b2.bottom && a.bottom > b2.top;
    });
  });
  t.ok('旗子沒有壓到基地徽章', !hit);

  // ── 大地圖要收斂特效,不然每秒重繪會卡 ──
  const big = Territory.createConfig(groups, { shape: 'hexagon', radius: 20, seed: 1,
    threshold: 5, battleSeconds: 90, stageMode: 'auto', stageSeconds: 300 });
  big.status = 'running'; big.startedAt = Date.now() - 1000 * 60 * 5;
  const bigMap = Territory.replay(big, [], Date.now(), {}, {}, {}).map;
  const t0 = performance.now();
  const bigHtml = renderHexMap(big, bigMap, { zoom: 1 });
  const ms = performance.now() - t0;
  t.ok('上千格的地圖也畫得動', Object.keys(bigMap).length > 1200 && ms < 1200,
    `${Object.keys(bigMap).length} 格 · ${Math.round(ms)}ms`);
  t.ok('格子太多時關掉模糊(每秒重繪會卡)', !bigHtml.includes('filter="url(#tgSoft)"'));

  /* ---- 剛剛被搶下來 ---- */
  resetMapAnimState();
  host.innerHTML = renderHexMap(config, map, { zoom: 1, groupIdx: 0 });
  t.ok('第一次繪製不播動畫(否則一進畫面全圖在閃)',
    host.querySelectorAll('.hex.just-taken').length === 0);

  const free = Object.keys(map).filter(k => map[k].owner === null && !map[k].battle).slice(0, 2);
  free.forEach(k => { map[k].owner = 0; });
  host.innerHTML = renderHexMap(config, map, { zoom: 1, groupIdx: 0 });
  t.ok('易主的格子會標記出來', host.querySelectorAll('.hex.just-taken').length === 2,
    host.querySelectorAll('.hex.just-taken').length + ' 格');
  t.ok('而且畫出擴散的光環', host.querySelectorAll('.tg-taken').length === 2);
  t.ok('光環不吃點擊',
    [...host.querySelectorAll('.tg-taken')].every(g => getComputedStyle(g).pointerEvents === 'none'));

  host.innerHTML = renderHexMap(config, map, { zoom: 1, groupIdx: 0 });
  t.ok('同樣的戰況再繪一次就不會再閃',
    host.querySelectorAll('.hex.just-taken').length === 0);

  // 換一局要忘掉上一局的歸屬
  resetMapAnimState();
  host.innerHTML = renderHexMap(config, map, { zoom: 1, groupIdx: 0 });
  t.ok('換一局之後第一張圖也不閃',
    host.querySelectorAll('.hex.just-taken').length === 0);

  /* ---- 地圖上的戰況牌 ---- */
  t.ok('地圖上有戰況牌', host.querySelectorAll('.tg-hud-row').length === 5,
    host.querySelectorAll('.tg-hud-row').length + ' 列');
  t.ok('戰況牌標出「我這一組」',
    host.querySelectorAll('.tg-hud-row.is-me').length === 1);
  t.ok('戰況牌不擋住地圖',
    getComputedStyle(host.querySelector('.tg-hud')).pointerEvents === 'none');
  t.ok('名次是照格數排的', (() => {
    const n = [...host.querySelectorAll('.tg-hud-count')].map(e => +e.textContent);
    return n.every((v, i) => i === 0 || n[i - 1] >= v);
  })());
  host.innerHTML = renderHexMap(config, map, { zoom: 1, hud: false });
  t.ok('可以關掉戰況牌', host.querySelectorAll('.tg-hud').length === 0);

  /* ---- 音效 ---- */
  t.ok('音效不靠任何音檔(合成的)', Object.keys(SFX.SOUNDS).length >= 5,
    Object.keys(SFX.SOUNDS).join(','));
  t.ok('老師端預設開啟音效', SFX.defaultOn() === true);
  const keepInfo = (typeof StudentApp !== 'undefined') ? StudentApp.classInfo : null;
  StudentApp.classInfo = { classId: 'C1', studentId: 's0' };
  t.ok('學生端預設關閉(28 台平板同時嗶是教室災難)', SFX.defaultOn() === false);
  StudentApp.classInfo = keepInfo;
  t.ok('出不了聲不會變成錯誤', (() => {
    const keep = SFX.ctx; SFX._on = true; SFX.ctx = () => null;
    let ok2 = true; try { SFX.play('capture'); } catch (e) { ok2 = false; }
    SFX.ctx = keep; SFX._on = null; return ok2;
  })());

  host.remove();
  return t.out;
});

await close();
process.exit(report('蜂巢戰紀地圖', lines, errors) ? 0 : 1);
