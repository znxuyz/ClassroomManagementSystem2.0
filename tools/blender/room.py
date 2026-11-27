"""守護獸的房間 —— 可以轉的 2.5D 場景 + 可以擺的家具

做法:**不是即時 3D**。相機繞著房間走一圈,每隔幾度算一張圖;
網頁上拖曳就換圖,看起來像在轉,實際上只是在翻圖片。

為什麼這樣做而不用 three.js:
  · 畫質是 Cycles 的全域光 —— 地板的反光、窗戶灑進來的光、家具的落影,
    這些即時渲染做不出來,但算成圖片就有了
  · 載入的是幾張圖,教室的筆電和學生的手機都跑得動
  · 這個專案到現在沒有 build step、沒有大型相依,不想為了轉鏡頭破例

── 兩種輸出 ──
  shell  空房間(地板、兩面牆、窗)。十三個角度。
  items  每一件家具單獨算,透明背景、影子烘進去。
         家具在**原點**算,網頁再把它搬到學生擺的位置 ——
         所以同一張圖可以擺在房間任何地方。

── 數學在這裡,不在網頁 ──
家具要能自由擺放,網頁就得知道「畫面上這一點是地板的哪裡」。
地板是一個平面(z=0),相機投影一個平面是一個 3×3 的單應矩陣,
可以直接從相機矩陣取出來(不是擬合的,是精確的):

    M = 投影矩陣 @ 視圖矩陣               (4×4)
    H = M 的第 0、1、3 列與第 0、1、3 行   (3×3)
    (clipX, clipY, clipW) = H @ (x, y, 1)

網頁拿 H 把地板座標變成畫面座標,拿 H 的反矩陣把拖曳的位置變回地板座標。
少了它,家具只能擺在我事先決定的幾個洞裡。

用法:
    python3.13 -I room.py shell [寬] [取樣] [張數]
    python3.13 -I room.py items [寬] [取樣] [張數]
輸出到 ../../assets/room/
"""
import bpy, math, json, os, sys
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, '..', '..', 'assets', 'room'))
ITEMS_OUT = os.path.join(OUT, 'items')
SHELLS_OUT = os.path.join(OUT, 'shells')
os.makedirs(OUT, exist_ok=True)
os.makedirs(ITEMS_OUT, exist_ok=True)
os.makedirs(SHELLS_OUT, exist_ok=True)

MODE = sys.argv[1] if len(sys.argv) > 1 else 'shell'
W = int(sys.argv[2]) if len(sys.argv) > 2 else 960
SAMPLES = int(sys.argv[3]) if len(sys.argv) > 3 else 110
FRAMES = int(sys.argv[4]) if len(sys.argv) > 4 else 8

H_PX = int(W * 0.72)
# 相機掃過的角度範圍。**不是對稱的**:牆在後面(+Y)和左邊(-X),
# 所以往左轉過頭會看到左牆的外側把整個房間擋住(第一版是 ±44,
# 前五格全毀)。往右轉到 44 度都還好,往左只能到 -7 度。
ARC_FROM, ARC_TO = -7.33, 44.0
R = 5.0             # 房間邊長
WALL_H = 3.2
WIN = (1.9, 1.5, 1.95)      # 窗的寬、高、中心離地
DIST, HEIGHT = 10.2, 4.2

bpy.ops.wm.read_factory_settings(use_empty=True)
D, C = bpy.data, bpy.context


# ============================================================ 材質
def mat(name, color, rough=0.6, metal=0.0, emit=None, strength=1.0):
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


