"""Run in Blender: two builds, unrelated collection preservation, deterministic exports."""
from pathlib import Path
import bpy
import hashlib
import json
import runpy

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / 'assets/blender/build_watch.py'
sentinel_collection = bpy.data.collections.new('Watch_QA_Unrelated')
bpy.context.scene.collection.children.link(sentinel_collection)
sentinel_mesh = bpy.data.meshes.new('Watch_QA_UnrelatedMesh')
sentinel_mesh.from_pydata([(0, 0, 0), (1, 0, 0), (1, 1, 0), (0, 1, 0)], [], [(0, 1, 2), (0, 2, 3)])
sentinel_mesh.update()
sentinel = bpy.data.objects.new('Watch_QA_Preserved', sentinel_mesh)
sentinel_collection.objects.link(sentinel)
sentinel.location = (4.25, -3.5, 1.75)
sentinel.rotation_euler = (.23, -.41, .17)
sentinel.scale = (1.15, .85, 1.3)

# Exercise both name collision and an explicitly owned material shared with a
# foreign mesh. The latter must not be reused merely because its owner tag fits.
foreign_materials = []
for index, role in enumerate(['Satin brass', 'Brushed steel']):
    material = bpy.data.materials.new('HodVremeni::' + role)
    material.use_nodes = True
    material.diffuse_color = (.16 + index * .2, .43, .72, 1)
    material['watch_qa_foreign_marker'] = 'must remain unchanged'
    if index == 1:
        material['hod_vremeni_owner'] = 'PocketWatch_Exhibit'
        material['hod_vremeni_role'] = role
    bsdf = next(node for node in material.node_tree.nodes if node.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (.13, .29 + index * .1, .51, 1)
    bsdf.inputs['Metallic'].default_value = .37
    bsdf.inputs['Roughness'].default_value = .82
    bsdf.inputs['IOR'].default_value = 1.71
    color = material.node_tree.nodes.new('ShaderNodeRGB')
    color.outputs[0].default_value = (.19, .61, .33 + index * .1, 1)
    material.node_tree.links.new(color.outputs[0], bsdf.inputs['Base Color'])
    sentinel_mesh.materials.append(material)
    foreign_materials.append(material)
sentinel_mesh.polygons[1].material_index = 1


def socket_value(value):
    if value is None or isinstance(value, (str, bool, int, float)):
        return value
    try:
        return list(value)
    except TypeError:
        return repr(value)


def shader_state(material):
    return {
        'name': material.name,
        'useNodes': material.use_nodes,
        'diffuseColor': list(material.diffuse_color),
        'properties': dict(material.items()),
        'nodes': [{
            'name': node.name,
            'type': node.type,
            'inputs': [(socket.identifier, socket_value(socket.default_value)) for socket in node.inputs if hasattr(socket, 'default_value')],
            'outputs': [(socket.identifier, socket_value(socket.default_value)) for socket in node.outputs if hasattr(socket, 'default_value')],
        } for node in material.node_tree.nodes],
        'links': sorted((link.from_node.name, link.from_socket.identifier, link.to_node.name, link.to_socket.identifier) for link in material.node_tree.links),
    }


def transform_state():
    return (tuple(sentinel.location), tuple(sentinel.rotation_euler), tuple(sentinel.scale))


original_transform = transform_state()
original_slots = tuple((slot.link, slot.material) for slot in sentinel.material_slots)
original_vertices = tuple(tuple(vertex.co) for vertex in sentinel_mesh.vertices)
original_face_materials = tuple(polygon.material_index for polygon in sentinel_mesh.polygons)
original_shaders = [shader_state(material) for material in foreign_materials]
records = []

try:
    for iteration in range(2):
        runpy.run_path(str(BUILD), run_name='__main__')
        assert bpy.data.objects.get(sentinel.name) is sentinel
        assert sentinel.data is sentinel_mesh
        assert transform_state() == original_transform
        assert tuple((slot.link, slot.material) for slot in sentinel.material_slots) == original_slots
        assert tuple(tuple(vertex.co) for vertex in sentinel_mesh.vertices) == original_vertices
        assert tuple(polygon.material_index for polygon in sentinel_mesh.polygons) == original_face_materials
        assert [shader_state(material) for material in foreign_materials] == original_shaders, 'Foreign material shader/color changed'
        root = bpy.data.objects['watch_root']
        assert len(root.children) == 47
        assert all(any(child.type == 'MESH' for child in part.children) for part in root.children)
        watch_materials = {slot.material for part in root.children for child in part.children if child.type == 'MESH' for slot in child.material_slots}
        assert len(watch_materials) == 12
        assert not watch_materials.intersection(foreign_materials)
        assert all(material.get('hod_vremeni_owner') == 'PocketWatch_Exhibit' and material.get('hod_vremeni_role') for material in watch_materials)
        assert len({material['hod_vremeni_role'] for material in watch_materials}) == 12
        records.append({
            'iteration': iteration + 1,
            'glbSHA256': hashlib.sha256((ROOT / 'public/models/pocket-watch.glb').read_bytes()).hexdigest(),
            'manifestSHA256': hashlib.sha256((ROOT / 'src/data/watch-parts.json').read_bytes()).hexdigest(),
            'partNames': sorted(child.name for child in root.children),
            'unrelatedObjectPreserved': True,
            'foreignMeshGeometryTransformAndSlotsPreserved': True,
            'foreignMaterialShadersAndColorsPreserved': True,
            'foreignShaderSHA256': [hashlib.sha256(json.dumps(state, sort_keys=True).encode()).hexdigest() for state in original_shaders],
            'watchMaterialRoles': sorted(material['hod_vremeni_role'] for material in watch_materials),
            'validation': json.loads((ROOT / 'docs/evidence/model-validation.json').read_text()),
        })
    assert records[0]['glbSHA256'] == records[1]['glbSHA256'], 'Repeated build changed the GLB'
    assert records[0]['manifestSHA256'] == records[1]['manifestSHA256'], 'Repeated build changed the manifest'
finally:
    bpy.data.objects.remove(sentinel, do_unlink=True)
    bpy.data.collections.remove(sentinel_collection)
    if sentinel_mesh.users == 0:
        bpy.data.meshes.remove(sentinel_mesh)
    for material in foreign_materials:
        if material.users == 0:
            bpy.data.materials.remove(material)
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'assets/blender/pocket-watch.blend'), compress=True)

report = {'passed': True, 'method': 'Local Blender CLI / bpy, not native MCP', 'blenderVersion': bpy.app.version_string, 'foreignMaterialSentinel': original_shaders, 'records': records}
(ROOT / 'docs/evidence/blender-v2-build.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print('WATCH_IDEMPOTENCE_PASSED', json.dumps({'passed': True, 'repeatedGLBHash': records[-1]['glbSHA256'], 'unrelatedObjectPreserved': True, 'foreignMaterialShadersAndColorsPreserved': True}), flush=True)
