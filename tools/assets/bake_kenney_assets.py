"""
Bake Kenney CC0 packs into the runtime assets under public/assets/kenney/.

Usage:
  python3 tools/assets/bake_kenney_assets.py <extracted-packs-dir>

<extracted-packs-dir> must contain the four unzipped packs (all CC0, by Kenney, via opengameart.org):
  tanks/       kenney_tanksPack.zip
  bg/          Background Elements Redux.zip
  platformer/  Platformer Pack Redux (360 assets).zip
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

# 地圖 -> 地表/土壤磚、整體色偏 (RGB 乘數)、遠山/中丘/近丘/雲層色
MAPS = {
    "emerald_valley": {
        "cap": "Grass/grassMid", "fill": "Grass/grassCenter", "mul": (1.0, 1.0, 1.0),
        "mountains": (150, 205, 235), "hills_far": (110, 200, 170), "hills_near": (70, 175, 120),
        "clouds": (255, 255, 255), "sky": ((2, 132, 199), (186, 230, 253)),
    },
    "sunset_canyon": {
        "cap": "Sand/sandMid", "fill": "Sand/sandCenter", "mul": (1.0, 0.8, 0.62),
        "mountains": (235, 150, 120), "hills_far": (215, 120, 80), "hills_near": (180, 85, 55),
        "clouds": (255, 214, 180), "sky": ((124, 45, 18), (254, 215, 170)),
    },
    "polar_glacier": {
        "cap": "Snow/snowMid", "fill": "Snow/snowCenter", "mul": (0.96, 1.0, 1.04),
        "mountains": (175, 200, 235), "hills_far": (150, 190, 225), "hills_near": (120, 165, 210),
        "clouds": (245, 250, 255), "sky": ((30, 58, 138), (224, 242, 254)),
    },
}

PROPS = {
    "emerald_valley": ["tree", "treeLong", "treeSmall_green1", "treeSmall_green2", "bush1", "bush2", "bush3"],
    "sunset_canyon": ["cactus1", "cactus2", "cactus3", "treeDead", "treePalm", "bushOrange1", "bushOrange2"],
    "polar_glacier": ["treePineSnow", "treeSnow", "treeLongSnow", "treePineFrozen", "bushAlt1", "bushAlt2"],
}
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


def recolor(img, rgb):
    """以亮度比例把淡藍色剪影元素重新上色，保留原圖的高光層次。"""
    img = img.convert("RGBA")
    px = list(img.get_flattened_data()) if hasattr(img, "get_flattened_data") else list(img.getdata())
    counts = {}
    for p in px:
        if p[3] > 200:
            counts[p[:3]] = counts.get(p[:3], 0) + 1
    base = max(counts, key=counts.get)
    base_l = max(1, sum(base) / 3)
    out = []
    for r, g, b, a in px:
        k = ((r + g + b) / 3) / base_l
        out.append((min(255, int(rgb[0] * k)), min(255, int(rgb[1] * k)), min(255, int(rgb[2] * k)), a))
    img.putdata(out)
    return img


def fade_bottom(img, start=0.45):
    """雲海底部是實心色塊：從 start 高度往下漸隱為透明，只保留雲頂輪廓。"""
    a = img.getchannel("A")
    h = img.height
    y0 = int(h * start)
    for y in range(y0, h):
        k = 1 - (y - y0) / (h - y0)
        row = a.crop((0, y, img.width, y + 1)).point(lambda v, k=k: int(v * k))
        a.paste(row, (0, y))
    img.putalpha(a)
    return img


def multiply(img, mul):
    if mul == (1.0, 1.0, 1.0):
        return img
    r, g, b, a = img.split()
    r = r.point(lambda v: min(255, int(v * mul[0])))
    g = g.point(lambda v: min(255, int(v * mul[1])))
    b = b.point(lambda v: min(255, int(v * mul[2])))
    return Image.merge("RGBA", (r, g, b, a))


def bake_thumbnail(out, spec):
    """大廳地圖縮圖：天空漸層 + 三層視差 + 地表磚。"""
    w, h = 512, 256
    top, bottom = spec["sky"]
    thumb = Image.new("RGBA", (w, h))
    for y in range(h):
        t = y / (h - 1)
        c = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)) + (255,)
        thumb.paste(c, (0, y, w, y + 1))
    for name, y in (("clouds_far", 0), ("mountains", 40), ("hills_far", 90), ("hills_near", 120)):
        layer = Image.open(os.path.join(out, f"{name}.png")).resize((w, 200), Image.LANCZOS)
        thumb.alpha_composite(layer, (0, y))
    cap = Image.open(os.path.join(out, "terrain_cap.png"))
    for x in range(0, w, cap.width):
        thumb.alpha_composite(cap, (x, 190))
    thumb.convert("RGB").resize((256, 128), Image.LANCZOS).save(os.path.join(out, "thumbnail.png"))


def bake_maps(src):
    ground = os.path.join(src, "platformer", "PNG", "Ground")
    elements = os.path.join(src, "bg", "Backgrounds", "Elements")
    props_src = os.path.join(src, "bg", "PNG", "Default")
    for map_id, spec in MAPS.items():
        out = ensure(os.path.join(OUT, "maps", map_id))
        for kind in ("cap", "fill"):
            tile = rgba(os.path.join(ground, spec[kind] + ".png")).resize((128, 128), Image.LANCZOS)
            multiply(tile, spec["mul"]).save(os.path.join(out, f"terrain_{kind}.png"))
        recolor(rgba(os.path.join(elements, "mountains.png")), spec["mountains"]).save(os.path.join(out, "mountains.png"))
        recolor(rgba(os.path.join(elements, "hillsLarge.png")), spec["hills_far"]).save(os.path.join(out, "hills_far.png"))
        recolor(rgba(os.path.join(elements, "hills.png")), spec["hills_near"]).save(os.path.join(out, "hills_near.png"))
        fade_bottom(recolor(rgba(os.path.join(elements, "cloudLayer1.png")), spec["clouds"])).save(os.path.join(out, "clouds_far.png"))
        bake_thumbnail(out, spec)
        for i, name in enumerate(PROPS[map_id]):
            rgba(os.path.join(props_src, name + ".png")).save(os.path.join(out, f"prop{i}.png"))
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
    bake_maps(src_dir)
    bake_fx(src_dir)
