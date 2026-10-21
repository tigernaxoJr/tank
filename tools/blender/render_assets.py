"""
Blender 2.5D Tank & Seamless Terrain Texture Pipeline
用法:
  blender -b -P tools/blender/render_assets.py

產出目錄 (public/assets/):
  - tanks/<hull_id>_<team>_hull.png    : 2.5D 斜角立體車身與砲塔 (含透明背景與真實光影)
  - tanks/<hull_id>_<team>_barrel.png  : 獨立可旋轉 2.5D 砲管精靈圖 (錨點對齊左側旋轉軸)
  - textures/terrain_<theme>_soil.png  : 256x256 PBR 程序化無縫地表材質
"""

import bpy
import math
import os

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
TANKS_OUT = os.path.join(ROOT_DIR, "public/assets/tanks")
TEX_OUT = os.path.join(ROOT_DIR, "public/assets/textures")

os.makedirs(TANKS_OUT, exist_ok=True)
os.makedirs(TEX_OUT, exist_ok=True)


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def setup_render_engine(res_x, res_y, samples=96):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    scene.cycles.use_adaptive_sampling = True
    try:
        scene.cycles.use_denoising = True
        scene.cycles.denoiser = 'OPENIMAGEDENOISE'
    except Exception:
        scene.cycles.use_denoising = False
    scene.render.resolution_x = res_x
    scene.render.resolution_y = res_y
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'


def make_pbr_material(name, base_color, metallic=0.25, roughness=0.35, emission=None, emission_strength=0.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = base_color
        bsdf.inputs["Metallic"].default_value = metallic
        bsdf.inputs["Roughness"].default_value = roughness
        if emission and "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = emission
            bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat


def setup_studio_lighting():
    # Key sunlight (bright warm arcade sun)
    light_data = bpy.data.lights.new(name="KeySun", type='SUN')
    light_data.energy = 4.2
    light_data.angle = math.radians(12)
    light_obj = bpy.data.objects.new(name="KeySun", object_data=light_data)
    bpy.context.collection.objects.link(light_obj)
    light_obj.rotation_euler = (math.radians(48), math.radians(-28), math.radians(25))

    # Sky fill area light (cool blue rim/fill)
    fill_data = bpy.data.lights.new(name="SkyFill", type='AREA')
    fill_data.energy = 120.0
    fill_data.color = (0.65, 0.85, 1.0)
    fill_data.size = 6.0
    fill_obj = bpy.data.objects.new(name="SkyFill", object_data=fill_data)
    bpy.context.collection.objects.link(fill_obj)
    fill_obj.location = (-3.0, -4.0, 4.5)
    fill_obj.rotation_euler = (math.radians(45), 0, math.radians(-35))

    # Back rim light for 2.5D silhouette pop
    rim_data = bpy.data.lights.new(name="RimLight", type='POINT')
    rim_data.energy = 90.0
    rim_data.color = (1.0, 0.95, 0.8)
    rim_obj = bpy.data.objects.new(name="RimLight", object_data=rim_data)
    bpy.context.collection.objects.link(rim_obj)
    rim_obj.location = (0.5, 3.2, 2.6)


def setup_25d_camera(ortho_scale=3.8, loc=(0.0, -6.5, 2.35), pitch_deg=72.0):
    cam_data = bpy.data.cameras.new(name="Cam25D")
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = ortho_scale
    cam_obj = bpy.data.objects.new(name="Cam25D", object_data=cam_data)
    bpy.context.collection.objects.link(cam_obj)
    cam_obj.location = loc
    cam_obj.rotation_euler = (math.radians(pitch_deg), 0.0, 0.0)
    bpy.context.scene.camera = cam_obj


def add_bevel_and_smooth(obj, width=0.06, segments=3):
    mod = obj.modifiers.new(name="Bevel", type='BEVEL')
    mod.width = width
    mod.segments = segments
    for poly in obj.data.polygons:
        poly.use_smooth = True


def build_tracks(mat_track, mat_wheel, mat_trim, style="aegis"):
    # Left & Right 2.5D depth tracks (Y=-0.55 front track, Y=+0.55 back track)
    for y_sign in (-1, 1):
        y_pos = y_sign * 0.52
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.0, y_pos, -0.32))
        track = bpy.context.active_object
        track.scale = (1.18, 0.24, 0.24)
        add_bevel_and_smooth(track, width=0.12, segments=4)
        track.data.materials.append(mat_track)

        # Fender / side skirt armor
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.0, y_pos * 1.03, -0.16))
        skirt = bpy.context.active_object
        skirt.scale = (1.24, 0.26, 0.08)
        add_bevel_and_smooth(skirt, width=0.04, segments=2)
        skirt.data.materials.append(mat_trim)

        # Road wheels on front-facing side
        wheel_xs = [-0.78, -0.26, 0.26, 0.78] if style != "goliath" else [-0.85, -0.42, 0.0, 0.42, 0.85]
        for wx in wheel_xs:
            bpy.ops.mesh.primitive_cylinder_add(
                vertices=24,
                radius=0.19,
                depth=0.30,
                location=(wx, y_pos - 0.04, -0.34),
                rotation=(math.radians(90), 0, 0),
            )
            wheel = bpy.context.active_object
            add_bevel_and_smooth(wheel, width=0.03, segments=2)
            wheel.data.materials.append(mat_wheel)

            # Hubcap highlight
            bpy.ops.mesh.primitive_cylinder_add(
                vertices=16,
                radius=0.09,
                depth=0.33,
                location=(wx, y_pos - 0.05, -0.34),
                rotation=(math.radians(90), 0, 0),
            )
            hub = bpy.context.active_object
            hub.data.materials.append(mat_trim)


