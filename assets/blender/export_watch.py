"""Экспорт только авторской коллекции + манифест из фактического GLB.

blender assets/blender/pocket-watch.blend --background --python assets/blender/export_watch.py
Оси glTF: X вправо, Y вверх, Z к наблюдателю. Отдельные carrier-узлы сохраняются.
"""
from __future__ import annotations
import bpy
import json
import math
import struct
from pathlib import Path

BASE=Path(__file__).resolve().parents[2]
TARGET=BASE/'public/models/pocket-watch.glb'
MANIFEST=BASE/'src/data/watch-parts.json'
collection=bpy.data.collections.get('PocketWatch_Exhibit')
if collection is None:
    raise RuntimeError('PocketWatch_Exhibit collection is missing. Run build_watch.py first.')
meta={obj.name:json.loads(obj['watch_part_meta']) for obj in collection.all_objects if 'watch_part_meta' in obj}
bpy.ops.object.select_all(action='DESELECT')
for obj in collection.all_objects:
    if obj.type in {'EMPTY','MESH'}: obj.select_set(True)
TARGET.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(TARGET),export_format='GLB',use_selection=True,use_active_scene=True,
                          export_yup=True,export_apply=True,export_materials='EXPORT',
                          export_animations=False,export_extras=False,
                          export_cameras=False,export_lights=False,
                          export_texcoords=False,export_normals=True)

blob=TARGET.read_bytes()
magic,version,length=struct.unpack_from('<4sII',blob,0)
if magic!=b'glTF' or version!=2 or length!=len(blob):
    raise RuntimeError('Invalid glTF Binary header')
chunk_length,chunk_type=struct.unpack_from('<II',blob,12)
if chunk_type!=0x4E4F534A: raise RuntimeError('Missing JSON chunk')
gltf=json.loads(blob[20:20+chunk_length])
nodes=gltf.get('nodes',[])
by_name={n.get('name'):n for n in nodes}
if len(by_name)!=len(nodes): raise RuntimeError('Duplicate glTF node names')
root=by_name.get('watch_root')
if root is None: raise RuntimeError('watch_root missing from GLB')
root_children={nodes[i]['name'] for i in root.get('children',[])}
if root_children!=set(meta):
    raise RuntimeError('Carrier hierarchy mismatch: '+str(root_children.symmetric_difference(meta)))
parts=[]
for name,part in meta.items():
    node=by_name.get(name)
    if node is None: raise RuntimeError('Part missing from GLB: '+name)
    if 'matrix' in node: raise RuntimeError('Unexpected matrix instead of TRS: '+name)
    part['restPosition']=node.get('translation',[0,0,0])
    part['restQuaternion']=node.get('rotation',[0,0,0,1])
    part['explodedQuaternion']=part['restQuaternion'][:]
    part['restScale']=node.get('scale',[1,1,1])
    if part['end']<=part['start']: raise RuntimeError('Invalid animation interval: '+name)
    for field in ['restPosition','restQuaternion','explodedOffset','explodedQuaternion','restScale','labelAnchor']:
        if not all(math.isfinite(x) for x in part[field]): raise RuntimeError('Non-finite '+name+'.'+field)
    if min(part['restScale'])<=0: raise RuntimeError('Non-positive scale: '+name)
    q=part['restQuaternion']
    if abs(sum(x*x for x in q)-1)>1e-6: raise RuntimeError('Non-unit quaternion: '+name)
    parts.append(part)
# Coordinate conversion is checked on unmistakable landmarks.
for name,expected in [('crown',(0,1.695,0)),('dial_face',(0,0,.236)),('back_cover',(0,0,-.305))]:
    p=next(p for p in parts if p['id']==name)
    if any(abs(a-b)>.00001 for a,b in zip(p['restPosition'],expected)):
        raise RuntimeError('Blender→glTF axis conversion mismatch: '+name+' '+str(p['restPosition']))
if len(parts)<24: raise RuntimeError('Too few independent parts')
if len(gltf.get('scenes',[]))!=1: raise RuntimeError('Unexpected unrelated scene export')
if set(gltf['scenes'][0].get('nodes',[]))!={nodes.index(root)}: raise RuntimeError('Unexpected exported root object')
if gltf.get('cameras') or any('camera' in n for n in nodes): raise RuntimeError('Camera exported by mistake')
if gltf.get('images'): raise RuntimeError('Unexpected external/image dependency')
# Count only exported indexed geometry, taking glTF primitive reuse into account.
triangles=0
for mesh in gltf.get('meshes',[]):
    for primitive in mesh.get('primitives',[]):
        if 'indices' in primitive:
            triangles+=gltf['accessors'][primitive['indices']]['count']//3
MANIFEST.parent.mkdir(parents=True,exist_ok=True)
MANIFEST.write_text(json.dumps(parts,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
summary={'status':'passed','blenderVersion':bpy.app.version_string,
         'model':'public/models/pocket-watch.glb','manifest':'src/data/watch-parts.json',
         'bytes':len(blob),'independentParts':len(parts),'nodes':len(nodes),
         'meshes':len(gltf.get('meshes',[])),'materials':len(gltf.get('materials',[])),
         'triangles':triangles,'externalImages':len(gltf.get('images',[])),
         'checks':['glTF2 header and byte length','unique names','all carriers are direct watch_root children',
                   'manifest matches exported nodes','rest TRS read from exported GLB','positive scales',
                   'finite values','normalized quaternions','Y-up / Z-forward landmarks',
                   'no cameras','no external textures'],'coordinateSystem':'X right, Y up to crown, +Z front'}
(BASE/'docs/evidence').mkdir(parents=True,exist_ok=True)
(BASE/'docs/evidence/model-validation.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
print('WATCH_EXPORT_VALIDATED',json.dumps(summary,ensure_ascii=False),flush=True)
