"""守護神獸・台灣黑熊 —— 3D 模型(bpy 腳本)

參考 assets/pets/bear-guardian.png:圓頭大耳、胸口白 V、藍眼、金色護具、
額頭發光紋、手上一顆藍色光球。比例照 2D 插畫的 Q 版身形:頭和身體差不多大。

兩個關鍵做法(都是踩過坑之後換的):

  · 身體用 metaball 堆。球和球會自己融在一起,肩膀、脖子不會露出接縫 ——
    這種圓滾滾的造型用一般的球去拼,交界一定看得出來。
    metaball 的 radius 是「影響範圍」不是實際半徑:stiffness 2 / threshold 0.6
    時實際半徑約等於 radius × 0.575(量過的),所以要除回去。

  · 貼在身上的花紋(胸口的 V、額頭的紋、眉毛那兩撇)**用 shrinkwrap 吸附**,
    不要自己算座標。身體是 metaball 融出來的不規則面,座標用猜的不是浮在空中
    就是埋進去 —— 前兩版兩種都發生過。

用法:python3.13 -I bear.py [解析度] [取樣數] [視角]
      視角:front / three(預設,四十五度) / side / back
"""
import bpy, math, os, sys
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
RES = int(sys.argv[1]) if len(sys.argv) > 1 else 640
SAMPLES = int(sys.argv[2]) if len(sys.argv) > 2 else 64
VIEW = sys.argv[3] if len(sys.argv) > 3 else 'three'
OUT = os.path.join(HERE, f'bear-{VIEW}.png')

bpy.ops.wm.read_factory_settings(use_empty=True)
D, C = bpy.data, bpy.context


# ============================================================ 材質
def mat(name, color, rough=0.5, emit=None, strength=1.0, metal=0.0):
    m = D.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1)
        b.inputs['Emission Strength'].default_value = strength
    return m


FUR    = mat('fur',   (0.016, 0.015, 0.022), 0.54)   # 黑熊的黑:偏冷,不是純黑
CREAM  = mat('cream', (0.98, 0.94, 0.85), 0.52)
NOSE   = mat('nose',  (0.10, 0.07, 0.08), 0.30)
EYEW   = mat('eyew',  (1, 1, 1), 0.22)
IRIS   = mat('iris',  (0.10, 0.58, 0.92), 0.16, emit=(0.08, 0.40, 0.78), strength=0.9)
PUPIL  = mat('pupil', (0.015, 0.02, 0.05), 0.18)
SHINE  = mat('shine', (1, 1, 1), 0.08, emit=(1, 1, 1), strength=3)
GOLD   = mat('gold',  (0.95, 0.74, 0.28), 0.18, metal=0.95)
RUNE   = mat('rune',  (1.0, 0.86, 0.38), 0.2, emit=(1.0, 0.78, 0.22), strength=5)
GLOW   = mat('glow',  (0.6, 0.9, 1.0), 0.08, emit=(0.40, 0.82, 1.0), strength=20)
MOUTH  = mat('mouth', (0.36, 0.10, 0.13), 0.42)
TONGUE = mat('tongue', (0.88, 0.40, 0.45), 0.38)
PAW    = mat('paw',   (0.30, 0.62, 0.80), 0.4)       # 肉球:插畫上是藍色的


def put(o, m):
    o.data.materials.clear()
    o.data.materials.append(m)
    return o


def ball(r, loc, m, scale=(1, 1, 1), rot=(0, 0, 0), seg=48, ring=28):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc,
                                         segments=seg, ring_count=ring)
    o = C.object
    o.scale = scale
    o.rotation_euler = rot
    bpy.ops.object.shade_smooth()
    return put(o, m)


# ============================================================ 身體
HEAD = (0.0, 0.0, 1.66)
HR = 0.76

BLOBS = [
    # (位置, 半徑, 硬度) 硬度小的比較不會和旁邊融在一起 —— 耳朵要凸出來就靠這個
    ((0.00, 0.02, 0.68), 0.60, 2.0),     # 肚子
    ((0.00, -0.02, 1.02), 0.50, 2.0),    # 胸
    ((0.00, -0.04, 1.32), 0.38, 2.0),    # 脖子
    (HEAD, HR, 2.0),                     # 頭
    ((0.00, 0.10, 1.80), 0.52, 2.0),     # 後腦勺,讓頭不要只是一顆球
    # 手臂
    ((0.56, -0.10, 1.12), 0.28, 1.6),
    ((0.80, -0.30, 0.90), 0.24, 1.4),
    ((-0.56, -0.10, 1.12), 0.28, 1.6),
    ((-0.82, -0.26, 0.92), 0.24, 1.4),
    # 腿
    ((0.34, 0.04, 0.30), 0.33, 1.8),
    ((-0.34, 0.04, 0.30), 0.33, 1.8),
    # 耳朵
    ((0.62, 0.06, 2.26), 0.31, 1.0),
    ((-0.62, 0.06, 2.26), 0.31, 1.0),
]