WOOD    = mat('wood',   (0.50, 0.32, 0.17), 0.52)
WOOD_D  = mat('wood_d', (0.40, 0.25, 0.13), 0.58)
WALL    = mat('wall',   (0.93, 0.88, 0.77), 0.92)
TRIM    = mat('trim',   (0.52, 0.36, 0.22), 0.5)
RUG     = mat('rug',    (0.35, 0.55, 0.42), 0.95)
RUG2    = mat('rug2',   (0.78, 0.74, 0.60), 0.95)
CUSH    = mat('cush',   (0.78, 0.45, 0.38), 0.9)
CUSH2   = mat('cush2',  (0.92, 0.82, 0.70), 0.92)
BOWL    = mat('bowl',   (0.86, 0.86, 0.88), 0.35)
BOWL_IN = mat('bowlin', (0.55, 0.38, 0.24), 0.7)
LEAF    = mat('leaf',   (0.25, 0.48, 0.26), 0.7)
POT     = mat('pot',    (0.68, 0.42, 0.32), 0.65)
SKY     = mat('sky',    (0.80, 0.90, 1.0), 0.5, emit=(0.86, 0.93, 1.0), strength=2.6)
BALL_A  = mat('ball_a', (0.86, 0.32, 0.30), 0.35)
BALL_B  = mat('ball_b', (0.96, 0.93, 0.86), 0.35)
LAMP_SH = mat('lampsh', (0.96, 0.88, 0.70), 0.6, emit=(1.0, 0.90, 0.68), strength=3.2)
METAL   = mat('metal',  (0.70, 0.70, 0.74), 0.3, metal=0.85)
BOOK_A  = mat('book_a', (0.70, 0.30, 0.28), 0.8)
BOOK_B  = mat('book_b', (0.28, 0.45, 0.62), 0.8)
BOOK_C  = mat('book_c', (0.85, 0.70, 0.35), 0.8)
WATER   = mat('water',  (0.45, 0.72, 0.88), 0.15)


def put(o, m):
    o.data.materials.clear()
    o.data.materials.append(m)
    return o


def box(size, loc, m, rot=(0, 0, 0)):
    """size 是**實際邊長**。primitive_cube_add(size=1) 做出來的邊長就是 1,
       所以縮放幾倍就是幾長 —— 除以 2 的話整間房子會縮一半(踩過)。"""
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = C.object
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    return put(o, m)


def cyl(r, h, loc, m, rot=(0, 0, 0), verts=40):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, location=loc,
                                        rotation=rot, vertices=verts)
    bpy.ops.object.shade_smooth()
    return put(C.object, m)


def ball(r, loc, m, scale=(1, 1, 1), sub=3):
    bpy.ops.mesh.primitive_ico_sphere_add(radius=r, subdivisions=sub, location=loc)
    o = C.object
    o.scale = scale
    bpy.ops.object.shade_smooth()
    return put(o, m)


def cone(r1, r2, h, loc, m, verts=36):
    bpy.ops.mesh.primitive_cone_add(radius1=r1, radius2=r2, depth=h,
                                    location=loc, vertices=verts)
    bpy.ops.object.shade_smooth()
    return put(C.object, m)


