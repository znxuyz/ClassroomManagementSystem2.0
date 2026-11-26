/* ============================================
   AI 可以接 Claude 或 Gemini
   ────────────────────────────────────────────
   Claude 要先充值(最低 USD $5),對一個只是想試試看的老師來說,
   那一步就會讓他放棄。Gemini 用學校本來就有的 Google 帳號就能申請,
   不必付錢 —— 所以兩家都接,老師自己選。

   這一套盯五件事:

   1. **舊使用者不會被換掉**:已經設好 Claude 的老師更新之後,
      供應商、金鑰、型號都要原封不動。
   2. **兩家的金鑰分開存**:切過去試一下 Gemini,切回來不必重貼。
   3. 兩家的**請求形狀**各自正確(欄位名稱完全不同)。
   4. **型號選「自動」時會自己換一個再試**。Google 列出二十幾個型號,
      裡面還混著畫圖、向量、Gemma,而且**哪幾個免費方案真的能用,
      API 裡沒有講** —— 老師選錯的下場是一整面英文錯誤
      (實際踩到的是 gemini-4-neon:免費額度 limit 0)。
      所以預設讓系統自己試;但老師自己指定型號時就不要雞婆換掉。
   5. 壞金鑰要講人話。Google 回的是 **400 INVALID_ARGUMENT**(不是 401),
      只看狀態碼的話老師會看到「請求失敗(400)」然後完全猜不到是貼錯金鑰。

   送出去的內容都用假的 fetch 攔下來看,不會真的打到任何人的 API。
============================================ */
import { loadPlaywright, openApp, prepare, report } from './lib.mjs';

const chromium = await loadPlaywright();
const { page, errors, close } = await openApp(chromium);
await prepare(page);

const lines = [];
const ok = (n, c, e) => lines.push((c ? '✓ ' : '✗ ') + n + (e ? ' — ' + e : ''));