mb = D.metaballs.new('body')
mb.resolution = 0.028
mb.render_resolution = 0.020
body = D.objects.new('body', mb)
C.collection.objects.link(body)
for loc, r, stiff in BLOBS:
    el = mb.elements.new()
    el.co = Vector(loc)
    el.stiffness = stiff
    el.radius = r / 0.575

C.view_layer.objects.active = body
body.select_set(True)
bpy.ops.object.convert(target='MESH')
body = C.object
body.name = 'body'
bpy.ops.object.shade_smooth()
put(body, FUR)


def surface(x, z, from_front=True):
    """從正面往身體打一條射線,回傳打中的那一點與法線。

       花紋要貼在身上,靠的是**問身體自己**表面在哪裡,不是用算的。
       metaball 融出來的形狀不是球也不是柱,座標用猜的(或丟 shrinkwrap
       自己找最近點)都試過 —— 不是浮在空中,就是整道 V 跑到背後去。"""
    direction = Vector((0, 1, 0)) if from_front else Vector((0, -1, 0))
    origin = Vector((x, -4.0 if from_front else 4.0, z))
    hit, loc, nor, _ = body.ray_cast(origin, direction)
    return (hit, loc, nor)


def paint(points, r, m, out=0.01, squash=0.45):
    """沿著一串 (x, z) 把小球貼在身體表面上,連起來就是一道花紋。"""
    made = []
    for x, z in points:
        hit, loc, nor = surface(x, z)
        if not hit:
            continue
        o = ball(r, loc + nor * out, m, scale=(1, squash, 1), seg=24, ring=14)
        # 讓小球順著表面躺平,不然側面看會像黏了一排彈珠
        o.rotation_mode = 'QUATERNION'
        o.rotation_quaternion = nor.to_track_quat('Y', 'Z')
        made.append(o)
    return made


def trail(a, b, n):
    """兩點之間取 n 個點"""
    return [(a[0] + (b[0] - a[0]) * i / (n - 1),
             a[1] + (b[1] - a[1]) * i / (n - 1)) for i in range(n)]


# ============================================================ 手腳
for sx in (1, -1):
    ball(0.25, (0.38 * sx, -0.12, 0.10), FUR, scale=(1.0, 1.4, 0.55))   # 腳掌
    ball(0.21, (0.88 * sx, -0.38, 0.78), FUR, scale=(1.0, 1.05, 0.95))  # 手掌
    # 腳底肉球(插畫上是亮藍色的)
    ball(0.075, (0.38 * sx, -0.40, 0.06), PAW, scale=(1, 1, 0.4))
    for dx, dz in ((-0.11, 0.0), (0.0, 0.03), (0.11, 0.0)):
        ball(0.038, (0.38 * sx + dx, -0.46 + dz, 0.07), PAW, scale=(1, 1, 0.4))

# 耳朵內側
for sx in (1, -1):
    ball(0.155, (0.635 * sx, -0.20, 2.23), CREAM, scale=(1, 0.38, 1),
         rot=(0, 0, math.radians(-26 * sx)))


# ============================================================ 臉
def face(x, z, out=0.0):
    """臉上的零件貼在頭這顆球的球面上。out 是往臉的外面推多少。
       y 是負的,所以往外要**減**。"""
    d2 = HR * HR - x * x - (z - HEAD[2]) * (z - HEAD[2])
    return (x, -math.sqrt(max(0.05, d2)) - out, z)


# 口鼻:插畫上是小小一塊在眼睛下面,不是佔掉半張臉
ball(0.235, face(0, 1.43, 0.10), CREAM, scale=(1.15, 0.70, 0.82))
ball(0.088, face(0, 1.50, 0.26), NOSE, scale=(1.3, 0.85, 0.85))

# 嘴巴:張開在笑
ball(0.125, face(0, 1.32, 0.22), MOUTH, scale=(1.05, 0.5, 0.70))
ball(0.072, face(0, 1.295, 0.26), TONGUE, scale=(1.1, 0.45, 0.55))

# 眼睛:大、靠近中間。一層一層往外疊,out 一層比一層大。
for sx in (1, -1):
    ball(0.215, face(0.265 * sx, 1.70, 0.00), EYEW, scale=(0.95, 0.68, 1.15))
    ball(0.158, face(0.275 * sx, 1.69, 0.085), IRIS, scale=(0.95, 0.52, 1.08))
    ball(0.074, face(0.285 * sx, 1.685, 0.145), PUPIL, scale=(0.95, 0.48, 1.0))
    ball(0.052, face(0.225 * sx, 1.775, 0.165), SHINE, scale=(1, 0.45, 1))
    ball(0.025, face(0.345 * sx, 1.625, 0.155), SHINE, scale=(1, 0.45, 1))


