# 逐頂點「重要度」原料：(1) 真實厚度（跳過 TRELLIS 雙層殼的內層後，沿 -法線 到對面的距離）
#                       (2) 貼圖顏色對比（金色飾帶 / 眼睛 / 鉚釘邊緣）
#   blender --background --python weights.py -- <high.glb> <out.npz> [weld=1e-5] [skip=0.004]
import bpy, bmesh, sys, time
import numpy as np
from mathutils.bvhtree import BVHTree
argv = sys.argv[sys.argv.index("--") + 1:]
src, out = argv[0], argv[1]
weld = float(argv[2]) if len(argv) > 2 else 1e-5
skip = float(argv[3]) if len(argv) > 3 else 0.004  # 雙層殼壁厚約 0.002，小於 skip 的命中視為同一面牆
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
me = ob.data

# --- 貼圖取樣到逐頂點顏色 ---
img = None
for n in me.materials[0].node_tree.nodes:
    if n.type == 'BSDF_PRINCIPLED':
        l = n.inputs['Base Color'].links
        if l and l[0].from_node.type == 'TEX_IMAGE':
            img = l[0].from_node.image
W, H = img.size
px = np.empty(W * H * 4, np.float32)
img.pixels.foreach_get(px)
px = px.reshape(H, W, 4)[:, :, :3]
nl = len(me.loops)
uv = np.empty(nl * 2, np.float32)
me.uv_layers.active.data.foreach_get('uv', uv)
uv = uv.reshape(-1, 2)
lv = np.empty(nl, np.int64)
me.loops.foreach_get('vertex_index', lv)
xi = np.clip((uv[:, 0] % 1.0) * W, 0, W - 1).astype(int)
yi = np.clip((uv[:, 1] % 1.0) * H, 0, H - 1).astype(int)
lc = px[yi, xi]
nv = len(me.vertices)
col = np.zeros((nv, 3))
cnt = np.zeros(nv)
np.add.at(col, lv, lc)
np.add.at(cnt, lv, 1)
col /= np.maximum(cnt, 1)[:, None]
attr = me.attributes.new("c", 'FLOAT_COLOR', 'POINT')
attr.data.foreach_set('color', np.hstack([col, np.ones((nv, 1))]).astype(np.float32).ravel())
print(f"[w] sampled texture {W}x{H} ({time.time()-t0:.0f}s)")

# --- 焊接（同 prep.py） ---
bm = bmesh.new()
bm.from_mesh(me)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=weld)
bm.to_mesh(me)
bm.free()
nv = len(me.vertices)
pos = np.empty(nv * 3)
me.vertices.foreach_get('co', pos)
pos = pos.reshape(-1, 3)
c4 = np.empty(nv * 4, np.float32)
me.attributes['c'].data.foreach_get('color', c4)
col = c4.reshape(-1, 4)[:, :3]
ne = len(me.edges)
ev = np.empty(ne * 2, np.int64)
me.edges.foreach_get('vertices', ev)
ev = ev.reshape(-1, 2)

# 顏色對比：相鄰頂點顏色差的最大值（Rec.709 加權 + 色度），再向外擴散 2 圈
lum = col @ np.array([0.2126, 0.7152, 0.0722])
d = np.abs(lum[ev[:, 0]] - lum[ev[:, 1]]) + 0.5 * np.linalg.norm(col[ev[:, 0]] - col[ev[:, 1]], axis=1)
con = np.zeros(nv)
np.maximum.at(con, ev[:, 0], d)
np.maximum.at(con, ev[:, 1], d)
for _ in range(2):
    c2 = con.copy()
    np.maximum.at(c2, ev[:, 0], con[ev[:, 1]] * 0.8)
    np.maximum.at(c2, ev[:, 1], con[ev[:, 0]] * 0.8)
    con = c2
print(f"[w] contrast pct50/90/99 {np.percentile(con,[50,90,99])}")

# --- 真實厚度 ---
me.update()
nrm = np.empty(nv * 3)
me.vertices.foreach_get('normal', nrm)
nrm = nrm.reshape(-1, 3)
bvh = BVHTree.FromObject(ob, bpy.context.evaluated_depsgraph_get())
thick = np.full(nv, 9.0)
from mathutils import Vector
for i in range(nv):
    p = Vector(pos[i]); n = Vector(nrm[i])
    o = p - n * 1e-5
    acc = 0.0
    for _ in range(4):  # 最多穿過幾層，略過 skip 以內的「同一面牆」
        h = bvh.ray_cast(o, -n, 1.0)
        if h[0] is None:
            break
        acc += h[3]
        if acc > skip:
            thick[i] = acc
            break
        o = h[0] - n * 1e-5
print(f"[w] thickness pct5/25/50/75 {np.percentile(thick,[5,25,50,75])} ({time.time()-t0:.0f}s)")
np.savez(out, pos=pos, thick=thick, con=con, col=col)
print("[w] wrote", out)
