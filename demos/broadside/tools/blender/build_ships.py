"""
Broadside ship generator.

Builds stylized low-poly pirate ships from parameters, exports each as .glb for
the game, and renders preview images so you can judge the look.

Usage (from the repo root):
    blender --background --python tools/blender/build_ships.py -- --all
    blender --background --python tools/blender/build_ships.py -- --ship galleon
    npm run ships                      # same as --all

Options:
    --ship NAME      sloop | brigantine | galleon | warship (repeatable)
    --all            build every ship
    --engine NAME    eevee (default, fast on a GPU) | cycles (slower, works anywhere)
    --no-render      export models only
    --samples N      render samples (default 32)

Outputs:
    public/assets/ships/<name>.glb          loaded by the game automatically
    tools/blender/out/previews/<name>_*.png preview renders
    tools/blender/out/<name>.blend           editable Blender file

Conventions the game relies on:
    * Blender +Y is the bow, +X starboard, +Z up, waterline at Z = 0, units are metres.
    * An empty named "Bow_Marker" sits at the bow; the game aligns models with it.
    * Sails are separate objects named "Sail_*" with their origin on the top yard,
      so the game can furl them by scaling local Y.

Tested with Blender 4.2 LTS - 5.0.
"""

import math
import random
import sys
from pathlib import Path

import bpy  # must come first when running as the `bpy` Python module
import bmesh
from mathutils import Matrix, Vector

REPO = Path(__file__).resolve().parents[2]
SHIP_DIR = REPO / "public" / "assets" / "ships"
OUT_DIR = REPO / "tools" / "blender" / "out"

# --------------------------------------------------------------------------- presets
# Lengths match SHIP_SPECS in src/sim/ships.ts.

PRESETS = {
    "sloop": dict(
        length=13.0, beam=4.2, draft=1.2, freeboard=1.9, castle=0.0, castle_len=0.0,
        forecastle=0.0, ports=3, port_rows=1, masts=[(0.06, 1.05, 2)], jib=True, spanker=False,
        paint="#2f8a8c", trim="#e9d9b0", flag="jolly", gallery=0, lanterns=1,
    ),
    "brigantine": dict(
        length=17.0, beam=5.2, draft=1.4, freeboard=2.2, castle=0.9, castle_len=0.22,
        forecastle=0.0, ports=4, port_rows=1, masts=[(0.22, 0.9, 2), (-0.12, 0.95, 2)], jib=True, spanker=True,
        paint="#b8862f", trim="#2a1d14", flag="jolly", gallery=3, lanterns=1,
    ),
    "galleon": dict(
        length=22.0, beam=6.6, draft=1.6, freeboard=2.6, castle=1.7, castle_len=0.27,
        forecastle=0.9, ports=6, port_rows=1, masts=[(0.26, 0.82, 2), (0.0, 0.98, 3), (-0.24, 0.72, 1)],
        jib=True, spanker=True, paint="#2a5aa0", trim="#d4a63a", flag="pennant", gallery=5, lanterns=3,
    ),
    "warship": dict(
        length=28.0, beam=8.2, draft=2.0, freeboard=3.4, castle=2.0, castle_len=0.26,
        forecastle=1.0, ports=8, port_rows=2, masts=[(0.27, 0.8, 3), (0.0, 0.95, 3), (-0.23, 0.72, 2)],
        jib=True, spanker=True, paint="#1c1c1f", trim="#d9b23a", flag="jolly_red", gallery=6, lanterns=3,
    ),
}

