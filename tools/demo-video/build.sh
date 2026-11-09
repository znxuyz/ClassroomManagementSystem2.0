#!/usr/bin/env bash
# ============================================
#  功能介紹影片 — 合成
#  ────────────────────────────────────────────
#  把兩段錄影(老師端 1280×720、學生端 390×844)接起來、配上自己合成的
#  背景音樂,輸出一支 1280×720 的 mp4,並附一份完整的字幕檔。
#
#  學生端是手機尺寸,所以放進畫面中央的手機外框裡,兩邊留深色底,
#  字幕在這一段改用字幕檔燒上去 —— 390 的寬度排不下一行中文。
#
#  用法:bash tools/demo-video/build.sh [工作目錄]
# ============================================
set -e
cd "$(dirname "$0")/../.."
OUT="${1:-/tmp/demo}"
PY=/usr/bin/python3.13
FONT=/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc

T_RAW=$(ls "$OUT"/raw-teacher/*.webm | head -1)
S_RAW=$(ls "$OUT"/raw-student/*.webm | head -1)

echo "── 1/5 老師端 ──"
# 開頭淡入:錄影的頭幾格是瀏覽器還在載入的畫面
ffmpeg -v error -y -i "$T_RAW" \
  -vf "fps=25,scale=1280:720:flags=lanczos,fade=t=in:st=0:d=0.6,format=yuv420p" \
  -c:v libx264 -preset slow -crf 20 -an "$OUT/a.mp4"

echo "── 2/5 學生端(放進手機外框)──"
# 手機畫面縮到高 590 並往上靠,下面留一百多像素給字幕 ——
# 不留的話字幕會壓在手機畫面上(第一次合成就是這樣)
ffmpeg -v error -y -i "$S_RAW" \
  -vf "fps=25,scale=-2:590:flags=lanczos,\
pad=1280:720:(ow-iw)/2:14:color=0x0d1420,\
drawbox=x=(iw-273)/2:y=14:w=273:h=590:color=0x3a4a63@0.9:t=3,\
subtitles='$OUT/student.srt':force_style='FontName=WenQuanYi Zen Hei,FontSize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H00101820,BorderStyle=1,Outline=3,Shadow=1,MarginV=26,Alignment=2',\
format=yuv420p" \
  -c:v libx264 -preset slow -crf 20 -an "$OUT/b.mp4"

echo "── 3/6 片尾 ──"
# 片尾做成獨立的一段,而不是錄在學生端那一支裡 ——
# 學生端是 390 寬,片尾字會被縮進手機外框裡,小得看不清楚(第一版就是這樣)。
mkdir -p "$OUT/txt"
printf '%s' '守護獸學園' > "$OUT/txt/t0.txt"
printf '%s' '純前端 + Firebase · 沒有伺服器要維護' > "$OUT/txt/t1.txt"
printf '%s' '每一次改版都跑 27 套 · 590 多項自動測試' > "$OUT/txt/t2.txt"
printf '%s' '守護獸都是台灣特有種' > "$OUT/txt/t3.txt"
printf '%s' '牠們是這片土地上比我們先住的居民' > "$OUT/txt/t4.txt"

ffmpeg -v error -y -f lavfi -i "color=c=0x080c14:s=1280x720:r=25:d=15" -vf "\
drawtext=fontfile=$FONT:textfile=$OUT/txt/t0.txt:fontcolor=white:fontsize=58:x=(w-tw)/2:y=215:alpha='min(1\,max(0\,(t-0.3)*1.2))',\
drawtext=fontfile=$FONT:textfile=$OUT/txt/t1.txt:fontcolor=0xd9e2f2:fontsize=28:x=(w-tw)/2:y=330:alpha='min(1\,max(0\,(t-1.2)*1.2))',\
drawtext=fontfile=$FONT:textfile=$OUT/txt/t2.txt:fontcolor=0xd9e2f2:fontsize=28:x=(w-tw)/2:y=382:alpha='min(1\,max(0\,(t-2.6)*1.2))',\
drawtext=fontfile=$FONT:textfile=$OUT/txt/t3.txt:fontcolor=0xffd166:fontsize=30:x=(w-tw)/2:y=470:alpha='min(1\,max(0\,(t-5.4)*1.2))',\
drawtext=fontfile=$FONT:textfile=$OUT/txt/t4.txt:fontcolor=0xffd166:fontsize=30:x=(w-tw)/2:y=518:alpha='min(1\,max(0\,(t-6.6)*1.2))',\
fade=t=out:st=12.4:d=2.4,format=yuv420p" \
  -c:v libx264 -preset slow -crf 20 -an "$OUT/c.mp4"

echo "── 4/6 接起來 ──"
printf "file '%s'\nfile '%s'\nfile '%s'\n" "$OUT/a.mp4" "$OUT/b.mp4" "$OUT/c.mp4" > "$OUT/list.txt"
ffmpeg -v error -y -f concat -safe 0 -i "$OUT/list.txt" -c copy "$OUT/video.mp4"

DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT/video.mp4")
echo "   影片長度 ${DUR} 秒"

echo "── 5/6 配樂 ──"
$PY tools/demo-video/music.py "$OUT/bgm.wav" "$DUR"

echo "── 6/6 混音輸出 ──"
ffmpeg -v error -y -i "$OUT/video.mp4" -i "$OUT/bgm.wav" \
  -c:v copy -c:a aac -b:a 160k -shortest \
  -metadata title="守護獸學園 — 功能介紹" \
  "$OUT/守護獸學園-功能介紹.mp4"

# 完整字幕:學生端那一段要往後推一整段老師端的長度,片尾另外補上
A_DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT/a.mp4")
B_DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT/b.mp4")
$PY - "$OUT" "$A_DUR" "$B_DUR" <<'PYEOF'
import sys, json, pathlib
out, shift = pathlib.Path(sys.argv[1]), float(sys.argv[2]) * 1000
outro_at = shift + float(sys.argv[3]) * 1000

def ts(ms):
    h, ms = divmod(int(ms), 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f'{h:02d}:{m:02d}:{s:02d},{ms:03d}'

subs = []
for part, off in (('teacher', 0), ('student', shift)):
    data = json.loads((out / f'{part}.json').read_text())
    for s in data['subs']:
        subs.append((s['start'] + off, s['end'] + off, s['text']))

# 片尾那幾句是用 ffmpeg 畫上去的,字幕檔也要有(不然聽障或翻譯的人會漏掉)
for a, b, t in [(0.3, 5.2, '純前端 + Firebase,沒有伺服器要維護'),
                (5.4, 9.0, '每一次改版都跑 27 套、590 多項自動測試'),
                (9.0, 14.0, '守護獸都是台灣特有種 —— 牠們是這片土地上比我們先住的居民')]:
    subs.append((outro_at + a * 1000, outro_at + b * 1000, t))

lines = []
for i, (a, b, t) in enumerate(subs, 1):
    lines.append(f'{i}\n{ts(a)} --> {ts(b)}\n{t}\n')
(out / '守護獸學園-功能介紹.srt').write_text('\n'.join(lines), encoding='utf-8')
print(f'   字幕 {len(subs)} 句')
PYEOF

ls -la "$OUT/守護獸學園-功能介紹.mp4"
echo "完成:$OUT/守護獸學園-功能介紹.mp4"
