# 技能圖示 — 生成 Prompt（綠幕版）

八個技能各一張。

## 為什麼改成綠幕

第一版叫 AI「輸出透明背景」，結果它**把透明示意用的棋盤格當成背景畫進圖裡** ——
檔案完全不透明，邊緣是兩種灰交替。那種圖只能用猜的去背，格子交界還會留下格線。

改成**綠幕**：指定一個主體絕對不會用到的背景色，去背就從「猜」變成「算」。

為什麼選純綠 `#00FF00`：拿你那八張圖的 80 萬個主體像素實測，
離純綠最近的也差了 **124**（其他候選只有 54～96）—— margin 最大，誤殺機率最低。

---

## 怎麼用

1. 把下面每一段貼進圖片生成工具（Midjourney / DALL·E / Firefly / Imagen 都可以）
2. **不用自己去背**，直接存原圖，檔名照每段標的「檔名」
3. 全部丟進一個資料夾，執行：

```bash
python3 tools/clean-icon.py 你的資料夾/ -o assets/skill/ --key 00ff00 --core
```

4. 推上 GitHub（或把原圖丟給我，我跑完再放進去）

> **建議尺寸 1024×1024**，正方形。系統會縮到 26px～64px 顯示，所以**造型要夠簡單** ——
> 細節太多縮小後會糊成一團。

---

## 共用規格（每一段都已經含在裡面）

**背景**
- 純綠 `#00FF00` 平塗，完全均勻
- 不要漸層、不要暗角、不要在背景上留陰影或光暈
- **不要畫棋盤格**（這是第一版踩到的坑）

**主體**
- 半寫實的奇幻遊戲技能圖示
- 青藍／紫色的霓虹色調（對應系統配色）
- 厚實的圓潤輪廓、柔和的內發光
- **不要用任何綠色或螢光黃綠** ← 這條是為了保住去背的 margin
- **主體必須懸空漂在綠底上** ← 不要任何底板、卡牌、徽章、圓角方塊
- 不要外框、不要文字、不要外圈封閉的光暈輪廓

> **外框由程式畫,不要畫進圖裡。**
> 實測 AI 不太遵守 `no frame`:同一批生出來的,有的帶深色圓角底板、
> 有的沒有,八張不可能一致。所以外框統一由 CSS 畫 ——
> 不管你生出來長怎樣,系統顯示時都是同一個外框、同一個尺寸、同一個圓角。
> 你只要確保**主體本身乾淨地浮在綠底上**就好。

---

## ⚔️ 猛擊（war_power）

**檔名：`power.png`**

```
A fantasy game skill icon of a glowing crystal fist striking forward with a burst of
impact energy. Semi-realistic 3D render, deep teal-blue and violet neon palette, soft
rim light, thick rounded silhouette, gentle inner glow, centered with a small margin.
Background: solid flat pure green #00FF00 chroma key green screen, perfectly uniform,
no gradient, no vignette, no shadow or glow spilling onto the background, no
transparency checkerboard pattern. The subject must contain no green or lime colors at
all. No plate, no badge, no rounded square panel behind the subject, no card, no medallion — the subject floats freely on the green background. No frame, no border, no text, no watermark, no outer glow outline, no enclosing
contour, subject only. Clean icon art readable at 32 pixels. 1024x1024.
```

---

## 🛡️ 護盾（war_shield）

**檔名：`shield.png`**

```
A fantasy game skill icon of a translucent hexagonal energy shield with a soft ripple of
deflected light across its surface. Semi-realistic 3D render, deep teal-blue and violet
neon palette, soft rim light, thick rounded silhouette, gentle inner glow, centered with
a small margin. Background: solid flat pure green #00FF00 chroma key green screen,
perfectly uniform, no gradient, no vignette, no shadow or glow spilling onto the
background, no transparency checkerboard pattern. The subject must contain no green or
lime colors at all. No plate, no badge, no rounded square panel behind the subject, no card, no medallion — the subject floats freely on the green background. No frame, no border, no text, no watermark, no outer glow outline,
no enclosing contour, subject only. Clean icon art readable at 32 pixels. 1024x1024.
```

---

## 🌀 靜心（war_focus）

**檔名：`focus.png`**