# --------------------------------------------------------------------------- helpers


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_color(h):
    h = h.lstrip("#")
    return tuple(srgb_to_linear(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1.0,)


def smoothstep(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


class Materials:
    """Flat stylized materials. Non-metallic so they look right without image lighting."""

    def __init__(self):
        self.cache = {}

    def get(self, name, color, roughness=0.8, emission=None, strength=0.0, double_sided=False):
        if name in self.cache:
            return self.cache[name]
        m = bpy.data.materials.new(name)
        try:
            m.use_nodes = True
        except AttributeError:
            pass
        bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        bsdf.inputs["Base Color"].default_value = hex_color(color)
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = 0.0
        if emission:
            sock = bsdf.inputs.get("Emission Color") or bsdf.inputs.get("Emission")
            sock.default_value = hex_color(emission)
            bsdf.inputs["Emission Strength"].default_value = strength
        m.diffuse_color = hex_color(color)
        m.use_backface_culling = not double_sided
        self.cache[name] = m
        return m


def new_object(name, mesh, collection):
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return obj


def mesh_from_bmesh(name, bm, materials):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in materials:
        me.materials.append(m)
    return me


def box(bm, center, size, mat_index=0, rot_z=0.0, rot_x=0.0, rot_y=0.0):
    geom = bmesh.ops.create_cube(bm, size=1.0)
    verts = geom["verts"]
    m = (Matrix.Translation(Vector(center)) @ Matrix.Rotation(rot_z, 4, "Z") @ Matrix.Rotation(rot_y, 4, "Y")
         @ Matrix.Rotation(rot_x, 4, "X") @ Matrix.Diagonal(Vector((size[0], size[1], size[2], 1.0))))
    bmesh.ops.transform(bm, matrix=m, verts=verts)
    for f in {f for v in verts for f in v.link_faces}:
        f.material_index = mat_index


def cylinder(bm, p1, p2, r1, r2=None, segments=8, mat_index=0, caps=True):
    """Cylinder (or cone) between two points."""
    p1, p2 = Vector(p1), Vector(p2)
    axis = p2 - p1
    length = axis.length
    if length < 1e-5:
        return
    geom = bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=False, segments=segments,
                                 radius1=r1, radius2=r1 if r2 is None else r2, depth=length)
    verts = geom["verts"]
    rot = Vector((0, 0, 1)).rotation_difference(axis.normalized()).to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=Matrix.Translation((p1 + p2) / 2) @ rot, verts=verts)
    for f in {f for v in verts for f in v.link_faces}:
        f.material_index = mat_index


def sphere(bm, center, radius, mat_index=0, subdiv=1):
    geom = bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=radius)
    bmesh.ops.translate(bm, vec=Vector(center), verts=geom["verts"])
    for f in {f for v in geom["verts"] for f in v.link_faces}:
        f.material_index = mat_index


def apply_modifiers(obj):
    """Bake modifiers into the mesh without needing operator context."""
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(obj.evaluated_get(dg))
    obj.modifiers.clear()
    old = obj.data
    obj.data = me
    bpy.data.meshes.remove(old)


def join(objects, name, collection):
    """Merge objects (world transforms baked) into one mesh, keeping materials."""
    bm = bmesh.new()
    materials = []
    for obj in objects:
        tmp = bmesh.new()
        tmp.from_mesh(obj.data)
        bmesh.ops.transform(tmp, matrix=obj.matrix_world, verts=tmp.verts)
        slot_map = []
        for slot in obj.data.materials:
            if slot not in materials:
                materials.append(slot)
            slot_map.append(materials.index(slot))
        for f in tmp.faces:
            if slot_map:
                f.material_index = slot_map[min(f.material_index, len(slot_map) - 1)]
        me = bpy.data.meshes.new("tmp")
        tmp.to_mesh(me)
        tmp.free()
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
    for obj in objects:
        data = obj.data
        bpy.data.objects.remove(obj)
        if data.users == 0:
            bpy.data.meshes.remove(data)
    return new_object(name, mesh_from_bmesh(name, bm, materials), collection)


# --------------------------------------------------------------------------- hull shape


class HullShape:
    """Analytic hull: half-width, keel and rail heights along the ship (t: 0 = stern, 1 = bow)."""

    def __init__(self, p):
        self.p = p
        self.L = p["length"]
        self.B = p["beam"]

    def y(self, t):
        return (t - 0.5) * self.L

    def half_width(self, t):
        B = self.B
        if t < 0.45:
            u = (0.45 - t) / 0.45
            return B / 2 * (1 - 0.32 * u * u)
        u = (t - 0.45) / 0.55
        return B / 2 * math.sqrt(max(0.0025, 1 - u ** 2.3))

    def keel(self, t):
        d = self.p["draft"]
        z = -d
        if t > 0.8:
            z += (d + self.p["freeboard"] * 0.55) * ((t - 0.8) / 0.2) ** 2
        if t < 0.05:
            z += d * 0.25 * (0.05 - t) / 0.05
        return z

    def deck(self, t):
        """Walking surface height, with raised quarterdeck and forecastle."""
        p = self.p
        z = p["freeboard"] - 0.95
        z += p["castle"] * (1 - smoothstep(p["castle_len"] - 0.015, p["castle_len"] + 0.015, t))
        z += p["forecastle"] * smoothstep(0.83, 0.86, t)
        return z

    def sheer(self, t):
        return 0.35 * smoothstep(0.6, 1.0, t) + 0.25 * (1 - smoothstep(0.0, 0.3, t))

    def base_deck(self, t):
        return self.p["freeboard"] - 0.95

    def base_rail(self, t):
        """Rail height ignoring the raised castles; the hull profile is defined up to here."""
        return self.base_deck(t) + 0.95 + self.sheer(t)

    def rail(self, t):
        return self.deck(t) + 0.95 + self.sheer(t)

    def split(self, t):
        """Height where plank rows switch from the hull proper to the bulwark/castle sides."""
        return max(self.base_deck(t) + 0.15, self.keel(t) + 0.3)

    def surface_x(self, t, z):
        """Hull half-width at absolute height z. Castle sides rise straight above the base rail,
        so raising a castle never changes the hull shape below it."""
        k, top = self.keel(t), self.base_rail(t)
        hw = self.half_width(t)
        n = (z - k) / (top - k)
        if n <= 1:
            x = hw * math.sin(max(0.0, min(1.0, n / 0.72)) * math.pi / 2) ** 0.55
            return x * (1 - 0.1 * max(0.0, n - 0.72) / 0.28)
        return max(0.0, hw * 0.9 - 0.08 * (z - top))


