#!/bin/bash
# 檢查 css/ 裡用到的每一個 var(--x) 都真的有定義。
# 沒定義的變數不會報錯,只會讓樣式悄悄失效 —— 所以要主動抓。
#
# 定義處有兩種:css/ 裡的 `--x: 值`,以及 js/ 裡由程式逐個元素指定的
# `style="--x:…"`(例如每一組的顏色 --g、攻打目標的 --foe)。
# 兩邊都要算,否則會把「行內指定的變數」誤報成缺漏 ——
# 這支腳本原本是靠一行寫死的白名單擋那個誤報,
# 每加一個行內變數就得記得回來改,所以改成通用掃描。
#
# 這支只是手邊方便用的快篩;正式的檢查在 tests/00-static.mjs,
# 由 tests/run.sh 一起跑,兩邊的判斷邏輯刻意保持一致。
cd "$(dirname "$0")/.."
defined=$( { grep -rhoE "^\s*--[a-zA-Z0-9-]+\s*:" css/;
             grep -rhoE -- "--[a-zA-Z0-9-]+\s*:" js/ | grep -v "^//"; } \
           | tr -d ' :' | sort -u )
bad=0
for f in css/*.css; do
  for v in $(grep -oE "var\(--[a-zA-Z0-9-]+" "$f" | sed 's/var(//' | sort -u); do
    if ! grep -qx -- "$v" <<< "$defined"; then
      echo "✗ $f 用了未定義的 $v"
      bad=1
    fi
  done
done
[ $bad -eq 0 ] && echo "✓ 所有 CSS 變數都有定義"
exit $bad
