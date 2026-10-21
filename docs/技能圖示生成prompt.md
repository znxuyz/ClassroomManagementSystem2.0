# 技能圖示 — 去背圖片生成 Prompt

八個技能各一張。目前系統用的是 emoji，換成圖片之後會更有「果實／技能」的質感。

## 怎麼用

1. 把下面每一段貼進圖片生成工具（Midjourney / DALL·E / Firefly / Imagen 都可以）
2. 存成 **PNG（透明背景）**，檔名照表格的「檔名」欄
3. 放到 `assets/skills/` 資料夾
4. 告訴我放好了，我把程式從 emoji 換成圖片（一行設定的事）

> **建議尺寸 1024×1024**，正方形。系統會縮到 26px～64px 顯示，所以**造型要夠簡單** ——
> 細節太多縮小後會糊成一團。

---

## 共用風格（每一段都已經含在裡面）

為了八張看起來像同一套，所有 prompt 都包含同一組風格描述：

- 半寫實的奇幻遊戲技能圖示
- 深色霓虹光暈 + 青藍／紫色的極光色調（對應系統的介面配色）
- 厚實的圓潤輪廓、柔和的內發光
- **透明背景、沒有外框、沒有文字**
- 置中、留一點邊距

---

## ⚔️ 猛擊（war_power）

**檔名：`power.png`**

```
A fantasy game skill icon of a glowing crystal fist striking forward with a burst of
impact energy, semi-realistic 3D render, deep teal and violet aurora color palette,
soft neon rim light, thick rounded silhouette, gentle inner glow, centered composition
with small margin, transparent background, no frame, no border, no text, no watermark,
clean icon art suitable for small sizes, 1024x1024, PNG with alpha channel
```

---

## 🛡️ 護盾（war_shield）

**檔名：`shield.png`**

```
A fantasy game skill icon of a translucent hexagonal energy shield with a soft ripple
of deflected light across its surface, semi-realistic 3D render, deep teal and violet
aurora color palette, soft neon rim light, thick rounded silhouette, gentle inner glow,
centered composition with small margin, transparent background, no frame, no border,
no text, no watermark, clean icon art suitable for small sizes, 1024x1024, PNG with
alpha channel
```

---

## 🌀 靜心（war_focus）

**檔名：`focus.png`**

```
A fantasy game skill icon of a calm glowing spiral vortex with a single bright point
at its center, like a meditating mind, semi-realistic 3D render, deep teal and violet
aurora color palette, soft neon rim light, thick rounded silhouette, gentle inner glow,
centered composition with small margin, transparent background, no frame, no border,
no text, no watermark, clean icon art suitable for small sizes, 1024x1024, PNG with
alpha channel
```

---

## ✋ 巧手（war_hand）

**檔名：`hand.png`**

```
A fantasy game skill icon of an open glowing hand shuffling three floating cards or
runestones above the palm, semi-realistic 3D render, deep teal and violet aurora color
palette, soft neon rim light, thick rounded silhouette, gentle inner glow, centered
composition with small margin, transparent background, no frame, no border, no text,
no watermark, clean icon art suitable for small sizes, 1024x1024, PNG with alpha channel
```

---

## 📘 專注（quiz_double）

**檔名：`double.png`**

```
A fantasy game skill icon of an open glowing book with a bright double-chevron of light
rising from its pages, semi-realistic 3D render, deep teal and violet aurora color
palette, soft neon rim light, thick rounded silhouette, gentle inner glow, centered
composition with small margin, transparent background, no frame, no border, no text,
no watermark, clean icon art suitable for small sizes, 1024x1024, PNG with alpha channel
```

---

## 🧷 保險（quiz_insure）

**檔名：`insure.png`**

```
A fantasy game skill icon of a glowing safety net woven from light, catching a single
falling star, semi-realistic 3D render, deep teal and violet aurora color palette, soft
neon rim light, thick rounded silhouette, gentle inner glow, centered composition with
small margin, transparent background, no frame, no border, no text, no watermark, clean
icon art suitable for small sizes, 1024x1024, PNG with alpha channel
```

---

## 🎀 送分（quiz_gift）

**檔名：`gift.png`**

```
A fantasy game skill icon of a small glowing gift ribbon bow releasing a sparkling
checkmark of light, semi-realistic 3D render, deep teal and violet aurora color palette,
soft neon rim light, thick rounded silhouette, gentle inner glow, centered composition
with small margin, transparent background, no frame, no border, no text, no watermark,
clean icon art suitable for small sizes, 1024x1024, PNG with alpha channel
```

---

## 🏷️ 議價（shop_discount）

**檔名：`discount.png`**

```
A fantasy game skill icon of a glowing price tag with a soft downward arrow of light
beside it, semi-realistic 3D render, deep teal and violet aurora color palette, soft
neon rim light, thick rounded silhouette, gentle inner glow, centered composition with
small margin, transparent background, no frame, no border, no text, no watermark, clean
icon art suitable for small sizes, 1024x1024, PNG with alpha channel
```

---

## 如果生出來不理想

常見狀況與加句：

| 問題 | 在 prompt 最後加上 |
| --- | --- |
| 背景不是透明的 | `isolated on pure transparent background, cutout, no backdrop, no scenery` |
| 有多餘的外框或底板 | `no circular badge, no plate, no background shape, icon only` |
| 細節太多、縮小看不清 | `minimal detail, bold simple shapes, high contrast, readable at 32 pixels` |
| 顏色跟系統不搭 | 把 `deep teal and violet` 換成你想要的色，八張要一起換才會整套一致 |
| 畫出文字或數字 | `absolutely no letters, no numbers, no typography` |

> **Midjourney 使用者**：結尾改加 `--style raw --ar 1:1 --no background, text, frame`。
> 它不會輸出透明背景，所以請用純白或純洋紅底再去背。

---

## 果實版本（選配）

如果你想讓「技能果實」在商店裡長得像果實，而不是直接用技能圖示，
把上面每一段的主體換成果實造型，其餘不變。範例（猛擊果實）：

```
A fantasy game item icon of a glowing crystalline fruit with a faint fist-shaped emblem
inside its translucent flesh, a single leaf on top, semi-realistic 3D render, deep teal
and violet aurora color palette, soft neon rim light, thick rounded silhouette, gentle
inner glow, centered composition with small margin, transparent background, no frame,
no border, no text, no watermark, clean icon art suitable for small sizes, 1024x1024,
PNG with alpha channel
```

其餘七顆把 `fist-shaped emblem` 換成：
`shield-shaped emblem`（護盾）、`spiral emblem`（靜心）、`open hand emblem`（巧手）、
`book emblem`（專注）、`net emblem`（保險）、`ribbon emblem`（送分）、
`price tag emblem`（議價）。
