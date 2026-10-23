"""把 snailer.blend 匯出成 GLB 給網頁檢視器用 (材質只留名稱，顏色由檢視器依名稱對應)。
用法: blender -b tools/blender/out/snailer/snailer.blend -P tools/blender/export_snailer_glb.py
"""
import bpy
import os

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
OUT = os.path.join(ROOT_DIR, "tools/blender/out/snailer/viewer/snailer.glb")

bpy.ops.object.select_all(action="DESELECT")
for o in list(bpy.data.objects):
    if o.type == "CURVE":
        bpy.context.view_layer.objects.active = o
        o.select_set(True)
        bpy.ops.object.convert(target="MESH")
        o.select_set(False)
for o in list(bpy.data.objects):
    if o.type in {"LIGHT", "CAMERA", "EMPTY"}:
        bpy.data.objects.remove(o, do_unlink=True)

bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_apply=True, export_materials="EXPORT",
                          export_cameras=False, export_lights=False, export_yup=True)
print("exported", OUT)
