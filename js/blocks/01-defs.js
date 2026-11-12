/* ============================================
   積木冒險 — 積木的定義
   ────────────────────────────────────────────
   老師教 micro:bit 時最卡的一關不是「認不認得積木」,而是
   **拼不起來**:知道有「當搖動時」和「改變變數」,但不知道誰包誰、
   誰先誰後。這個模式就是給那一關練的:

     老師出一段功能敘述(例:做一個計步器,搖一下步數加一,A+B 歸零),
     學生在這裡把積木拼出來,系統**把程式真的跑一遍**,
     用「跑出來的行為對不對」來判對錯。

   ── 為什麼是比對行為,不是比對積木 ──
   同一個功能有很多種拼法:顯示可以放在事件裡,也可以放在「重複無限次」
   裡面;歸零可以用「設為 0」也可以用「改變 -目前值」。
   比對積木的話,只有老師那一種寫法會被判對,其他正確的解法都會被判錯,
   孩子會覺得「我明明做出來了」—— 那比沒有這個功能更傷。

   所以判斷的依據只有一個:**螢幕上看到的東西**(數字、文字、圖案)。
   變數叫什麼名字、用幾塊積木、放在哪個事件裡,都不影響。

   ── 積木的表示法 ──
   一塊積木就是一個物件,body 是包在它裡面的那一疊:

     { t: 'on_shake', body: [ { t: 'change_var', name: 's', v: {t:'num', v:1} } ] }

   運算式也是積木(num / var / op / cmp …),所以整支程式就是一棵樹。
   這份檔案只定義「有哪些積木、長什麼樣子」,怎麼跑在 02-vm.js。
============================================ */

/* 積木的分類。
   **名稱、順序、顏色都照 MakeCode 的** —— 孩子在這裡練完直接回去用
   真的 MakeCode,看到的要是同一套東西。顏色不一樣的話,他在腦袋裡
   建立的「藍色是基本、紅色是變數」會在兩邊打架。

   顏色取自 pxt-microbit 的 pxtarget.json。
   「事件」不是 MakeCode 的分類:當啟動時與重複無限次屬於**基本**,
   當按鈕被按下、當搖動屬於**輸入** —— 這裡也照搬。

   音效 / LED / 廣播目前還沒有積木,所以不會出現在面板上
   (列出來卻點不到更糟)。之後補上時把 cat 填進去就會自己出現。 */
const BLOCK_CATS = [
  { id: 'basic', name: '基本', color: '#1E90FF' },
  { id: 'input', name: '輸入', color: '#D400D4' },
  { id: 'music', name: '音效', color: '#D83B01' },
  { id: 'led',   name: 'LED',  color: '#5C2D91' },
  { id: 'radio', name: '廣播', color: '#E3008C' },
  { id: 'loop',  name: '迴圈', color: '#00A000' },
  { id: 'logic', name: '邏輯', color: '#00A4A6' },
  { id: 'var',   name: '變數', color: '#E63022' },
  { id: 'math',  name: '數學', color: '#712672' }
];

/* 每一塊積木:
     t      類型(存檔用的代號,不要改,改了舊題目會壞)
     cat    分類
     label  顯示的樣子。${x} 是參數的插槽
     args   參數:name=代號, type=插槽型別, def=預設值
              num    數字(可以塞運算式積木)
              bool   真假(可以塞比較/邏輯積木)
              text   文字
              pick   從 options 挑一個(下拉,不是插槽)
              var    變數名稱(下拉)
              leds   5×5 的圖案
     body   true=裡面可以疊別的積木(事件、迴圈、如果)
     else   true=有「否則」那一格
     kind   'event' 最外層的帽子 | 'stmt' 一般指令 | 'expr' 運算式
   ──
   刻意只做老師真的會教的那一組(大約 20 塊)。積木一多,
   小學生在面板上找不到東西,反而更難拼。 */