# --------------------------------------------------------------------------- builders


def build_hull(name, p, shape, mats, coll):
    stations, rows = 40, 16
    paint, trim = mats.get(f"paint_{name}", p["paint"], 0.6), mats.get(f"trim_{name}", p["trim"], 0.5)
    wood = [mats.get("wood_a", "#6b4226"), mats.get("wood_b", "#5c3820"), mats.get("wood_c", "#7a4b2b")]
    bottom = mats.get("hull_bottom", "#4e2a22", 0.85)
    rail_cap = mats.get("wood_dark", "#3a2416")
    inner = mats.get("wood_inner", "#8a5a36")
    materials = [*wood, bottom, paint, trim, rail_cap]
    W0, BOTTOM, PAINT, TRIM, CAP = 0, 3, 4, 5, 6
    gun_z = shape.deck(0.5) + 0.45

    bm = bmesh.new()
    grid = []
    low_rows, high_rows = 12, 4
    rows = low_rows + high_rows
    for i in range(stations + 1):
        t = i / stations
        y = shape.y(t)
        k, mid, r = shape.keel(t), shape.split(t), shape.rail(t)
        zs = [k + (mid - k) * j / low_rows for j in range(low_rows)] + [mid + (r - mid) * j / high_rows for j in range(high_rows + 1)]
        grid.append([bm.verts.new((shape.surface_x(t, z), y, z)) for z in zs])

    rng = random.Random(7)
    for i in range(stations):
        for j in range(rows):
            # Counter-clockwise seen from outside: normals point out (+X) on the starboard half.
            f = bm.faces.new((grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]))
            zc = sum(v.co.z for v in f.verts) / 4
            if j == rows - 1:
                f.material_index = CAP
            elif zc < 0.08:
                f.material_index = BOTTOM
            elif abs(zc - gun_z) < 0.42 or (p["port_rows"] > 1 and abs(zc - (gun_z - 1.1)) < 0.38):
                f.material_index = PAINT
            elif abs(zc - (gun_z + 0.62)) < 0.12 or abs(zc - 0.32) < 0.14:
                f.material_index = TRIM
            else:
                f.material_index = W0 + (j + (1 if rng.random() < 0.08 else 0)) % 3

    # Transom: close the stern from the keel up to the rail at the centreline (normal faces aft).
    stern = grid[0]
    top_c = bm.verts.new((0.0, stern[-1].co.y, stern[-1].co.z))
    f = bm.faces.new([top_c] + list(stern))
    f.material_index = PAINT if p["gallery"] else W0
    bm.normal_update()

    hull = new_object(f"{name}_hull", mesh_from_bmesh(f"{name}_hull", bm, materials + [inner] * len(materials)), coll)
    mirror = hull.modifiers.new("Mirror", "MIRROR")
    mirror.use_axis[0] = True
    mirror.use_clip = True
    mirror.use_mirror_merge = True
    mirror.merge_threshold = 0.002
    solid = hull.modifiers.new("Solidify", "SOLIDIFY")
    solid.thickness = 0.14
    solid.offset = -1.0
    solid.use_rim = True
    solid.material_offset = len(materials)
    solid.material_offset_rim = len(materials)
    apply_modifiers(hull)
    return hull