const r = await page.evaluate(async () => {
  const out = {};
  const sent = [];
  const real = window.fetch;

  /* 假的 fetch:把送出去的東西留下來,並照呼叫端的設定回不同的結果 */
  let mode = 'ok';
  window.fetch = async (url, opt) => {
    /* 型號會被 encodeURIComponent 編碼過(本來就該編,名字裡可能有特殊字元),
       所以比對前要先解回來 —— 不解的話這個假 fetch 會對不上。 */
    const u = decodeURIComponent(String(url));
    sent.push({ url: u, headers: opt.headers || {},
                body: opt.body ? JSON.parse(opt.body) : null });
    const gem = u.includes('googleapis');
    if (mode === 'badkey') {
      return { ok: false, status: 400,
               json: async () => ({ error: { code: 400, status: 'INVALID_ARGUMENT',
                 message: 'API key not valid. Please pass a valid API key.' } }) };
    }
    if (u.includes(':generateContent') && mode !== 'ok' && mode !== 'blocked') {
      /* nomodel:換到 gemini-good-latest 就通(測「會不會自己換」)
         notfree / perminute:每一個都失敗(測「訊息講不講人話」) */
      if (mode !== 'nomodel' || !u.includes('gemini-good-latest')) {
        if (mode === 'nomodel') {
          return { ok: false, status: 404,
                   json: async () => ({ error: { code: 404, status: 'NOT_FOUND',
                     message: 'models/xxx is not found for API version v1beta' } }) };
        }
        if (mode === 'notfree') {
          return { ok: false, status: 429,
                   json: async () => ({ error: { code: 429, status: 'RESOURCE_EXHAUSTED',
                     message: 'You exceeded your current quota. * Quota exceeded for metric: '
                       + 'generativelanguage.googleapis.com/generate_content_free_tier_requests, '
                       + 'limit: 0, model: gemini-4-neon, description: Generate content input '
                       + 'requests per minute limit exceeded on Free Tier. '
                       + 'See https://aistudio.google.com/docs/rate-limits' } }) };
        }
        if (mode === 'perminute') {
          return { ok: false, status: 429,
                   json: async () => ({ error: { code: 429, status: 'RESOURCE_EXHAUSTED',
                     message: 'Quota exceeded for metric: generate_content_free_tier_requests, '
                       + 'limit: 15, per minute limit exceeded. Please retry in 42.5s' } }) };
        }
      }
    }
    if (u.includes('/v1beta/models?')) {
      return { ok: true, json: async () => ({ models: [
        { name: 'models/gemini-good-latest', displayName: '好用版',
          supportedGenerationMethods: ['generateContent'] },
        { name: 'models/text-embedding-004', displayName: '向量',
          supportedGenerationMethods: ['embedContent'] },
        { name: 'models/imagen-寫圖', displayName: '畫圖',
          supportedGenerationMethods: ['generateContent'] }
      ] }) };
    }
    if (mode === 'blocked') {
      return { ok: true, json: async () => ({
        candidates: [{ finishReason: 'SAFETY', content: { parts: [] } }] }) };
    }
    return { ok: true, json: async () => gem
      ? { candidates: [{ content: { parts: [{ text: 'Gemini ' }, { text: '回答' }] } }] }
      : { content: [{ text: 'Claude 回答' }] } };
  };

  /* ── 1. 舊使用者:只有舊的那兩個 localStorage 欄位 ── */
  localStorage.clear();
  localStorage.setItem('guardian-claude-api-key', 'sk-ant-舊的');
  localStorage.setItem('guardian-claude-model', 'claude-opus-5');
  out.舊用戶供應商 = AI.getProvider();
  out.舊用戶金鑰 = AI.getKey();
  out.舊用戶型號 = AI.getModel();

  /* ── 2. Claude 的請求形狀 ── */
  out.claude回應 = await AI.call('你是老師助手', '寫一句評語', 100);
  const c = sent[0];
  out.claude請求 = {
    url: c.url,
    旗標: c.headers['anthropic-dangerous-direct-browser-access'],
    金鑰: c.headers['x-api-key'],
    model: c.body.model,
    system: c.body.system,
    上限: c.body.max_tokens
  };

  /* ── 3. 換成 Gemini:金鑰各存各的 ── */
  AI.setProvider('gemini');
  out.剛換過去沒有金鑰 = AI.hasKey();
  AI.setKey('AIza測試');
  out.gemini回應 = await AI.call('你是老師助手', '寫一句評語', 100);
  const g = sent[sent.length - 1];
  out.gemini請求 = {
    路徑: g.url.replace('https://generativelanguage.googleapis.com', ''),
    金鑰在標頭: g.headers['x-goog-api-key'],
    無網址金鑰: !/key=/.test(g.url),
    system: g.body.systemInstruction.parts[0].text,
    user: g.body.contents[0].parts[0].text,
    上限: g.body.generationConfig.maxOutputTokens
  };
  AI.setProvider('claude');
  out.切回來金鑰還在 = AI.getKey();
  AI.setProvider('gemini');
  out.gemini金鑰也還在 = AI.getKey();

  /* ── 4. 列型號:只留真的能產生文字的 ── */
  const list = await AI.fetchModels();
  out.型號清單 = list.map(m => m.id);

  /* ── 5. 自動:挑一個能用的 ── */
  AI.setModel(AI.AUTO, 'gemini');
  AI.clearBad();
  mode = 'nomodel';
  const before = sent.length;
  out.自動結果 = await AI.call(null, '再試一次', 50);
  out.自動換成 = AI.getModel('gemini');
  out.自動多打幾次 = sent.length - before;
  out.壞型號記起來了 = AI.isBad('gemini-flash-latest');
  mode = 'ok';

  /* 老師自己指定型號時,**不要**自作主張換掉 */
  AI.clearBad();
  AI.setModel('gemini-我自己要用的', 'gemini');
  mode = 'nomodel';
  try { await AI.call(null, 'x', 10); out.指定型號 = '(被換掉了)'; }
  catch (e) { out.指定型號 = e.message; }
  mode = 'ok';
  out.指定型號沒被改 = AI.getChoice('gemini') === 'gemini-我自己要用的';

  /* ── 5b. 免費方案不開放(limit: 0)── */
  AI.clearBad();
  AI.setModel(AI.AUTO, 'gemini');
  mode = 'notfree';
  try { await AI.call(null, 'x', 10); } catch (e) { out.limit0訊息 = e.message; }
  out.limit0永久封存 = Object.values(AI.badModels()).some(x => x.until === 0);
  mode = 'ok';

  /* ── 5c. 每分鐘額度:只是暫時,要記下什麼時候恢復 ── */
  AI.clearBad();
  mode = 'perminute';
  try { await AI.call(null, 'x', 10); } catch (e) { out.每分鐘訊息 = e.message; }
  out.每分鐘是暫時的 = Object.values(AI.badModels()).some(x => x.until > Date.now());
  mode = 'ok';
  AI.clearBad();

  /* ── 5d. 候選排序:畫圖、向量、Gemma 不該被自動挑中 ── */
  AI.setModelList([
    { id: 'imagen-4', name: '畫圖' },
    { id: 'gemma-4-27b-it', name: 'Gemma' },
    { id: 'gemini-3-pro-preview', name: 'Pro 預覽' },
    { id: 'gemini-flash-latest', name: 'Flash 最新' },
    { id: 'text-embedding-004', name: '向量' },
    { id: 'nano-banana-pro', name: '香蕉' }
  ], 'gemini');
  out.候選順序 = AI.candidates('gemini').map(m => m.id);

  /* ── 6. 壞金鑰的訊息 ── */
  mode = 'badkey';
  try { await AI.call(null, 'x', 10); out.壞金鑰訊息 = '(沒有丟錯)'; }
  catch (e) { out.壞金鑰訊息 = e.message; }

  /* ── 7. 被安全設定擋下來:不要回一片空白 ── */
  mode = 'blocked';
  try { await AI.call(null, 'x', 10); out.被擋訊息 = '(沒有丟錯)'; }
  catch (e) { out.被擋訊息 = e.message; }
  mode = 'ok';

  /* ── 8. 沒金鑰就是 NO_KEY(呼叫端靠這個字串顯示引導畫面)── */
  AI.clearKey();
  try { await AI.call(null, 'x', 10); out.沒金鑰 = '(沒有丟錯)'; }
  catch (e) { out.沒金鑰 = e.message; }

  window.fetch = real;
  return out;
});

