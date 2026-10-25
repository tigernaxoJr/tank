"""把 raw/ 的 4 張洋紅底 sheet 切成單件素材，輸出到 public/assets/ui2/<sheet>/<name>.png。

用法：python -I tools/assets/agy-ui/slice_ui.py [--out public/assets/ui2] [--preview <dir>]

做法：洋紅度 min(R,B)-G 轉成軟 alpha（連同紫色柔影一起去掉）、邊緣去洋紅色邊；
以膨脹後的連通區塊找出每件（不依賴固定格寬），再依「列 → 欄」排序並套用 NAMES 命名。
件數與預期不符就報錯，不硬切。
"""
import argparse
import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]

BTN = ["primary", "secondary", "danger", "sky"]
NAMES = {
    "ui_kit": [
        "btn_gold", "btn_gold_pressed", "btn_gold_disabled",
        "btn_white", "btn_white_pressed", "btn_white_disabled",
        "btn_coral", "btn_coral_pressed", "btn_sky", "btn_sky_pressed", "pill", "ribbon",
        "panel", "ticket", "seat_empty", "seat_occupied", "seat_ready", "seat_host",
        "toggle_off", "toggle_on", "slot", "slot_selected", "badge", "banner",
    ],
    "icons": [
        "shell", "arrow_left", "arrow_up", "skip", "wind", "fuel", "heart", "shield",
        "poison", "freeze", "drench", "gear", "sound_on", "sound_off", "copy", "check",
        "crown", "robot", "lock", "radar", "pause", "close", "chevron_left", "plus",
        "link", "trophy", "skull", "target", "refresh", "question", "person", "clock",
    ],
    "gauges": [
        "fire_idle", "fire_charging", "fire_disabled",
        "angle_dial", "fuel_ring", "timer_ring",
        "wind_compass", "hp_bar", "move_btn",
    ],
    "title": ["logo", "flag", "sandbags", "cloud_big", "cloud_small", "starburst"],
}
# 每張 sheet 的列數（title 是 Logo 一列 + 裝飾一列）
ROWS = {"ui_kit": 4, "icons": 4, "gauges": 3, "title": 2}
# 膨脹半徑（px）：把同一件的零碎部分（徽章、皇冠、高光）併回主體，但不跨到相鄰格
GROUP_PX = {"ui_kit": 14, "icons": 12, "gauges": 5, "title": 14}
PAD = 3


def magenta_alpha(rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """回傳（alpha 0..1, 去色邊後的 RGB）。"""
    f = rgb.astype(np.float32)
    r, g, b = f[..., 0], f[..., 1], f[..., 2]
    mag = np.minimum(r, b) - g
    lo, hi = 15.0, 100.0
    alpha = 1.0 - np.clip((mag - lo) / (hi - lo), 0, 1)
    # 去色邊：把 R、B 超出 G 的部分整個壓回去（金 / 橘 / 藍 / 奶油 / 白本來就不會觸發），
    # 發光外圈（金色混洋紅）因此不再泛粉紅
    spill = np.clip(mag, 0, None)
    out = f.copy()
    out[..., 0] = r - spill
    out[..., 2] = b - spill
    return alpha, np.clip(out, 0, 255)


def find_items(alpha: np.ndarray, group_px: int) -> list[tuple[int, int, int, int]]:
    solid = (alpha > 0.5).astype(np.uint8)
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (group_px * 2 + 1, group_px * 2 + 1))
    grouped = cv2.dilate(solid, k)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(grouped, connectivity=8)
    boxes = []
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] < 600:  # 雜點
            continue
        m = (labels == i) & (solid > 0)
        ys, xs = np.where(m)
        if len(xs):
            boxes.append((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    return merge_contained(boxes)


def merge_contained(boxes):
    """外框相交的區塊併成一件（虛線圓圈被切成兩半、圈中的加號、環內的圖案）。"""
    boxes = [tuple(int(v) for v in b) for b in boxes]
    changed = True
    while changed:
        changed = False
        for i in range(len(boxes)):
            for j in range(i + 1, len(boxes)):
                a, b = boxes[i], boxes[j]
                if a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]:
                    boxes[i] = (min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3]))
                    del boxes[j]
                    changed = True
                    break
            if changed:
                break
    return boxes


