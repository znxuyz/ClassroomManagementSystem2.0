/* ============================================
   守護獸的房間(2.5D)+ 可以擺的家具
   ────────────────────────────────────────────
   房間是 Blender 預先算好的一圈圖,拖曳換圖。守護獸是那 32 張插畫,
   家具也是預先算好的圖。要讓它成立,只有一件事真的難:

     **2D 的東西要真的待在 3D 的地板上。**

   地板是一個平面,所以「地板座標 ↔ 畫面座標」是一個 3×3 的單應矩陣,
   算圖時從相機矩陣精確取出來(room-data.js 裡的 H)。這一套就是在盯
   那個矩陣有沒有被正確使用 —— 算錯的話家具會黏在手指旁邊而不是地板上。

   盯的事:
     1. 兩個方向都要準:擺上去 → 拖走 → 再算回來,要回到同一點
     2. 轉動時東西跟著走,站得越遠畫得越小
     3. 近的要蓋住遠的(不然守護獸會站在睡墊後面卻畫在上面)
     4. 拖不出房間
     5. 沒買的家具擺不進來;一樣的只能有一件
     6. 存起來的資料壞掉(型錄改過、座標是 NaN)不能讓房間畫不出來
     7. 房間的圖沒放進來時,整個守護獸分頁照舊能用
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
  const good = m.frames.every(f =>
    Array.isArray(f.H) && f.H.length === 3 && f.H.every(r => r.length === 3)
    && Array.isArray(f.cam) && f.cam.length === 3 && f.unit0 > 0);
  ok('算好的 room.json 每一格都有相機矩陣與縮放基準',
     m.frames.length >= 3 && good, m.frames.length + ' 格');
  ok('room.json 指到的圖都真的在',
     m.frames.every(f => existsSync(new URL('../assets/room/' + f.file, import.meta.url))));
  // 相機真的有繞 —— 每一格都一樣的話就是沒在轉
  const xs = m.frames.map(f => f.cam[0]);
  ok('相機真的繞了一圈(不是每一格都同一個位置)',
     Math.max(...xs) - Math.min(...xs) > 1,
     xs.map(v => v.toFixed(1)).join(' '));
} else {
  ok('算好的 room.json 每一格都有相機矩陣與縮放基準', false, '還沒算圖');
}

const ITEMS = new URL('../assets/room/items-data.js', import.meta.url);
if (existsSync(ITEMS)) {
  const src = readFileSync(ITEMS, 'utf8');
  const list = JSON.parse(src.slice(src.indexOf('['), src.lastIndexOf(']') + 1));
  ok('家具型錄有名稱、說明與兩種價錢',
     list.length >= 4 && list.every(i => i.id && i.name && i.desc
                                    && i.price > 0 && i.star > 0),
     list.length + ' 件');
  const missing = list.filter(i =>
    !existsSync(new URL('../assets/room/items/' + i.id + '/00.webp', import.meta.url)));
  ok('每一件家具的圖都算好了', missing.length === 0,
     missing.map(i => i.id).join(','));
} else {
  ok('家具型錄有名稱、說明與兩種價錢', false, '還沒算圖');
}

/* ---------- 用假資料驗行為 ----------
   測試不該依賴算好的圖:算圖要幾十分鐘,而這一套要驗的是
   「拿到矩陣之後有沒有算對」,不是算圖本身。
   矩陣用一個真的相機算出來的值,不是亂填的。 */
