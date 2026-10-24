/* ============================================
   加分歷程的封存
   ────────────────────────────────────────────
   為什麼要有這個:

   整個班級的資料存在「一份」Firestore 文件裡,而單一文件上限是 1 MiB。
   實測 28 人、每天加分 3 次、每週一次測驗、天天點名的話:

       20 上課日   198 KB
      100 上課日   671 KB
      165 上課日  1024 KB  ← 上限
      200 上課日  1226 KB  ✗ 整份寫入被拒絕

   也就是**不到一個學年**,老師按加分就會開始存不進去。
   其中 78% 是每位學生的加分紀錄(history),而它只進不出。

   做法:主文件只留最近 KEEP 筆(畫面上本來就只顯示「最近的」),
   其餘搬到 classes/{id}/history 子集合。報表要看完整歷程時才去讀。

   ── 安全順序 ──
   先寫封存 → 確認成功 → 才從主文件刪掉。
   反過來做的話,封存失敗就等於資料被吃掉。寫入失敗時什麼都不動,
   下一次存檔再試;最糟的情況只是主文件暫時大一點,不會掉資料。
============================================ */

const HistoryArchive = {
  KEEP: 50,        // 主文件保留最近幾筆(畫面上的「最近的積分紀錄」看得到的量)
  TRIM_AT: 80,     // 超過這個數才動手,免得每加一分就寫一次封存
  CHUNK: 200,      // 一份封存文件裝幾筆

  _busy: false,

  /* 現在有多少筆等著被搬走 */
  pending() {
    let n = 0;
    (state.students || []).forEach(s => {
      const h = s.history || [];
      if (h.length > this.TRIM_AT) n += h.length - this.KEEP;
    });
    return n;
  },

  /* 把超量的部分搬到子集合。回傳搬了幾筆。
     同一時間只會跑一個(存檔很頻繁,重入會把同一批寫兩次)。 */
  async flush() {
    if (this._busy || !isCloudMode()) return 0;
    if (this.pending() === 0) return 0;

    this._busy = true;
    try {
      const classId = state.classId;
      const chunks = [];
      const plan = [];           // 寫成功之後才真的從 state 裡刪

      (state.students || []).forEach(s => {
        const h = s.history || [];
        if (h.length <= this.TRIM_AT) return;
        // 舊的在前面(history 是 push 進去的),所以搬前面那段
        const move = h.slice(0, h.length - this.KEEP);
        plan.push({ student: s, count: move.length });

        for (let i = 0; i < move.length; i += this.CHUNK) {
          const part = move.slice(i, i + this.CHUNK);
          // 文件 id 帶上時間與序號,重跑也不會蓋掉別批
          const id = `${s.id}_${part[0].time || Date.now()}_${i}`;
          chunks.push({ id, studentId: s.id, entries: part });
        }
      });

      await Cloud.archiveHistory(classId, chunks);

      // 寫入成功了,現在才動主文件
      let moved = 0;
      plan.forEach(p => {
        p.student.history = (p.student.history || []).slice(p.count);
        moved += p.count;
      });
      if (moved > 0) {
        console.info(`[歷程] 已封存 ${moved} 筆,主文件只留最近 ${this.KEEP} 筆/人`);
      }
      return moved;
    } catch (e) {
      // 失敗就什麼都不動,下次存檔再試 —— 絕不先刪再寫
      console.warn('[歷程] 封存失敗,這次不動主文件:', e.code || e.message);
      return 0;
    } finally {
      this._busy = false;
    }
  },

  /* 讀回某位學生的完整歷程(封存的 + 主文件裡最近的)。
     報表與 AI 分析要用,平常不讀,所以不會增加日常的讀取量。 */
  async full(student) {
    const recent = student.history || [];
    if (!isCloudMode()) return recent;
    try {
      const old = await Cloud.loadStudentHistory(state.classId, student.id);
      return old.concat(recent);
    } catch (e) {
      console.warn('[歷程] 讀取封存失敗,只用主文件裡的:', e.code || e.message);
      return recent;
    }
  },

  /* 整班的完整歷程,匯出班級報表時用。回傳 { studentId: [...] } */
  async fullAll() {
    const out = {};
    (state.students || []).forEach(s => { out[s.id] = (s.history || []).slice(); });
    if (!isCloudMode()) return out;
    try {
      const old = await Cloud.loadAllHistory(state.classId);
      Object.keys(old).forEach(sid => {
        out[sid] = (old[sid] || []).concat(out[sid] || []);
      });
    } catch (e) {
      console.warn('[歷程] 讀取整班封存失敗:', e.code || e.message);
    }
    return out;
  }
};