# ============================================================ 花紋(吸附在身上)
def stripe(a, b, width, m=CREAM):
    """從 a 點拉一條到 b 點的粗線。吸附之後會變成貼在身上的一道花紋。
       自己算角度 —— 一道 V 要兩端接得起來,用 rotation 慢慢試對不準。"""
    a, b = Vector(a), Vector(b)
    d = b - a
    bpy.ops.mesh.primitive_cylinder_add(radius=width, depth=d.length,
                                        location=(a + b) / 2, vertices=28)
    o = C.object
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = d.to_track_quat('Z', 'Y')
    bpy.ops.object.shade_smooth()
    return put(o, m)


# 胸口的白 V —— 台灣黑熊的招牌
for sx in (1, -1):
    paint(trail((0.0, 0.74), (0.47 * sx, 1.26), 24), 0.088, CREAM, 0.012)

# 眉毛上面那兩撇白
for sx in (1, -1):
    paint(trail((0.20 * sx, 1.94), (0.42 * sx, 2.01), 7), 0.045, CREAM, 0.010)

# 額頭的紋:一道發光的弧(插畫上那個金色記號)
arc = [(math.sin(math.radians(t)) * 0.145, 1.99 - math.cos(math.radians(t)) * 0.075)
       for t in range(-100, 101, 10)]
paint(arc, 0.026, RUNE, 0.010)


# ============================================================ 金色護具
def band(loc, r, minor, rot, m=GOLD):
    bpy.ops.mesh.primitive_torus_add(location=loc, major_radius=r,
                                     minor_radius=minor, rotation=rot,
                                     major_segments=44, minor_segments=16)
    bpy.ops.object.shade_smooth()
    return put(C.object, m)


for sx in (1, -1):
    band((0.805 * sx, -0.30, 0.90), 0.245, 0.052, (math.radians(72), 0, math.radians(-20 * sx)))
    band((0.355 * sx, -0.02, 0.33), 0.345, 0.055, (math.radians(84), 0, 0))
band((0, -0.05, 1.26), 0.42, 0.055, (0, 0, 0))                     # 項圈
ball(0.075, (0, -0.47, 1.26), GLOW, scale=(1, 0.7, 1))             # 項圈的寶石


# ============================================================ 手上的光球
ORB = (0.90, -0.52, 1.12)
ball(0.20, ORB, GLOW)
for i, (rx, rz) in enumerate(((70, 20), (26, -40))):
    bpy.ops.mesh.primitive_torus_add(location=ORB, major_radius=0.30 + i * 0.05,
                                     minor_radius=0.016,
                                     rotation=(math.radians(rx), 0, math.radians(rz)),
                                     major_segments=56, minor_segments=10)
    bpy.ops.object.shade_smooth()
    put(C.object, RUNE)


# ============================================================ 燈光與相機
def light(kind, loc, energy, rot=(0, 0, 0), size=5.0, color=(1, 1, 1)):
    bpy.ops.object.light_add(type=kind, location=loc, rotation=rot)
    o = C.object
    o.data.energy = energy
    o.data.color = color
    if kind == 'AREA':
        o.data.size = size
    return o


# 三點打光。黑色的毛要靠輪廓光才看得出形狀 ——
# 只有正面光的話整隻會糊成一團黑。
light('AREA', (3.0, -3.2, 3.8), 1500, (math.radians(44), 0, math.radians(44)),
      5, (1.0, 0.97, 0.90))                                   # 主光
light('AREA', (-3.4, -2.0, 1.8), 500, (math.radians(76), 0, math.radians(-58)),
      5, (0.70, 0.84, 1.0))                                   # 補光(冷)
light('AREA', (-0.8, 3.2, 3.2), 1900, (math.radians(-48), 0, 0),
      4, (0.80, 0.90, 1.0))                                   # 輪廓光
light('AREA', (1.2, 2.6, 0.6), 500, (math.radians(-100), 0, math.radians(26)),
      3, (0.9, 0.95, 1.0))                                    # 下緣輪廓

ANGLE = {'front': 0, 'three': 34, 'side': 86, 'back': 170}[VIEW]
dist, height = 6.6, 1.30
a = math.radians(ANGLE)
bpy.ops.object.empty_add(location=(0, 0, 1.22))
target = C.object
bpy.ops.object.camera_add(
    location=(math.sin(a) * dist, -math.cos(a) * dist, height))
cam = C.object
tt = cam.constraints.new('TRACK_TO')
tt.target = target
tt.track_axis = 'TRACK_NEGATIVE_Z'
tt.up_axis = 'UP_Y'
cam.data.lens = 52

sc = C.scene
sc.camera = cam
sc.render.engine = 'CYCLES'
sc.cycles.samples = SAMPLES
sc.cycles.use_denoising = True
sc.render.resolution_x = sc.render.resolution_y = RES
sc.render.film_transparent = True
sc.render.filepath = OUT
bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'bear.blend'))
print('OK ->', OUT)
