# 新坦克美術 prompt：Bumble / Quillback / Hopper

依序執行、使用同一個 session。**每張圖只生一次，不要重生、不要多生候選。** 共 12 張，3 台坦克各 4 張，每台都是 ①基準圖 → ②零件 sheet → ③表情 sheet → ④砲彈 sheet。②③④ 都要把該台的 ① 當參考圖（風格、配色、比例必須一致）。

某一張失敗（額度耗盡、沒產出檔案）就停下來回報，不要重試。

## 全域規格（每張都適用）

- 卡通 Q 版玩具砲兵風：粗深色外框（`#241e33`）、平塗 + 硬陰影在右下、亮邊在左上、白色高光條與亮點，像塑膠玩具。左上受光。
- 背景一律是**純洋紅 `#FF00FF`**，不要地面、不要影子、不要文字、不要浮水印。畫面內任何物件都不能使用洋紅或粉紫色。
- 色彩明亮，**嚴禁濁青色 / 青綠 / 薄荷色**。不得使用或模仿任何現有遊戲的美術。
- 純側視，面向右。車身底部是接地線。
- 陣營色（只畫**橘色** `#FF8A1F`，會被程式轉成藍色當另一隊）：只能出現在每台指定的幾個零件上，其餘身體不要用橘色或藍色。
- 臉的位置保持**素面**（不放眼睛、嘴、徽章、鉚釘），眼睛與嘴由程式疊上。

輸出資料夾：`C:\workspace\tank\tools\blender\refs\<id>\`（資料夾已存在）。檔名見每張圖。PNG 輸出。

---

# 一、Bumble（蜜蜂轟炸機）— id: `bumble`

概念：懸浮的蜂巢砲艇，沒有履帶，靠背上的小翅膀振動懸空，圓滾滾的蜜蜂身體，蜂針就是砲管。招牌色：檸檬黃 `#FFD93D` 配巧克力棕 `#5A3A22` 條紋，奶油白絨毛。

## 1-1 基準圖 → `bumble_base.png`

```
Game asset, a cartoon artillery vehicle character: a chubby round bumblebee-shaped hovering gunship. Pure side view facing right.
Fat rounded body in lemon yellow with chocolate brown stripes, fluffy cream-white chest fur, two small translucent wings on the back,
two short curled antennae on the head, a hexagonal honeycomb panel on the belly, and a thick stinger-shaped cannon barrel sticking out of the right side
(the barrel is a separate straight cylinder that plugs into the body through a ring-shaped collar).
No wheels, no tracks: it hovers, with a small flat landing skid under the belly.
The face area on the front of the body is plain smooth yellow with no eyes and no mouth.
Wing tips and the ring collar are painted bright orange (#FF8A1F); everything else follows the colors above.
Soft toon shading, thick dark outline, light from the upper left. Flat solid #FF00FF background, no ground, no shadow, no text.
```

## 1-2 零件 sheet → `bumble_parts.png`

附 `bumble_base.png` 當參考，同一角色、風格、配色、比例。**一張圖內由左到右排開、彼此不相觸、間隔至少 60 px**，全部同一縮放比例：

```
Same character, same style, same colors, same lighting and same scale as the reference.
One sheet, left to right, each part fully separated by magenta space:
1) HULL: the body only, with the barrel, wings and antennae completely removed. Pure side view facing right, face area plain and empty.
   At the barrel position draw a round ring-shaped collar (orange) that belongs to the body; its center is an open socket showing a dark empty hole, NOT a closed cap.
2) BARREL: only the stinger cannon, horizontal, pointing right, pure side view. The left (base) end is a plain straight cylinder with the same width as the collar opening
   and about 20% extra length (it will be hidden inside the collar), with no ball, ring or decoration at the base end. Decoration only at the muzzle: a sharp brown stinger tip.
3) WING: one translucent wing in neutral resting pose, root end drawn as a plain rounded stub with about 20% extra length (it will be hidden behind the body). Orange tip.
4) ANTENNA: one curled antenna with a small round bulb at the tip, root drawn with about 20% extra length.
Flat solid #FF00FF background, no shadow, no text.
```

## 1-3 表情 sheet → `bumble_expr.png`

附 `bumble_base.png` 當參考。眼睛風格：大而圓的亮面黑眼珠，眼白外圈，白色高光。**8 欄 × 4 列網格，每格獨立不相觸、間隔足夠，格線整齊對齊，格內物件置中：**

```
Expression sheet for the same character, same style, matching the reference. Grid of 8 columns by 4 rows on flat #FF00FF, every cell separated by plenty of magenta, no text, no borders.
Row 1, near-side eye, one per cell: open, squinting, half-open, closed, wide-open, happy (an upside-down U arc), hurt (> <), dead (X).
Row 2, far-side eye, same 8 states but smaller and without a pupil.
Row 3, pupils only, 4 cells: normal, small, large, dizzy spiral (the other 4 cells empty).
Row 4, mouth and symbols, 8 cells: smile, flat line, open mouth shout, tongue out, sweat drop, small anger vein, sparkle, empty.
```

