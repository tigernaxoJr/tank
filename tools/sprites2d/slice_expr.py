"""
表情 sprite sheet（洋紅底，8 欄 x 4 列）-> 每格一張透明 PNG + expr_meta.json。
  python -I tools/sprites2d/slice_expr.py <sheet.png> <out_dir> [--ball-px 28]
列：0 近側眼（含眼柄頂球）、1 遠側眼、2 瞳孔、3 嘴 / 特效。縮放使眼球直徑 = --ball-px（貼圖像素，遊戲 0.4 倍）。
"""
import argparse, json, os
import numpy as np
from PIL import Image
import cv2
ap = argparse.ArgumentParser(); ap.add_argument("sheet"); ap.add_argument("out"); ap.add_argument("--ball-px", type=float, default=28)
a = ap.parse_args(); os.makedirs(a.out, exist_ok=True)
rgb = np.asarray(Image.open(a.sheet).convert("RGB")).astype(np.float32)
R, G, B = rgb[..., 0], rgb[..., 1], rgb[..., 2]
alpha = np.clip(1 - ((np.minimum(R, B) - G) - 70) / 110, 0, 1)
spill = np.clip(np.minimum(R, B) - G, 0, None); e = alpha < 0.999
for ch in (R, B): ch[e] -= spill[e] * 0.85
alpha = cv2.GaussianBlur(cv2.erode(alpha, np.ones((3, 3), np.uint8)), (0, 0), 0.6)
rgba = np.dstack([np.clip(R, 0, 255), np.clip(G, 0, 255), np.clip(B, 0, 255), alpha * 255]).astype(np.uint8)
H, W = alpha.shape; cw, ch_ = W / 8, H / 4
names = [["eye_open", "eye_sleepy", "eye_half", "eye_closed", "eye_wide", "eye_happy", "eye_hurt", "eye_dead"],
         ["far_blank", "far_sleepy", "far_half", "far_closed", "far_wide", "far_happy", "far_hurt", "far_dead"],
         ["pupil_normal", "pupil_small", "pupil_big", "pupil_dizzy", None, None, None, None],
         ["mouth_smile", "mouth_flat", "mouth_open", "mouth_frown", "mouth_laugh", "fx_sweat", "fx_star", "mouth_tongue"]]
# 眼球直徑：第 0 列第 0 格的內容寬度（含眼柄的邊界框寬 = 球直徑）
def bbox(sub):
    ys, xs = np.where(sub[..., 3] > 25); return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
x0 = bbox(rgba[:round(ch_), :round(cw)]); ball = x0[2] - x0[0]; k = a.ball_px / ball
meta = {"k": k, "ball_px": a.ball_px, "cells": {}}
for r in range(4):
    for c in range(8):
        n = names[r][c]
        if not n: continue
        sub = rgba[round(r * ch_):round((r + 1) * ch_), round(c * cw):round((c + 1) * cw)]
        if not (sub[..., 3] > 25).any(): continue
        bx0, by0, bx1, by1 = bbox(sub); im = Image.fromarray(sub[by0:by1, bx0:bx1], "RGBA")
        if r < 2: im = im.crop((0, 0, im.width, im.width))      # 眼：只留球（去掉眼柄）
        im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
        im.save(f"{a.out}/{n}.png"); meta["cells"][n] = [im.width, im.height]
json.dump(meta, open(f"{a.out}/expr_meta.json", "w"), indent=1); print(meta)