def build_deck(name, p, shape, mats, coll):
    planks = [mats.get("deck_a", "#b5844f"), mats.get("deck_b", "#a57444")]
    bm = bmesh.new()
    cols = 8
    n = 40
    rows = []
    for i in range(n + 1):
        t = 0.005 + 0.97 * i / n
        z = shape.deck(t)
        hw = shape.surface_x(t, z) - 0.1
        rows.append([bm.verts.new((-hw + 2 * hw * c / cols, shape.y(t), z)) for c in range(cols + 1)])
    for i in range(n):
        for c in range(cols):
            f = bm.faces.new((rows[i][c], rows[i][c + 1], rows[i + 1][c + 1], rows[i + 1][c]))
            f.material_index = c % 2
    deck = new_object(f"{name}_deck", mesh_from_bmesh(f"{name}_deck", bm, planks), coll)

    # Bulkheads where the decks step up, with a door and windows.
    parts = [deck]
    wall = mats.get(f"paint_{name}", p["paint"])
    dark = mats.get("iron", "#1f1f23", 0.5)
    glow = mats.get("window_glow", "#ffd27a", 0.4, emission="#ffb347", strength=6.0)
    for t_step, height, facing in ((p["castle_len"], p["castle"], 1), (0.845, p["forecastle"], -1)):
        if height <= 0:
            continue
        low = shape.deck(t_step + 0.03 * facing)
        hw = shape.surface_x(t_step, low + height / 2) - 0.12
        y = shape.y(t_step)
        b = bmesh.new()
        box(b, (0, y, low + height / 2), (hw * 2, 0.16, height), 0)
        box(b, (0, y + 0.1 * facing, low + 0.55), (0.9, 0.06, 1.1), 1)
        for x in (-hw * 0.55, hw * 0.55):
            box(b, (x, y + 0.1 * facing, low + height * 0.6), (0.5, 0.06, 0.4), 2)
        parts.append(new_object(f"{name}_bulkhead", mesh_from_bmesh("bulkhead", b, [wall, dark, glow]), coll))
    return parts


def build_gunports(name, p, shape, mats, coll):
    dark = mats.get("port_dark", "#140d0a", 0.9)
    lid = mats.get("port_lid", "#a3352a", 0.6)
    iron = mats.get("iron", "#1f1f23", 0.5)
    bm = bmesh.new()
    gun_z = shape.deck(0.5) + 0.45
    rows = [gun_z] + ([gun_z - 1.1] if p["port_rows"] > 1 else [])
    n = p["ports"]
    for z in rows:
        for i in range(n):
            t = 0.28 + 0.46 * (i / max(1, n - 1))
            y = shape.y(t)
            for side in (1, -1):
                x = shape.surface_x(t, z) * side
                box(bm, (x + 0.03 * side, y, z), (0.12, 0.62, 0.52), 0)
                box(bm, (x + 0.28 * side, y, z + 0.38), (0.06, 0.66, 0.5), 1, rot_y=-0.9 * side)
                cylinder(bm, (x - 0.3 * side, y, z - 0.02), (x + 0.75 * side, y, z - 0.02), 0.13, 0.11, 8, 2)
    return [new_object(f"{name}_guns", mesh_from_bmesh("guns", bm, [dark, lid, iron]), coll)]


def build_stern(name, p, shape, mats, coll):
    parts = []
    glow = mats.get("window_glow", "#ffd27a", 0.4, emission="#ffb347", strength=6.0)
    trim = mats.get(f"trim_{name}", p["trim"], 0.5)
    iron = mats.get("iron", "#1f1f23", 0.5)
    wood = mats.get("wood_dark", "#3a2416")
    bm = bmesh.new()
    y0 = shape.y(0.0) - 0.08
    if p["gallery"]:
        z = shape.deck(0.0) - 0.15
        hw = shape.surface_x(0.0, z)
        n = p["gallery"]
        for i in range(n):
            x = -hw * 0.7 + 1.4 * hw * (i / max(1, n - 1))
            box(bm, (x, y0 - 0.06, z), (0.42, 0.04, 0.62), 0)  # glowing pane, in front
            box(bm, (x, y0, z), (0.58, 0.08, 0.78), 1)  # gold frame behind it
        box(bm, (0, y0 - 0.03, z + 0.62), (hw * 1.7, 0.08, 0.14), 1)
        box(bm, (0, y0 - 0.03, z - 0.55), (hw * 1.6, 0.08, 0.14), 1)
    # Lanterns on the taffrail (and one at the bow for big ships).
    rail = shape.rail(0.02)
    spots = [(0.0, 0.02)] if p["lanterns"] == 1 else [(-0.6, 0.02), (0.6, 0.02), (0.0, 0.97)]
    for xf, t in spots[: p["lanterns"]]:
        x = xf * shape.half_width(t)
        zr = shape.rail(t)
        y = shape.y(t)
        cylinder(bm, (x, y, zr), (x, y, zr + 1.0), 0.05, None, 6, 2)
        box(bm, (x, y, zr + 1.25), (0.36, 0.36, 0.5), 0)
        cylinder(bm, (x, y, zr + 1.5), (x, y, zr + 1.72), 0.26, 0.02, 6, 2)
    # Rudder.
    box(bm, (0, shape.y(0.0) - 0.25, -p["draft"] * 0.45), (0.22, 0.7, p["draft"] * 1.1), 3)
    parts.append(new_object(f"{name}_stern", mesh_from_bmesh("stern", bm, [glow, trim, iron, wood]), coll))
    _ = rail
    return parts


