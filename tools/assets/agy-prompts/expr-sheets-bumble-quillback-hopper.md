# 表情 sheet 重生 prompt：Bumble / Quillback / Hopper

依序執行、使用同一個 session。**每張圖只生一次，不要重生、不要多生候選。** 共 3 張，各自附該台的基準圖當參考（風格、配色必須一致）。

某一張失敗（額度耗盡、沒產出檔案）就停下來回報，不要重試。

## 重生原因與硬性規格

上一版的問題：每個格子墊了粉紅或黃色的底磚、畫了格線，導致無法用洋紅去背。這次的規格：

- 整張圖背景是**同一種純洋紅 `#FF00FF`**，從邊到邊完全均勻，**沒有格線、沒有邊框、沒有底磚、沒有色塊、沒有漸層、沒有陰影**。
- 物件之間的洋紅空隙至少 120 px，每個物件獨立、互不相觸，也不碰到畫面邊緣。
- **網格**：8 欄 × 4 列，每格大小相同，每格物件置中、大小一致（見每台的規格）。看不到網格，只靠物件位置排列。空格就留空洋紅，不要畫東西。
- 任何物件都不可使用洋紅或粉紅色；舌頭用深珊瑚紅 `#E0453A`，不要粉色。
- 風格：卡通 Q 版玩具風、粗深色外框（`#241e33`）、平塗 + 硬陰影在右下、白色高光，與基準圖相同。無文字、無數字。
- **每顆眼睛都是一顆完整的圓球**（眼白 + 眼皮色的球體），所有眼睛狀態畫成同樣大小、同樣的圓球，裁成正方形時不會被切到。閉眼是眼皮色的整顆球加一條彎線，**不是只畫睫毛**；開心、受傷、死亡的眼睛也都畫在整顆眼皮色的圓球上，不要裸露的線條。

### 8 欄 × 4 列的內容（三張相同，眼睛風格各台不同）

```
Row 1, near-side eye, each one a complete round eyeball of the same size, 8 states left to right:
  1 open, 2 sleepy (upper eyelid covers the upper third), 3 half-open (eyelid covers half), 4 closed (whole ball in eyelid color with one curved line),
  5 wide-open (extra large white, tiny pupil), 6 happy (whole ball in eyelid color with an upside-down U arc), 7 hurt (whole ball in eyelid color with "> <" marks),
  8 dead (whole ball in eyelid color with an X).
Row 2, far-side eye, same 8 states, same ball shape but 80% of the size, and WITHOUT a pupil in open / sleepy / half-open / wide states (plain white eyeball only).
Row 3, pupils only, 4 cells at columns 1-4: normal, small, large, dizzy spiral (a spiral drawn on a plain white disc). Columns 5-8 empty.
Row 4, mouth and symbols, 7 cells at columns 1-6 and 8 (column 7 stays empty): smile, flat line, open mouth shout, frown, big laugh, sweat drop (light blue), [column 7 empty], tongue out (column 8).
```

---

# 一、Bumble（蜜蜂）— 參考圖 `bumble_base.png` → 輸出 `bumble_expr2.png`

輸出路徑：`C:\workspace\tank\tools\blender\refs\bumble\bumble_expr2.png`

```
Expression sheet for the same bee character as the attached reference image, same style and colors. Eye style: big round glossy black pupil with a white highlight on a white eyeball, eyelid color is lemon yellow #FFD93D, thick dark outline.
Flat solid #FF00FF magenta background everywhere, no grid lines, no borders, no tiles, no colored cell backgrounds, no shadows, no text, at least 120 px of pure magenta between any two objects.
Layout: 8 columns by 4 rows (each object centered in an invisible equal-size cell). 
Row 1, near-side eye, each one a complete round eyeball of the same size, 8 states left to right: open, sleepy (upper eyelid covers the upper third), half-open (eyelid covers half), closed (whole ball in eyelid color with one curved line), wide-open (extra large white, tiny pupil), happy (whole ball in eyelid color with an upside-down U arc), hurt (whole ball in eyelid color with "> <" marks), dead (whole ball in eyelid color with an X).
Row 2, far-side eye, same 8 states, same ball shape at 80% of the size, without a pupil in the open / sleepy / half-open / wide states (plain white eyeball only).
Row 3, pupils only, 4 objects in columns 1-4: normal, small, large, dizzy spiral on a plain white disc. Columns 5-8 stay empty magenta.
Row 4, 7 objects in columns 1-6 and 8, column 7 stays empty: smile, flat line, open mouth shout, frown, big laugh, sweat drop in light blue, then column 7 left empty, then in column 8 tongue out with a deep coral red #E0453A tongue.
No object may use magenta or pink.
```

