/* ============================================
   使用說明
   ────────────────────────────────────────────
   同一份內容給兩邊用:學生端自己看,老師端也看得到同一份
   (老師要回答學生問題、或投影出來一起講時才不會兩套說法)。

   寫法刻意用資料結構而不是一大塊 HTML —— 日後功能有變動,
   改這裡一個地方,兩端同時更新。
============================================ */

/* ============================================
   規則說明(依班級目前的設定即時產生)
   ────────────────────────────────────────────
   刻意不寫死。老師改了積分規則、進化門檻或蜂巢戰紀的難度分數之後,
   說明若還停在預設值,就會變成錯的 —— 那比沒有說明更糟。
============================================ */

function helpRuleSections(rules) {
  const list = (rules && rules.length ? rules : DEFAULT_RULES);
  const plus = list.filter(r => r.points > 0);
  const minus = list.filter(r => r.points < 0);

  const chips = arr => arr.map(r =>
    `<span class="help-rule ${r.points < 0 ? 'is-minus' : ''}">${escapeHtml(r.name)}
       <b>${r.points > 0 ? '+' : ''}${r.points}</b></span>`).join('');

  // 進化門檻:從第二階開始才有「還差多少」的意義
  const stages = STAGE_NAMES.map((name, i) =>
    `<span class="help-rule">${escapeHtml(name)}
       <b>${STAGE_THRESHOLDS[i]} 分${i === 0 ? '起' : ''}</b></span>`).join('');

  const diff = Object.values(DIFFICULTY).map(d =>
    `<span class="help-rule">${escapeHtml(d.label)} <b>+${d.points}</b></span>`).join('');

  /* 蜂巢戰紀的規則直接讀目前那一局的設定。老師在遊戲中調了倒扣,
     說明要跟著變,不然學生照著舊規則判斷要不要冒險。 */
  const tc = (typeof TerritoryGame !== 'undefined' && TerritoryGame.config) || null;
  const pen = tc ? (tc.wrongPenalty || 0) : 0;
  const floor = tc ? (tc.penaltyFloor || 0) : 0;
  const limit = tc ? (tc.answerSeconds || 0) : 0;
  const coolN = tc ? (tc.cooldownWrong === undefined ? 3 : tc.cooldownWrong) : 3;
  const coolSec = tc ? (tc.cooldownSeconds === undefined ? 60 : tc.cooldownSeconds) : 60;

  return [
    {
      icon: '✦',
      title: '積分怎麼拿',
      items: [
        '<strong>老師在課堂上發分</strong>。目前這個班的加分項目:' +
          `<div class="help-rules">${chips(plus)}</div>`,
        minus.length
          ? '也有扣分項目:' + `<div class="help-rules">${chips(minus)}</div>` +
            '扣分<strong>只扣可用積分</strong>,累積經驗不會減少,所以守護獸不會退化。'
          : '',
        '<strong>點名出席</strong>。老師按下發放出席分時,當天被記為出席的每人 +1。',
        '<strong>繳交作業</strong>。準時繳交拿該項作業設定的分數,遲交拿一半(無條件捨去)。',
        '<strong>線上測驗答對</strong>。得分 = 答對題數 × 每題分數,每題幾分由老師在建立測驗時決定,寫在測驗卡片上。',
        '如果是<strong>搶答類</strong>的測驗(逐題搶答、整份前幾名),只有排進名次的人拿得到分,其他人答對也沒有分 —— 卡片上會寫明。',
        '<strong>蜂巢戰紀不給個人積分</strong>。那裡的佔領分只用來搶地。'
      ].filter(Boolean)
    },
    {
      icon: '🐣',
      title: '守護獸的經驗怎麼來',
      items: [
        '守護獸吃的是<strong>累積經驗</strong>。你<strong>每拿到一分,經驗就 +1</strong>,' +
          '完全一樣的數字,不用另外做什麼去餵牠。',
        '會增加經驗的,就是下面這四種:' +
          '<div class="help-ways">' +
            '<div class="help-way"><b>老師發分</b>照上面那張表的項目,老師在課堂上按給你</div>' +
            '<div class="help-way"><b>點名出席</b>當天被記為出席,老師發放出席分時每人 +1</div>' +
            '<div class="help-way"><b>繳交作業</b>準時繳交拿該項作業的分數,遲交拿一半(無條件捨去)</div>' +
            '<div class="help-way"><b>測驗答對</b>答對題數 × 每題分數;搶答類要排進名次才有</div>' +
          '</div>',
        '<strong>蜂巢戰紀不會增加經驗。</strong>那裡答對拿到的是佔領分,只用來搶地,' +
          '跟守護獸和商店都沒有關係。',
        '<strong>被扣分不會減少經驗。</strong>扣分只扣可用積分,' +
          '所以守護獸<strong>只會前進、不會退化</strong>,換獎品也一樣。',
        '經驗累積到門檻就進化:' + `<div class="help-rules">${stages}</div>`,
        '進化不只是外觀變化 —— <strong>技能會跟著變強</strong>。' +
          '去兌換分頁買一顆<strong>技能果實</strong>就學得會,一個技能買一次就永久擁有;' +
          '買了之後每進化一階,同一個技能就更強(例如猛擊從佔領分 ×2 變成 ×3)。' +
          '技能次數<strong>每週一 00:00 回滿</strong>,用完就要等下週。',
        '守護獸的<strong>心情</strong>看的是「多久沒被加分」:超過 3 天會微恙、' +
          '超過 7 天會生病。被加分就會恢復。'
      ]
    },
    {
      icon: '✦',
      title: '守護獸技能',
      items: skillsOnForHelp() ? [
        '技能要<strong>去兌換分頁買「技能果實」</strong>才學得會,' +
          '一個技能<strong>買一次就永久擁有</strong>。',
        '買了之後,<strong>守護獸每進化一階,同一個技能就更強</strong> ——' +
          '所以進化不只是外觀變化,而是真的會讓你更強。',
        '每個技能有<strong>次數</strong>限制,<strong>每週一 00:00 回滿</strong>。' +
          '用完就要等下週,所以留在關鍵時刻用比較划算。',
        '目前的技能與各階段效果:' + skillTableForHelp(),
        '<strong>靈卵階段一個技能都不能用</strong> —— 先把守護獸養到幼獸(15 分)再說。'
      ] : [
        '老師還沒開啟這個功能。開啟之後,你可以用積分在兌換分頁買「技能果實」,' +
          '學會之後守護獸每進化一階,技能就會更強。'
      ]
    },
    {
      icon: '⬡',
      title: '蜂巢戰紀的計分規則',
      items: [
        '題目難度決定答對可得的<strong>佔領分</strong>:' + `<div class="help-rules">${diff}</div>`,
        tc && pen > 0
          ? `<strong>答錯會倒扣 ${pen} 佔領分</strong>` +
            (floor > 0 ? `,同一格最多扣到 <strong>−${floor} 分</strong>` : '(會扣成負分)') +
            '。時間到沒送出、或中途離開作答畫面,也算答錯一樣倒扣。' +
            '<strong>只扣你答錯的那一格</strong> —— 你同時在打的其他格子不會被扣。'
          : (tc ? '這一局<strong>答錯不倒扣</strong>,但機會一樣用掉。' : ''),
        tc && limit > 0
          ? `這一局每題<strong>限時 ${limit} 秒</strong>,點開題目就開始倒數。`
          : (tc ? '這一局<strong>不限時</strong>,想清楚再答。' : ''),
        '<strong>空白的地</strong>:累積到門檻分數就<strong>立刻插旗</strong>,不用等 —— 那塊地沒有人守。',
        '<strong>別組的地</strong>:打下去會進入<strong>交戰</strong>,在設定的秒數內分數最高、' +
          '且達到門檻的那一組才拿走。這段時間是留給對方反擊的。',
        '<strong>同一題答對一次就夠了</strong>,答對過的題目不會再出現(再答也不會再得分)。',
        weeklyOnForHelp()
          ? '<strong>每週一會依佔領的格數發獎</strong>:' + weeklyPrizeTextForHelp() +
            '。獎勵發給那一組的每一個人,會變成你的積分與守護獸經驗。' +
            '格數一樣多就同名次(都拿一樣的分)。'
          : '',
        '<strong>答錯可以再試這一題</strong>,但會先輪完其他沒做過的題目。' +
          '有倒扣的話,錯一次就扣一次 —— 用猜的划不來。',
        coolN > 0 && coolSec > 0
          ? `<strong>連續答錯 ${coolN} 題會冷卻 ${coolSec} 秒</strong>,這段時間不能出手。` +
            '<strong>答對一次就歸零</strong>,換題不算答錯 —— 認真讀題的人碰不到這條規則,' +
            '它是用來擋「不看題目一直猜」的。'
          : '',
        '<strong>遇到還沒教過的題目可以「換題」</strong>。換到的題目會<strong>降一個難度</strong>' +
          '(困難→普通→簡單),所以答對能拿的分數也跟著變少 —— 這就是換題的代價。' +
          '每次攻擊有換題次數上限,用完就沒了。換掉的題目<strong>不算答錯,不會倒扣</strong>。',
        tc ? '' : '老師可以設定每題的<strong>作答限時</strong>與<strong>答錯倒扣</strong>,' +
                   '開局時會寫在上面。',
        '老師開了<strong>嚴格作答</strong>的話,作答時會進入全螢幕,' +
          '<strong>離開全螢幕或切到別的分頁,這一題就作廢</strong>。點開題目前會先提醒你。',
        '只能打<strong>自己領地相鄰</strong>的格子,★ 基地不能被攻佔。'
      ]
    }
  ];
}