# ============================================================ 房間風格
# 同一間房,換牆色、地板色與窗外的光。相機完全沒動 ——
# 所以那張投影矩陣、家具擺的位置、守護獸站的地方全部照舊,
# 風格只是換一疊背景圖而已。
#
# 光刻意**不要差太多**:家具的圖只算一次(算五套要兩個小時),
# 所以每一種風格的主光方向與強度都一樣,差別在顏色。
# 剩下的色溫差用網頁的 tint 補 —— 家具和守護獸會套同一個濾鏡,
# 這樣夜晚的房間裡不會擺著一件中午的飯碗。
STYLES = [
    {'id': 'wood', 'name': '原木', 'desc': '溫暖的木地板,午後的陽光',
     'price': 0, 'star': 0, 'free': True, 'tint': '',
     'floor': ((0.50, 0.32, 0.17), (0.40, 0.25, 0.13)),
     'wall': (0.93, 0.88, 0.77), 'trim': (0.52, 0.36, 0.22),
     'sun': (1.0, 0.92, 0.76), 'sky': (0.86, 0.93, 1.0), 'back': (0.30, 0.34, 0.42)},

    {'id': 'forest', 'name': '森林小屋', 'desc': '綠色的牆,窗外是一片樹林',
     'price': 60, 'star': 20, 'tint': 'saturate(1.08) hue-rotate(-8deg)',
     'floor': ((0.30, 0.19, 0.09), (0.22, 0.14, 0.07)),
     'wall': (0.30, 0.46, 0.26), 'trim': (0.20, 0.15, 0.08),
     'sun': (0.88, 1.0, 0.55), 'sky': (0.46, 0.86, 0.38), 'back': (0.13, 0.22, 0.15)},

    {'id': 'sakura', 'name': '櫻花和室', 'desc': '榻榻米配紙窗,窗外開著櫻花',
     'price': 70, 'star': 23, 'tint': 'saturate(1.06) hue-rotate(6deg)',
     'floor': ((0.62, 0.60, 0.26), (0.54, 0.53, 0.22)),
     'wall': (0.96, 0.84, 0.80), 'trim': (0.30, 0.16, 0.12),
     'sun': (1.0, 0.76, 0.74), 'sky': (1.0, 0.62, 0.74), 'back': (0.30, 0.18, 0.24)},

    {'id': 'ocean', 'name': '海邊', 'desc': '淺藍色的牆,窗外是海',
     'price': 70, 'star': 23, 'tint': 'saturate(1.04) hue-rotate(-14deg)',
     'floor': ((0.82, 0.78, 0.66), (0.74, 0.70, 0.58)),
     'wall': (0.38, 0.72, 0.86), 'trim': (0.92, 0.92, 0.90),
     'sun': (0.92, 0.98, 1.0), 'sky': (0.26, 0.70, 1.0), 'back': (0.14, 0.28, 0.40)},

    {'id': 'night', 'name': '星空夜晚', 'desc': '深色的牆,窗外是整片星空',
     'price': 90, 'star': 30,
     # 夜晚是唯一把光整個調暗的 —— 家具只算過白天那一套,
     # 所以濾鏡也要跟著壓暗,不然會變成「暗房間裡擺著中午的飯碗」
     'tint': 'brightness(.62) saturate(.85) hue-rotate(-16deg)',
     'lights': 0.30,
     'floor': ((0.22, 0.15, 0.09), (0.16, 0.11, 0.07)),
     'wall': (0.16, 0.19, 0.34), 'trim': (0.12, 0.10, 0.14),
     'sun': (0.44, 0.58, 1.0), 'sky': (0.10, 0.26, 0.72), 'back': (0.04, 0.05, 0.11)},
]


def apply_style(st):
    """把這一種風格的顏色套到既有的材質上。
       重建整間房太慢也沒必要 —— 形狀完全一樣,只有顏色不同。"""
    def setc(m, rgb, emit=None, strength=None):
        b = m.node_tree.nodes['Principled BSDF']
        b.inputs['Base Color'].default_value = (*rgb, 1)
        if emit:
            b.inputs['Emission Color'].default_value = (*emit, 1)
        if strength is not None:
            b.inputs['Emission Strength'].default_value = strength

    setc(WOOD, st['floor'][0])
    setc(WOOD_D, st['floor'][1])
    setc(WALL, st['wall'])
    setc(TRIM, st['trim'])
    setc(SKY, st['sky'], emit=st['sky'],
         strength=5.0 if st['id'] == 'night' else 2.6)
    sun.data.color = st['sun']
    world.node_tree.nodes['Background'].inputs[0].default_value = (*st['back'], 1)

    # 整體亮度。只有夜晚會動它 —— 其餘風格的光保持一致,
    # 家具才不必一種風格算一套(算五套要兩個小時)。
    k = st.get('lights', 1.0)
    for o, base in LIGHT_BASE:
        o.data.energy = base * k


# ============================================================ 空房間
floor_parts = []
for i in range(14):
    y = -R / 2 + R * (i + 0.5) / 14
    floor_parts.append(box((R, R / 14 * 0.94, 0.12), (0, y, -0.06),
                           WOOD if i % 2 == 0 else WOOD_D))

