"""
2D 生圖零件 sheet（洋紅底，車身 / 砲管 / 旗子 / 艙蓋同一張）-> 去背、依連通區塊切成零件 PNG（隊伍 A / B）。
  python -I tools/sprites2d/slice_parts.py <sheet.jpg> <out_dir> [--id bastion] [--hull-w 280]
                                           [--barrel-trim 55] [--accent orange]
做的事：洋紅去背 + 去色邊 -> 以連通區塊找出零件（車身最大、砲管最寬扁、旗子最高窄、其餘為艙蓋）-> 全部用同一縮放比例
縮到遊戲貼圖尺寸（車身寬 --hull-w）-> 砲管左端裁掉 --barrel-trim 原圖像素（去掉多餘凸緣）-> 隊伍色。
輸出 <out_dir>/<id>_<a|b>_<hull|barrel|flag|lid>.png 與 parts_meta.json（零件尺寸與原圖位置，量錨點時用）。
轉軸、旗桿插孔、艙蓋位置等錨點不由 AI 或腳本猜測，用 composite_check.py 的格線圖人工量。
"""
import argparse, json, os
import numpy as np
from PIL import Image
import cv2

ap = argparse.ArgumentParser()
ap.add_argument("sheet"); ap.add_argument("out")
ap.add_argument("--id", default="bastion")
ap.add_argument("--hull-w", type=float, default=280)
ap.add_argument("--barrel-trim", type=int, default=0, help="crop this many sheet px off the barrel's left end (stray flange)")
ap.add_argument("--barrel-scale", help="sx,sy applied to the barrel after the common scale (AI draws it thicker than the collar opening)")
ap.add_argument("--collar", help="cx,cy,half_w,half_h of the collar ring on the final hull image; also writes the front-ring overlay part")
ap.add_argument("--trim-boxes", help="x0,y0,x1,y1;... regions of the final hull image where team color recoloring applies (default fits bastion)")
ap.add_argument("--accent", choices=["blue", "orange"], default="orange", help="color drawn on the sheet: orange -> team A keeps it, team B turns it blue")
args = ap.parse_args()
os.makedirs(args.out, exist_ok=True)

rgb = np.asarray(Image.open(args.sheet).convert("RGB")).astype(np.float32)
R, G, B = rgb[..., 0], rgb[..., 1], rgb[..., 2]
mag = np.minimum(R, B) - G
alpha = np.clip(1 - (mag - 70) / 110, 0, 1)
spill = np.clip(np.minimum(R, B) - G, 0, None)
edge = alpha < 0.999
for ch in (R, B):
    ch[edge] -= spill[edge] * 0.85
alpha = cv2.erode(alpha, np.ones((3, 3), np.uint8))
alpha = cv2.GaussianBlur(alpha, (0, 0), 0.6)
out = np.dstack([np.clip(R, 0, 255), np.clip(G, 0, 255), np.clip(B, 0, 255), alpha * 255]).astype(np.uint8)

# 連通區塊（雜點與細碎殘片丟掉）
mask = (alpha > 0.5).astype(np.uint8)
n, lab, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
comps = [(i, *stats[i]) for i in range(1, n) if stats[i][cv2.CC_STAT_AREA] > 800]
assert len(comps) == 4, f"expect 4 parts, got {[(c[0], c[1:5]) for c in comps]}"
comps.sort(key=lambda c: -c[5])
hull_c = comps[0]
rest = comps[1:]
flag_c = max(rest, key=lambda c: c[4] / c[3])          # 最高窄（h / w 最大）
rest = [c for c in rest if c is not flag_c]
barrel_c = max(rest, key=lambda c: c[3])               # 剩下較寬的是砲管
lid_c = [c for c in rest if c is not barrel_c][0]


def crop(c, trim_left=0):
    i, x, y, w, h, _ = c
    comp = (lab[y:y + h, x:x + w] == i)
    # 只留自己的區塊（避免相鄰零件邊緣混進來），外圍用 alpha 柔邊
    sub = out[y:y + h, x:x + w].copy()
    keep = cv2.dilate(comp.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
    sub[..., 3] = np.where(keep, sub[..., 3], 0)
    if trim_left:
        sub = sub[:, trim_left:]
        x += trim_left
    ys = np.where((sub[..., 3] > 10).any(1))[0]
    xs = np.where((sub[..., 3] > 10).any(0))[0]
    sub = sub[ys[0]:ys[-1] + 1, xs[0]:xs[-1] + 1]
    return Image.fromarray(sub, "RGBA"), (x + int(xs[0]), y + int(ys[0]))


parts = {"hull": crop(hull_c), "barrel": crop(barrel_c, args.barrel_trim), "flag": crop(flag_c), "lid": crop(lid_c)}
k = args.hull_w / parts["hull"][0].width


def rs(im):
    return im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)