```
A fantasy game skill icon of a calm glowing spiral vortex with a single bright point at
its center, like a meditating mind. Semi-realistic 3D render, deep teal-blue and violet
neon palette, soft rim light, thick rounded silhouette, gentle inner glow, centered with
a small margin. Background: solid flat pure green #00FF00 chroma key green screen,
perfectly uniform, no gradient, no vignette, no shadow or glow spilling onto the
background, no transparency checkerboard pattern. The subject must contain no green or
lime colors at all. No plate, no badge, no rounded square panel behind the subject, no card, no medallion — the subject floats freely on the green background. No frame, no border, no text, no watermark, no outer glow outline,
no enclosing contour, subject only. Clean icon art readable at 32 pixels. 1024x1024.
```

---

## ✋ 巧手（war_hand）

**檔名：`hand.png`**

```
A fantasy game skill icon of an open glowing hand shuffling three floating runestone
cards above the palm. Semi-realistic 3D render, deep teal-blue and violet neon palette,
soft rim light, thick rounded silhouette, gentle inner glow, centered with a small
margin. Background: solid flat pure green #00FF00 chroma key green screen, perfectly
uniform, no gradient, no vignette, no shadow or glow spilling onto the background, no
transparency checkerboard pattern. The subject must contain no green or lime colors at
all. No plate, no badge, no rounded square panel behind the subject, no card, no medallion — the subject floats freely on the green background. No frame, no border, no text, no watermark, no outer glow outline, no enclosing
contour, subject only. Clean icon art readable at 32 pixels. 1024x1024.
```

---

## 📘 專注（quiz_double）

**檔名：`double.png`**

```
A fantasy game skill icon of an open glowing book with a bright double-chevron of light
rising from its pages. Semi-realistic 3D render, deep teal-blue and violet neon palette,
soft rim light, thick rounded silhouette, gentle inner glow, centered with a small
margin. Background: solid flat pure green #00FF00 chroma key green screen, perfectly
uniform, no gradient, no vignette, no shadow or glow spilling onto the background, no
transparency checkerboard pattern. The subject must contain no green or lime colors at
all. No plate, no badge, no rounded square panel behind the subject, no card, no medallion — the subject floats freely on the green background. No frame, no border, no text, no watermark, no outer glow outline, no enclosing
contour, subject only. Clean icon art readable at 32 pixels. 1024x1024.
```

---

## 🧷 保險（quiz_insure）

**檔名：`insure.png`**

```
A fantasy game skill icon of a glowing safety net woven from light, catching a single
falling star. Semi-realistic 3D render, deep teal-blue and violet neon palette, soft rim
light, thick rounded silhouette, gentle inner glow, centered with a small margin.
Background: solid flat pure green #00FF00 chroma key green screen, perfectly uniform, no
gradient, no vignette, no shadow or glow spilling onto the background, no transparency
checkerboard pattern. The subject must contain no green or lime colors at all. No plate, no badge, no rounded square panel behind the subject, no card, no medallion — the subject floats freely on the green background. No frame, no border, no text, no watermark, no outer glow outline, no enclosing contour, subject
only. Clean icon art readable at 32 pixels. 1024x1024.
```

---

## 🎀 送分（quiz_gift）

**檔名：`gift.png`**

```
A fantasy game skill icon of a glowing ribbon bow releasing a sparkling checkmark of
light. Semi-realistic 3D render, deep teal-blue and violet neon palette, soft rim light,
thick rounded silhouette, gentle inner glow, centered with a small margin. Background:
solid flat pure green #00FF00 chroma key green screen, perfectly uniform, no gradient,
no vignette, no shadow or glow spilling onto the background, no transparency
checkerboard pattern. The subject must contain no green or lime colors at all. No plate, no badge, no rounded square panel behind the subject, no card, no medallion — the subject floats freely on the green background. No frame, no border, no text, no watermark, no outer glow outline, no enclosing contour, subject
only. Clean icon art readable at 32 pixels. 1024x1024.
```

---

## 🏷️ 議價（shop_discount）

**檔名：`discount.png`**

```
A fantasy game skill icon of a glowing crystal price tag with a soft downward arrow of
light beside it. Semi-realistic 3D render, deep teal-blue and violet neon palette, soft
rim light, thick rounded silhouette, gentle inner glow, centered with a small margin.
Background: solid flat pure green #00FF00 chroma key green screen, perfectly uniform, no
gradient, no vignette, no shadow or glow spilling onto the background, no transparency
checkerboard pattern. The subject must contain no green or lime colors at all. No plate, no badge, no rounded square panel behind the subject, no card, no medallion — the subject floats freely on the green background. No frame, no border, no text, no watermark, no outer glow outline, no enclosing contour, subject
only. Clean icon art readable at 32 pixels. 1024x1024.
```

