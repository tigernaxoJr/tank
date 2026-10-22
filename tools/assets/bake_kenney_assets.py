"""
Bake Kenney CC0 packs into the runtime assets under public/assets/kenney/.

Usage:
  python3 tools/assets/bake_kenney_assets.py <extracted-packs-dir>

<extracted-packs-dir> must contain the three unzipped packs (all CC0, by Kenney, via opengameart.org):
  tanks/       kenney_tanksPack.zip
  bg/          Background Elements Redux.zip (only the sun)
  smoke/       smokeParticleAssets.zip

Only Pillow is required. Output is deterministic, so re-running overwrites the same files.
"""
import json
import os
import sys

from PIL import Image, ImageChops, ImageStat

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "public", "assets", "kenney")

# 坦克型號 -> (車身編號, 履帶候選, 砲管編號)
TANK_PARTS = {
    "aegis": (1, "turret1"),
    "goliath": (3, "turret2"),
    "zephyr": (2, "turret1"),
}
TEAM_COLORS = {"a": "Desert", "b": "Navy"}

TANK_PROPS = ["tanks_crateWood", "tanks_crateAmmo", "tanks_barrelRed", "tanks_barrelGrey"]

# FX 序列: (資料夾, 檔名前綴, 取用的影格, 輸出單格邊長)
FX = {
    "explosion": ("Explosion", "explosion", list(range(0, 9)), 192),
    "flash": ("Flash", "flash", list(range(0, 9)), 128),
    "puff": ("White puff", "whitePuff", list(range(0, 25, 3)), 96),
    "smoke": ("Black smoke", "blackSmoke", list(range(0, 25, 3)), 96),
}


def ensure(path):
    os.makedirs(path, exist_ok=True)
    return path


def rgba(path):
    return Image.open(path).convert("RGBA")


def best_offset(full, part):
    """在完整戰車圖中找出零件的貼合位置（僅比較零件不透明像素）。"""
    mask = part.getchannel("A").point(lambda a: 255 if a > 200 else 0)
    part_rgb = part.convert("RGB")
    best = None
    for oy in range(0, full.height - part.height + 1):
        for ox in range(0, full.width - part.width + 1):
            crop = full.crop((ox, oy, ox + part.width, oy + part.height)).convert("RGB")
            diff = ImageChops.difference(crop, part_rgb)
            score = sum(ImageStat.Stat(diff, mask).mean)
            if best is None or score < best[0]:
                best = (score, ox, oy)
    return best


def bake_tanks(src):
    d = os.path.join(src, "tanks", "PNG", "Retina")
    out = ensure(os.path.join(OUT, "tanks"))
    meta = {}
    for tank_id, (body_no, turret) in TANK_PARTS.items():
        for team, color in TEAM_COLORS.items():
            full = rgba(os.path.join(d, f"tanks_tank{color}{body_no}.png"))
            body = rgba(os.path.join(d, f"tanks_tank{color}_body{body_no}.png"))
            _, bx, by = best_offset(full, body)
            # 履帶：從 1/2/3/6 中挑出與完整圖最吻合者
            tracks_best = None
            for t in (1, 2, 3):
                tr = rgba(os.path.join(d, f"tanks_tankTracks{t}.png"))
                if tr.width > full.width or tr.height > full.height:
                    continue
                score, tx, ty = best_offset(full, tr)
                if tracks_best is None or score < tracks_best[0]:
                    tracks_best = (score, tx, ty, tr)
            _, tx, ty, tr = tracks_best
            left = min(bx, tx)
            top = min(by, ty)
            right = max(bx + body.width, tx + tr.width)
            bottom = max(by + body.height, ty + tr.height)
            hull = Image.new("RGBA", (right - left, bottom - top))
            hull.alpha_composite(tr, (tx - left, ty - top))
            hull.alpha_composite(body, (bx - left, by - top))
            hull.save(os.path.join(out, f"{tank_id}_{team}_hull.png"))
            rgba(os.path.join(d, f"tanks_{turret}.png")).save(os.path.join(out, f"{tank_id}_{team}_barrel.png"))
            meta[f"{tank_id}_{team}"] = {"hull": hull.size, "bodyTop": by - top, "bodyHeight": body.height}
    print(json.dumps(meta, indent=1))


def bake_props(src):
    """共用道具：太陽、木箱 / 油桶（地圖背景與地表磚已改為原創主題，見 paint_map_themes.mjs）。"""
    props_src = os.path.join(src, "bg", "PNG", "Default")
    common = ensure(os.path.join(OUT, "props"))
    rgba(os.path.join(props_src, "sun.png")).save(os.path.join(common, "sun.png"))
    tanks_default = os.path.join(src, "tanks", "PNG", "Retina")
    for name in TANK_PROPS:
        rgba(os.path.join(tanks_default, name + ".png")).save(os.path.join(common, name.replace("tanks_", "") + ".png"))
    for name in ("tank_bullet2", "tank_bullet4", "tank_bullet3"):
        rgba(os.path.join(tanks_default, name + ".png")).save(os.path.join(common, name.replace("tank_", "") + ".png"))


def bake_fx(src):
    out = ensure(os.path.join(OUT, "fx"))
    for key, (folder, prefix, frames, size) in FX.items():
        strip = Image.new("RGBA", (size * len(frames), size))
        for i, f in enumerate(frames):
            im = rgba(os.path.join(src, "smoke", "PNG", folder, f"{prefix}{f:02d}.png"))
            im.thumbnail((size, size), Image.LANCZOS)
            strip.alpha_composite(im, (i * size + (size - im.width) // 2, (size - im.height) // 2))
        strip.save(os.path.join(out, f"{key}.png"), optimize=True)
        print(key, len(frames), "frames @", size)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    src_dir = sys.argv[1]
    bake_tanks(src_dir)
    bake_props(src_dir)
    bake_fx(src_dir)
