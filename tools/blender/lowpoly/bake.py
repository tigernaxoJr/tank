# 高模 GLB → 低模 PLY：重拆 UV、烘焙 底色 / 金屬粗糙度(ORM) / 切線空間法線（OpenGL Y+，即 glTF 標準）→ 輸出 GLB
#   blender --background --python bake.py -- <high.glb> <low.ply> <out.glb> [tex=2048] [ext=0.03] [ray=0.1]
#                                           [normal=1] [orm=1] [angle=60] [device=GPU]
import bpy, bmesh, sys, os, time, math
argv = sys.argv[sys.argv.index("--") + 1:]
high_path, low_path, out_path = argv[0], argv[1], os.path.abspath(argv[2])
tex = int(argv[3]) if len(argv) > 3 else 2048
ext = float(argv[4]) if len(argv) > 4 else 0.03     # cage 外擴（模型高約 1.0，對角線 1.47）
ray = float(argv[5]) if len(argv) > 5 else 0.1      # 最大射線距離
do_n = (argv[6] == '1') if len(argv) > 6 else True
do_orm = (argv[7] == '1') if len(argv) > 7 else True
angle = float(argv[8]) if len(argv) > 8 else 60.0   # UV 切島角度 = 硬邊角度（硬邊落在 UV 接縫上，法線貼圖才不會出縫）
device = argv[9] if len(argv) > 9 else 'GPU'
t0 = time.time()
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

bpy.ops.import_scene.gltf(filepath=high_path)
hm = [o for o in scene.objects if o.type == 'MESH']
bpy.ops.object.select_all(action='DESELECT')
for o in hm:
    o.select_set(True)
bpy.context.view_layer.objects.active = hm[0]
if len(hm) > 1:
    bpy.ops.object.join()
high = bpy.context.active_object
high.name = "high"
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
hmat = high.data.materials[0]
hnt = hmat.node_tree
bsdf_h = next(n for n in hnt.nodes if n.type == 'BSDF_PRINCIPLED')
orm_img_node = None
for l in list(hnt.links):
    if l.to_node.type == 'SEPARATE_COLOR':
        orm_img_node = l.from_node
# 烘焙「漫反射色」時金屬會被壓暗，先把高模金屬度歸零（ORM 另外用 Emission 烘）
for l in list(bsdf_h.inputs["Metallic"].links):
    hnt.links.remove(l)
bsdf_h.inputs["Metallic"].default_value = 0.0

bpy.ops.wm.ply_import(filepath=low_path, forward_axis='Y', up_axis='Z')
low = bpy.context.active_object
low.name = "low"
me = low.data
for p in me.polygons:
    p.use_smooth = True
me.set_sharp_from_angle(angle=math.radians(angle))
low_tris = sum(len(p.vertices) - 2 for p in me.polygons)

# --- UV：Smart UV Project（以同一角度切島）+ 旋轉緊密打包 ---
bpy.ops.object.select_all(action='DESELECT')
low.select_set(True)
bpy.context.view_layer.objects.active = low
while me.uv_layers:
    me.uv_layers.remove(me.uv_layers[0])
me.uv_layers.new(name="UVMap")
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(angle), island_margin=0.0, area_weight=0.0, correct_aspect=True)
bpy.ops.uv.pack_islands(rotate=True, margin=4.0 / tex * 2, shape_method='CONCAVE')
bpy.ops.object.mode_set(mode='OBJECT')
print(f"[bake] low {low_tris} tris, UV done ({time.time()-t0:.0f}s)")

mat = bpy.data.materials.new("low_mat")
mat.use_nodes = True
nt = mat.node_tree
me.materials.clear()
me.materials.append(mat)

scene.render.engine = 'CYCLES'
scene.cycles.samples = 1
scene.cycles.use_denoising = False
if device == 'GPU':
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        for kind in ('OPTIX', 'CUDA'):
            try:
                prefs.compute_device_type = kind
                prefs.get_devices()
                if any(d.type == kind for d in prefs.devices):
                    for d in prefs.devices:
                        d.use = d.type == kind
                    scene.cycles.device = 'GPU'
                    print("[bake] device", kind)
                    break
            except TypeError:
                pass
    except Exception as e:
        print("[bake] GPU unavailable", e)