/* 姿勢的名稱照 MakeCode 的下拉選單。
   舊資料用的是「搖動 / 朝上 / 朝下」,載入時會換成新的(見 migrateProgram)
   —— 名字不一樣的話,孩子在這裡學會的詞回到 MakeCode 就對不上。 */
const GESTURES = ['晃動', '螢幕朝上', '螢幕朝下', 'logo朝上', 'logo朝下'];

const GESTURE_ALIAS = { '搖動': '晃動', '朝上': '螢幕朝上', '朝下': '螢幕朝下' };

/* 音高。MakeCode 的下拉其實是一台鋼琴,這裡用名稱 ——
   名稱和它顯示的一樣,孩子回去用鋼琴選也對得起來。 */
const NOTES = ['低音 C', '低音 G', '中音 C', '中音 D', '中音 E', '中音 F',
               '中音 G', '中音 A', '中音 B', '高音 C', '高音 E', '高音 G'];

const NOTE_HZ = {
  '低音 C': 131, '低音 G': 196, '中音 C': 262, '中音 D': 294, '中音 E': 330,
  '中音 F': 349, '中音 G': 392, '中音 A': 440, '中音 B': 494,
  '高音 C': 523, '高音 E': 659, '高音 G': 784
};

const BEATS = ['1 拍', '1/2 拍', '1/4 拍', '2 拍', '4 拍'];

const BEAT_VALUE = { '1 拍': 1, '1/2 拍': 0.5, '1/4 拍': 0.25, '2 拍': 2, '4 拍': 4 };

/* micro:bit 內建的那幾首(V2)。照 MakeCode 下拉裡的順序與名稱。 */
const MELODIES = ['喀喀笑', '快樂', '你好', '神秘', '悲傷', '滑翔',
                  '飛翔', '春天', '閃爍', '打哈欠'];

/* 內建旋律在模擬器上的樣子。
   不是真的那幾首(那是 micro:bit 韌體裡的),是一段聽得出區別的短句 ——
   孩子要的是「我選的和剛才那首不一樣」,不是音樂考試。 */
const MELODY_NOTES = {
  '喀喀笑': [523, 587, 659, 587, 523],
  '快樂':   [523, 523, 587, 523, 698, 659],
  '你好':   [392, 523, 659],
  '神秘':   [330, 349, 392, 349, 311],
  '悲傷':   [392, 349, 330, 294],
  '滑翔':   [659, 587, 523, 494, 440],
  '飛翔':   [440, 523, 659, 784],
  '春天':   [523, 587, 659, 698, 784],
  '閃爍':   [784, 988, 784, 988],
  '打哈欠': [294, 330, 294, 262]
};

/* 箭頭的 LED 圖樣,照 MakeCode 的 ArrowNames */
const LED_ARROWS = {
  '北':   '0010001110101010010000100',
  '東北': '0011100011001010100010000',
  '東':   '0010000010111110001000100',
  '東南': '1000001000001011000111110',
  '南':   '0010000100101010111000100',
  '西南': '0000100010101010110011100',
  '西':   '0010001000111110100000100',
  '西北': '1110011000101000001000001'
};

