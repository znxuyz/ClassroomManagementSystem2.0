/* ============================================
   守護獸技能 — 定義與純邏輯
   ────────────────────────────────────────────
   進化要有意義:技能不是「解鎖就固定」,而是**跟著守護獸一起變強**。
   同一個技能,幼獸用是 ×2,守護神獸用就是 ×3。

   取得方式是去商店買一顆「技能果實」,一個技能買一次就永久擁有 ——
   所以積分有了新的去處,而且買下去之後,養獸的動力會延續:
   同一顆果實,獸越強越好用。

   三條底線(和領地戰防作弊同一套思路):
   1. 技能是「次數」,每週一歸零。用完就沒,強技能不會讓差距滾雪球。
   2. 每次使用都在伺服器留一筆紀錄,文件 id 含「這週第幾次」,
      id 唯一 + 不准修改 = 用不超過上限。改前端沒有用。
   3. 技能只加成自己,不會傷害別人 —— 小學班級裡,能互相扣分的機制
      只會製造糾紛。

   這個檔案不碰畫面、不碰雲端,全部是純函式,可以單獨測試。
============================================ */

/* levels 的索引就是守護獸階段:
     0 靈卵 / 1 幼獸 / 2 成獸 / 3 守護神獸
   n = 這一週可以用幾次(0 = 這一階還不能用)
   p = 強度(倍率、折扣、幾題…,依技能而異)
   text = 寫給學生看的「這一階是什麼效果」 */
const PET_SKILLS = [
  /* ---------- 領地戰 ---------- */
  {
    id: 'war_power', area: 'war', icon: '⚔️', img: 'power', name: '猛擊',
    short: '答對的佔領分加倍',
    desc: '開題前發動,這一題答對的佔領分會變成好幾倍。答錯無效。',
    price: 30,
    levels: [
      { n: 0 },
      { n: 1, p: 2, text: '佔領分 ×2,每週 1 次' },
      { n: 2, p: 2, text: '佔領分 ×2,每週 2 次' },
      { n: 2, p: 3, text: '佔領分 ×3,每週 2 次' }
    ]
  },
  {
    id: 'war_shield', area: 'war', icon: '🛡️', img: 'shield', name: '護盾',
    short: '擋掉一次答錯的倒扣',
    desc: '答錯之後使用,抵銷那一次的佔領分倒扣。只能擋自己的。',
    price: 35,
    levels: [
      { n: 0 },
      { n: 0 },
      { n: 1, p: 1, text: '擋掉倒扣,每週 1 次' },
      { n: 2, p: 1, text: '擋掉倒扣,每週 2 次' }
    ]
  },
  {
    id: 'war_focus', area: 'war', icon: '🌀', img: 'focus', name: '靜心',
    short: '立刻解除連錯冷卻',
    desc: '連錯被罰等待時使用,不用等就能再出手。',
    price: 25,
    levels: [
      { n: 0 },
      { n: 1, p: 1, text: '解除冷卻,每週 1 次' },
      { n: 1, p: 1, text: '解除冷卻,每週 1 次' },
      { n: 2, p: 1, text: '解除冷卻,每週 2 次' }
    ]
  },
  {
    id: 'war_hand', area: 'war', icon: '✋', img: 'hand', name: '巧手',
    short: '這次攻擊多幾次換題機會',
    desc: '攻打一格時發動,這一次的換題次數變多。遇到還沒教過的單元就靠它。',
    price: 20,
    levels: [
      { n: 0 },
      { n: 1, p: 1, text: '多換 1 題,每週 1 次' },
      { n: 2, p: 1, text: '多換 1 題,每週 2 次' },
      { n: 2, p: 2, text: '多換 2 題,每週 2 次' }
    ]
  },

  /* ---------- 測驗 ---------- */
  {
    id: 'quiz_double', area: 'quiz', icon: '📘', img: 'double', name: '專注',
    short: '這份測驗得分加倍',
    desc: '結算前指定一份測驗,那一份的得分會變成好幾倍。',
    price: 30,
    levels: [
      { n: 0 },
      { n: 1, p: 2, text: '得分 ×2,每週 1 次' },
      { n: 2, p: 2, text: '得分 ×2,每週 2 次' },
      { n: 2, p: 3, text: '得分 ×3,每週 2 次' }
    ]
  },
  {
    id: 'quiz_insure', area: 'quiz', icon: '🧷', img: 'insure', name: '保險',
    short: '搶分沒進名次也有分',
    desc: '搶分類測驗專用。沒搶進名次時,照答對題數算的分數還是拿得到。',
    price: 35,
    // p 是「拿幾成」:0.5 = 一半,1 = 全拿
    levels: [
      { n: 0 },
      { n: 0 },
      { n: 1, p: 0.5, text: '沒進名次拿一半,每週 1 次' },
      { n: 1, p: 1,   text: '沒進名次全額拿,每週 1 次' }
    ]
  },
  {
    id: 'quiz_gift', area: 'quiz', icon: '🎀', img: 'gift', name: '送分',
    short: '直接多算一題答對',
    desc: '結算前指定一份測驗,那一份直接多算一題答對(不會超過總題數)。',
    price: 30,
    levels: [
      { n: 0 },
      { n: 0 },
      { n: 1, p: 1, text: '送 1 題,每週 1 次' },
      { n: 1, p: 1, text: '送 1 題,每週 1 次' }
    ]
  },

  /* ---------- 商店 ---------- */
  {
    id: 'shop_discount', area: 'shop', icon: '🏷️', img: 'discount', name: '議價',
    short: '兌換獎品打折',
    desc: '兌換一項獎品時發動,那一次的價格打折(無條件捨去)。',
    price: 25,
    // p 是折扣倍率:0.9 = 九折
    levels: [
      { n: 0 },
      { n: 1, p: 0.9, text: '指定一項 9 折,每週 1 次' },
      { n: 1, p: 0.8, text: '指定一項 8 折,每週 1 次' },
      { n: 1, p: 0.7, text: '指定一項 7 折,每週 1 次' }
    ]
  }
];