def team_b_from_orange(im, name=""):
    """橘色飾件（色相 8~40、飽和 > 110）-> 藍。車身只在飾件所在區域（哨塔屋頂與腰帶、護套環）轉色，
    因為木履帶、沙包的棕色色相相近，明度門檻放寬後會被一起轉到；其餘零件整張轉。"""
    a = np.asarray(im).copy()
    hsv = cv2.cvtColor(a[..., :3], cv2.COLOR_RGB2HSV_FULL).astype(np.float32)
    h = hsv[..., 0] * 360 / 255
    m = (h >= 8) & (h <= 40) & (hsv[..., 1] > 110) & (hsv[..., 2] > 60)
    if name == "hull":
        region = np.zeros(m.shape, bool)
        for x0, y0, x1, y1 in HULL_TRIM_BOXES:
            region[y0:y1, x0:x1] = True
        m &= region
    hsv[..., 0][m] = 214 * 255 / 360
    a[..., :3] = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2RGB_FULL)
    return Image.fromarray(a, "RGBA")


def team_a_from_blue(im):
    a = np.asarray(im).copy()
    hsv = cv2.cvtColor(a[..., :3], cv2.COLOR_RGB2HSV_FULL).astype(np.float32)
    h = hsv[..., 0] * 360 / 255
    m = (h >= 170) & (h <= 260) & (hsv[..., 1] > 40)
    hsv[..., 0][m] = 26 * 255 / 360
    a[..., :3] = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2RGB_FULL)
    return Image.fromarray(a, "RGBA")


def parse_nums(s, n):
    v = [float(t) for t in s.split(",")]
    assert len(v) == n, f"expect {n} numbers: {s}"
    return v


def collar_overlay(hull_a):
    """護套前圈：只取護套橘環與緊鄰的墨線，中間的黑洞挖空；遊戲裡畫在砲管上面，砲管底端就藏在環後面"""
    cx, cy, hw, hh = parse_nums(args.collar, 4)
    a = np.asarray(hull_a).copy()
    h, w = a.shape[:2]
    box = np.zeros((h, w), np.uint8)
    box[max(0, int(cy - hh)):int(cy + hh), max(0, int(cx - hw)):int(cx + hw)] = 1
    hsv = cv2.cvtColor(a[..., :3], cv2.COLOR_RGB2HSV_FULL).astype(np.float32)
    hue = hsv[..., 0] * 360 / 255
    orange = ((hue >= 8) & (hue <= 40) & (hsv[..., 1] > 110) & (a[..., 3] > 128)).astype(np.uint8) * box
    ring = cv2.dilate(orange, np.ones((3, 3), np.uint8)) * box
    dark = ((a[..., :3].max(axis=2) < 70) & (a[..., 3] > 128)).astype(np.uint8)
    ff = dark.copy()
    fm = np.zeros((h + 2, w + 2), np.uint8)
    cv2.floodFill(ff, fm, (int(cx), int(cy)), 2, flags=4)
    hole = cv2.erode((ff == 2).astype(np.uint8), np.ones((3, 3), np.uint8))
    keep = (ring > 0) & (hole == 0) & (a[..., 3] > 10)
    a[..., 3] = np.where(keep, a[..., 3], 0)
    ys, xs = np.where(a[..., 3] > 10)
    x0, y0 = int(xs.min()), int(ys.min())
    return Image.fromarray(a[y0:ys.max() + 1, x0:xs.max() + 1], "RGBA"), (x0, y0)


HULL_TRIM_BOXES = [tuple(int(v) for v in b.split(",")) for b in (args.trim_boxes or "0,0,100,125;165,65,245,145").split(";")]
ident = lambda x, name="": x
teams = (("a", ident), ("b", team_b_from_orange)) if args.accent == "orange" else (("b", ident), ("a", lambda x, name="": team_a_from_blue(x)))
meta = {"k": k, "sheet_pos": {}, "size": {}}
scaled = {}
for name, (im, pos) in parts.items():
    s = rs(im)
    if name == "barrel" and args.barrel_scale:
        sx, sy = parse_nums(args.barrel_scale, 2)
        s = s.resize((round(s.width * sx), round(s.height * sy)), Image.LANCZOS)
    scaled[name] = s
    meta["sheet_pos"][name] = [int(pos[0]), int(pos[1])]
    meta["size"][name] = [s.width, s.height]
if args.collar:
    scaled["collar"], cpos = collar_overlay(scaled["hull"])
    meta["size"]["collar"] = [scaled["collar"].width, scaled["collar"].height]
    meta["collar_pos"] = list(cpos)       # 護套前圈左上角在車身貼圖上的位置
for name, s in scaled.items():
    for team, f in teams:
        f(s, name).save(f"{args.out}/{args.id}_{team}_{name}.png")
json.dump(meta, open(f"{args.out}/parts_meta.json", "w"), indent=1)
print(json.dumps(meta))