ok('已經設好 Claude 的老師,更新之後完全不受影響',
   r.舊用戶供應商 === 'claude' && r.舊用戶金鑰 === 'sk-ant-舊的'
   && r.舊用戶型號 === 'claude-opus-5',
   [r.舊用戶供應商, r.舊用戶金鑰, r.舊用戶型號].join(' / '));

ok('Claude:打對端點,而且帶了瀏覽器直連的旗標',
   r.claude請求.url === 'https://api.anthropic.com/v1/messages'
   && r.claude請求.旗標 === 'true' && r.claude請求.金鑰 === 'sk-ant-舊的',
   r.claude請求.url);
ok('Claude:system / model / 上限都放對位置',
   r.claude請求.system === '你是老師助手' && r.claude請求.model === 'claude-opus-5'
   && r.claude請求.上限 === 100);
ok('Claude 回得出內容', r.claude回應 === 'Claude 回答', r.claude回應);

ok('剛換到 Gemini 時還沒有金鑰(不會誤用另一家的)',
   r.剛換過去沒有金鑰 === false);
ok('Gemini:型號放在網址、動作是 :generateContent',
   /^\/v1beta\/models\/.+:generateContent$/.test(r.gemini請求.路徑),
   r.gemini請求.路徑);
ok('Gemini:金鑰走標頭,**不放在網址上**(網址會被記進瀏覽器紀錄)',
   r.gemini請求.金鑰在標頭 === 'AIza測試' && r.gemini請求.無網址金鑰 === true);
ok('Gemini:system / user / 上限都放對位置(欄位名稱和 Claude 完全不同)',
   r.gemini請求.system === '你是老師助手' && r.gemini請求.user === '寫一句評語'
   && r.gemini請求.上限 === 100, JSON.stringify(r.gemini請求));
ok('Gemini 回得出內容(分成好幾段也要接起來)',
   r.gemini回應 === 'Gemini 回答', r.gemini回應);

ok('兩家的金鑰分開存,切來切去都不會弄丟',
   r.切回來金鑰還在 === 'sk-ant-舊的' && r.gemini金鑰也還在 === 'AIza測試',
   r.切回來金鑰還在 + ' / ' + r.gemini金鑰也還在);

ok('列型號時只留真的能產生文字的(過濾掉向量、畫圖那些)',
   JSON.stringify(r.型號清單) === '["gemini-good-latest"]', r.型號清單.join(','));

ok('**選「自動」時,型號不能用就自己換一個**,老師不會看到 404',
   r.自動結果 === 'Gemini 回答' && r.自動換成 === 'gemini-good-latest',
   r.自動換成);
ok('不能用的那一個會被記起來,下次不再試', r.壞型號記起來了 === true);
ok('而且不會無限重試', r.自動多打幾次 <= 5, r.自動多打幾次 + ' 次');

ok('老師自己指定型號時**不會**被自動換掉',
   /不能用了/.test(r.指定型號) && r.指定型號沒被改 === true, r.指定型號);

ok('**免費方案不開放(limit: 0)講得出來**,不是丟一句「超過額度」',
   /免費方案不開放/.test(r.limit0訊息), r.limit0訊息);
ok('而且那個型號永久跳過(不是等一下再試)', r.limit0永久封存 === true);

ok('每分鐘額度滿了講得出大概多久後恢復',
   /這一分鐘問太多次了/.test(r.每分鐘訊息) && /秒/.test(r.每分鐘訊息),
   r.每分鐘訊息);
ok('而且只是暫時跳過,時間到會再用', r.每分鐘是暫時的 === true);

ok('自動挑的時候不會挑到畫圖 / 向量 / Gemma,flash 排在 pro 預覽版前面',
   JSON.stringify(r.候選順序) === '["gemini-flash-latest","gemini-3-pro-preview"]',
   r.候選順序.join(' → '));

ok('壞金鑰講人話(Google 回的是 400,不是 401)',
   /金鑰不對/.test(r.壞金鑰訊息), r.壞金鑰訊息.split('\n')[0]);
ok('被安全設定擋下來時會說明,不是回一片空白',
   /SAFETY/.test(r.被擋訊息), r.被擋訊息);
ok('沒金鑰時丟 NO_KEY(呼叫端靠這個顯示引導畫面)', r.沒金鑰 === 'NO_KEY', r.沒金鑰);

await close();
process.exit(report('AI 可以接 Claude 或 Gemini', lines, errors) ? 0 : 1);