const BLOCK_DEFS = [
  /* ---------- 基本 ----------
     順序照 MakeCode:顯示數字 → 顯示 LED → 顯示圖示 → 顯示文字 → 清空畫面
     → 重複無限次 → 當啟動時 → 暫停 */
  { t: 'show_number', cat: 'basic', kind: 'stmt', label: '顯示 數字 ${v}',
    args: [{ name: 'v', type: 'num', def: 0 }] },
  { t: 'show_leds',   cat: 'basic', kind: 'stmt', label: '顯示 指示燈 ${grid}',
    args: [{ name: 'grid', type: 'leds', def: '0000000000000000000000000' }] },
  { t: 'show_icon',   cat: 'basic', kind: 'stmt', label: '顯示 圖示 ${icon}',
    args: [{ name: 'icon', type: 'icon', def: '愛心' }] },
  { t: 'show_string', cat: 'basic', kind: 'stmt', label: '顯示 文字 ${v}',
    args: [{ name: 'v', type: 'text', def: 'Hello!' }] },
  { t: 'clear',       cat: 'basic', kind: 'stmt', label: '清空 畫面' },
  { t: 'forever',     cat: 'basic', kind: 'event', body: true, label: '重複無限次' },
  { t: 'on_start',    cat: 'basic', kind: 'event', body: true, label: '當啟動時' },
  { t: 'pause',       cat: 'basic', kind: 'stmt', label: '暫停 ${ms} 毫秒',
    args: [{ name: 'ms', type: 'num', def: 100 }] },
  { t: 'show_arrow',  cat: 'basic', kind: 'stmt', label: '顯示 箭頭 ${dir}',
    args: [{ name: 'dir', type: 'pick', def: '北',
             options: ['北', '東北', '東', '東南', '南', '西南', '西', '西北'] }] },

  /* ---------- 輸入 ---------- */
  { t: 'on_button',  cat: 'input', kind: 'event', body: true,
    label: '當按鈕 ${btn} 被按下',
    args: [{ name: 'btn', type: 'pick', options: ['A', 'B', 'A+B'], def: 'A' }] },
  { t: 'on_gesture', cat: 'input', kind: 'event', body: true,
    label: '當姿勢 ${g} 發生',
    args: [{ name: 'g', type: 'pick', options: GESTURES, def: '晃動' }] },
  { t: 'on_pin',     cat: 'input', kind: 'event', body: true,
    label: '當引腳 ${pin} 被按下',
    args: [{ name: 'pin', type: 'pick', options: ['P0', 'P1', 'P2'], def: 'P0' }] },
  { t: 'btn_down', ret: 'bool', cat: 'input', kind: 'expr', label: '按鈕 ${btn} 被按下?',
    args: [{ name: 'btn', type: 'pick', options: ['A', 'B'], def: 'A' }] },
  { t: 'pin_down', ret: 'bool', cat: 'input', kind: 'expr', label: '引腳 ${pin} 被按下?',
    args: [{ name: 'pin', type: 'pick', options: ['P0', 'P1', 'P2'], def: 'P0' }] },
  { t: 'is_gesture', ret: 'bool', cat: 'input', kind: 'expr', label: '姿勢為 ${g} ?',
    args: [{ name: 'g', type: 'pick', options: GESTURES, def: '晃動' }] },

  /* ---------- 變數 ---------- */
  { t: 'set_var',    cat: 'var', kind: 'stmt', label: '變數 ${name} 設為 ${v}',
    args: [{ name: 'name', type: 'var', def: '' }, { name: 'v', type: 'num', def: 0 }] },
  { t: 'change_var', cat: 'var', kind: 'stmt', label: '變數 ${name} 改變 ${v}',
    args: [{ name: 'name', type: 'var', def: '' }, { name: 'v', type: 'num', def: 1 }] },
  { t: 'var',        cat: 'var', kind: 'expr', label: '${name}',
    args: [{ name: 'name', type: 'var', def: '' }] },

  /* ---------- 音效 ----------
     聲音也是「做出來的結果」,所以每一步發出了什麼音會記進行為裡,
     判題時和螢幕一起比(見 02-vm.js 的 ctx.sound)。 */
  { t: 'play_tone', cat: 'music', kind: 'stmt',
    label: 'play tone ${note} for ${beats} ${mode}',
    args: [{ name: 'note', type: 'pick', options: NOTES, def: '中音 C' },
           { name: 'beats', type: 'pick', options: BEATS, def: '1 拍' },
           { name: 'mode', type: 'pick', options: ['until done', '背景運行'],
             def: 'until done' }] },
  { t: 'ring_tone', cat: 'music', kind: 'stmt', label: '演奏 音階 ${note}',
    args: [{ name: 'note', type: 'pick', options: NOTES, def: '中音 C' }] },
  { t: 'rest', cat: 'music', kind: 'stmt', label: 'rest for ${beats}',
    args: [{ name: 'beats', type: 'pick', options: BEATS, def: '1 拍' }] },
  { t: 'play_sound', cat: 'music', kind: 'stmt', label: 'play ${name} ${mode}',
    args: [{ name: 'name', type: 'pick', options: MELODIES, def: '喀喀笑' },
           { name: 'mode', type: 'pick', options: ['until done', '背景運行'],
             def: 'until done' }] },
  { t: 'stop_sound', cat: 'music', kind: 'stmt', label: '停止播放所有音效' },
  { t: 'set_volume', cat: 'music', kind: 'stmt', label: '音量設為 ${v}',
    args: [{ name: 'v', type: 'num', def: 127 }] },
  { t: 'volume', cat: 'music', kind: 'expr', label: '音量' },
  { t: 'set_tempo', cat: 'music', kind: 'stmt', label: '演奏 速度設為 ${v} bpm',
    args: [{ name: 'v', type: 'num', def: 120 }] },
  { t: 'change_tempo', cat: 'music', kind: 'stmt', label: '演奏 速度改變 ${v} bpm',
    args: [{ name: 'v', type: 'num', def: 20 }] },
  { t: 'tempo', cat: 'music', kind: 'expr', label: '演奏速度 (bpm)' },

  /* ---------- LED ----------
     點亮 / 不點亮 / 切換 都是改同一塊 5×5 的畫面,
     所以它們和「顯示 指示燈」共用同一份資料(ctx.leds)。 */
  { t: 'plot', cat: 'led', kind: 'stmt', label: '點亮 x ${x} y ${y}',
    args: [{ name: 'x', type: 'num', def: 0 }, { name: 'y', type: 'num', def: 0 }] },
  { t: 'toggle_point', cat: 'led', kind: 'stmt', label: '點的狀態切換 x ${x} y ${y}',
    args: [{ name: 'x', type: 'num', def: 0 }, { name: 'y', type: 'num', def: 0 }] },
  { t: 'unplot', cat: 'led', kind: 'stmt', label: '不點亮 x ${x} y ${y}',
    args: [{ name: 'x', type: 'num', def: 0 }, { name: 'y', type: 'num', def: 0 }] },
  { t: 'point', ret: 'bool', cat: 'led', kind: 'expr', label: '點的狀態 x ${x} y ${y}',
    args: [{ name: 'x', type: 'num', def: 0 }, { name: 'y', type: 'num', def: 0 }] },
  { t: 'bar_graph', cat: 'led', kind: 'stmt', label: 'plot bar graph of ${v} up to ${hi}',
    args: [{ name: 'v', type: 'num', def: 0 }, { name: 'hi', type: 'num', def: 0 }] },

  /* ---------- 廣播 ----------
     一台 micro:bit **收不到自己發出去的廣播**,所以這一類要有
     兩台機器才有意義 —— 模擬器在用到廣播時會自己變成兩台(見 05-sim.js)。
     判題時由劇本送進「收到了什麼」,並且把**發出去的封包也記進行為裡**,
     所以「有沒有送對東西」也判得出來。 */
  { t: 'radio_group', cat: 'radio', kind: 'stmt', label: '廣播群組設為 ${n}',
    args: [{ name: 'n', type: 'num', def: 1 }] },
  { t: 'radio_number', cat: 'radio', kind: 'stmt', label: '廣播 發送數字 ${v}',
    args: [{ name: 'v', type: 'num', def: 0 }] },
  { t: 'radio_value', cat: 'radio', kind: 'stmt', label: '廣播 發送鍵值 ${name} = ${v}',
    args: [{ name: 'name', type: 'text', def: 'name' }, { name: 'v', type: 'num', def: 0 }] },
  { t: 'radio_string', cat: 'radio', kind: 'stmt', label: '廣播 發送文字 ${v}',
    args: [{ name: 'v', type: 'text', def: '' }] },
  { t: 'on_radio_number', cat: 'radio', kind: 'event', body: true,
    label: '當收到廣播數字 ${name}',
    args: [{ name: 'name', type: 'var', def: 'receivedNumber' }] },
  { t: 'on_radio_value', cat: 'radio', kind: 'event', body: true,
    label: '當收到廣播鍵值 ${key} 值 ${name}',
    args: [{ name: 'key', type: 'var', def: 'name' },
           { name: 'name', type: 'var', def: 'value' }] },
  { t: 'on_radio_string', cat: 'radio', kind: 'event', body: true,
    label: '當收到廣播文字 ${name}',
    args: [{ name: 'name', type: 'var', def: 'receivedString' }] },
  { t: 'radio_strength', cat: 'radio', kind: 'expr', label: '收到的封包 訊號強度' },

  /* ---------- 邏輯 ---------- */
  /* MakeCode 的面板上「如果」有兩塊:一塊只有「那麼」,一塊帶「否則」。
     這裡是同一種積木(t 都是 if),差別只在有沒有 elseBody ——
     有 ⊕ 可以後來再加上去,和 MakeCode 一樣。 */
  { t: 'if',    cat: 'logic', kind: 'stmt', body: true, else: true,
    label: '如果 ${cond} 那麼',
    args: [{ name: 'cond', type: 'bool', def: null }] },
  { t: 'if', variant: 'else', cat: 'logic', kind: 'stmt', body: true, else: true,
    label: '如果 ${cond} 那麼',
    args: [{ name: 'cond', type: 'bool', def: null }] },
  { t: 'not', ret: 'bool',   cat: 'logic', kind: 'expr', label: '${a} 不成立',
    args: [{ name: 'a', type: 'bool', def: null }] },
  { t: 'bool', ret: 'bool',  cat: 'logic', kind: 'expr', label: '${v}',
    args: [{ name: 'v', type: 'pick', options: ['true', 'false'], def: 'true' }] },
  { t: 'cmp', ret: 'bool',   cat: 'logic', kind: 'expr', label: '${a} ${op} ${b}',
    args: [{ name: 'a', type: 'num', def: 0 },
           { name: 'op', type: 'pick', options: ['=', '≠', '<', '≤', '>', '≥'], def: '=' },
           { name: 'b', type: 'num', def: 0 }] },
  { t: 'logic', ret: 'bool', cat: 'logic', kind: 'expr', label: '${a} ${op} ${b}',
    args: [{ name: 'a', type: 'bool', def: null },
           { name: 'op', type: 'pick', options: ['且', '或'], def: '且' },
           { name: 'b', type: 'bool', def: null }] },

  /* ---------- 迴圈 ---------- */
  { t: 'repeat', cat: 'loop', kind: 'stmt', body: true, label: '重複 ${n} 次',
    args: [{ name: 'n', type: 'num', def: 4 }] },
  { t: 'while',  cat: 'loop', kind: 'stmt', body: true, label: '重複 判斷 ${cond}',
    args: [{ name: 'cond', type: 'bool', def: null }] },
  { t: 'for',    cat: 'loop', kind: 'stmt', body: true, label: '計次 ${name} 從 0 到 ${to}',
    args: [{ name: 'name', type: 'var', def: 'index' }, { name: 'to', type: 'num', def: 4 }] },
  { t: 'wait_until', cat: 'loop', kind: 'stmt', label: '暫停直到 ${cond}',
    args: [{ name: 'cond', type: 'bool', def: null }] },
  { t: 'break',    cat: 'loop', kind: 'stmt', label: '跳出' },
  { t: 'continue', cat: 'loop', kind: 'stmt', label: '繼續' },

  /* ---------- 數學 ---------- */
  { t: 'num',    cat: 'math', kind: 'expr', label: '${v}',
    args: [{ name: 'v', type: 'rawnum', def: 0 }] },
  { t: 'op',     cat: 'math', kind: 'expr', label: '${a} ${op} ${b}',
    args: [{ name: 'a', type: 'num', def: 0 },
           { name: 'op', type: 'pick', options: ['+', '-', '×', '/'], def: '+' },
           { name: 'b', type: 'num', def: 0 }] },
  { t: 'mod',    cat: 'math', kind: 'expr', label: '餘數 ${a} / ${b}',
    args: [{ name: 'a', type: 'num', def: 0 }, { name: 'b', type: 'num', def: 1 }] },
  { t: 'minmax', cat: 'math', kind: 'expr', label: '${a} 和 ${b} 的 ${op}',
    args: [{ name: 'a', type: 'num', def: 0 }, { name: 'b', type: 'num', def: 0 },
           { name: 'op', type: 'pick', options: ['最小值', '最大值'], def: '最小值' }] },
  { t: 'abs',    cat: 'math', kind: 'expr', label: '${a} 的絕對值',
    args: [{ name: 'a', type: 'num', def: 0 }] },
  { t: 'sqrt',   cat: 'math', kind: 'expr', label: '${op} ${a}',
    args: [{ name: 'op', type: 'pick', options: ['平方根'], def: '平方根' },
           { name: 'a', type: 'num', def: 0 }] },
  { t: 'round',  cat: 'math', kind: 'expr', label: '${op} ${a}',
    args: [{ name: 'op', type: 'pick',
             options: ['四捨五入', '無條件捨去', '無條件進位'], def: '四捨五入' },
           { name: 'a', type: 'num', def: 0 }] },
  { t: 'random', cat: 'math', kind: 'expr', label: '隨機取數 ${from} 到 ${to}',
    args: [{ name: 'from', type: 'num', def: 0 }, { name: 'to', type: 'num', def: 10 }] },
  { t: 'constrain', cat: 'math', kind: 'expr',
    label: '制限 ${v} 最低 ${lo} 最高 ${hi}',
    args: [{ name: 'v', type: 'num', def: 0 }, { name: 'lo', type: 'num', def: 0 },
           { name: 'hi', type: 'num', def: 0 }] },
  { t: 'map',    cat: 'math', kind: 'expr',
    label: '對應 ${v} 從低 ${fl} 到高 ${fh} 至低 ${tl} 到高 ${th}',
    args: [{ name: 'v', type: 'num', def: 0 },
           { name: 'fl', type: 'num', def: 0 }, { name: 'fh', type: 'num', def: 1023 },
           { name: 'tl', type: 'num', def: 0 }, { name: 'th', type: 'num', def: 4 }] },
  { t: 'rand_bool', ret: 'bool', cat: 'math', kind: 'expr', label: '隨機取布林值' },
  { t: 'pi',     cat: 'math', kind: 'expr', label: 'π' }
];

