"""agy 生的洋紅底遠景圖 → 去背、縮放、左右無縫的 1024×400 視差圖層。
用法: python tools/assets/agy_bg_process.py <src_far.png> <out.png>
"""
import sys
import numpy as np
from PIL import Image

W, H = 1024, 400

def process(src, dst):
    im = Image.open(src).convert('RGB')
    a = np.asarray(im).astype(np.float32)
    # 洋紅程度：R、B 高且 G 低
    m = np.minimum(a[..., 0], a[..., 2]) - a[..., 1]
    alpha = 1 - np.clip((m - 60) / 100, 0, 1)
    # 去除邊緣粉紅溢色：把 R、B 壓到不超過 G 以上的合理值
    spill = np.clip((m - 20) / 100, 0, 1)[..., None]
    g = a[..., 1:2]
    a = a * (1 - spill) + np.concatenate([g, g, g], -1) * spill * 0.9
    rgba = np.dstack([a, alpha * 255]).clip(0, 255).astype(np.uint8)
    img = Image.fromarray(rgba, 'RGBA')
    bbox = img.getchannel('A').point(lambda v: 255 if v > 128 else 0).getbbox()
    img = img.crop((0, bbox[1], img.width, img.height))
    # 取中央一段縮成半幅，再接左右翻轉的自己：頭尾必定相接，不會有疊影
    C = round(img.width * 0.66)
    x0 = (img.width - C) // 2
    img = img.crop((x0, 0, x0 + C, img.height))
    s = (W // 2) / img.width
    img = img.resize((W // 2, round(img.height * s)), Image.LANCZOS)
    tile = np.concatenate([np.asarray(img), np.asarray(img)[:, ::-1]], axis=1)
    out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    h = min(tile.shape[0], H)
    out.paste(Image.fromarray(tile[-h:], 'RGBA'), (0, H - h))
    out.save(dst)

if __name__ == '__main__':
    process(sys.argv[1], sys.argv[2])