## 1-4 砲彈 sheet → `bumble_shells.png`

附 `bumble_base.png` 當參考：

```
Two projectile icons for the same game, same style and colors as the reference, left to right on flat #FF00FF, well separated, each about the same visual size, short and chubby, exaggerated proportions, 3/4 view, no text.
1) "Swarm shot": a small round bee-shaped bullet, yellow with brown stripes, tiny wings, a stinger tip pointing right, with a few small bee dots trailing behind it.
2) "Hive bomb": a hexagonal honeycomb-shaped bomb in golden amber, honey dripping from the bottom, a tiny fuse with an orange tip.
```

---

# 二、Quillback（刺蝟）— id: `quillback`

概念：把自己捲成半球的重甲刺蝟，背上一排可擺動的尖刺，靠一個大實心滾輪 + 小短腳行走，砲管像從嘴邊伸出的竹節管。招牌色：栗紫 `#7A4B8C` 身體、奶油白臉與肚、深紫 `#3B2350` 尖刺、尖刺尖端奶油色。

## 2-1 基準圖 → `quillback_base.png`

```
Game asset, a cartoon artillery tank character: a chubby armored hedgehog curled into a half-dome, riding on one big solid rubber roller wheel with two tiny stubby feet.
Pure side view facing right. Plum-purple body, cream-white belly and muzzle, a fan of dark purple spikes with cream tips covering the back,
a thick bamboo-segment cannon barrel sticking out toward the right (a separate straight cylinder that plugs into the body through a ring-shaped collar).
A small round nose at the front. The face area is plain smooth cream with no eyes and no mouth.
The ring collar and a stripe around the roller wheel hub are painted bright orange (#FF8A1F); everything else follows the colors above.
Soft toon shading, thick dark outline, light from the upper left. Flat solid #FF00FF background, no ground, no shadow, no text.
```

## 2-2 零件 sheet → `quillback_parts.png`

附 `quillback_base.png` 當參考。由左到右排開、不相觸、間隔至少 60 px、同一縮放：

```
Same character, same style, same colors, same lighting and same scale as the reference.
One sheet, left to right, each part fully separated by magenta space:
1) HULL: body and roller wheel only, with the barrel and the back spikes completely removed (the back is a smooth plum dome). Pure side view facing right, face area plain cream and empty.
   At the barrel position draw a round ring-shaped collar (orange) that belongs to the body; its center is an open socket showing a dark empty hole, NOT a closed cap.
2) BARREL: only the bamboo-segment cannon, horizontal, pointing right, pure side view. The left (base) end is a plain straight cylinder with the same width as the collar opening
   and about 20% extra length (it will be hidden inside the collar), no ball, ring or decoration at the base end. Decoration only at the muzzle: a flared mouth.
3) SPIKE FAN: the whole fan of back spikes as one piece, in neutral pose, the root edge drawn as a plain rounded base with about 20% extra length (hidden behind the body).
4) NOSE: a small round nose with a tiny highlight.
Flat solid #FF00FF background, no shadow, no text.
```

## 2-3 表情 sheet → `quillback_expr.png`

附 `quillback_base.png` 當參考。眼睛風格：圓亮的黑豆眼，帶白色高光，眉毛粗短。**8 欄 × 4 列：**

```
Expression sheet for the same character, same style, matching the reference. Grid of 8 columns by 4 rows on flat #FF00FF, every cell separated by plenty of magenta, no text, no borders.
Row 1, near-side eye, one per cell: open, squinting, half-open, closed, wide-open, happy (an upside-down U arc), hurt (> <), dead (X).
Row 2, far-side eye, same 8 states but smaller and without a pupil.
Row 3, pupils only, 4 cells: normal, small, large, dizzy spiral (the other 4 cells empty).
Row 4, mouth and symbols, 8 cells: smile, flat line, open mouth shout, tongue out, sweat drop, small anger vein, sparkle, empty.
```

## 2-4 砲彈 sheet → `quillback_shells.png`

附 `quillback_base.png` 當參考：

```
Two projectile icons for the same game, same style and colors as the reference, left to right on flat #FF00FF, well separated, each about the same visual size, short and chubby, exaggerated proportions, 3/4 view, no text.
1) "Rolling quill ball": a tightly curled hedgehog ball covered in short dark purple spikes with cream tips, a tiny cream nose peeking out, a rolling look but with clean sharp outlines (no blur).
2) "Needle rain canister": a pinecone-shaped canister in plum purple, bristling with long cream-tipped needles pointing upward, a small orange band around the middle.
```