const HELP = {

  /* ---------- 學生端 ---------- */
  student: [
    {
      icon: '🔑',
      title: '怎麼進來',
      items: [
        '用<strong>學校發的 Google 帳號</strong>登入,不需要另外註冊。',
        '登入後會直接進到自己的班級,不用選班。',
        '如果看到「還沒有你的座位」,代表老師還沒把你的信箱加進名冊 —— 把畫面上的信箱念給老師聽就好。'
      ]
    },
    {
      icon: '🐻',
      title: '我的守護獸',
      items: [
        '守護獸會隨著你的積分成長:<strong>蛋 → 幼獸 → 成獸 → 守護神獸</strong>。',
        '畫面上有兩個數字,意思不一樣:<br>' +
          '<strong>累積經驗</strong> — 只會增加,決定守護獸進化到哪一階。<br>' +
          '<strong>可用積分</strong> — 拿去商店換東西會變少。',
        '所以<strong>換獎品不會讓守護獸退化</strong>,放心換。',
        '進化不只是外觀變化 —— <strong>你的技能會跟著一起變強</strong>。' +
          '同一個技能,幼獸用是 ×2,守護神獸用就是 ×3。',
        '守護獸的<strong>心情</strong>看的是「多久沒被加分」:超過 3 天會微恙、超過 7 天會生病。' +
          '被加分就會恢復。',
        '第一次進來如果還沒有守護獸,可以自己挑一隻。'
      ]
    },
    {
      icon: '🏆',
      title: '排行榜',
      items: [
        '會看到全班前三名的頒獎台,台子的高度是依照分數差距變的。',
        '不管第幾名,下面都看得到<strong>自己的名次</strong>。',
        '老師有分組的話,還會多一個小組排行榜。'
      ]
    },
    {
      icon: '✎',
      title: '測驗',
      items: [
        '有新測驗時,「測驗」分頁上會出現紅色數字。',
        '老師可能用三種計分方式,卡片上會寫明是哪一種:<br>' +
          '<strong>答對就得分</strong> — 照自己答對的題數拿分。<br>' +
          '<strong>逐題搶答</strong> — 一題一題往下答,<strong>每一題各自比快</strong>,每題最快答對的前幾名才有分。<br>' +
          '<strong>整份前幾名</strong> — 先比答對總題數,同分就比誰先交卷。',
        '<strong>逐題搶答送出後不能改,也不會馬上告訴你對不對</strong> —— 不然先答完的人就能把答案傳出去了。',
        '老師如果設了統一結算時間,交卷後會顯示「○/○ 公布」,到時間才會算分。',
        '成績公布後,卡片上會顯示你答對幾題、每一題的 ✓ ✗,逐題搶答還會標出那一題你是第幾個答對的。<strong>但看不到正確答案</strong>。',
        '買了技能果實的話,測驗卡片上會出現技能按鈕:<br>' +
          '<strong>📘 專注</strong> — 這份測驗的得分變好幾倍。<br>' +
          '<strong>🧷 保險</strong> — 搶分類測驗沒搶進名次時,照答對題數算的分數還是拿得到。<br>' +
          '<strong>🎀 送分</strong> — 這份直接多算一題答對。<br>' +
          '技能要<strong>在成績公布前</strong>用,用了就不能收回。'
      ]
    },
    {
      icon: '🎁',
      title: '兌換商店',
      items: [
        '用<strong>可用積分</strong>換老師上架的獎品。',
        '按下兌換只是送出申請,<strong>實際發放由老師確認</strong>,所以按了之後請等老師處理。',
        '點數不夠、獎品兌完、或已經送出申請的,按鈕會變灰色。',
        '架上如果有<strong>技能果實</strong>,那是用來學技能的 ——' +
          '一個技能買一次就永久擁有,卡片上會寫出守護獸各階段的效果。' +
          '已經買過的會標「已擁有」。',
        '學會<strong>🏷️ 議價</strong>之後,兌換時會問你要不要用 —— 用了那一次就打折。' +
          '(技能果實本身不給打折。)'
      ]
    },
    {
      icon: '⬡',
      title: '蜂巢戰紀',
      items: [
        '老師分好組、開始遊戲之後才會出現這個分頁。',
        '點地圖上<strong>亮起來(會呼吸)</strong>的格子就能攻擊 —— 只有自己領地旁邊的格子打得到。',
        '答對會累積<strong>佔領分</strong>,題目越難分數越高;累積到門檻那一格才會變成你們這組的。',
        '別組的格子也能搶。被攻擊的格子會進入<strong>交戰</strong>,時間內分數最高的那一組拿走。',
        '<strong>答對過的題目不會再出現</strong>(再答也不會再得分);' +
          '<strong>答錯的可以再挑戰同一題</strong>,但系統會先讓你輪完還沒做過的。',
        '老師可能會設<strong>答錯倒扣</strong>。倒扣<strong>只扣你答錯的那一格</strong>,' +
          '你同時在打的其他格子不會被扣,而且是答錯的當下就扣,不會延後才冒出來。',
        '<strong>連續答錯幾題會被罰等待</strong>(預設連錯 3 題等 60 秒)。' +
          '答對一次就歸零 —— 認真讀題的人碰不到這條規則,它是用來擋「不看題目一直猜」的。',
        '遇到<strong>還沒教過</strong>的題目可以<strong>換題</strong>。' +
          '換到的題目難度與分數都會降一階,這就是換題的代價。每次攻擊的換題次數有上限。',
        '老師如果開了<strong>嚴格作答</strong>,點開題目會進入全螢幕,' +
          '<strong>離開全螢幕或切到別的分頁,這一題就作廢</strong>。點開之前會先提醒你。',
        '學會技能的話,蜂巢戰紀裡可以用:<br>' +
          '<strong>⚔️ 猛擊</strong> — 開題前按,這一題答對的佔領分變好幾倍。<br>' +
          '<strong>🛡️ 護盾</strong> — 答錯之後在提示框裡按,擋掉那一次的倒扣。<br>' +
          '<strong>🌀 靜心</strong> — 被罰等待時按,立刻就能再出手。<br>' +
          '<strong>✋ 巧手</strong> — 攻打時按,這一次可以多換幾題。',
        '每個選項的<strong>順序每次都不一樣</strong> —— 所以「那題選 B」這種話沒有用,' +
          '要真的看懂題目才答得對。',
        '找不到自己的領地?按右上角的<strong>「⌖ 回到我的領地」</strong>。地圖可以用 ＋ － 縮放,按「整張」看全貌。',
        '灰色斜線是還沒開放的區域,★ 是各組基地(不能被攻佔)。'
      ]
    },
    {
      icon: '?',
      title: '遇到問題',
      items: [
        '<strong>看不到測驗或蜂巢戰紀</strong> — 老師還沒開放,或蜂巢戰紀還沒分組。',
        '<strong>積分沒有增加</strong> — 測驗要等老師結算,或等統一結算時間到。',
        '<strong>技能按下去說用不了</strong> — 可能是這週的次數用完了、守護獸還不夠強,' +
          '或是老師那邊的技能表還沒更新(請老師開一下系統)。',
        '<strong>買了果實卻不能用</strong> — 看一下守護獸是第幾階。' +
          '靈卵一個技能都不能用,有些技能要成獸或守護神獸才解鎖。',
        '<strong>技能次數什麼時候回來</strong> — 每週一 00:00。守護獸分頁上會寫還有幾天。',
        '<strong>畫面怪怪的</strong> — 先按右上角「重新整理」;還是不行就告訴老師。'
      ]
    }
  ],

  /* ---------- 老師端 ---------- */
  teacher: [
    {
      icon: '▸',
      title: '開始之前',
      items: [
        '<strong>老師身分只能在 Firebase Console 指定</strong>:Firestore → <code>users</code> 集合 → 找到自己那份文件 → 把 <code>role</code> 改成 <code>teacher</code>。系統裡沒有「我是老師」的選項,否則任何人登入都能建班級。',
        '建好班級後,到<strong>設定 → 學生管理</strong>匯入名單。Excel 欄位是「座號 / 姓名 / Google信箱」。',
        '<strong>信箱一定要填</strong>,那是學生登入的依據。沒信箱的學生只能由你在後台操作。',
        '手動編輯名單時,一行一位,格式 <code>座號,姓名,信箱</code>(逗號、頓號、Tab、空白都可以)。只打姓名的那一行不會動到原本的座號與信箱。'
      ]
    },
    {
      icon: '✦',
      title: '發放積分',
      items: [
        '老師後台左邊點學生 → 右邊按規則按鈕即可發分,也可以自訂分數(可正可負)。',
        '<strong>批次加分 / 小組加分</strong>:按名單右上角的「批次加分」,名單會變成可勾選。' +
          '上面有各組的快捷鍵,按一下整組勾起來(再按一次取消)。勾好之後照常按積分規則,' +
          '一次套用到所有人。',
        '勾選的人剛好等於某一組時,歷程紀錄會寫成「舉手發言(第 2 組)」,事後看得出來是小組加的。',
        '批次發分後提示會出現<strong>「復原」</strong>,按錯可以整批還原 —— 一次改 28 個人,' +
          '沒有退路的話只能一個一個補回去。',
        '正分會同時加到<strong>累積經驗</strong>(決定守護獸進化)和<strong>可用積分</strong>(商店消費);扣分只扣可用積分,<strong>守護獸不會退化</strong>。',
        '積分規則可以在「積分規則」分頁自己改。'
      ]
    },
    {
      icon: '✎',
      title: '線上測驗',
      items: [
        '在「作業測驗」建立測驗。可以手動加題,也可以按<strong>「📊 從 Excel 建立」</strong>一次把整份測驗連同題目建好(測驗名稱留空就用檔名)。不確定格式先按「範本」下載。',
        '三種計分方式:<strong>答對就得分</strong>(回家作業、每週小考)、<strong>逐題搶答</strong>(每題各自比快,課堂搶答用)、<strong>整份前幾名</strong>。',
        '<strong>統一結算時間</strong>:填了之後,時間到之前只記錄交卷順序、不批改也不發分;時間一到你一開系統就一次算完並公布。搶答建議填,名次一次算完最穩。不想等就按「提前結算」。',
        '開放作答後,卡片下方有<strong>即時作答概況</strong>:綠=已交卷、黃=作答中(顯示答到第幾題)、灰=還沒開始,逐題搶答另有每題的作答人數長條。',
        '沒設結算時間的話,按<strong>「收回成績」</strong>結算。重複按不會重複加分。'
      ]
    },
    {
      icon: '⬡',
      title: '蜂巢戰紀',
      items: [
        '順序是:<strong>先分組 → 匯入題庫 → 開始遊戲</strong>。沒分組不會出現這個功能。',
        '題庫在「蜂巢戰紀 → 題庫」,一樣可以用 Excel 匯入。<strong>題目和答案事先設定好</strong>,誰先答對由系統依伺服器時間判定,你不用當裁判。',
        '地圖有 8 種形狀 × 5 種尺寸,最大 2000 格以上。難度決定佔領分(簡單 1 / 普通 2 / 困難 3),累積到門檻才拿下該格。',
        '<strong>遊戲中可以改設定</strong>:狀態列的「調整設定」能改門檻、爭奪時間、每題限時、' +
          '答錯倒扣、連錯冷卻與嚴格作答,不用重開一局。門檻那幾項會影響整場重算,' +
          '所以套用前系統會先把目前地圖鎖成快照 —— 已經打下來的地不會被吐回去。',
        '<strong>空白地塊達到門檻就立刻佔領</strong>,不用等爭奪時間 —— 計時是給「搶別組的地」' +
          '用的,雙方才有攻防的機會。',
        '<strong>換題</strong>(預設每次攻擊 3 次):學生遇到還沒教到的單元可以換一題,' +
          '換到的難度降一階、分數也降一階,代價內建在規則裡,所以不另外處罰。' +
          '換掉的那題不算答錯、不會倒扣。設 0 就是不開放換題。',
        '<strong>守護獸技能</strong>(預設關閉,在<strong>「設定」</strong>頁開):' +
          '學生花積分在商店買「技能果實」學技能,一個技能買一次就永久擁有,' +
          '之後<strong>守護獸每進化一階,同一個技能就更強</strong> —— ' +
          '所以養獸的動力會延續,不會進化完就沒事做。技能分成蜂巢戰紀、測驗、商店三類,' +
          '次數<strong>每週一 00:00 歸零</strong>。次數與強度都由安全規則把關,學生改前端沒有用。',
        '開啟之後記得按<strong>「上架技能果實」</strong>,八顆果實才會出現在商店裡。' +
          '價格之後可以在「商店任務」頁自己改 —— 原則是「存一兩週買得起一顆」,' +
          '太便宜會一次買完就沒有取捨了。',
        '技能表、各階效果、這一季誰用了什麼,都在設定頁那個面板上看得到。',
        '授權表(誰這週幾次、多強)是你的電腦算好寫上去的,所以<strong>每週一換季之後' +
          '要開一下系統</strong>,學生的次數才會刷新。正常上課日一定會開,實務上不是問題;' +
          '學生說「技能用不了」時,先想到這件事。',
        '<strong>每週結算獎勵</strong>(在戰況地圖頁下方開啟):每週一依佔領格數發獎,' +
          '預設第一名 +5、第二名 +3、第三名 +1,發給那一組的每一位成員。' +
          '<strong>同分同名次</strong>(兩組並列第一就都拿第一名的分,然後跳過第二名)。' +
          '一週只結算一次,重新整理或換裝置都不會重複發;' +
          '<strong>週一開一下系統就會補發上週的</strong>,不必剛好在午夜掛著。',
        '<strong>選項順序每次隨機</strong>:題庫再大也擋不住「那題選 B」口耳相傳,' +
          '因為學生記的是位置不是內容。打亂之後,知道答案的人也要重新看過選項。',
        '<strong>連錯冷卻</strong>(預設連錯 3 題 → 冷卻 60 秒):專治亂猜。答對一次就歸零,' +
          '換題不算答錯,所以正常作答的學生碰不到。這條由安全規則強制 —— ' +
          '每筆作答紀錄都接在前一筆後面(編號連號、不准修改),學生重新整理或換裝置都躲不掉。' +
          '把題數或秒數設 0 就是關掉。',
        '<strong>倒扣只扣那一格</strong>:學生答錯是扣他當下攻打的那一塊地,' +
          '同組同時在打的其他地塊不受影響。扣分也發生在答錯的那一刻,不會延後浮現。',
        '<strong>防作弊</strong>:同一題每人只能「答對」一次(背答案也刷不了分),' +
          '答錯可以再試但會倒扣(會扣成負分,可設下限,例如最多扣到 -6)、' +
          '作答限時(伺服器強制,<strong>設 0 就是不限時</strong> —— 班上有讀題慢的學生時可以關掉,' +
          '防作弊主要還是靠嚴格作答)。',
        '<strong>嚴格作答</strong>(預設開啟):學生作答時進入全螢幕,' +
          '<strong>離開全螢幕或切到別的分頁就作廢</strong>。這是針對「複製題目、開新分頁問 AI」' +
          '那條路。題目與選項也禁止選取複製。',
        '擋不住的:用另一支手機拍螢幕。網頁偵測不到也擋不了作業系統的截圖,' +
          '說能防住的都是假的。對付那個只能把限時壓短(例如 20~30 秒),讓他來不及查。',
        '<strong>階段性開放</strong>:從各組基地往外一圈一圈開放,也可以進編輯模式框選格子手動開放或封鎖。',
        '地圖不是存檔,是由所有作答事件重播還原的,所以每台裝置看到的一致。事件多了狀態列會出現<strong>「壓縮戰況」</strong>,按下去把目前局面存成快照、載入會變快 —— 但清掉紀錄等於舊題目重新開放,壓縮前先換一批新題目。'
      ]
    },
    {
      icon: '🎁',
      title: '獎品商店',
      items: [
        '在「商店任務 → 獎品管理」自己上架獎品、訂點數與庫存(庫存留空=不限)。',
        '學生按兌換只是送出申請,<strong>扣點在你這邊執行</strong>,學生改不了點數。',
        '「兌換紀錄」可以標記已發放,或退還點數。'
      ]
    },
    {
      icon: '⌗',
      title: '班級管理與課堂工具',
      items: [
        '<strong>座位表</strong>:拖曳學生到座位,可以隨機填入,也能存成多張座位表切換。',
        '<strong>分組</strong>:隨機或手動,存起來之後學生端會出現小組排行榜,蜂巢戰紀也要靠它。',
        '<strong>課堂工具</strong>:點名、抽籤機(可優先抽久沒被關注的)、計時器(可全螢幕投影)。',
        '<strong>投影模式</strong>:大屏顯示全班守護獸,發分時有動畫。'
      ]
    },
    {
      icon: '☁',
      title: '多班級與資料安全',
      items: [
        '右上角的下拉選單切換班級,最後一項「管理班級…」可以新增或刪除班級。切換時畫面中央會顯示進度。',
        '<strong>每天第一次開啟某個班級</strong>,系統會自動留一份當天的快照,保留最近 30 份。',
        '<strong>設定 → 資料備份</strong>可以看清單、還原到某一天,也能下載完整備份到自己電腦。還原前系統會先把現況另存一份。',
        '學生的交卷、逐題作答、蜂巢戰紀紀錄是各自獨立存放的,任何更新都不會覆蓋。',
        '建議學期中<strong>偶爾按一次「下載完整備份」</strong>,手上有一份檔案最實在。'
      ]
    }
  ]
};

