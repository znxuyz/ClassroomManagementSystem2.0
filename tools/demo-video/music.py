#!/usr/bin/env python3
"""
功能介紹影片的配樂
──────────────────────────────────────────────
自己合成的,不是外面載的 —— 這樣授權乾淨,長度也可以剛好配合影片。

設計上刻意很克制:
· 沒有鼓。影片是給老師看的操作示範,節奏感太強會搶走注意力
· 旋律只用五聲音階(宮商角徵羽),和「守護獸/台灣山林」那個調性一致
· 音量壓在 -20 dBFS 上下,旁邊有人說話也不會吵

用法: python3 music.py 輸出.wav 秒數
"""
import sys, math, struct, wave
import numpy as np

SR = 44100


def adsr(n, a=0.01, d=0.3, s=0.35, r=0.5):
    """包絡線。沒有它,每一個音的頭尾都會「啪」一聲。"""
    env = np.zeros(n)
    ai = min(int(SR * a), n)
    di = min(int(SR * d), n - ai)
    ri = min(int(SR * r), n - ai - di)
    si = max(0, n - ai - di - ri)
    i = 0
    if ai:
        env[i:i + ai] = np.linspace(0, 1, ai); i += ai
    if di:
        env[i:i + di] = np.linspace(1, s, di); i += di
    if si:
        env[i:i + si] = s; i += si
    if ri:
        env[i:i + ri] = np.linspace(s, 0, ri)
    return env


def note(freq, dur, kind='pad', amp=0.2):
    n = int(SR * dur)
    t = np.arange(n) / SR
    if kind == 'pluck':
        # 撥弦:基音 + 兩個泛音,衰減很快
        w = (np.sin(2 * np.pi * freq * t)
             + 0.45 * np.sin(2 * np.pi * freq * 2 * t)
             + 0.22 * np.sin(2 * np.pi * freq * 3 * t))
        env = adsr(n, 0.004, 0.5, 0.12, max(0.2, dur * 0.5))
    elif kind == 'bell':
        w = (np.sin(2 * np.pi * freq * t)
             + 0.3 * np.sin(2 * np.pi * freq * 2.76 * t)
             + 0.15 * np.sin(2 * np.pi * freq * 5.4 * t))
        env = adsr(n, 0.002, 0.9, 0.05, 0.9)
    else:
        # 襯底:三角波堆疊 + 很慢的顫音,聽起來才不像訊號產生器
        w = (np.sin(2 * np.pi * freq * t)
             + 0.5 * np.sin(2 * np.pi * freq * 2 * t + 0.4)
             + 0.25 * np.sin(2 * np.pi * freq * 3 * t + 1.1))
        w *= 1 + 0.03 * np.sin(2 * np.pi * 4.5 * t)
        env = adsr(n, 0.35, 0.6, 0.6, 0.9)
    return (w * env * amp).astype(np.float32)


def mix(buf, sig, at):
    i = int(SR * at)
    j = min(len(buf), i + len(sig))
    if i < len(buf):
        buf[i:j] += sig[:j - i]


def echo(buf, delay=0.33, decay=0.26, times=3):
    """簡單的回聲。沒有殘響的話,合成音會乾得像手機鈴聲。"""
    out = buf.copy()
    for k in range(1, times + 1):
        d = int(SR * delay * k)
        if d >= len(buf):
            break
        out[d:] += buf[:-d] * (decay ** k)
    return out


def hz(semi):
    """以 A4=440 為基準,半音數轉頻率"""
    return 440.0 * (2 ** (semi / 12))


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else 'bgm.wav'
    total = float(sys.argv[2]) if len(sys.argv) > 2 else 180.0

    buf = np.zeros(int(SR * (total + 3)), dtype=np.float32)

    # C 大調。和弦:C – G/B – Am – F,每一小節 4 拍、每拍 0.78 秒(≈77 BPM)
    beat = 0.78
    bar = beat * 4
    prog = [
        [-9, -5, -2],    # C  (C3 E3 G3)
        [-10, -5, -1],   # G/B
        [-12, -5, 0],    # Am
        [-7, -2, 3],     # F
    ]
    # 五聲音階的琶音音階(C D E G A)
    penta = [0, 2, 4, 7, 9, 12, 14, 16]

    t = 0.0
    i = 0
    rng = np.random.default_rng(20261109)
    while t < total:
        ch = prog[i % len(prog)]
        # 襯底:整小節的三個音
        for s in ch:
            mix(buf, note(hz(s), bar * 1.05, 'pad', 0.085), t)
        # 低音:每小節第一拍與第三拍
        mix(buf, note(hz(ch[0] - 12), beat * 1.8, 'pluck', 0.1), t)
        mix(buf, note(hz(ch[0] - 12), beat * 1.4, 'pluck', 0.07), t + beat * 2)

        # 琶音:八分音符,音高從五聲音階裡挑,但走向是連續的 —— 亂跳會變成噪音
        step = beat / 2
        k = (i * 3) % len(penta)
        for b in range(8):
            if b % 4 == 3 and (i + b) % 3 == 0:
                continue                    # 偶爾留白,才不會像練習曲
            k = max(0, min(len(penta) - 1, k + int(rng.integers(-1, 2))))
            amp = 0.055 if b % 2 else 0.075
            mix(buf, note(hz(penta[k] + 0), step * 1.9, 'pluck', amp), t + b * step)

        # 每四小節在第一拍放一聲鈴,當作段落記號
        if i % 4 == 0:
            mix(buf, note(hz(penta[5] + 12), 2.2, 'bell', 0.05), t)

        t += bar
        i += 1

    buf = echo(buf)
    buf = buf[:int(SR * total)]

    # 頭尾淡入淡出
    fin = int(SR * 2.0)
    buf[:fin] *= np.linspace(0, 1, fin)
    fout = int(SR * 3.0)
    buf[-fout:] *= np.linspace(1, 0, fout)

    # 壓到 -20 dBFS 左右,說話聲蓋得過去
    peak = float(np.max(np.abs(buf))) or 1.0
    buf = buf / peak * 0.28

    data = (buf * 32767).astype(np.int16)
    stereo = np.repeat(data[:, None], 2, axis=1)   # 單聲道複製成兩聲道
    with wave.open(out_path, 'w') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(stereo.tobytes())
    print(f'{out_path}: {len(data)/SR:.1f} 秒')


if __name__ == '__main__':
    main()