---

# 三、Hopper（跳蛙）— id: `hopper`

概念：用兩條超大彈簧後腿一蹦一蹦移動的砲蛙，喉囊在開火時鼓起，砲管是背上的長筒。招牌色：陽光黃綠 `#C8E03A`（偏黃、明亮，**不是青綠**）、奶油白肚、褐色斑點。

## 3-1 基準圖 → `hopper_base.png`

```
Game asset, a cartoon artillery tank character: a chubby cannon frog crouching on two huge coiled-spring hind legs.
Pure side view facing right. Sunny yellow-green body (bright and warm, definitely not teal or mint), cream-white belly and throat sac, brown spots on the back,
one short front arm, a long straight cannon tube mounted on its back pointing right (a separate straight cylinder that plugs into the body through a ring-shaped collar).
Wide flat frog head at the front with smooth empty cheeks: the face area is plain smooth yellow-green with no eyes and no mouth line.
The ring collar and the spring coils on the hind legs are painted bright orange (#FF8A1F); everything else follows the colors above.
Soft toon shading, thick dark outline, light from the upper left. Flat solid #FF00FF background, no ground, no shadow, no text.
```

## 3-2 零件 sheet → `hopper_parts.png`

附 `hopper_base.png` 當參考。由左到右排開、不相觸、間隔至少 60 px、同一縮放：

```
Same character, same style, same colors, same lighting and same scale as the reference.
One sheet, left to right, each part fully separated by magenta space:
1) HULL: the body with head, belly and front arm only, with the barrel and the hind legs completely removed. Pure side view facing right, face area plain and empty.
   At the barrel position on the back draw a round ring-shaped collar (orange) that belongs to the body; its center is an open socket showing a dark empty hole, NOT a closed cap.
2) BARREL: only the long cannon tube, horizontal, pointing right, pure side view. The left (base) end is a plain straight cylinder with the same width as the collar opening
   and about 20% extra length (it will be hidden inside the collar), no ball, ring or decoration at the base end. Decoration only at the muzzle: a flared mouth.
3) HIND LEG: one huge spring-coiled hind leg in neutral crouched pose, the hip end drawn as a plain rounded stub with about 20% extra length (hidden behind the body).
4) THROAT SAC: the cream round throat sac, deflated resting size.
5) THROAT SAC INFLATED: the same sac blown up to about 1.6 times the size.
Flat solid #FF00FF background, no shadow, no text.
```

## 3-3 表情 sheet → `hopper_expr.png`

附 `hopper_base.png` 當參考。眼睛風格：突出在頭頂的大圓眼球，白色眼白 + 黑瞳，眼皮是黃綠色。**8 欄 × 4 列：**

```
Expression sheet for the same character, same style, matching the reference. Grid of 8 columns by 4 rows on flat #FF00FF, every cell separated by plenty of magenta, no text, no borders.
Row 1, near-side eye (a big bulging round frog eye, each cell includes its eye-socket dome), one per cell: open, squinting, half-open, closed, wide-open, happy (an upside-down U arc), hurt (> <), dead (X).
Row 2, far-side eye, same 8 states but smaller and without a pupil.
Row 3, pupils only, 4 cells: normal, small, large, dizzy spiral (the other 4 cells empty).
Row 4, mouth and symbols, 8 cells: wide smile, flat line, open mouth shout, tongue out, sweat drop, small anger vein, sparkle, empty.
```

## 3-4 砲彈 sheet → `hopper_shells.png`

附 `hopper_base.png` 當參考：

```
Two projectile icons for the same game, same style and colors as the reference, left to right on flat #FF00FF, well separated, each about the same visual size, short and chubby, exaggerated proportions, 3/4 view, no text.
1) "Tongue lash": a sticky pink glob shaped like a ball with a curled pink tongue tip trailing behind it, glossy highlights.
2) "Mud splat": a round clump of brown mud with a few leaf bits and a small drip, slightly flattened.
```

---

## 完成後（後續接手事項，agy 不用管）

1. 完成後告知路徑；預設檔案已在 `tools/blender/refs/<id>/`。
2. 去背切割（洋紅轉 alpha，`tools/sprites2d/`）、量轉軸與臉座標、組合驗收（砲管 14° / 45° / 80° 合成）。
3. 之後才寫 `domain/tanks/<id>.ts` 與專屬砲彈；機制構想（待確認後才進文件）：
   - Bumble：70 HP、懸浮（走位不受坡度限制）、蜂群彈高控制力低威力、蜂巢彈高拋後分裂。
   - Quillback：反傷被動（近距離爆炸反彈少量傷害）、滾刺球落地滾動後爆炸、針雨彈高拋散落。
   - Hopper：以跳躍位移（固定步長、可越過小坑）、舌鞭彈把對手往自己拉、泥巴彈減速。
