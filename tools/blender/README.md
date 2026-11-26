# 守護神獸的 3D 模型

用 Blender 的 Python 模組(`bpy`)寫出來的,不是手工在 Blender 介面裡拉的 ——
腳本的好處是改一個數字就能重算一次,而且十八隻神獸可以共用同一套做法。

## 怎麼跑

```bash
python3.13 -m pip install bpy          # Blender 5.3,約 300MB
python3.13 -I tools/blender/bear.py 760 110 front
#                                     解析度 取樣 視角(front/three/side/back)
```

算完會輸出 `bear-<視角>.png` 和一份 `bear.blend`(可以直接用 Blender 打開繼續改)。

這個容器沒有 GPU,所以用 CPU 的 Cycles 算:760px / 110 取樣大約一分鐘。
EEVEE 需要 OpenGL,在這裡起不來(缺 libEGL),別浪費時間試。

## 做法上的四個重點

1. **身體用 metaball 堆。** 球和球會自己融在一起,肩膀和脖子不會露出接縫。
   metaball 的 `radius` 是「影響範圍」不是實際半徑 ——
   stiffness 2 / threshold 0.6 時,實際半徑約等於 `radius × 0.575`(量過的)。

2. **身上的花紋用射線打在表面上**(`body.ray_cast`),不要自己算座標,
   也不要丟給 shrinkwrap 找最近點。metaball 融出來的面不是球也不是柱:
   座標用猜的會浮在空中,shrinkwrap 的「最近表面」有機會是背面 ——
   整道胸口的 V 會跑到背上去。這兩種都真的發生過。

3. **手腳和耳朵不要放進 metaball。** metaball 的場是相加的:一顆半徑 0.5 的胸
   加一顆半徑 0.2 的手臂,結果只是胸變胖一點。試了三次,畫出來永遠是
   「沒有手臂,旁邊浮著一顆球」。手腳改用會變細的錐柱(`limb`)、
   耳朵用壓扁的球直接接上去 —— 顏色一樣,重疊就等於接好了。

4. **頭和身體是兩團分開的 metaball,最後才 join 成一個物件。** 全部堆在一起
   讓它自己融的話,脖子會被填平,側面看就是從頭到屁股一整顆梨。
   分開做、讓它們稍微重疊,側面才有脖子那一道轉折。
   兩團都要往 Y 壓扁(`YS`),不壓的話每一團都是正圓,側面又深又鈍。