wall_back = box((R, 0.16, WALL_H), (0, R / 2, WALL_H / 2), WALL)
wall_left = box((0.16, R, WALL_H), (-R / 2, 0, WALL_H / 2), WALL)
trim1 = box((R, 0.22, 0.22), (0, R / 2 - 0.04, 0.11), TRIM)
trim2 = box((0.22, R, 0.22), (-R / 2 + 0.04, 0, 0.11), TRIM)

# 窗:在後牆挖一個洞
bpy.ops.mesh.primitive_cube_add(size=1, location=(0.55, R / 2, WIN[2]))
hole = C.object
hole.scale = (WIN[0], 1.0, WIN[1])
bpy.ops.object.transform_apply(scale=True)
bm = wall_back.modifiers.new('win', 'BOOLEAN')
bm.object = hole
bm.operation = 'DIFFERENCE'
hole.hide_render = hole.hide_viewport = True

# 窗口**不要**擺玻璃:不管材質怎麼調,它都是一面不透光的牆,太陽會被擋住,
# 地板上就不會有那一塊光(整間因此沒有方向感)。改成窗外放一塊會發光的板子。
sky = box((2.9, 0.06, 2.3), (0.55, R / 2 + 0.40, WIN[2]), SKY)
# 板子擋在太陽和窗口中間,所以要讓光線穿過去。不關掉的話太陽整個被擋住。
sky.visible_shadow = False

# 窗框。上下兩根通到底、左右兩根縮短塞中間 —— 四根都通到底的話,
# 四個角會有兩塊木頭重疊,算出來是四個黑方塊。
frame = []
for dx, dz, sx, sz in ((0, WIN[1] / 2, WIN[0] + 0.20, 0.12),
                       (0, -WIN[1] / 2, WIN[0] + 0.20, 0.12),
                       (WIN[0] / 2, 0, 0.12, WIN[1] - 0.12),
                       (-WIN[0] / 2, 0, 0.12, WIN[1] - 0.12),
                       (0, 0, 0.07, WIN[1] - 0.12)):
    frame.append(box((sx, 0.14, sz), (0.55 + dx, R / 2 - 0.08, WIN[2] + dz), TRIM))

SHELL = floor_parts + [wall_back, wall_left, trim1, trim2, sky] + frame


# ============================================================ 家具
# 每一件都蓋在**原點**、面向前方。網頁再把它搬到學生擺的位置 ——
# 所以同一張圖可以擺在房間裡任何地方,不必一個位置算一次。
def it_bed():
    return [box((1.5, 1.0, 0.22), (0, 0, 0.11), CUSH),
            box((1.3, 0.8, 0.14), (0, 0, 0.26), CUSH2)]


def it_bowl():
    return [cyl(0.34, 0.16, (0, 0, 0.08), BOWL),
            cyl(0.27, 0.05, (0, 0, 0.15), BOWL_IN)]


def it_water():
    return [cyl(0.30, 0.18, (0, 0, 0.09), BOWL),
            cyl(0.24, 0.05, (0, 0, 0.165), WATER)]


def it_plant():
    out = [cone(0.26, 0.33, 0.44, (0, 0, 0.22), POT)]
    for dx, dy, dz, r in ((0, 0, 0.72, 0.36), (0.22, 0.1, 0.52, 0.26),
                          (-0.2, -0.12, 0.58, 0.24)):
        out.append(ball(r, (dx, dy, dz), LEAF))
    return out


def it_toybox():
    return [box((1.1, 0.8, 0.62), (0, 0, 0.31), TRIM),
            box((1.16, 0.86, 0.08), (0, 0, 0.66), WOOD_D)]


def it_rug():
    return [cyl(1.35, 0.03, (0, 0, 0.015), RUG, verts=64),
            cyl(1.05, 0.035, (0, 0, 0.02), RUG2, verts=64)]