/* 規則在前、操作在後:學生最想知道的是「怎麼拿分」 */
/* 技能有沒有開。說明要跟著實際設定走,不然會教到不存在的功能。 */
/* 每週結算有沒有開、發幾分。說明要跟著實際設定走。 */
function weeklyOnForHelp() {
  if (typeof TerritoryWeekly === 'undefined') return false;
  return !!TerritoryWeekly.cfg().enabled;
}

function weeklyPrizeTextForHelp() {
  const p = TerritoryWeekly.cfg().prizes;
  return `第一名 +${p[0]}、第二名 +${p[1]}、第三名 +${p[2]} 分`;
}

function skillsOnForHelp() {
  if (typeof SkillEngine === 'undefined') return false;
  // 學生端讀 StudentApp.classSkills,老師端讀 state.skills
  const cfg = (typeof StudentApp !== 'undefined' && StudentApp.classSkills)
    || (typeof state !== 'undefined' && state.skills) || null;
  return !!SkillEngine.cfg(cfg).enabled;
}

/* 四階效果表。寫死一份文件會跟程式脫節,所以直接從 PET_SKILLS 產生。 */
function skillTableForHelp() {
  if (typeof PET_SKILLS === 'undefined') return '';
  return `
    <div class="help-skill-table">
      <div class="help-skill-row is-head">
        <span>技能</span>
        ${STAGE_NAMES.map(n => `<span>${n}</span>`).join('')}
      </div>
      ${PET_SKILLS.map(sk => `
        <div class="help-skill-row">
          <span class="help-skill-name">${sk.icon} ${escapeHtml(sk.name)}
            <small>${SKILL_AREAS[sk.area].name}</small></span>
          ${sk.levels.map(lv => `<span class="${lv.n > 0 ? '' : 'is-off'}">${
            lv.n > 0 ? escapeHtml(lv.text).replace(',每週 ', '<br>每週 ') : '—'
          }</span>`).join('')}
        </div>`).join('')}
    </div>`;
}

