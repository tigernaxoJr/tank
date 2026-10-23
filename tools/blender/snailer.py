"""
蝸牛迫擊砲 (Snailer) 程序化建模 + 卡通算繪 (v4：忠於原圖——大殼坐在履帶上、殼口被砲管托架蓋住、
乾淨卡通平塗 + 克制的材質紋理)
用法:
  blender -b -P tools/blender/snailer.py

座標: +X = 車頭, +Y = 左右, +Z = 上。側視相機在 -Y 看向 +Y，所以車頭朝畫面右邊。
產出 tools/blender/out/snailer/<view>.png (side/front/back/top/threeq) + snailer.blend
"""

import bpy
import math
import os
from mathutils import Vector

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
OUT = os.path.join(ROOT_DIR, "tools/blender/out/snailer")
os.makedirs(OUT, exist_ok=True)

NAVY = "#1d2340"


def srgb(hex_str):
    h = hex_str.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [(v / 12.92) if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c]
    return (lin[0], lin[1], lin[2], 1.0)


# ───────────────────────── 材質：卡通色階 + 每種材料專屬紋理 ─────────────────────────

class Tex:
    """在一張材質的節點樹上疊加紋理層的小工具。座標一律用 Object 座標。"""

    def __init__(self, nt):
        self.nt = nt
        self.coord = nt.nodes.new("ShaderNodeTexCoord")

    def _map(self, scale=(1, 1, 1), rot=(0, 0, 0), loc=(0, 0, 0)):
        m = self.nt.nodes.new("ShaderNodeMapping")
        m.inputs["Scale"].default_value = scale
        m.inputs["Rotation"].default_value = rot
        m.inputs["Location"].default_value = loc
        self.nt.links.new(self.coord.outputs["Object"], m.inputs["Vector"])
        return m

    def noise(self, scale, detail=3.0, rough=0.55, stretch=(1, 1, 1), rot=(0, 0, 0), seed=0.0):
        m = self._map(scale=stretch, rot=rot, loc=(seed, seed * 0.7, seed * 1.3))
        n = self.nt.nodes.new("ShaderNodeTexNoise")
        n.inputs["Scale"].default_value = scale
        n.inputs["Detail"].default_value = detail
        n.inputs["Roughness"].default_value = rough
        self.nt.links.new(m.outputs[0], n.inputs["Vector"])
        return n.outputs["Fac"]

    def voronoi(self, scale, feature="F1", stretch=(1, 1, 1), seed=0.0):
        m = self._map(scale=stretch, loc=(seed, seed, seed))
        v = self.nt.nodes.new("ShaderNodeTexVoronoi")
        v.feature = feature
        v.inputs["Scale"].default_value = scale
        self.nt.links.new(m.outputs[0], v.inputs["Vector"])
        return v.outputs["Distance"]

    def checker(self, scale, rot=(0, 0, 0)):
        m = self._map(rot=rot)
        c = self.nt.nodes.new("ShaderNodeTexChecker")
        c.inputs["Scale"].default_value = scale
        c.inputs["Color1"].default_value = (1, 1, 1, 1)
        c.inputs["Color2"].default_value = (0, 0, 0, 1)
        self.nt.links.new(m.outputs[0], c.inputs["Vector"])
        return c.outputs["Fac"]

    def thresh(self, fac, lo, hi):
        r = self.nt.nodes.new("ShaderNodeValToRGB")
        r.color_ramp.elements[0].position = lo
        r.color_ramp.elements[0].color = (0, 0, 0, 1)
        r.color_ramp.elements[1].position = hi
        r.color_ramp.elements[1].color = (1, 1, 1, 1)
        self.nt.links.new(fac, r.inputs[0])
        return r.outputs["Color"]

    def scale_fac(self, fac, k):
        m = self.nt.nodes.new("ShaderNodeMath")
        m.operation = "MULTIPLY"
        m.inputs[1].default_value = k
        self.nt.links.new(fac, m.inputs[0])
        return m.outputs[0]

    def layer(self, color_in, hex_str, fac):
        mix = self.nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.blend_type = "MIX"
        self.nt.links.new(fac, mix.inputs[0])
        self.nt.links.new(color_in, mix.inputs[6])
        mix.inputs[7].default_value = srgb(hex_str)
        return mix.outputs[2]