def order_boxes(boxes, rows: int):
    """依 y 中心分成 rows 列，每列內由左到右。"""
    boxes = sorted(boxes, key=lambda b: (b[1] + b[3]) / 2)
    cy = np.array([(b[1] + b[3]) / 2 for b in boxes], dtype=np.float32)
    # 以最大的 rows-1 個 y 間隙切列
    gaps = np.diff(cy)
    cuts = sorted(np.argsort(gaps)[::-1][: rows - 1] + 1)
    out, start = [], 0
    for c in list(cuts) + [len(boxes)]:
        out.extend(sorted(boxes[start:c], key=lambda b: (b[0] + b[2]) / 2))
        start = c
    return out


def crop(alpha, rgb, box, mask_keep=None) -> Image.Image:
    x0, y0, x1, y1 = box
    x0, y0 = max(0, x0 - PAD), max(0, y0 - PAD)
    x1, y1 = min(alpha.shape[1], x1 + PAD), min(alpha.shape[0], y1 + PAD)
    a = alpha[y0:y1, x0:x1]
    # 只留這一件附近：相鄰件的像素屬於別的 box，不在本 box 內不會被切到，這裡不需額外處理
    rgba = np.dstack([rgb[y0:y1, x0:x1], a * 255]).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


def clear_timer_arc(im: Image.Image) -> Image.Image:
    """計時環內側預先畫好的金色弧線會和程式畫的進度環重疊：
    從圓心洪水填滿奶油色區域，取最小外接圓，整圈塗回奶油色。"""
    arr = np.array(im)
    h, w = arr.shape[:2]
    # 錐形底座的鬧鐘：圓心在外框下方約 58% 處
    cx, cy = w // 2, int(h * 0.60)
    cream = arr[cy, cx, :3].astype(np.int16)
    close = (np.abs(arr[..., :3].astype(np.int16) - cream).sum(axis=2) < 40) & (arr[..., 3] > 200)
    n, lab = cv2.connectedComponents(close.astype(np.uint8))
    region = (lab == lab[cy, cx]).astype(np.uint8)
    cnts, _ = cv2.findContours(region, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    (ox, oy), r = cv2.minEnclosingCircle(max(cnts, key=cv2.contourArea))
    fill = np.zeros((h, w), np.uint8)
    cv2.circle(fill, (int(ox), int(oy)), int(r * 0.97), 1, -1)
    arr[fill > 0, :3] = cream.astype(np.uint8)
    arr[fill > 0, 3] = 255
    return Image.fromarray(arr, "RGBA")


def glow_to_gold(im: Image.Image) -> Image.Image:
    """選中槽的外圈光暈被畫成粉紅：把紅 / 粉紅色相（含半透明邊）轉成金色。"""
    arr = np.array(im)
    hsv = cv2.cvtColor(arr[..., :3], cv2.COLOR_RGB2HSV)
    hue = hsv[..., 0].astype(np.int16)
    m = ((hue <= 8) | (hue >= 160)) & (hsv[..., 1] > 30)
    hsv[..., 0] = np.where(m, 22, hsv[..., 0]).astype(np.uint8)
    arr[..., :3] = cv2.cvtColor(hsv, cv2.COLOR_HSV2RGB)
    return Image.fromarray(arr, "RGBA")


def teal_to_blue(im: Image.Image) -> Image.Image:
    """雷達圖示整面偏青綠，違反「禁用濁青」：把青綠色相（約 160°~196°）轉成天藍。"""
    arr = np.array(im)
    hsv = cv2.cvtColor(arr[..., :3], cv2.COLOR_RGB2HSV)
    hue = hsv[..., 0].astype(np.int16)
    m = (hue >= 78) & (hue <= 99) & (hsv[..., 1] > 40)
    hsv[..., 0] = np.where(m, 107, hsv[..., 0]).astype(np.uint8)
    arr[..., :3] = cv2.cvtColor(hsv, cv2.COLOR_HSV2RGB)
    return Image.fromarray(arr, "RGBA")


def process(sheet: str, out_dir: Path, previews: dict) -> list[dict]:
    src = HERE / "raw" / f"{sheet}_raw.png"
    rgb = np.array(Image.open(src).convert("RGB"))
    alpha, clean = magenta_alpha(rgb)
    boxes = order_boxes(find_items(alpha, GROUP_PX[sheet]), ROWS[sheet])
    names = NAMES[sheet]
    if len(boxes) != len(names):
        sys.exit(f"[{sheet}] 找到 {len(boxes)} 件，預期 {len(names)} 件；請檢查原圖或調整 GROUP_PX")
    out_dir.mkdir(parents=True, exist_ok=True)
    items, ims = [], {}
    for name, box in zip(names, boxes):
        ims[name] = crop(alpha, clean, box)
    if sheet == "ui_kit":
        # 珊瑚按鈕的「按下」態：正常態調暗 18%，保留同一個形狀
        base = np.array(ims["btn_coral"]).astype(np.float32)
        base[..., :3] *= 0.82
        ims["btn_coral_pressed"] = Image.fromarray(base.astype(np.uint8), "RGBA")
    if sheet == "gauges":
        ims["timer_ring"] = clear_timer_arc(ims["timer_ring"])
    if sheet == "ui_kit":
        ims["slot_selected"] = glow_to_gold(ims["slot_selected"])
    if sheet == "title":
        # Logo 原圖 1211 px 寬，遊戲裡最大顯示約 420 CSS px；縮到 840 px（2x）省載入量
        lg = ims["logo"]
        ims["logo"] = lg.resize((840, round(lg.height * 840 / lg.width)), Image.LANCZOS)
    if sheet == "icons":
        ims["radar"] = teal_to_blue(ims["radar"])
    for name in names:
        im = ims[name]
        im.save(out_dir / f"{name}.png", optimize=True)
        items.append({"name": name, "w": im.width, "h": im.height})
    previews[sheet] = [(n, ims[n]) for n in names]
    return items


def contact_sheet(sheet: str, ims: list, bg: tuple[int, int, int], cols: int) -> Image.Image:
    cell = 190
    rows = (len(ims) + cols - 1) // cols
    sheet_im = Image.new("RGB", (cols * cell, rows * cell), bg)
    for i, (_, im) in enumerate(ims):
        s = min(1.0, (cell - 20) / max(im.size))
        t = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.LANCZOS)
        x = (i % cols) * cell + (cell - t.width) // 2
        y = (i // cols) * cell + (cell - t.height) // 2
        sheet_im.paste(t, (x, y), t)
    return sheet_im


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(ROOT / "public/assets/ui2"))
    ap.add_argument("--preview", help="輸出三種背景（白 / 深 / 灰）的檢視圖到此資料夾")
    args = ap.parse_args()
    out = Path(args.out)
    previews: dict = {}
    manifest = {s: process(s, out / s, previews) for s in NAMES}
    (out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    for s, items in manifest.items():
        print(s, len(items), "件")
    if args.preview:
        pv = Path(args.preview)
        pv.mkdir(parents=True, exist_ok=True)
        cols = {"ui_kit": 6, "icons": 8, "gauges": 3, "title": 3}
        for s, ims in previews.items():
            bgs = [(255, 255, 255), (30, 36, 60), (140, 140, 140)]
            tiles = [contact_sheet(s, ims, bg, cols[s]) for bg in bgs]
            w = sum(t.width for t in tiles[:1])
            if s in ("icons", "ui_kit"):
                # 寬的 sheet：三種背景直向疊
                canvas = Image.new("RGB", (tiles[0].width, sum(t.height for t in tiles)))
                y = 0
                for t in tiles:
                    canvas.paste(t, (0, y)); y += t.height
            else:
                canvas = Image.new("RGB", (sum(t.width for t in tiles), tiles[0].height))
                x = 0
                for t in tiles:
                    canvas.paste(t, (x, 0)); x += t.width
            canvas.save(pv / f"{s}_preview.png")
            print("preview", pv / f"{s}_preview.png")


if __name__ == "__main__":
    main()
