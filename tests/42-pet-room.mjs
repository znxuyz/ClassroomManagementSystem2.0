/* ============================================
   守護獸的房間(2.5D)
   ────────────────────────────────────────────
   房間是 Blender 預先算好的一圈圖,拖曳換圖。守護獸是那 32 張插畫,
   不是 3D 模型。要讓它成立,只有一件事真的難:

     **那張 2D 的圖要真的站在地板上。**

   房間一轉,牠得走到對的位置、縮成對的大小。這靠的是算圖時一併投影出來的
   room.json —— 這一套就是在盯那張表有沒有被正確使用。

   盯的事:
     1. 轉動時守護獸跟著走,而且是照表走,不是自己猜的
     2. 站得越後面畫得越小(透視要對,不然牠像貼在玻璃上)
     3. 房間的圖載不到時整個分頁要照舊能用 —— 裝飾功能不可以弄壞主功能
     4. 不要一次抓十三張圖(教室的網路)
     5. 點守護獸是逗牠,拖房間才是轉 —— 兩件事不能互相干擾
     6. 系統設了「減少動態」就不要一直動(前庭敏感的人會不舒服)
============================================ */
import { readFileSync, existsSync } from 'node:fs';
import { loadPlaywright, openApp, prepare, report } from './lib.mjs';

const chromium = await loadPlaywright();
const { page, errors, close } = await openApp(chromium);
await prepare(page);

const lines = [];
const ok = (n, c, e) => lines.push((c ? '✓ ' : '✗ ') + n + (e ? ' — ' + e : ''));

/* ---------- 先驗真的那份資料 ---------- */
const META = new URL('../assets/room/room.json', import.meta.url);
if (existsSync(META)) {
  const m = JSON.parse(readFileSync(META, 'utf8'));
  const spotsOk = m.frames.every(f =>
    f.spots && Object.values(f.spots).every(s =>
      typeof s.x === 'number' && typeof s.y === 'number' && s.unit > 0));
  ok('算好的 room.json 每一格都有站位與縮放',
     m.frames.length >= 3 && spotsOk, m.frames.length + ' 格');
  const files = m.frames.every(f =>
    existsSync(new URL('../assets/room/' + f.file, import.meta.url)));
  ok('room.json 指到的圖都真的在', files === true);
  // 轉動時站位要真的在移動,不是每一格都一樣(那表示投影沒算到)
  const xs = m.frames.map(f => f.spots.rug.x);
  ok('轉動時站位會跟著移動(投影有算到)',
     Math.max(...xs) - Math.min(...xs) > 0.02,
     xs.map(v => v.toFixed(2)).join(' '));
} else {
  ok('算好的 room.json 每一格都有站位與縮放', false, '還沒算圖');
}

/* ---------- 用假資料驗行為 ----------
   測試不該依賴十三張算好的圖:算圖要十分鐘,而且這一套要驗的是
   「拿到表之後有沒有照著擺」,不是算圖對不對。 */
