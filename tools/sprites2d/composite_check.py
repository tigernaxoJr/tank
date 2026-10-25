"""
零件合成驗收圖：把 slice_parts.py 切好的零件依錨點組回整台，輸出砲管在多個仰角下的對照圖。
  python -I tools/sprites2d/composite_check.py <parts_dir> <out.png> [--id bastion] [--team a]
      --pivot 207,103          砲管轉軸（車身貼圖座標，護套開口圓心）
      --angles 14,45,80,90     砲管仰角（度，朝上為正）
      --flag 55,6              旗桿底端要插的位置（車身貼圖座標）
      --lid 130,70             艙蓋底部中心要放的位置（車身貼圖座標）
圖層順序：車身 -> 砲管（原點 8% / 50%，與引擎 origin(0.08, 0.5) 相同）-> 護套前圈（若有）-> 旗子 / 艙蓋。
每個仰角一格，格上畫轉軸十字；底色用灰，邊緣露縫、砲管底端穿出環外都看得出來。
"""
import argparse, json, os
from PIL import Image, ImageDraw

ap = argparse.ArgumentParser()
ap.add_argument("parts"); ap.add_argument("out")
ap.add_argument("--id", default="bastion"); ap.add_argument("--team", default="a")
ap.add_argument("--pivot", required=True)
ap.add_argument("--angles", default="14,45,80,90")
ap.add_argument("--flag"); ap.add_argument("--lid")
ap.add_argument("--zoom", type=int, default=2)
ap.add_argument("--icon-out", help="also bake the thumbnail <id>_<team>_icon.png into this dir: hull + flag + lid at rest, no barrel, tightly cropped "
                "(anchors must match the tank blueprint's parts; flag origin 0.18 / 1, lid origin 0.5 / 1)")
args = ap.parse_args()


def nums(s): return [float(t) for t in s.split(",")]


def load(name):
    p = f"{args.parts}/{args.id}_{args.team}_{name}.png"
    return Image.open(p).convert("RGBA") if os.path.exists(p) else None


hull, barrel, collar, flag, lid = (load(n) for n in ("hull", "barrel", "collar", "flag", "lid"))
meta = json.load(open(f"{args.parts}/parts_meta.json"))
px, py = nums(args.pivot)
PAD = 120                                   # 車身四周留白，砲管抬到 90° 才放得下
W, H = hull.width + PAD * 2, hull.height + PAD * 2
tiles = []
for ang in nums(args.angles):
    base = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    base.alpha_composite(hull, (PAD, PAD))
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ox, oy = PAD + px - barrel.width * 0.08, PAD + py - barrel.height * 0.5
    layer.alpha_composite(barrel, (round(ox), round(oy)))
    layer = layer.rotate(ang, center=(PAD + px, PAD + py), resample=Image.BICUBIC)
    base.alpha_composite(layer)
    if collar is not None:
        cx, cy = meta["collar_pos"]
        base.alpha_composite(collar, (PAD + cx, PAD + cy))
    if flag is not None and args.flag:
        fx, fy = nums(args.flag)
        base.alpha_composite(flag, (round(PAD + fx - flag.width * 0.18), round(PAD + fy - flag.height)))
    if lid is not None and args.lid:
        lx, ly = nums(args.lid)
        base.alpha_composite(lid, (round(PAD + lx - lid.width / 2), round(PAD + ly - lid.height)))
    bg = Image.new("RGBA", (W, H), (150, 160, 175, 255))
    bg.alpha_composite(base)
    d = ImageDraw.Draw(bg)
    d.line([(PAD + px - 6, PAD + py), (PAD + px + 6, PAD + py)], fill=(255, 0, 255, 255))
    d.line([(PAD + px, PAD + py - 6), (PAD + px, PAD + py + 6)], fill=(255, 0, 255, 255))
    d.text((6, 6), f"{ang:g} deg", fill=(0, 0, 0, 255))
    tiles.append(bg.resize((W * args.zoom, H * args.zoom), Image.LANCZOS))
if args.icon_out:
    icon = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    icon.alpha_composite(hull, (PAD, PAD))
    if flag is not None and args.flag:
        fx, fy = nums(args.flag)
        icon.alpha_composite(flag, (round(PAD + fx - flag.width * 0.18), round(PAD + fy - flag.height)))
    if lid is not None and args.lid:
        lx, ly = nums(args.lid)
        icon.alpha_composite(lid, (round(PAD + lx - lid.width / 2), round(PAD + ly - lid.height)))
    icon = icon.crop(icon.getbbox())
    os.makedirs(args.icon_out, exist_ok=True)
    icon.save(f"{args.icon_out}/{args.id}_{args.team}_icon.png")
    print("icon", icon.size)
cols = 2
rows = (len(tiles) + cols - 1) // cols
sheet = Image.new("RGBA", (tiles[0].width * cols, tiles[0].height * rows), (255, 255, 255, 255))
for i, t in enumerate(tiles):
    sheet.alpha_composite(t, ((i % cols) * t.width, (i // cols) * t.height))
sheet.convert("RGB").save(args.out)
print("saved", args.out, sheet.size)