---

## 處理工具

```bash
# 整個資料夾,綠幕去背 + 只留中心那一團
python3 tools/clean-icon.py 下載資料夾/ -o assets/skill/ --key 00ff00 --core

# 單張
python3 tools/clean-icon.py power.png -o assets/skill/power.png --key 00ff00 --core
```

常用參數：

| 參數 | 用途 |
| --- | --- |
| `--key 00ff00` | **背景色**。有指定就用精確計算去背，不是用猜的 |
| `--core` | 只留中心那一團，外圍分離的光圈整個丟掉 |
| `--key-tol 60` | 背景色容差（預設 60）。生成器的平塗會有輕微雜訊，所以要留一點 |
| `--key-soft 55` | 邊緣羽化寬度（預設 55）。太小會鋸齒，太大邊緣會透 |
| `--size 512` | 輸出邊長（預設 512） |

去背完會自動裁掉空白、置中、縮成正方形。

**實測結果**（把已知透明度的圖合成到綠底再去背還原）：

| 項目 | 結果 |
| --- | --- |
| 殘留的綠底 | 0.00% |
| 被誤殺的主體 | 0.00% |
| 實心區色差 | **0.0**（完全一致） |
| 白色部分保留率 | **100%**（舊的猜法會把白色當背景誤殺） |

---

## 出問題的時候

| 問題 | 處理 |
| --- | --- |
| 背景不是平塗的綠，有漸層或暗角 | 加 `background must be perfectly flat solid #00FF00 with zero gradient` |
| 主體邊緣有綠邊 | 工具會自動去溢色。還有的話把 `--key-tol` 調大（80～100） |
| 邊緣鋸齒 | `--key-soft` 調大（80～120） |
| 主體被挖掉一塊 | 主體用到綠色了。在 prompt 加 `absolutely no green, no lime, no chartreuse anywhere in the subject` |
| 又畫出棋盤格 | 加 `never draw a transparency checkerboard, the background is opaque solid green` |
| 主體下面有深色圓角底板 | 加 `absolutely no plate or panel behind the subject` 再生一次。**但不必太執著** —— 外框本來就由程式畫,底板只要不是太大、不影響主體辨識,裁切時會一起留著,八張看起來仍然一致 |
| 細節太多縮小看不清 | 加 `minimal detail, bold simple shapes, high contrast` |
| 畫出文字或數字 | 加 `absolutely no letters, no numbers, no typography` |

> **Midjourney**：結尾改加 `--style raw --ar 1:1`，並把背景描述放在最前面。
> 它對「平塗背景」的服從度較差，必要時多生幾張挑。

---

## 果實造型版本（選配）

想讓「技能果實」在商店裡長得像果實，把主體換成果實造型，背景規格不變。
範例（猛擊果實）：

```
A fantasy game item icon of a glowing crystalline fruit with a faint fist-shaped emblem
inside its translucent flesh, a single leaf on top. Semi-realistic 3D render, deep
teal-blue and violet neon palette, soft rim light, thick rounded silhouette, gentle
inner glow, centered with a small margin. Background: solid flat pure green #00FF00
chroma key green screen, perfectly uniform, no gradient, no vignette, no shadow or glow
spilling onto the background, no transparency checkerboard pattern. The subject must
contain no green or lime colors at all — the leaf should be teal or violet, not green.
No plate, no badge, no rounded square panel behind the subject, no card, no medallion — the subject floats freely on the green background. No frame, no border, no text, no watermark, no outer glow outline, no enclosing contour,
subject only. Clean icon art readable at 32 pixels. 1024x1024.
```

其餘七顆把 `fist-shaped emblem` 換成：
`shield-shaped emblem`（護盾）、`spiral emblem`（靜心）、`open hand emblem`（巧手）、
`book emblem`（專注）、`net emblem`（保險）、`ribbon emblem`（送分）、
`price tag emblem`（議價）。

> 果實版的葉子要特別叮嚀「不要綠色」——
> 葉子預設就是綠的，那會和背景同色被挖掉。