/* 同一個 t 可能在面板上出現兩次(如果 / 如果-否則),
   查定義時一律用第一個 —— variant 只影響面板上多擺一塊。 */
const BLOCK_BY_T = {};
BLOCK_DEFS.forEach(d => { if (!BLOCK_BY_T[d.t]) BLOCK_BY_T[d.t] = d; });

/* 圖示對應到 5×5 的點陣。學生端與判斷都用同一份,
   所以「顯示圖示 愛心」和「顯示 LED(愛心的圖案)」會被判成同一件事 ——
   那本來就是同一個畫面。 */
/* 圖示。名稱與圖樣照 MakeCode 的 IconNames ——
   孩子在這裡選「鴨子」,回去用真的 MakeCode 也是「鴨子」。
   每一列五個字,由上往下五列。 */
const LED_ICONS = {
  '愛心':   '0101011111111110111000100',
  '小愛心': '0000001010011100010000000',
  '打勾':   '0000000001000101010001000',
  '打叉':   '1000101010001000101010001',
  '快樂':   '0000001010000001000101110',
  '傷心':   '0000001010000000111010001',
  '困惑':   '0000001010000000101010101',
  '生氣':   '1000101010000001111110101',
  '睡著':   '0000011011000000111000000',
  '驚訝':   '0101000000001000101000100',
  '傻傻的': '1000100000111110010100111',
  '極好':   '1111111011000000101001110',
  '無聊':   '0101000000000010001000100',
  'T恤':    '1101111111011100111001110',
  '溜冰鞋': '0001100011111111111101010',
  '鴨子':   '0110011100011110111000000',
  '房子':   '0010001110111110111001010',
  '烏龜':   '0000001110111110101000000',
  '蝴蝶':   '1101111111001001111111011',
  '火柴人': '0010011111001000101010001',
  '鬼':     '0111010101111111111110101',
  '劍':     '0010000100001000111000100',
  '長頸鹿': '1100001000010000111001010',
  '骷髏':   '0111010101111110111001110',
  '雨傘':   '0111011111001001010001100',
  '蛇':     '1100011011010100111000000',
  '箭頭上': '0010001110101010010000100',
  '箭頭下': '0010000100101010111000100'
};

