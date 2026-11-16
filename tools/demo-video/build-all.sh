#!/usr/bin/env bash
# 錄影 + 合成一次做完。約六分鐘。
set -e
cd "$(dirname "$0")/../.."
OUT="${1:-/tmp/demo}"
mkdir -p "$OUT"
rm -rf "$OUT/raw-teacher" "$OUT/raw-student"

# 先把測試跑過 —— 兩個理由:
#   1. 片尾會寫「跑了幾套幾項」,那個數字要是真的現在數出來的
#   2. 壞掉的版本不該被錄成介紹影片
echo "── 0/3 先跑一次測試 ──"
if bash tests/run.sh > "$OUT/tests.log" 2>&1; then
  tail -1 "$OUT/tests.log"
else
  tail -3 "$OUT/tests.log"
  echo "✗ 測試沒全過,還是繼續錄(片尾不會寫項數)"
fi
node tools/demo-video/record.mjs teacher "$OUT"
node tools/demo-video/record.mjs student "$OUT"
bash tools/demo-video/build.sh "$OUT"