/* ============================================
   資料用量
   ────────────────────────────────────────────
   單一文件 1 MiB 是硬上限,超過就整份寫不進去。
   原本只在「失敗之後」才診斷 —— 那時老師已經在現場卡住了。
   改成每次存檔前先量,快滿了就先講。
============================================ */

const BlobSize = {
  WARN_AT: 0.75,     // 到這個比例開始提醒
  URGENT_AT: 0.90,   // 到這個比例每次都提醒

  _warnedAt: 0,

  measure(data) {
    const json = JSON.stringify(data || serializeState());
    const bytes = new TextEncoder().encode(json).length;
    return {
      bytes,
      kb: Math.round(bytes / 1024),
      limitKb: Math.round(FIRESTORE_LIMITS.MAX_DOC_BYTES / 1024),
      ratio: bytes / FIRESTORE_LIMITS.MAX_DOC_BYTES
    };
  },

  /* 存檔前檢查。快滿了就提醒,但不擋存檔 —— 擋了反而會掉資料。 */
  check(data) {
    const m = this.measure(data);
    if (m.ratio < this.WARN_AT) { this._warnedAt = 0; return m; }

    const level = m.ratio >= this.URGENT_AT ? 'urgent' : 'warn';
    // 提醒過就不要每次存檔都跳,除非又漲了 5%
    const step = Math.floor(m.ratio * 20);
    if (step > this._warnedAt) {
      this._warnedAt = step;
      toast(level === 'urgent'
        ? `⚠ 班級資料已用掉 ${Math.round(m.ratio * 100)}%(${m.kb}/${m.limitKb}KB),` +
          `請到系統設定做一次「封存舊資料」,否則很快會存不進去`
        : `班級資料已用掉 ${Math.round(m.ratio * 100)}%(${m.kb}/${m.limitKb}KB),` +
          `可以到系統設定看看`, 6000);
    }
    return m;
  }
};


/* ============================================
   系統設定裡的「資料用量」面板
   ────────────────────────────────────────────
   1 MiB 是硬上限,超過就整份寫不進去 —— 所以要看得到還剩多少,
   而不是等到存檔失敗才知道。
============================================ */

function renderDataUsage() {
  const box = document.getElementById('dataUsage');
  if (!box) return;

  const m = BlobSize.measure();
  const pct = Math.round(m.ratio * 100);
  const level = m.ratio >= BlobSize.URGENT_AT ? 'urgent'
              : m.ratio >= BlobSize.WARN_AT ? 'warn' : 'ok';

  // 各欄位佔多少,才知道該清哪裡
  const data = serializeState();
  const parts = Object.keys(data).map(k => ({
    key: k,
    kb: Math.round(new TextEncoder().encode(JSON.stringify(data[k])).length / 1024)
  })).filter(p => p.kb >= 1).sort((a, b) => b.kb - a.kb).slice(0, 6);

  const names = {
    students: '學生資料(含最近的加分紀錄)', territoryQuestions: '蜂巢題庫',
    attendance: '點名紀錄', quizzes: '測驗與題目', shopHistory: '兌換紀錄',
    shopItems: '獎品', seatingLayouts: '座位表', groupSets: '分組',
    contactBook: '聯絡簿', homework: '作業', classTasks: '班級任務'
  };

  const waiting = HistoryArchive.pending();

  box.innerHTML = `
    <div class="usage-bar-wrap">
      <div class="usage-bar is-${level}" style="width:${Math.min(100, pct)}%"></div>
    </div>
    <div class="usage-line">
      <strong>${m.kb} KB</strong> / ${m.limitKb} KB(${pct}%)
      ${level === 'ok' ? '' : level === 'warn'
        ? '<span class="usage-tag is-warn">該整理了</span>'
        : '<span class="usage-tag is-urgent">快滿了,請盡快封存</span>'}
    </div>

    <div class="quiz-mode-hint">
      一個班級的資料存在雲端的<strong>一份文件</strong>裡,上限是 1024 KB ——
      超過之後<strong>整份寫入會被拒絕</strong>,也就是按加分會存不進去。<br>
      加分紀錄會自動搬到另一個地方(主文件只留最近 ${HistoryArchive.KEEP} 筆/人),
      所以平常不用管它。${waiting > 0
        ? `目前有 <strong>${waiting}</strong> 筆等著搬,下次存檔時會處理。` : ''}
    </div>

    <div class="usage-parts">
      ${parts.map(p => `
        <div class="usage-part">
          <span>${escapeHtml(names[p.key] || p.key)}</span>
          <span class="usage-part-kb">${p.kb} KB</span>
        </div>`).join('')}
    </div>

    <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:14px;">
      <button class="btn btn-ghost btn-small" onclick="renderDataUsage()">重新計算</button>
      <button class="btn ${level === 'ok' ? 'btn-ghost' : 'btn-accent'} btn-small"
              onclick="archiveOldTerm()">封存舊資料…</button>
    </div>
    <div id="archiveResult"></div>`;
}