def build_deck_props(name, p, shape, mats, coll):
    wood = mats.get("wood_dark", "#3a2416")
    light = mats.get("deck_a", "#b5844f")
    iron = mats.get("iron", "#1f1f23", 0.5)
    trim = mats.get(f"trim_{name}", p["trim"], 0.5)
    bm = bmesh.new()
    # Ship's wheel on the quarterdeck (or aft deck).
    t_w = max(0.1, p["castle_len"] * 0.55) if p["castle"] else 0.12
    zw = shape.deck(t_w)
    yw = shape.y(t_w)
    box(bm, (0, yw - 0.1, zw + 0.5), (0.25, 0.25, 1.0), 0)
    geom = bmesh.ops.create_circle(bm, cap_ends=False, segments=12, radius=0.6)
    bmesh.ops.transform(bm, matrix=Matrix.Translation((0, yw + 0.08, zw + 1.15)) @ Matrix.Rotation(math.pi / 2, 4, "X"), verts=geom["verts"])
    edges = list({e for v in geom["verts"] for e in v.link_edges})
    ext = bmesh.ops.extrude_edge_only(bm, edges=edges)
    bmesh.ops.translate(bm, vec=Vector((0, 0.08, 0)), verts=[v for v in ext["geom"] if isinstance(v, bmesh.types.BMVert)])
    for f in [f for f in ext["geom"] if isinstance(f, bmesh.types.BMFace)]:
        f.material_index = 3
    for k in range(6):
        a = k * math.pi / 3
        cylinder(bm, (0, yw + 0.1, zw + 1.15), (math.cos(a) * 0.75, yw + 0.1, zw + 1.15 + math.sin(a) * 0.75), 0.035, None, 5, 0)
    # Capstan, hatch gratings, barrels and crates on the main deck.
    zm = shape.deck(0.5)
    cylinder(bm, (0, shape.y(0.38), zm), (0, shape.y(0.38), zm + 0.8), 0.35, 0.28, 10, 0)
    for t in (0.47, 0.62):
        box(bm, (0, shape.y(t), zm + 0.12), (1.6, 1.4, 0.24), 0)
        for k in range(4):
            box(bm, (0, shape.y(t) - 0.5 + k * 0.33, zm + 0.25), (1.4, 0.08, 0.04), 1)
    rng = random.Random(len(name))
    for k in range(4 + p["ports"] // 2):
        t = rng.uniform(0.33, 0.78)
        side = rng.choice((-1, 1))
        x = side * (shape.surface_x(t, zm + 0.5) - 0.7)
        if rng.random() < 0.5:
            cylinder(bm, (x, shape.y(t), zm), (x, shape.y(t), zm + 0.9), 0.36, 0.36, 10, 1)
            cylinder(bm, (x, shape.y(t), zm + 0.25), (x, shape.y(t), zm + 0.31), 0.39, 0.39, 10, 2)
        else:
            box(bm, (x, shape.y(t), zm + 0.35), (0.7, 0.7, 0.7), 1, rot_z=rng.uniform(0, 1))
    # Figurehead / bow decoration for the big ships.
    if p["castle"] > 1.0:
        tip = shape.y(1.0)
        sphere(bm, (0, tip + 0.2, shape.rail(1.0) - 0.6), 0.45, 3, 1)
    return [new_object(f"{name}_props", mesh_from_bmesh("props", bm, [wood, light, iron, trim]), coll)]


def build_rig(name, p, shape, mats, coll):
    """Masts, yards, tops, bowsprit, rigging. Sails are returned separately."""
    wood = mats.get("mast_wood", "#5a3a22")
    rope = mats.get("rope", "#2e2219", 0.95)
    sail_mat = mats.get("sail", "#efe3c6", 0.95, double_sided=True)
    bm = bmesh.new()
    sails = []
    L, B = p["length"], p["beam"]
    tops = []
    for mi, (t_rel, h_frac, n_sails) in enumerate(p["masts"]):
        t = 0.5 + t_rel
        y = shape.y(t)
        base = shape.deck(t)
        H = L * h_frac
        cylinder(bm, (0, y, base - 0.5), (0, y, base + H * 0.62), 0.3, 0.24, 10, 0)
        cylinder(bm, (0, y, base + H * 0.6), (0, y, base + H), 0.2, 0.09, 8, 0)
        cylinder(bm, (0, y, base + H * 0.6), (0, y, base + H * 0.6 + 0.18), 1.0, 1.0, 10, 0)  # top
        tops.append((y, base + H))
        # Square sails from the bottom up: course, topsail, topgallant.
        heights = [0.22, 0.48, 0.7, 0.86]
        widths = [1.85, 1.5, 1.1]
        for k in range(n_sails):
            z_bot = base + H * heights[k] + (0.6 if k == 0 else 0)
            z_top = base + H * heights[k + 1]
            w = B * widths[k] * (0.85 if mi == len(p["masts"]) - 1 and len(p["masts"]) > 2 else 1)
            cylinder(bm, (-w / 2 - 0.3, y + 0.35, z_top), (w / 2 + 0.3, y + 0.35, z_top), 0.11, None, 6, 0)
            sails.append(make_square_sail(f"Sail_{mi}_{k}", (0, y + 0.45, z_top), w, (z_top - z_bot) * 0.94, sail_mat, coll))
            if k == 0:
                cylinder(bm, (-w / 2 - 0.3, y + 0.35, z_bot), (w / 2 + 0.3, y + 0.35, z_bot), 0.1, None, 6, 0)
        # Shrouds from the top down to the rails.
        for side in (1, -1):
            for dy in (-0.9, 0.0, 0.9):
                rail_t = t + dy / L - 0.03
                cylinder(bm, (0, y, base + H * 0.6), (side * shape.half_width(rail_t) * 0.98, y + dy - 0.6, shape.rail(rail_t)), 0.035, None, 4, 1, caps=False)
    # Bowsprit.
    bow_t = 0.98
    tip = (0, shape.y(1.0) + L * 0.22, shape.rail(1.0) + L * 0.08)
    cylinder(bm, (0, shape.y(bow_t) - 1.0, shape.rail(bow_t) - 0.3), tip, 0.26, 0.1, 8, 0)
    # Stays between masts and to the bowsprit.
    for (y1, z1), (y2, z2) in zip(tops, tops[1:]):
        cylinder(bm, (0, y1, z1 * 0.97), (0, y2, z2 * 0.6), 0.04, None, 4, 1, caps=False)
    fore_y, fore_z = max(tops, key=lambda tz: tz[0])
    cylinder(bm, (0, fore_y, fore_z * 0.98), tip, 0.04, None, 4, 1, caps=False)
    if p["jib"]:
        sails.append(make_jib("Sail_jib", (0, fore_y + 0.3, fore_z * 0.82), tip, shape.deck(0.9) + 1.2, sail_mat, coll))
    if p["spanker"]:
        y_aft, z_aft = min(tops, key=lambda tz: tz[0])
        t_aft = (y_aft / L) + 0.5
        sails.append(make_spanker("Sail_spanker", (0, y_aft - 0.35, z_aft * 0.72), z_aft * 0.72 - shape.deck(t_aft) - 1.4, L * 0.17, sail_mat, coll))
    rig = new_object(f"{name}_rig", mesh_from_bmesh("rig", bm, [wood, rope]), coll)
    return [rig], sails, tops


def make_square_sail(name, top_center, width, height, mat, coll, nx=8, nz=6):
    """Billowing square sail. Origin on the top yard; belly bulges toward the bow (+Y)."""
    bm = bmesh.new()
    verts = []
    for j in range(nz + 1):
        v = j / nz
        row = []
        for i in range(nx + 1):
            u = i / nx
            x = (u - 0.5) * width * (1 - 0.08 * v)
            belly = math.sin(u * math.pi) * math.sin((0.15 + 0.85 * v) * math.pi * 0.85) * width * 0.11
            row.append(bm.verts.new((x, belly, -v * height)))
        verts.append(row)
    for j in range(nz):
        for i in range(nx):
            bm.faces.new((verts[j][i], verts[j + 1][i], verts[j + 1][i + 1], verts[j][i + 1]))
    obj = new_object(name, mesh_from_bmesh(name, bm, [mat]), coll)
    obj.location = top_center
    return obj


def make_jib(name, head, tack, foot_z, mat, coll):
    """Triangular headsail. Origin at the head (top)."""
    head, tack = Vector(head), Vector(tack)
    clew = Vector((0, head.y + (tack.y - head.y) * 0.25, foot_z))
    bm = bmesh.new()
    n = 6
    rows = []
    for j in range(n + 1):
        v = j / n
        a = head.lerp(tack, v)
        b = head.lerp(clew, v)
        row = []
        for i in range(n + 1 - j if False else 3):
            u = i / 2
            pnt = a.lerp(b, u) - head
            pnt.x += math.sin(u * math.pi) * math.sin(v * math.pi) * 0.6
            row.append(bm.verts.new(pnt))
        rows.append(row)
    for j in range(n):
        for i in range(2):
            bm.faces.new((rows[j][i], rows[j + 1][i], rows[j + 1][i + 1], rows[j][i + 1]))
    obj = new_object(name, mesh_from_bmesh(name, bm, [mat]), coll)
    obj.location = head
    return obj


def make_spanker(name, throat, height, foot, mat, coll):
    """Fore-and-aft gaff sail behind the mizzen. Origin at the throat (top front)."""
    bm = bmesh.new()
    n = 5
    rows = []
    for j in range(n + 1):
        v = j / n
        top_len = foot * 0.75
        length = top_len + (foot - top_len) * v
        row = []
        for i in range(4):
            u = i / 3
            row.append(bm.verts.new((math.sin(u * math.pi) * math.sin(v * math.pi) * 0.5, -u * length, -v * height + u * 0.8 * (1 - v))))
        rows.append(row)
    for j in range(n):
        for i in range(3):
            bm.faces.new((rows[j][i], rows[j + 1][i], rows[j + 1][i + 1], rows[j][i + 1]))
    obj = new_object(name, mesh_from_bmesh(name, bm, [mat]), coll)
    obj.location = throat
    return obj


def build_flag(name, p, mats, coll, mast_top):
    kind = p["flag"]
    if kind == "pennant":
        cloth = mats.get("flag_blue", "#2a5aa0", 0.9, double_sided=True)
        mark = mats.get("flag_gold", "#e3b341", 0.7, double_sided=True)
    else:
        cloth = mats.get("flag_black" if kind == "jolly" else "flag_red", "#141414" if kind == "jolly" else "#8e1d16", 0.9, double_sided=True)
        mark = mats.get("flag_white", "#f2efe6", 0.8, double_sided=True)
    w, h = (3.6, 1.2) if kind == "pennant" else (2.6, 1.7)
    bm = bmesh.new()
    nx, nz = 8, 3
    verts = []
    for j in range(nz + 1):
        row = []
        for i in range(nx + 1):
            u = i / nx
            taper = (1 - 0.7 * u) if kind == "pennant" else 1
            row.append(bm.verts.new((math.sin(u * 5.5) * 0.18 * u, -u * w, (j / nz - 0.5) * h * taper)))
        verts.append(row)
    for j in range(nz):
        for i in range(nx):
            bm.faces.new((verts[j][i], verts[j][i + 1], verts[j + 1][i + 1], verts[j + 1][i])).material_index = 0
    # Emblem on both faces: skull and crossed bones, or a gold star for the pennant.
    cx = -w * 0.45
    for side in (1, -1):
        off = 0.06 * side
        if kind == "pennant":
            sphere(bm, (off, cx * 0.7, 0), 0.28, 1, 0)
        else:
            sphere(bm, (off, cx, 0.18), 0.32, 1, 1)
            box(bm, (off, cx, -0.12), (0.04, 0.28, 0.18), 1)
            for a in (0.75, -0.75):
                box(bm, (off, cx, -0.28), (0.04, 1.2, 0.12), 1, rot_x=a)
    flag = new_object("Flag", mesh_from_bmesh("Flag", bm, [cloth, mark]), coll)
    y, z = mast_top
    flag.location = (0, y - 0.15, z + 0.2 - h / 2)
    return flag


def build_ship(name):
    p = PRESETS[name]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    coll = bpy.context.scene.collection
    mats = Materials()
    shape = HullShape(p)

    statics = [build_hull(name, p, shape, mats, coll)]
    statics += build_deck(name, p, shape, mats, coll)
    statics += build_gunports(name, p, shape, mats, coll)
    statics += build_stern(name, p, shape, mats, coll)
    statics += build_deck_props(name, p, shape, mats, coll)
    rig, sails, tops = build_rig(name, p, shape, mats, coll)
    statics += rig
    main_top = max(tops, key=lambda tz: tz[1])
    flag = build_flag(name, p, mats, coll, main_top)

    hull = join(statics, "Hull", coll)
    root = bpy.data.objects.new(f"Ship_{name}", None)
    coll.objects.link(root)
    marker = bpy.data.objects.new("Bow_Marker", None)
    coll.objects.link(marker)
    marker.location = (0, p["length"] / 2, 0)
    for obj in [hull, flag, marker, *sails]:
        obj.parent = root
    return root


# --------------------------------------------------------------------------- export & render


def export_glb(name):
    SHIP_DIR.mkdir(parents=True, exist_ok=True)
    path = SHIP_DIR / f"{name}.glb"
    for obj in bpy.context.scene.objects:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format="GLB", use_selection=True, export_apply=True, export_yup=True,
    )
    return path


