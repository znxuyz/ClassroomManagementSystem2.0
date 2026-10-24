#!/usr/bin/env bash
# 跑完整套測試。任何一套失敗就回傳非 0。
#
#   bash tests/run.sh            全部
#   bash tests/run.sh 02         只跑編號開頭是 02 的那一套
#
# 需要 playwright + chromium。沒有的話先:
#   npm i -g playwright && npx playwright install chromium

cd "$(dirname "$0")/.."
filter="${1:-}"
fail=0
total=0

for f in tests/[0-9]*.mjs; do
  name=$(basename "$f")
  if [ -n "$filter" ] && [[ "$name" != "$filter"* ]]; then continue; fi
  total=$((total + 1))
  node "$f" || fail=$((fail + 1))
done

echo
if [ "$fail" -eq 0 ]; then
  echo "════ $total 套全部通過 ════"
else
  echo "════ $total 套裡有 $fail 套失敗 ════"
fi
exit "$fail"