def adjust(hex_str, f):
    """f<1 變暗，f>1 往白色提亮；用來由隊伍色推導同色系的暗部 / 亮部 / 磨損色。"""
    h = hex_str.lstrip("#")
    c = [int(h[i:i + 2], 16) for i in (0, 2, 4)]
    if f <= 1:
        c = [v * f for v in c]
    else:
        t = min(1.0, f - 1.0)
        c = [v + (255 - v) * t for v in c]
    return "#%02X%02X%02X" % tuple(int(max(0, min(255, v))) for v in c)


# 隊伍色：琥珀橘 (A) / 皇家藍 (B)，套在履帶側板、砲管環箍、旗子
TEAM_ACCENT = {"a": "#D9843A", "b": "#2F6FE0"}
ACCENT = TEAM_ACCENT.get(os.environ.get("SNAILER_TEAM", "a"), TEAM_ACCENT["a"])


def paint(kind, T, base):
    """每種材料專屬的記號（克制：只留原圖有的——細刮痕、少量崩漆、舊補丁）。回傳最終底色 socket。"""
    col = base
    if kind == "blue":  # 鉚接鋼板上的藍漆：大塊淡淡的色斑、少量崩漆、極細白刮痕
        col = T.layer(col, "#5E9ED8", T.scale_fac(T.thresh(T.noise(3.2, 5, 0.65, seed=9), 0.56, 0.8), 0.4))
        col = T.layer(col, "#D5E8F7", T.thresh(T.noise(6, 6, 0.62, seed=3), 0.668, 0.682))
        col = T.layer(col, "#F2F8FD", T.thresh(T.noise(60, 2, 0.5, stretch=(1.0, 0.3, 0.06), rot=(0, 0.5, 0), seed=7), 0.728, 0.74))
    elif kind == "gold":  # 黃銅：極淡拉絲、少量亮斑、深金色細刮痕（原圖那種短斜線）
        col = T.layer(col, "#D69A22", T.scale_fac(T.thresh(T.noise(70, 2, 0.5, stretch=(0.08, 1.0, 0.08), seed=1), 0.45, 0.8), 0.3))
        col = T.layer(col, "#FFE08A", T.thresh(T.noise(6.5, 6, 0.6, seed=4), 0.668, 0.682))
        col = T.layer(col, "#B77A10", T.thresh(T.noise(55, 2, 0.5, stretch=(1.0, 0.25, 0.05), rot=(0, 0.4, 0), seed=8), 0.722, 0.735))
    elif kind == "blue_skin":  # 蝸牛皮：很淡的小疙瘩 + 少量白漆磨損
        dots = T.thresh(T.voronoi(16, "F1", seed=2), 0.0, 0.2)
        inv = T.nt.nodes.new("ShaderNodeMath")
        inv.operation = "SUBTRACT"
        inv.inputs[0].default_value = 1.0
        T.nt.links.new(dots, inv.inputs[1])
        col = T.layer(col, "#A5D0F4", T.scale_fac(inv.outputs[0], 0.35))
        col = T.layer(col, "#F0F7FD", T.thresh(T.noise(5.0, 5, 0.6, seed=11), 0.645, 0.66))
        col = T.layer(col, "#5E9ED8", T.scale_fac(T.thresh(T.noise(2.8, 4, 0.6, seed=13), 0.55, 0.75), 0.3))
    elif kind == "mantle":  # 披肩：淺藍白，大片白漆磨損（原圖披肩邊緣有白色刷痕）
        col = T.layer(col, "#8FC2EA", T.scale_fac(T.thresh(T.noise(3.0, 4, 0.6, seed=21), 0.5, 0.75), 0.55))
        col = T.layer(col, "#FFFFFF", T.thresh(T.noise(4.2, 5, 0.62, seed=23), 0.57, 0.585))
        col = T.layer(col, "#E3F0FB", T.thresh(T.noise(55, 2, 0.5, stretch=(1.0, 0.3, 0.06), rot=(0, 0.3, 0), seed=25), 0.72, 0.735))
    elif kind == "orange":  # 橘色皮革 / 漆鋼板
        col = T.layer(col, adjust(ACCENT, 0.82), T.scale_fac(T.thresh(T.noise(8, 4, 0.6, seed=2), 0.5, 0.8), 0.3))
        col = T.layer(col, adjust(ACCENT, 1.3), T.thresh(T.noise(7, 5, 0.6, seed=5), 0.668, 0.682))
        col = T.layer(col, adjust(ACCENT, 1.55), T.thresh(T.noise(60, 2, 0.5, stretch=(1.0, 0.4, 0.06), rot=(0, 0.3, 0), seed=9), 0.728, 0.74))
    elif kind == "navy":  # 深藍橡膠履帶：大塊色斑 + 少量泥灰
        col = T.layer(col, "#2E3760", T.scale_fac(T.thresh(T.noise(4, 4, 0.6, seed=2), 0.5, 0.8), 0.6))
        col = T.layer(col, "#6B6A60", T.thresh(T.noise(9, 5, 0.6, seed=6), 0.68, 0.70))
    elif kind == "white":  # 白鋼護板：灰藍污垢 + 刮痕
        col = T.layer(col, "#C4D2E0", T.scale_fac(T.thresh(T.noise(6, 5, 0.6, seed=2), 0.5, 0.78), 0.55))
        col = T.layer(col, "#8FA9C4", T.thresh(T.noise(50, 2, 0.5, stretch=(1.0, 0.3, 0.06), rot=(0, 0.6, 0), seed=7), 0.725, 0.738))
    elif kind == "patch":  # 帆布補丁：編織格 + 髒污
        weave = T.checker(70, rot=(0, 0.35, 0))
        col = T.layer(col, "#D69A58", T.scale_fac(weave, 0.4))
        col = T.layer(col, "#9C6A36", T.scale_fac(T.thresh(T.noise(12, 4, 0.6, seed=3), 0.5, 0.8), 0.4))
    elif kind == "barrel":  # 砲管：藍漆鋼 + 縱向淡拉絲 + 白亮刮痕
        col = T.layer(col, "#5E9ED8", T.scale_fac(T.thresh(T.noise(30, 3, 0.55, stretch=(0.15, 1, 1), seed=2), 0.45, 0.8), 0.3))
        col = T.layer(col, "#D5E8F7", T.thresh(T.noise(6, 5, 0.6, seed=8), 0.668, 0.682))
        col = T.layer(col, "#F2F8FD", T.thresh(T.noise(60, 2, 0.5, stretch=(1, 0.05, 0.3), seed=4), 0.728, 0.74))
    return col