def set_engine(scene, engine, samples):
    available = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
    if engine == "cycles":
        try:
            import addon_utils
            addon_utils.enable("cycles", default_set=True)
        except Exception:
            pass
        scene.render.engine = "CYCLES"
        scene.cycles.samples = samples
        scene.cycles.device = "CPU"
        try:
            scene.cycles.use_denoising = True
        except Exception:
            pass
    else:
        scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in available else "BLENDER_EEVEE"
        try:
            scene.eevee.taa_render_samples = samples
        except AttributeError:
            pass


def setup_preview_scene(p):
    scene = bpy.context.scene
    coll = scene.collection
    world = bpy.data.worlds.new("Sunset")
    scene.world = world
    try:
        world.use_nodes = True
    except AttributeError:
        pass
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    bg = next(n for n in nodes if n.type == "BACKGROUND")
    grad = nodes.new("ShaderNodeTexGradient")
    ramp = nodes.new("ShaderNodeValToRGB")
    coord = nodes.new("ShaderNodeTexCoord")
    sep = nodes.new("ShaderNodeSeparateXYZ")
    links.new(coord.outputs["Generated"], sep.inputs[0])
    links.new(sep.outputs["Z"], ramp.inputs["Fac"])
    ramp.color_ramp.elements[0].position = 0.5
    ramp.color_ramp.elements[0].color = hex_color("#ffb27a")
    ramp.color_ramp.elements[1].position = 0.75
    ramp.color_ramp.elements[1].color = hex_color("#4a4c8c")
    links.new(ramp.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = 1.0
    nodes.remove(grad)

    sun_data = bpy.data.lights.new("Sun", "SUN")
    sun_data.energy = 4.0
    sun_data.color = (1.0, 0.86, 0.68)
    sun_data.angle = math.radians(3)
    sun = bpy.data.objects.new("Sun", sun_data)
    coll.objects.link(sun)
    # Matches the game: low sun far to the north (+Y here), slightly east.
    sun.rotation_euler = (math.radians(68), 0, math.radians(200))

    mats = Materials()
    water = mats.get("preview_water", "#1d6f7d", 0.08)
    bpy.data.materials["preview_water"].diffuse_color = hex_color("#1d6f7d")
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=400)
    plane = new_object("Water", mesh_from_bmesh("Water", bm, [water]), coll)
    plane.location.z = 0.0

    cam_data = bpy.data.cameras.new("Camera")
    cam = bpy.data.objects.new("Camera", cam_data)
    coll.objects.link(cam)
    scene.camera = cam
    return cam