def it_ball():
    out = [ball(0.28, (0, 0, 0.28), BALL_A, sub=4)]
    # 一圈白色的條紋,讓它看得出來是皮球不是一顆石頭
    for i in range(3):
        a = math.radians(i * 60)
        bpy.ops.mesh.primitive_torus_add(location=(0, 0, 0.28),
                                         major_radius=0.281, minor_radius=0.035,
                                         rotation=(math.radians(90), 0, a),
                                         major_segments=44, minor_segments=10)
        bpy.ops.object.shade_smooth()
        out.append(put(C.object, BALL_B))
    return out


def it_lamp():
    return [cyl(0.26, 0.05, (0, 0, 0.025), METAL),
            cyl(0.035, 1.3, (0, 0, 0.65), METAL, verts=16),
            cone(0.30, 0.18, 0.40, (0, 0, 1.45), LAMP_SH)]


def it_shelf():
    out = [box((1.0, 0.32, 0.06), (0, 0, 0.03), TRIM),
           box((1.0, 0.32, 0.06), (0, 0, 0.52), TRIM),
           box((1.0, 0.32, 0.06), (0, 0, 1.01), TRIM),
           box((0.06, 0.32, 1.04), (-0.47, 0, 0.52), TRIM),
           box((0.06, 0.32, 1.04), (0.47, 0, 0.52), TRIM)]
    books = [BOOK_A, BOOK_B, BOOK_C]
    for row, z in ((0, 0.26), (1, 0.75)):
        for i in range(5):
            out.append(box((0.11, 0.24, 0.36 + 0.04 * ((i + row) % 3)),
                           (-0.34 + i * 0.17, 0, z + 0.02),
                           books[(i + row) % 3]))
    return out


ITEMS = [
    {'id': 'rug',    'name': '地毯',   'build': it_rug,
     'desc': '守護獸最愛待的地方',           'price': 30,  'star': 10,
     # 平貼在地上的東西永遠畫在最下面 —— 照距離排的話,地毯拖到
     # 守護獸前面就會蓋住牠的腳,看起來像牠陷進地毯裡
     'flat': True},
    {'id': 'bowl',   'name': '飯碗',   'build': it_bowl,
     'desc': '吃飯的地方',                   'price': 20,  'star': 7},
    {'id': 'water',  'name': '水盆',   'build': it_water,
     'desc': '喝水的地方',                   'price': 20,  'star': 7},
    {'id': 'bed',    'name': '睡墊',   'build': it_bed,
     'desc': '軟軟的,睡起來很舒服',          'price': 45,  'star': 15},
    {'id': 'ball',   'name': '皮球',   'build': it_ball,
     'desc': '可以滾來滾去',                 'price': 25,  'star': 8},
    {'id': 'plant',  'name': '盆栽',   'build': it_plant,
     'desc': '一點綠色,房間比較有生氣',      'price': 35,  'star': 12},
    {'id': 'toybox', 'name': '玩具箱', 'build': it_toybox,
     'desc': '玩具收在這裡',                 'price': 50,  'star': 17},
    {'id': 'lamp',   'name': '立燈',   'build': it_lamp,
     'desc': '晚上也亮亮的',                 'price': 55,  'star': 18},
    {'id': 'shelf',  'name': '書櫃',   'build': it_shelf,
     'desc': '放書的地方,看起來很有學問',    'price': 70,  'star': 23},
]


# ============================================================ 光
def light(kind, loc, energy, rot=(0, 0, 0), size=3.0, color=(1, 1, 1)):
    bpy.ops.object.light_add(type=kind, location=loc, rotation=rot)
    o = C.object
    o.data.energy = energy
    o.data.color = color
    if kind == 'AREA':
        o.data.size = size
    return o


sun = light('SUN', (0.55, R / 2 + 1.0, WIN[2] + 1.0), 7.0,
            (math.radians(42), 0, math.radians(190)), color=(1.0, 0.92, 0.76))
