"""把家具的圖裁到剛好

Blender 算家具時用的是**整個房間的畫面**(為了和房間共用同一組相機),
所以每一張幾乎都是透明的,只有中間一小塊是家具。
九件 × 十三個角度 = 一百一十七張,加起來 3MB 多 —— 教室的網路會痛。

裁掉四周的空白之後剩下不到五分之一,而且位置資訊寫回 items-data.js,
網頁照著擺就好,畫出來一模一樣。

用法:python3.13 -I tools/crop-items.py
"""
import json
import os
import re
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOM = os.path.normpath(os.path.join(HERE, '..', 'assets', 'room'))
ITEMS = os.path.join(ROOM, 'items')
DATA = os.path.join(ROOM, 'items-data.js')

src = open(DATA, encoding='utf-8').read()
catalog = json.loads(src[src.index('['):src.rindex(']') + 1])

before = after = 0
for item in catalog:
    folder = os.path.join(ITEMS, item['id'])
    boxes = []
    for name in sorted(os.listdir(folder)):
        if not name.endswith('.webp'):
            continue
        path = os.path.join(folder, name)
        before += os.path.getsize(path)
        im = Image.open(path).convert('RGBA')
        W, H = im.size
        bb = im.getbbox()          # 不透明的範圍
        if not bb:
            # 整張全透明:不該發生,但發生了也不要讓整支掛掉
            print('  !! %s/%s 是空的' % (item['id'], name))
            boxes.append([0, 0, 1, 1])
            continue
        im.crop(bb).save(path, 'WEBP', quality=86)
        after += os.path.getsize(path)
        # 存成「佔整張畫面的幾成」,網頁才不必知道原本幾 px
        boxes.append([round(bb[0] / W, 5), round(bb[1] / H, 5),
                      round((bb[2] - bb[0]) / W, 5), round((bb[3] - bb[1]) / H, 5)])
    item['box'] = boxes
    print('%-8s %2d 張' % (item['id'], len(boxes)))

with open(DATA, 'w', encoding='utf-8') as f:
    f.write('/* 由 tools/blender/room.py 產生,再經 tools/crop-items.py 裁切。\n'
            '   box 是每一個角度那張圖在整個畫面裡的位置(左, 上, 寬, 高),\n'
            '   都是比例 —— 裁掉空白之後要靠它擺回原來的地方。 */\n')
    f.write('window.PET_ROOM_ITEMS = ')
    json.dump(catalog, f, ensure_ascii=False, separators=(',', ':'))
    f.write(';\n')

print('%.1fMB -> %.1fMB' % (before / 1048576, after / 1048576))
