/* ============================================
   蜂巢題庫:從主文件搬出來,而且分片存放
   ────────────────────────────────────────────
   為什麼要搬:

   題庫原本是主文件(班級 blob)裡的一個欄位。529 題大約 77 KB,
   而主文件是「整份覆蓋」寫上去的 —— 也就是說老師每按一次加分,
   那 77 KB 就被重新上傳一次。一天按幾十次,就是幾 MB 的無謂流量,
   而且它還佔掉 1 MiB 額度的 7.5%,偏偏題庫只進不出。

   題庫的特性剛好相反:**很大、但幾乎不變**。
   這種東西放在「每天寫幾十次」的文件裡是最糟的組合,
   所以把它移到自己的集合 classes/{id}/tqbank。

   ── 為什麼要分片 ──
   搬出去之後還有一個問題:老師新增一題,整個題庫還是被重寫一次。
   所以切成 SHARDS 份,改一題只重寫那一份(約 10 KB)。

   分片的依據是**題號的雜湊**,不是它在陣列裡的位置。
   位置會動 —— 新題是 unshift 到最前面的,用位置分片的話加一題
   就會讓後面每一片都位移,等於全部重寫,白切了。
   用題號雜湊的話,一題永遠落在同一片,加一題只動一片。

   份數固定成 8 不會變:
     ·   529 題 → 每片約  66 題 ≈ 10 KB
     ·  5000 題 → 每片約 625 題 ≈ 90 KB
     · 50000 題 → 每片約 6250 題 ≈ 900 KB(還在 1 MiB 以內)
   小學班級不可能出到五萬題,所以永遠不必重新分片 ——
   「重新分片」是這種設計最容易出錯的地方,直接避開。

   ── 讀取量 ──
   老師開班時多讀 8 筆。學生端完全不碰這裡(這裡含答案),
   他們讀的還是 territory/questions 那一份不含答案的,一筆。
============================================ */

const QuestionBank = {
  SHARDS: 8,

  /* 每一片上一次存上去的內容,用來判斷哪一片真的變了。
     只有變了的那幾片才重寫 —— 分片的意義就在這裡。 */
  _last: null,

  /* 題號 → 第幾片。FNV-1a,和測驗選項打亂用的是同一套算式。
     純函數,所以同一題在任何裝置、任何時候都落在同一片。 */
  bucket(id) {
    let h = 2166136261;
    const s = String(id || '');
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return Math.abs(h) % this.SHARDS;
  },

  /* 切片。八個鍵永遠都在(空的也要),否則刪掉一片裡的最後一題時
     那一片會留在雲端沒被清掉,下次載入又把它讀回來。 */
  split(questions) {
    const out = {};
    for (let i = 0; i < this.SHARDS; i++) out['s' + i] = [];
    (questions || []).forEach(q => { out['s' + this.bucket(q.id)].push(q); });
    return out;
  },

  /* 排回老師看到的順序:新的在上面。
     分片是依雜湊打散的,讀回來的順序沒有意義,所以一定要重排。
     早期匯入的題目可能沒有 createdAt,讓它們排在最後。 */
  sort(questions) {
    return (questions || []).slice()
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  },

  /* 開班時載入。回傳題數。
     雲端還沒有分片、但主文件裡還有舊題庫的話,就地搬過去一次。 */
  async load(classId, blob) {
    if (!isCloudMode()) {
      state.territoryQuestions = this.sort((blob || {}).territoryQuestions || []);
      this._last = null;
      return state.territoryQuestions.length;
    }

    let shards = [];
    try {
      shards = await Cloud.loadQuestionBank(classId);
    } catch (e) {
      /* 讀不到的話用主文件裡的(舊班級還有),總比空題庫好。
         這裡刻意不寫任何東西 —— 讀失敗時去寫,等於拿不完整的資料
         去蓋掉雲端完整的那一份。 */
      console.warn('[題庫] 讀取分片失敗,改用主文件裡的:', e.code || e.message);
      state.territoryQuestions = this.sort((blob || {}).territoryQuestions || []);
      this._last = null;
      return state.territoryQuestions.length;
    }

    const legacy = (blob || {}).territoryQuestions || [];

    if (shards.length === 0 && legacy.length > 0) {
      // 還沒搬過的班級:先搬,成功了才算
      state.territoryQuestions = this.sort(legacy);
      try {
        await this.persist(classId, true);
        console.info(`[題庫] 已從主文件搬出 ${legacy.length} 題到分片`);
      } catch (e) {
        console.warn('[題庫] 搬移失敗,這次還是用主文件裡的:', e.code || e.message);
        this._last = null;
      }
      return state.territoryQuestions.length;
    }

    state.territoryQuestions = this.sort(shards);
    this._last = this.split(state.territoryQuestions);
    return state.territoryQuestions.length;
  },

  /* 把目前的題庫寫上去。只寫內容真的變了的那幾片。
     all = true 時全部寫(搬移、整批取代時用)。 */
  async persist(classId, all) {
    if (!isCloudMode()) return 0;
    const next = this.split(state.territoryQuestions);
    const changed = {};
    let n = 0;

    Object.keys(next).forEach(k => {
      const before = this._last ? JSON.stringify(this._last[k] || []) : null;
      if (all || before === null || before !== JSON.stringify(next[k])) {
        changed[k] = next[k];
        n++;
      }
    });

    if (n === 0) return 0;
    await Cloud.saveQuestionShards(classId, changed);
    // 寫成功了才更新基準,失敗的話下一次會再試同樣那幾片
    this._last = next;
    return n;
  },

  /* 主文件裡的舊欄位還在的話清掉(搬移成功之後)。
     不急著做,下一次 save() 自然就不會再寫那個欄位 ——
     serializeState() 已經不輸出它了。 */
  rev() {
    return (state.tqRev || 0) + 1;
  }
};
