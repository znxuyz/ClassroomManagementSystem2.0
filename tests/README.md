# 測試

```bash
bash tests/run.sh          # 全部
bash tests/run.sh 02       # 只跑 02 那一套
```

需要 playwright 與 chromium:

```bash
npm i -g playwright && npx playwright install chromium
```

## 為什麼是這種寫法

這個專案沒有打包步驟 —— `index.html` 直接用 `<script>` 載入所有檔案,
所有東西都掛在 window 上。所以測試就用真的瀏覽器開 `index.html`,
然後在頁面裡直接呼叫那些函式。不需要 import/export,**產品程式一行都不用改**。

雲端那一層全部換成假的替身(`lib.mjs` 的 `stubCloud`)。這樣:

- 不會動到正在上課的那個 Firestore 專案
- 可以測「寫入失敗」「讀取失敗」這些真實環境很難重現、但一旦發生就會掉資料的狀況
- 不用網路,整套跑完十幾秒

## 測試資料的規矩

**一律用頁面裡真正的常數產生**(`DEFAULT_RULES`、`PET_SPECIES`、`DIFFICULTY`、
`SKILL_DEFAULTS`…),見 `lib.mjs` 的 `__fixture()`。

這一條是用教訓換來的:曾經有一次稽核「全部通過」是假的,
因為當時的測試資料用了不存在的難度代號和不存在的守護獸 ——
那些程式路徑根本沒被走到。寫新的測試時不要自己捏欄位名稱。

## 每一套在守什麼

| 檔案 | 守住的事 |
|---|---|
| `00-static.mjs` | 不開瀏覽器就查得到的坑:檔案有沒有被載入、快取版號一致、CSS 變數有定義、存檔欄位對稱、每個子集合都有安全規則、沒用到相容 SDK 不存在的 API、載入順序 |
| `01-layout.mjs` | 每一個頁面 × 390/768/1440 三種寬度:render 不丟例外、沒有水平溢出、沒有 console 錯誤。**包含點開某一位學生的報告** —— 之前只走到學生清單那一層,所以報告在手機上破版一直沒被抓到 |
| `02-roster.mjs` | 同學之間**不可以**看到彼此的加分明細(含扣分原因)、測驗成績、可用積分、Google 帳號 |
| `03-question-bank.mjs` | 題庫分片:加一題只重寫一片;而且任何失敗都不可以弄壞雲端已經有的題庫 |
| `04-archive-backup.mjs` | 歷程封存**絕對不可以掉資料**(先寫成功才從主文件刪);備份要是完整的 |
| `05-report.mjs` | 每月積分的加總等於原始紀錄;逐筆明細預設收起 |
| `06-help.mjs` | 說明的每一段都有分類、每個分類點了都有內容 |
| `08-roster-status.mjs` | 各班名冊的狀態是**真的去查雲端**(不是看這個分頁寫過沒),以及一鍵補建不必一個班一個班開 |
| `07-recovery.mjs` | 離線的變更救得回來,而且**不自動覆蓋** —— 老師可能在另一台裝置上 |

## 加一套新的

檔名照編號接下去,然後:

```js
import { loadPlaywright, openApp, prepare, okSrc, report } from './lib.mjs';

const chromium = await loadPlaywright();
const { page, errors, close } = await openApp(chromium);
await page.evaluate(okSrc);
await prepare(page);

const lines = await page.evaluate(async () => {
  const t = window.__mk();
  window.__apply(window.__fixture());
  t.ok('要守住的那件事', 條件, '補充說明');
  return t.out;
});

await close();
process.exit(report('這一套的名字', lines, errors) ? 0 : 1);
```

`errors` 會蒐集 console 錯誤與未捕捉例外,交給 `report()` 一起判定 ——
所以測試不必自己檢查「有沒有壞掉」。
