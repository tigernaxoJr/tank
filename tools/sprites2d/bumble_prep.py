"""
Bumble 零件 sheet 前處理：砲管的巧克力棕條紋跟車身棕色條紋同色，砲管穿過護套後會融進車身，
所以先把砲管範圍內的棕色改成明亮橘色（陣營色，B 隊會被 slice_parts 轉成藍）。
  python -I tools/sprites2d/bumble_prep.py <sheet> <out> [--box x0,y0,x1,y1]
"""
import argparse
import numpy as np
import cv2
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument("sheet"); ap.add_argument("out")
ap.add_argument("--box", default="630,330,995,470", help="barrel region on the sheet")
args = ap.parse_args()
x0, y0, x1, y1 = (int(v) for v in args.box.split(","))
rgb = np.asarray(Image.open(args.sheet).convert("RGB")).copy()
sub = rgb[y0:y1, x0:x1]
hsv = cv2.cvtColor(sub, cv2.COLOR_RGB2HSV_FULL).astype(np.float32)
h = hsv[..., 0] * 360 / 255
m = (h >= 10) & (h <= 45) & (hsv[..., 1] > 90) & (hsv[..., 2] < 150)
hsv[..., 0][m] = 26 * 255 / 360
hsv[..., 1][m] = np.clip(hsv[..., 1][m] * 1.1, 0, 255)
hsv[..., 2][m] = np.clip(hsv[..., 2][m] * 1.9 + 40, 0, 255)
rgb[y0:y1, x0:x1] = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2RGB_FULL)
Image.fromarray(rgb).save(args.out, quality=97)
