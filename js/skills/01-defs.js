/* ============================================
   守護獸技能 — 定義與純邏輯
   ────────────────────────────────────────────
   進化要有意義:每進一階,就多一項「真的能改變結果」的能力。

   設計上的三條底線:
   1. 技能是「次數」,不是「永久加成」。用完就沒了,下個賽季才回來 ——
      所以強的技能不會讓差距滾雪球,只會讓關鍵時刻更有感。
   2. 每一次使用都要在伺服器留下一筆紀錄,文件 id 含「第幾次」,
      id 唯一 + 不准修改 = 用不超過上限。改前端沒有用。
   3. 技能只加成「自己答對/自己兌換」,不會傷害別人 ——
      小學生的班級經營裡,能互相扣分的機制只會製造糾紛。

   這個檔案不碰畫面、不碰雲端,全部是純函式,可以單獨測試。
============================================ */

/* uses 的索引就是守護獸階段(0 靈卵 / 1 幼獸 / 2 成獸 / 3 守護神獸),
   值是「這個賽季可以用幾次」。0 代表這一階還沒解鎖。
   靈卵階段一律是 0 —— 不然「進化」就沒有意義了。 */
const PET_SKILLS = [
  /* ---------- 領地戰 ---------- */
  {
    id: 'war_power', area: 'war', icon: '⚔️', name: '猛擊',
    short: '佔領分 ×2',
    desc: '指定一題,答對的佔領分變兩倍。開題前決定,答錯無效。',
    uses: [0, 1, 2, 3]
  },
  {
    id: 'war_shield', area: 'war', icon: '🛡️', name: '護盾',
    short: '擋掉一次倒扣',
    desc: '答錯之後使用,抵銷那一次的佔領分倒扣。只能擋自己的。',
    uses: [0, 0, 1, 2]
  },
  {
    id: 'war_focus', area: 'war', icon: '🌀', name: '靜心',
    short: '解除連錯冷卻',
    desc: '連錯被罰等待時使用,立刻可以再出手。',
    uses: [0, 0, 0, 2]
  },

  /* ---------- 測驗 ---------- */
  {
    id: 'quiz_double', area: 'quiz', icon: '📘', name: '專注',
    short: '這份測驗得分 ×2',
    desc: '交卷前指定一份測驗,結算時這份的得分變兩倍。',
    uses: [0, 1, 1, 2]
  },
  {
    id: 'quiz_insure', area: 'quiz', icon: '🧷', name: '保險',
    short: '沒進名次也有一半',
    desc: '搶分類測驗專用。沒搶進名次時,仍拿到應得分數的一半(無條件捨去)。',
    uses: [0, 0, 1, 1]
  },

  /* ---------- 商店 ---------- */
  {
    id: 'shop_discount', area: 'shop', icon: '🏷️', name: '議價',
    short: '兌換打 8 折',
    desc: '兌換一項獎品時使用,價格打八折(無條件捨去)。',
    uses: [0, 1, 1, 2]
  },
  {
    id: 'shop_jump', area: 'shop', icon: '⚡', name: '優先',
    short: '插隊優先發放',
    desc: '兌換時使用,這張申請單排到待發放清單的最前面。',
    uses: [0, 0, 0, 1]
  }
];

const SKILL_AREAS = {
  war:  { name: '領地戰', icon: '🗺️' },
  quiz: { name: '測驗',   icon: '📝' },
  shop: { name: '商店',   icon: '🎁' }
};

/* 預設設定。整套預設是「關閉」—— 已經在跑的班級不會因為更新就突然多出
   一堆新規則,老師自己決定什麼時候開。 */
const SKILL_DEFAULTS = {
  enabled: false,
  weeks: 1,          // 幾週刷新一次
  startAt: 0         // 第一個賽季的起算時間,0 = 還沒開始
};

