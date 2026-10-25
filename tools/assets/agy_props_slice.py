"""agy / web chat 生的洋紅底物件圖集 → 逐個去背切開，縮放進原本 prop/hang 的貼圖尺寸（底部置中對齊）。
用法: python -I tools/assets/agy_props_slice.py <sheet.png> <map_dir> <prop|hang> [--backup <dir>]
物件由左到右對應 <kind>0, <kind>1, ...；貼圖尺寸取自 map_dir 內現有同名檔。
"""
import sys, os, shutil, glob
import numpy as np
from PIL import Image
import cv2

src, map_dir, kind = sys.argv[1:4]
backup = sys.argv[sys.argv.index('--backup') + 1] if '--backup' in sys.argv else None

a = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
m = np.minimum(a[..., 0], a[..., 2]) - a[..., 1]
alpha = 1 - np.clip((m - 60) / 100, 0, 1)
spill = np.clip((m - 20) / 100, 0, 1)[..., None]
g = a[..., 1:2]
a = a * (1 - spill) + np.concatenate([g, g, g], -1) * spill * 0.9
rgba = np.dstack([a, alpha * 255]).clip(0, 255).astype(np.uint8)

solid = (alpha > 0.5).astype(np.uint8)
if kind == 'hang':  # 生圖常多畫一條細的天花板線：又薄（垂直 <6px）又長（水平 >=40px）的像素就是線，抹掉
    thin = solid & (1 - cv2.morphologyEx(solid, cv2.MORPH_OPEN, np.ones((9, 1), np.uint8)))
    wide = cv2.morphologyEx(solid, cv2.MORPH_OPEN, np.ones((1, 40), np.uint8))
    line = cv2.dilate(thin & wide, np.ones((5, 5), np.uint8))
    keep = 1 - line
    keep = keep * cv2.dilate(cv2.morphologyEx(solid * keep, cv2.MORPH_OPEN, np.ones((7, 7), np.uint8)), np.ones((11, 11), np.uint8))  # 再只留物件本體附近，去掉殘段
    alpha = alpha * keep
    rgba[..., 3] = (alpha * 255).clip(0, 255).astype(np.uint8)
    solid = solid * keep
solid = cv2.dilate(solid, np.ones((9, 9), np.uint8))  # 連接物件內部細縫
n, lab, stats, _ = cv2.connectedComponentsWithStats(solid)
comps = sorted((i for i in range(1, n) if stats[i][4] > 400), key=lambda i: stats[i][0])
boxes = [tuple(stats[i][:4]) for i in comps]

targets = sorted(glob.glob(os.path.join(map_dir, f'{kind}[0-9]*.png')))
if len(boxes) != len(targets):
    sys.exit(f'找到 {len(boxes)} 個物件，但 {kind} 貼圖有 {len(targets)} 個：{boxes}')

for i, (x, y, w, h), tp in zip(comps, boxes, targets):
    tw, th = Image.open(tp).size
    sub = rgba[y:y + h, x:x + w].copy()
    sub[..., 3] = np.where(lab[y:y + h, x:x + w] == i, sub[..., 3], 0)  # 只留本物件，排除橫向重疊的鄰居
    piece = Image.fromarray(sub, 'RGBA')
    bb = piece.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox()
    piece = piece.crop(bb)
    s = min(tw / piece.width, th / piece.height)
    piece = piece.resize((max(1, round(piece.width * s)), max(1, round(piece.height * s))), Image.LANCZOS)
    if kind == 'hang':  # 縮放後頂緣數列若比其下本體寬出一截（殘留的天花板線），裁成與其下同寬
        al = np.array(piece.getchannel('A'))
        cols = np.where(al[4:15].max(axis=0) > 24)[0]
        if len(cols):
            al[:4, :cols.min() - 2] = 0; al[:4, cols.max() + 3:] = 0
            piece.putalpha(Image.fromarray(al))
    if backup:
        os.makedirs(backup, exist_ok=True)
        shutil.copy(tp, os.path.join(backup, os.path.basename(tp).replace('.png', '_old.png')))
    out = Image.new('RGBA', (tw, th), (0, 0, 0, 0))
    out.paste(piece, ((tw - piece.width) // 2, 0 if kind == 'hang' else th - piece.height))  # 懸掛物頂部貼齊（掛點），地表物件底部貼齊
    out.save(tp)
    print(os.path.basename(tp), (tw, th), '<-', (w, h))
