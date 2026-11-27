"""守護獸的房間 —— 可以轉的 2.5D 場景

做法:**不是即時 3D**。相機繞著房間走一圈,每隔幾度算一張圖;
網頁上拖曳就換圖,看起來像在轉,實際上只是在翻圖片。

為什麼這樣做而不用 three.js:
  · 畫質是 Cycles 的全域光 —— 地板的反光、窗戶灑進來的光、家具的落影,
    這些即時渲染做不出來,但算成圖片就有了
  · 載入的是幾張圖,教室的筆電和學生的手機都跑得動;
    three.js 要拉一個大型函式庫 + 模型 + 貼圖,而且舊平板會卡
  · 這個專案到現在沒有 build step、沒有大型相依,不想為了轉鏡頭破例

難的地方是**寵物要站在地板上**。寵物是一張 2D 圖,房間轉的時候它得跟著
站到對的位置、縮成對的大小 —— 所以這支腳本除了算圖,還會把每一個站位
在每一個角度的**螢幕座標與縮放**算出來,存成 room.json 給網頁用。
那張表是整件事能不能成立的關鍵;少了它,寵物就是一張貼在畫面上的貼紙。

用法:
    python3.13 -I room.py [寬] [取樣] [張數]
    python3.13 -I room.py 960 96 13      # 預設
輸出到 ../../assets/room/
"""
import bpy, math, json, os, sys
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, '..', '..', 'assets', 'room'))
os.makedirs(OUT, exist_ok=True)

W = int(sys.argv[1]) if len(sys.argv) > 1 else 960
SAMPLES = int(sys.argv[2]) if len(sys.argv) > 2 else 96
FRAMES = int(sys.argv[3]) if len(sys.argv) > 3 else 13

H = int(W * 0.72)
ARC = 44.0          # 左右各轉幾度。再多就會看到牆的背面

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


WOOD   = mat('wood',   (0.50, 0.32, 0.17), 0.52)
WOOD_D = mat('wood_d', (0.40, 0.25, 0.13), 0.58)   # 深一階的地板條
WALL   = mat('wall',   (0.93, 0.88, 0.77), 0.92)
TRIM   = mat('trim',   (0.52, 0.36, 0.22), 0.5)
RUG    = mat('rug',    (0.35, 0.55, 0.42), 0.95)
RUG2   = mat('rug2',   (0.78, 0.74, 0.60), 0.95)
CUSH   = mat('cush',   (0.78, 0.45, 0.38), 0.9)
BOWL   = mat('bowl',   (0.86, 0.86, 0.88), 0.35)
BOWL_IN = mat('bowlin', (0.55, 0.38, 0.24), 0.7)
LEAF   = mat('leaf',   (0.25, 0.48, 0.26), 0.7)
POT    = mat('pot',    (0.68, 0.42, 0.32), 0.65)
GLASS  = mat('sky',    (0.80, 0.90, 1.0), 0.5, emit=(0.86, 0.93, 1.0), strength=2.6)
GOLD   = mat('gold',   (0.92, 0.72, 0.28), 0.25, metal=0.9)


def put(o, m):
    o.data.materials.clear()
    o.data.materials.append(m)
    return o


def box(size, loc, m, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = C.object
    # primitive_cube_add(size=1) 做出來的立方體邊長就是 1(-0.5 到 0.5),
    # 所以要幾長就縮放幾倍 —— 除以 2 的話整間房子會縮一半,
    # 地板條之間會裂開、牆會浮在空中(踩過)。
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    return put(o, m)


def cyl(r, h, loc, m, rot=(0, 0, 0), verts=40):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, location=loc,
                                        rotation=rot, vertices=verts)
    bpy.ops.object.shade_smooth()
    return put(C.object, m)


# ============================================================ 房間
# 三面牆的轉角房:後牆 + 左牆。相機在前右方繞,所以那兩面永遠看得到,
# 而缺掉的兩面就是鏡頭進來的地方 —— 這是立體等角房間的標準做法。
R = 5.0          # 房間邊長
WALL_H = 3.2

# 地板:一條一條的木地板,深淺交錯
for i in range(14):
    y = -R / 2 + R * (i + 0.5) / 14
    box((R, R / 14 * 0.94, 0.12), (0, y, -0.06),
        WOOD if i % 2 == 0 else WOOD_D)

# 牆
wall_back = box((R, 0.16, WALL_H), (0, R / 2, WALL_H / 2), WALL)   # 後牆
box((0.16, R, WALL_H), (-R / 2, 0, WALL_H / 2), WALL)         # 左牆
# 踢腳板
box((R, 0.22, 0.22), (0, R / 2 - 0.04, 0.11), TRIM)
box((0.22, R, 0.22), (-R / 2 + 0.04, 0, 0.11), TRIM)

