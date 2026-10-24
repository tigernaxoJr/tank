"""
slice_expr.py 切出的表情零件 -> 一張圖集 PNG + TS 影格表（遊戲的貼圖表情用）。
  python -I tools/sprites2d/pack_face_atlas.py <expr_dir> <id> [--scale 0.2]
輸出：public/assets/units/tanks/<id>_face.png、src/features/battle/domain/faceAtlases/<id>.ts
"""
import argparse, json, os
from PIL import Image
ap = argparse.ArgumentParser(); ap.add_argument("dir"); ap.add_argument("id"); ap.add_argument("--scale", type=float, default=0.2)
a = ap.parse_args()
items = sorted((f[:-4], Image.open(os.path.join(a.dir, f))) for f in os.listdir(a.dir) if f.endswith(".png"))
W, pad = 512, 2
x = y = row_h = 0; frames = {}
for n, im in sorted(items, key=lambda t: -t[1].height):
    if x + im.width + pad > W: x, y, row_h = 0, y + row_h + pad, 0
    frames[n] = (x, y, im.width, im.height); x += im.width + pad; row_h = max(row_h, im.height)
H = y + row_h
sheet = Image.new("RGBA", (W, H), (0, 0, 0, 0))
for n, im in items: sheet.paste(im, frames[n][:2])
os.makedirs("public/assets/units/tanks", exist_ok=True); os.makedirs("src/features/battle/domain/faceAtlases", exist_ok=True)
sheet.save(f"public/assets/units/tanks/{a.id}_face.png", optimize=True)
body = ",\n".join(f"    {n}: [{v[0]}, {v[1]}, {v[2]}, {v[3]}]" for n, v in sorted(frames.items()))
open(f"src/features/battle/domain/faceAtlases/{a.id}.ts", "w", encoding="utf-8", newline="\n").write(
f"""import type {{ FaceAtlas }} from '../tankBlueprint'

/** tools/sprites2d/pack_face_atlas.py 產生（來源：2D 生圖表情 sheet）；影格 = [x, y, w, h] */
export const {a.id.upper()}_FACE: FaceAtlas = {{
  key: '{a.id}_face',
  url: './assets/units/tanks/{a.id}_face.png',
  size: [{W}, {H}],
  /** 圖集像素 → 遊戲像素（眼球直徑 56px × 0.2 ≈ 眼柄頂球 11px） */
  scale: {a.scale},
  frames: {{
{body},
  }},
}}
""")
print(W, H, len(frames))
