/* ============================================
   守護獸家具上架
   ────────────────────────────────────────────
   家具就是一般的兌換獎品,只是 id 有前綴 —— 所以申請、確認、扣點、
   進背包整條流程都沿用現成的,連安全規則都不必動。
   這和技能果實是同一套做法(見 js/skills/03-teacher.js),
   刻意保持一樣,不要為了「這是家具」另外長一套出來。

   家具本身長什麼樣子由 Blender 決定(tools/blender/room.py),
   名稱、說明、價格跟著算圖一起導出到 assets/room/items-data.js。
   所以要加一件新家具,是去改那支腳本重算,不是在這裡寫死。
============================================ */

const ROOM_ITEM_PREFIX = 'room_';

const RoomShop = {
  itemId(id) { return ROOM_ITEM_PREFIX + id; },

  rawId(itemId) {
    return (itemId && itemId.indexOf(ROOM_ITEM_PREFIX) === 0)
      ? itemId.slice(ROOM_ITEM_PREFIX.length) : null;
  },

  isFurniture(itemId) { return !!this.rawId(itemId); },

  catalog() {
    return (typeof window !== 'undefined' && window.PET_ROOM_ITEMS) || [];
  },

  /* 這位學生買了哪幾件(背包裡的家具) */
  owned(student) {
    return ((student && student.inventory) || [])
      .map(id => this.rawId(id))
      .filter(Boolean);
  },

  has(student, id) { return this.owned(student).includes(id); },

  /* 產生商店資料。星星價直接用算圖時導出來的那一份。 */
  shopItems() {
    return this.catalog().map(it => ({
      id: this.itemId(it.id),
      name: it.name,
      icon: '🪑',
      price: it.price,
      starPrice: it.star,
      starAuto: true,
      stock: null,              // 不限量:每個人本來就只能買一件
      description: it.desc + '\n\n買了之後可以在守護獸的房間裡自由擺放。',
      active: true,
      roomItem: it.id
    }));
  }
};


/* 老師按一次就全部上架。和技能果實同一套規則:
   已經上架過的只更新說明,價格沿用老師自己設的。 */
function listRoomItems() {
  const items = RoomShop.shopItems();
  if (!items.length) {
    toast('找不到家具資料 —— assets/room/items-data.js 還沒放進來');
    return;
  }
  const existing = new Set(state.shopItems.map(i => i.id));
  const added = [];
  const updated = [];

  items.forEach(f => {
    if (existing.has(f.id)) {
      const cur = state.shopItems.find(i => i.id === f.id);
      let touched = false;
      if (cur.description !== f.description) {
        cur.description = f.description;
        cur.roomItem = f.roomItem;
        touched = true;
      }
      /* 星星價只有「從來沒設過」才補。用 === undefined 而不是看真假值 ——
         老師把它設成 0 就是「這一件不收星星」,那是一個決定,不是沒填。 */
      if (cur.starPrice === undefined) {
        cur.starPrice = f.starPrice;
        cur.starAuto = true;
        touched = true;
      }
      if (touched) updated.push(f.name);
    } else {
      state.shopItems.push(f);
      added.push(f.name);
    }
  });

  save();
  renderAll();
  toast(added.length
    ? `🪑 已上架 ${added.length} 件家具`
    : updated.length ? `已更新 ${updated.length} 件家具的說明`
                     : '家具都已經在架上了');
}
