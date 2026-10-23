"""
Snailer 遊戲用貼圖 (步驟 1/2)：在 Blender 裡把兩隊 (a/b) 的「車身」與「放平的砲管」各算繪成一張大畫布，
並記下轉軸、眼睛位置。裁切、縮小、補邊、算座標由 tools/blender/snailer_game_pack.py 用 PIL 完成 (Blender 內建 Python 沒有 PIL)。
用法:
  blender -b -P tools/blender/snailer_game.py
  python -I tools/blender/snailer_game_pack.py

規格 (見 docs/04 §六)：以 2.5 倍繪製、遊戲內 sprite.scale = 0.4 → 1 個 Blender 單位 = 20 遊戲像素。
  * 車身圖底邊 = 履帶接地面，水平中心 = 圖片中心 (Phaser origin 0.5, 1)。
  * 砲管圖水平朝右，轉軸在左側 8% 處、垂直置中 (Phaser origin 0.08, 0.5)。
  * 眼睛、瞳孔、嘴巴不畫進貼圖，由遊戲的 TankFace 疊上去 (眼睛會追著砲彈)。
"""

import bpy
import json
import os
import runpy
from mathutils import Vector

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
TMP = os.path.join(ROOT_DIR, "tools/blender/out/snailer/game_tmp")
os.makedirs(TMP, exist_ok=True)

GAME_PX_PER_UNIT = 20.0
SPRITE_SCALE = 0.4
OUT_PPU = GAME_PX_PER_UNIT / SPRITE_SCALE   # 輸出貼圖像素 / 單位 = 50
SS = 2                                      # 超取樣倍率；pack 步驟會縮回
CANVAS = 480                                # 輸出像素 (未超取樣)
CX0, CZ0 = 0.4, 2.4                         # 車身畫布中心 (世界座標)
BARREL_PARTS = ("barrel", "barrel_collar", "barrel_lip", "barrel_hole", "barrel_throat")
FACE_PARTS = ("eye_", "pupil_", "glint", "mouth")


def render_canvas(cam, path, cx, cz):
    bpy.data.objects["tgt"].location = (cx, 0, cz)
    cam.location = (cx, -14, cz)
    cam.data.ortho_scale = CANVAS / OUT_PPU
    sc = bpy.context.scene
    sc.render.resolution_x = sc.render.resolution_y = CANVAS * SS
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


def build_team(team):
    os.environ["SNAILER_NO_MAIN"] = "1"
    os.environ["SNAILER_TEAM"] = team
    bpy.ops.wm.read_factory_settings(use_empty=True)
    g = runpy.run_path(os.path.join(ROOT_DIR, "tools/blender/snailer.py"))
    g["setup_materials"]()
    g["build_treads"]()
    g["build_body"]()
    g["build_shell"]()
    g["build_barrel"]()
    g["build_flag"]()

    # 先記下眼睛位置 (face anchor)，再把臉從貼圖裡拿掉
    def center(o):  # transform_apply 已把位置烘進頂點，所以用包圍盒中心
        pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
        return [sum(p[i] for p in pts) / 8 for i in range(3)]

    eyes = [center(o) for o in bpy.data.objects if o.name.startswith("eye_")]
    for o in bpy.data.objects:
        if o.name.startswith(FACE_PARTS):
            o.hide_render = True

    cam, con = g["setup_scene"]((CANVAS * SS, CANVAS * SS))
    bpy.context.scene.render.line_thickness = 1.7 * SS
    for ls in bpy.context.view_layer.freestyle_settings.linesets:
        ls.linestyle.thickness = (1.7 if ls.name == "ink" else 0.6) * SS

    pivot = g["BARREL_PIVOT"]
    elev = g["BARREL_ELEV"]
    barrel_objs = [bpy.data.objects[n] for n in BARREL_PARTS if n in bpy.data.objects]

    for o in barrel_objs:
        o.hide_render = True
    render_canvas(cam, os.path.join(TMP, f"hull_{team}.png"), CX0, CZ0)

    for o in bpy.data.objects:
        if o.type in {"MESH", "CURVE"}:
            o.hide_render = o not in barrel_objs
    empty = bpy.data.objects.new("barrel_pivot", None)
    empty.location = (pivot.x, pivot.y, pivot.z)
    bpy.context.collection.objects.link(empty)
    bpy.context.view_layer.update()
    for o in barrel_objs:
        o.parent = empty
        o.matrix_parent_inverse = empty.matrix_world.inverted()
    empty.rotation_euler = (0, elev, 0)   # 繞 Y 軸往下轉 elev，讓砲管水平朝右
    bpy.context.view_layer.update()
    render_canvas(cam, os.path.join(TMP, f"barrel_{team}.png"), pivot.x, pivot.z)
    return {"team": team, "pivot": [pivot.x, pivot.y, pivot.z], "eyes": eyes}


meta = {
    "ppu": OUT_PPU, "game_px_per_unit": GAME_PX_PER_UNIT, "canvas": CANVAS, "ss": SS, "cx0": CX0, "cz0": CZ0,
    "teams": [build_team(t) for t in ("a", "b")],
}
with open(os.path.join(TMP, "meta.json"), "w", encoding="utf-8") as f:
    json.dump(meta, f, indent=2)
print("RENDERED", json.dumps(meta))
