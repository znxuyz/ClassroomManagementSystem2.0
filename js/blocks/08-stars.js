/* ============================================
   積木挑戰 — 關卡與星星
   ────────────────────────────────────────────
   題目排成一條路,過了一關才解鎖下一關;每一關最多三顆星。

   ── 三顆星的意思 ──
     ⭐    做出來了
     ⭐⭐  而且沒有用提示
     ⭐⭐⭐ 而且積木數夠精簡(預設:老師的解答 + 2 塊以內)

   第三顆星刻意是「精簡」而不是「快」:
   · 比快會讓慢的孩子一開始就放棄,而且會鼓勵亂試
   · 比精簡逼他回頭看自己的程式「有沒有多做了什麼」——
     那正是從「會拼」走到「會想」的那一步
   而且這一顆**永遠拿得到**:做完之後回去整理,星星就補上來。

   ── 星星只是榮譽,不換分數 ──
   分數照舊是「做出來就給 task.points」。星星另外記,
   拿來解鎖守護獸技能與投影牆上的排名。
   把星星直接換成積分的話,孩子會為了第三顆星去刪掉看得懂的積木,
   寫出一行很聰明但自己也看不懂的東西 —— 那不是我們要教的。

   ── 提示 ──
   老師一題最多寫三條提示,卡住的孩子自己換。換了就少一顆星,
   但**換提示永遠比放棄好**,所以不會有任何懲罰性的提示文字。
============================================ */

/* 第三顆星的積木數上限。老師沒特別設就用「解答 + 2」——
   留兩塊的餘裕,因為同樣正確的寫法本來就會差一兩塊。 */
function starBlockLimit(task) {
  if (task && Number(task.starLimit) > 0) return Number(task.starLimit);
  const n = blockCount((task && task.solution) || []);
  return n > 0 ? n + 2 : 0;
}

/* 算幾顆星。pass 之外的條件都看得到、算得出來,
   所以學生端與老師端算出來的一定一樣。 */
function starsFor(task, program, opts) {
  const o = opts || {};
  if (!o.pass) return 0;
  let s = 1;
  if (!o.hintsUsed) s = 2;
  const limit = (task && task.starLimitPublic) || starBlockLimit(task);
  if (s === 2 && limit > 0 && blockCount(program) <= limit) s = 3;
  return s;
}

/* ★★☆ 這種字串,畫面上到處都用得到 */
function starText(n) {
  return '★'.repeat(n) + '☆'.repeat(Math.max(0, 3 - n));
}

/* 這一題解鎖了沒。
   規則:第一關永遠開著;其他關要前一關**拿到至少一顆星**才開。
   老師可以把某一題設成「隨時可挑戰」(free),跳過這條鎖。

   為什麼用「前一關」而不是「全部前面的關」:
   中間卡住一題就整條路斷掉的話,孩子只能等老師;
   前一關過了就能往前,老師也可以把難的那一題設成隨時可挑戰。 */
function taskUnlocked(tasks, index, starsOf) {
  if (index <= 0) return true;
  const t = tasks[index];
  if (t && t.free) return true;
  const prev = tasks[index - 1];
  return !!prev && (starsOf(prev.id) > 0);
}
