"""Авторская процедурная модель «Ход времени»; Blender 4.5 LTS.

Запуск: blender --background --python assets/blender/build_watch.py
Вся геометрия задаётся в системе сайта (X вправо, Y к головке, +Z вперёд),
затем поворачивается в нативные координаты Blender. Экспорт обратно glTF Y-up
выполняется export_watch.py; манифест читает фактические TRS экспортного GLB.
Меняет только коллекцию PocketWatch_Exhibit, создавая собственную сцену.
"""
from __future__ import annotations
import bpy
import json
import math
import runpy
from pathlib import Path
from mathutils import Vector, Quaternion, Matrix

BASE = Path(__file__).resolve().parents[2]
OUT = BASE / 'public/models/pocket-watch.glb'
BLEND = BASE / 'assets/blender/pocket-watch.blend'
COLLECTION_NAME = 'PocketWatch_Exhibit'
TAU = math.tau
CURRENT = None
PARTS = []

# Isolate this exhibit. Never delete unrelated objects or collections.
if COLLECTION_NAME in bpy.data.collections:
    old = bpy.data.collections[COLLECTION_NAME]
    for obj in list(old.all_objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.collections.remove(old)
scene = bpy.data.scenes.get(COLLECTION_NAME) or bpy.data.scenes.new(COLLECTION_NAME)
if bpy.context.window:
    bpy.context.window.scene = scene
collection = bpy.data.collections.new(COLLECTION_NAME)
scene.collection.children.link(collection)
scene['pocket_watch_project'] = 'hod-vremeni-procedural-v1'
root = bpy.data.objects.new('watch_root', None)
collection.objects.link(root)


def srgb(value):
    return value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4


def material(name, hex_color, metallic=0., rough=.4):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    rgb = [int(hex_color.lstrip('#')[i:i+2], 16) / 255. for i in (0, 2, 4)]
    rgba = tuple(srgb(c) for c in rgb) + (1.,)
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = rgba
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = rough
    m.diffuse_color = rgba
    return m


BRASS = material('Satin brass', '#C89B55', 1., .28)
BRASS_EDGE = material('Polished brass edges', '#EAC27B', 1., .18)
BRONZE = material('Warm aged case', '#987143', 1., .31)
STEEL = material('Brushed steel', '#9CABB6', 1., .29)
STEEL_LIGHT = material('Polished steel', '#D0D8DB', 1., .18)
BLUE = material('Blued steel hands', '#172E4D', .92, .24)
INK = material('Charcoal dial printing', '#27313B', .05, .48)
ENAMEL = material('Ivory vitreous enamel', '#F1ECE0', .02, .24)
SUBDIAL = material('Recessed seconds enamel', '#DAD5C9', .04, .34)
RUBY = material('Synthetic ruby bearings', '#721E39', .25, .18)
DARK = material('Dark spring steel', '#344352', .92, .38)
GLASS = material('Optical crystal', '#D5E2E9', 0., .08)
glass_bsdf = GLASS.node_tree.nodes.get('Principled BSDF')
glass_bsdf.inputs['Transmission Weight'].default_value = .96
glass_bsdf.inputs['IOR'].default_value = 1.45
GLASS.diffuse_color = (.65, .78, .85, .12)


def xyz(v):
    """Y-up site coordinates -> Blender Z-up, a proper rotation (no mirror)."""
    return (float(v[0]), -float(v[2]), float(v[1]))


def part(name, title, description, material_label, category, rest=(0,0,0),
         offset=(0,0,0), start=0., end=1., anchor=(0,0,0), selectable=True):
    global CURRENT
    obj = bpy.data.objects.new(name, None)
    collection.objects.link(obj)
    obj.parent = root
    obj.location = xyz(rest)
    obj.empty_display_size = .08
    meta = dict(id=name, nodeName=name, title=title, description=description,
                materialLabel=material_label, category=category, start=start,
                end=end, explodedOffset=list(offset), labelAnchor=list(anchor),
                selectable=selectable)
    obj['watch_part_meta'] = json.dumps(meta, ensure_ascii=False)
    PARTS.append(obj)
    CURRENT = obj
    return obj


def mesh(name, verts, faces, mat=BRASS, smooth=False):
    data = bpy.data.meshes.new(name + '_mesh')
    data.from_pydata([xyz(v) for v in verts], [], faces)
    data.materials.append(mat)
    data.update()
    obj = bpy.data.objects.new(name, data)
    collection.objects.link(obj)
    obj.parent = CURRENT
    for polygon in data.polygons:
        polygon.use_smooth = smooth
    return obj


def pose_verts(verts, center=(0,0,0), axis=(0,0,1)):
    q = Vector((0,0,1)).rotation_difference(Vector(axis).normalized())
    c = Vector(center)
    return [tuple(q @ Vector(v) + c) for v in verts]


def lathe(name, profile, mat=BRASS, segments=96, center=(0,0,0), axis=(0,0,1), closed=True):
    """Revolve a radius/depth profile. Centre points have one vertex, no degenerate faces."""
    segments=min(segments,112)
    verts, rings, faces = [], [], []
    for radius, height in profile:
        if abs(radius) < 1.e-7:
            rings.append([len(verts)])
            verts.append((0,0,height))
        else:
            rings.append(list(range(len(verts), len(verts)+segments)))
            verts += [(radius*math.cos(i*TAU/segments),radius*math.sin(i*TAU/segments),height) for i in range(segments)]
    steps = len(rings) if closed else len(rings)-1
    for i in range(steps):
        a,b = rings[i], rings[(i+1)%len(rings)]
        if len(a)==1 and len(b)==1:
            continue
        for j in range(segments):
            k=(j+1)%segments
            if len(a)==1:
                faces.append((a[0],b[k],b[j]))
            elif len(b)==1:
                faces.append((a[j],a[k],b[0]))
            else:
                faces.append((a[j],a[k],b[k],b[j]))
    return mesh(name, pose_verts(verts,center,axis), faces,mat,True)


def disk(name,radius,depth,mat=BRASS,center=(0,0,0),axis=(0,0,1),bevel=.006,segments=96):
    b=min(bevel,depth*.35,radius*.2)
    h=depth/2
    profile=[(0,-h),(radius-b,-h),(radius,-h+b),(radius,h-b),(radius-b,h),(0,h)]
    if radius<.055: segments=min(segments,24)
    elif radius<.15: segments=min(segments,40)
    return lathe(name,profile,mat,segments,center,axis)


def ring(name,outer,inner,depth,mat=BRASS,center=(0,0,0),axis=(0,0,1),bevel=.004,segments=128):
    b=min(bevel,depth*.35,(outer-inner)*.3)
    h=depth/2
    profile=[(outer-b,-h),(outer,-h+b),(outer,h-b),(outer-b,h),
             (inner+b,h),(inner,h-b),(inner,-h+b),(inner+b,-h)]
    if outer<.12: segments=min(segments,32)
    return lathe(name,profile,mat,segments,center,axis)


def torus(name,major,minor,mat=BRASS,center=(0,0,0),axis=(0,0,1),segments=96,tube=8):
    segments=min(segments,80 if minor>.004 else 64)
    tube=min(tube,6 if minor>.004 else 4)
    verts,faces=[],[]
    for i in range(segments):
        a=i*TAU/segments
        for j in range(tube):
            b=j*TAU/tube
            r=major+minor*math.cos(b)
            verts.append((r*math.cos(a),r*math.sin(a),minor*math.sin(b)))
    for i in range(segments):
        for j in range(tube):
            faces.append((i*tube+j,((i+1)%segments)*tube+j,((i+1)%segments)*tube+(j+1)%tube,i*tube+(j+1)%tube))
    return mesh(name,pose_verts(verts,center,axis),faces,mat,True)


def line_ring(name,radius,width,mat=INK,center=(0,0,0),segments=96,back=False):
    # Printed/engraved hairlines are thin annular surfaces, not expensive tubes.
    verts=[]
    for r in [radius-width/2,radius+width/2]:
        verts += [(center[0]+r*math.cos(i*TAU/segments),center[1]+r*math.sin(i*TAU/segments),center[2]) for i in range(segments)]
    faces=[]
    for i in range(segments):
        j=(i+1)%segments
        f=(i,i+segments,j+segments,j)
        faces.append(tuple(reversed(f)) if back else f)
    return mesh(name,verts,faces,mat)


def poly(name, points, depth=.04, mat=BRASS, center=(0,0,0),bevel=.003):
    if sum(points[i][0]*points[(i+1)%len(points)][1]-points[(i+1)%len(points)][0]*points[i][1] for i in range(len(points)))<0:
        points=list(reversed(points))
    n=len(points)
    verts=[(x+center[0],y+center[1],z+center[2]) for z in (-depth/2,depth/2) for x,y in points]
    faces=[tuple(reversed(range(n))),tuple(range(n,n*2))]
    faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    obj=mesh(name,verts,faces,mat)
    if bevel:
        mod=obj.modifiers.new('Small machined edge bevel','BEVEL')
        mod.width=bevel; mod.segments=2
        bpy.context.view_layer.objects.active=obj
        obj.select_set(True)
        bpy.ops.object.modifier_apply(modifier=mod.name)
        obj.select_set(False)
    return obj


def bar(name,a,b,width,depth,mat=BRASS,center_z=0):
    dx,dy=b[0]-a[0],b[1]-a[1]
    length=math.hypot(dx,dy)
    nx,ny=-dy/length*width/2,dx/length*width/2
    return poly(name,[(a[0]+nx,a[1]+ny),(a[0]-nx,a[1]-ny),(b[0]-nx,b[1]-ny),(b[0]+nx,b[1]+ny)],depth,mat,(0,0,center_z),0 if depth<=.003 else min(.003,width*.14))


def tube_path(name,points,radius,mat=STEEL,steps=6):
    # Tangent-frame tube with a stable normal for planar XY curves.
    verts,faces=[],[]
    for i,p in enumerate(points):
        p=Vector(p)
        tangent=(Vector(points[min(i+1,len(points)-1)])-Vector(points[max(0,i-1)])).normalized()
        normal=Vector((0,0,1))
        if abs(tangent.dot(normal))>.98:
            normal=Vector((1,0,0))
        side=tangent.cross(normal).normalized()
        up=side.cross(tangent).normalized()
        for j in range(steps):
            a=j*TAU/steps
            verts.append(tuple(p+radius*(side*math.cos(a)+up*math.sin(a))))
    for i in range(len(points)-1):
        for j in range(steps):
            faces.append((i*steps+j,(i+1)*steps+j,(i+1)*steps+(j+1)%steps,i*steps+(j+1)%steps))
    faces += [tuple(reversed(range(steps))),tuple((len(points)-1)*steps+j for j in range(steps))]
    return mesh(name,verts,faces,mat,True)


font_path=str(BASE/'assets/blender/fonts/DejaVuSerif.ttf')
sans_path=str(BASE/'assets/blender/fonts/DejaVuSans.ttf')
FONT=bpy.data.fonts.load(font_path) if Path(font_path).exists() else bpy.data.fonts.get('Bfont')
SANS=bpy.data.fonts.load(sans_path) if Path(sans_path).exists() else FONT


def text(name,body,size,center,mat=INK,angle=0,font=None,spacing=1.,extrude=.0004):
    curve=bpy.data.curves.new(name+'_text','FONT')
    curve.body=body; curve.size=size; curve.align_x='CENTER'; curve.align_y='CENTER'
    curve.font=font or FONT; curve.space_character=spacing; curve.extrude=extrude
    curve.resolution_u=3
    obj=bpy.data.objects.new(name,curve)
    collection.objects.link(obj); obj.parent=CURRENT
    obj.location=xyz(center)
    # Text's +Y is up the dial, +Z faces forward after this rotation.
    obj.rotation_mode='QUATERNION'
    obj.rotation_quaternion=Quaternion((1,0,0),math.pi/2) @ Quaternion((0,0,1),angle)
    curve.materials.append(mat)
    bpy.context.view_layer.objects.active=obj
    obj.select_set(True)
    bpy.ops.object.convert(target='MESH')
    obj.select_set(False)
    return obj


def screw_geometry(name,r=.046,shaft=.09):
    disk(name+'_shaft',r*.36,shaft,STEEL_LIGHT,(0,0,-shaft/2),bevel=.003,segments=24)
    # A real slotted head built with two solid halves and a slot bottom.
    disk(name+'_headbase',r,.016,STEEL_LIGHT,(0,0,.004),bevel=.003,segments=40)
    gap=.006
    for sign in [-1,1]:
        pts=[]
        for i in range(13):
            a=(i/12*math.pi)+(0 if sign==1 else math.pi)
            x,y=r*math.cos(a),r*math.sin(a)
            if sign==1: y=max(gap/2,y)
            else: y=min(-gap/2,y)
            pts.append((x,y))
        poly(name+'_slot_cheek_'+str(sign),pts,.018,BLUE,(0,0,.018),.001)


def bearing(name,center,outer=.049):
    ring(name+'_setting',outer,outer*.55,.012,STEEL_LIGHT,center,bevel=.002,segments=36)
    disk(name+'_ruby',outer*.48,.013,RUBY,(center[0],center[1],center[2]+.002),bevel=.004,segments=32)
    disk(name+'_pivot',outer*.13,.014,STEEL_LIGHT,(center[0],center[1],center[2]+.005),bevel=.001,segments=16)


def gear(name,radius,teeth,depth=.035,mat=BRASS):
    n=teeth*4
    tooth=[radius*.89,radius*.98,radius,radius*.89]
    outer=[(tooth[i%4]*math.cos(i*TAU/n),tooth[i%4]*math.sin(i*TAU/n)) for i in range(n)]
    inner=[(radius*.66*math.cos(i*TAU/n),radius*.66*math.sin(i*TAU/n)) for i in range(n)]
    verts=[]
    for z in [-depth/2,depth/2]:
        verts += [(x,y,z) for x,y in outer] + [(x,y,z) for x,y in inner]
    faces=[]
    for i in range(n):
        j=(i+1)%n
        faces.extend([(i,j,j+2*n,i+2*n),(n+j,n+i,n+i+2*n,n+j+2*n),
                      (i+2*n,j+2*n,n+j+2*n,n+i+2*n),(j,i,n+i,n+j)])
    mesh(name+'_cut_teeth',verts,faces,mat)
    for i in range(5):
        a=TAU*i/5+.1
        bar(name+'_spoke_'+str(i),(math.cos(a)*radius*.12,math.sin(a)*radius*.12),
            (math.cos(a)*radius*.72,math.sin(a)*radius*.72),radius*.09,depth*.8,mat)
    disk(name+'_hub',radius*.19,depth*1.55,mat,bevel=.004,segments=40)
    torus(name+'_rim',radius*.77,.004,mat,(0,0,depth*.51),segments=80,tube=6)
    disk(name+'_axle',.021,.13,STEEL,(0,0,.025),bevel=.003,segments=24)
    # Distinct steel pinion on each wheel.
    ring(name+'_pinion_collar',.046,.023,.025,STEEL,(0,0,.041),segments=32,bevel=.003)
    pinion_points=[]
    for i in range(40):
        a=TAU*i/40
        r=[.041,.054,.054,.041][i%4]
        pinion_points.append((r*math.cos(a),r*math.sin(a)))
    poly(name+'_solid_ten_tooth_pinion',pinion_points,.035,STEEL,(0,0,.045),bevel=0)


# 1. A turned case: rounded waist, bright lips, fine concentric grooves.
part('case_body','Корпус','Несущий обод удерживает циферблат и механизм, защищая их по окружности.',
     'Сатинированная латунь','case',anchor=(1.3,.18,0))
lathe('turned_case',[(1.22,-.29),(1.31,-.28),(1.375,-.235),(1.408,-.15),(1.413,-.055),
                    (1.405,.06),(1.37,.17),(1.30,.235),(1.235,.245),(1.19,.22),
                    (1.17,.17),(1.17,-.20),(1.20,-.275)],BRONZE,160)
for z,r in [(-.235,1.373),(-.195,1.394),(.137,1.38),(.184,1.348)]:
    torus('case_turned_reveal',r,.008,BRASS_EDGE,(0,0,z),segments=144)
for z in [-.10,-.075,-.05,-.025,.0]:
    torus('case_waist_groove',1.411,.0022,BRONZE,(0,0,z),segments=144,tube=5)
# Stem tube intentionally remains attached to the body.
disk('case_pendant_neck',.125,.31,BRONZE,(0,1.47,0),axis=(0,1,0),bevel=.02,segments=64)
for y in [1.39,1.48,1.59]:
    torus('pendant_band',.126,.009,BRASS_EDGE,(0,y,0),axis=(0,1,0),segments=48)

# 2. Back cover, with circular engine turning and a restrained medallion.
part('back_cover','Задняя крышка','Защищает механизм со стороны корпуса. Снимается первым слоем назад.',
     'Латунь, полированная сталь','case',rest=(0,0,-.305),offset=(.18,-.08,-1.62),start=0,end=.24,anchor=(.8,.25,-.04))
lathe('convex_back_cover',[(0,-.07),(1.20,-.07),(1.28,-.044),(1.31,-.01),(1.30,.018),
                          (1.25,.044),(0,.044)],BRASS,144)
for r in [.26,.43,.61,.79,.96,1.11,1.23]:
    line_ring('cover_concentric_turning',r,.004,BRONZE,(0,0,-.072),segments=96,back=True)
ring('cover_inner_lip',1.22,1.17,.035,BRONZE,(0,0,.046))
# Inside decoration is visible after turning the camera.
text('cover_inside_mark','ХОД ВРЕМЕНИ',.095,(0,.16,.067),BRONZE,font=SANS)
text('cover_inside_model','МЕХАНИЧЕСКИЕ ЧАСЫ',.047,(0,-.07,.067),BRONZE,font=SANS)

# 3. Bow: oval metal loop, mounted on its own shaft.
part('bow','Дужка','Кольцо над заводной головкой служит креплением для часовой цепочки.',
     'Полированная латунь','case',rest=(0,1.88,-.005),offset=(0,.07,-.03),start=.72,end=1,anchor=(.21,.19,0))
# Elliptical torus; sculpted shoulders avoid a perfect cheap circle.
verts=[]; faces=[]; seg=96; tube=12
for i in range(seg):
    a=TAU*i/seg
    x=.315*math.cos(a); y=.335*math.sin(a)
    n=Vector((math.cos(a)/.315,math.sin(a)/.335,0)).normalized()
    for j in range(tube):
        b=TAU*j/tube
        v=Vector((x,y,0))+.047*(n*math.cos(b)+Vector((0,0,1))*math.sin(b))
        verts.append(tuple(v))
for i in range(seg):
    for j in range(tube):
        faces.append((i*tube+j,((i+1)%seg)*tube+j,((i+1)%seg)*tube+(j+1)%tube,i*tube+(j+1)%tube))
mesh('oval_chain_bow',verts,faces,BRASS,True)
disk('bow_pivot_left',.064,.085,BRASS_EDGE,(-.266,-.205,0),axis=(1,0,0),segments=40)
disk('bow_pivot_right',.064,.085,BRASS_EDGE,(.266,-.205,0),axis=(1,0,0),segments=40)

# 4–5. Onion-shaped crown, real fluted ridges, and its separate winding stem.
part('crown','Заводная головка','Поворачивая головку, заводят пружину и переводят стрелки через заводной вал.',
     'Рифлёная латунь','case',rest=(0,1.695,0),offset=(0,.36,.08),start=.62,end=.94,anchor=(.18,.03,0))
lathe('onion_crown',[(0,-.135),(.106,-.135),(.146,-.10),(.173,-.052),(.18,.005),
                    (.16,.067),(.121,.105),(.075,.126),(0,.13)],BRASS,96,axis=(0,1,0))
for i in range(40):
    a=TAU*i/40
    points=[]
    for r,y in [(.11,-.126),(.149,-.092),(.176,-.038),(.179,.007),(.156,.068),(.112,.108)]:
        points.append((r*math.cos(a),y,r*math.sin(a)))
    tube_path('crown_flute_'+str(i),points,.005,BRASS_EDGE,5)
for y,r in [(-.12,.119),(.10,.124)]:
    torus('crown_end_reveal',r,.008,BRASS,(0,y,0),axis=(0,1,0),segments=64)
part('crown_stem','Заводной вал','Передаёт движение головки узлам завода и установки времени.',
     'Сталь','movement',rest=(0,1.30,0),offset=(0,.20,.12),start=.66,end=.94,anchor=(0,.12,.01))
disk('winding_stem',.025,.58,STEEL,axis=(0,1,0),segments=24)
for y in [-.21,-.16,.14]:
    disk('stem_collar',.045,.035,STEEL,(0,y,0),axis=(0,1,0),segments=24)

# 6. Separable front bezel, multi-step metal profile.
part('front_bezel','Ободок','Переднее кольцо фиксирует защитное стекло и обрамляет циферблат.',
     'Полированная латунь','case',rest=(0,0,.335),offset=(-.32,.10,2.62),start=0,end=.23,anchor=(1.23,.35,.03))
lathe('front_bezel_profile',[(1.25,-.095),(1.32,-.085),(1.36,-.04),(1.36,.005),(1.33,.047),
                           (1.26,.070),(1.18,.066),(1.135,.04),(1.125,.006),(1.15,-.038),(1.19,-.078)],BRASS,160)
for r,z in [(1.322,.047),(1.195,.068),(1.134,.023)]:
    torus('bezel_polished_reveal',r,.006,BRASS_EDGE,(0,0,z),segments=144)
for r in [1.238,1.249,1.260,1.271,1.282]:
    line_ring('bezel_micro_ring',r,.0018,BRASS,(0,0,.069),segments=96)

# 7. Optical crystal: a very shallow, closed lens, no alpha-painted fake geometry.
part('front_glass','Защитное стекло','Прозрачная линза защищает циферблат и стрелки. При разборке отделяется самостоятельным слоем.',
     'Оптическое стекло','dial',rest=(0,0,.397),offset=(-.28,.08,2.18),start=.08,end=.32,anchor=(.85,.55,.025))
lathe('crystal_shallow_lens',[(0,.035),(.35,.031),(.70,.019),(1.0,.001),(1.125,-.012),
                            (1.13,-.022),(1.115,-.028),(.80,-.017),(0,-.012)][::-1],GLASS,112)

# 8. Dial, typography and minute marks. All are native exported geometry.
part('dial_face','Циферблат','Эмалевый диск с часовыми и минутными метками показывает время и закрывает механизм со стороны стрелок.',
     'Светлая эмаль, печатные метки','dial',rest=(0,0,.236),offset=(-.70,-.18,1.35),start=.26,end=.55,anchor=(.7,.7,.025))
disk('vitreous_enamel_dial',1.165,.050,ENAMEL,segments=160,bevel=.012)
# Printed rings lie above the enamel without z-fighting.
for r,w in [(1.098,.0025),(1.022,.0018),(.817,.0016)]:
    line_ring('dial_printed_circle',r,w*2,INK,(0,0,.0268),segments=112)
for i in range(60):
    a=TAU*i/60
    major=i%5==0
    outer=1.088; inner=1.028 if major else 1.057
    bar('minute_mark_'+str(i),(inner*math.sin(a),inner*math.cos(a)),
        (outer*math.sin(a),outer*math.cos(a)),.009 if major else .0034,.0015,INK,.028)
roman=['XII','I','II','III','IV','V','VI','VII','VIII','IX','X','XI']
for i,label in enumerate(roman):
    a=TAU*i/12
    size=.165 if i in [0,3,6,9] else .151
    text('hour_'+label,label,size,(.914*math.sin(a),.914*math.cos(a),.0295),INK)
text('dial_signature','ХОД ВРЕМЕНИ',.071,(0,.365,.0298),INK,font=SANS,spacing=1.06)
text('dial_subtitle','МЕХАНИЧЕСКИЕ ЧАСЫ',.032,(0,.258,.0300),INK,font=SANS,spacing=1.03)
# Small seconds, inset enamel with 60 subtle ticks and concentric finishing.
disk('small_seconds_recess',.281,.003,SUBDIAL,(0,-.534,.0278),segments=96,bevel=.001)
for r in [.252,.271]:
    line_ring('small_seconds_ring',r,.0036,INK,(0,-.534,.030),segments=80)
for r in [.044,.071,.098,.125,.152,.179,.205]:
    line_ring('seconds_enamel_turning',r,.0016,ENAMEL,(0,-.534,.031),segments=64)
for i in range(60):
    a=TAU*i/60
    inner=.235 if i%5==0 else .246
    bar('seconds_mark_'+str(i),(inner*math.sin(a),-.534+inner*math.cos(a)),
        (.262*math.sin(a),-.534+.262*math.cos(a)),.004 if i%5==0 else .002,.001,INK,.032)
for i,label in [(0,'60'),(1,'15'),(2,'30'),(3,'45')]:
    a=i*math.pi/2
    text('seconds_'+label,label,.037,(.208*math.sin(a),-.534+.208*math.cos(a),.033),INK,font=SANS)

# 9–12. Thin dial support, two ornamental hands at 10:10, small seconds.
part('dial_support','Опора циферблата','Тонкая опора соединяет циферблат с платиной механизма.',
     'Латунь','dial',rest=(0,0,.172),offset=(-.35,-.10,.95),start=.31,end=.59,anchor=(.91,.2,.02))
ring('dial_support_rim',1.125,1.015,.025,BRASS,segments=128)
for a in [0,TAU/3,2*TAU/3]:
    x,y=1.04*math.cos(a),1.04*math.sin(a)
    disk('dial_foot',.032,.10,STEEL,(x,y,-.046),segments=24)
    disk('dial_foot_pad',.067,.02,BRASS,(x,y,0),segments=32)


def hand(name,length,width,angle):
    # A classic pierced lancet/spade silhouette, plus a visible polished centre pin.
    points=[(-width*.48,-.21),(-width*.70,-.15),(-width*.55,-.08),
            (-width*.42,.16),(-width*.82,length*.42),(-width*.50,length*.64),
            (-width*.24,length*.84),(0,length),(width*.24,length*.84),
            (width*.50,length*.64),(width*.82,length*.42),(width*.42,.16),
            (width*.55,-.08),(width*.70,-.15),(width*.48,-.21)]
    ca,sa=math.cos(angle),math.sin(angle)
    points=[(x*ca-y*sa,x*sa+y*ca) for x,y in points]
    poly(name+'_spade',points,.009,BLUE,bevel=.0015)
    ring(name+'_pivot_eye',.065,.031,.012,BLUE,segments=48,bevel=.002)
    # A finer central ridge gives blue steel distinct specular edges.
    a=(0,.11); b=(0,length*.73)
    a=(a[0]*ca-a[1]*sa,a[0]*sa+a[1]*ca)
    b=(b[0]*ca-b[1]*sa,b[0]*sa+b[1]*ca)
    bar(name+'_polished_ridge',a,b,width*.10,.002,STEEL,.006)

part('hand_hour','Часовая стрелка','Короткая стрелка совершает оборот за двенадцать часов. В демонстрации установлена на 10:10.',
     'Синёная сталь','dial',rest=(0,0,.301),offset=(-.25,.13,1.59),start=.18,end=.45,anchor=(-.45,.35,.01))
hand('hour_hand',.665,.065,math.radians(55))
part('hand_minute','Минутная стрелка','Длинная стрелка показывает минуты; колёсная передача связывает её с часовой стрелкой.',
     'Синёная сталь','dial',rest=(0,0,.323),offset=(-.27,.17,1.76),start=.21,end=.47,anchor=(.55,.32,.01))
hand('minute_hand',.91,.039,math.radians(-60))
disk('central_cap',.041,.018,STEEL,(0,0,.012),bevel=.005,segments=40)
part('hand_second','Секундная стрелка','Отдельная малая стрелка показывает секунды на нижнем циферблате.',
     'Синёная сталь','dial',rest=(0,-.534,.286),offset=(-.17,-.05,1.52),start=.24,end=.48,anchor=(.13,.1,.01))
poly('small_second_needle',[(-.006,-.055),(-.005,.18),(0,.226),(.005,.18),(.006,-.055)],.005,BLUE,bevel=.0008)
disk('small_second_pivot',.024,.013,BRASS_EDGE,(0,0,.006),bevel=.002,segments=32)

# 13. Mainplate is the stationary spatial anchor of the construction.
part('movement_mainplate','Основная платина','Несущая основа механизма. В её опорах расположены оси колёс и узлы регулирования хода.',
     'Матовая латунь','movement',rest=(0,0,-.132),anchor=(.90,-.55,.02))
disk('mainplate',1.148,.064,BRASS,segments=144,bevel=.012)
ring('mainplate_outer_ridge',1.13,1.075,.012,BRASS,(0,0,.038),segments=144)
# Concentric machining is actual shallow surface geometry, not a heavy noise map.
for r in [.20,.28,.36,.44,.52,.60,.68,.76,.84,.92,1.0]:
    line_ring('plate_concentric_finish',r,.0022,BRONZE,(0,0,.033),segments=80)
for x,y in [(-.88,.37),(.78,.62),(.91,-.30),(-.62,-.79),(-.14,.85)]:
    ring('mainplate_screw_seat',.057,.025,.009,STEEL,(x,y,.038),segments=32,bevel=.001)
text('plate_engraving','ХОД ВРЕМЕНИ',.049,(.04,-.94,.035),BRONZE,font=SANS)

# 14–18. A visibly connected train, each wheel with true teeth and five open spokes.
wheel_data=[
 ('gear_center','Центральное колесо',(0,.10,.015),.375,56,(.38,.15,.44)),
 ('gear_intermediate','Промежуточное колесо',(-.575,-.045,.025),.255,44,(.85,.78,.60)),
 ('gear_fourth','Секундное колесо',(-.455,-.486,.037),.225,38,(.90,-.08,.58)),
 ('gear_escape','Спусковое колесо',(-.105,-.635,.049),.158,24,(.35,-.48,.64)),
 ('gear_winding','Заводное колесо',(-.14,.815,.035),.157,26,(-.12,.42,.37)),
]
for name,title,pos,r,teeth,offset in wheel_data:
    desc='Зубчатое колесо передаёт вращение соседним узлам. Открытые спицы уменьшают его массу, а ось опирается на платину и мост.'
    if name=='gear_escape': desc='Последнее колесо передачи взаимодействует с анкером: спуск выдаёт энергию небольшими импульсами.'
    if name=='gear_winding': desc='Передаёт вращение заводной головки к пружинному барабану.'
    part(name,title,desc,'Латунь, стальная ось','movement',rest=pos,offset=offset,start=.52,end=.91,anchor=(r*.6,r*.5,.06))
    gear(name,r,teeth,.032)

# 19–21. Barrel body, a separate lid/ratchet, and a visible coiled mainspring.
part('mainspring_barrel','Заводной барабан','Внутри барабана расположена пружина. При заводе она запасает энергию для работы механизма.',
     'Латунь','movement',rest=(.622,.462,-.009),offset=(.40,.24,.38),start=.58,end=.93,anchor=(.28,.16,.07))
ring('barrel_drum',.355,.305,.105,BRASS,segments=96,bevel=.006)
disk('barrel_floor',.344,.018,BRASS,(0,0,-.052),segments=96)
for z in [-.035,.018]: torus('barrel_rib',.355,.005,BRASS_EDGE,(0,0,z),segments=96)
for i in range(54):
    a=TAU*i/54
    poly('barrel_tooth_'+str(i),[(.349*math.cos(a-.018),.349*math.sin(a-.018)),(.371*math.cos(a-.012),.371*math.sin(a-.012)),
                                (.371*math.cos(a+.012),.371*math.sin(a+.012)),(.349*math.cos(a+.018),.349*math.sin(a+.018))],.020,BRASS,bevel=0)
part('barrel_cover','Крышка барабана','Верхняя крышка удерживает заводную пружину внутри барабана.',
     'Латунь, сталь','movement',rest=(.622,.462,.057),offset=(.48,.27,.70),start=.61,end=.94,anchor=(.24,.09,.02))
disk('barrel_lid',.333,.025,BRASS,segments=96)
for r in [.11,.22,.31]: torus('barrel_lid_turning',r,.002,BRONZE,(0,0,.014),segments=80,tube=5)
disk('barrel_lid_axle',.035,.08,STEEL_LIGHT,(0,0,.033),segments=32)
part('mainspring','Заводная пружина','При раскручивании пружина отдаёт запасённую энергию барабану. Здесь показана условная спираль.',
     'Пружинная сталь','movement',rest=(.622,.462,-.005),offset=(.42,.22,.53),start=.65,end=.96,anchor=(.19,.16,.01))
points=[]
for i in range(320):
    t=i/319; a=t*TAU*7.3; r=.045+.242*t
    points.append((r*math.cos(a),r*math.sin(a),0))
tube_path('barrel_coiled_mainspring',points,.0045,DARK,4)
disk('mainspring_arbor',.037,.07,STEEL,(0,0,.0),segments=32)

# 22–23. Ratchet and click (nonidentical to the transmitting wheels).
part('ratchet_wheel','Храповое колесо','Узел завода удерживает пружину от обратного раскручивания при заводе.',
     'Полированная сталь','movement',rest=(.622,.462,.115),offset=(.48,.28,.86),start=.57,end=.90,anchor=(.18,.15,.03))
gear('ratchet',.258,32,.024,STEEL)
part('winding_click','Собачка храповика','Небольшой подпружиненный рычаг удерживает храповое колесо после поворота головки.',
     'Сталь','movement',rest=(.85,.75,.129),offset=(.48,.32,.67),start=.61,end=.92,anchor=(.08,.04,.01))
poly('click_lever',[(-.12,-.035),(.02,-.045),(.12,.025),(.105,.06),(-.035,.025),(-.12,.025)],.025,STEEL)
disk('click_pivot',.036,.042,BRASS_EDGE,(-.08,0,.009),segments=32)

# 24–25. Balance wheel with a real hair spring, and separate balance cock.
part('balance_assembly','Баланс','Колебательный узел задаёт ритм работы часов совместно с волоском и спуском.',
     'Латунь, пружинная сталь','movement',rest=(.53,-.48,.028),offset=(.45,-.29,.50),start=.54,end=.92,anchor=(.25,-.13,.06))
ring('balance_outer_wheel',.34,.299,.027,BRASS_EDGE,segments=112)
for i in range(3):
    a=i*TAU/3
    bar('balance_spoke_'+str(i),(.02*math.cos(a),.02*math.sin(a)),(.31*math.cos(a),.31*math.sin(a)),.028,.023,BRASS_EDGE)
for i in range(12):
    a=TAU*i/12
    disk('balance_timing_weight_'+str(i),.017,.023,STEEL_LIGHT,(.336*math.cos(a),.336*math.sin(a),0),axis=(math.cos(a),math.sin(a),0),bevel=.002,segments=16)
disk('balance_axle',.022,.14,STEEL_LIGHT,(0,0,.028),segments=24)
points=[]
for i in range(320):
    t=i/319; a=t*TAU*6.5; r=.034+.231*t
    points.append((r*math.cos(a),r*math.sin(a),.038))
tube_path('balance_hairspring',points,.0025,BLUE,4)
part('movement_bridge_balance','Мост баланса','Удерживает верхнюю опору баланса и его регулятор, сохраняя свободное место для колебаний.',
     'Сатинированная латунь, рубин','movement',rest=(.53,-.48,.13),offset=(.56,-.32,.80),start=.42,end=.75,anchor=(.17,-.04,.035))
poly('balance_cock',[(-.075,-.075),(.05,-.08),(.15,-.12),(.35,-.22),(.44,-.21),(.44,-.08),(.26,-.035),(.10,.055),(-.04,.075)],.049,BRASS,bevel=.009)
ring('balance_cock_bearing_hole',.08,.033,.048,BRASS,(0,0,0),segments=64)
bearing('balance_endstone',(0,0,.032),.041)
bar('balance_regulator_arm',(.01,0),(-.15,.12),.018,.018,STEEL_LIGHT,.032)
text('balance_regulator_mark','+  −',.056,(.04,.10,.027),RUBY,font=SANS)

# 26–27. Pallet/anchor, separate fork link.
part('pallet_fork','Анкерная вилка','Попеременно удерживает и освобождает зубья спускового колеса, передавая импульсы балансу.',
     'Сталь, рубиновые палеты','movement',rest=(.20,-.55,.061),offset=(.17,-.34,.56),start=.58,end=.93,anchor=(.05,.03,.02))
poly('pallet_anchor',[(-.12,-.07),(-.14,-.025),(-.055,.025),(-.04,.14),(.005,.15),(.03,.035),(.14,-.015),(.13,-.055),(.04,-.025),(-.04,-.02)],.016,STEEL)
poly('pallet_left_stone',[(-.15,-.075),(-.11,-.075),(-.11,-.04),(-.15,-.04)],.018,RUBY,bevel=.001)
poly('pallet_right_stone',[(.11,-.06),(.15,-.06),(.15,-.025),(.11,-.025)],.018,RUBY,bevel=.001)
disk('pallet_pivot',.019,.08,STEEL_LIGHT,(0,0,.02),segments=24)
part('movement_bridge_pallet','Мост анкера','Фиксирует ось анкерной вилки над платиной механизма.',
     'Латунь','movement',rest=(.20,-.55,.12),offset=(.18,-.28,.79),start=.46,end=.76,anchor=(.13,.04,.035))
poly('pallet_bridge',[(-.20,-.05),(.13,-.04),(.18,.025),(.10,.08),(-.17,.07)],.042,BRASS,bevel=.006)
bearing('pallet_bridge_ruby',(0,0,.028),.034)

# 28–30. Distinct sculpted bridges, actual bored openings.
part('movement_bridge_upper','Верхний мост','Удерживает несколько осей колёс. Снятие моста открывает колёсную передачу.',
     'Сатинированная латунь, рубин','movement',rest=(0,0,.103),offset=(0,.65,.82),start=.40,end=.73,anchor=(-.54,.55,.035))
bridge=poly('upper_sculpted_bridge',[(-.94,.28),(-.91,.53),(-.76,.77),(-.46,.96),(-.13,1.00),(.11,.92),
                                  (.13,.76),(-.12,.60),(-.24,.34),(-.42,.25),(-.59,.37),(-.79,.26)],.053,BRASS,bevel=.009)
# A large opening makes this a bridge, rather than a gold-painted plate.
cut=disk('bridge_opening_cutter',.16,.16,DARK,(-.58,.59,0),segments=64,bevel=0)
mod=bridge.modifiers.new('Bored bridge aperture','BOOLEAN'); mod.operation='DIFFERENCE'; mod.solver='EXACT'; mod.object=cut
bpy.context.view_layer.objects.active=bridge
bpy.ops.object.modifier_apply(modifier=mod.name)
bpy.data.objects.remove(cut,do_unlink=True)
for x,y in [(-.57,-.04),(-.14,.815)]:
    # Raised bearing islands and short connecting lobes.
    ring('upper_bridge_bearing_island',.092,.035,.05,BRASS,(x,y,0),segments=48,bevel=.005)
    bearing('upper_bridge_jewel',(x,y,.035),.041)
bar('upper_bridge_lower_foot',(-.73,.30),(-.575,-.045),.125,.053,BRASS,0)
text('upper_bridge_engraving','МЕХАНИКА',.046,(-.40,.83,.030),RUBY,font=SANS)
part('movement_bridge_train','Мост колёсной передачи','Поддерживает оси промежуточного и секундного колёс, сохраняя их взаимное положение.',
     'Латунь, рубин','movement',rest=(-.35,-.32,.116),offset=(.85,-.07,.75),start=.43,end=.75,anchor=(-.2,-.1,.03))
poly('train_bridge',[(-.43,.06),(-.34,.21),(-.19,.20),(-.10,.05),(.12,.02),(.19,-.16),(.10,-.26),
                    (-.06,-.24),(-.17,-.08),(-.36,-.06)],.046,BRASS,bevel=.008)
for x,y in [(-.225,.275),(-.105,-.166)]:
    bearing('train_bridge_jewel',(x,y,.033),.042)
part('movement_bridge_center','Центральный мост','Верхняя опора центрального колеса и центральной оси стрелочного механизма.',
     'Латунь, сталь','movement',rest=(0,.10,.132),offset=(.48,.36,.84),start=.44,end=.76,anchor=(.12,.08,.035))
poly('center_bridge',[(-.09,-.11),(.08,-.10),(.28,.04),(.40,.14),(.35,.23),(.20,.20),(.05,.11),(-.08,.08)],.048,BRASS,bevel=.008)
bearing('center_pivot_bearing',(0,0,.033),.043)

# 31–32. Motion works under the dial, not another anonymous flat disc.
part('motion_works','Стрелочный механизм','Небольшие колёса под циферблатом согласуют скорости часовой и минутной стрелок.',
     'Латунь, сталь','movement',rest=(0,0,.158),offset=(-.16,.09,1.02),start=.48,end=.85,anchor=(.15,.12,.02))
gear('motion_work_cannon',.155,28,.018,BRASS)
part('hour_wheel','Часовое колесо','Передаёт медленное вращение часовой стрелке через полую центральную втулку.',
     'Латунь','movement',rest=(.235,-.025,.151),offset=(.04,-.05,.96),start=.51,end=.87,anchor=(.1,.08,.03))
gear('hour_reduction_wheel',.112,22,.019,BRASS)

# 33–35. Separate metal setting rings over three significant jewels.
for i,(x,y,z) in enumerate([(-.575,-.045,.149),(-.455,-.486,.160),(.53,-.48,.175)],1):
    part('jewel_setting_'+str(i),['Опора промежуточного колеса','Опора секундного колеса','Накладной камень баланса'][i-1],
         'Твёрдый рубиновый подшипник уменьшает трение в опоре тонкой стальной оси.',
         'Синтетический рубин в стальной оправе','fastener',rest=(x,y,z),
         offset=((-0.12 if x<0 else .20),.08 if y>-.2 else -.13,1.01+i*.025),start=.73,end=1,anchor=(.035,.035,.008))
    bearing('separate_setting_'+str(i),(0,0,0),.043)

# 36–45. Ten distinct slotted fasteners, only modest separation from their seats.
screw_positions=[(-.86,.36,.16),(-.67,.82,.16),(-.14,.91,.16),(.35,.30,.18),
                 (-.65,-.24,.16),(-.32,-.64,.16),(.93,-.67,.18),(.90,.76,.17),
                 (.97,-.30,-.06),(-.60,-.83,-.06)]
for i,position in enumerate(screw_positions,1):
    category='fastener'
    part('screw_bridge_%02d'%i,'Винт крепления %02d'%i,
         'Разъёмное крепление удерживает мост или узел на платине. Винты отделяются в конце разборки.',
         'Синёная и полированная сталь',category,rest=position,
         offset=(position[0]*.13,position[1]*.13,.42+(i%3)*.065),start=.70+(i%3)*.025,end=1.,
         anchor=(.035,.035,.028))
    screw_geometry('bridge_screw_%02d'%i,.042 if i<9 else .038,.075)

# 46–47. Two dial feet visibly connect a face to its structure.
for i,(x,y) in enumerate([(-.73,.67),(.73,-.67)],1):
    part('dial_fastener_%02d'%i,'Стойка циферблата %02d'%i,
         'Тонкая стальная стойка задаёт расстояние между циферблатом и платиной.',
         'Сталь','fastener',rest=(x,y,.115),offset=(x*.14,y*.14,.87),start=.61,end=.96,
         anchor=(.025,.025,.02))
    disk('dial_foot_shaft',.023,.17,STEEL_LIGHT,segments=24,bevel=.002)
    disk('dial_foot_shoulder',.043,.019,BRASS,(0,0,.06),segments=32,bevel=.002)

# Collapse decoration by carrier, preserving carriers and material boundaries.
# This keeps the glTF draw count bounded without merging moving components.
for carrier in PARTS:
    children=[obj for obj in carrier.children if obj.type=='MESH']
    if not children:
        raise RuntimeError('Empty part: '+carrier.name)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in children: obj.select_set(True)
    bpy.context.view_layer.objects.active=children[0]
    bpy.ops.object.join()
    merged=bpy.context.view_layer.objects.active
    merged.name=carrier.name+'_geometry'
    # An all-flat gear preserves true tooth facets; smooth turned surfaces remain smooth.
    merged.select_set(False)

# Font sources live beside the builder; converted mesh export has no font dependency.
for p in [BLEND.parent, OUT.parent, BASE/'src/data', BASE/'docs/evidence']:
    p.mkdir(parents=True,exist_ok=True)
scene['watch_parts_count']=len(PARTS)
scene['watch_source']='Original procedural Blender geometry; build_watch.py'
scene.render.engine='BLENDER_EEVEE_NEXT'
scene.world=scene.world or bpy.data.worlds.new('Watch Studio World')
scene.world.color=(.02,.028,.04)
# Saving preserves a recoverable .blend1 of a previous generated revision.
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
runpy.run_path(str(BASE/'assets/blender/export_watch.py'),run_name='__main__')
print('WATCH_BUILD_DONE',len(PARTS),'parts',str(OUT),flush=True)