---

# 二、Quillback（刺蝟）— 參考圖 `quillback_base.png` → 輸出 `quillback_expr2.png`

輸出路徑：`C:\workspace\tank\tools\blender\refs\quillback\quillback_expr2.png`

```
Expression sheet for the same hedgehog character as the attached reference image, same style and colors. Eye style: round shiny black bean eyes with a white highlight on a white eyeball, short thick eyebrow tick above, eyelid color is cream #F1E6CF, thick dark outline.
Flat solid #FF00FF magenta background everywhere, no grid lines, no borders, no tiles, no colored cell backgrounds, no shadows, no text, at least 120 px of pure magenta between any two objects.
Layout: 8 columns by 4 rows (each object centered in an invisible equal-size cell). 
Row 1, near-side eye, each one a complete round eyeball of the same size, 8 states left to right: open, sleepy (upper eyelid covers the upper third), half-open (eyelid covers half), closed (whole ball in eyelid color with one curved line), wide-open (extra large white, tiny pupil), happy (whole ball in eyelid color with an upside-down U arc), hurt (whole ball in eyelid color with "> <" marks), dead (whole ball in eyelid color with an X).
Row 2, far-side eye, same 8 states, same ball shape at 80% of the size, without a pupil in the open / sleepy / half-open / wide states (plain white eyeball only).
Row 3, pupils only, 4 objects in columns 1-4: normal, small, large, dizzy spiral on a plain white disc. Columns 5-8 stay empty magenta.
Row 4, 7 objects in columns 1-6 and 8, column 7 stays empty: smile, flat line, open mouth shout, frown, big laugh, sweat drop in light blue, then column 7 left empty, then in column 8 tongue out with a deep coral red #E0453A tongue.
No object may use magenta or pink.
```

---

# 三、Hopper（跳蛙）— 參考圖 `hopper_base.png` → 輸出 `hopper_expr2.png`

輸出路徑：`C:\workspace\tank\tools\blender\refs\hopper\hopper_expr2.png`

```
Expression sheet for the same frog character as the attached reference image, same style and colors. Eye style: big bulging round frog eyeball, white eyeball with a large round black pupil and a white highlight, eyelid color is sunny yellow-green #D4DC3A (warm, not teal), thick dark outline.
Flat solid #FF00FF magenta background everywhere, no grid lines, no borders, no tiles, no colored cell backgrounds, no shadows, no text, at least 120 px of pure magenta between any two objects.
Layout: 8 columns by 4 rows (each object centered in an invisible equal-size cell). ONE eye per cell, never a pair.
Row 1, near-side eye, each one a complete round eyeball of the same size, 8 states left to right: open, sleepy (upper eyelid covers the upper third), half-open (eyelid covers half), closed (whole ball in eyelid color with one curved line), wide-open (extra large white, tiny pupil), happy (whole ball in eyelid color with an upside-down U arc), hurt (whole ball in eyelid color with "> <" marks), dead (whole ball in eyelid color with an X).
Row 2, far-side eye, same 8 states, same ball shape at 80% of the size, without a pupil in the open / sleepy / half-open / wide states (plain white eyeball only).
Row 3, pupils only, 4 objects in columns 1-4: normal, small, large, dizzy spiral on a plain white disc. Columns 5-8 stay empty magenta.
Row 4, 7 objects in columns 1-6 and 8, column 7 stays empty: wide smile, flat line, open mouth shout, frown, big laugh, sweat drop in light blue, then column 7 left empty, then in column 8 tongue out with a deep coral red #E0453A tongue.
No object may use magenta or pink.
```

---

## 完成後（後續接手事項，agy 不用管）

1. 完成後告知；預設檔案已在各 `tools/blender/refs/<id>/`。
2. 以 `tools/sprites2d/slice_expr.py`（8 欄 × 4 列）切成零件，`pack_face_atlas.py` 打包成 `public/assets/units/tanks/<id>_face.png` 與 `faceAtlases/<id>.ts`，並把 `FaceSpec.atlas` 接上；`--ball-px` 與臉座標要在遊戲內肉眼校正。
3. 第 4 列刻意空出第 7 格，對應 `slice_expr.py` 命名表的 `fx_star`（星星由程式畫），第 8 格是 `mouth_tongue`。
