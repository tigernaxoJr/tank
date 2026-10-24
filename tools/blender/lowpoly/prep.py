# 匯入高模 GLB → 合併、套用變換、焊接 UV 接縫拆開的頂點 → 輸出純幾何 PLY（給 MeshLab / 量測用）
#   blender --background --python prep.py -- <high.glb> <out_welded.ply> [weld=1e-5]
import bpy, bmesh, sys, time
argv = sys.argv[sys.argv.index("--") + 1:]
src, out = argv[0], argv[1]
weld = float(argv[2]) if len(argv) > 2 else 1e-5
t0 = time.time()
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
bpy.ops.object.select_all(action='DESELECT')
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1:
    bpy.ops.object.join()
ob = bpy.context.active_object
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
print("[prep] tris", sum(len(p.vertices) - 2 for p in ob.data.polygons), "verts", len(ob.data.vertices))
print("[prep] dims", tuple(round(d, 4) for d in ob.dimensions))
bm = bmesh.new()
bm.from_mesh(ob.data)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=weld)
nm = sum(1 for e in bm.edges if not e.is_manifold)
bd = sum(1 for e in bm.edges if e.is_boundary)
print(f"[prep] welded verts {len(bm.verts)} non-manifold edges {nm} boundary edges {bd}")
bm.to_mesh(ob.data)
bm.free()
while ob.data.uv_layers:
    ob.data.uv_layers.remove(ob.data.uv_layers[0])
bpy.ops.wm.ply_export(filepath=out, export_selected_objects=True, export_uv=False,
                      export_normals=False, export_colors='NONE', apply_modifiers=False,
                      ascii_format=False, forward_axis='Y', up_axis='Z')
print(f"[prep] wrote {out} ({time.time()-t0:.0f}s)")
