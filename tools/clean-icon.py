#!/usr/bin/env python3
"""技能圖示清理 —— 去背 + 削掉外圈光暈 + 裁切 + 縮放

AI 生出來的技能圖常有兩個毛病:
  1. 根本沒有透明通道(整張不透明,背景是純色或棋盤格)
  2. 有透明通道,但主體外面罩著一層「霧 + 封閉的霓虹輪廓」,
     縮到 26px 之後會糊成一坨色塊,看起來就像沒去背

這支工具兩種都處理:
  · 先把背景鍵掉(從四邊往內判斷,所以圖中央同色的部分不會被誤殺)
  · 再依「亮度 × 飽和度」重算透明度 —— 暗而濁的霧會消失,亮而鮮的主體留著
  · --core 可以只留下中心那一團,丟掉外圍分離的光圈
  · 最後自動裁掉空白、置中、縮成正方形

用法:
  python3 clean-icon.py 輸入.png -o 輸出.png
  python3 clean-icon.py 輸入資料夾/ -o 輸出資料夾/ --core
  python3 clean-icon.py 輸入.png -o 輸出.png --haze 0.35 --size 512

常用參數:
  --haze 0.25   霧氣門檻(0~1)。越大削得越兇,主體邊緣也會變利
  --core        只留中心那一團,外圍分離的光圈整個丟掉
  --keep-glow   不削霧,只去背與裁切
  --size 512    輸出邊長
  --pad 0.04    四周留白比例
"""

import argparse
import os
import sys

import numpy as np
from PIL import Image


# ---------------------------------------------------------------- 背景判定

def looks_checkerboard(rgb, border):
    """棋盤格背景:邊緣只有兩三種接近灰的顏色,而且交替出現。"""
    px = rgb[border]
    if len(px) == 0:
        return False
    # 灰:三個通道很接近
    grayish = (px.max(axis=1).astype(int) - px.min(axis=1).astype(int)) < 18
    if grayish.mean() < 0.9:
        return False
    vals = px[grayish].mean(axis=1)
    # 兩群明顯分開的灰階 = 棋盤格
    return vals.std() > 8


def background_mask(rgb, alpha, tol):
    """從四邊往內長,標出「和邊緣同色」的區域 —— 中央同色的部分不會被誤殺。"""
    h, w = alpha.shape
    border = np.zeros((h, w), bool)
    e = max(2, int(min(h, w) * 0.01))
    border[:e, :] = border[-e:, :] = True
    border[:, :e] = border[:, -e:] = True

    ref = rgb[border].reshape(-1, 3).astype(float)
    if looks_checkerboard(rgb, border):
        # 棋盤格有兩種灰,中間還有過渡色 —— 用顏色比對會留下格線。
        # 改用「這個像素是不是灰的」:背景全灰,主體是高飽和霓虹。
        # 主體裡的白色高光也是灰的,但它被彩色包著、連不到邊緣,所以安全。
        spread = rgb.max(axis=2).astype(int) - rgb.min(axis=2).astype(int)
        similar = spread < 22
    else:
        r0 = np.median(ref, axis=0)
        similar = np.abs(rgb.astype(float) - r0).max(axis=2) <= tol

    # 從邊緣往內擴散,只有「連到邊緣」的同色區才算背景
    bg = similar & border
    # 用重複的膨脹取代 flood fill(沒有 scipy,自己做,夠快)
    for _ in range(max(h, w)):
        grown = bg.copy()
        grown[1:, :] |= bg[:-1, :]
        grown[:-1, :] |= bg[1:, :]
        grown[:, 1:] |= bg[:, :-1]
        grown[:, :-1] |= bg[:, 1:]
        grown &= similar
        if grown.sum() == bg.sum():
            break
        bg = grown
    return bg


# ---------------------------------------------------------------- 霧氣削除

