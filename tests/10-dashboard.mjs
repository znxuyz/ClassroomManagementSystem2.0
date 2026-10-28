/* 學生加分的方格版面 + 手機的底部浮層 + 蜂巢戰紀的開局設定。

   這一頁是全系統按最多次的地方,所以要釘住的是「一眼看得完」:
   電腦上 28 位不必捲動、手機上不會只看得到三個人。 */
import { loadPlaywright, openApp, prepare, okSrc, report } from './lib.mjs';

const chromium = await loadPlaywright();
const lines = [];
let allErrors = [];

for (const [w, h, tag] of [[1440, 1000, '1440'], [1024, 800, '1024'], [390, 844, '390']]) {
  const { page, errors, close } = await openApp(chromium, { width: w, height: h });
  await page.evaluate(okSrc);
  await prepare(page);

  const r = await page.evaluate(wide => {
    const t = window.__mk();
    window.__apply(window.__fixture());
    // 一位還沒選守護獸的,用來確認那個提示留著
    state.students[5].pet = null;
    showApp();
    navGoItem('class', 'dashboard', '');

    const grid = document.getElementById('studentList');
    const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
    const gridH = grid.getBoundingClientRect().height;

    t.ok('學生排成方格', getComputedStyle(grid).display === 'grid' && cols >= 2, cols + ' 欄');
    t.ok('每一位都畫出來', grid.children.length === state.students.length);
    t.ok('<ul> 的預設縮排有歸零(不然手機上會少一整欄)',
      parseFloat(getComputedStyle(grid).paddingLeft) === 0);

    if (wide) {
      /* 一眼看得完 = 方格的高度放得進「扣掉上方框架之後」的畫面。
         這才是真正要守住的事,不是某個固定的像素數。 */
      const room = window.innerHeight - 220;
      t.ok('電腦上 28 位不必捲動就看得完', gridH < room,
        `${Math.round(gridH)}px / 可用 ${Math.round(room)}px`);
    } else {
      /* 守護獸放大之後格子變成直式,所以不是比「格子多矮」,
         而是比「整串要捲多久」—— 原本一欄 2600px、一眼 3.5 位。 */
      t.ok('手機上一排放四位,整串高度大幅縮短',
        cols === 4 && gridH < 1000,
        `${cols} 欄 · 整串 ${Math.round(gridH)}px(原本 2600px)`);
    }

    t.ok('沒選人時不會整片空白板子(提示只有一行)',
      document.querySelector('.selected-student-card').getBoundingClientRect().height < 90,
      Math.round(document.querySelector('.selected-student-card').getBoundingClientRect().height) + 'px');
    t.ok('提示的字改掉了(手機沒有「左側」)',
      !document.querySelector('.action-panel').textContent.includes('從左側'));
    t.ok('還沒選守護獸的人看得出來',
      grid.children[5].querySelector('.student-nopet') !== null);
    /* 久沒被加分的那幾位要一眼看得出來 —— 本來只藏在頭像顏色裡 */
    state.students[2].lastPointTime = Date.now() - 5 * 86400000;
    state.students[3].lastPointTime = Date.now() - 9 * 86400000;
    state.students[0].lastPointTime = Date.now();
    renderStudentList();
    const chips = document.querySelectorAll('.student-quiet');
    t.ok('久沒加分的人卡片上有標示', chips.length === 2
      && chips[0].textContent.includes('5 天') && chips[1].textContent.includes('9 天'),
      [...chips].map(c => c.textContent).join(' · '));
    t.ok('剛加過分的人沒有那個標示',
      grid.children[0].querySelector('.student-quiet') === null);

    t.ok('不再每一列都重複階段名稱',
      !grid.children[0].textContent.includes('守護神獸'));

    // 選一位
    selectStudent('s0');
    const layout = document.getElementById('dashboardLayout');
    t.ok('選到人之後版面有標記', layout.classList.contains('has-selection'));
    t.ok('加分面板出現了',
      document.getElementById('quickAssignPanel').style.display !== 'none');
    const card = document.querySelector('.selected-student-card');
    const disp = document.querySelector('.selected-display');
    t.ok('卡片沒有被壓縮到切掉內容(浮層是 flex 欄,會壓縮子項)',
      card.getBoundingClientRect().height + 1 >= disp.getBoundingClientRect().height,
      `卡 ${Math.round(card.getBoundingClientRect().height)} / 內容 ${Math.round(disp.getBoundingClientRect().height)}`);
    t.ok('看得到可用積分',
      document.querySelector('.selected-stats').textContent.includes('可用積分'));

    clearStudentSelection();
    t.ok('收起之後面板關掉', !layout.classList.contains('has-selection')
      && document.getElementById('quickAssignPanel').style.display === 'none');

    // ---- 批次加分 ----
    BatchAward.toggle();
    BatchAward.pick('s0'); BatchAward.pick('s1');
    t.ok('批次加分仍然可用',
      layout.classList.contains('has-selection')
      && document.querySelector('.batch-panel') !== null);

    /* 「已選 N / 全選 / 離開批次」只能出現一次。
       它們原本在下面的面板裡又寫了一份,而那塊在 29 位學生之後 ——
       等於上面一份、下面一份,而下面那份還看不到。 */
    const panel = document.querySelector('.batch-panel');
    t.ok('批次面板不再重複「全選 / 離開批次」',
      !/全選|離開批次|全部取消/.test(panel.textContent),
      panel.textContent.replace(/\s+/g, ' ').trim().slice(0, 40));
    t.ok('「全選」在標題列(勾選時看得到)',
      document.getElementById('batchAllBtn').style.display !== 'none');
    t.ok('小組快捷還在', panel.querySelector('.batch-group') !== null
      || panel.textContent.includes('還沒有分組'));

    /* 面板黏在底部時不可以把學生蓋光 —— 那就換成「看得到按鈕但勾不到人」 */
    if (wide) {
      const ap = document.querySelector('.action-panel');
      const cs = getComputedStyle(ap);
      t.ok('面板黏底但不會蓋掉半個畫面',
        cs.position === 'sticky'
        && ap.getBoundingClientRect().height <= window.innerHeight * 0.5,
        `${cs.position} · ${Math.round(ap.getBoundingClientRect().height)}px / `
        + `${Math.round(window.innerHeight * 0.5)}px`);
    }

    BatchAward.toggle();
    t.ok('離開批次之後那顆「全選」收起來',
      document.getElementById('batchAllBtn').style.display === 'none');

    // 版面不可以溢出
    const over = [];
    document.querySelectorAll('.view.active *').forEach(el => {
      if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX === 'visible')
        over.push(el.className);
    });
    t.ok('沒有水平溢出', over.length === 0 &&
      document.documentElement.scrollWidth <= window.innerWidth + 1, over.join(', '));

    // ---- 上方框架的高度 ----
    const topbar = document.querySelector('.app-topbar')
      || document.querySelector('.app-header').parentElement;
    const topH = topbar.getBoundingClientRect().height;
    if (!wide) {
      t.ok('手機上方的框架壓薄了(原本約 230px)', topH < 160, Math.round(topH) + 'px');
      t.ok('第二排不再換行', document.getElementById('navSubTabs').getBoundingClientRect().height < 60,
        Math.round(document.getElementById('navSubTabs').getBoundingClientRect().height) + 'px');
    }

    // ---- 蜂巢戰紀開局設定 ----
    navGoItem('challenge', 'territory', 'tgBoard');
    const ids = ['tgShape','tgSize','tgStageMode','tgStageSeconds','tgBattle','tgAnswerSeconds',
                 'tgThreshold','tgWrongPenalty','tgPenaltyFloor','tgCooldownWrong',
                 'tgCooldownSeconds','tgMaxSwaps','tgStageUnit'];
    const missing = ids.filter(id => !document.getElementById(id));
    t.ok('開局設定的每個欄位都還在', missing.length === 0, missing.join(', '));
    t.ok('設定分成有標題的組別',
      document.querySelectorAll('.tg-group-title').length === 3,
      document.querySelectorAll('.tg-group-title').length + ' 組');
    t.ok('每個欄位都自己帶名稱',
      document.querySelectorAll('.tg-field-name').length === 12,
      document.querySelectorAll('.tg-field-name').length + ' 個');

    document.getElementById('tgStageMode').value = 'manual'; toggleStageSeconds();
    const hid = document.getElementById('tgStageSeconds').style.display === 'none';
    document.getElementById('tgStageMode').value = 'auto'; toggleStageSeconds();
    const shw = document.getElementById('tgStageSeconds').style.display !== 'none';
    t.ok('切成手動時秒數收起、切回自動時出現', hid && shw);

    describeShape();
    t.ok('地圖說明還算得出來',
      document.getElementById('tgShapeDesc').textContent.includes('格'));

    const over2 = [];
    document.querySelectorAll('.view.active *').forEach(el => {
      if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX === 'visible')
        over2.push(el.className);
    });
    t.ok('開局設定沒有水平溢出', over2.length === 0, over2.join(', '));

    return t.out;
  }, w >= 1024);

  r.forEach(l => lines.push(`${tag} ${l}`));
  allErrors = allErrors.concat(errors.map(e => `${tag} ${e}`));
  await close();
}

process.exit(report('學生加分方格 / 手機框架 / 蜂巢開局設定', lines, allErrors) ? 0 : 1);