/* ============================================
   封存舊資料
   ────────────────────────────────────────────
   加分紀錄已經自動搬走了,剩下會一直長的是「測驗結果」與「點名紀錄」。
   一個學年之後它們加起來約 150 KB,兩三年就會再次逼近上限。

   這裡把指定日期之前的那些搬到 classes/{id}/archives/{標籤},
   主文件只留目前學期的。封存的內容隨時可以下載回來。
============================================ */
async function archiveOldTerm() {
  if (!isCloudMode()) { toast('單機模式不需要封存'); return; }

  const def = new Date();
  def.setMonth(def.getMonth() - 6);
  const ans = prompt(
    '封存這個日期「之前」的測驗結果與點名紀錄:\n\n' +
    '· 加分紀錄已經自動封存了,不在這裡\n' +
    '· 封存的資料會移到雲端另一個地方,隨時可以下載\n' +
    '· 主文件會變小,存檔才不會撞到上限\n\n' +
    '日期格式 YYYY-MM-DD:', def.toISOString().slice(0, 10));
  if (!ans) return;

  const cut = new Date(ans + 'T00:00:00');
  if (isNaN(cut.getTime())) { toast('日期格式不對'); return; }
  const cutMs = cut.getTime();
  const label = ans;

  // 點名:key 就是日期字串
  const oldAtt = {};
  Object.keys(state.attendance || {}).forEach(d => {
    if (d < label) { oldAtt[d] = state.attendance[d]; }
  });

  // 測驗結果:看那一份測驗是什麼時候結算的
  const oldQuiz = {};
  let quizCount = 0;
  (state.students || []).forEach(s => {
    Object.entries(s.quizResults || {}).forEach(([qid, r]) => {
      if ((r.at || 0) && r.at < cutMs) {
        (oldQuiz[s.id] = oldQuiz[s.id] || {})[qid] = r;
        quizCount++;
      }
    });
  });

  const attCount = Object.keys(oldAtt).length;
  if (attCount === 0 && quizCount === 0) {
    toast(`${label} 之前沒有可以封存的資料`);
    return;
  }

  if (!confirm(`要封存嗎?\n\n` +
      `· 點名紀錄 ${attCount} 天\n` +
      `· 測驗結果 ${quizCount} 筆\n\n` +
      `會移到雲端的封存區,主文件裡就看不到了(但下得回來)。`)) return;

  try {
    toast('封存中…');
    // 一樣是「先寫成功才刪」
    await Cloud.saveArchive(state.classId, label, {
      attendance: oldAtt, quizResults: oldQuiz, at: Date.now()
    });

    Object.keys(oldAtt).forEach(d => { delete state.attendance[d]; });
    (state.students || []).forEach(s => {
      Object.keys(oldQuiz[s.id] || {}).forEach(qid => { delete s.quizResults[qid]; });
    });

    save();
    renderAll();
    renderDataUsage();
    toast(`✦ 已封存 ${attCount} 天點名、${quizCount} 筆測驗結果`);
  } catch (e) {
    console.error('[封存] 失敗:', e);
    toast('封存失敗,主文件沒有被動到:' + (e.message || e.code));
  }
}