/* 舊資料用的名字。改成 MakeCode 的講法之後要認得回去,
   否則老師出好的題目會變成一塊空白的畫面。 */
const ICON_ALIAS = { '笑臉': '快樂', '哭臉': '傷心' };

/* 面板上要列出來的順序(照 MakeCode 的圖示選單) */
const ICON_LIST = ['愛心', '小愛心', '快樂', '傷心', '困惑', '生氣', '睡著',
                   '驚訝', '傻傻的', '極好', '無聊', '打勾', '打叉',
                   'T恤', '溜冰鞋', '鴨子', '房子', '烏龜', '蝴蝶',
                   '火柴人', '鬼', '劍', '長頸鹿', '骷髏', '雨傘', '蛇',
                   '箭頭上', '箭頭下'];

/* 空的畫面 */
const LED_BLANK = '0'.repeat(25);

/* 取出一塊積木的定義;認不得的回傳 null(舊題目裡有被移除的積木時不要爆) */
function blockDef(t) {
  return BLOCK_BY_T[t] || null;
}

/* 這塊積木是不是「帽子」(只能放在最外層) */
/* ---------- 舊資料的名稱轉新的 ----------
   姿勢從「搖動 / 朝上 / 朝下」改成 MakeCode 的講法。
   已經出好的題目與學生交過的作品都要跟著換,否則事件會對不上
   ——「當姿勢 搖動 發生」在新的表裡根本不存在,那一段就不會被觸發。
   就地改,然後回傳同一棵樹。 */
