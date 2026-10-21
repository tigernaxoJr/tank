# 美術素材管線與授權規範 (04-art-asset-pipeline.md)

戰場上所有可見美術一律來自兩種來源，都經過可重現的腳本產生，執行期不再臨時拼裝或上色：

1. **Kenney CC0 開源素材**（三個原始地圖主題、木箱油桶、爆炸與煙霧序列影格）→ `public/assets/kenney/`
2. **專案原創向量美術**（`desert_temple` / `sky_meadow` / `aurora_night` / `moon_ruins` 四個地圖主題，以及所有主題的基岩紋理與懸掛裝飾）→ `public/assets/maps/`，由程式繪製，不引用任何第三方圖片（見 §五）。
3. **專案原創坦克 / 砲彈 / 粒子美術** → `public/assets/units/`，由 `tools/assets/paint_units.mjs` 繪製（見 §六）。`public/assets/kenney/tanks/` 與彈體 `bullet*.png` 已不再被遊戲引用。

## 一、素材來源（全部 CC0，作者 Kenney，取自 opengameart.org）

| 素材包 | 用途 | 原始檔 |
| :--- | :--- | :--- |
| Tank Pack (side view) | 坦克車身 + 履帶 + 分離砲管、彈體、木箱/油桶 | `kenney_tanksPack.zip` |
| Background Elements Redux | 遠山、中丘、近丘、雲海、樹木/仙人掌/灌木、太陽 | `Background Elements Redux.zip` |
| Platformer Pack Redux | 地表磚 (`grassMid`/`sandMid`/`snowMid`) 與土壤磚 (`*Center`) | `Platformer Pack Redux (360 assets).zip` |
| Smoke Particle Assets | 爆炸、砲口閃光、白煙、黑煙序列影格 | `smokeParticleAssets.zip` |

授權與出處完整列於專案根目錄 [`CREDITS.md`](../CREDITS.md)。**新增任何素材前必須確認授權為 CC0 或相容授權，並同步更新 `CREDITS.md`**；禁止使用來源不明或「僅供個人使用」的素材。

## 二、烘焙腳本：`tools/assets/bake_kenney_assets.py`

```bash
# 1. 下載上述 4 個 zip，各自解壓到 <packs>/tanks、<packs>/bg、<packs>/platformer、<packs>/smoke
# 2. 只需要 Pillow
python3 tools/assets/bake_kenney_assets.py <packs>
```

輸出（可安全重跑，結果固定）：

| 輸出 | 說明 |
| :--- | :--- |
| `tanks/<id>_<a|b>_hull.png` / `_barrel.png` | 以像素比對自動把車身與履帶疊回 Kenney 原廠組裝位置；A 隊 Desert 塗裝、B 隊 Navy 塗裝 |
| `maps/<mapId>/terrain_cap.png` / `terrain_fill.png` | 128×128 地表磚與土壤磚（峽谷整體偏紅） |
| `maps/<mapId>/mountains|hills_far|hills_near|clouds_far.png` | 依地圖色調以「亮度比例」重新上色的視差剪影；雲海底部漸隱 |
| `maps/<mapId>/prop<N>.png` / `thumbnail.png` | 地表裝飾、大廳地圖縮圖 |
| `props/*.png` | 太陽、木箱/油桶、彈體 |
| `fx/explosion|flash|puff|smoke.png` | 橫向排列的序列影格 (spritesheet) |

> 為什麼要預先烘焙顏色？戰場使用 Phaser **Canvas Renderer**（地形 CanvasTexture 每次挖坑都要重新上傳，Canvas 較穩定且不依賴 WebGL），而 Canvas Renderer **不支援 `setTint`**，因此所有配色差異必須在烘焙階段完成。

舊的 Blender 管線 (`tools/blender/render_assets.py`、`public/assets/tanks/`、`public/assets/textures/`) 已不再被遊戲引用，保留作為參考。

## 三、執行期渲染規則（`BattleScene.ts`）

