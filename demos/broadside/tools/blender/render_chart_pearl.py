"""Render the bundled Black Pearl for the sailing chart.

Run Blender headless with this script and pass an output PNG path after --.
Encode it with: cwebp -q 88 input.png -o public/assets/map/chart-pearl.webp
"""

import pathlib
import sys

import bpy
from mathutils import Vector

root = pathlib.Path(__file__).resolve().parents[2]
output = pathlib.Path(sys.argv[sys.argv.index("--") + 1]).resolve()

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(root / "public/assets/ships/black-pearl.glb"))
scene = bpy.context.scene

# An elevated bow-quarter view shows the tall masts, sails and hull on the map.
view = Vector((-260, -220, 150))
rotation = (-view).to_track_quat("-Z", "Y")
camera_axes = rotation.inverted().to_matrix().to_4x4()
points = []
for obj in scene.objects:
    if obj.type != "MESH":
        continue
    projection = camera_axes @ obj.matrix_world
    points.extend(projection @ vertex.co for vertex in obj.data.vertices)
lower = Vector(min(point[axis] for point in points) for axis in range(3))
upper = Vector(max(point[axis] for point in points) for axis in range(3))
center = rotation @ ((lower + upper) / 2)
bpy.ops.object.camera_add(location=center + view, rotation=rotation.to_euler())
camera = bpy.context.object
camera.data.type = "ORTHO"
camera.data.ortho_scale = 1.04 * max(upper.x - lower.x, (upper.y - lower.y) * 256 / 212)
camera.data.clip_end = 1000
scene.camera = camera

scene.world = bpy.data.worlds.new("Skylight")
scene.world.use_nodes = True
sky = scene.world.node_tree.nodes["Background"]
sky.inputs["Color"].default_value = (0.60, 0.74, 1.0, 1.0)
sky.inputs["Strength"].default_value = 0.45

# Light the black sails from above and separate their edges from the dark hull.
for position, energy, color in (
    ((-140, -180, 270), 1600000, (1.0, 0.86, 0.62)),
    ((150, 65, 220), 1100000, (0.71, 0.85, 1.0)),
):
    bpy.ops.object.light_add(type="AREA", location=position)
    light = bpy.context.object
    light.rotation_euler = (center - light.location).to_track_quat("-Z", "Y").to_euler()
    light.data.energy = energy
    light.data.color = color
    light.data.size = 180

scene.render.engine = "CYCLES"
scene.cycles.samples = 24
scene.cycles.use_denoising = True
scene.render.threads_mode = "FIXED"
scene.render.threads = 4
scene.render.resolution_x = 256
scene.render.resolution_y = 212
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.color_mode = "RGBA"
scene.render.filepath = str(output)
bpy.ops.render.render(write_still=True)