b = scene.render.bake
b.use_selected_to_active = True
b.cage_extrusion = ext
b.max_ray_distance = ray
b.margin = 16
b.margin_type = 'EXTEND'


def bake_into(name, btype, colorspace, fmt, **kw):
    img = bpy.data.images.new(name, tex, tex, alpha=False, float_buffer=(btype == 'NORMAL'))
    img.colorspace_settings.name = colorspace
    node = nt.nodes.new("ShaderNodeTexImage")
    node.image = img
    for n in nt.nodes:
        n.select = False
    node.select = True
    nt.nodes.active = node
    bpy.ops.object.select_all(action='DESELECT')
    high.select_set(True)
    low.select_set(True)
    bpy.context.view_layer.objects.active = low
    for k, v in kw.items():
        setattr(b, k, v)
    bpy.ops.object.bake(type=btype)
    path = os.path.join(os.path.dirname(out_path), "_tmp_" + name + (".jpg" if fmt == 'JPEG' else ".png"))
    s = scene.render.image_settings
    s.file_format = fmt
    s.color_mode = 'RGB'
    if fmt == 'JPEG':
        s.quality = 92
    else:
        s.color_depth = '8'
    img.save_render(path, scene=scene)
    out = bpy.data.images.load(path)
    out.colorspace_settings.name = colorspace
    out.pack()
    print(f"[bake] {name} done ({time.time()-t0:.0f}s)")
    return out


color = bake_into("color", 'DIFFUSE', 'sRGB', 'JPEG', use_pass_direct=False, use_pass_indirect=False,
                  use_pass_color=True)
orm = None
if do_orm and orm_img_node is not None:
    # 金屬 / 粗糙度：把高模 ORM 貼圖接到 Emission 直接烘（保留 G=粗糙、B=金屬 的打包格式）
    em = bsdf_h.inputs["Emission Color"]
    hnt.links.new(orm_img_node.outputs["Color"], em)
    bsdf_h.inputs["Emission Strength"].default_value = 1.0
    orm = bake_into("orm", 'EMIT', 'Non-Color', 'PNG')
    for l in list(em.links):
        hnt.links.remove(l)
nrm = None
if do_n:
    nrm = bake_into("normal", 'NORMAL', 'Non-Color', 'PNG', normal_space='TANGENT',
                    normal_r='POS_X', normal_g='POS_Y', normal_b='POS_Z')

# --- 接回標準 Principled BSDF（glTF 匯出器看得懂的接法） ---
for n in list(nt.nodes):
    nt.nodes.remove(n)
bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
outn = nt.nodes.new("ShaderNodeOutputMaterial")
nt.links.new(bsdf.outputs["BSDF"], outn.inputs["Surface"])
tc = nt.nodes.new("ShaderNodeTexImage")
tc.image = color
nt.links.new(tc.outputs["Color"], bsdf.inputs["Base Color"])
if orm:
    to = nt.nodes.new("ShaderNodeTexImage")
    to.image = orm
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(to.outputs["Color"], sep.inputs["Color"])
    nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
    nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
else:
    bsdf.inputs["Roughness"].default_value = 0.8
if nrm:
    tn = nt.nodes.new("ShaderNodeTexImage")
    tn.image = nrm
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nm.space = 'TANGENT'
    nm.uv_map = "UVMap"
    nt.links.new(tn.outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])

bpy.data.objects.remove(high, do_unlink=True)
bpy.ops.object.select_all(action='DESELECT')
low.select_set(True)
bpy.context.view_layer.objects.active = low
bpy.ops.export_scene.gltf(filepath=out_path, export_format='GLB', use_selection=True, export_image_format='AUTO',
                          export_tangents=bool(nrm))
for f in os.listdir(os.path.dirname(out_path)):
    if f.startswith("_tmp_"):
        os.remove(os.path.join(os.path.dirname(out_path), f))
print(f"RESULT {low_tris} tris tex={tex} ext={ext} ray={ray} -> {out_path} ({time.time()-t0:.0f}s)")