1. **圖層順序**：天空漸層 → 太陽/月亮 → 雲海（隨當前風向飄移）→ 遠山 → 中丘 → 近丘 → 深淵漸層 (depth 3) → 地表裝飾、懸掛裝飾 (depth 4) → 可破壞地形 (depth 5) → 木箱 (depth 6) → 坦克 (depth 10) → 瞄準預覽 → 砲彈/爆炸。
2. **手動視差**：背景圖層為 `scrollFactor(0)` 的 TileSprite，每幀依鏡頭位置設定 `tilePositionX` 與 `y`，底部以同色矩形延伸避免鏡頭下移露出天空。
3. **地形著色**：
   * 逐像素記錄「距離原始地形正上方空氣的深度」，128px 內取地表磚、以下取土壤磚（皆以深度為座標，紋理會順著地形起伏；浮島頂、橋面、下層薄地都各自長出草皮/雪層）。
   * 懸空地形的底面（下方 3px / 9px 為空氣）加背光陰影，讓浮島與橋面有厚度感。
   * 不可破壞基岩取主題的 `bedrock.png`（世界座標取樣），外露頂面加高光。
   * 彈坑內壁不會長出草皮/雪層，而是露出土壤，並在新挖出的邊緣加上兩階焦黑描邊；重畫範圍需外擴 8px 以包含描邊。
4. **地表裝飾**：以地圖種子透過 `DeterministicRng` 擺放（P2P 雙方看到的景物一致），坦克出生點附近留空，深淵欄位與基岩上不擺；爆炸半徑內的裝飾會被炸飛，失去支撐者以彈跳動畫落到新地表。裝飾純屬視覺，**不參與碰撞與傷害計算**。
   * **懸掛裝飾**（`hang<N>.png`：樹根、藤蔓、冰柱、掛燈鎖鏈）：掛在「上方 ≥14px 實心、下方 ≥70px 懸空」的底面；掛點被炸或失去支撐就掉落淡出。
   * **深淵漸層**：沒有地面或只有薄地表的地圖（`hasAbyss`），戰場最底部畫一道由透明漸變到近景色（雲海 / 霧氣）的帶子，畫在地形後方，提示「掉下去就陣亡」。
5. **坦克**：車身+砲管放在可隨坡度旋轉的 `rig` 容器內，名牌與血條不旋轉；地形被挖空時坦克以動畫下墜而非瞬移；陣亡坦克半透明、砲管下垂並持續冒黑煙。
   * **表情（Q 版卡通風格，造型原創）**：[`engine/tankFace.ts`](../src/features/battle/engine/tankFace.ts) 以 Phaser Graphics 每幀畫眼睛/眉毛/嘴巴，放在 `rig` 內隨坡度旋轉、隨面向鏡像；線條先描半透明白邊再描墨線，沙漠與海軍塗裝都看得清楚。不使用圖檔。
   * **表情優先序**：陣亡 (X_X) > 短暫反應 > 勝負 > 輪到自己 > 低血量 > 待機。

     | 觸發 | 表情 / 車身動畫 |
     |---|---|
     | 待機 | 隨機眨眼、左右張望、車身微幅呼吸 |
     | 輪到自己 | 眉毛上揚、咧嘴、連跳兩下 (`eager` 1.1s)，之後轉為專注瞄準：瞇眼、眉頭下壓、瞳孔跟著砲管角度 |
     | 開火 | 用力閉眼 `><`、大叫、後座仰一下 (0.45s) |
     | 砲彈飛行 | 所有存活坦克的瞳孔追著砲彈 |
     | 被擊中 | 驚嚇（瞳孔縮小、O 嘴、彈起） 0.42s → 螺旋眼 + 頭頂轉星星 + 搖晃 1.5s |
     | 命中敵人 / 誤傷隊友 | 射手得意壞笑並小跳 / 尷尬 `><` + 冷汗 |
     | 血量 ≤ 30% | 擔心眉、冷汗滴落、輕微顫抖 |
     | 勝利 / 落敗 | `^^` 眼咧嘴連續跳 / 垂眉皺嘴冒汗 |
   * 臉的線條寬度以戰場實際大小（臉約 25px 寬）為準：`><`、`XX`、螺旋眼本身就很搶眼，這三種眼型**不畫眉毛**，否則會糊成一團。
