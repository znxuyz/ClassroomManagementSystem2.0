/* ============================================
   積木挑戰 — 積木的定義
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

/* 積木的分類。顏色沿用 MakeCode 的分法,孩子在兩邊看到的是同一套顏色,
   不必重新學一次「哪一類是什麼顏色」。 */
const BLOCK_CATS = [
  { id: 'event',  name: '事件',   color: '#c9a227' },
  { id: 'basic',  name: '基本',   color: '#4c97ff' },
  { id: 'var',    name: '變數',   color: '#e8542f' },
  { id: 'logic',  name: '邏輯',   color: '#2eb886' },
  { id: 'loop',   name: '迴圈',   color: '#2e8fb8' },
  { id: 'math',   name: '數學',   color: '#7b61c4' },
  { id: 'input',  name: '輸入',   color: '#b86a2e' }
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
const BLOCK_DEFS = [
  /* ---------- 事件(帽子,只能放最外層) ---------- */
  { t: 'on_start',   cat: 'event', kind: 'event', body: true, label: '當啟動時' },
  { t: 'forever',    cat: 'event', kind: 'event', body: true, label: '重複無限次' },
  { t: 'on_button',  cat: 'event', kind: 'event', body: true,
    label: '當按鈕 ${btn} 被按下時',
    args: [{ name: 'btn', type: 'pick', options: ['A', 'B', 'A+B'], def: 'A' }] },
  { t: 'on_gesture', cat: 'event', kind: 'event', body: true,
    label: '當${g}時',
    args: [{ name: 'g', type: 'pick', options: ['搖動', '朝上', '朝下'], def: '搖動' }] },

  /* ---------- 基本 ---------- */
  { t: 'show_number', cat: 'basic', kind: 'stmt', label: '顯示數字 ${v}',
    args: [{ name: 'v', type: 'num', def: 0 }] },
  { t: 'show_string', cat: 'basic', kind: 'stmt', label: '顯示文字 ${v}',
    args: [{ name: 'v', type: 'text', def: 'Hello' }] },
  { t: 'show_icon',   cat: 'basic', kind: 'stmt', label: '顯示圖示 ${icon}',
    args: [{ name: 'icon', type: 'pick', def: '愛心',
             options: ['愛心', '笑臉', '哭臉', '打勾', '打叉', '箭頭上', '箭頭下'] }] },
  { t: 'show_leds',   cat: 'basic', kind: 'stmt', label: '顯示 LED ${grid}',
    args: [{ name: 'grid', type: 'leds', def: '0000000000011100000000000' }] },
  { t: 'clear',       cat: 'basic', kind: 'stmt', label: '清空畫面' },
  { t: 'pause',       cat: 'basic', kind: 'stmt', label: '暫停 ${ms} 毫秒',
    args: [{ name: 'ms', type: 'num', def: 500 }] },

  /* ---------- 變數 ---------- */
  { t: 'set_var',    cat: 'var', kind: 'stmt', label: '將 ${name} 設為 ${v}',
    args: [{ name: 'name', type: 'var', def: '' }, { name: 'v', type: 'num', def: 0 }] },
  { t: 'change_var', cat: 'var', kind: 'stmt', label: '改變 ${name} ${v}',
    args: [{ name: 'name', type: 'var', def: '' }, { name: 'v', type: 'num', def: 1 }] },
  { t: 'var',        cat: 'var', kind: 'expr', label: '${name}',
    args: [{ name: 'name', type: 'var', def: '' }] },

  /* ---------- 邏輯 ---------- */
  { t: 'if',    cat: 'logic', kind: 'stmt', body: true, else: true,
    label: '如果 ${cond} 那麼',
    args: [{ name: 'cond', type: 'bool', def: null }] },
  { t: 'cmp',   cat: 'logic', kind: 'expr', label: '${a} ${op} ${b}',
    args: [{ name: 'a', type: 'num', def: 0 },
           { name: 'op', type: 'pick', options: ['=', '≠', '<', '≤', '>', '≥'], def: '=' },
           { name: 'b', type: 'num', def: 0 }] },
  { t: 'logic', cat: 'logic', kind: 'expr', label: '${a} ${op} ${b}',
    args: [{ name: 'a', type: 'bool', def: null },
           { name: 'op', type: 'pick', options: ['且', '或'], def: '且' },
           { name: 'b', type: 'bool', def: null }] },

  /* ---------- 迴圈 ---------- */
  { t: 'repeat', cat: 'loop', kind: 'stmt', body: true, label: '重複 ${n} 次',
    args: [{ name: 'n', type: 'num', def: 4 }] },
  { t: 'while',  cat: 'loop', kind: 'stmt', body: true, label: '當 ${cond} 重複',
    args: [{ name: 'cond', type: 'bool', def: null }] },

  /* ---------- 數學 ---------- */
  { t: 'num',    cat: 'math', kind: 'expr', label: '${v}',
    args: [{ name: 'v', type: 'rawnum', def: 0 }] },
  { t: 'op',     cat: 'math', kind: 'expr', label: '${a} ${op} ${b}',
    args: [{ name: 'a', type: 'num', def: 0 },
           { name: 'op', type: 'pick', options: ['+', '−', '×', '÷'], def: '+' },
           { name: 'b', type: 'num', def: 0 }] },
  { t: 'random', cat: 'math', kind: 'expr', label: '隨機數 ${from} 到 ${to}',
    args: [{ name: 'from', type: 'num', def: 0 }, { name: 'to', type: 'num', def: 10 }] },

  /* ---------- 輸入 ---------- */
  { t: 'btn_down', cat: 'input', kind: 'expr', label: '按鈕 ${btn} 被按下',
    args: [{ name: 'btn', type: 'pick', options: ['A', 'B'], def: 'A' }] }
];

const BLOCK_BY_T = {};
BLOCK_DEFS.forEach(d => { BLOCK_BY_T[d.t] = d; });

/* 圖示對應到 5×5 的點陣。學生端與判斷都用同一份,
   所以「顯示圖示 愛心」和「顯示 LED(愛心的圖案)」會被判成同一件事 ——
   那本來就是同一個畫面。 */
const LED_ICONS = {
  '愛心':   '0101011111111110111000100',
  '笑臉':   '0101000000100010111000000',
  '哭臉':   '0101000000000000111001010',
  '打勾':   '0000000001000100101000010',
  '打叉':   '1000101010001000101010001',
  '箭頭上': '0010001110101010010000100',
  '箭頭下': '0010000100101010111000100'
};

/* 空的畫面 */
const LED_BLANK = '0'.repeat(25);

/* 取出一塊積木的定義;認不得的回傳 null(舊題目裡有被移除的積木時不要爆) */
function blockDef(t) {
  return BLOCK_BY_T[t] || null;
}

/* 這塊積木是不是「帽子」(只能放在最外層) */
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
