/* ============================================
   錄影用的班級資料
   ────────────────────────────────────────────
   刻意做得像真的一班:28 位、名字是常見的中文名、分數有高有低、
   有人久沒加分、有人還沒選守護獸、作業有人缺交。
   資料太整齊的話,示範影片看起來就像樣板,老師不會相信那是能用的東西。
============================================ */
window.__demoFixture = function () {
  const names = ['許伯瑋','蔡承恩','鄭宇盛','施易槐','葉柏陞','張舜程','林子皓','潘瑋廷',
    '謝晴雲','謝承樺','洪榆凱','謝睿宸','黃豐閎','伍宥橙','柯宜秀','吳姿昀','王若驊',
    '王莉琇','林昱辰','林芝伊','程品綺','陳靚瑀','黃苡安','柯芷榆','黃苡甄','謝宛芳',
    '謝筑芸','鄭茲云'];

  const f = window.__fixture({ students: names.length, historyPer: 12, questions: 24 });
  const now = Date.now();

  f.blob.className = '601';
  f.blob.teacherName = '蔡老師';
  f.blob.students.forEach((s, i) => {
    s.name = names[i];
    s.seatNumber = String(i + 1);
    s.totalPoints = 58 - i * 1.4 | 0;
    s.currentPoints = Math.max(4, (40 - i) | 0);
    // 有人剛加過分、有人很久沒被關注 —— 那一欄的標示才看得到
    s.lastPointTime = now - (i % 5 === 3 ? 6 : i % 7 === 5 ? 9 : 0) * 86400000;
  });
  f.blob.students[20].pet = null;            // 還沒選守護獸的那一位

  f.blob.currentGroups = [
    ['s0','s1','s2','s3'], ['s4','s5','s6','s7'], ['s8','s9','s10','s11'],
    ['s12','s13','s14','s15'], ['s16','s17','s18','s19'], ['s20','s21','s22','s23'],
    ['s24','s25','s26','s27']
  ];

  f.blob.rules = [
    { name: '上課專心', points: 1 }, { name: '舉手發言', points: 2 },
    { name: '完成作業', points: 2 }, { name: '主動幫助同學', points: 3 },
    { name: '閱讀心得分享', points: 5 }, { name: '小組合作優異', points: 3 },
    { name: '生活常規良好', points: 1 }, { name: '違反班規', points: -2 }
  ];

  f.blob.shopItems = [
    { id: 'i1', name: '免寫一次回家作業', icon: '📝', price: 30, stock: 3, active: true,
      description: '可以折抵一次回家作業,要事先跟老師說' },
    { id: 'i2', name: '和老師吃午餐', icon: '🍱', price: 50, stock: null, active: true },
    { id: 'i3', name: '守護獸改名卡', icon: '✎', price: 20, stock: null, active: true,
      description: '幫自己的守護獸換一個名字' },
    { id: 'i4', name: '班級小禮物', icon: '🎁', price: 15, stock: 5, active: true }
  ];

  f.blob.homework = [{
    id: 'h1', name: '數學習作 p.42-45', submissionPoints: 2,
    assignedDate: '2026-11-05', dueDate: '2026-11-12',
    submissions: { s0: { status: 'submitted' }, s1: { status: 'submitted' },
                   s2: { status: 'late' }, s3: { status: 'missing' },
                   s4: { status: 'submitted' }, s5: { status: 'submitted' } }
  }];

  f.blob.quizzes = [{
    id: 'q1', title: '第五課 生字與造詞', status: 'open',
    pointsPerQuestion: 2, scoreMode: 'correct',
    questions: [
      { id: 'a', text: '「蜿蜒」的意思最接近?', options: ['彎彎曲曲','又高又陡','寬闊平坦','模糊不清'], answer: 0 },
      { id: 'b', text: '下面哪一個詞是形容「很專心」?', options: ['心不在焉','全神貫注','手忙腳亂','東張西望'], answer: 1 }
    ]
  }];

  f.blob.attendance = {};

  const V = n => ({ t: 'var', name: n });
  f.blob.blockTasks = [
    { id: 'bt1', name: '開機打招呼', spec: '開機的時候顯示一顆愛心。', points: 3,
      status: 'open', createdAt: now,
      hints: ['「基本」那一類裡有一塊是「顯示圖示」'],
      solution: [{ t: 'on_start', body: [{ t: 'show_icon', icon: '愛心' }] }] },
    { id: 'bt2', name: '計步器', points: 5, status: 'open', createdAt: now,
      spec: '開機時步數歸零並顯示;搖一下步數加一並顯示;按 A+B 歸零。',
      hints: ['搖動的時候要讓步數變多 —— 「變數」那一類裡有一塊在做這件事',
              'A+B 要把步數變回 0'],
      solution: [
        { t: 'on_start', body: [{ t: 'set_var', name: '步數', v: 0 },
                                { t: 'show_number', v: V('步數') }] },
        { t: 'on_gesture', g: '搖動', body: [{ t: 'change_var', name: '步數', v: 1 },
                                             { t: 'show_number', v: V('步數') }] },
        { t: 'on_button', btn: 'A+B', body: [{ t: 'set_var', name: '步數', v: 0 },
                                             { t: 'show_number', v: V('步數') }] }] },
    { id: 'bt3', name: '骰子', spec: '搖一搖,出現 1 到 6 的隨機數字。', points: 5,
      status: 'open', createdAt: now,
      solution: [{ t: 'on_gesture', g: '搖動',
                   body: [{ t: 'show_number', v: { t: 'random', from: 1, to: 6 } }] }] },
    { id: 'bt4', name: '自由創作', spec: '做一個你自己想做的東西。', points: 3,
      status: 'open', free: true, createdAt: now,
      solution: [{ t: 'on_start', body: [{ t: 'show_string', v: 'HI' }] }] }
  ];

  return f;
};