/* ============================================
   說明的分類
   ────────────────────────────────────────────
   說明有十幾段,一次全部攤出來沒有人會看 ——
   試過排成多欄,結果段落被切得七零八落,閱讀順序還會在欄位間跳來跳去,
   反而更難找。改成「上面一排分類,點了只看那一類」。

   分類用標題對應,而不是在每一段裡加欄位 ——
   這樣改分類不用動到內容,也不會有人加了新段落卻忘記標分類
   (沒對應到的會自動歸到最後一類,不會憑空消失)。
============================================ */
const HELP_GROUPS = {
  student: [
    { key: 'start',  icon: '🔑', name: '開始',   titles: ['怎麼進來'] },
    { key: 'points', icon: '✦',  name: '積分',   titles: ['積分怎麼拿', '守護獸的經驗怎麼來'] },
    { key: 'pet',    icon: '🐣', name: '守護獸', titles: ['我的守護獸', '守護獸技能'] },
    { key: 'quiz',   icon: '✎',  name: '測驗',   titles: ['測驗'] },
    { key: 'shop',   icon: '🎁', name: '兌換',   titles: ['兌換商店'] },
    { key: 'war',    icon: '⬡',  name: '蜂巢戰紀', titles: ['蜂巢戰紀', '蜂巢戰紀的計分規則'] },
    { key: 'rank',   icon: '🏆', name: '排行榜', titles: ['排行榜'] },
    { key: 'help',   icon: '?',  name: '問題',   titles: ['遇到問題'] }
  ],
  teacher: [
    { key: 'start',  icon: '🔑', name: '開始之前', titles: ['開始之前'] },
    { key: 'points', icon: '✦',  name: '積分規則', titles: ['積分怎麼拿', '守護獸的經驗怎麼來', '發放積分'] },
    { key: 'pet',    icon: '🐣', name: '守護獸技能', titles: ['守護獸技能'] },
    { key: 'quiz',   icon: '✎',  name: '測驗',     titles: ['線上測驗'] },
    { key: 'war',    icon: '⬡',  name: '蜂巢戰紀',   titles: ['蜂巢戰紀', '蜂巢戰紀的計分規則'] },
    { key: 'shop',   icon: '🎁', name: '商店',     titles: ['獎品商店'] },
    { key: 'class',  icon: '☰',  name: '班級管理', titles: ['班級管理與課堂工具'] },
    { key: 'safe',   icon: '🛡', name: '資料安全', titles: ['多班級與資料安全'] }
  ]
};