def toon_material(name, hex_str, kind=None, shade=0.66):
    """Diffuse -> ShaderToRGB -> 色階，乘上底色，得到硬陰影卡通感；底色上再疊專屬紋理。"""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    diff = nt.nodes.new("ShaderNodeBsdfDiffuse")
    s2r = nt.nodes.new("ShaderNodeShaderToRGB")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs[0].default_value = 1.0
    ramp.color_ramp.interpolation = "CONSTANT"
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (shade, shade, shade, 1)
    ramp.color_ramp.elements[1].position = 0.42
    ramp.color_ramp.elements[1].color = (1, 1, 1, 1)
    base = nt.nodes.new("ShaderNodeRGB")
    base.outputs[0].default_value = srgb(hex_str)
    emit = nt.nodes.new("ShaderNodeEmission")
    emit.inputs["Strength"].default_value = 1.0
    diff.inputs["Color"].default_value = (1, 1, 1, 1)
    color_socket = base.outputs[0]
    if kind:
        color_socket = paint(kind, Tex(nt), base.outputs[0])
    nt.links.new(diff.outputs[0], s2r.inputs[0])
    nt.links.new(s2r.outputs[0], ramp.inputs[0])
    nt.links.new(ramp.outputs[0], mix.inputs[6])
    nt.links.new(color_socket, mix.inputs[7])
    nt.links.new(mix.outputs[2], emit.inputs["Color"])
    nt.links.new(emit.outputs[0], out.inputs[0])
    return mat


MATS = {}


def setup_materials():
    MATS["blue"] = toon_material("blue", "#7DB9EC", "blue")
    MATS["blue_skin"] = toon_material("blue_skin", "#7DB9EC", "blue_skin")
    MATS["mantle"] = toon_material("mantle", "#C4E0F6", "mantle")
    MATS["barrel"] = toon_material("barrel", "#7DB9EC", "barrel")
    MATS["gold"] = toon_material("gold", "#EDB63A", "gold")
    MATS["orange"] = toon_material("orange", ACCENT, "orange")
    MATS["navy"] = toon_material("navy", "#232B52", "navy", shade=0.8)
    MATS["white"] = toon_material("white", "#EAF1F8", "white")
    MATS["patch"] = toon_material("patch", "#E9B676", "patch")
    MATS["groove"] = toon_material("groove", "#3C6EB4", None)
    MATS["ink"] = toon_material("ink", "#1d2340", None, shade=0.9)
    MATS["eye"] = toon_material("eye", "#FFFFFF", None, shade=0.85)
    MATS["flag_w"] = toon_material("flag_w", "#FFF6E6", None)