const r = await page.evaluate(async () => {
  const out = {};
  const N = 7;
  const frames = Array.from({ length: N }, (_, i) => {
    const a = (-44 + 88 * i / (N - 1)) * Math.PI / 180;
    const d = 10.2, h = 4.2;
    const cx = Math.sin(a) * d, cy = -Math.cos(a) * d;
    /* 一個簡化但**行為正確**的投影:繞著原點看,近大遠小。
       真的那一份由 Blender 導出,這裡只要有「會隨角度變、可逆」的矩陣就夠。 */
    const s = Math.sin(a), c = Math.cos(a);
    return {
      file: 'f' + i + '.webp',
      angle: -44 + 88 * i / (N - 1),
      H: [[2.5 * c, -2.5 * s, 0], [0.9 * s, 0.9 * c, -4.2], [0.9 * s, 0.9 * c, 10.9]],
      cam: [cx, cy, h],
      unit0: 0.1546
    };
  });

  const host = document.createElement('div');
  host.style.width = '800px';
  document.body.appendChild(host);

  window.PET_ROOM = { width: 800, height: 576, arc: 44, room: 5, frames };
  window.PET_ROOM_ITEMS = [
    { id: 'rug', name: '地毯', desc: 'x', price: 30, star: 10 },
    { id: 'bed', name: '睡墊', desc: 'y', price: 45, star: 15 }
  ];
  PetRoom.meta = null;
  await PetRoom.load();
  PetRoom.frame = 3;

  /* 1. 兩個方向要對得起來 */
  const f = PetRoom.meta.frames[3];
  const round = [];
  for (const p of [[0, 0], [1.5, -1.2], [-2, 1.8]]) {
    const s = PetRoom.toScreen(f, p[0], p[1]);
    const back = PetRoom.toFloor(f, s.x, s.y);
    round.push(Math.hypot(back.x - p[0], back.y - p[1]));
  }
  out.roundTrip = Math.max(...round);

  /* 2. 遠的要小 */
  out.nearScale = PetRoom.scaleAt(f, 0, -2);     // 靠近相機
  out.farScale = PetRoom.scaleAt(f, 0, 2);       // 靠近後牆

  /* 3. 近的要畫在上面 */
  out.nearDepth = PetRoom.depthAt(f, 0, -2);
  out.farDepth = PetRoom.depthAt(f, 0, 2);

  /* 4. 拖不出房間 */
  const c1 = PetRoom.clampFloor({ x: 99, y: -99 });
  out.clamped = [c1.x, c1.y];

  /* 5. 家具 */
  PetRoom.setPlaced([]);
  out.addOk = PetRoom.add('rug');
  out.addTwice = PetRoom.add('rug');           // 一樣的只能一件
  out.addUnknown = PetRoom.add('沒這件');
  out.count = PetRoom.placed.length;
  out.removeOk = PetRoom.remove('rug');
  out.afterRemove = PetRoom.placed.length;

  /* 6. 存起來的資料壞掉也要撐得住 */
  PetRoom.setPlaced([
    { id: 'rug', x: 1, y: 1 },
    { id: '已經刪掉的家具', x: 0, y: 0 },
    { id: 'bed', x: NaN, y: 999 }
  ]);
  out.loaded = PetRoom.placed.map(p => p.id);
  out.sanitised = PetRoom.placed.every(p =>
    Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.y) <= 2.5);

  /* 擺上去之後要真的動起來 */
  let saved = null;
  PetRoom.onChange = list => { saved = list.length; };
  /* 刻意**不要**擺在原點:家具的圖就是在原點算的,所以擺在原點時
     位移和縮放本來就都是零,測不出「有沒有跟著轉」。 */
  PetRoom.setPlaced([{ id: 'rug', x: 1.2, y: 0.8 }]);
  host.innerHTML = PetRoom.html({ img: 'assets/pets/bear-adult.png', name: '小熊' });
  PetRoom.mount();

  const item = () => host.querySelector('.room-item');
  const pet = () => document.getElementById('roomPet');
  out.itemDrawn = !!item();
  const t0 = item().style.transform;
  const z0 = { item: item().style.zIndex, pet: pet().style.zIndex };

  PetRoom.show(N - 1);
  out.movedOnTurn = item().style.transform !== t0;
  // 家具的圖本身也要換成那個角度的那一張
  out.itemFrameSwapped = Number(
    item().querySelector('.room-item-img.on').dataset.i) === N - 1;
  out.petMovedOnTurn = pet().style.left !== '';

  // 地毯在原點、守護獸在前面 → 守護獸要畫在上面
  out.petInFront = Number(z0.pet) > Number(z0.item);

  // 把地毯挪到守護獸前面,順序要反過來
  PetRoom.show(3);
  PetRoom.placed[0].y = -2.2;
  PetRoom.place();
  out.flipped = Number(item().style.zIndex) > Number(pet().style.zIndex);

  PetRoom.add('bed');
  out.saveCalled = saved;

  /* 7. 沒放圖的時候 */
  PetRoom.meta = null;
  const keep = window.PET_ROOM;
  delete window.PET_ROOM;
  await PetRoom.load();
  out.degraded = PetRoom.available();
  out.htmlWhenMissing = PetRoom.html({ img: 'x', name: 'y' });
  window.PET_ROOM = keep;

  host.remove();
  return out;
});

