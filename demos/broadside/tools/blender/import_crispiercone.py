"""Create a local-only runtime asset from a purchased CrispierCone archive.

Blender --background --factory-startup --disable-autoexec --python this.py -- source.zip
Never commit the archive, source meshes, textures, or generated .private folder.
"""
import argparse, hashlib, json, math, pathlib, sys, tempfile, zipfile
import bpy
from mathutils import Vector

parser = argparse.ArgumentParser()
parser.add_argument('archive', type=pathlib.Path)
parser.add_argument('--output', type=pathlib.Path, default=pathlib.Path(__file__).resolve().parents[2] / '.private')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
args.output.mkdir(parents=True, exist_ok=True)

with tempfile.TemporaryDirectory(prefix='broadside-pearl-') as tmp:
    source = pathlib.Path(tmp) / 'Black Pearl.blend'
    with zipfile.ZipFile(args.archive) as archive:
        source.write_bytes(archive.read('Black Pearl.blend'))
    source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    bpy.ops.wm.open_mainfile(filepath=str(source), use_scripts=False)
    objects = [o for o in bpy.context.scene.objects if o.type == 'MESH' and not o.hide_render]
    # The native material graphs layer height maps over normals. Rebuild ordinary
    # glTF PBR graphs so the export uses actual OpenGL normal maps, not height PNGs.
    for material in {slot.material for o in objects for slot in o.material_slots if slot.material}:
        images = {node.image.name.split('.png')[0]: node.image for node in material.node_tree.nodes
                  if node.type == 'TEX_IMAGE' and node.image} if material.use_nodes else {}
        def find(suffix):
            return next((image for name, image in images.items() if name.endswith(suffix)), None)
        material.use_nodes = True
        nodes = material.node_tree.nodes
        nodes.clear()
        shader = nodes.new('ShaderNodeBsdfPrincipled')
        shader.inputs['Roughness'].default_value = .8
        out = nodes.new('ShaderNodeOutputMaterial')
        material.node_tree.links.new(shader.outputs['BSDF'], out.inputs['Surface'])
        for suffix, socket in [('_Base_color', 'Base Color'), ('_Roughness', 'Roughness'), ('_Metallic', 'Metallic')]:
            image = find(suffix)
            if not image: continue
            limit = 1024 if socket == 'Base Color' else 512
            if max(image.size) > limit:
                image.scale(limit, limit); image.pack()
            image.colorspace_settings.name = 'sRGB' if socket == 'Base Color' else 'Non-Color'
            node = nodes.new('ShaderNodeTexImage'); node.image = image
            material.node_tree.links.new(node.outputs['Color'], shader.inputs[socket])
        image = find('_Normal_OpenGL')
        if image:
            if max(image.size) > 512:
                image.scale(512, 512); image.pack()
            image.colorspace_settings.name = 'Non-Color'
            tex = nodes.new('ShaderNodeTexImage'); tex.image = image
            normal = nodes.new('ShaderNodeNormalMap'); normal.inputs['Strength'].default_value = .45
            material.node_tree.links.new(tex.outputs['Color'], normal.inputs['Color'])
            material.node_tree.links.new(normal.outputs['Normal'], shader.inputs['Normal'])

    floors = []
    for o in objects:
        original_name = o.name
        # Bake placement before normalization. Blender Y becomes glTF +Z;
        # +7 raises the waterline above the submerged keel. Bow points +Z.
        matrix = o.matrix_world.copy()
        o.parent = None; o.matrix_world.identity()
        for vertex in o.data.vertices:
            p = matrix @ vertex.co
            vertex.co = (p.x + .75, -p.y, p.z + 7)
        # Reflecting Blender Y reverses winding. Restore outward-facing polygons
        # before extracting upward deck faces and exporting the rendered hull.
        import bmesh
        bm = bmesh.new(); bm.from_mesh(o.data)
        bmesh.ops.reverse_faces(bm, faces=list(bm.faces))
        bm.to_mesh(o.data); bm.free()
        o.data.update()
        materials = [m.name for m in o.data.materials if m]
        walk_surface = original_name in ['model_6.004', 'model_3', 'model_14.003', 'model_14']
        if walk_surface:
            o.data.calc_loop_triangles()
            for tri in o.data.loop_triangles:
                a, b, c = [o.data.vertices[i].co.copy() for i in tri.vertices]
                n = (b-a).cross(c-a)
                if n.length == 0 or n.normalized().z < .65: continue
                if not (-22.5 < (a.y+b.y+c.y)/-3 < 23): continue
                if max(a.z,b.z,c.z) > 12: continue
                floors.append([[round(v.x,5), round(v.z,5), round(-v.y,5)] for v in [a,b,c]])
        o.modifiers.clear()
        if 'Mast' in materials:
            o.name = 'pearl_sail_canvas'
        elif walk_surface:
            o.name = 'pearl_walk_deck_' + original_name
        else:
            o.name = 'pearl_' + original_name
        faces = len(o.data.polygons)
        if faces > 1200:
            modifier = o.modifiers.new('mobile silhouette reduction', 'DECIMATE')
            modifier.ratio = .23 if 'Ropes' in materials else .42 if faces > 10000 else .7
            modifier.use_collapse_triangulate = True
        # Cut an actual doorway into the stern bulkhead. The purchased scene has
        # no useful lower cabin floor; the game supplies its own room and joinery.
        if original_name in ['model_2.005', 'model_2.010', 'model_7.007']:
            import bmesh
            bm = bmesh.new(); bm.from_mesh(o.data)
            remove = [face for face in bm.faces if abs(face.calc_center_median().x) < 1.5
                      and 10.3 < face.calc_center_median().y < 13.3 and face.calc_center_median().z < 10.4]
            bmesh.ops.delete(bm, geom=remove, context='FACES'); bm.to_mesh(o.data); bm.free()

    for o in list(bpy.context.scene.objects):
        if o not in objects: bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.object.empty_add(type='PLAIN_AXES', location=(0,-40,0))
    bpy.context.object.name = 'bow_marker'
    output = args.output / 'black-pearl.glb'
    bpy.ops.export_scene.gltf(filepath=str(output), export_format='GLB', export_yup=True,
        export_materials='EXPORT', export_apply=True, export_image_format='JPEG', export_jpeg_quality=82,
        export_cameras=False, export_lights=False)
    # Keep the desktop export, and bake a smaller textured copy for WKWebView.
    # Compressed file size hides the much larger decoded texture/vertex cost.
    used_images = {node.image for material in bpy.data.materials if material.use_nodes
                   for node in material.node_tree.nodes if node.type == 'TEX_IMAGE' and node.image}
    for image in used_images:
        limit = 512 if image.colorspace_settings.name == 'sRGB' else 256
        if max(image.size) > limit:
            image.scale(limit, limit); image.pack()
    for o in objects:
        for modifier in o.modifiers:
            if modifier.type == 'DECIMATE': modifier.ratio *= .35
    mobile = args.output / 'black-pearl-mobile.glb'
    bpy.ops.export_scene.gltf(filepath=str(mobile), export_format='GLB', export_yup=True,
        export_materials='EXPORT', export_apply=True, export_image_format='JPEG', export_jpeg_quality=82,
        export_cameras=False, export_lights=False)
    manifest = dict(version=1, source='CrispierCone / CGTrader #4906094', sourceSha256=source_hash,
        waterline=0, bow='+Z', floorTriangles=floors, cabin=dict(floor=4.5, x=[-4.7,4.7], z=[-22,-11.5]),
        ramps=[dict(x=[2.8,3.8], stations=[[-15.6,10.6],[-11.5,7.58],[-11,7.58],[-10.5,7.18],[-4.8,4.5]])])
    (args.output / 'black-pearl.json').write_text(json.dumps(manifest, separators=(',',':')))
    print('PRIVATE_PEARL', output.stat().st_size, 'bytes;', len(floors), 'walkable floor triangles;', source_hash)
    print('PRIVATE_PEARL_MOBILE', mobile.stat().st_size, 'bytes')
