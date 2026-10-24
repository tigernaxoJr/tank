"""
2D 生圖 sprite sheet（洋紅底，左車身右砲管）-> 遊戲用 hull / barrel PNG（隊伍 A / B）。
  python -I tools/sprites2d/slice_sheet.py <sheet.jpg> <out_dir> [--hull-w 240] [--id snailer]
做的事：洋紅去背 + 去色邊 -> 以空白欄切成兩個零件 -> 縮放到遊戲貼圖尺寸 -> 隊伍色（藍殼轉紅橘）。
輸出 <out_dir>/<id>_<a|b>_<hull|barrel>.png 與 slice_meta.json（review.html 讀取，轉軸/臉為初始猜測，由人工在檢視頁修正）。
"""
import argparse, json, os
import numpy as np
from PIL import Image
import cv2

ap = argparse.ArgumentParser()
ap.add_argument("sheet"); ap.add_argument("out")
ap.add_argument("--hull-w", type=float, default=240)
ap.add_argument("--id", default="snailer")
ap.add_argument("--ball", action="store_true", help="ball-joint barrel: pad right so the ball center sits at 8 percent of width (engine barrel origin)")
args = ap.parse_args()
os.makedirs(args.out, exist_ok=True)

rgb = np.asarray(Image.open(args.sheet).convert("RGB")).astype(np.float32)
R, G, B = rgb[..., 0], rgb[..., 1], rgb[..., 2]
mag = np.minimum(R, B) - G                      # 洋紅度：背景 ~255，藍/金/墨 < 60
alpha = np.clip(1 - (mag - 70) / 110, 0, 1)    # 70 以下全留，180 以上全去
# 去色邊：邊緣半透明處把殘留的洋紅成分拉回綠色通道水準
spill = np.clip(np.minimum(R, B) - G, 0, None)
edge = alpha < 0.999
for ch in (R, B):
    ch[edge] -= spill[edge] * 0.85
alpha = cv2.erode(alpha, np.ones((3, 3), np.uint8))     # 再內縮 1px 吃掉 JPEG 雜邊
alpha = cv2.GaussianBlur(alpha, (0, 0), 0.6)
out = np.dstack([np.clip(R, 0, 255), np.clip(G, 0, 255), np.clip(B, 0, 255), alpha * 255]).astype(np.uint8)

# 依「整欄全透明」切零件
col = (alpha > 0.5).sum(0) > 0
runs, s = [], None
for x, v in enumerate(col):
    if v and s is None: s = x
    if not v and s is not None:
        if x - s > 40: runs.append((s, x))
        s = None
if s is not None: runs.append((s, len(col)))
assert len(runs) >= 2, f"expect 2 parts, got {runs}"
runs = sorted(runs, key=lambda r: r[0])
hull_r, barrel_r = runs[0], runs[-1]

def crop(r):
    sub = out[:, r[0]:r[1]]
    ys = np.where((sub[..., 3] > 10).any(1))[0]
    return Image.fromarray(sub[ys[0]:ys[-1] + 1], "RGBA"), (r[0], ys[0])

hull, hoff = crop(hull_r); barrel, boff = crop(barrel_r)
if args.ball:
    c = barrel.height / 2
    W = round(c / 0.08)
    padded = Image.new("RGBA", (max(W, barrel.width), barrel.height), (0, 0, 0, 0))
    padded.paste(barrel, (0, 0))
    barrel = padded
k = args.hull_w / hull.width
def rs(im): return im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
hull_s, barrel_s = rs(hull), rs(barrel)

def team_a(im):
    """隊伍 A：藍色色相 -> 紅橘（與 pack_sprites.py 的 team_a 同參數），金飾/灰履帶不動"""
    a = np.asarray(im).copy()
    hsv = cv2.cvtColor(a[..., :3], cv2.COLOR_RGB2HSV_FULL).astype(np.float32)
    h = hsv[..., 0] * 360 / 255
    m = (h >= 170) & (h <= 260) & (hsv[..., 1] > 40)
    hsv[..., 0][m] = 26 * 255 / 360
    hsv[..., 1][m] = np.clip(hsv[..., 1][m] * 1.15, 0, 255)
    a[..., :3] = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2RGB_FULL)
    return Image.fromarray(a, "RGBA")

for team, f in (("b", lambda x: x), ("a", team_a)):
    f(hull_s).save(f"{args.out}/{args.id}_{team}_hull.png")
    f(barrel_s).save(f"{args.out}/{args.id}_{team}_barrel.png")

# 初始猜測（原圖座標 -> 縮放後貼圖座標）：砲管後環箍中心 = 砲管左端 ~9%、垂直置中；車身砲座與眼柄頂由人工修
meta = {"hull": [hull_s.width, hull_s.height], "barrel": [barrel_s.width, barrel_s.height], "scale": 0.4,
        "hull_base_y": 14, "k": k,
        "guess": {"socket_tex": [0.89 * hull_s.width, 0.50 * hull_s.height],
                  "eyes_tex": [0.62 * hull_s.width, 0.20 * hull_s.height], "eye_gap_tex": 0.12 * hull_s.width}}
json.dump(meta, open(f"{args.out}/slice_meta.json", "w"), indent=1)
print(meta)