/* 圖示檔放在 assets/skill/{img}.webp。
   用 WebP 是因為這些圖有大面積的柔和漸層,PNG 存起來每張 300K 起跳,
   換成 WebP 只要 20K 左右(整組 2.7M → 167K),44px 下看不出差別。
   原始的 1024px 綠幕檔留在 assets/skill/raw/,之後要重調參數還有得用。
   外框一律由 CSS 畫,不靠圖片自己帶 —— AI 每張畫出來的底板都不一樣,
   交給程式才會八張完全一致,也才能隨主題與尺寸變化。
   圖檔還沒放進去時自動退回 emoji,所以不會開天窗。 */
const SKILL_ICON_DIR = 'assets/skill/';
let SKILL_ICON_MISSING = {};        // 載入失敗的記在這裡,之後直接用 emoji

const SKILL_AREAS = {
  war:  { name: '領地戰', icon: '🗺️' },
  quiz: { name: '測驗',   icon: '📝' },
  shop: { name: '商店',   icon: '🎁' }
};

/* 技能果實在商店裡的 id 前綴。用前綴而不是另開一個集合,
   是為了直接沿用現有的兌換流程(申請 → 老師確認 → 扣點 → 進背包),
   連安全規則都不必動。 */
const SKILL_FRUIT_PREFIX = 'fruit_';

const SKILL_DEFAULTS = {
  enabled: false,    // 預設關閉:已經在跑的班級不會因為更新就突然多出新規則
  weeks: 1           // 幾週算一季(1 = 每週一刷新)
};

/* 技能圖示的 HTML。size 是外框邊長(px)。
   圖載不到就把整個 <span> 換成 emoji —— 不會留下破圖。 */
