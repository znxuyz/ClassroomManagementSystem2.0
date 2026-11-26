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
YS = 0.80          # 身體往前後壓多少

# 肩 → 腕。右手舉起來捧球,左手自然垂下。
SH_R, WR_R, HAND_R = (0.50, -0.12, 1.16), (1.00, -0.46, 1.58), (1.13, -0.52, 1.71)
SH_L, WR_L, HAND_L = (-0.50, -0.10, 1.14), (-0.97, -0.28, 0.62), (-1.06, -0.32, 0.47)
HIP_R, ANK_R = (0.30, 0.02, 0.46), (0.42, -0.04, 0.15)
HIP_L, ANK_L = (-0.30, 0.02, 0.46), (-0.42, -0.04, 0.15)

# 身體和頭是**兩團分開的** metaball,最後才併成一個物件。
# 全部堆在一起讓 metaball 自己融的話,脖子會被填平 ——
# 從側面看就是從頭到屁股一整顆梨,看不出哪裡是頭(試過)。
# 分開做、讓它們稍微重疊,側面才有脖子那一道轉折。
TORSO = [
    ((0.00, 0.00, 0.66), 0.53, 2.0),     # 肚子
    ((0.00, -0.02, 1.04), 0.455, 2.0),   # 胸
    ((0.00, -0.03, 1.26), 0.30, 2.0),    # 脖子根部
]
SKULL = [
    (HEAD, HR, 2.0),                     # 頭
    ((0.00, 0.09, 1.76), 0.36, 2.0),     # 後腦勺,讓頭不要只是一顆球
    ((0.00, -0.02, 1.38), 0.30, 1.6),    # 下巴到脖子
]
# 手腳與耳朵**都不放進 metaball**。metaball 的場是相加的:
# 一顆半徑 0.5 的胸加一顆半徑 0.2 的手臂,結果只是胸變胖一點 ——
# 試過三次,畫出來永遠是「沒有手臂,旁邊浮著一顆球」。
# 改用實體的錐柱與壓扁的球接上去,顏色一樣看不出接縫。


def blobs(name, items):
    mb = D.metaballs.new(name)
    mb.resolution = 0.028
    mb.render_resolution = 0.020
    o = D.objects.new(name, mb)
    C.collection.objects.link(o)
    for loc, r, stiff in items:
        el = mb.elements.new()
        el.co = Vector(loc)
        el.stiffness = stiff
        el.radius = r / 0.575
    C.view_layer.objects.active = o
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.ops.object.convert(target='MESH')
    o = C.object
    # 前後壓扁。不壓的話每一團都是正圓,側面看又深又鈍。
    # 臉上的零件也要跟著壓(見 face()),不然會浮在臉前面。
    o.scale = (1, YS, 1)
    bpy.ops.object.transform_apply(scale=True)
    bpy.ops.object.shade_smooth()
    return o


torso = blobs('torso', TORSO)
skull = blobs('skull', SKULL)
bpy.ops.object.select_all(action='DESELECT')
torso.select_set(True)
skull.select_set(True)
C.view_layer.objects.active = torso
bpy.ops.object.join()
body = C.object
body.name = 'body'
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


def fill(inside, x0, x1, z0, z1, step, r, m, out=0.01):
    """在一塊範圍裡每隔 step 取一點,形狀函式說要的就貼一顆小球。
       月牙、星星這種有面積的記號用這個畫 —— 用一條線描邊的話,
       遠看只會是一條細線,看不出是什麼。"""
    pts = []
    z = z0
    while z <= z1:
        x = x0
        while x <= x1:
            if inside(x, z):
                pts.append((x, z))
            x += step
        z += step
    return paint(pts, r, m, out)


def trail(a, b, n):
    """兩點之間取 n 個點"""
    return [(a[0] + (b[0] - a[0]) * i / (n - 1),
             a[1] + (b[1] - a[1]) * i / (n - 1)) for i in range(n)]


# ============================================================ 手腳
def limb(a, b, r1, r2, m=FUR):
    """從 a 到 b 的一段肢體:一根會變細的錐柱,兩端各補一顆球。
       兩端補球是為了讓關節圓起來,而且和身體重疊的那一端看不出切口 ——
       顏色一樣,重疊就等於接好了。"""
    a, b = Vector(a), Vector(b)
    d = b - a
    bpy.ops.mesh.primitive_cone_add(radius1=r1, radius2=r2, depth=d.length,
                                    location=a + d / 2, vertices=32)
    o = C.object
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = d.to_track_quat('Z', 'Y')
    bpy.ops.object.shade_smooth()
    put(o, m)
    ball(r1, a, m, seg=28, ring=18)
    ball(r2, b, m, seg=28, ring=18)
    return o


limb(SH_R, WR_R, 0.235, 0.165)
limb(SH_L, WR_L, 0.235, 0.165)
limb(HIP_R, ANK_R, 0.285, 0.215)
limb(HIP_L, ANK_L, 0.285, 0.215)