const r = await page.evaluate(async () => {
  const out = {};

  /* 七格的假房間。格數要比「預載的範圍」多,不然測不出
     「沒有一次抓全部」這件事。站位從左到右移,unit 由大到小。 */
  const N = 7;
  const fake = {
    width: 800, height: 576, arc: 44,
    frames: Array.from({ length: N }, (_, i) => ({
      file: 'f' + i + '.webp',
      angle: -44 + 88 * i / (N - 1),
      spots: {
        rug: { x: 0.30 + 0.40 * i / (N - 1), y: 0.70, unit: 0.30 - 0.04 * i / (N - 1) },
        bed: { x: 0.20 + 0.32 * i / (N - 1), y: 0.55, unit: 0.24 - 0.04 * i / (N - 1) }
      }
    }))
  };

  const host = document.createElement('div');
  host.style.width = '800px';
  document.body.appendChild(host);

  PetRoom.meta = fake;
  PetRoom.frame = 3;
  PetRoom.spot = 'rug';
  host.innerHTML = PetRoom.html({ img: 'assets/pets/bear-adult.png', name: '小熊' });
  PetRoom.mount();

  const pet = () => document.getElementById('roomPet');
  const read = () => ({
    left: pet().style.left, top: pet().style.top,
    h: pet().style.getPropertyValue('--h')
  });

  out.start = read();
  out.onFrame = PetRoom.frame;

  // 一開始只抓附近的圖,不是十三張全抓
  const imgs = [...document.querySelectorAll('.room-bg')];
  out.eager = imgs.filter(i => i.getAttribute('src')).length;
  out.total = imgs.length;
  out.visible = imgs.filter(i => i.classList.contains('on')).length;

  PetRoom.show(N - 1);
  out.after = read();
  out.afterOn = imgs.findIndex(i => i.classList.contains('on'));
  out.lastIndex = N - 1;

  PetRoom.show(0);
  out.back = read();

  // 轉到邊界之外不可以爆掉
  PetRoom.show(-5);
  out.clampLow = PetRoom.frame;
  PetRoom.show(99);
  out.clampHigh = PetRoom.frame;

  // 換站位:睡墊比地毯遠,所以要更小、更上面
  PetRoom.show(3);
  const rug = read();
  PetRoom.goTo('bed');
  const bed = read();
  out.bedSmaller = parseFloat(bed.h) < parseFloat(rug.h);
  out.bedHigher = parseFloat(bed.top) < parseFloat(rug.top);
  out.unknownSpotIgnored = (() => {
    PetRoom.goTo('沒有這個站位');
    return PetRoom.spot;
  })();

  // 逗牠
  PetRoom.goTo('rug');
  PetRoom.poke();
  out.happy = pet().classList.contains('is-happy');

  // 載不到的時候
  PetRoom.meta = null;
  window.fetch = async () => ({ ok: false });
  await PetRoom.load();
  out.degraded = PetRoom.available();
  out.htmlWhenMissing = PetRoom.html({ img: 'x', name: 'y' });

  host.remove();
  return out;
});

ok('一開始只載附近的圖,不是一次抓十三張',
   r.eager < r.total && r.eager >= 1, r.eager + ' / ' + r.total);
ok('同一時間只顯示一張', r.visible === 1);

ok('轉到右邊,守護獸跟著往右走',
   parseFloat(r.after.left) > parseFloat(r.start.left),
   r.start.left + ' → ' + r.after.left);
ok('轉到左邊,守護獸跟著往左走',
   parseFloat(r.back.left) < parseFloat(r.start.left),
   r.start.left + ' → ' + r.back.left);
ok('背景也換成那一格', r.afterOn === r.lastIndex);

ok('大小照表走,不是固定的',
   parseFloat(r.after.h) !== parseFloat(r.start.h),
   r.start.h + ' → ' + r.after.h);

ok('轉過頭不會爆掉,停在兩端', r.clampLow === 0 && r.clampHigh === r.lastIndex,
   r.clampLow + ' / ' + r.clampHigh);

ok('站到比較遠的睡墊上會變小(透視要對,不然像貼在玻璃上)',
   r.bedSmaller === true);
ok('而且位置要更上面', r.bedHigher === true);
ok('不存在的站位會被忽略,牠留在原地,不會被丟到畫面外',
   r.unknownSpotIgnored === 'bed', r.unknownSpotIgnored);

ok('點一下會跳', r.happy === true);

ok('房間的圖載不到時安靜退掉,不影響其他功能', r.degraded === false);
ok('載不到就不畫房間(不是畫一個壞掉的框)', r.htmlWhenMissing === '');

/* ---------- CSS 的兩個要求 ---------- */
const css = readFileSync(new URL('../css/room.css', import.meta.url), 'utf8');
ok('呼吸動畫的縮放中心在腳底(不然腳會離地看起來像在飄)',
   /transform-origin:\s*bottom center/.test(css));
ok('系統設了「減少動態」就全部停下來',
   /prefers-reduced-motion[\s\S]*animation:\s*none/.test(css));

await close();
process.exit(report('守護獸的房間', lines, errors) ? 0 : 1);