const SkillEngine = {
  byId(id) {
    return PET_SKILLS.find(s => s.id === id) || null;
  },

  ofArea(area) {
    return PET_SKILLS.filter(s => s.area === area);
  },

  cfg(skills) {
    return { ...SKILL_DEFAULTS, ...(skills || {}) };
  },

  /* 這個階段能用的技能(次數 > 0 的才算解鎖) */
  unlocked(stage) {
    return PET_SKILLS.filter(s => (s.uses[stage] || 0) > 0);
  },

  /* 下一階會多解鎖哪些 —— 用來告訴學生「再進化一次會拿到什麼」 */
  nextUnlocks(stage) {
    const now = this.unlocked(stage).map(s => s.id);
    return this.unlocked(stage + 1).filter(s => !now.includes(s.id));
  },

  usesAt(skillId, stage) {
    const s = this.byId(skillId);
    return s ? (s.uses[stage] || 0) : 0;
  },

  /* ---------- 賽季 ----------
     賽季編號只跟時間有關,算式前後端一致,所以不需要誰去「結算」它。
     技能使用紀錄的文件 id 含賽季編號,換季等於整批重新計數 ——
     不必刪任何資料,舊紀錄留著還能當歷程看。 */

  seasonOf(skills, now) {
    const c = this.cfg(skills);
    if (!c.startAt) return 0;
    const span = Math.max(1, c.weeks) * 7 * 24 * 60 * 60 * 1000;
    return Math.max(0, Math.floor(((now || Date.now()) - c.startAt) / span));
  },

  seasonRange(skills, now) {
    const c = this.cfg(skills);
    const span = Math.max(1, c.weeks) * 7 * 24 * 60 * 60 * 1000;
    const i = this.seasonOf(skills, now);
    const from = c.startAt + i * span;
    return { index: i, from, to: from + span };
  },

  /* ---------- 授權表 ----------
     老師端算好「每個學生這一季各技能幾次」寫到雲端,安全規則照著它驗。
     放在一份小文件裡,學生讀一筆就夠,也不必讓規則去翻整個班級資料。 */
  grantsFor(students, skills, now) {
    const season = this.seasonOf(skills, now);
    const g = {};
    (students || []).forEach(s => {
      const stage = PetEngine.getStage(s.totalPoints || 0);
      const row = {};
      PET_SKILLS.forEach(sk => {
        const n = sk.uses[stage] || 0;
        if (n > 0) row[sk.id] = n;
      });
      if (Object.keys(row).length > 0) g[s.id] = row;
    });
    return { season, g, at: now || Date.now() };
  },

  /* 授權表需不需要重寫:換季了,或有人進化/轉入轉出 */
  grantsStale(current, students, skills, now) {
    const next = this.grantsFor(students, skills, now);
    if (!current) return true;
    if (current.season !== next.season) return true;
    return JSON.stringify(current.g || {}) !== JSON.stringify(next.g);
  },

  /* ---------- 使用紀錄 ----------
     文件 id = {uid}_{賽季}_{技能}_{第幾次}。
     id 唯一而且不准修改,所以「第幾次」不可能重複 ——
     上限檢查只要比對這個數字,不必去數文件有幾筆(規則也數不了)。 */
  useId(uid, season, skillId, n) {
    return `${uid}_${season}_${skillId}_${n}`;
  },

  /* 把使用紀錄整理成 { skillId: 已用次數 },只算這一季的 */
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

  /* 這一季我手上有哪些技能、各剩幾次 */
  mySkills(stage, used) {
    return this.unlocked(stage).map(s => ({
      ...s,
      total: s.uses[stage],
      left: this.remaining(s.id, stage, used)
    }));
  },

  /* ---------- 領地戰:技能對重播的影響 ----------
     重播是所有人共用的,所以技能效果也必須是「從事件推得出來」的,
     不能存在任何一台裝置的記憶裡。 */

  /* 猛擊:那一題的佔領分 ×2。事件上記著它用了哪一筆技能,
     安全規則會核對倍率,所以客戶端照著算就好。 */
  warMultiplier(ev) {
    return ev && ev.skillId === 'war_power' ? 2 : 1;
  },

  /* 護盾:被擋掉的那些嘗試不產生倒扣。
     回傳一個 Set,裡面是「有護盾罩著」的嘗試 id。 */
  shieldedAttempts(uses) {
    const out = new Set();
    (uses || []).forEach(u => {
      if (u.skillId === 'war_shield' && u.ref) out.add(u.ref);
    });
    return out;
  }
};
