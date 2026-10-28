/* ============================================
   改名卡
   ────────────────────────────────────────────
   學生兌換一張改名卡,就能自己改一次守護獸的名字。

   這件事情有一個先天的限制:學生寫不了班級資料(那一份只有導師碰得到,
   見 js/03d-roster.js),所以改名不能由學生那一端直接寫。流程是

     學生 → petChoices/{uid} 寫入 { rename, renameAt }
     老師端(applyChoiceList)核對次數 → 真的改名字 → 扣掉一次

   次數記在老師這一端,所以「改前端把 renameLeft 改成 99」沒有用。
   這一套測的就是那個核對:一張卡只能改一次、退費要收回次數、
   名字不能無限長、同一筆請求不會被套用兩次。
============================================ */
import { loadPlaywright, openApp, prepare, report } from './lib.mjs';

const chromium = await loadPlaywright();
const { page, errors, close } = await openApp(chromium);
await prepare(page);

const lines = [];
const ok = (n, c, e) => lines.push((c ? '✓ ' : '✗ ') + n + (e ? ' — ' + e : ''));

const r = await page.evaluate(() => {
  const out = {};
  __apply(__fixture({ students: 3, historyPer: 2, questions: 4 }));

  // 預設商品清單裡要有改名卡 —— 老師不必自己打一次
  out.inStarter = STARTER_SHOP_ITEMS.some(i => i.id === RENAME_CARD_ID);

  // 上架一次就夠,按兩次不會變成兩張
  state.shopItems = [];
  addRenameCard(); addRenameCard();
  out.onShelf = state.shopItems.filter(i => i.id === RENAME_CARD_ID).length;

  const s = state.students[0];
  s.currentPoints = 1000;
  s.petName = '原本的名字';
  delete s.renameLeft;

  // 兌換 → 多一次改名機會
  const buy = () => PurchaseWatch.settle({
    id: 'p' + Math.random(), studentId: s.id, itemId: RENAME_CARD_ID
  });
  const first = buy();
  out.paid = first.result.status;
  out.leftAfterBuy = s.renameLeft;

  // 退費(寫回失敗的還原路徑)要把次數收回去
  const second = buy();
  second.revert();
  out.leftAfterRevert = s.renameLeft;

  // 套用學生送來的請求
  const at = Date.now();
  const applied = applyChoiceList([{ uid: 'u0', studentId: s.id, rename: '小火龍', renameAt: at }]);
  out.renamed = applied.renamed;
  out.name = s.petName;
  out.leftAfterRename = s.renameLeft;

  // 同一筆請求再送一次不會再扣(監聽每次重畫都會重送一遍)
  applyChoiceList([{ uid: 'u0', studentId: s.id, rename: '小火龍', renameAt: at }]);
  out.leftAfterReplay = s.renameLeft;

  // 沒有次數了,再送別的名字也不該生效
  const blocked = applyChoiceList([
    { uid: 'u0', studentId: s.id, rename: '偷改的', renameAt: at + 1 }
  ]);
  out.blocked = blocked.renamed;
  out.nameAfterBlocked = s.petName;

  // 名字太長要擋掉
  s.renameLeft = 1;
  applyChoiceList([
    { uid: 'u0', studentId: s.id, rename: '一'.repeat(PET_NAME_MAX + 1), renameAt: at + 2 }
  ]);
  out.tooLongName = s.petName;
  out.leftAfterTooLong = s.renameLeft;

  // 學生那一邊看得到還剩幾次(放在私有名冊,不是公開名冊)
  out.inPrivate = 'renameLeft' in Roster.privateEntry(s);
  out.notInPublic = !('renameLeft' in Roster.publicEntry(s));

  return out;
});

ok('改名卡在預設商品清單裡', r.inStarter);
ok('重複上架只會有一張', r.onShelf === 1, '架上 ' + r.onShelf + ' 張');
ok('兌換成功', r.paid === 'paid', r.paid);
ok('兌換後多一次改名機會', r.leftAfterBuy === 1, '剩 ' + r.leftAfterBuy);
ok('退費會把改名機會收回去', r.leftAfterRevert === 1, '剩 ' + r.leftAfterRevert);
ok('學生送的改名請求會被套用', r.renamed === 1 && r.name === '小火龍', r.name);
ok('改一次就扣掉一次', r.leftAfterRename === 0, '剩 ' + r.leftAfterRename);
ok('同一筆請求重送不會再扣', r.leftAfterReplay === 0, '剩 ' + r.leftAfterReplay);
ok('沒有改名卡就改不了名字', r.blocked === 0 && r.nameAfterBlocked === '小火龍',
   r.nameAfterBlocked);
ok(`名字超過上限字數會被擋掉`,
   r.tooLongName === '小火龍' && r.leftAfterTooLong === 1, r.tooLongName);
ok('剩餘次數只給本人看得到(在私有名冊、不在公開名冊)', r.inPrivate && r.notInPublic);

await close();
process.exit(report('改名卡', lines, errors) ? 0 : 1);