def aim_camera(cam, location, target, lens):
    cam.location = location
    direction = Vector(target) - Vector(location)
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = lens


def render_previews(name, engine, samples):
    p = PRESETS[name]
    scene = bpy.context.scene
    set_engine(scene, engine, samples)
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.image_settings.file_format = "PNG"
    try:
        scene.view_settings.view_transform = "AgX"
    except TypeError:
        scene.view_settings.view_transform = "Filmic"
    cam = setup_preview_scene(p)
    out = OUT_DIR / "previews"
    out.mkdir(parents=True, exist_ok=True)
    L = p["length"]
    shots = {
        # Roughly the in-game camera: high, looking down from behind (stern side).
        "game": ((L * 0.9, -L * 2.2, L * 3.0), (0, L * 0.05, 2), 40),
        # Low three-quarter hero shot from the starboard bow.
        "hero": ((L * 1.25, L * 0.85, L * 0.32), (0, -L * 0.05, L * 0.28), 32),
    }
    paths = []
    for shot, (loc, target, lens) in shots.items():
        aim_camera(cam, loc, target, lens)
        path = out / f"{name}_{shot}.png"
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        paths.append(path)
    return paths


def parse_args(argv):
    args = argv[argv.index("--") + 1:] if "--" in argv else argv[1:]
    ships, engine, render, samples = [], "eevee", True, 32
    i = 0
    while i < len(args):
        a = args[i]
        if a == "--all":
            ships = list(PRESETS)
        elif a == "--ship":
            i += 1
            ships.append(args[i])
        elif a == "--engine":
            i += 1
            engine = args[i]
        elif a == "--samples":
            i += 1
            samples = int(args[i])
        elif a == "--no-render":
            render = False
        else:
            raise SystemExit(f"Unknown argument: {a}\n{__doc__}")
        i += 1
    for s in ships:
        if s not in PRESETS:
            raise SystemExit(f"Unknown ship '{s}'. Choose from: {', '.join(PRESETS)}")
    return ships or list(PRESETS), engine, render, samples


def main():
    ships, engine, render, samples = parse_args(sys.argv)
    print(f"[broadside] Blender {bpy.app.version_string}: building {', '.join(ships)}")
    for name in ships:
        build_ship(name)
        glb = export_glb(name)
        print(f"[broadside] exported {glb.relative_to(REPO)}")
        if render:
            for path in render_previews(name, engine, samples):
                print(f"[broadside] rendered {path.relative_to(REPO)}")
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=str(OUT_DIR / f"{name}.blend"))
    print("[broadside] done. Run `npm run dev` and the game will pick up the new models.")


if __name__ == "__main__":
    main()
