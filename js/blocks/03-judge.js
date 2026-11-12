/* ============================================
   積木冒險 — 判對錯
   ────────────────────────────────────────────
   判的依據是「功能有沒有做出來」,不是「積木有沒有排得和老師一樣」。
   做法:

     1. 老師自己拼一份參考解答(他本來就要示範一次)
     2. 系統依照解答用到的事件,自動排一齣劇本
        (開機 → 搖三下 → 按 A+B → 再搖一下 …)
     3. 參考解答跑一遍,錄下每一步之後螢幕上的樣子
     4. 學生的程式跑同一齣劇本,兩邊的畫面要一樣

   所以「搖動裡面顯示」和「重複無限次裡面顯示」會被判成同一件事 ——
   因為孩子真的看到的東西一樣。變數叫 steps 還是 步數 也不影響。

   ── 失敗時要講人話 ──
   「第 3 步不符」沒有用。要講成:
     「搖第二下之後,螢幕上應該是 2,但你的程式顯示 1」
   小學生才知道下一步要改哪裡。
============================================ */

const BlockJudge = {
  /* ---------- 自動排劇本 ----------
     依照參考解答用到的事件決定要測什麼。老師不必自己想測試案例 ——
     他只要把答案拼出來。 */
  scriptFor(solution) {
    migrateProgram(solution || []);
    const used = { start: false, forever: false, btn: {}, gesture: {}, pin: {}, radio: {} };
    (solution || []).forEach(b => {
      if (!b) return;
      if (b.t === 'on_start') used.start = true;
      if (b.t === 'forever') used.forever = true;
      if (b.t === 'on_button') used.btn[b.btn || 'A'] = true;
      if (b.t === 'on_gesture') used.gesture[b.g || '晃動'] = true;
      if (b.t === 'on_pin') used.pin[b.pin || 'P0'] = true;
      if (b.t === 'on_radio_number') used.radio.number = true;
      if (b.t === 'on_radio_string') used.radio.string = true;
      if (b.t === 'on_radio_value') used.radio.value = true;
    });

    const script = [{ do: 'start', label: '開機' }];

    /* 每一種事件各做幾次 —— 做兩次以上才看得出「有沒有累加」,
       只做一次的話「設為 1」和「加 1」會長得一模一樣。 */
    Object.keys(used.gesture).forEach(g => {
      for (let i = 1; i <= 3; i++) {
        script.push({ do: 'gesture', g, label: g + '第 ' + i + ' 次' });
      }
    });
    Object.keys(used.pin).forEach(pin => {
      for (let i = 1; i <= 2; i++) {
        script.push({ do: 'pin', pin, label: '碰 ' + pin + ' 第 ' + i + ' 次' });
      }
    });
    /* 收到廣播。送幾個不一樣的值進去,才看得出他是「照收到的做」
       還是「不管收到什麼都做同一件事」。 */
    if (used.radio.number) {
      [1, 2, 7].forEach(v => script.push(
        { do: 'radio', kind: 'number', value: v, label: '收到廣播數字 ' + v }));
    }
    if (used.radio.string) {
      ['A', 'B'].forEach(v => script.push(
        { do: 'radio', kind: 'string', value: v, label: '收到廣播文字 ' + v }));
    }
    if (used.radio.value) {
      [['name', 1], ['name', 5]].forEach(([k, v]) => script.push(
        { do: 'radio', kind: 'value', key: k, value: v,
          label: '收到廣播鍵值 ' + k + ' = ' + v }));
    }
    Object.keys(used.btn).forEach(btn => {
      script.push({ do: 'press', btn, label: '按下 ' + btn });
    });
    /* 按過之後再觸發一次,檢查「歸零之後還能不能繼續算」——
       很多人的歸零會把事件也弄壞 */
    Object.keys(used.gesture).forEach(g => {
      script.push({ do: 'gesture', g, label: '(歸零後)' + g + '一次' });
    });
    Object.keys(used.pin).forEach(pin => {
      script.push({ do: 'pin', pin, label: '(歸零後)碰 ' + pin + '一次' });
    });
    Object.keys(used.btn).forEach(btn => {
      script.push({ do: 'press', btn, label: '再按一次 ' + btn });
    });

    if (script.length === 1 && used.forever) {
      script.push({ do: 'wait', label: '等一下下' });
    }
    return script;
  },

  /* ---------- 先看拼得完不完整 ----------
     還沒跑就看得出來的問題,直接講,不要讓他等到判完才知道。 */
  precheck(program) {
    if (!program || program.length === 0) {
      return '工作區是空的 —— 先從左邊拉一塊「當啟動時」之類的事件積木進來。';
    }
    const strays = program.filter(b => b && !isEventBlock(b.t));
    if (strays.length) {
      return '最外層只能放事件積木(當啟動時、當按鈕被按下時…)。'
           + '其他積木要放在事件**裡面**才會被執行。';
    }
    let emptyEvent = null, emptySlot = null;
    program.forEach(b => {
      if (!(b.body || []).length && b.t !== 'on_start') emptyEvent = emptyEvent || b;
    });
    walkBlocks(program, b => {
      const d = blockDef(b.t);
      (d && d.args || []).forEach(a => {
        if ((a.type === 'num' || a.type === 'bool') && (b[a.name] === null || b[a.name] === undefined)) {
          emptySlot = emptySlot || b;
        }
        if (a.type === 'var' && !b[a.name]) emptySlot = emptySlot || b;
      });
    });
    if (emptySlot) {
      return '有積木的空格還沒填(淡色的那幾格)—— 填完才跑得起來。';
    }
    if (emptyEvent) {
      const d = blockDef(emptyEvent.t);
      return '「' + (d ? d.label.replace(/\$\{\w+\}/g, '…') + '」裡面是空的,'
                       : '有一個事件裡面是空的,')
           + '要放東西進去才會做事。';
    }
    return null;
  },

  /* ---------- 把題目「編譯」成一份考卷 ----------
     考卷 = 劇本 + 參考解答在那齣劇本下的行為。

     這一步在**老師端**做,然後只把考卷發給學生 ——
     參考解答本身不會送到學生那邊(送了就等於把答案附在題目裡,
     打開開發者工具就看得到)。
     而學生拿著考卷就能在自己的裝置上立刻知道對不對,
     不必等老師按什麼 —— 即時回饋是這種練習最重要的一件事。 */
  compile(task) {
    const script = (task.script && task.script.length)
      ? task.script : this.scriptFor(task.solution);
    const run = BlockVM.runScript(task.solution || [], script);
    if (run.error) return { script, expect: null, error: run.error };
    return { script, expect: run.trace, error: null };
  },

  /* 用考卷判一份作品 */
  runCompiled(paper, program) {
    if (!paper || paper.error || !paper.expect) {
      return { pass: false, steps: [], error: (paper && paper.error) || null, badTask: true };
    }
    const got = BlockVM.runScript(program || [], paper.script);
    if (got.error) return { pass: false, steps: [], error: got.error };

    const steps = paper.script.map((s, i) => {
      const a = paper.expect[i] || {}, b = got.trace[i] || {};
      return {
        label: s.label || ('第 ' + (i + 1) + ' 步'),
        ok: this.sameStep(a, b),
        expect: a.screen, got: b.screen,
        expectFrames: a.frames || [], gotFrames: b.frames || [],
        expectSent: a.sent || [], gotSent: b.sent || [],
        expectSound: a.sound || [], gotSound: b.sound || []
      };
    });
    const firstFail = steps.findIndex(s => !s.ok);
    return { pass: firstFail < 0, steps, firstFail, error: null };
  },

  /* 老師端的捷徑:直接用題目判(會先編譯一次) */
  run(task, program) {
    return this.runCompiled(this.compile(task), program);
  },

  /* 一個步驟算不算一樣。
     看兩件事:這一步中間閃過哪些畫面、以及最後停在哪一張。
     只比「最後那一張」的話,會把「會閃爍的」和「不會閃的」判成一樣。 */
  sameStep(a, b) {
    if (!BlockVM.screenEq(a.screen, b.screen)) return false;
    /* 發出去的廣播也算「做出來的結果」—— 只看螢幕的話,
       「該廣播卻沒廣播」會被判成對的,那一題就等於沒在考廣播。 */
    const pk = list => (list || []).map(p =>
      p.kind + ':' + (p.key || '') + ':' + p.value + '@' + p.group).join('|');
    if (pk(a.sent) !== pk(b.sent)) return false;
    /* 聲音同理:一首用聲音做出來的題目,只比螢幕等於沒在判。 */
    const sd = list => (list || []).map(p =>
      p.kind + ':' + (p.note || p.name || '') + ':' + (p.beats || '')).join('|');
    if (sd(a.sound) !== sd(b.sound)) return false;
    const fa = (a.frames || []).map(f => f.kind + ':' + f.value).join('|');
    const fb = (b.frames || []).map(f => f.kind + ':' + f.value).join('|');
    return fa === fb;
  },

  /* ---------- 講人話 ---------- */
  explain(result) {
    if (result.error) {
      return result.error.message;
    }
    if (result.pass) return '每一步都和老師的答案做出一樣的結果,過關!';

    const s = result.steps[result.firstFail];
    if (!s) return '還沒通過,再檢查看看。';

    /* 廣播沒送對的時候,講廣播 —— 螢幕一樣但廣播不一樣的話,
       只講螢幕會讓孩子完全找不到問題在哪。 */
    const sayPk = list => (list || []).length
      ? (list || []).map(p => p.kind === 'string' ? '文字「' + p.value + '」'
          : p.kind === 'value' ? '鍵值 ' + p.key + ' = ' + p.value
          : '數字 ' + p.value).join('、')
      : '什麼都沒廣播';
    const ea = sayPk(s.expectSent), ga = sayPk(s.gotSent);
    if (ea !== ga) {
      return `「${s.label}」的時候,應該廣播${ea},但你的程式${ga}。`;
    }

    const saySound = list => (list || []).length
      ? (list || []).map(p => p.kind === 'melody' ? '「' + p.name + '」'
          : p.kind === 'rest' ? '休息 ' + p.beats + ' 拍'
          : p.kind === 'stop' ? '停止播放'
          : p.note + ' ' + p.beats + ' 拍').join('、')
      : '沒有發出聲音';
    const eb = saySound(s.expectSound), gb = saySound(s.gotSound);
    if (eb !== gb) {
      return `「${s.label}」的時候,應該播${eb},但你的程式${gb}。`;
    }

    const want = BlockVM.describeScreen(s.expect);
    const got  = BlockVM.describeScreen(s.got);
    if (want === got) {
      // 最後停的畫面一樣,是中間閃過的不一樣
      return `「${s.label}」的時候,畫面變化的過程和預期的不一樣 ——`
           + `檢查看看是不是多顯示了或少顯示了什麼。`;
    }
    return `「${s.label}」之後,螢幕上應該是 ${want},但你的程式是 ${got}。`;
  },

  /* 過了幾步 —— 用來顯示進度條,讓孩子知道自己已經對了一半 */
  score(result) {
    const n = (result.steps || []).length;
    if (!n) return 0;
    return Math.round(result.steps.filter(s => s.ok).length / n * 100);
  }
};
