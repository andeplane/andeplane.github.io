"""Build Pip, Broadside's original friendly parrot; export GLB + transparent portrait.
Run: /Applications/Blender.app/Contents/MacOS/Blender -b --python tools/blender/build_parrot.py
"""
from pathlib import Path
import math
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public' / 'assets' / 'pip'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def mat(name, color):
    m=bpy.data.materials.new(name);m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*color,1);bs.inputs['Roughness'].default_value=.65
    return m
jade=mat('Pip jade',(.03,.42,.24));lime=mat('Pip sunshine feathers',(.46,.8,.22));teal=mat('Pip turquoise wings',(.01,.39,.52));cream=mat('Pip eye white',(1,.92,.71));black=mat('Pip sparkling eyes',(.01,.025,.024));gold=mat('Pip golden beak',(1,.51,.08));coral=mat('Pip pirate bandana',(.85,.14,.09));feet=mat('Pip peach feet',(.54,.31,.17))

def sphere(name, pos, scale, material):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20,ring_count=12,location=pos)
    o=bpy.context.object;o.name=name;o.scale=scale;o.data.materials.append(material)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    for p in o.data.polygons:p.use_smooth=True
    return o
sphere('Pip body',(0,0,1.45),(.76,.64,.98),jade)
sphere('Pip fluffy bib',(0,-.5,1.5),(.56,.22,.65),lime)
sphere('Pip oversized head',(0,-.12,2.65),(.86,.7,.84),jade)
for side in [-1,1]:
    w=sphere('Pip wing '+str(side),(side*.68,.02,1.53),(.28,.5,.77),teal);w.rotation_euler.y=side*-.2
    sphere('Pip cheek '+str(side),(side*.42,-.59,2.62),(.4,.14,.45),cream)
    sphere('Pip eye '+str(side),(side*.4,-.731,2.76),(.19,.085,.24),black)
    sphere('Pip eye shine '+str(side),(side*.4-.045,-.81,2.85),(.062,.025,.07),cream)
    for n in range(3):sphere('Pip toe',(side*.37+(n-1)*.14,-.12,.52),(.085,.31,.085),feet)
    sphere('Pip ankle',(side*.37,.03,.62),(.13,.14,.25),feet)
# Beak is round and hooked, with a soft cartoon tip.
sphere('Pip beak',(0,-.76,2.45),(.29,.37,.35),gold)
sphere('Pip beak tip',(0,-.9,2.27),(.14,.15,.24),gold)
sphere('Pip bandana',(0,-.09,3.05),(.88,.71,.24),coral)
sphere('Pip bandana knot',(.72,.36,2.91),(.23,.22,.22),coral)
for i in range(2):
    tail=sphere('Pip scarf tail '+str(i),(.84+i*.15,.45,2.52-i*.04),(.13,.15,.47),coral);tail.rotation_euler.y=-.35+i*.55
for i in [-1,0,1]:
    tail=sphere('Pip tail feather '+str(i),(i*.2,.47,.69),(.17,.23,.7),teal if i else jade);tail.rotation_euler.x=-.55
for i in [-1,0,1]:
    top=sphere('Pip crest '+str(i),(i*.17,-.04,3.42),(.1,.17,.28),lime);top.rotation_euler.y=i*-.3
# Export only our original character; y-up conversion matches Babylon.
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(OUT/'pip.glb'),export_format='GLB',use_selection=True,export_apply=True)
# Portrait for the companion HUD.
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24
scene.render.resolution_x=384;scene.render.resolution_y=384;scene.render.resolution_percentage=100;scene.render.film_transparent=True
scene.world.color=(.5,.5,.5)
for name,pos,power,size in [('key',(-3,-4,7),700,5),('fill',(4,-2,4),350,4),('rim',(0,4,5),600,3)]:
    bpy.ops.object.light_add(type='AREA',location=pos);o=bpy.context.object;o.name=name;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(Vector((0,0,2))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(4,-9,4.8));camera=bpy.context.object;camera.rotation_euler=(Vector((0,0,1.9))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=4.4;scene.camera=camera
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(OUT/'portrait.png');bpy.ops.render.render(write_still=True)
print('[broadside] Pip is ready for adventure!')
