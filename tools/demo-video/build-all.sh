#!/usr/bin/env bash
# 錄影 + 合成一次做完。約六分鐘。
set -e
cd "$(dirname "$0")/../.."
OUT="${1:-/tmp/demo}"
mkdir -p "$OUT"
rm -rf "$OUT/raw-teacher" "$OUT/raw-student"
node tools/demo-video/record.mjs teacher "$OUT"
node tools/demo-video/record.mjs student "$OUT"
bash tools/demo-video/build.sh "$OUT"