# 後牆的窗:挖一個洞,擺一片會發光的「玻璃」當作外面的天光。
# 真的做一盞太陽從外面照進來最準,但那樣算很久;這樣看起來一樣。
WIN = (1.9, 1.5, 1.95)      # 寬、高、中心離地
bpy.ops.mesh.primitive_cube_add(size=1, location=(0.55, R / 2, WIN[2]))
hole = C.object
# 這裡也一樣:cube 的邊長是 1,要挖多大就縮放多少
hole.scale = (WIN[0], 1.0, WIN[1])
bpy.ops.object.transform_apply(scale=True)
# 直接拿著後牆那個物件,不要事後用座標去找 —— 找錯一次就整支掛掉
bm = wall_back.modifiers.new('win', 'BOOLEAN')
bm.object = hole
bm.operation = 'DIFFERENCE'
hole.hide_render = hole.hide_viewport = True

# 窗口**不要**擺一片玻璃 —— 不管畫得多像,它都是一面不透光的牆,
# 太陽會被擋住,地板上就不會有那一塊光(整間因此沒有方向感)。
# 改成在窗外遠一點的地方放一面會發光的板子當天空,窗口本身是空的。
# 板子要**剛好躲在牆後面**:比窗口大一點點、比牆小一圈,
# 這樣只有從窗口看得到它。做太大的話它會從牆的上緣冒出來(踩過)。
sky = box((2.9, 0.06, 2.3), (0.55, R / 2 + 0.40, WIN[2]), GLASS)
# 這塊板子擋在太陽和窗口中間,所以要讓光線穿過去 ——
# 不關掉的話太陽整個被擋住,地板上那一塊光永遠不會出現(找了很久)。
sky.visible_shadow = False
# 窗框
# 上下兩根通到底,左右兩根縮短塞在中間 —— 四根都通到底的話,
# 四個角會有兩塊木頭重疊,算出來是四個黑方塊(踩過)。
for dx, dz, sx, sz in ((0, WIN[1] / 2, WIN[0] + 0.20, 0.12),
                       (0, -WIN[1] / 2, WIN[0] + 0.20, 0.12),
                       (WIN[0] / 2, 0, 0.12, WIN[1] - 0.12),
                       (-WIN[0] / 2, 0, 0.12, WIN[1] - 0.12),
                       (0, 0, 0.07, WIN[1] - 0.12)):
    box((sx, 0.14, sz), (0.55 + dx, R / 2 - 0.08, WIN[2] + dz), TRIM)

# ============================================================ 家具
# 地毯:寵物主要待的地方
cyl(1.35, 0.03, (-0.5, -0.6, 0.015), RUG, verts=64)
cyl(1.05, 0.035, (-0.5, -0.6, 0.02), RUG2, verts=64)

# 睡墊
box((1.5, 1.0, 0.22), (-1.55, 1.25, 0.11), CUSH)
box((1.3, 0.8, 0.12), (-1.55, 1.25, 0.26), RUG2)

# 飯碗
cyl(0.34, 0.16, (1.55, -0.35, 0.08), BOWL)
cyl(0.27, 0.06, (1.55, -0.35, 0.15), BOWL_IN)

# 盆栽
cyl(0.33, 0.44, (-1.85, 1.85, 0.22), POT)
for i, (dx, dy, dz, r) in enumerate(((0, 0, 0.72, 0.36), (0.22, 0.1, 0.52, 0.26),
                                     (-0.2, -0.12, 0.58, 0.24))):
    bpy.ops.mesh.primitive_ico_sphere_add(radius=r, subdivisions=3,
                                          location=(-1.85 + dx, 1.85 + dy, dz))
    bpy.ops.object.shade_smooth()
    put(C.object, LEAF)

# 玩具箱(右邊本來是一片空地板)
box((1.1, 0.8, 0.62), (1.55, 0.95, 0.31), TRIM)
box((1.16, 0.86, 0.08), (1.55, 0.95, 0.66), WOOD_D)

# 牆上的架子 + 一顆發光的小球(之後可以換成學生收集到的東西)
box((1.2, 0.3, 0.07), (-R / 2 + 0.3, -1.1, 1.65), TRIM, rot=(0, 0, math.radians(90)))
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.16,
                                     location=(-R / 2 + 0.3, -1.1, 1.85))
bpy.ops.object.shade_smooth()
put(C.object, mat('orb', (0.6, 0.9, 1.0), 0.1, emit=(0.4, 0.82, 1.0), strength=6))

# ============================================================ 光
def light(kind, loc, energy, rot=(0, 0, 0), size=3.0, color=(1, 1, 1)):
    bpy.ops.object.light_add(type=kind, location=loc, rotation=rot)
    o = C.object
    o.data.energy = energy
    o.data.color = color
    if kind == 'AREA':
        o.data.size = size
    return o