function skillIconHtml(skill, size) {
  const px = size || 44;
  if (!skill) return '';
  if (!skill.img || SKILL_ICON_MISSING[skill.id]) {
    return `<span class="skill-ico is-emoji" style="--ico:${px}px">${skill.icon}</span>`;
  }
  return `<span class="skill-ico" style="--ico:${px}px"><img
    src="${SKILL_ICON_DIR}${skill.img}.webp" alt="${escapeHtml(skill.name)}"
    onerror="SkillEngine.iconFailed('${skill.id}', this)" /></span>`;
}

const SkillEngine = {
  /* 圖載不到就記下來,並當場換成 emoji。只記一次,不會一直重試。 */
  iconFailed(skillId, img) {
    SKILL_ICON_MISSING[skillId] = true;
    const s = this.byId(skillId);
    const box = img.parentElement;
    if (box && s) {
      box.classList.add('is-emoji');
      box.textContent = s.icon;
    }
  },

  byId(id) {
    return PET_SKILLS.find(s => s.id === id) || null;
  },

  ofArea(area) {
    return PET_SKILLS.filter(s => s.area === area);
  },

  cfg(skills) {
    return { ...SKILL_DEFAULTS, ...(skills || {}) };
  },

  /* ---------- 等級 ----------
     同一個技能在不同階段是不同的東西,所以查「次數」與「強度」
     一律走這裡,不要在別處自己算。 */
  levelAt(skillId, stage) {
    const s = this.byId(skillId);
    if (!s) return { n: 0, p: 0 };
    return s.levels[stage] || { n: 0, p: 0 };
  },

  usesAt(skillId, stage) { return this.levelAt(skillId, stage).n || 0; },
  powerAt(skillId, stage) { return this.levelAt(skillId, stage).p || 0; },

  /* 這一階還能不能用(買了果實也要獸夠強才有次數) */
  activeAt(skillId, stage) { return this.usesAt(skillId, stage) > 0; },

  /* ---------- 技能果實 ----------
     果實是商店裡的一般獎品,只是多帶一個 skillId。
     買過的進背包(student.inventory),一個技能買一次就永久擁有。 */
  fruitId(skillId) { return SKILL_FRUIT_PREFIX + skillId; },

  skillOfFruit(itemId) {
    if (!itemId || itemId.indexOf(SKILL_FRUIT_PREFIX) !== 0) return null;
    return this.byId(itemId.slice(SKILL_FRUIT_PREFIX.length));
  },

  isFruit(itemId) { return !!this.skillOfFruit(itemId); },

  /* 果實的說明要把四個階段全部寫出來 ——
     學生要看得到「我現在是什麼效果、進化之後會變成什麼」。 */
  fruitDescription(skill) {
    // 每一階一行。商店那邊的 CSS 會保留換行,所以這裡排版就是學生看到的樣子
    const lines = skill.levels.map((lv, i) =>
      `　${STAGE_NAMES[i]}　${lv.n > 0 ? lv.text : '還不能用'}`);
    return `${skill.desc}\n\n【守護獸各階段的效果】\n${lines.join('\n')}`;
  },

  /* 產生所有果實的商店資料。老師按一次上架就有,價格之後可以自己改。 */
  fruitItems() {
    return PET_SKILLS.map(s => ({
      id: this.fruitId(s.id),
      name: `${s.name}果實`,
      icon: s.icon,
      price: s.price,
      stock: null,                 // 不限量:每個人本來就只能買一次
      description: this.fruitDescription(s),
      active: true,
      skillId: s.id                // 認得出它是果實的依據
    }));
  },

  owns(student, skillId) {
    return ((student && student.inventory) || []).includes(this.fruitId(skillId));
  },

  ownedSkills(student) {
    return PET_SKILLS.filter(s => this.owns(student, s.id));
  },

  /* ---------- 賽季 ----------
     每週一 00:00 刷新。算式只跟時間有關,前後端一致,
     所以不需要誰去「結算」它 —— 時間到了自然換季。
     使用紀錄的文件 id 含週序號,換季等於整批重新計數,不必刪資料。 */

  /* 這個時間點所屬那一週的週一 00:00(本地時間) */
  mondayOf(now) {
    const d = new Date(now || Date.now());
    d.setHours(0, 0, 0, 0);
    const dow = (d.getDay() + 6) % 7;      // 週一 = 0 … 週日 = 6
    d.setDate(d.getDate() - dow);
    return d.getTime();
  },

  /* 週序號:以 1970-01-05(那天是星期一)為第 0 週 */
  weekIndex(now) {
    return Math.round((this.mondayOf(now) - this.mondayOf(345600000)) / 604800000);
  },

  seasonOf(skills, now) {
    const weeks = Math.max(1, this.cfg(skills).weeks);
    return Math.floor(this.weekIndex(now) / weeks);
  },

  seasonRange(skills, now) {
    const weeks = Math.max(1, this.cfg(skills).weeks);
    const i = this.seasonOf(skills, now);
    const firstWeek = i * weeks;
    const from = this.mondayOf(345600000) + firstWeek * 604800000;
    return { index: i, weeks, from, to: from + weeks * 604800000 };
  },

  /* ---------- 授權表 ----------
     老師端算好「每個學生這一季各技能幾次、多強」寫到雲端,
     安全規則照著它驗。強度也要寫進去 —— 不然學生可以自稱是守護神獸,
     把 ×2 說成 ×3。 */
  grantsFor(students, skills, now) {
    const season = this.seasonOf(skills, now);
    const g = {};
    (students || []).forEach(s => {
      const stage = PetEngine.getStage(s.totalPoints || 0);
      const row = {};
      this.ownedSkills(s).forEach(sk => {
        const lv = this.levelAt(sk.id, stage);
        if (lv.n > 0) row[sk.id] = { n: lv.n, p: lv.p };
      });
      if (Object.keys(row).length > 0) g[s.id] = row;
    });
    return { season, g, at: now || Date.now() };
  },

  /* 授權表需不需要重寫:換季、有人進化、有人買了果實、名單變動 */
  grantsStale(current, students, skills, now) {
    const next = this.grantsFor(students, skills, now);
    if (!current) return true;
    if (current.season !== next.season) return true;
    return JSON.stringify(current.g || {}) !== JSON.stringify(next.g);
  },

  /* ---------- 使用紀錄 ----------
     文件 id = {uid}_{賽季}_{技能}_{第幾次}。
     id 唯一而且不准修改,所以「第幾次」不會重複 ——
     上限只要比對那個數字,不必去數文件有幾筆(規則本來也數不了)。 */
  useId(uid, season, skillId, n) {
    return `${uid}_${season}_${skillId}_${n}`;
  },

  usedMap(uses, season) {
    const out = {};
    (uses || []).forEach(u => {
      if (u.season !== season) return;
      out[u.skillId] = Math.max(out[u.skillId] || 0, u.n || 0);
    });
    return out;
  },

  remaining(skillId, stage, used) {
    return Math.max(0, this.usesAt(skillId, stage) - ((used || {})[skillId] || 0));
  },

  /* 我這一季手上有哪些技能、各剩幾次、現在多強 */
  mySkills(student, stage, used) {
    return this.ownedSkills(student).map(s => {
      const lv = this.levelAt(s.id, stage);
      return {
        ...s,
        total: lv.n || 0,
        power: lv.p || 0,
        levelText: lv.n > 0 ? lv.text : '守護獸還不夠強,再進化一次就能用',
        left: this.remaining(s.id, stage, used)
      };
    });
  },

  /* 還沒買的果實(商店要顯示) */
  notOwned(student) {
    return PET_SKILLS.filter(s => !this.owns(student, s.id));
  },

  /* ---------- 領地戰:技能對重播的影響 ----------
     重播是所有人共用的,所以技能效果必須是「從事件推得出來」的,
     不能存在任何一台裝置的記憶裡。

     猛擊的倍率已經寫進事件的 points(安全規則核對過),
     所以重播什麼都不用做 —— 這裡只要處理護盾。 */
  shieldedAttempts(uses) {
    const out = new Set();
    (uses || []).forEach(u => {
      if (u.skillId === 'war_shield' && u.ref) out.add(u.ref);
    });
    return out;
  }
};
