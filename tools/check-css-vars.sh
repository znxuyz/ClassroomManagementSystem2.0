#!/bin/bash
# 檢查 css/ 裡用到的每一個 var(--x) 都真的有定義。
# 沒定義的變數不會報錯,只會讓樣式悄悄失效 —— 所以要主動抓。
cd "$(dirname "$0")/.."
defined=$(grep -rhoE "^\s*--[a-zA-Z0-9-]+\s*:" css/ | tr -d ' :' | sort -u)
bad=0
for f in css/*.css; do
  # --g 之類由 HTML 行內指定的變數不算缺漏
  inline="--g"
  for v in $(grep -oE "var\(--[a-zA-Z0-9-]+" "$f" | sed 's/var(//' | sort -u); do
    grep -qx -- "$v" <<< "$inline" && continue
    if ! grep -qx -- "$v" <<< "$defined"; then
      echo "✗ $f 用了未定義的 $v"
      bad=1
    fi
  done
done
[ $bad -eq 0 ] && echo "✓ 所有 CSS 變數都有定義"
exit $bad