def build_tank_hull(archetype, team_palette):
    mat_primary = make_pbr_material("HullPrimary", team_palette["primary"], metallic=0.35, roughness=0.28)
    mat_secondary = make_pbr_material("HullSecondary", team_palette["secondary"], metallic=0.45, roughness=0.32)
    mat_trim = make_pbr_material("GoldTrim", team_palette["trim"], metallic=0.75, roughness=0.22)
    mat_visor = make_pbr_material(
        "VisorGlow",
        team_palette["visor"],
        metallic=0.1,
        roughness=0.1,
        emission=team_palette["visor"],
        emission_strength=2.2,
    )
    mat_track = make_pbr_material("TrackDark", (0.09, 0.11, 0.15, 1.0), metallic=0.2, roughness=0.75)
    mat_wheel = make_pbr_material("WheelSteel", (0.55, 0.62, 0.72, 1.0), metallic=0.8, roughness=0.3)

    build_tracks(mat_track, mat_wheel, mat_trim, style=archetype)

    if archetype == "aegis":
        # Classic round chibi heavy knight tank (chibi silhouette)
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.0, 0.0, -0.04))
        chassis = bpy.context.active_object
        chassis.scale = (1.12, 0.62, 0.22)
        add_bevel_and_smooth(chassis, width=0.08, segments=3)
        chassis.data.materials.append(mat_secondary)

        bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=0.68, location=(0.0, 0.0, 0.22))
        turret = bpy.context.active_object
        turret.scale = (1.08, 0.88, 0.78)
        for poly in turret.data.polygons:
            poly.use_smooth = True
        turret.data.materials.append(mat_primary)

        # Glowing Cute Visor Eye
        bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=0.22, location=(0.38, -0.45, 0.30))
        visor = bpy.context.active_object
        visor.scale = (1.15, 0.45, 0.62)
        for poly in visor.data.polygons:
            poly.use_smooth = True
        visor.data.materials.append(mat_visor)

        # Commander Cupola Hat
        bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.26, depth=0.16, location=(-0.12, 0.0, 0.76))
        cupola = bpy.context.active_object
        add_bevel_and_smooth(cupola, width=0.04, segments=2)
        cupola.data.materials.append(mat_trim)

    elif archetype == "goliath":
        # Heavy Twin-Armor Fortress Juggernaut
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.0, 0.0, -0.02))
        chassis = bpy.context.active_object
        chassis.scale = (1.28, 0.68, 0.26)
        add_bevel_and_smooth(chassis, width=0.06, segments=3)
        chassis.data.materials.append(mat_secondary)

        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-0.05, 0.0, 0.34))
        turret = bpy.context.active_object
        turret.scale = (0.86, 0.64, 0.38)
        add_bevel_and_smooth(turret, width=0.10, segments=4)
        turret.data.materials.append(mat_primary)

        # Armored brow plate
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.35, -0.38, 0.36))
        visor = bpy.context.active_object
        visor.scale = (0.45, 0.25, 0.14)
        add_bevel_and_smooth(visor, width=0.03, segments=2)
        visor.data.materials.append(mat_visor)

        # Rear twin exhaust pipes
        for ey in (-0.32, 0.32):
            bpy.ops.mesh.primitive_cylinder_add(
                vertices=16,
                radius=0.10,
                depth=0.48,
                location=(-0.82, ey, 0.38),
                rotation=(0, math.radians(-20), 0),
            )
            pipe = bpy.context.active_object
            pipe.data.materials.append(mat_trim)

    else:  # "zephyr" (High-tech energy/missile cruiser tank)
        bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.95, depth=0.32, location=(0.0, 0.0, -0.04))
        chassis = bpy.context.active_object
        chassis.scale = (1.18, 0.65, 0.75)
        add_bevel_and_smooth(chassis, width=0.06, segments=3)
        chassis.data.materials.append(mat_secondary)

        bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=0.62, location=(-0.05, 0.0, 0.26))
        turret = bpy.context.active_object
        turret.scale = (1.25, 0.78, 0.68)
        for poly in turret.data.polygons:
            poly.use_smooth = True
        turret.data.materials.append(mat_primary)

        # Cyber visor strip
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=24,
            radius=0.36,
            depth=0.16,
            location=(0.32, -0.35, 0.32),
            rotation=(math.radians(15), 0, 0),
        )
        visor = bpy.context.active_object
        visor.data.materials.append(mat_visor)

        # Radar fin
        bpy.ops.mesh.primitive_cone_add(
            vertices=16,
            radius1=0.18,
            radius2=0.03,
            depth=0.45,
            location=(-0.45, 0.0, 0.72),
            rotation=(0, math.radians(-28), 0),
        )
        fin = bpy.context.active_object
        fin.data.materials.append(mat_trim)