def strip_haze(rgb, alpha, haze):
    """依「亮度 × 飽和度」重算透明度。

    霧是暗而濁的(亮度低、飽和度低),主體是亮而鮮的。
    所以用這兩者的乘積當作「這個像素有多像主體」,低於門檻就淡出。
    """
    f = rgb.astype(float) / 255.0
    mx = f.max(axis=2)
    mn = f.min(axis=2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    # 亮度為主、飽和度加分 —— 純白的高光也要留住
    score = np.clip(mx * (0.55 + 0.45 * sat) + 0.25 * mx ** 2, 0, 1)

    lo, hi = haze, min(1.0, haze + 0.22)
    ramp = np.clip((score - lo) / max(hi - lo, 1e-6), 0, 1)
    ramp = ramp * ramp * (3 - 2 * ramp)          # smoothstep,邊緣才不會鋸齒
    return (alpha.astype(float) * ramp).astype(np.uint8)


# ---------------------------------------------------------------- 只留核心

def keep_core(alpha, min_ratio=0.02):
    """只留下「中心所在的那一團」,外圍分離的光圈整個丟掉。

    自己做連通元件:在縮小的遮罩上長,快很多,對圖示這種尺度完全夠用。
    """
    h, w = alpha.shape
    solid = alpha > 40
    if not solid.any():
        return alpha

    step = max(1, min(h, w) // 320)
    small = solid[::step, ::step]
    sh, sw = small.shape

    seed = np.zeros((sh, sw), bool)
    cy, cx = sh // 2, sw // 2
    # 從中心往外找第一個有東西的點當種子
    for r in range(0, max(sh, sw)):
        ys = slice(max(0, cy - r), min(sh, cy + r + 1))
        xs = slice(max(0, cx - r), min(sw, cx + r + 1))
        box = small[ys, xs]
        if box.any():
            idx = np.argwhere(box)[len(np.argwhere(box)) // 2]
            seed[ys.start + idx[0], xs.start + idx[1]] = True
            break
    if not seed.any():
        return alpha

    comp = seed
    while True:
        grown = comp.copy()
        grown[1:, :] |= comp[:-1, :]
        grown[:-1, :] |= comp[1:, :]
        grown[:, 1:] |= comp[:, :-1]
        grown[:, :-1] |= comp[:, 1:]
        grown &= small
        if grown.sum() == comp.sum():
            break
        comp = grown

    if comp.sum() < small.size * min_ratio:
        return alpha        # 核心太小,多半是判斷失準,寧可不動

    big = np.repeat(np.repeat(comp, step, axis=0), step, axis=1)[:h, :w]
    out = alpha.copy()
    out[~big] = 0
    return out


# ---------------------------------------------------------------- 裁切縮放

def fit_square(im, size, pad):
    a = np.array(im)[..., 3]
    ys, xs = np.nonzero(a > 8)
    if len(ys) == 0:
        return im.resize((size, size), Image.LANCZOS)
    im = im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))

    inner = int(size * (1 - 2 * pad))
    w, h = im.size
    scale = inner / max(w, h)
    im = im.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)

    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.paste(im, ((size - im.size[0]) // 2, (size - im.size[1]) // 2))
    return out


# ---------------------------------------------------------------- 主流程

def clean(path, out_path, args):
    im = Image.open(path).convert('RGBA')
    a = np.array(im)
    rgb, alpha = a[..., :3], a[..., 3]

    report = []
    if (alpha == 255).mean() > 0.995:
        bg = background_mask(rgb, alpha, args.tol)
        alpha = np.where(bg, 0, alpha).astype(np.uint8)
        report.append(f'去背 {bg.mean() * 100:.0f}%')
    else:
        report.append(f'原本就有透明({(alpha == 0).mean() * 100:.0f}% 全透)')

    if not args.keep_glow:
        before = (alpha > 8).mean()
        alpha = strip_haze(rgb, alpha, args.haze)
        report.append(f'削霧 {(before - (alpha > 8).mean()) * 100:.0f}%')

    if args.core:
        before = (alpha > 8).mean()
        alpha = keep_core(alpha)
        report.append(f'留核心 -{(before - (alpha > 8).mean()) * 100:.0f}%')

    a[..., 3] = alpha
    out = fit_square(Image.fromarray(a), args.size, args.pad)
    out.save(out_path)
    print(f'  {os.path.basename(path)} → {os.path.basename(out_path)}  '
          f'[{" · ".join(report)}]')


def main():
    ap = argparse.ArgumentParser(description='技能圖示清理')
    ap.add_argument('src', help='圖片檔或資料夾')
    ap.add_argument('-o', '--out', required=True, help='輸出檔或資料夾')
    ap.add_argument('--haze', type=float, default=0.25, help='霧氣門檻 0~1(預設 0.25)')
    ap.add_argument('--tol', type=float, default=26, help='背景顏色容差(預設 26)')
    ap.add_argument('--core', action='store_true', help='只留中心那一團')
    ap.add_argument('--keep-glow', action='store_true', help='不削霧')
    ap.add_argument('--size', type=int, default=512, help='輸出邊長(預設 512)')
    ap.add_argument('--pad', type=float, default=0.04, help='四周留白比例')
    args = ap.parse_args()

    if os.path.isdir(args.src):
        os.makedirs(args.out, exist_ok=True)
        names = sorted(n for n in os.listdir(args.src)
                       if n.lower().endswith(('.png', '.webp', '.jpg', '.jpeg')))
        if not names:
            sys.exit('資料夾裡沒有圖片')
        print(f'處理 {len(names)} 張:')
        for n in names:
            stem = os.path.splitext(n)[0]
            clean(os.path.join(args.src, n), os.path.join(args.out, stem + '.png'), args)
    else:
        os.makedirs(os.path.dirname(os.path.abspath(args.out)) or '.', exist_ok=True)
        print('處理 1 張:')
        clean(args.src, args.out, args)


if __name__ == '__main__':
    main()
