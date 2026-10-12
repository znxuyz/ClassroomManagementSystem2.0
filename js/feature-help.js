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
   刻意不寫死。老師改了積分規則、進化門檻或領地戰的難度分數之後,
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
        '<strong>領地戰不給個人積分</strong>。那裡的佔領分只用來搶地。'
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
        '<strong>領地戰不會增加經驗。</strong>那裡答對拿到的是佔領分,只用來搶地,' +
          '跟守護獸和商店都沒有關係。',
        '<strong>被扣分不會減少經驗。</strong>扣分只扣可用積分,' +
          '所以守護獸<strong>只會前進、不會退化</strong>,換獎品也一樣。',
        '經驗累積到門檻就進化:' + `<div class="help-rules">${stages}</div>`,
        '守護獸的<strong>心情</strong>看的是「多久沒被加分」:超過 3 天會微恙、' +
          '超過 7 天會生病。被加分就會恢復。'
      ]
    },
    {
      icon: '⬡',
      title: '領地戰的計分規則',
      items: [
        '題目難度決定答對可得的<strong>佔領分</strong>:' + `<div class="help-rules">${diff}</div>`,
        '<strong>空白的地</strong>:累積到門檻分數就<strong>立刻插旗</strong>,不用等 —— 那塊地沒有人守。',
        '<strong>別組的地</strong>:打下去會進入<strong>交戰</strong>,在設定的秒數內分數最高、' +
          '且達到門檻的那一組才拿走。這段時間是留給對方反擊的。',
        '<strong>每一題每個人只能答一次</strong>,而且點開題目的那一刻就記在伺服器上了 ——' +
          '重新整理、換電腦都一樣,答錯就是用掉一次機會。',
        '<strong>每題有作答限時</strong>,點開題目就開始倒數,時間到沒送出一樣算用掉。' +
          '所以先想好再點開。',
        '老師可以設定<strong>答錯倒扣佔領分</strong>,而且會扣成負分 —— 亂猜的話要先把洞補回來。' +
          '不過也有下限,不會無止境地扣下去。',
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
        '成績公布後,卡片上會顯示你答對幾題、每一題的 ✓ ✗,逐題搶答還會標出那一題你是第幾個答對的。<strong>但看不到正確答案</strong>。'
      ]
    },
    {
      icon: '🎁',
      title: '兌換商店',
      items: [
        '用<strong>可用積分</strong>換老師上架的獎品。',
        '按下兌換只是送出申請,<strong>實際發放由老師確認</strong>,所以按了之後請等老師處理。',
        '點數不夠、獎品兌完、或已經送出申請的,按鈕會變灰色。'
      ]
    },
    {
      icon: '⬡',
      title: '領地戰',
      items: [
        '老師分好組、開始遊戲之後才會出現這個分頁。',
        '點地圖上<strong>亮起來(會呼吸)</strong>的格子就能攻擊 —— 只有自己領地旁邊的格子打得到。',
        '答對會累積<strong>佔領分</strong>,題目越難分數越高;累積到門檻那一格才會變成你們這組的。',
        '別組的格子也能搶。被攻擊的格子會進入<strong>交戰</strong>,時間內分數最高的那一組拿走。',
        '每一題<strong>每個人只能答一次</strong>,答錯就換一格再試。',
        '找不到自己的領地?按右上角的<strong>「⌖ 回到我的領地」</strong>。地圖可以用 ＋ － 縮放,按「整張」看全貌。',
        '灰色斜線是還沒開放的區域,★ 是各組基地(不能被攻佔)。'
      ]
    },
    {
      icon: '?',
      title: '遇到問題',
      items: [
        '<strong>看不到測驗或領地戰</strong> — 老師還沒開放,或領地戰還沒分組。',
        '<strong>積分沒有增加</strong> — 測驗要等老師結算,或等統一結算時間到。',
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
      title: '領地佔領戰',
      items: [
        '順序是:<strong>先分組 → 匯入題庫 → 開始遊戲</strong>。沒分組不會出現這個功能。',
        '題庫在「領地戰 → 題庫」,一樣可以用 Excel 匯入。<strong>題目和答案事先設定好</strong>,誰先答對由系統依伺服器時間判定,你不用當裁判。',
        '地圖有 8 種形狀 × 5 種尺寸,最大 2000 格以上。難度決定佔領分(簡單 1 / 普通 2 / 困難 3),累積到門檻才拿下該格。',
        '<strong>遊戲中可以改設定</strong>:狀態列的「調整設定」能改門檻、爭奪時間、每題限時、' +
          '答錯倒扣與嚴格作答,不用重開一局。門檻那幾項會影響整場重算,' +
          '所以套用前系統會先把目前地圖鎖成快照 —— 已經打下來的地不會被吐回去。',
        '<strong>空白地塊達到門檻就立刻佔領</strong>,不用等爭奪時間 —— 計時是給「搶別組的地」' +
          '用的,雙方才有攻防的機會。',
        '<strong>防作弊</strong>:每題每人一次機會(點開題目就登記在伺服器,重新整理無效)、' +
          '答錯可倒扣(會扣成負分,但可以設下限,例如最多扣到 -6)、' +
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
        '<strong>分組</strong>:隨機或手動,存起來之後學生端會出現小組排行榜,領地戰也要靠它。',
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
        '學生的交卷、逐題作答、領地戰紀錄是各自獨立存放的,任何更新都不會覆蓋。',
        '建議學期中<strong>偶爾按一次「下載完整備份」</strong>,手上有一份檔案最實在。'
      ]
    }
  ]
};

/* 規則在前、操作在後:學生最想知道的是「怎麼拿分」 */
function renderHelpFull(which, rules) {
  return renderHelpSections(helpRuleSections(rules)) +
         renderHelpSections(HELP[which]);
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