function migrateProgram(list) {
  walkBlocks(list, b => {
    if (b.t === 'on_gesture' || b.t === 'is_gesture') {
      b.g = GESTURE_ALIAS[b.g] || b.g || '晃動';
    }
    if (b.t === 'show_icon') b.icon = ICON_ALIAS[b.icon] || b.icon || '愛心';
  });
  return list;
}

function isEventBlock(t) {
  const d = blockDef(t);
  return !!d && d.kind === 'event';
}

/* 走訪一棵程式樹,每一塊都叫一次 fn。
   找變數、算積木數量、檢查有沒有空插槽都靠它。 */
function walkBlocks(list, fn) {
  (list || []).forEach(b => {
    if (!b || typeof b !== 'object') return;
    fn(b);
    const d = blockDef(b.t);
    (d && d.args || []).forEach(a => {
      const v = b[a.name];
      if (v && typeof v === 'object' && v.t) walkBlocks([v], fn);
    });
    if (b.body) walkBlocks(b.body, fn);
    if (b.elseBody) walkBlocks(b.elseBody, fn);
  });
}

/* 程式裡用到的變數名稱 */
function blockVars(program) {
  const out = [];
  walkBlocks(program, b => {
    if ((b.t === 'set_var' || b.t === 'change_var' || b.t === 'var')
        && b.name && !out.includes(b.name)) out.push(b.name);
  });
  return out;
}

/* 幾塊積木(不含運算式裡的常數)—— 用來給「用最少積木完成」之類的提示 */
function blockCount(program) {
  let n = 0;
  walkBlocks(program, b => { if (b.t !== 'num') n++; });
  return n;
}