# 窗外的天光:一盞大面光貼在窗戶外面往裡照,地板上就會有一塊亮斑
sun = light('SUN', (0.55, R / 2 + 1.0, WIN[2] + 1.0), 7.0,
            (math.radians(42), 0, math.radians(190)), color=(1.0, 0.92, 0.76))
sun.data.angle = math.radians(3.5)      # 影子邊緣柔一點,不要刀切
light('AREA', (0.55, R / 2 + 0.4, WIN[2]), 220,
      (math.radians(90), 0, math.radians(180)), 2.2, (0.95, 0.96, 1.0))
light('AREA', (1.2, -2.0, 3.0), 170, (math.radians(34), 0, math.radians(18)),
      4, (0.9, 0.94, 1.0))                       # 室內的補光
light('AREA', (-2.4, -1.4, 2.6), 80, (math.radians(50), 0, math.radians(-42)),
      4, (0.86, 0.90, 1.0))

world = D.worlds.new('w')
C.scene.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (0.30, 0.34, 0.42, 1)
world.node_tree.nodes['Background'].inputs[1].default_value = 0.16

# ============================================================ 站位
# 寵物會站的幾個點,以及家具的擺放孔位。
# 每一個點都要算出「在每一個角度下,它在畫面的哪裡、該畫多大」。
SPOTS = {
    'rug':   (-0.5, -0.6, 0.0),      # 地毯上(預設)
    'bed':   (-1.55, 1.25, 0.32),    # 睡墊上
    'bowl':  (1.05, -0.35, 0.0),     # 飯碗旁
    'window': (0.55, 1.6, 0.0),      # 窗邊
}

# ============================================================ 算圖
sc = C.scene
sc.render.engine = 'CYCLES'
sc.cycles.samples = SAMPLES
sc.cycles.use_denoising = True
sc.render.resolution_x = W
sc.render.resolution_y = H
sc.render.image_settings.file_format = 'WEBP'
sc.render.image_settings.quality = 82
sc.view_settings.look = 'AgX - Base Contrast'

bpy.ops.object.empty_add(location=(0, 0, 1.25))
target = C.object
bpy.ops.object.camera_add(location=(0, -8, 5))
cam = C.object
cam.data.lens = 46
tt = cam.constraints.new('TRACK_TO')
tt.target = target
tt.track_axis = 'TRACK_NEGATIVE_Z'
tt.up_axis = 'UP_Y'
sc.camera = cam

DIST, HEIGHT = 10.2, 4.2
frames = []

for i in range(FRAMES):
    t = 0.5 if FRAMES == 1 else i / (FRAMES - 1)
    ang = math.radians(-ARC + 2 * ARC * t)
    cam.location = (math.sin(ang) * DIST, -math.cos(ang) * DIST, HEIGHT)
    C.view_layer.update()

    name = 'room-%02d.webp' % i
    sc.render.filepath = os.path.join(OUT, name)
    bpy.ops.render.render(write_still=True)

    # 這一格的站位投影。world_to_camera_view 回傳 0~1 的畫面座標,
    # 乘上解析度就是像素。scale 用「地板上一個單位高的線段投影後有多長」算 ——
    # 這樣寵物站得越後面就自動畫得越小,而且是真的透視,不是我猜的係數。
    spots = {}
    for key, p in SPOTS.items():
        base = Vector(p)
        a = world_to_camera_view(sc, cam, base)
        b = world_to_camera_view(sc, cam, base + Vector((0, 0, 1)))
        spots[key] = {
            'x': round(a.x, 5),
            'y': round(1 - a.y, 5),              # 網頁的 y 由上往下
            'unit': round(abs(a.y - b.y), 5)     # 一個單位高 = 畫面高的幾成
        }
    frames.append({'file': name, 'angle': round(math.degrees(ang), 2),
                   'spots': spots})
    print('frame %d/%d  %s' % (i + 1, FRAMES, name))

meta = {
    'width': W, 'height': H,
    'arc': ARC,
    'frames': frames,
    'note': '由 tools/blender/room.py 產生,不要手改'
}
with open(os.path.join(OUT, 'room.json'), 'w', encoding='utf-8') as f:
    json.dump(meta, f, ensure_ascii=False, indent=1)

# 同一份資料再寫成一支 .js。
# 老師是**雙擊 index.html** 打開這個系統的(README 就是這樣寫的),
# 而 file:// 下 fetch() 讀本機 JSON 會被瀏覽器擋掉 ——
# 用 <script> 載就沒有這個問題。JSON 那一份留著給工具和測試用。
with open(os.path.join(OUT, 'room-data.js'), 'w', encoding='utf-8') as f:
    f.write('/* 由 tools/blender/room.py 產生,不要手改 */\n')
    f.write('window.PET_ROOM = ')
    json.dump(meta, f, ensure_ascii=False, separators=(',', ':'))
    f.write(';\n')

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'room.blend'))
print('OK ->', OUT)