6. **畫面縮放**：Phaser 使用 `Scale.RESIZE`，畫布永遠等於視窗大小，**禁止使用會裁切左右兩側的 `ENVELOP`**（窄螢幕會把地圖邊緣的坦克切出畫面）。

## 四、點陣轉向量：`scripts/vectorize.sh`

將生圖或參考 PNG 轉為 SVG：`rembg 去背 → Lanczos 放大 → 分離 alpha → RGB 映射回原圖調色盤 → vtracer → svgo`。

```bash
scripts/vectorize.sh input.png out.svg --preview      # 預設放大 400%、20 色
scripts/vectorize.sh big_1024.png out.svg -s 150 -c 24 # 大圖降低放大倍率
```

* **依賴**：ImageMagick 7、`vtracer`（必須用 `cargo install vtracer`，pip 綁定在 Python 3.14 會崩潰）、`svgo`、`rembg`（輸入沒有透明像素時才自動執行，首次下載約 1GB 模型）。
* **alpha 必須分開處理**：帶 alpha 直接 `-colors`/`-remap` 會讓透明背景變成不透明或黑色色塊。
* **調色盤取原圖最常見的 N 色**：直接 `-colors N` 會讓色相漂移（例如米色砲塔變灰藍）。
* **適用範圍**：適合 ≥1024px 的生圖、需要任意縮放或拆分可動部件的素材。Kenney 這類小尺寸平塗 sprite **維持 PNG**——轉成 SVG 反而大約 7 倍（6.5KB → 47KB），且細亮邊、同心圓等細節會被合併。

## 五、原創地圖主題：`tools/assets/paint_map_themes.mjs`

```bash
npm run paint:maps   # node tools/assets/paint_map_themes.mjs
```

* **流程**：程式以種子 PRNG 產生 SVG（`tools/assets/map-art/<theme>/*.svg`）→ `@resvg/resvg-js` 點陣化到 `public/assets/maps/<theme>/*.png` → SVGO 壓縮 SVG 原始檔、ImageMagick `mogrify -strip` 去除 PNG metadata（兩者不在 PATH 時自動略過）。輸出固定，重跑結果逐位元組相同。
* **不需要 vtracer / rembg**：這裡沒有點陣來源圖，全部直接以向量繪製；§四的點陣轉向量管線留給外部生圖素材。
* **產出**：視差四層（1024×400，水平無縫：波形用整數週期、跨邊界的形狀以 `wrap()` 平移複製同一份標記）、`terrain_cap` / `terrain_fill` / `bedrock`（128×128 四方向無縫；地層 `strata()` 頂部與底部同色，地表磚以土壤磚為底再疊磚塊/草皮）、`prop<N>`、`hang<N>`，以及共用的 `_common/moon.png`。Kenney 主題只額外產生 `bedrock` 與 `hang<N>`。
* **主題登錄**：`mapRegistry.ts` 的 `THEME_REGISTRY` 記錄每個主題的來源（`kenney` / `original`）、裝飾數量、懸掛數量與太陽/月亮位置（`kind: 'none'` 表示不畫，例如火山濃煙）；`mapAssetUrl` 依來源切換資料夾。
* **美術守則**：
  * 扁平向量 + 頂緣亮邊，與 Kenney 風格一致；Phaser 使用 Canvas Renderer，配色必須在繪製時決定（不能執行期 tint）。
  * 深淵地圖的 `hills_near` 必須是雲海 / 霧氣而非地面，否則底部看起來像實地。
  * 中景 (`hills_far`) 的主體要在圖層上半部（約 y < 230），否則會被近景雲海蓋住。
  * resvg 遇到完全落在畫布外的路徑會 panic：紋理磚內的 `wrap()` 一定要傳 `T` 當週期。
  * 地標只畫通用題材（金字塔、柱廊、浮空城堡、拱橋、鐘塔），不得臨摹任何遊戲的地圖或背景。

## 六、坦克與砲彈美術：`tools/assets/paint_units.mjs`

```bash
npm run paint:units   # node tools/assets/paint_units.mjs
```

### 風格：Q 版玩具砲兵（致敬經典回合制砲兵遊戲的「可愛坦克」氛圍，造型全部原創）