ok('擺上去再算回來,回到同一點(矩陣與反矩陣要對得起來)',
   r.roundTrip < 1e-6, '最大誤差 ' + r.roundTrip.toExponential(1));
ok('靠近鏡頭的畫得比較大', r.nearScale > r.farScale,
   r.nearScale.toFixed(3) + ' > ' + r.farScale.toFixed(3));
ok('近的畫在遠的上面(不然守護獸會站在睡墊後面卻蓋住它)',
   r.nearDepth > r.farDepth);
ok('拖不出房間', Math.abs(r.clamped[0]) <= 2.2 && Math.abs(r.clamped[1]) <= 2.2,
   r.clamped.map(v => v.toFixed(2)).join(', '));

ok('擺一件家具進房間', r.addOk === true && r.count === 1);
ok('一樣的家具只能有一件', r.addTwice === false);
ok('型錄裡沒有的擺不進來', r.addUnknown === false);
ok('收得起來', r.removeOk === true && r.afterRemove === 0);

ok('存起來的資料裡有已刪除的家具時,跳過那一件就好',
   JSON.stringify(r.loaded) === JSON.stringify(['rug', 'bed']), r.loaded.join(','));
ok('座標是 NaN 或超出房間的會被拉回來,不會讓房間畫不出來',
   r.sanitised === true);

ok('家具畫出來了', r.itemDrawn === true);
ok('轉動時家具跟著走', r.movedOnTurn === true);
ok('而且換成那個角度算的那一張圖', r.itemFrameSwapped === true);
ok('守護獸也跟著走', r.petMovedOnTurn === true);
ok('守護獸站在地毯前面時蓋住地毯', r.petInFront === true);
ok('地毯挪到守護獸前面之後,換地毯蓋住牠', r.flipped === true);
ok('擺動之後會通知外面存起來', r.saveCalled === 2, String(r.saveCalled));

ok('房間的圖沒放進來時安靜退掉,不影響其他功能', r.degraded === false);
ok('而且不畫一個壞掉的框', r.htmlWhenMissing === '');

/* ---------- CSS 的兩個要求 ---------- */
const css = readFileSync(new URL('../css/room.css', import.meta.url), 'utf8');
ok('呼吸動畫的縮放中心在腳底(不然腳會離地看起來像在飄)',
   /transform-origin:\s*bottom center/.test(css));
ok('系統設了「減少動態」就全部停下來',
   /prefers-reduced-motion[\s\S]*animation:\s*none/.test(css));

/* ---------- 家具是不是真的接上商店 ---------- */
const shop = await page.evaluate(() => {
  const out = {};
  window.PET_ROOM_ITEMS = [
    { id: 'rug', name: '地毯', desc: 'x', price: 30, star: 10 },
    { id: 'bed', name: '睡墊', desc: 'y', price: 45, star: 15 }
  ];
  window.__apply(window.__fixture({ students: 6, historyPer: 1, questions: 0 }));
  state.shopItems = [];
  listRoomItems();
  out.listed = state.shopItems.map(i => i.id);
  out.bothPrices = state.shopItems.every(i => i.price > 0 && i.starPrice > 0);

  // 老師改過的價錢不可以被「再按一次」蓋掉
  updateShopItem('room_rug', 'starPrice', '99');
  listRoomItems();
  out.keptPrice = state.shopItems.find(i => i.id === 'room_rug').starPrice;

  // 買過的不能再買
  const s = state.students[0];
  s.inventory = ['room_rug'];
  out.ownsIt = RoomShop.has(s, 'rug');
  out.ownedList = RoomShop.owned(s);
  return out;
});

ok('老師按一次就把家具全部上架',
   JSON.stringify(shop.listed) === JSON.stringify(['room_rug', 'room_bed']),
   shop.listed.join(','));
ok('每一件都有積分價和星星價', shop.bothPrices === true);
ok('老師改過的價錢不會被「再按一次上架」蓋掉', shop.keptPrice === 99,
   String(shop.keptPrice));
ok('認得出學生買了哪幾件', shop.ownsIt === true
   && JSON.stringify(shop.ownedList) === JSON.stringify(['rug']));

await close();
process.exit(report('守護獸的房間與家具', lines, errors) ? 0 : 1);
