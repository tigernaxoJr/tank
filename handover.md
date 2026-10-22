# Handover：原創美術重製（坦克 / 砲彈 / 前三張地圖）

> 給下一個 agent：先讀完本檔，再讀 `AGENTS.md`、`docs/04-art-asset-pipeline.md` §五、§六 與 `docs/05-map-layout-design.md`。

## 目前進度

| 項目 | 狀態 |
|---|---|
| Q 版原創坦克（aegis / goliath / zephyr × 琥珀 / 皇家藍）、三種砲彈、光暈 / 火花 / 衝擊波粒子 | ✅ 完成，`tools/assets/paint_units.mjs`，風格規範在 docs/04 §六 |
| 地圖 1：`harvest_plains`（主題 `harvest_farm`，晨光風車農場，平原 + 每側兩座低土丘） | ✅ 完成，已和使用者確認 |
| 地圖 2：`volcano_gorge`（主題 `volcano_rift`，火山熔岩，兩側高台 + 中央深谷 + 石拱） | ✅ 完成，已和使用者確認 |
| 地圖 3：`gale_coast`（主題 `tropic_coast`，強風熱帶海岸，沙丘 + 中央對稱雙浮島，maxWind 14；取代舊 `polar_glacier`） | ✅ 完成，已在瀏覽器驗證（使用者選定風格）；新輔助函式 `windPalm`（被風吹彎的椰子樹）、`stiltHut` |
| 清理舊 Kenney 地圖主題 | ✅ 完成：`emerald_valley` / `sunset_canyon` / `polar_glacier` 主題、`public/assets/kenney/maps/`、bake 腳本的地圖烘焙段皆已刪除；`public/assets/kenney/` 只剩木箱油桶、太陽、爆炸序列與舊坦克圖 |

## 使用者規則（重要）

- **每張地圖都要先和使用者討論風格與內容**（AskUserQuestion，2~4 個選項附 preview），選定後才畫；畫完在瀏覽器驗證再進下一張。
- 每張地圖的配色 / 題材不得與其他地圖重複。已用：黃昏沙漠、藍天浮島、極光冰夜、紫色月夜遺跡、晨光農場、火山熔岩、熱帶強風海岸。
- 版權：可以參考經典砲術遊戲的 Q 版「畫風」，但造型、名稱、配色組合、地圖一律原創；不得把對方圖片放進專案或拿來描圖（docs/05 §一、docs/04 §六）。
- 新的設計規則要同步寫進 `docs/`；**沒有使用者明確指示不得 commit**。
- 工作目錄裡可能有其他 session 的未提交改動（例如 HUD、`windRules.ts`、docs/06），commit 時只 stage 自己的檔案。

## 方法（怎麼做一張新地圖主題）

1. **主題美術**：在 `tools/assets/paint_map_themes.mjs` 的 `THEMES` 物件新增一個 `kind: 'original'` 主題（照 `harvest_farm` / `volcano_rift` 的結構）：
   `clouds_far`、`mountains`、`hills_far`、`hills_near`（1024×400，水平無縫）、`terrain_cap` / `terrain_fill` / `bedrock`（128×128 四向無縫）、`props[]`、`hangs[]`。
   - 輔助函式：`ridge` / `rimmed` / `wrap`（跨接縫複製）/ `band` / `strata` / `speckles` / `noiseFilter` / `puffCloud` / `roundTree` / `palm` / `pine` / `floatingIsland` / `windmill` / `barn` / `column` / `carvedBedrock` / `roots` 等。
   - 版面：`mountains` 主體約 y 90~340；`hills_far` 主體要在 y < 230（否則被近景蓋住）；`hills_near` 稜線約 150~200。
   - **resvg 坑**：任何完全落在畫布外的形狀會 panic（`geom.rs unwrap`）→ 迴圈產生的形狀先檢查是否與畫布相交；磚內 `wrap()` 一定傳 `T`。
