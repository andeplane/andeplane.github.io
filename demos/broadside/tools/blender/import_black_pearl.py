"""Convert DeltaX_F's CC-BY Black Pearl STL to the game's mobile GLB.
Usage: Blender --background --factory-startup --disable-autoexec --python this.py -- source.zip
Source: https://www.thingiverse.com/thing:4951578 (complete ship, not printable parts).
"""
import bpy, sys, zipfile, tempfile, math, pathlib, hashlib
from mathutils import Vector
args=sys.argv[sys.argv.index('--')+1:]
source=pathlib.Path(args[0])
bpy.ops.wm.read_factory_settings(use_empty=True)
with tempfile.TemporaryDirectory() as tmp:
 with zipfile.ZipFile(source) as archive:
  data=archive.read('files/The_Black_Pearl_With_Sails_1.stl')
  p=pathlib.Path(tmp)/'pearl.stl';p.write_bytes(data)
  bpy.ops.wm.stl_import(filepath=str(p))
ship=bpy.context.object;ship.name='Black_Pearl'
# STL uses X for the ship's length, Z up. Bow is -X. Center the hull,
# set the waterline through the lower planking, and turn the bow toward -Y.
for v in ship.data.vertices:
 x,y,z=v.co
 v.co=(y-14.4,x+.83,z-12)
# Materials stay local and export as ordinary glTF PBR (no runtime shaders).
def material(name,color,metal=0,rough=.8,emission=None):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*color,1)
 bs.inputs['Metallic'].default_value=metal;bs.inputs['Roughness'].default_value=rough
 if emission:
  bs.inputs['Emission Color'].default_value=(*emission,1);bs.inputs['Emission Strength'].default_value=.55
 return m
mats=[material('weathered_ebony_hull',(.055,.047,.039)),material('black_canvas_sail',(.026,.032,.031)),material('aged_teak_deck',(.145,.098,.058)),material('iron_cannons_and_rigging',(.032,.036,.039),.3,.65),material('stern_lantern_amber',(.42,.23,.055),.15,.4,(.8,.34,.04))]
for m in mats:ship.data.materials.append(m)
ship.data.update()
for face in ship.data.polygons:
 c=face.center;n=face.normal
 face.material_index=1 if c.z>43 and abs(n.y)>.7 else 3 if c.z>43 else 2 if n.z>.65 else 0
 if c.y>85 and 17<c.z<29 and abs(n.y)>.85 and face.area<10:face.material_index=4
 # Smooth curved sails and hull; retain edges at gunports and joinery.
 face.use_smooth=True
# Separate the canvas so the game can furl it independently of hull and rigging.
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.separate(type='MATERIAL');bpy.ops.object.mode_set(mode='OBJECT')
for part in bpy.context.selected_objects:
 part.name='Black_Pearl_'+part.data.materials[0].name
# Weighted corner normals preserve the hull's creases without duplicating every face.
bpy.context.view_layer.objects.active=ship
bpy.ops.object.modifier_add(type='WEIGHTED_NORMAL');ship.modifiers[-1].keep_sharp=True
# The runtime aligns using the bow marker, then scales to the player ship's spec.
bpy.ops.object.empty_add(type='PLAIN_AXES',location=(0,-110,0));bpy.context.object.name='bow_marker'
out=pathlib.Path(__file__).resolve().parents[2]/'public/assets/ships/black-pearl.glb'
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',export_yup=True,export_materials='EXPORT',export_apply=True)
print('BLACK PEARL:',sum(len(o.data.polygons) for o in bpy.context.scene.objects if o.type=='MESH'),'triangles;',out.stat().st_size,'bytes; source SHA256',hashlib.sha256(data).hexdigest())
