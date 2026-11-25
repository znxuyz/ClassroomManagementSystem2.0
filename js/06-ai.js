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
      defaultModel: 'gemini-flash-latest',
      models: [
        { id: 'gemini-flash-latest', name: 'Flash(最新版,快又夠用)' },
        { id: 'gemini-pro-latest', name: 'Pro(最新版,比較會寫)' }
      ]
    }
  },

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

  getModel(p) {
    return localStorage.getItem(this.modelName(p)) || this.cfg(p).defaultModel;
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
    if (res.status === 429) {
      msg = '太頻繁或超過免費額度,等一下再試。\n' + msg;
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
  /* 型號可能不存在(Google 常換名字,或老師的帳號沒開那一個)。
     碰到就**自己去問一次現在有哪些**,換成第一個可用的再試一次 ——
     寫死的預設值哪天失效時,老師只會看到一句看不懂的 404。 */
  async callGemini(systemPrompt, userPrompt, maxTokens, signal, retried) {
    try {
      return await this.geminiOnce(systemPrompt, userPrompt, maxTokens, signal);
    } catch (e) {
      if (retried || !/NO_MODEL/.test(e.message)) throw e;
      const list = await this.fetchModels('gemini');
      if (!list.length) throw e;
      this.setModel(list[0].id, 'gemini');
      return this.callGemini(systemPrompt, userPrompt, maxTokens, signal, true);
    }
  },

  async geminiOnce(systemPrompt, userPrompt, maxTokens, signal) {
    const model = this.getModel('gemini');
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
        throw new Error('NO_MODEL:' + txt);
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