sun.data.angle = math.radians(3.5)
# 補光不要太亮 —— 一強就把太陽那一塊光洗掉了,
# 有光斑和沒光斑,差在「這間房有沒有窗」。
light('AREA', (0.55, R / 2 + 0.4, WIN[2]), 220,
      (math.radians(90), 0, math.radians(180)), 2.2, (0.95, 0.96, 1.0))
light('AREA', (1.2, -2.0, 3.0), 170, (math.radians(34), 0, math.radians(18)),
      4, (0.9, 0.94, 1.0))
light('AREA', (-2.4, -1.4, 2.6), 80, (math.radians(50), 0, math.radians(-42)),
      4, (0.86, 0.90, 1.0))

# 每一盞燈原本的強度。換風格時用倍率去乘,不要直接改掉 ——
# 連換兩種風格的話,乘過的值會被當成原本的值再乘一次。
LIGHT_BASE = [(o, o.data.energy) for o in C.scene.objects if o.type == 'LIGHT']

world = D.worlds.new('w')
C.scene.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (0.30, 0.34, 0.42, 1)
world.node_tree.nodes['Background'].inputs[1].default_value = 0.16

# ============================================================ 相機
sc = C.scene
sc.render.engine = 'CYCLES'
sc.cycles.samples = SAMPLES
sc.cycles.use_denoising = True
sc.render.resolution_x = W
sc.render.resolution_y = H_PX
sc.render.image_settings.file_format = 'WEBP'
sc.render.image_settings.quality = 82
sc.render.image_settings.color_mode = 'RGBA'
sc.view_settings.look = 'AgX - Base Contrast'

bpy.ops.object.empty_add(location=(0, 0, 1.25))
target = C.object
bpy.ops.object.camera_add(location=(0, -DIST, HEIGHT))
cam = C.object
cam.data.lens = 46
tt = cam.constraints.new('TRACK_TO')
tt.target = target
tt.track_axis = 'TRACK_NEGATIVE_Z'
tt.up_axis = 'UP_Y'
sc.camera = cam


def angle_of(i):
    t = 0.5 if FRAMES == 1 else i / (FRAMES - 1)
    return math.radians(ARC_FROM + (ARC_TO - ARC_FROM) * t)


def aim(i):
    a = angle_of(i)
    cam.location = (math.sin(a) * DIST, -math.cos(a) * DIST, HEIGHT)
    C.view_layer.update()
    return a


def floor_matrix():
    """地板平面(z=0)投影到畫面的 3×3 單應矩陣。

       取法是從相機矩陣直接拿,不是用幾個點去擬合 —— 這樣是精確的。
       z=0 代表第 2 行用不到,所以留下第 0、1、3 行與第 0、1、3 列。
       網頁拿它算「地板座標 → 畫面」,拿它的反矩陣算「拖到哪 → 地板哪裡」。"""
    dg = C.evaluated_depsgraph_get()
    P = cam.calc_matrix_camera(dg, x=W, y=H_PX)
    M = P @ cam.matrix_world.inverted()
    rows = (0, 1, 3)
    return [[round(M[r][c], 6) for c in (0, 1, 3)] for r in rows]


def unit_at(p):
    """地面上 p 這一點,一個單位高投影出來佔畫面高的幾成。
       站得越後面這個數字越小 —— 拿它當縮放,透視就是對的。"""
    from bpy_extras.object_utils import world_to_camera_view
    a = world_to_camera_view(sc, cam, Vector((p[0], p[1], 0)))
    b = world_to_camera_view(sc, cam, Vector((p[0], p[1], 1)))
    return abs(a.y - b.y)


def shot(path):
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


def show_only(keep):
    """只留下要算的那幾個物件,其餘完全移出這一次算圖。

       算家具的時候牆要**整個拿掉**,不能只是「不被相機看到」。
       地板設成只收影子(shadow catcher),而 shadow catcher 算的是
       「這裡比沒有遮蔽的時候暗多少」—— 牆只要還在,它擋掉的環境光
       會讓**整片地板**都被判定成陰影,算出來是一塊不透明的黑板子(踩過)。"""
    for o in C.scene.objects:
        if o.type != 'MESH':
            continue
        o.hide_render = (o not in keep)