def build_tank_barrel(archetype, team_palette):
    mat_primary = make_pbr_material("BarrelPrimary", team_palette["primary"], metallic=0.45, roughness=0.25)
    mat_steel = make_pbr_material("BarrelSteel", (0.82, 0.87, 0.94, 1.0), metallic=0.85, roughness=0.2)
    mat_trim = make_pbr_material("BarrelTrim", team_palette["trim"], metallic=0.8, roughness=0.2)

    # Center of camera is X=0; we place pivot at X=-0.55 and extend barrel to X=+0.85
    # Mantle ring at pivot (-0.55)
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=24,
        radius=0.24,
        depth=0.42,
        location=(-0.35, 0.0, 0.0),
        rotation=(0, math.radians(90), 0),
    )
    mantle = bpy.context.active_object
    add_bevel_and_smooth(mantle, width=0.03, segments=2)
    mantle.data.materials.append(mat_primary)

    # Main tube
    radius = 0.18 if archetype == "goliath" else 0.14
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=24,
        radius=radius,
        depth=1.15,
        location=(0.22, 0.0, 0.0),
        rotation=(0, math.radians(90), 0),
    )
    tube = bpy.context.active_object
    for poly in tube.data.polygons:
        poly.use_smooth = True
    tube.data.materials.append(mat_steel)

    # Muzzle brake
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=24,
        radius=radius * 1.48,
        depth=0.32,
        location=(0.78, 0.0, 0.0),
        rotation=(0, math.radians(90), 0),
    )
    muzzle = bpy.context.active_object
    add_bevel_and_smooth(muzzle, width=0.04, segments=2)
    muzzle.data.materials.append(mat_trim)


