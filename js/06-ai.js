/* ============================================
   AI 模組 —— 接 Claude 或 Gemini
   ────────────────────────────────────────────
   兩家都支援,老師自己選。理由很實際:
   Claude 要先充值(最低 USD $5),對一個只是想試試看的老師來說,
   那一步就會讓他放棄;Gemini 在 Google AI Studio 申請金鑰不必付錢,
   用學校本來就有的 Google 帳號就能開。

   ── 為什麼瀏覽器打得動 ──
   這個系統沒有後端,所有請求都是從網頁直接發出去的,所以對方必須允許
   跨來源請求。兩家都可以,但方式不一樣:
     · Anthropic 要帶 anthropic-dangerous-direct-browser-access: true
     · Google 預設就允許(實測預檢回 access-control-allow-headers:
       content-type,x-goog-api-key)
   這也代表**金鑰會出現在使用者自己的瀏覽器裡**。這在這個專案是可以的:
   金鑰是老師自己的、只存在他自己那台電腦的 localStorage,不經過我們的
   任何伺服器(我們根本沒有伺服器)。但也因此設定頁要寫清楚
   「公用電腦用完請清除」。

   ── 外面只看得到 AI.call() ──
   三個 AI 功能(評語、潤飾、行為分析)都只呼叫 AI.call,
   換供應商對它們來說是透明的 —— 所以這個檔案是唯一要改的地方。
============================================ */

