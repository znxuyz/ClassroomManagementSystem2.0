/* ============================================
   星星帳本與雙貨幣商店
   ────────────────────────────────────────────
   積木冒險的星星可以在商店裡當第二種錢。能當錢就會有人想刷,
   所以這一套全部在盯「刷不刷得出來」:

   1. **星星是兩個數字** —— 拿到幾顆(只往上)、花掉幾顆(只往上)。
      直接拿「目前的星數」當餘額的話,孩子重做一題讓星星長回來,
      就等於印鈔票。
   2. **重做要拿得到更多星**(分數一題只給一次,星星不鎖)——
      回頭把程式整理乾淨正是我們最想要他做的事。
   3. **花掉星星不會掉名次**:星星榜排的是累積拿到的,不是餘額。
   4. 用星星付、用積分付、退貨,三條路都要各自算對,
      而且**以老師端的獎品設定為準** —— 申請單上寫什麼不算數。
   5. 老師把星星價拿掉之後,已經送出的星星申請要被擋下來。
============================================ */
import { loadPlaywright, openApp, prepare, report } from './lib.mjs';

const chromium = await loadPlaywright();
const { page, errors, close } = await openApp(chromium);
await prepare(page);

const lines = [];
const ok = (n, c, e) => lines.push((c ? '✓ ' : '✗ ') + n + (e ? ' — ' + e : ''));

const r = await page.evaluate(() => {
  const out = {};
  __apply(__fixture({ students: 4, historyPer: 0, questions: 4 }));
  window.confirm = () => true;
  const s = state.students[0];

  // ── 1. 帳本:兩個數字 ──
  s.starsEarned = 10; s.starSpent = 0;
  out.avail0 = StarBank.available(s);
  out.spendOk = StarBank.spend(s, 4);
  out.avail1 = StarBank.available(s);
  out.spendTooMuch = StarBank.spend(s, 99);    // 不夠就不准花
  out.avail2 = StarBank.available(s);
  StarBank.refund(s, 4);
  out.availBack = StarBank.available(s);

  // 重做一題讓星星「長回來」不會多出餘額:earned 只認最好的那一次
  state.blockTasks = [
    { id: 't1', name: 'A', points: 1, status: 'open', stars: { [s.id]: 3 },
      solution: [{ t: 'on_start', body: [{ t: 'show_icon', icon: '愛心' }] }] },
    { id: 't2', name: 'B', points: 1, status: 'open', stars: { [s.id]: 2 },
      solution: [{ t: 'on_start', body: [{ t: 'show_icon', icon: '愛心' }] }] }
  ];
  s.starsEarned = 0; s.starSpent = 0;
  StarBank.sync(state.students, state.blockTasks);
  out.synced = s.starsEarned;                 // 3 + 2
  StarBank.spend(s, 5);
  StarBank.sync(state.students, state.blockTasks);   // 再算一次
  out.afterResync = [s.starsEarned, StarBank.available(s)];

  // 老師把一題刪掉,已經拿到的星星不會憑空消失(可能早就花掉了)
  state.blockTasks = [state.blockTasks[0]];
  StarBank.sync(state.students, state.blockTasks);
  out.afterDelete = s.starsEarned;

  // ── 2. 雙貨幣兌換 ──
  state.shopItems = [
    { id: 'p1', name: '只收點數', icon: '🍪', price: 20, stock: null, active: true },
    { id: 'p2', name: '兩種都收', icon: '🎵', price: 30, starPrice: 6,
      stock: 2, active: true },
    { id: 'p3', name: '只收星星', icon: '🏅', price: 0, starPrice: 4,
      stock: null, active: true }
  ];
  s.currentPoints = 100; s.starsEarned = 12; s.starSpent = 0;
  s.inventory = []; state.shopHistory = [];

  const ask = (itemId, currency) => PurchaseWatch.settle({
    studentId: s.id, itemId, currency, requestedPrice: 999
  });

  const a = ask('p2', 'star');
  out.payStar = [a.result.status, a.result.settledPrice,
                 StarBank.available(s), s.currentPoints];

  const b = ask('p2', 'point');
  out.payPoint = [b.result.status, b.result.settledPrice,
                  StarBank.available(s), s.currentPoints];

  // 只收點數的獎品不能用星星付
  const c = ask('p1', 'star');
  out.starOnPointItem = [c.result.status, c.result.reason];

  // 星星不夠
  s.starSpent = 12;
  const d = ask('p3', 'star');
  out.notEnoughStars = [d.result.status, d.result.reason];
  s.starSpent = 6;

  // 申請單上寫的價錢不算數,以老師端為準
  state.shopItems[2].starPrice = 2;
  const e = ask('p3', 'star');
  out.priceFromTeacher = [e.result.settledPrice, StarBank.available(s)];

  // ── 3. 退貨退回星星 ──
  const before = StarBank.available(s);
  StarBank.refund(s, 2);
  out.refunded = [before, StarBank.available(s)];

  // ── 4. 星星榜排累積、不排餘額 ──
  state.students[1].starsEarned = 20; state.students[1].starSpent = 20;
  state.students[2].starsEarned = 15; state.students[2].starSpent = 0;
  state.students[3].starsEarned = 0;
  const rank = Leaderboard.stars(state.students);
  out.starRank = rank.map(x => x.name + ':' + x.score);

  return out;
});

ok('星星夠就花得掉', r.avail0 === 10 && r.spendOk === true && r.avail1 === 6,
   `${r.avail0} → ${r.avail1}`);
ok('星星不夠就不准花(而且餘額不動)',
   r.spendTooMuch === false && r.avail2 === 6, String(r.avail2));
ok('退得回去', r.availBack === 10, String(r.availBack));