def assign(obj, key):
    obj.data.materials.clear()
    obj.data.materials.append(MATS[key])


def smooth(obj):
    for p in obj.data.polygons:
        p.use_smooth = True


# ───────────────────────── 基本形體 ─────────────────────────

def sphere(name, loc, scale, key, seg=32, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=seg // 2, radius=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    smooth(o)
    assign(o, key)
    return o


def rbox(name, loc, size, key, bevel=0.1, rot=(0, 0, 0), seg=5):
    bpy.ops.mesh.primitive_cube_add(location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = (size[0] / 2, size[1] / 2, size[2] / 2)
    o.rotation_euler = rot
    bpy.ops.object.transform_apply(scale=True)
    m = o.modifiers.new("bev", "BEVEL")
    m.width = bevel
    m.segments = seg
    m.limit_method = "NONE"
    bpy.ops.object.modifier_apply(modifier="bev")
    smooth(o)
    assign(o, key)
    return o


def cylinder(name, loc, radius, depth, key, rot=(0, 0, 0), verts=32):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    smooth(o)
    assign(o, key)
    return o


def rivet(name, loc, r=0.034):
    """金色小鉚釘；標記後會放進獨立 collection，用細墨線描邊，不會變成黑圈。"""
    o = sphere(name, loc, (r, r, r), "gold", seg=10)
    o["is_rivet"] = True
    return o


# ───────────────────────── 履帶：光滑深藍外帶 + 橘色側板 ─────────────────────────

TREAD_TOP = 0.85
TREAD_LEN = 3.4


def build_treads():
    for side, sy in (("L", 1), ("R", -1)):
        y = 0.78 * sy
        rbox(f"belt_{side}", (0, y, TREAD_TOP / 2), (TREAD_LEN, 0.66, TREAD_TOP), "navy", bevel=0.4)
        yo = y + 0.335 * sy
        # 橘色側板 (跑道形) + 兩端圓盤
        rbox(f"plate_{side}", (0, yo, 0.46), (TREAD_LEN - 0.7, 0.09, 0.5), "orange", bevel=0.24)
        for x in (-1.2, 1.2):
            cylinder(f"disc_{side}_{x}", (x, yo, 0.46), 0.33, 0.09, "orange", rot=(math.pi / 2, 0, 0), verts=28)
            rivet(f"disc_rivet_{side}_{x}", (x, yo + 0.05 * sy, 0.46), 0.055)
        for i in range(5):
            rivet(f"plate_rivet_{side}_{i}", (-0.7 + i * 0.35, yo + 0.05 * sy, 0.46), 0.036)
        # 底部小輪
        for i, x in enumerate((-0.9, -0.3, 0.3, 0.9)):
            cylinder(f"wheel_{side}_{i}", (x, yo, 0.16), 0.15, 0.1, "orange", rot=(math.pi / 2, 0, 0), verts=20)
        # 外帶邊緣的小鉚釘
        for i in range(12):
            x = -1.45 + i * 0.265
            rivet(f"belt_rv_{side}_{i}", (x, yo + 0.04 * sy, 0.79), 0.026)
            rivet(f"belt_rv2_{side}_{i}", (x, yo + 0.04 * sy, 0.07), 0.026)


# ───────────────────────── 殼：螺旋管 (殼口在前上方，被砲管托架蓋住) ─────────────────────────
# 螺旋「順時針」向外 (照原圖量測：外圈半徑 底<左<上<右，右=前方最大)：
# 最外圈在前方收尾，殼底是較小的內圈，所以殼心比殼底高；階差落在前下方，由披肩遮住。

SH_C = Vector((-0.2, 0.0, 1.89))
SH_TURNS = 2.1
SH_R0 = 0.1           # 捲心半徑
SH_SP = 0.56          # 每圈半徑增量 (等距螺線，外輪廓接近圓)
SH_RHO = 0.28         # 管半徑；略大於 SP/2 讓相鄰圈微微重疊、不留縫
SH_PHI_END = math.radians(-35)  # 殼口角度：前下方，貼著披肩
SH_YSCALE = 3.0       # 殼是厚圓盤狀，左右半寬 = 管半徑 × 3
N_PTS = 126           # 每圈 60 點；每段 12 點 = 72°，奇數段/圈使相鄰圈同角度顏色相反
SEG_LEN = 12


def shell_point(t):
    """t in [0,1]: 0=最內圈捲心, 1=殼口。回傳 (x,z,管半徑,phi,r)。"""
    turns = SH_TURNS * (1 - t)
    phi = SH_PHI_END + turns * 2 * math.pi
    r = SH_R0 + SH_SP * SH_TURNS * t
    rho = SH_RHO * min(1.0, 0.3 + (t * SH_TURNS) / 0.8 * 0.7)   # 捲心端漸細成尖
    return (SH_C.x + r * math.cos(phi), SH_C.z + r * math.sin(phi), rho, phi, r)


def shell_top():
    best = None
    for i in range(N_PTS):
        x, z, rho, _, _ = shell_point(i / (N_PTS - 1))
        if best is None or z + rho > best[1]:
            best = (x, z + rho)
    return best


def build_shell():
    idx = 0
    seg = 0
    while idx < N_PTS:
        end = min(idx + SEG_LEN, N_PTS)
        cu = bpy.data.curves.new(f"shell_c{seg}", "CURVE")
        cu.dimensions = "3D"
        cu.bevel_depth = 1.0
        cu.bevel_resolution = 10
        cu.use_fill_caps = True
        sp = cu.splines.new("POLY")
        count = end - idx + (1 if end < N_PTS else 0)
        sp.points.add(count - 1)
        for k in range(count):
            t = (idx + k) / (N_PTS - 1)
            x, z, rad, _, _ = shell_point(t)
            sp.points[k].co = (x, 0, z, 1)
            sp.points[k].radius = rad
        o = bpy.data.objects.new(f"shell_{seg}", cu)
        bpy.context.collection.objects.link(o)
        o.scale = (1, SH_YSCALE, 1)
        o.data.materials.append(MATS["gold"] if (seg % 2 == 1) else MATS["blue"])
        idx = end
        seg += 1
    last_gold = ((seg - 1) % 2 == 1)
    # 捲心底盤：圈與圈的縫隙後面是藍色，中心不會透出背景
    cylinder("shell_core", (SH_C.x, 0, SH_C.z), 0.5, 0.9, "blue", rot=(math.pi / 2, 0, 0), verts=40)
    cylinder("shell_back", (SH_C.x, 0, SH_C.z), 0.95, 0.6, "groove", rot=(math.pi / 2, 0, 0), verts=48)
    # 殼口圓頭 (遮住平切面)
    mx, mz, mr, _, _ = shell_point(1.0)
    sphere("shell_mouth", (mx, 0, mz), (mr, mr * SH_YSCALE, mr), "gold" if last_gold else "blue", seg=24)
    # 鉚釘：沿接縫，只在外面兩圈 (t>0.4)
    for side in (1, -1):
        for b in range(0, N_PTS, SEG_LEN):
            for off in (0, SEG_LEN // 2):
                i = b + off
                if i >= N_PTS - 2:
                    continue
                t = i / (N_PTS - 1)
                if t < 0.4:
                    continue
                x, z, rad, _, _ = shell_point(t)
                rivet(f"rv_{side}_{i}", (x, side * rad * SH_YSCALE * 0.985, z), 0.036)
    # 補丁 (帆布)，位置照原圖：外圈上側、殼前面、左下
    for side, t, w in ((1, 0.9, 0.34), (-1, 0.82, 0.3), (1, 0.62, 0.3), (-1, 0.95, 0.3), (1, 0.4, 0.26)):
        x, z, rad, phi, _ = shell_point(t)
        rbox(f"patch_{side}_{t}", (x, side * (rad * SH_YSCALE * 0.99), z), (w, 0.05, w * 0.8), "patch", bevel=0.015,
             rot=(0, -phi + math.pi / 2, 0))


# ───────────────────────── 身體：只露出前方披肩、頸、頭 ─────────────────────────

def build_body():
    # 披肩 (殼前下方的淺藍白軟體)，後半截藏在殼裡
    sphere("mantle", (0.65, 0, 1.2), (0.85, 0.78, 0.42), "mantle")
    # 頸：金色分節環 (露在頭與披肩之間)
    for i in range(4):
        t = i / 3
        cx, cz = 1.55 + 0.2 * t, 0.98 + 0.12 * t
        sphere(f"neck_{i}", (cx, 0, cz), (0.4 - 0.01 * i, 0.4 - 0.02 * i, 0.16), "gold", seg=24, rot=(0, math.radians(-22), 0))
        for sy in (1, -1):
            rivet(f"neck_rv_{i}_{sy}", (cx + 0.06, sy * (0.4 - 0.02 * i), cz), 0.03)
    # 頭
    sphere("head", (1.82, 0, 1.28), (0.42, 0.42, 0.4), "blue_skin")
    sphere("mouth", (2.22, 0, 1.21), (0.035, 0.12, 0.045), "ink", seg=12)
    sphere("nose", (2.17, 0, 1.1), (0.05, 0.08, 0.06), "gold", seg=12)
    # 眼柄 + 大眼睛 (兩眼前後錯開，側視才不會疊成一顆)
    for sy in (1, -1):
        dx = 0.0 if sy == 1 else 0.2
        dz = 0.0 if sy == -1 else 0.06
        y = 0.24 * sy
        cylinder(f"stalk_{sy}", (1.8 + dx * 0.6, y, 1.74 + dz), 0.075, 0.5, "gold", rot=(0, math.radians(-14), 0), verts=16)
        sphere(f"stalk_base_{sy}", (1.77, y, 1.5), (0.1, 0.1, 0.08), "gold", seg=12)
        ex, ez = 1.84 + dx, 1.98 + dz
        sphere(f"eye_{sy}", (ex, y, ez), (0.21, 0.21, 0.21), "eye", seg=24)
        sphere(f"pupil_{sy}", (ex + 0.12, y - 0.12, ez), (0.11, 0.11, 0.14), "ink", seg=16)
        sphere(f"glint_{sy}", (ex + 0.17, y - 0.2, ez + 0.06), (0.04, 0.04, 0.04), "eye", seg=8)
        sphere(f"glint2_{sy}", (ex + 0.2, y - 0.18, ez - 0.05), (0.022, 0.022, 0.022), "eye", seg=8)


# ───────────────────────── 砲管 + 金色托架 (蓋住殼口階差) ─────────────────────────

BARREL_PIVOT = Vector((1.05, 0, 2.4))
BARREL_ELEV = math.radians(14)
BARREL_LEN = 0.85
BARREL_R = 0.4


def build_barrel():
    axis = Vector((math.cos(BARREL_ELEV), 0, math.sin(BARREL_ELEV)))
    rot = (0, math.pi / 2 - BARREL_ELEV, 0)
    p = BARREL_PIVOT
    # 托架：貼在殼前上緣的金色斜板，遮住殼口階差
    rbox("saddle", p + Vector((-0.1, 0, -0.08)), (0.42, 1.3, 1.25), "gold", bevel=0.14, rot=(0, math.radians(-6), 0))
    for sy in (1, -1):
        for dz in (-0.35, 0.3):
            rivet(f"saddle_rv_{sy}_{dz}", p + Vector((0.08, sy * 0.62, dz - 0.1)), 0.04)
    # 橘色環箍 + 砲管 + 砲口環
    cylinder("barrel_collar", p + axis * 0.08, BARREL_R + 0.1, 0.14, "orange", rot=rot)
    cylinder("barrel", p + axis * (BARREL_LEN / 2 + 0.06), BARREL_R, BARREL_LEN, "barrel", rot=rot)
    cylinder("barrel_lip", p + axis * (BARREL_LEN + 0.04), BARREL_R + 0.04, 0.1, "blue", rot=rot)
    cylinder("barrel_hole", p + axis * (BARREL_LEN + 0.092), BARREL_R - 0.07, 0.02, "ink", rot=rot)
    cylinder("barrel_throat", p + axis * (BARREL_LEN + 0.1), BARREL_R - 0.18, 0.02, "eye", rot=rot)


# ───────────────────────── 旗子：橘白條紋，插在殼頂 ─────────────────────────

def build_flag():
    tx, tz = shell_top()
    top = Vector((tx, 0, tz - 0.02))
    cylinder("pole", top + Vector((0, 0, 0.4)), 0.028, 0.8, "gold", verts=8)["is_rivet"] = True
    sphere("pole_tip", top + Vector((0, 0, 0.82)), (0.05, 0.05, 0.05), "gold", seg=10)["is_rivet"] = True
    sphere("pole_base", top + Vector((0, 0, 0.0)), (0.1, 0.1, 0.07), "gold", seg=12)["is_rivet"] = True
    L = 0.7
    strips = 4
    verts, faces, mats = [], [], []
    base_z = top.z + 0.78

    def hgt(u):
        return 0.3 * (1 - 0.85 * u)

    def wob(u):
        return 0.05 * math.sin(u * 5.0)

    for k in range(strips + 1):
        u = k / strips
        xx = top.x - L * u
        verts.append((xx, 0, base_z + wob(u)))
        verts.append((xx, 0, base_z + wob(u) - hgt(u)))
    for k in range(strips):
        a = 2 * k
        faces.append((a, a + 1, a + 3, a + 2))
        mats.append(k % 2)
    mesh = bpy.data.meshes.new("flag")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    o = bpy.data.objects.new("flag", mesh)
    o["is_rivet"] = True
    bpy.context.collection.objects.link(o)
    o.data.materials.append(MATS["orange"])
    o.data.materials.append(MATS["flag_w"])
    for i, m in enumerate(mats):
        o.data.polygons[i].material_index = m
    sol = o.modifiers.new("sol", "SOLIDIFY")
    sol.thickness = 0.025


# ───────────────────────── 場景 / 算繪 ─────────────────────────

def setup_scene(res):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "Standard"
    sun = bpy.data.lights.new("sun", "SUN")
    sun.energy = 3.0
    so = bpy.data.objects.new("sun", sun)
    bpy.context.collection.objects.link(so)
    so.rotation_euler = (math.radians(55), math.radians(15), math.radians(-28))

    # 鉚釘獨立成一個 collection，用細線描邊；其餘用粗墨線
    col_r = bpy.data.collections.new("rivets")
    scene.collection.children.link(col_r)
    for o in list(bpy.data.objects):
        if o.get("is_rivet"):
            for c in list(o.users_collection):
                c.objects.unlink(o)
            col_r.objects.link(o)

    scene.render.use_freestyle = True
    scene.render.line_thickness_mode = "ABSOLUTE"
    scene.render.line_thickness = 3.2
    vl = bpy.context.view_layer
    vl.use_freestyle = True
    fs = vl.freestyle_settings
    while fs.linesets:
        fs.linesets.remove(fs.linesets[0])
    for name, thick, collection, neg in (("ink", 3.2, col_r, "EXCLUSIVE"), ("fine", 1.1, col_r, "INCLUSIVE")):
        ls = fs.linesets.new(name)
        ls.select_silhouette = True
        ls.select_border = True
        ls.select_crease = True
        ls.select_material_boundary = True
        ls.select_by_visibility = True
        ls.select_by_collection = True
        ls.collection = collection
        ls.collection_negation = neg
        style = bpy.data.linestyles.new(name)
        ls.linestyle = style
        style.color = srgb(NAVY)[:3]
        style.thickness = thick

    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 6.6
    cam = bpy.data.objects.new("cam", cam_data)
    bpy.context.collection.objects.link(cam)
    scene.camera = cam
    tgt = bpy.data.objects.new("tgt", None)
    tgt.location = (0.35, 0, 2.0)
    bpy.context.collection.objects.link(tgt)
    con = cam.constraints.new("TRACK_TO")
    con.target = tgt
    con.track_axis = "TRACK_NEGATIVE_Z"
    con.up_axis = "UP_Y"
    return cam, con


def render(cam, con, name, loc, scale=6.6, topdown=False):
    cam.location = loc
    cam.data.ortho_scale = scale
    con.enabled = not topdown
    if topdown:
        cam.rotation_euler = (0, 0, 0)
    bpy.context.scene.render.filepath = os.path.join(OUT, f"{name}.png")
    bpy.ops.render.render(write_still=True)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    setup_materials()
    build_treads()
    build_body()
    build_shell()
    build_barrel()
    build_flag()
    cam, con = setup_scene((900, 720))
    render(cam, con, "side", (0.35, -14, 2.0))
    render(cam, con, "front", (14, 0, 2.0))
    render(cam, con, "back", (-14, 0, 2.0))
    render(cam, con, "top", (0.35, 0, 14), topdown=True)
    render(cam, con, "threeq", (8.5, -8.5, 7.0))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "snailer.blend"))


if not os.environ.get("SNAILER_NO_MAIN"):
    main()
