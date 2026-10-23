"""
Snailer 遊戲用貼圖 (步驟 2/2)：把 snailer_game.py 算繪的畫布裁切、縮回 1x、補邊，輸出到
public/assets/units/tanks/snailer_<a|b>_<hull|barrel>.png，並印出 TankBlueprint 要填的座標。
用法: python -I tools/blender/snailer_game_pack.py
"""
import json
import math
import os

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
TMP = os.path.join(ROOT, "tools/blender/out/snailer/game_tmp")
OUT = os.path.join(ROOT, "public/assets/units/tanks")
HULL_BASE_Y = 14   # BattleScene.HULL_BASE_Y

meta = json.load(open(os.path.join(TMP, "meta.json")))
C, SS, PPU, GP = meta["canvas"], meta["ss"], meta["ppu"], meta["game_px_per_unit"]
CX0, CZ0 = meta["cx0"], meta["cz0"]


def load(name):
    return Image.open(os.path.join(TMP, name)).convert("RGBA").resize((C, C), Image.LANCZOS)


results = []
for t in meta["teams"]:
    team = t["team"]
    px, py, pz = t["pivot"]

    # 車身：裁到內容邊界 + 2px 邊，底邊 = 履帶接地面
    hc = load(f"hull_{team}.png")
    bb = hc.getbbox()
    u0, v0, u1, v1 = bb[0] - 2, bb[1] - 2, bb[2] + 2, bb[3] + 2
    hull = hc.crop((u0, v0, u1, v1))
    hull.save(os.path.join(OUT, f"snailer_{team}_hull.png"))
    wx = lambda u: CX0 + (u - C / 2) / PPU
    wz = lambda v: CZ0 - (v - C / 2) / PPU
    xc, zb = wx((u0 + u1) / 2), wz(v1)

    # 砲管：轉軸在左側 8%、垂直置中
    bc = load(f"barrel_{team}.png")
    b2 = bc.getbbox()
    c = C / 2
    left_ext, right_ext = c - (b2[0] - 2), (b2[2] + 2) - c
    half_h = int(math.ceil(max(c - (b2[1] - 2), (b2[3] + 2) - c)))
    w = int(math.ceil(max(right_ext, left_ext / 0.08) / 0.92))
    h = half_h * 2
    barrel = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ox = int(round(0.08 * w)) - int(round(left_ext))
    barrel.alpha_composite(bc.crop((b2[0] - 2, int(c) - half_h, b2[2] + 2, int(c) + half_h)), (ox, 0))
    barrel.save(os.path.join(OUT, f"snailer_{team}_barrel.png"))

    eyes = sorted(t["eyes"], key=lambda e: e[0])
    far, near = eyes[0], eyes[-1]
    results.append({
        "team": team,
        "hull": hull.size, "barrel": barrel.size,
        "pivotX": round((px - xc) * GP, 1),
        "pivotY": round(HULL_BASE_Y - (pz - zb) * GP, 1),
        "face_x": round(((far[0] + near[0]) / 2 - xc) * GP, 1),
        "face_y": round(HULL_BASE_Y - ((far[2] + near[2]) / 2 - zb) * GP, 1),
        "eye_dx": round(abs(near[0] - far[0]) * GP, 1),
        "top_game_px": round((wz(v0) - zb) * GP, 1),
        "width_game_px": round(hull.width * 0.4, 1),
    })
print(json.dumps(results, indent=2, ensure_ascii=False))