function renderHelpFull(which, rules) {
  const all = [...helpRuleSections(rules), ...HELP[which]]
    .map(sec => ({ ...sec, items: sec.items.filter(Boolean) }))
    .filter(sec => sec.items.length > 0);

  /* 段落順序照分類裡 titles 的順序排,而不是照 all 的原始順序 ——
     否則「規則」那幾段會一律排到前面,變成先講技能表再講「我的守護獸是什麼」。 */
  const groups = (HELP_GROUPS[which] || []).map(g => ({
    ...g,
    secs: g.titles
      .map(t => all.find(sec => sec.title === t))
      .filter(Boolean)
  }));

  // 沒被分到類的段落(例如之後新增卻忘了標)丟進「其他」,不要讓它憑空消失
  const taken = new Set(groups.flatMap(g => g.secs.map(s => s.title)));
  const rest = all.filter(sec => !taken.has(sec.title));
  if (rest.length) groups.push({ key: 'other', icon: '•', name: '其他', secs: rest });

  const live = groups.filter(g => g.secs.length > 0);
  if (live.length === 0) return '';

  return `
    <nav class="help-nav" role="tablist">
      ${live.map((g, i) => `
        <button class="help-nav-btn ${i === 0 ? 'active' : ''}"
                role="tab" data-help-nav="${g.key}"
                onclick="setHelpGroup('${g.key}')">
          <span class="help-nav-icon">${g.icon}</span>${escapeHtml(g.name)}
        </button>`).join('')}
    </nav>
    ${live.map((g, i) => `
      <div class="help-group ${i === 0 ? 'active' : ''}" data-help-group="${g.key}">
        ${renderHelpSections(g.secs)}
      </div>`).join('')}`;
}