for sx in (1, -1):
    ball(0.225, (0.42 * sx, -0.14, 0.10), FUR, scale=(1.0, 1.40, 0.62))  # 腳掌
    ball(0.175, HAND_R if sx > 0 else HAND_L, FUR, scale=(1, 1.05, 0.95))  # 手掌
    # 腳底肉球(插畫上是亮藍色的)
    ball(0.075, (0.44 * sx, -0.42, 0.06), PAW, scale=(1, 1, 0.4))
    for dx, dz in ((-0.11, 0.0), (0.0, 0.03), (0.11, 0.0)):
        ball(0.038, (0.44 * sx + dx, -0.48 + dz, 0.07), PAW, scale=(1, 1, 0.4))

# 耳朵:壓扁的圓耳,接在頭的斜上方。黑熊的耳朵又大又圓,是辨識度最高的一處。
for sx in (1, -1):
    ball(0.295, (0.545 * sx, 0.03, 2.30), FUR, scale=(1, 0.42, 1),
         rot=(0, math.radians(-16 * sx), 0))
    ball(0.180, (0.560 * sx, -0.075, 2.31), CREAM, scale=(1, 0.30, 1),
         rot=(0, math.radians(-16 * sx), 0))


# ============================================================ 臉
def face(x, z, out=0.0):
    """臉上的零件貼在頭這顆球的球面上。out 是往臉的外面推多少。
       y 是負的,所以往外要**減**。"""
    d2 = HR * HR - x * x - (z - HEAD[2]) * (z - HEAD[2])
    return (x, -math.sqrt(max(0.05, d2)) * YS - out, z)


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
    paint(trail((0.0, 0.72), (0.345 * sx, 1.14), 20), 0.078, CREAM, 0.012)

# 眉毛上面那兩撇白
for sx in (1, -1):
    paint(trail((0.235 * sx, 1.915), (0.435 * sx, 1.975), 7), 0.042, CREAM, 0.010)

# 額頭的記號:月牙。
# 台灣黑熊的英文名字就是 Formosan moon bear,胸口那道 V 本來就被叫做月牙 ——
# 守護神獸階段的記號用月牙,比隨便一個發光符號有來由。
# 做法是大圓減掉偏一點的小圓,再填滿;描邊的話遠看只是一條細線。
MOON_C, MOON_R, MOON_Z = 0.0, 0.145, 2.14


def moon(x, z):
    d1 = math.hypot(x - MOON_C, z - MOON_Z)
    d2 = math.hypot(x - MOON_C - 0.085, z - MOON_Z + 0.012)
    return d1 <= MOON_R and d2 > MOON_R * 0.92


fill(moon, -0.20, 0.20, MOON_Z - 0.20, MOON_Z + 0.20, 0.020, 0.024, RUNE, 0.010)


# ============================================================ 金色護具
def band(loc, r, minor, rot, m=GOLD):
    bpy.ops.mesh.primitive_torus_add(location=loc, major_radius=r,
                                     minor_radius=minor, rotation=rot,
                                     major_segments=44, minor_segments=16)
    bpy.ops.object.shade_smooth()
    return put(C.object, m)


def cuff(a, b, t, r, minor, m=GOLD):
    """把一個環套在 a→b 這一段肢體上(t = 從 a 走到 b 的幾成)。
       環的洞本來朝 Z,所以讓 Z 轉去對齊肢體的方向就套得準 ——
       自己填角度的話,手臂是斜的,環會變成立在旁邊的呼拉圈(踩過)。"""
    a, b = Vector(a), Vector(b)
    d = b - a
    bpy.ops.mesh.primitive_torus_add(location=a + d * t, major_radius=r,
                                     minor_radius=minor,
                                     major_segments=44, minor_segments=16)
    o = C.object
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = d.to_track_quat('Z', 'Y')
    bpy.ops.object.shade_smooth()
    return put(o, m)


for sx in (1, -1):
    # 前臂:從肩膀到手掌,護腕套在靠手掌那一端
    cuff(SH_R if sx > 0 else SH_L, HAND_R if sx > 0 else HAND_L,
         0.74, 0.185, 0.040)
    # 腿:從大腿到腳掌,是直的,所以環要是平的
    cuff(HIP_R if sx > 0 else HIP_L, ANK_R if sx > 0 else ANK_L, 0.62, 0.245, 0.044)
# 項圈本來是一圈 torus,但脖子那一段被頭和胸夾住、根本看不到一圈 ——
# 半徑放大到露得出來就變成在脖子外面漂的呼拉圈。改成一顆貼在胸前的寶石:
# 同樣是「守護神獸才有的裝備」,而且一眼看得到。
hit, loc, nor = surface(0, 1.36)
if hit:
    ball(0.085, loc + nor * 0.02, GOLD, scale=(1, 0.55, 1))
    ball(0.055, loc + nor * 0.055, GLOW, scale=(1, 0.6, 1))


# ============================================================ 手上的光球
ORB = (1.22, -0.58, 1.86)
ball(0.185, ORB, GLOW)
for i, (rx, rz) in enumerate(((70, 20), (26, -40))):
    bpy.ops.mesh.primitive_torus_add(location=ORB, major_radius=0.275 + i * 0.045,
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