# ============================================================ 算圖
if MODE == 'shell':
    sc.render.film_transparent = False

    # 相機每一格的資料只算一次 —— 所有風格共用同一組角度,
    # 所以投影矩陣、縮放基準也完全一樣。家具和守護獸的位置因此不必跟著風格變。
    frames = []
    for i in range(FRAMES):
        aim(i)
        frames.append({
            'angle': round(math.degrees(angle_of(i)), 2),
            'H': floor_matrix(),
            'cam': [round(v, 4) for v in cam.location],
            'unit0': round(unit_at((0, 0)), 6)
        })

    only = sys.argv[5] if len(sys.argv) > 5 else None
    for st in STYLES:
        if only and st['id'] != only:
            continue
        apply_style(st)
        sub = os.path.join(SHELLS_OUT, st['id'])
        os.makedirs(sub, exist_ok=True)
        for i in range(FRAMES):
            aim(i)
            shot(os.path.join(sub, '%02d.webp' % i))
        print('style %s' % st['id'])

    meta = {'width': W, 'height': H_PX,
            'arcFrom': ARC_FROM, 'arcTo': ARC_TO, 'room': R,
            'frames': frames,
            'note': '由 tools/blender/room.py 產生,不要手改'}
    with open(os.path.join(OUT, 'room.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    # 老師是雙擊 index.html 打開系統的,file:// 下 fetch 讀本機 JSON
    # 會被瀏覽器擋掉 —— 所以同一份資料再寫成一支 .js
    with open(os.path.join(OUT, 'room-data.js'), 'w', encoding='utf-8') as f:
        f.write('/* 由 tools/blender/room.py 產生,不要手改 */\nwindow.PET_ROOM = ')
        json.dump(meta, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';\n')
    with open(os.path.join(OUT, 'shells-data.js'), 'w', encoding='utf-8') as f:
        f.write('/* 由 tools/blender/room.py 產生,不要手改 */\n'
                'window.PET_ROOM_STYLES = ')
        json.dump([{k: st[k] for k in ('id', 'name', 'desc', 'price', 'star', 'tint')
                    if k in st} | ({'free': True} if st.get('free') else {})
                   for st in STYLES], f, ensure_ascii=False, separators=(',', ':'))
        f.write(';\n')
    print('OK shell ->', SHELLS_OUT)

elif MODE == 'items':
    apply_style(STYLES[0])
    # 家具用透明背景算,影子烘進去 —— 地板設成「只收影子」,
    # 這樣沙發底下那一圈暗暗的會跟著圖走,擺到哪裡都像真的放在地上。
    sc.render.film_transparent = True
    for o in floor_parts:
        o.is_shadow_catcher = True
    # 牆拿掉之後少了反彈光,世界光補一點回來
    world.node_tree.nodes['Background'].inputs[1].default_value = 0.30

    manifest = []
    for item in ITEMS:
        objs = item['build']()
        show_only(set(objs) | set(floor_parts))
        sub = os.path.join(ITEMS_OUT, item['id'])
        os.makedirs(sub, exist_ok=True)
        for i in range(FRAMES):
            aim(i)
            shot(os.path.join(sub, '%02d.webp' % i))
        row = {k: item[k] for k in ('id', 'name', 'desc', 'price', 'star')}
        if item.get('flat'):
            row['flat'] = True
        manifest.append(row)
        print('item %s' % item['id'])
        for o in objs:
            D.objects.remove(o, do_unlink=True)

    with open(os.path.join(OUT, 'items-data.js'), 'w', encoding='utf-8') as f:
        f.write('/* 由 tools/blender/room.py 產生,不要手改 */\nwindow.PET_ROOM_ITEMS = ')
        json.dump(manifest, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';\n')
    print('OK items ->', ITEMS_OUT)

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'room.blend'))