const AI = {
  /* 舊版只接 Claude,金鑰存在這個 key 底下。
     要留著 —— 已經設定好的老師更新之後不該被登出。 */
  LEGACY_KEY: 'guardian-claude-api-key',
  LEGACY_MODEL: 'guardian-claude-model',
  PROVIDER_STORAGE: 'guardian-ai-provider',

  PROVIDERS: {
    claude: {
      name: 'Claude(Anthropic)',
      keyHint: 'sk-ant-...',
      keyPrefix: 'sk-',
      console: 'https://console.anthropic.com',
      consoleName: 'console.anthropic.com',
      free: false,
      note: '品質最好,但要先充值(最低 USD $5,約 NT$160,一個學期通常用不完)。',
      defaultModel: 'claude-sonnet-5',
      models: [
        { id: 'claude-sonnet-5', name: 'Sonnet 5(推薦,評語/分析品質佳)' },
        { id: 'claude-haiku-4-5', name: 'Haiku 4.5(便宜快速,日常用)' },
        { id: 'claude-opus-5', name: 'Opus 5(最強,重要報告用)' }
      ]
    },
    gemini: {
      name: 'Gemini(Google)',
      keyHint: 'AIza...',
      keyPrefix: 'AIza',
      console: 'https://aistudio.google.com/apikey',
      consoleName: 'aistudio.google.com/apikey',
      free: true,
      note: '用學校的 Google 帳號就能申請,不必付錢也不必綁信用卡。'
          + '免費額度有每分鐘/每天的上限,自己用綽綽有餘。',
      /* 型號**不寫死**:Google 的型號改得很勤,寫死的話哪天就會變成
         「這個型號不存在」。設定頁有一顆「載入可用型號」,
         直接用老師的金鑰去問 API 現在有哪些能用。 */
      defaultModel: '__auto__',
      models: [
        { id: 'gemini-flash-latest', name: 'Flash(最新版,快又夠用)' },
        { id: 'gemini-pro-latest', name: 'Pro(最新版,比較會寫)' }
      ]
    }
  },

  /* 下拉的第一個選項:讓系統自己挑。
     Google 列出來的型號有二十幾個(還混著畫圖、向量、Gemma),
     老師沒有辦法分辨哪一個「免費方案真的能用」——
     而選錯的下場是一整面看不懂的英文錯誤。 */
  AUTO: '__auto__',

  /* ---------- 哪些型號可以拿來寫評語 ----------
     排序只是「先試哪一個」的順序,不是保證 —— 真正能不能用,
     要打過去才知道(免費方案開放哪幾個,Google 沒有在 API 裡講)。
     所以這裡只排出一個合理的起點,剩下的交給 autoPick 一個一個試。 */
  rankModels(list) {
    const bad = /embedding|aqa|imagen|veo|tts|audio|live|image|nano|banana|gemma|custom/i;
    return (list || [])
      .filter(m => !bad.test(m.id + ' ' + (m.name || '')))
      .map(m => {
        const id = m.id.toLowerCase();
        let score = 0;
        // flash 系列是免費方案的主力;pro 常常不開放或額度極小
        if (/flash/.test(id)) score += 40;
        if (/lite/.test(id)) score += 5;          // 更省,但寫評語差一點
        if (/pro/.test(id)) score -= 20;
        // 預覽版隨時會被收掉,放後面
        if (/preview|exp|experimental/.test(id)) score -= 30;
        // latest 是會自己跟著走的別名,比寫死版號耐用
        if (/latest/.test(id)) score += 10;
        return { ...m, score };
      })
      .sort((a, b) => b.score - a.score);
  },

  /* 試過不行的型號記在這裡。
       until = 0   永遠別再試(免費方案不開放:limit 0、或型號不存在)
       until > 0   暫時不要試(每分鐘/每天額度滿了,時間到再說) */
  BAD_STORAGE: 'guardian-ai-bad-models',
  badModels() {
    try { return JSON.parse(localStorage.getItem(this.BAD_STORAGE) || '{}') || {}; }
    catch (e) { return {}; }
  },
  markBad(id, until, why) {
    const bad = this.badModels();
    bad[id] = { until: until || 0, why: why || '' };
    localStorage.setItem(this.BAD_STORAGE, JSON.stringify(bad));
  },
  isBad(id) {
    const b = this.badModels()[id];
    if (!b) return false;
    if (!b.until) return true;              // 永久
    if (Date.now() < b.until) return true;  // 還在冷卻
    return false;
  },
  clearBad() { localStorage.removeItem(this.BAD_STORAGE); },

  /* 現在可以試的型號,照順序 */
  candidates(p) {
    return this.rankModels(this.getModelList(p || 'gemini'))
      .filter(m => !this.isBad(m.id));
  },

  GOOD_STORAGE: 'guardian-ai-good-model',
  goodModel() {
    const id = localStorage.getItem(this.GOOD_STORAGE) || '';
    return (id && !this.isBad(id)) ? id : '';
  },
  setGoodModel(id) { localStorage.setItem(this.GOOD_STORAGE, id); },

  /* ---------- 供應商 ---------- */
  getProvider() {
    const p = localStorage.getItem(this.PROVIDER_STORAGE);
    return this.PROVIDERS[p] ? p : 'claude';
  },
  setProvider(p) {
    if (this.PROVIDERS[p]) localStorage.setItem(this.PROVIDER_STORAGE, p);
  },
  cfg(p) { return this.PROVIDERS[p || this.getProvider()]; },

  /* ---------- 金鑰 ----------
     **一家一把,分開存**。共用一格的話,老師切過去試一下 Gemini,
     回來就要重貼 Claude 的金鑰。 */
  keyName(p) {
    p = p || this.getProvider();
    return p === 'claude' ? this.LEGACY_KEY : 'guardian-ai-key-' + p;
  },
  modelName(p) {
    p = p || this.getProvider();
    return p === 'claude' ? this.LEGACY_MODEL : 'guardian-ai-model-' + p;
  },

  hasKey(p) { return !!this.getKey(p); },
  getKey(p) { return localStorage.getItem(this.keyName(p)) || ''; },
  setKey(key, p) { localStorage.setItem(this.keyName(p), String(key).trim()); },
  clearKey(p) { localStorage.removeItem(this.keyName(p)); },

  /* 畫面上選的那一個(可能是「自動」) */
  getChoice(p) {
    return localStorage.getItem(this.modelName(p)) || this.cfg(p).defaultModel;
  },

  /* 真正要送出去的那一個。選「自動」時:用上次成功的那一個,
     沒有的話用候選名單的第一個。 */
  getModel(p) {
    const choice = this.getChoice(p);
    if (choice !== this.AUTO) return choice;
    const cands = this.candidates(p);
    return this.goodModel() || (cands[0] && cands[0].id) || 'gemini-flash-latest';
  },
  setModel(model, p) { localStorage.setItem(this.modelName(p), model); },

  /* 型號清單:老師按過「載入可用型號」就用問到的那一份,否則用內建的 */
  listName(p) { return 'guardian-ai-models-' + (p || this.getProvider()); },
  getModelList(p) {
    try {
      const saved = JSON.parse(localStorage.getItem(this.listName(p)) || 'null');
      if (Array.isArray(saved) && saved.length) return saved;
    } catch (e) { /* 存壞了就用內建的 */ }
    return this.cfg(p).models;
  },
  setModelList(list, p) {
    localStorage.setItem(this.listName(p), JSON.stringify(list || []));
  },

  /* 問 Google 現在有哪些型號可以用。
     寫死型號清單遲早會過期,直接問最準。 */
  async fetchModels(p) {
    p = p || this.getProvider();
    if (p !== 'gemini') return this.cfg(p).models;
    const key = this.getKey(p);
    if (!key) throw new Error('NO_KEY');
    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200',
      { headers: { 'x-goog-api-key': key } });
    if (!res.ok) throw new Error(await this.errorText(res));
    const data = await res.json();
    const list = (data.models || [])
      // 只留真的能拿來產生文字的
      .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
      .filter(m => !/embedding|aqa|imagen|veo|tts|image|live/i.test(m.name || ''))
      .map(m => ({ id: String(m.name || '').replace(/^models\//, ''),
                   name: m.displayName || m.name }));
    if (list.length) this.setModelList(list, p);
    return list;
  },

  /* ---------- 把 Google 那一大串錯誤縮成一句話 ----------
     原本整段倒出來,老師看到的是四五行英文網址加上
     「Quota exceeded for metric: generate_content_free_tier_requests」——
     完全看不出要做什麼。這裡抓出真正有意義的那幾個字。
     回傳 { short, kind, until } ,詳細內容另外收著給想看的人。 */
  readQuota(raw) {
    const t = String(raw || '');
    const out = { short: '', kind: '', until: 0 };

    // 幾小時幾分之後才會恢復(Google 會附 retry in 5h35m23s)
    const m = /retry in\s+(?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?/i.exec(t);
    if (m) {
      const h = +(m[1] || 0), mi = +(m[2] || 0), sec = Math.round(+(m[3] || 0));
      out.until = Date.now() + ((h * 3600 + mi * 60 + sec) * 1000);
      out.wait = h ? `約 ${h} 小時 ${mi} 分` : mi ? `約 ${mi} 分` : `約 ${sec} 秒`;
    }

    /* limit: 0 是最重要的一個訊號 —— 不是「用太多」,
       是**這個型號在免費方案根本不開放**。換一個就好。 */
    if (/limit:\s*0\b/.test(t)) {
      out.kind = 'not-free';
      out.short = '這個型號在免費方案不開放,換一個就好。';
      return out;
    }
    if (/per\s*day|daily|PerDay/i.test(t)) {
      out.kind = 'day';
      out.short = '今天的免費額度用完了' + (out.wait ? `,${out.wait}後恢復。` : '。');
      return out;
    }
    if (/per\s*minute|PerMinute/i.test(t)) {
      out.kind = 'minute';
      out.short = '這一分鐘問太多次了' + (out.wait ? `,${out.wait}後再試。` : ',等一下再試。');
      return out;
    }
    out.kind = 'quota';
    out.short = '超過免費額度' + (out.wait ? `,${out.wait}後恢復。` : ',等一下再試。');
    return out;
  },

  /* ---------- 錯誤訊息 ----------
     兩家的錯誤格式不一樣,但老師只想知道「是不是我的金鑰貼錯了」。 */
  async errorText(res) {
    let msg = '請求失敗(' + res.status + ')';
    try {
      const err = await res.json();
      msg = (err.error && (err.error.message || err.error.status)) || msg;
    } catch (e) { /* 回的不是 JSON 就用狀態碼 */ }
    /* Google 的壞金鑰回的是 400 INVALID_ARGUMENT,不是 401 ——
       只看狀態碼的話,老師會看到「請求失敗(400)」然後完全不知道
       是自己貼錯金鑰。所以訊息內容也要看。 */
    const badKey = res.status === 401 || res.status === 403
      || /api[ _-]?key|unauthenticated|permission/i.test(msg);
    if (badKey) {
      msg = '金鑰不對或沒有權限 —— 請確認貼的是「' + this.cfg().name + '」的金鑰。\n' + msg;
    }
    if (res.status === 429 || /quota|exceeded/i.test(msg)) {
      const q = this.readQuota(msg);
      // 完整那一段收在 detail 裡,畫面只秀第一行
      const e = new Error(q.short);
      e.quota = q;
      e.detail = msg;
      throw e;
    }
    return msg;
  },

  /* ---------- 送出 ----------
     signal 讓呼叫端可以中途取消 —— 等 30 秒卻不能喊停是很糟的體驗。 */
  async call(systemPrompt, userPrompt, maxTokens = 2000, signal) {
    const p = this.getProvider();
    if (!this.getKey(p)) throw new Error('NO_KEY');
    return p === 'gemini'
      ? this.callGemini(systemPrompt, userPrompt, maxTokens, signal)
      : this.callClaude(systemPrompt, userPrompt, maxTokens, signal);
  },

  async callClaude(systemPrompt, userPrompt, maxTokens, signal) {
    const body = {
      model: this.getModel('claude'),
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: userPrompt }]
    };
    if (systemPrompt) body.system = systemPrompt;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.getKey('claude'),
        'anthropic-version': '2023-06-01',
        // 沒有這一個,瀏覽器直接打會被擋下來
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify(body),
      signal
    });
    if (!res.ok) throw new Error(await this.errorText(res));
    const data = await res.json();
    return (data.content && data.content[0] && data.content[0].text) || '';
  },

  /* Gemini 的形狀和 Claude 不一樣:
       system → systemInstruction.parts[].text
       訊息   → contents[].parts[].text
       上限   → generationConfig.maxOutputTokens
       回應   → candidates[0].content.parts[].text(可能不只一段) */
  /* ---------- 自動換型號 ----------
     老師選「自動」時,一個型號不能用就換下一個 ——
     而「不能用」有好幾種,處理方式不一樣:

       免費方案不開放(limit: 0)→ 永遠別再試這一個
       型號不存在 / 被收掉(404)→ 永遠別再試,並重新問一次清單
       這分鐘問太多 / 今天用完   → 暫時跳過,時間到再回來
       其他(金鑰錯、網路斷)     → 不是型號的問題,直接往上丟

     換成功之後把那一個記起來,下次直接用,不用每次都重試一輪。 */
  async callGemini(systemPrompt, userPrompt, maxTokens, signal) {
    const auto = this.getChoice('gemini') === this.AUTO;
    let tried = 0;
    let lastErr = null;

    for (;;) {
      const model = this.getModel('gemini');
      try {
        const text = await this.geminiOnce(systemPrompt, userPrompt, maxTokens, signal, model);
        if (auto) this.setGoodModel(model);
        return text;
      } catch (e) {
        lastErr = e;
        const retryable = this.noteModelProblem(model, e);
        // 老師指定了型號就不要自作主張換掉 —— 他可能就是要用那一個
        if (!auto || !retryable) throw e;

        /* 型號不存在:清單可能過期了,重新問一次。只做一次,
           問不到就繼續用手上這份。 */
        if (e.modelGone && tried === 0) {
          try { await this.fetchModels('gemini'); } catch (e2) { /* 用舊的 */ }
        }
        if (++tried >= 4) break;
        if (!this.candidates('gemini').length) break;
      }
    }
    throw lastErr;
  },

  /* 這個錯誤是不是「換一個型號就好」?順便記下來。 */
  noteModelProblem(model, e) {
    const q = e.quota;
    if (q) {
      if (q.kind === 'not-free') { this.markBad(model, 0, q.short); return true; }
      // 額度類的:等它恢復(沒說多久就先避開十分鐘)
      this.markBad(model, q.until || (Date.now() + 10 * 60 * 1000), q.short);
      return true;
    }
    if (e.modelGone) { this.markBad(model, 0, '型號不存在'); return true; }
    return false;
  },

  /* ---------- 挑一個真的能用的 ----------
     設定頁按「測試連線」時跑這一支:拿最小的請求一個一個試,
     第一個成功的就記起來。先在設定頁試完,老師真的要用的時候
     才不會卡在一連串失敗上。 */
  async autoPick(signal, onStep) {
    if (!this.getModelList('gemini').length || !this.candidates('gemini').length) {
      try { await this.fetchModels('gemini'); } catch (e) { /* 用內建的 */ }
    }
    const list = this.candidates('gemini').slice(0, 8);
    if (!list.length) throw new Error('沒有可以用的型號 —— 按一下「載入可用型號」再試。');

    let lastErr = null;
    for (const m of list) {
      if (onStep) onStep(m);
      try {
        await this.geminiOnce(null, '回覆「OK」兩個字。', 16, signal, m.id);
        this.setGoodModel(m.id);
        return m;
      } catch (e) {
        if (e.name === 'AbortError') throw e;
        lastErr = e;
        if (!this.noteModelProblem(m.id, e)) throw e;   // 金鑰錯之類的,不用再試
      }
    }
    throw lastErr || new Error('每一個型號都試過了,都不能用。');
  },

  async geminiOnce(systemPrompt, userPrompt, maxTokens, signal, model) {
    model = model || this.getModel('gemini');
    const body = {
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: { maxOutputTokens: maxTokens }
    };
    if (systemPrompt) body.systemInstruction = { parts: [{ text: systemPrompt }] };

    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/'
        + encodeURIComponent(model) + ':generateContent',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.getKey('gemini') },
        body: JSON.stringify(body),
        signal
      });
    if (!res.ok) {
      const txt = await this.errorText(res);
      // 型號不存在:交給外面那一層換一個再試
      if (res.status === 404 || /not found|is not supported|not available/i.test(txt)) {
        const e = new Error('這個型號不能用了,換一個。');
        e.modelGone = true;
        e.detail = txt;
        throw e;
      }
      throw new Error(txt);
    }

    const data = await res.json();
    const cand = (data.candidates || [])[0];
    const text = ((cand && cand.content && cand.content.parts) || [])
      .map(x => x.text || '').join('');
    if (text) return text;

    /* 空回應通常不是壞掉,是被安全設定擋下來或講到一半被截斷 ——
       直接說出來,不要讓老師對著一片空白猜。 */
    const why = (cand && cand.finishReason)
      || (data.promptFeedback && data.promptFeedback.blockReason) || '';
    if (why === 'MAX_TOKENS') throw new Error('回應被長度上限截斷了,再試一次或換個模型。');
    if (why) throw new Error('這次沒有產生內容(' + why + ')—— 換個說法再試一次。');
    return '';
  }
};
