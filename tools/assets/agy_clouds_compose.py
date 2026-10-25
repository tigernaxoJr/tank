"""agy / web chat 生的洋紅底雲朵圖集 → 去背切開 → 錯落排成可左右銜接的 1024x400 clouds_far 層。
用法: python -I tools/assets/agy_clouds_compose.py <sheet.png> <out.png> [--scale 0.8] [--tall-first] [--strict] [--backup <old.png>]
雲全落在上半部（遊戲裡此層只顯示高 220 的帶狀區），分兩列、各自水平均分，第二列錯開半格；邊緣留白故自然銜接。
"""
import sys, shutil
import numpy as np
from PIL import Image
import cv2

src, out = sys.argv[1:3]
scale = float(sys.argv[sys.argv.index('--scale') + 1]) if '--scale' in sys.argv else 0.8
if '--backup' in sys.argv:
    shutil.copy(out, sys.argv[sys.argv.index('--backup') + 1])

a = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
orig = a.copy()
m = np.minimum(a[..., 0], a[..., 2]) - a[..., 1]
alpha = 1 - np.clip((m - 60) / 100, 0, 1)
spill = np.clip((m - 20) / 100, 0, 1)[..., None]
g = a[..., 1:2]
a = a * (1 - spill) + np.concatenate([g, g, g], -1) * spill * 0.9
if '--strict' in sys.argv:  # 圖裡本身有粉紅/洋紅色塊時：只去掉與 #ff00ff 幾乎相同的底色，不用「洋紅度」判斷
    dist = np.sqrt(((orig - np.array([255, 0, 255], np.float32)) ** 2).sum(-1))
    alpha = np.clip((dist - 45) / 40, 0, 1)
    spill = (dist < 70).astype(np.float32)[..., None] * np.clip((m - 20) / 100, 0, 1)[..., None]  # 只處理貼近底色的邊緣滲色
    a = orig * (1 - spill) + np.concatenate([g, g, g], -1) * spill * 0.9
rgba = np.dstack([a, alpha * 255]).clip(0, 255).astype(np.uint8)

solid = cv2.dilate((alpha > 0.5).astype(np.uint8), np.ones((15, 15), np.uint8))
n, lab, stats, _ = cv2.connectedComponentsWithStats(solid)
pieces = []
for i in range(1, n):
    x, y, w, h, area = stats[i]
    if area < 800:
        continue
    sub = rgba[y:y + h, x:x + w].copy()
    sub[..., 3] = np.where(lab[y:y + h, x:x + w] == i, sub[..., 3], 0)
    p = Image.fromarray(sub, 'RGBA')
    p = p.crop(p.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox())
    pieces.append(p.resize((round(p.width * scale), round(p.height * scale)), Image.LANCZOS))
pieces.sort(key=lambda p: -p.width)
print('pieces', [p.size for p in pieces])

# 大小交錯分兩列：第一列取 大、小、中，第二列取 次大、小、中
tall = '--tall-first' in sys.argv  # 有高大的飄帶/煙柱時：最高的 3 個放上列、其餘放下列，避免上下列重疊
if tall:
    pieces.sort(key=lambda p: -p.height)
    rows = [pieces[:3], pieces[3:]]
else:
    rows = [[pieces[i] for i in (0, 4, 2)], [pieces[i] for i in (5, 1, 3)]] if len(pieces) >= 6 else [pieces[0::2], pieces[1::2]]
W, H = 1024, 400
wide = Image.new('RGBA', (W * 3, H), (0, 0, 0, 0))  # 先畫在三倍寬，再把兩側摺回來，跨界的雲才會銜接
for r, row in enumerate(rows):
    slot = W / len(row)
    off = slot * 0.35 * r
    ybase = 10 if r == 0 and tall else (170 if tall else 18 + r * 95)
    for k, p in enumerate(row):
        cx = (off + slot * (k + 0.5)) % W
        y = ybase + (0 if tall else (k % 2) * 14)
        if not tall:
            y = min(y, 215 - p.height)  # 遊戲只顯示上方 220 高的帶狀區，別讓雲被切掉
        wide.alpha_composite(p, (round(cx - p.width / 2) + W, y))
canvas = wide.crop((W, 0, 2 * W, H))
canvas.alpha_composite(wide.crop((0, 0, W, H)))
canvas.alpha_composite(wide.crop((2 * W, 0, 3 * W, H)))
canvas.save(out)