2. 執行 `npm run paint:maps`（輸出固定可重現；SVGO + ImageMagick 自動處理）。
3. **預覽**（ImageMagick 不在 Git Bash PATH，用完整路徑）：
   ```bash
   M="/c/Program Files/ImageMagick-7.1.2-Q16-HDRI/magick.exe"; D=public/assets/maps/<theme>
   "$M" -size 1024x700 gradient:'<skyTop>'-'<skyBottom>' $D/clouds_far.png -geometry +0+0 -composite $D/mountains.png -geometry +0+150 -composite $D/hills_far.png -geometry +0+230 -composite $D/hills_near.png -geometry +0+380 -composite "$TEMP/mapprev/bg.png"
   "$M" montage $D/terrain_cap.png $D/terrain_fill.png $D/bedrock.png $D/prop*.png $D/hang*.png -background '#9fd0f0' -geometry +6+6 -tile 10x "$TEMP/mapprev/parts.png"
   ```
   用 Read 看圖，修到滿意。
4. **登錄**：`src/features/battle/domain/mapRegistry.ts`
   - `MapThemeId` + `THEME_REGISTRY`（`propCount` / `hangCount` / `celestial`，`kind: 'none'` 可不畫日月）。
   - `MAP_REGISTRY` 的地圖條目：改 id 時同步 `src/shared/kernel/types.ts` 的 `MapPresetId` 並 grep 所有引用（App.vue、LobbyPanel.vue、BattleArena.vue、battleState.ts、useBattleTurn.ts、BattleScene.ts 的 fallback）。
   - 地形：`waveProfile`（`jitter` 控制隨機抖動，預設 18；平原要設小）+ `layout.features`（`ellipse` / `rect` / `bridge` / `island`，座標是比例；`mirrored()` 左右對稱）。
   - **出生點**：每隊分布在地圖寬度 7.5%~39.5%（右隊鏡像）；掩體、深谷、浮島底下不要壓到這些位置。
5. **驗證地形**：用 tsx 印出地表高度剖面：
   ```ts
   // _prof.ts（放在 repo 根目錄執行：npx -y tsx ./_prof.ts，跑完刪掉）
   import { DeterministicTankCore } from './src/shared/wasm/index'
   import { MAP_REGISTRY, terrainOptionsFor } from './src/features/battle/domain/mapRegistry'
   const m = MAP_REGISTRY.<mapId>; const c: any = new (DeterministicTankCore as any)()
   c.resetTerrain(1024, terrainOptionsFor(m))
   const row = []; for (let x = 0; x < m.width; x += 48) row.push(`${x}:${c.surfaceY(x)}`); console.log(row.join(' '))
   ```
6. `npx vue-tsc -b` 型別檢查。
7. **瀏覽器驗證**（vite dev server 在 5173，`.claude/launch.json` 名稱 `vite`）：大廳點地圖卡 → 「單機 / 挑戰電腦」→ 選 5 vs 5 → 開始。檢查 5v5 出生點、坦克是否平穩、背景圖層。拖曳畫面（left_click_drag）可移動鏡頭；HMR 會把頁面打回大廳，要重新開局。
8. 更新 `docs/05` §四地圖表格（與「已使用題材」清單）、必要時 docs/04。

## 坦克 / 砲彈美術（已完成，供修改參考）

- `npm run paint:units` → `public/assets/units/{tanks,projectiles,fx}`；SVG 原始檔在 `tools/assets/unit-art/`。
- 座標以遊戲畫面像素撰寫：坦克 2.5× 點陣化（`sprite.scale: 0.4`），砲彈 3×（顯示約 0.45）。
- 每台坦克的臉中心與砲塔轉軸寫在 `paint_units.mjs` 的註解，同步到 `tankRegistry.ts`（rig y = svg y + 14）。
- 疊加光暈用 `BlendModes.ADD`；Canvas renderer 不能 tint，每種顏色各畫一張貼圖。

## 已知待辦 / 注意

- `crates/tank-core`（Rust）已移植地形的 `features`（對應 `layout.features`）、BEDROCK、`groundBelow`、`jitter`，並由黃金檔（`crates/tank-core/tests/fixtures/golden.json`）與 TS 逐項比對（見 `docs/02` §五）。目前執行期仍只用 TS 核心，Rust/Wasm 尚未接上轉接層。
- 開局時 `focusActiveTank` 偶爾有 isActive console error（既有問題）。
- 舊 Kenney 坦克與彈體圖（`public/assets/kenney/tanks/`、`props/bullet*.png`）已不被引用，保留未刪。
