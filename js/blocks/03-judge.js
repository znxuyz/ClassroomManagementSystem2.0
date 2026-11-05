/* ============================================
   積木挑戰 — 判對錯
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
    const used = { start: false, forever: false, btn: {}, gesture: {} };
    (solution || []).forEach(b => {
      if (!b) return;
      if (b.t === 'on_start') used.start = true;
      if (b.t === 'forever') used.forever = true;
      if (b.t === 'on_button') used.btn[b.btn || 'A'] = true;
      if (b.t === 'on_gesture') used.gesture[b.g || '搖動'] = true;
    });

    const script = [{ do: 'start', label: '開機' }];

    /* 每一種事件各做幾次 —— 做兩次以上才看得出「有沒有累加」,
       只做一次的話「設為 1」和「加 1」會長得一模一樣。 */
    Object.keys(used.gesture).forEach(g => {
      for (let i = 1; i <= 3; i++) {
        script.push({ do: g === '搖動' ? 'shake' : 'gesture', g,
                      label: g + '第 ' + i + ' 次' });
      }
    });
    Object.keys(used.btn).forEach(btn => {
      script.push({ do: 'press', btn, label: '按下 ' + btn });
    });
    /* 按過之後再觸發一次,檢查「歸零之後還能不能繼續算」——
       很多人的歸零會把事件也弄壞 */
    Object.keys(used.gesture).forEach(g => {
      script.push({ do: g === '搖動' ? 'shake' : 'gesture', g,
                    label: '(歸零後)' + g + '一次' });
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

  /* ---------- 判 ----------
     task = { solution, script }
     回傳 { pass, steps:[{label, ok, expect, got}], firstFail, error, note } */
  run(task, program) {
    const script = (task.script && task.script.length)
      ? task.script : this.scriptFor(task.solution);

    const want = BlockVM.runScript(task.solution || [], script);
    if (want.error) {
      // 參考解答自己就跑不動 —— 這是老師的題目有問題,要讓老師看到
      return { pass: false, steps: [], error: want.error, badTask: true };
    }

    const got = BlockVM.runScript(program || [], script);
    if (got.error) {
      return { pass: false, steps: [], error: got.error };
    }

    const steps = script.map((s, i) => {
      const a = want.trace[i] || {}, b = got.trace[i] || {};
      return {
        label: s.label || ('第 ' + (i + 1) + ' 步'),
        ok: this.sameStep(a, b),
        expect: a.screen, got: b.screen,
        expectFrames: a.frames || [], gotFrames: b.frames || []
      };
    });

    const firstFail = steps.findIndex(s => !s.ok);
    return { pass: firstFail < 0, steps, firstFail, error: null };
  },

  /* 一個步驟算不算一樣。
     看兩件事:這一步中間閃過哪些畫面、以及最後停在哪一張。
     只比「最後那一張」的話,會把「會閃爍的」和「不會閃的」判成一樣。 */
  sameStep(a, b) {
    if (!BlockVM.screenEq(a.screen, b.screen)) return false;
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