ok('累積星數是逐題取最好的那一次加總', r.synced === 5, String(r.synced));
ok('重算一次不會把花掉的星星變回來(重做不等於印鈔票)',
   r.afterResync[0] === 5 && r.afterResync[1] === 0, JSON.stringify(r.afterResync));
ok('老師刪掉一題,已經拿到的星星不會憑空消失',
   r.afterDelete === 5, String(r.afterDelete));

ok('用星星付:扣星星、不扣積分',
   r.payStar[0] === 'paid' && r.payStar[1] === 6
   && r.payStar[2] === 6 && r.payStar[3] === 100, JSON.stringify(r.payStar));
ok('同一項也可以用積分付:扣積分、不扣星星',
   r.payPoint[0] === 'paid' && r.payPoint[1] === 30
   && r.payPoint[2] === 6 && r.payPoint[3] === 70, JSON.stringify(r.payPoint));
ok('只收點數的獎品不能用星星付',
   r.starOnPointItem[0] === 'rejected', r.starOnPointItem.join(' · '));
ok('星星不夠時退回申請,並說還有幾顆',
   r.notEnoughStars[0] === 'rejected' && /星星不夠/.test(r.notEnoughStars[1]),
   r.notEnoughStars.join(' · '));
ok('價錢以老師端的設定為準,不看申請單',
   r.priceFromTeacher[0] === 2, JSON.stringify(r.priceFromTeacher));
ok('退貨把星星退回去(退不回去,下次就不敢用星星付了)',
   r.refunded[1] === r.refunded[0] + 2, r.refunded.join(' → '));

ok('星星榜排的是累積拿到的,不是餘額(花掉不會掉名次)',
   r.starRank[0].endsWith(':20'), r.starRank.join(' / '));
ok('沒拿過星星的人不上榜', r.starRank.length === 3, r.starRank.length + ' 人');

/* ============================================
   技能果實也要收得了星星
   ────────────────────────────────────────────
   星星本來就能在商店當錢用,但「上架技能果實」產生的那十七顆
   **沒有帶星星價** —— 所以學生按下去只會看到「這項獎品現在不能用星星換」。
   機制在、實際上用不到,等於沒做。
============================================ */
const f = await page.evaluate(() => {
  const out = {};
  __apply(__fixture({ students: 4, historyPer: 0, questions: 0 }));
  window.confirm = () => true;
  state.skills = { enabled: true, weeks: 1 };
  state.shopItems = [];

  listSkillFruits();
  const fruits = () => state.shopItems.filter(i => SkillEngine.isFruit(i.id));
  out.上架幾顆 = fruits().length;
  out.都有星星價 = fruits().every(x => Number(x.starPrice) > 0);
  out.星星價範圍 = [Math.min(...fruits().map(x => x.starPrice)),
                    Math.max(...fruits().map(x => x.starPrice))];
  // 星星價要比積分價小一個級距 —— 星星稀有得多
  out.比積分便宜 = fruits().every(x => x.starPrice < x.price);

  const s = state.students[0];
  s.starsEarned = 50; s.starSpent = 0; s.currentPoints = 0; s.inventory = [];
  const first = fruits()[0];
  const r = PurchaseWatch.settle({ studentId: s.id, itemId: first.id, currency: 'star' });
  out.用星星買果實 = r.result.status;
  out.扣了幾顆 = 50 - StarBank.available(s);
  out.真的拿到技能 = SkillEngine.owns(s, SkillEngine.skillOfFruit(first.id).id);
  out.積分沒被扣 = s.currentPoints === 0;

  // 同一顆不能買第二次(就算改用星星付)
  const again = PurchaseWatch.settle({ studentId: s.id, itemId: first.id, currency: 'star' });
  out.買第二次 = again.result.status;

  /* 老師改過的價格不可以被「再按一次上架」蓋掉 ——
     包括「設成 0 = 這一顆不收星星」,那是一個決定,不是沒填。 */
  fruits()[1].starPrice = 99;
  fruits()[2].starPrice = 0;
  listSkillFruits();
  out.老師改的價還在 = fruits()[1].starPrice === 99;
  out.設成0沒被填回去 = fruits()[2].starPrice === 0;

  // 舊班級:上架在這個功能之前,果實沒有星星價 —— 再按一次要補得上
  delete fruits()[3].starPrice;
  listSkillFruits();
  out.舊的補得上 = Number(fruits()[3].starPrice) > 0;

  return out;
});

ok('上架技能果實時**每一顆都帶星星價**',
   f.上架幾顆 === 17 && f.都有星星價 === true,
   f.上架幾顆 + ' 顆 · 星星價 ' + f.星星價範圍.join('~'));
ok('星星價比積分價低一個級距(星星稀有得多)', f.比積分便宜 === true,
   f.星星價範圍.join('~') + ' 顆星');

ok('**學生真的用星星換得到果實**', f.用星星買果實 === 'delivered', f.用星星買果實);
ok('扣的是星星,不是積分', f.扣了幾顆 > 0 && f.積分沒被扣 === true,
   '扣了 ' + f.扣了幾顆 + ' 顆');
ok('而且技能真的進到背包', f.真的拿到技能 === true);
ok('同一顆果實不能買第二次', f.買第二次 === 'rejected', f.買第二次);

ok('老師改過的星星價不會被「再按一次上架」蓋掉', f.老師改的價還在 === true);
ok('設成 0(這一顆不收星星)也是一個決定,不會被填回去',
   f.設成0沒被填回去 === true);
ok('更新前就上架的果實,再按一次補得上星星價', f.舊的補得上 === true);

await close();
process.exit(report('星星帳本與雙貨幣商店', lines, errors) ? 0 : 1);