def render_all_tanks():
    palettes = {
        "a": {
            "primary": (1.0, 0.42, 0.02, 1.0),     # Bright Arcade Orange-Gold
            "secondary": (0.78, 0.22, 0.02, 1.0),  # Deep Amber Red
            "trim": (1.0, 0.82, 0.15, 1.0),        # Royal Gold
            "visor": (0.98, 0.96, 0.35, 1.0),      # Glowing Lemon Visor
        },
        "b": {
            "primary": (0.05, 0.52, 1.0, 1.0),     # Royal Blue
            "secondary": (0.04, 0.25, 0.72, 1.0),  # Cobalt Armor
            "trim": (0.35, 0.88, 1.0, 1.0),        # Cyan Trim
            "visor": (0.45, 1.0, 0.95, 1.0),       # Glowing Aqua Visor
        },
    }

    archetypes = ["aegis", "goliath", "zephyr"]

    for arch in archetypes:
        for team_key, pal in palettes.items():
            # 1. Render 2.5D Hull Sprite
            clear_scene()
            setup_render_engine(192, 160, samples=28)
            setup_studio_lighting()
            setup_25d_camera(ortho_scale=2.85, loc=(0.0, -6.0, 2.15), pitch_deg=71.0)
            build_tank_hull(arch, pal)
            hull_path = os.path.join(TANKS_OUT, f"{arch}_{team_key}_hull.png")
            bpy.context.scene.render.filepath = hull_path
            bpy.ops.render.render(write_still=True)

            # 2. Render 2.5D Barrel Sprite
            clear_scene()
            setup_render_engine(140, 64, samples=24)
            setup_studio_lighting()
            setup_25d_camera(ortho_scale=2.25, loc=(0.15, -5.0, 1.25), pitch_deg=76.0)
            build_tank_barrel(arch, pal)
            barrel_path = os.path.join(TANKS_OUT, f"{arch}_{team_key}_barrel.png")
            bpy.context.scene.render.filepath = barrel_path
            bpy.ops.render.render(write_still=True)


def render_terrain_textures():
    themes = {
        "emerald": ((0.55, 0.32, 0.14, 1.0), (0.38, 0.20, 0.08, 1.0)),
        "canyon": ((0.76, 0.36, 0.18, 1.0), (0.52, 0.21, 0.10, 1.0)),
        "glacier": ((0.38, 0.58, 0.78, 1.0), (0.22, 0.36, 0.54, 1.0)),
    }

    for theme_name, (col_a, col_b) in themes.items():
        clear_scene()
        setup_render_engine(256, 256, samples=24)
        bpy.context.scene.render.film_transparent = False

        # Orthographic top-down camera
        cam_data = bpy.data.cameras.new(name="TexCam")
        cam_data.type = 'ORTHO'
        cam_data.ortho_scale = 2.0
        cam_obj = bpy.data.objects.new(name="TexCam", object_data=cam_data)
        bpy.context.collection.objects.link(cam_obj)
        cam_obj.location = (0.0, 0.0, 3.0)
        cam_obj.rotation_euler = (0.0, 0.0, 0.0)
        bpy.context.scene.camera = cam_obj

        # Sun light at grazing angle for 2.5D bump relief
        light_data = bpy.data.lights.new(name="TexSun", type='SUN')
        light_data.energy = 3.6
        light_obj = bpy.data.objects.new(name="TexSun", object_data=light_data)
        bpy.context.collection.objects.link(light_obj)
        light_obj.rotation_euler = (math.radians(38), math.radians(-25), 0.0)

        bpy.ops.mesh.primitive_plane_add(size=2.0, location=(0.0, 0.0, 0.0))
        plane = bpy.context.active_object

        mat = bpy.data.materials.new(name=f"Soil_{theme_name}")
        mat.use_nodes = True
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links
        bsdf = nodes.get("Principled BSDF")

        voronoi = nodes.new(type="ShaderNodeTexVoronoi")
        voronoi.inputs["Scale"].default_value = 14.0

        noise = nodes.new(type="ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = 12.0
        noise.inputs["Detail"].default_value = 8.0
        noise.inputs["Roughness"].default_value = 0.7

        ramp = nodes.new(type="ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position = 0.22
        ramp.color_ramp.elements[0].color = col_b
        ramp.color_ramp.elements[1].position = 0.76
        ramp.color_ramp.elements[1].color = col_a

        bump = nodes.new(type="ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.85

        links.new(voronoi.outputs["Distance"], ramp.inputs["Fac"])
        links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
        links.new(voronoi.outputs["Distance"], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
        bsdf.inputs["Roughness"].default_value = 0.65

        plane.data.materials.append(mat)

        tex_path = os.path.join(TEX_OUT, f"terrain_{theme_name}_soil.png")
        bpy.context.scene.render.filepath = tex_path
        bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    render_all_tanks()
    render_terrain_textures()
    print("=== Blender 2.5D Tank & Terrain Texture Pipeline Completed ===")
