"""
砲彈 sheet（洋紅底，左到右排開幾顆彈）-> 去背、依連通區塊由左到右切開、縮到指定寬度，存成砲彈貼圖。
  python -I tools/sprites2d/slice_shells.py <sheet> <out_dir> <name1>:<width1> [<name2>:<width2> ...]
例：slice_shells.py bumble_shells.png public/assets/units/projectiles shell_bumble_swarm:70 shell_bumble_hive:84
洋紅去背公式與 slice_parts.py 相同；連通區塊數必須剛好等於給的名字數（砲彈帶尾巴 / 零碎小點時會被併入最近的大塊）。
"""
import sys, os
import numpy as np
import cv2
from PIL import Image

sheet, out = sys.argv[1], sys.argv[2]
specs = [(a.split(":")[0], int(a.split(":")[1])) for a in sys.argv[3:]]
rgb = np.asarray(Image.open(sheet).convert("RGB")).astype(np.float32)
R, G, B = rgb[..., 0], rgb[..., 1], rgb[..., 2]
alpha = np.clip(1 - ((np.minimum(R, B) - G) - 70) / 110, 0, 1)
spill = np.clip(np.minimum(R, B) - G, 0, None)
edge = alpha < 0.999
for ch in (R, B):
    ch[edge] -= spill[edge] * 0.85
alpha = cv2.GaussianBlur(cv2.erode(alpha, np.ones((3, 3), np.uint8)), (0, 0), 0.6)
img = np.dstack([np.clip(R, 0, 255), np.clip(G, 0, 255), np.clip(B, 0, 255), alpha * 255]).astype(np.uint8)
mask = (alpha > 0.5).astype(np.uint8)
n, lab, stats, _ = cv2.connectedComponentsWithStats(cv2.dilate(mask, np.ones((71, 71), np.uint8)), connectivity=8)
comps = [i for i in range(1, n) if stats[i][cv2.CC_STAT_AREA] > 2000]
assert len(comps) == len(specs), f"expect {len(specs)} blobs, got {len(comps)}"
comps.sort(key=lambda i: stats[i][0])
os.makedirs(out, exist_ok=True)
for i, (name, w) in zip(comps, specs):
    x, y, cw, ch_, _ = stats[i]
    sub = img[y:y + ch_, x:x + cw].copy()
    sub[..., 3] = np.where(lab[y:y + ch_, x:x + cw] == i, sub[..., 3], 0)
    ys, xs = np.where(sub[..., 3] > 10)
    sub = sub[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    im = Image.fromarray(sub, "RGBA")
    im = im.resize((w, max(1, round(im.height * w / im.width))), Image.LANCZOS)
    im.save(f"{out}/{name}.png")
    print(name, im.size)