使用者希望坦克與砲彈走 Q 版可愛砲兵的卡通畫風。**風格（畫風）可以參考，具體造型不能抄**：

* **可以借用的通用畫風元素**：Q 版大頭比例、圓滾滾的車身、超大砲塔、短履帶配少數幾顆大輪子、粗墨線、硬邊卡通陰影、玩具塑膠高光、車身上有表情的臉、鮮豔飽和的陣營色。
* **禁止**：臨摹或描圖任何其他遊戲的坦克造型、配色組合、徽章、名稱與特效圖；不得把對方的截圖或素材放進專案、拿來 vtracer 描圖或當生圖參考圖。新坦克要先想自己的造型主題（例：盾牌騎士、鐘形重甲、水滴跑車），再畫剪影。
* 版權總則見 [05-map-layout-design.md §一](./05-map-layout-design.md)。

### 造型規則（新增坦克 / 砲彈時照做）

| 項目 | 規則 |
| :--- | :--- |
| 比例 | 車身寬約 64~84 px、高約 26~36 px（遊戲畫面像素）；砲塔佔車身寬 40% 以上；履帶高 12~17 px，只放 3~4 顆大輪（直徑 ≥ 11 px） |
| 線條 | 墨線色 `#241e33`，主要輪廓 1.9 px、小零件 1.0~1.4 px，圓角接合 |
| 上色 | `toon()`：深色硬陰影在右下、亮邊在左上、主色在中間（不用柔和漸層）；`gloss()` 白色高光條 + 亮點做出玩具塑膠感 |
| 陣營色 | 琥珀隊 A `#ffad33`、皇家藍隊 B `#4b8fff`（亮 / 主 / 暗 / 深 四階）；鋼鐵零件用中性灰藍，徽章用金色 |
| 個性 | 每台坦克一個一眼可辨的剪影主題與 1~2 個記號（Aegis：頭盔砲塔 + 盾徽 + 天線球；Goliath：鐘形巨背 + 鋼下顎 + 警示條紋；Zephyr：水滴車身 + 後掠尾翼 + 泡泡座艙 + 閃電貼紙） |
| 臉 | 臉由 `tankFace.ts` 即時畫在車身前半部；那一塊保持素面（不放徽章、鉚釘），繪製時在註解記下臉中心與砲塔轉軸並同步到 `tankRegistry.ts` 的 `sprite.face` / `pivotX/pivotY`（rig y = svg y + 14） |
| 砲管 | 獨立圖，朝右、轉軸在寬度 8% 處（藏在砲塔內）；粗短圓角、陣營色色環、喇叭口砲口；能量武器可用雙軌 + 發光線圈 |
| 砲彈 | 同樣粗墨線 + 高光，比例誇張（短胖），一眼看出彈種：高爆彈 = 黃銅彈殼紅彈頭、重砲 = 鐵灰胖炸彈 + 黃黑警示帶 + 環形尾翼、電漿 = 白熱核心 + 青紫光暈 + 電弧（自轉） |

### 技術規格

* 座標以**遊戲畫面像素**撰寫：坦克以 2.5 倍、砲彈以 3 倍點陣化，遊戲中 `sprite.scale` 分別為 `0.4` 與約 `0.45`（砲彈刻意放大一點，飛行中才看得清楚）。
* 車身圖原點 = 底部中央（履帶接地線），面向右；面向左時執行期 `flipX`。
* 粒子：`fx/glow_fire`、`fx/glow_plasma`（彩色徑向光暈）、`fx/spark`（火花）、`fx/shockwave`（衝擊波環）。Canvas Renderer 不能 tint，所以**每種顏色各畫一張**，執行期以 `BlendModes.ADD` 疊加。
* 演出分工：砲口光暈 → 彈體 + 脈動光暈（電漿彈自轉）→ 每種彈各自的尾焰（高爆：小火光 + 白煙；重砲：大火光 + 黑煙 + 火星；電漿：青紫光點 + 電磁環）→ 爆炸序列 + 光核 + 衝擊波 + 火花（電漿彈不噴火花）。
* 與地圖主題相同：輸出固定可重現，SVGO 壓縮原始檔（`tools/assets/unit-art/`），ImageMagick 去 metadata。