/* 切換分類。直接改 class 而不是重繪整個畫面 ——
   重繪會把學生捲到的位置、正在作答的狀態一起打掉。 */
function setHelpGroup(key) {
  document.querySelectorAll('[data-help-nav]').forEach(b =>
    b.classList.toggle('active', b.dataset.helpNav === key));
  document.querySelectorAll('[data-help-group]').forEach(d =>
    d.classList.toggle('active', d.dataset.helpGroup === key));
  // 切到比較長的分類時,從頭開始看
  const main = document.querySelector('.student-main') || document.querySelector('.view.active');
  if (main) main.scrollTop = 0;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderHelpSections(list) {
  return list.map(sec => `
    <section class="help-sec">
      <h3 class="help-sec-title"><span class="help-icon">${sec.icon}</span>${escapeHtml(sec.title)}</h3>
      <ul class="help-list">
        ${sec.items.map(i => `<li>${i}</li>`).join('')}
      </ul>
    </section>`).join('');
}

/* 老師端的「使用說明」分頁 */
function renderHelpView() {
  const active = document.querySelector('#helpView .sub-tab.active');
  const which = active ? active.dataset.subtab : 'helpTeacher';
  const el = document.getElementById(which === 'helpStudent' ? 'helpStudentBody' : 'helpTeacherBody');
  if (!el || el.dataset.done) return;
  el.innerHTML = which === 'helpStudent'
    ? renderHelpFull('student', state.rules)
    : renderHelpSections(HELP.teacher) + renderHelpSections(helpRuleSections(state.rules));
  el.dataset.done = '1';
}
