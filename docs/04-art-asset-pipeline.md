# 美術素材管線與授權規範 (04-art-asset-pipeline.md)

戰場上所有可見美術一律來自兩種來源，都經過可重現的腳本產生，執行期不再臨時拼裝或上色：

1. **Kenney CC0 開源素材**（木箱油桶、太陽、爆炸與煙霧序列影格）→ `public/assets/kenney/`。早期三個 Kenney 地圖主題（`emerald_valley` / `sunset_canyon` / `polar_glacier`）已改為原創主題並刪除。
2. **專案原創向量美術**（全部地圖主題：`harvest_farm` / `volcano_rift` / `tropic_coast` / `desert_temple` / `sky_meadow` / `aurora_night` / `moon_ruins`，含基岩紋理與懸掛裝飾）→ `public/assets/maps/`，由程式繪製，不引用任何第三方圖片（見 §五）。
3. **專案原創坦克 / 砲彈 / 粒子美術** → `public/assets/units/`，由 `tools/assets/paint_units.mjs` 繪製（見 §六）。`public/assets/kenney/tanks/` 與彈體 `bullet*.png` 已不再被遊戲引用。

> **紋理逐張手工守則（所有美術一律適用）**：只要是做圖（坦克、砲彈、地圖圖層與地磚、裝飾、大廳與 HUD 的底紋與面板），紋理與材質都要**一張一張針對該素材的題材手工設計**，不能套同一個雜訊濾鏡或同一組參數就批次帶過。每張圖至少要想清楚：它是什麼材料（石、土、木、金屬、布、冰、草……）、這種材料該有哪些記號（磚縫、木紋、年輪、鏽斑、裂痕、水痕、積雪、苔蘚……）、光從哪裡來、磨損與髒污會積在哪裡。共用的輔助函式（`finish()`、`speckles()`、`noiseFilter()` 等）只能當底層，上面必須再疊該素材專屬的手繪記號。做完要**逐張出預覽**（原尺寸 + 遊戲實際大小）檢查，一次只改一張或一組，確認後再做下一張。

## 一、素材來源（全部 CC0，作者 Kenney，取自 opengameart.org）

| 素材包 | 用途 | 原始檔 |
| :--- | :--- | :--- |
| Tank Pack (side view) | 坦克車身 + 履帶 + 分離砲管、彈體、木箱/油桶 | `kenney_tanksPack.zip` |
| Background Elements Redux | 太陽 | `Background Elements Redux.zip` |
| Smoke Particle Assets | 爆炸、砲口閃光、白煙、黑煙序列影格 | `smokeParticleAssets.zip` |

授權與出處完整列於專案根目錄 [`CREDITS.md`](../CREDITS.md)。**新增任何素材前必須確認授權為 CC0 或相容授權，並同步更新 `CREDITS.md`**；禁止使用來源不明或「僅供個人使用」的素材。

## 二、烘焙腳本：`tools/assets/bake_kenney_assets.py`

```bash
# 1. 下載上述 3 個 zip，各自解壓到 <packs>/tanks、<packs>/bg、<packs>/smoke
# 2. 只需要 Pillow
python3 tools/assets/bake_kenney_assets.py <packs>
```

輸出（可安全重跑，結果固定）：

| 輸出 | 說明 |
| :--- | :--- |
| `tanks/<id>_<a|b>_hull.png` / `_barrel.png` | 以像素比對自動把車身與履帶疊回 Kenney 原廠組裝位置；A 隊 Desert 塗裝、B 隊 Navy 塗裝 |
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
   * **眼睛畫法（角色優先新畫風，六台共用）**：粗墨框 → 眼白（下緣淡影）→ 虹膜（暗環 + 主色 + 下方亮斑）→ 瞳孔 → 左上大反光 + 右下小反光 → **車身色眼皮**由上往下蓋（眨眼、瞇眼、驚嚇都靠眼皮開度表現，不再把眼白壓扁）。眼皮是「眼白橢圓 ∩ 眼皮線以上半平面」的多邊形，沿眼皮線描墨線；閉眼時整片眼皮 + 一道睫毛弧線。墨線粗細隨 `eyeSize` 縮放（`max(2, eyeSize × 0.32)`）。
   * **每台的臉參數**（`sprite.face`，型別 `FaceSpec`）：`x/y` 臉中心、`eyeGap`、`eyeSize`（近側眼半高）、`lid` 眼皮色（＝臉部周圍的車身色）、`iris` 虹膜色為必填；選填 `farScale`（3/4 視角時車頭那隻遠側眼的縮放）、`rest`（待機眼皮開度，慵懶 / 陰險的個性 < 1，驚嚇時一律全開）、`lidTilt`（正值＝車頭側較低的斜眼）、`mouthDy`（嘴巴距臉中心）、`restMouth`（待機嘴型 smile / smirk / flat）、`blush`（腮紅）、`brow`（眉毛畫法：`line` 墨線為預設；`block` = 車身色楔形眉骨 + 墨框，內側厚外側薄，仍隨表情傾斜升降）。用個性去選參數，例：毒蠍 = 半垂斜眼 + 壞笑 + 綠眼 + 腮紅；鐵壁堡壘 = 半垂眼 + 平嘴 + 石塊眉。
   * **臉要跟車身一起設計，不能像貼紙**：表情雖由程式即時畫，車身美術要替它留位置並「接住」它——臉部那塊面保持乾淨（只留細紋），必要時在美術裡雕出眼窩（暗色凹陷 + 下緣受光唇邊，位置對齊兩眼中心與 `farScale`），眼皮色取臉周圍的車身色；墨線眉在該材質上顯得突兀時改用 `brow: 'block'`（鐵壁堡壘的石頭眉骨）。不要再在美術裡另畫一條固定眉骨，會和會動的眉毛疊成兩層。
   * **貼地陰影**：每台坦克的 `rig` 最底層畫一個半透明墨色橢圓（寬 = 車身寬 × 0.82、高 7px、不透明度 0.24，中心在車身底線上方 1.5px），隨坡度一起轉。腳少、底盤高的機種（毒蠍）沒有它會看起來浮空；新坦克的造型也要讓腹部 / 履帶貼近地面，腳與輪子要寬、接地。
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
   * **大廳立繪也要有臉**：大廳展示台與選車視窗用 [`lobby/ui/TankPortrait.vue`](../src/features/lobby/ui/TankPortrait.vue)，照 rig 把砲管、車身與待機表情組成一張 SVG（藍隊整組鏡像）；待機表情由 [`engine/faceSvg.ts`](../src/features/battle/engine/faceSvg.ts) 輸出，幾何與 `tankFace.ts` 的待機姿勢一致。**改 `tankFace.ts` 的眼睛、眉毛、嘴巴畫法或 `FaceSpec` 欄位時，`faceSvg.ts` 必須同步修改**，否則大廳與戰場的臉會不一樣。展示台尺寸以最高的機種（含旗子）不頂到台框為準。
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
pnpm run paint:maps   # node tools/assets/paint_map_themes.mjs
```

* **流程**：程式以種子 PRNG 產生 SVG（`tools/assets/map-art/<theme>/*.svg`）→ `@resvg/resvg-js` 點陣化到 `public/assets/maps/<theme>/*.png` → SVGO 壓縮 SVG 原始檔、ImageMagick `mogrify -strip` 去除 PNG metadata（兩者不在 PATH 時自動略過）。輸出固定，重跑結果逐位元組相同。
* **不需要 vtracer / rembg**：這裡沒有點陣來源圖，全部直接以向量繪製；§四的點陣轉向量管線留給外部生圖素材。
* **產出**：視差四層（1024×400，水平無縫：波形用整數週期、跨邊界的形狀以 `wrap()` 平移複製同一份標記）、`terrain_cap` / `terrain_fill` / `bedrock`（128×128 四方向無縫；地層 `strata()` 頂部與底部同色，地表磚以土壤磚為底再疊磚塊/草皮）、`prop<N>`、`hang<N>`，以及共用的 `_common/moon.png`。
* **主題登錄**：`mapRegistry.ts` 的 `THEME_REGISTRY` 記錄每個主題的裝飾數量、懸掛數量與太陽/月亮位置（`kind: 'none'` 表示不畫，例如火山濃煙）；`mapAssetUrl` 回傳 `public/assets/maps/<theme>/` 下的檔案。
* **美術守則**：
  * 扁平向量 + 頂緣亮邊，與 Kenney 風格一致；Phaser 使用 Canvas Renderer，配色必須在繪製時決定（不能執行期 tint）。
  * 深淵地圖的 `hills_near` 必須是雲海 / 霧氣而非地面，否則底部看起來像實地。
  * 中景 (`hills_far`) 的主體要在圖層上半部（約 y < 230），否則會被近景雲海蓋住。
  * resvg 遇到完全落在畫布外的路徑會 panic：紋理磚內的 `wrap()` 一定要傳 `T` 當週期。
  * 地標只畫通用題材（金字塔、柱廊、浮空城堡、拱橋、鐘塔），不得臨摹任何遊戲的地圖或背景。
* **地形紋理（逐張手工）**：三張磚各自代表一種材料，用 `pebble()`（受光石子）、`crumbs()`（土粒）、`rootSystem()`（帶鬚根的根）、`strataSeams()`（地層縫的暗線＋亮線）、`stoneWall()`（不規則石牆，每顆石頭自帶斜角光影並可用 `mark` 加專屬記號）當底層，再疊各主題的手繪記號：

  | 主題 | 地表磚 `terrain_cap` | 土壤磚 `terrain_fill` | 基岩 `bedrock` |
  | :--- | :--- | :--- | :--- |
  | harvest_farm | 割過的麥稈茬、草皮垂葉、黑壤表土＋根系、蚯蚓洞 | 黏土層、礫石透鏡層、田石、細根 | 乾砌田石牆＋地衣、苔蘚、裂縫 |
  | volcano_rift | 繩狀黑玄武岩殼、氣孔、發光裂縫網（光暈＋橘身＋黃芯）、火山灰 | 多孔火山渣、黑曜石碎片、硫磺結晶、一道餘燼裂脈 | 柱狀節理玄武岩，少數節理滲岩漿 |
  | tropic_coast | 白沙風紋、扇貝、錐螺、海玻璃、濕沙線 | 粉紅珊瑚沙交錯層理、珊瑚枝、貝殼碎片 | 象牙色珊瑚石灰岩：孔洞、腦珊瑚紋、珊瑚藻、藤壺 |
  | desert_temple | 流沙下的砂岩方石：層理線、缺角、風蝕坑、積沙 | 交錯層理沙層、白色鈣質結核、陶片 | 斑點花崗岩方石＋原創刻紋、磨損金箔 |
  | sky_meadow | 厚草皮、三葉草、雛菊 / 毛茛、密根層 | 壤土層、灰石子、橡實 | 淡藍灰大理石紋石塊＋苔墊、小蕨 |
  | aurora_night | 積雪（藍影、閃光、垂滴）下的冰磚：氣泡、折射光、冰裂 | 冰河年層、氣泡串、裂紋、冰封石塊 | 晶洞紫水晶簇 |
  | moon_ruins | 裂紋石板＋銀色地衣、縫中苔蘚，下方碎石層 | 夜色土、碎石、斷磚、微光孢子 | 雕月相浮雕的石塊（淡金）＋常春藤 |

  * 地表磚第 0 列就是地面（再往上是空氣，畫不出來），草葉、麥稈只能往下長或畫在帶子裡；地表磚底部要接得上土壤磚頂部（地表磚以土壤磚為底）。
  * 土壤磚上下也會重複：跨上下邊界的記號用 `wrapXY()`；所有在 `wrap` / `wrapXY` 內的繪圖函式**不可再呼叫亂數**，否則接縫兩側的複本會不一樣（亂數先在外面取好）。
  * 記號大小以 1 倍遊戲像素可讀為準（約 2~6 px）；地表磚每 128 px 會沿地形重複一次，獨特物件（陶片、橡實）要小而少，避免排成一列。
  * 檢視：把三張磚依 `BattleScene` 的取樣規則合成剖面（起伏地面、彈坑、浮島、基岩台），連同 2 倍放大圖一起看，逐主題確認後再做下一個。

## 六、坦克與砲彈美術：`tools/assets/paint_units.mjs`

```bash
pnpm run paint:units   # node tools/assets/paint_units.mjs
```

### 風格：Q 版玩具砲兵（致敬經典回合制砲兵遊戲的「可愛坦克」氛圍，造型全部原創）

使用者希望坦克與砲彈走 Q 版可愛砲兵的卡通畫風。**風格（畫風）可以參考，具體造型不能抄**：

* **可以借用的通用畫風元素**：Q 版大頭比例、圓滾滾的車身、超大砲塔、短履帶配少數幾顆大輪子、粗墨線、硬邊卡通陰影、玩具塑膠高光、車身上有表情的臉、鮮豔飽和的陣營色。
* **禁止**：臨摹或描圖任何其他遊戲的坦克造型、配色組合、徽章、名稱與特效圖；不得把對方的截圖或素材放進專案、拿來 vtracer 描圖或當生圖參考圖。新坦克要先想自己的造型主題（例：盾牌騎士、鐘形重甲、水滴跑車），再畫剪影。
* 版權總則見 [05-map-layout-design.md §一](./05-map-layout-design.md)。

### 角色優先畫風（2026-10 起的新標準，毒蠍為第一台、鐵壁堡壘第二台）

使用者比較過「升級 SVG 手繪」與「Blender 3D 卡通算繪」兩種原型後選定 **SVG 手繪**（在 0.4 倍遊戲大小下輪廓與表情最清楚、改起來最快）。舊坦克是「坦克上貼一張臉」的幾何組裝，新畫風改成**整台車就是一隻角色**，其餘五台之後依同樣做法一台一台重畫（先出預覽再定案）：

* **造型**：車身＝頭，大眼長在殼的前方（由 `tankFace.ts` 畫），頭大身小、腳 / 輪短胖；幾乎不用直線與直角，零件都是圓胖有弧度的貝茲曲線。
* **上色**：2~3 階硬邊卡通陰影、左上柔光、底部陰影漸層、玩具塑膠高光；**粗細變化的墨線**（每個零件背後墊一層往右下偏移的墨色剪影，右下粗、左上細）。
* **在設計空間作畫**：約為遊戲像素的 4 倍（毒蠍 `K = 0.26`），曲線與材質記號才放得下，最後整組 `scale(K)` 縮回遊戲像素。
* **工具**：共用零件在 [`tools/assets/cartoon_kit.mjs`](../tools/assets/cartoon_kit.mjs)：`part()`（墨線 + 卡通陰影 + 材質層 + 高光）、`chitin()`（甲殼：凹坑毛孔、上緣髮絲刮痕、下方積塵）、`sheen()`（甲蟲殼油光，screen 疊色）、`chip()`（漆面崩角）、`mud()`（泥點）、`bump()`（凸瘤）、`bristles()`（剛毛）、`glow()`。每台坦克的美術一檔一模組放在 `tools/assets/tanks/<id>.mjs`，由 `paint_units.mjs` 引用。
* **材質逐件手工**（延續上方「紋理逐張手工守則」）：kit 只是底層，每個零件都要再疊該材料專屬的記號。毒蠍的範例：背甲＝重疊甲片的凸邊（後方暗色底切 + 前緣亮邊）+ 三道生長紋 + 一排毛孔；頭殼＝較少較細的毛孔與放射生長紋（給臉留乾淨的面）；腹甲＝淡色橫肋；尾節＝重疊唇邊；腳＝甲片稜線 + 皺褶關節膜 + 剛毛 + 磨亮的鞋尖與泥底；大螯＝凸瘤 + 象牙色齒 + 磨白的鉗尖 + 深色關節窩；毒針＝半透明綠 + 發光芯 + 脈絡 + 氣泡 + 垂落毒滴；毒液瓶＝厚玻璃內緣 + 液面彎月 + 撕邊標籤 + 刮痕 + 滾花瓶蓋；陣營色環＝漆面崩角露出鋼色 + 鉚釘。

### 造型規則（新增坦克 / 砲彈時照做）

| 項目 | 規則 |
| :--- | :--- |
| 比例 | 車身寬約 64~84 px、高約 26~36 px（遊戲畫面像素）；砲塔佔車身寬 40% 以上；底盤高 9~17 px，接地線固定在 svg y = 0 |
| 剪影 | 每台的**行走方式與輪廓**都要不同，不能只換車身花紋：目前為重履帶 + 瞭望塔（鐵壁堡壘）、越野大輪（疾風遊俠）、八足步行（毒蠍）、雪橇滑板（霜鯨）、楔形工程履帶（地鼠工兵）、細長多輪履帶 + 駐鋤 + 尾羽（鷹眼）、寬扁蝸牛腹足履帶 + 背著蓋住後半身的螺旋殼（蝸牛迫擊）。新坦克要再挑一種沒用過的組合 |
| 線條 | 墨線色 `#241e33`，主要輪廓 1.9 px、小零件 1.0~1.4 px，圓角接合 |
| 上色 | `toon()`：深色硬陰影在右下、亮邊在左上、主色在中間（不用柔和漸層）；`gloss()` 白色高光條 + 亮點做出玩具塑膠感 |
| 材質 | 大面積零件用 `skinPart()`（= `toon()` + `finish()`）：底部漸層陰影、固定種子的細顆粒、上緣刮痕，最後補畫墨線。再依機種手繪材質記號（磚縫、甲片高光、焊縫鉚釘鏽痕、羽毛、積雪等），一律放在車身後半，前半留給臉 |
| 招牌色與陣營色（紙娃娃） | 車身主體用該機種的**招牌色**（`SKINS.<id>`，亮 / 主 / 暗 / 深 四階），約佔七成面積，用來認機種；只有幾個**固定的上半部零件**換成陣營色（`TEAMS`：琥珀隊 A `#ffad33`、皇家藍隊 B `#4b8fff`），用來認隊伍，例如圓頂、城垛、小旗、圍巾、大螯、鞍帶、頭盔、羽翼徽、砲管色環。招牌色必須避開兩隊的橘、藍色相（也遵守禁用果青色）；陣營色零件在 0.4 倍遊戲大小下仍要看得出來。鋼鐵零件用中性灰藍，徽章用金色 |
| 個性 | 每台坦克一個一眼可辨的剪影主題與 1~2 個記號（鐵壁堡壘：石灰岩城牆 + 瞭望塔 + 沙包 + 小旗；疾風遊俠：象牙白楔形 + 圍巾 + 護目鏡 + 後噴推進器；毒蠍：紫色分節甲殼 + 大螯 + 毒液罐 + 蠍尾砲管；霜鯨：石墨灰鯨魚 + 積雪 + 白腹喉褶 + 冰晶噴口；地鼠工兵：泥土棕鋼板 + 車頭鑽頭 + 礦工頭盔頭燈；鷹眼：白色鷹羽 + 鳥喙車鼻 + 雷達盤 + 超長磁軌砲；蝸牛迫擊：藍金螺旋殼 + 眼柄大眼 + 金色頸環 + 殼頂橘白小旗） |
| 臉 | 臉由 `tankFace.ts` 即時畫在車身前半部，**不畫進車身圖**；那一塊保持素面（不放徽章、鉚釘，只允許很淡的生長紋），繪製時在註解記下臉中心與砲塔轉軸（svg 座標），換算後寫進 `domain/tanks/<id>.ts` 的 `sprite.face` / `pivotX/pivotY`。**換算**：車身圖底部對齊 rig y = 14，`box` 底邊是 svg y = 1，所以 **rig y = svg y + 13**；`box` 左右對稱時 rig x = svg x（毒蠍第一次就因為沒加 13 把臉放太高） |
| 砲管 | 獨立圖，朝右、轉軸在寬度 8% 處（藏在砲塔內）；粗短圓角、陣營色色環、喇叭口砲口；能量武器可用雙軌 + 發光線圈 |
| 砲彈 | 同樣粗墨線 + 高光，比例誇張（短胖），一眼看出彈種：迫擊彈 = 琥珀胖炸彈 + 束帶 + 尾翼、築壘彈 = 冒草芽的土球、散彈 = 藍白小鋼珠、跳彈 = 自轉圓盤、毒霧彈 = 綠色毒液燒瓶、酸蝕彈 = 綠色倒鉤毒針、凍結彈 = 封著雪花的冰球（自轉）、冰錐彈 = 冰晶錐、鑽地彈 = 黃銅彈身 + 螺旋鑽頭、震波彈 = 橘球 + 震波環（自轉）、狙擊彈 = 細長能量長槍、照明彈 = 紅色信號筒 + 發光彈頭 |

### 技術規格

* 座標以**遊戲畫面像素**撰寫：坦克以 2.5 倍、砲彈以 3 倍點陣化，遊戲中 `sprite.scale` 分別為 `0.4` 與約 `0.45`（砲彈刻意放大一點，飛行中才看得清楚）。
* 車身圖原點 = 底部中央（履帶接地線），面向右；面向左時執行期 `flipX`。
* 粒子：`fx/glow_fire`、`fx/glow_plasma`、`fx/glow_toxic`、`fx/glow_ice`（彩色徑向光暈）、`fx/spark`（火花）、`fx/shockwave`（衝擊波環）。Canvas Renderer 不能 tint，所以**每種顏色各畫一張**，執行期以 `BlendModes.ADD` 疊加。
* 演出分工：砲口光暈 → 彈體 + 脈動光暈（圓形能量彈自轉）→ 每種彈各自的尾焰（`ProjectileFx`：火光 / 毒光 / 冰光、白煙或黑煙、火星、擴散環）→ 爆炸序列（爆炸 / 閃光 / 煙團）+ 光核 + 衝擊波 + 火花。
* 角色優先畫風的坦克可在 `TANKS.<id>` 提供 `barrelArt(team)` 自繪砲管（毒蠍的分節蠍尾毒針），取代 `barrelSvg`。
* 砲管樣式（`barrelSvg` 的 `style`）：`plain`（直管，可加 `rings` 冰環、`spiral` 螺紋、`drips` 冰柱）、`bell`（喇叭口）、`rails`（雙軌 + 線圈 + 制退器）。
* 檢視方式：把車身 + 砲管依 `sprite.pivotX/pivotY` 與 `face` 組合成對照表（各機種 A / B 隊並排，再加一排 0.4 倍遊戲大小、含左右翻面）逐台檢查砲管是否接在砲塔上、臉是否落在車身前方素面區、縮小後隊伍色是否還認得出來。
* 車身圖在遊戲中以**圖片寬度中央**對齊 rig 原點，所以加寬零件（尾羽、駐鋤、大螯）時 `box` 要左右對稱擴張，維持原本的中心，錨點才不會偏。
* 與地圖主題相同：輸出固定可重現，SVGO 壓縮原始檔（`tools/assets/unit-art/`），ImageMagick 去 metadata。

### Blender 3D 路線（蝸牛迫擊 Snailer）

蝸牛現有的遊戲貼圖（`public/assets/units/tanks/snailer_<a|b>_<hull|barrel>.png`、專屬彈 `shell_snailer.png` / `shell_sticky.png`）原本由 Blender 程序化建模腳本產生；該批腳本（`snailer.py`、`snailer_game.py`、`snailer_game_pack.py`、`export_snailer_glb.py`）已於 2026-10 移除，**這批舊圖已整批替換為下一小節的 2D 生圖路線**（Colab TRELLIS.2 的 3D 高模 → 10k qcb GLB 仍保留在 `tools/blender/refs/snailer/`，做為 3D 原型來源，見第八節）。
下面的**換算規格**是遊戲貼圖本身的規格（與 SVG 路線一致），之後用 GLB 算繪新圖時照樣適用；與舊腳本綁定的細節（Freestyle 墨線、螺旋殼幾何）已刪除。

**換算規格**（與 SVG 路線一致，砲彈 / 臉 / 隊伍色規則照舊）：

* 1 個 Blender 單位 = 20 遊戲像素；輸出貼圖 = 50 像素 / 單位（2.5 倍）、`sprite.scale = 0.4`。先以 2 倍超取樣算繪再縮回。
* 車身圖：朝右、底邊 = 履帶接地面、水平以圖片中心為準（Phaser `origin(0.5, 1)`）。**砲管零件不進車身圖**；砲管圖水平朝右，轉軸在寬度 8%、垂直置中（砲管零件繞轉軸放平後再算繪）。
* **臉不畫進貼圖**：`eye_* / pupil_* / glint* / mouth` 在算繪時隱藏，眼柄頂端留金色圓頭，眼睛由 `tankFace.ts` 疊上去。座標換算：`pivotX = (轉軸x − 圖中心x) × 20`、`pivotY = 14 − (轉軸z − 底邊z) × 20`（`HULL_BASE_Y = 14`），臉中心同理。**不要直接讀 Blender 物件的 `location`**：`transform_apply` 會把位置烘進頂點，要用包圍盒中心。
* 標籤：貼圖比一般坦克高時用 `sprite.labelLift`（px）把名牌、血條、狀態圖示、回合箭頭整體抬高；Snailer 為 20。
* **專屬彈體圖是一次性裁切**：`shell_snailer.png`（80×55）、`shell_sticky.png`（56×70）由使用者當時的設計圖 `shells.jpg`（原圖已從 repo 移除）以顏色距離去背（背景是均勻淺灰）、邊緣內縮 1 px 去灰邊、柔化 alpha 後縮小而成，沒有進 `paint_units.mjs`，所以 `pnpm run paint:units` 不會覆蓋它們；遊戲內 `sprite.scale = 0.45`。黏殼彈同時是場上定時彈標記的圖。

### 2D 生圖路線（蝸牛迫擊 Snailer 現行貼圖）

蝸牛現在的車身、砲管與臉都來自**網頁版 Gemini 生圖**（參考圖 `tools/blender/refs/snailer/snailer_tank.jpg`），再由 `tools/sprites2d/` 的腳本切成遊戲貼圖；3D 算繪成寫實貼圖的路線因風格與其他坦克落差大，已不採用。

1. **出圖**（`agy` 由使用者執行，額度耗盡時改走網頁版）：每張圖只生一次，下載**原圖**（不要截圖）。
   * **車身 + 砲管 sheet**：洋紅 `#FF00FF` 純色底；左為朝右側視、**不含砲管與眼睛**的車身，眼柄頂端留光滑圓頭，車身砲口位置只畫一塊**圓形凹座圓盤（無孔、無管）**；右為水平砲管，**後端是球形關節**（球心在砲管中軸上、直徑比圓盤略大，轉動時能完全蓋住圓盤），管身單純錐形、不要伸縮節或寬環箍。曾試過「車身砲座管 + 砲管後環箍」，兩邊圓的大小對不上、轉動時露縫，所以改用球形關節。
   * **表情 sheet**：洋紅底、8 欄 × 4 列：第 1 列近側眼（睜、瞇、半睜、閉、瞪大、開心 ^、受擊 ><、陣亡 X；每格含眼柄頂球），第 2 列遠側眼（同上、無瞳孔），第 3 列瞳孔（普通、小、大、暈眩螺旋），第 4 列嘴與符號。
2. **去背切割**：`python -I tools/sprites2d/slice_sheet.py <sheet> <out> --ball` 洋紅去背（洋紅度 `min(R,B)−G` 設門檻、邊緣去色邊並內縮 1 px）、依空白欄切成車身與砲管、縮放到車身寬 240、藍殼轉紅橘做隊伍 A、右側補透明讓球心落在砲管圖寬度 8%（引擎 `origin(0.08, 0.5)`）。`python -I tools/sprites2d/slice_expr.py <sheet> <out> --ball-px 56` 把表情 sheet 切成 28 個零件，`pack_face_atlas.py <dir> <id>` 打包成 `public/assets/units/tanks/<id>_face.png` 與 `src/features/battle/domain/faceAtlases/<id>.ts`（影格表）。
3. **人工檢查**（一定要做）：在白、深、灰三種背景上看去背邊緣有沒有洋紅色邊；轉軸（球心）與臉座標要用肉眼在遊戲或檢視頁上確認，不要請 AI 決定。
4. **貼圖表情**：`FaceSpec.atlas` 有值時，`TankFace` 用圖集畫眼睛與嘴（眼白 / 眼皮 / 表情用貼圖，**瞳孔貼圖仍由程式移動以追視線**，冷汗與暈眩星星仍用程式畫）；`noMouth: true` 則不畫嘴（蝸牛）。`face.x / y` 是兩個眼柄頂球的中點、`eyeGap` 是兩球中心距，眼睛貼圖會蓋住車身貼圖上的光滑圓頭。沒有 `atlas` 的坦克維持原本的程序化畫法。需要的影格見 `tankFace.ts` 的 `drawTextured`（`eye_*`、`far_wide`、`pupil_normal / dizzy`、`mouth_*`）。大廳靜態臉（`faceSvg.ts`）同樣支援。
5. 蝸牛座標：`pivotX 35.2 / pivotY −34`、`face {x 26.4, y −59.8, eyeGap 12.7}`、`labelLift 32`。
6. **`slice_sheet.py` 的選項**（寄居蟹加入，預設行為與蝸牛相同）：
   * `--accent orange`：sheet 上畫的是**橘色**陣營飾件時用。A 隊維持原圖，B 隊把色相 15°~34°、飽和度 > 200 的橘色轉成藍（珊瑚紅身體色相 < 15°、黃銅 > 42°，不會被轉到）；預設 `--accent blue` 是蝸牛的做法（B 隊維持藍、A 隊藍轉橘）。
   * `--ball-auto`：球關節比砲管本體小時用（`--ball` 假設球直徑約等於砲管高度，寄居蟹的大鉗不符合）。自動偵測球心（砲管左段垂直範圍的第一個峰值，頸部之前），補透明讓球心落在寬度 8%、垂直置中；球心必須能蓋住車身砲座洞，生完圖要看球徑是否夠大。
   * 寄居蟹座標：`pivotX 36.4 / pivotY −22.4`、`face {x 25.2, y −55.2, eyeGap 20.8, eyeSize 7}`、`labelLift 15`；眼球直徑參數 `slice_expr.py --ball-px` 要用**車身貼圖眼柄頂球直徑的 2 倍**（因為圖集 `scale 0.2`、車身 `scale 0.4`；寄居蟹用 70）。
   * 專屬彈體貼圖（`shell_hermit_*.png`）不經這支腳本：同一個洋紅去背公式裁出左右兩顆、縮到寬 76 / 78（`sprite.scale 0.45`），直接放進 `public/assets/units/projectiles/`；`registry.test.ts` 會檢查 `sprite.key` 對應的檔案存在。
7. **海馬的做法與表情 sheet 版面不同時的切法**（2026-10-25）：
   * 車身 + 砲管 sheet：參考圖是 3/4 視角的整隻海馬，提示要求「純側視、朝右、單側履帶艙、無吻部無眼睛、吻部處只畫一塊圓形凹座；吻部另成一件、後端球關節」。切割用 `slice_sheet.py <sheet> <out> --id seahorse --hull-w 150 --accent blue --ball-auto`（海馬車身很高，寬 150 時高約 310，`sprite.scale` 用 0.34）。`--accent blue`：A 隊藍色轉銅橘、B 隊保留原圖藍色。腳本印出的 `socket_tex` 猜值不準（會落在身體中段），轉軸要在車身圖上畫格線量凹座中心（海馬是 (137, 70)），再代 `pivotX = (tx − W/2) × scale`、`pivotY = 14 − (H − ty) × scale`。
   * 表情 sheet：Gemini 沒照 8 欄 × 4 列，給的是 6 欄 × 4 列、每個表情「近側眼 + 遠側眼」成對，且第 3 列是完整小眼球（不是只有瞳孔）。`slice_expr.py` 只吃 8 × 4，所以海馬用一支一次性腳本依像素框裁：近側眼取每對的左邊一顆；`eye_half` / `eye_sleepy` 共用半睜、`eye_hurt` 用生氣眼、`eye_dead` 用 X、`eye_closed` 用眼皮蓋下、`eye_happy` 用 ⌒；`far_wide` 把大眼的瞳孔塗白（引擎用它當白眼球再疊瞳孔）；`pupil_normal` 從小眼球裁出圓形瞳孔；`pupil_dizzy` 用程式畫螺旋。眼睛各零件寬 64，再用 `pack_face_atlas.py <dir> seahorse` 打包。海馬沒有嘴（`noMouth`）。
   * **圖集 `scale` 手動改成 0.14**（預設 0.2）：眼睛縮小成約 9 px 才放得進海馬的頭；**重跑 `pack_face_atlas.py` 會把它改回 0.2**，要再帶 `--scale 0.14` 或手動改。海馬是側面像，`FaceSpec.singleEye: true` 只畫近側一顆眼（位置在 `face.x / y`，`eyeGap` 不再使用）。
   * 彈體 sheet：泡泡與墨汁是半透明與帶尾巴的形狀，同一個洋紅去背公式仍可用；泡泡縮到寬 60、墨汁雷縮到寬 92，放進 `public/assets/units/projectiles/`。
8. **砲管與車身接縫（海馬教訓，2026-10-25）**：海馬車身頭部帶封死的吻部殘樁、砲管另有圓球與金環，兩件各自完整，砲管抬起時接縫張開、看起來像分離。之後生新坦克改走「先生整台基準圖，再用基準圖拆成車身（砲口畫成開口的圓環護套）與砲管（底端素圓柱、多留約 20% 藏在護套後）」，砲管轉 14° / 45° / 80° 合成檢查通過才定轉軸。prompt 範本與驗收清單見 [`tools/sprites2d/prompt_tank_parts.md`](../tools/sprites2d/prompt_tank_parts.md)。海馬現有素材尚未依此重做（待辦）。
9. **坦克動畫設計規範（2026-10-25 起，新坦克與全面重製都照此設計）**：動畫一律走「分層零件 + 固定錨點 + 程式補間」，**不逐幀生圖**（AI 逐幀輪廓與配色會微飄、播放會閃，且機種 × 隊色 × 幀數素材量乘開）。
   * **分層**：車身（不含會動的東西）／砲管（底端素圓柱，裝飾只在砲口）／肢體配件（尾巴、鰭、觸角、旗子、煙囪等，每機種 1～3 件）／臉（沿用表情圖集的幀替換）。每個零件獨立 PNG，並附錨點（掛在車身上的位置）與轉軸。
   * **零件重疊**：肢體根部、砲管底端都要多畫並藏在車身後面，擺動或抬砲時才不露縫；被遮住的部分請 AI 畫完整，不要只畫露出的部分。
   * **動作清單先定再生圖**：每個機種先決定待機、移動、開火、受擊、擊毀各用哪種手法，再決定要拆哪些零件。共用補間（待機浮動、開火後座力、移動起伏與傾斜、受擊閃白抖動、擊毀碎裂掉落）全機種通用、不生圖；個性化動作每機種限 1～2 個（如海馬尾巴捲動、蝸牛觸角轉動），用肢體零件的旋轉 / 縮放補間做。
   * **資料驅動**：錨點與補間參數寫在 `defineTank` 的藍圖資料裡，不為單一坦克另寫動畫程式（引擎支援尚未實作，實作前先改 `TankBlueprint.sprite` 結構並同步文件）。
   * **隊色**：同一張基準圖同時產出 A、B 兩隊配色，或只生一份由程式 tint 換隊色，不要分開各生一次（會不一致）。
   * **驗收腳本**：重製前先寫合成腳本（讀零件 + 錨點，輸出砲管 14° / 45° / 80°、肢體擺到極端角度的對照圖）；沒通過的素材不進 repo。
   * **進行順序**：先改引擎支援零件層、錨點與共用補間（用現有素材先跑通待機與後座力）→ 選海馬完整走一遍新流程當範本 → 範本通過後再一次一台重製其他機種。肢體零件的 prompt 見 [`tools/sprites2d/prompt_tank_parts.md`](../tools/sprites2d/prompt_tank_parts.md) 步驟 4。

### 新增坦克零件切割（Bumble / Quillback / Hopper，2026-10-26）

三台都走「基準圖 → 零件 sheet → 表情 sheet → 砲彈 sheet」，prompt 在 `tools/assets/agy-prompts/new-tanks-bumble-quillback-hopper.md`，原圖放 `tools/blender/refs/<id>/<id>_{base,parts,expr,shells}.*`（agy 輸出雖是 `.png` 但內容是 JPEG，Pillow 依內容讀取，不影響）。

1. **零件 sheet 切割**：`python -I tools/sprites2d/slice_parts.py <sheet> <out> --id <id> --hull-w <寬> --accent orange --trim-boxes "<x0,y0,x1,y1;…>" --collar cx,cy,hw,hh [--barrel-scale sx,sy] [--hue-max 34] [--min-v 125~175] [--part-scale 零件=倍率,…]`。
   * 新選項：`--hue-max`（陣營橘的色相上限，預設 40；黃色身體的金黃陰影會被誤轉成藍，Bumble / Hopper 用 34）、`--min-v`（陣營橘的最低明度，預設 60；棕色條紋 / 斑點會被誤轉，Bumble 125、Hopper 175）、`--part-scale`（切完後個別縮放零件，例如 Hopper 後腿 `flag=0.5`）。
   * **5 件模式**：連通區塊有 5 個時，車身最大、砲管最寬扁，其餘依由左到右為 `flag` / `lid` / `extra`（Hopper）。
   * 輸出的零件檔名固定是 `flag` / `lid` / `extra`，**放進 `public/assets/units/tanks/` 前要改成有意義的零件 id**：Bumble `flag→antenna`、`lid→wing`；Quillback `flag→spikes`、`lid→nose`；Hopper `flag→leg`（`lid` / `extra` 的喉囊不使用，不放進專案）。
2. **砲管與護套**：這批 sheet 的砲管粗度與護套孔洞對不上（砲管比洞粗），用 `--barrel-scale 1,0.72~0.75`（Hopper 另縮長度 `0.55,0.75`）壓扁到接近洞口；護套前圈（`collar`，`z: overBarrel`）蓋在砲管上，砲管底端藏在環後面。Bumble 砲管的棕色條紋與車身棕色條紋同色，會融進車身，所以先用 `tools/sprites2d/bumble_prep.py` 把砲管範圍的棕色改成橘（陣營色，B 隊會轉藍）再切。
3. **合成驗收與錨點**：`composite_check.py` 新增 `--flag-origin x,y`、`--lid-origin x,y`（零件的原點比例，預設 0.18,1 與 0.5,1，要與 `TankPart.origin` 一致）；`--icon-out` 會同時烘縮圖，要兩隊各跑一次（`--team a|b`）。零件錨點（刺蝟尖刺扇原點 [1,1] 貼車身背弧、跳蛙後腿 [0.5,1] 踩地線）都用肉眼在對照圖上量。
4. **砲彈切割**：`python -I tools/sprites2d/slice_shells.py <sheet> public/assets/units/projectiles <名稱>:<寬> …`，洋紅去背後依連通區塊由左到右切開並縮放（帶尾巴 / 小蜜蜂點的彈會被併入最近的大塊），名稱就是 `projectile.visual.sprite.key`。
5. **表情**：這批尚未做圖集。agy 的表情 sheet（Bumble / Quillback）每格墊了粉紅 / 黃色底磚（不是純洋紅），`slice_expr.py` 的洋紅去背去不掉；Gemini 網頁版的 Hopper 表情 sheet 則是成對眼睛、淺粉色格線、第 3 列瞳孔排法不同。要做圖集得重生（prompt 要求「整張純洋紅、不要格線與底磚」）或逐格手動去背，沿用海馬的一次性像素框裁切法，見上方 2D 生圖路線第 7 點。

## 七、大廳與 HUD 素材（已改為 agy 生圖，舊程序化紋理已移除）

2026-10 起，大廳、房間與戰鬥 HUD 的 UI 素材不再由程式繪製（舊的 `tools/assets/paint_ui.mjs` 與 `src/assets/ui/*.svg` 紋理、`.toon-*` 元件類別已刪除），改走：

1. 先把整批需求設計好、蒐集齊，再交給 `agy`（使用者執行）一次生一張洋紅底 sprite sheet（`tools/assets/agy-ui/*.prompt.txt`，格線規格與驗收見 [`07-ui-redesign-spec.md`](./07-ui-redesign-spec.md) §四；agy 作業模式見本文 §八：使用者執行、Agent 只寫 prompt 文件、每張圖只生一次）。
2. `python -I tools/assets/agy-ui/slice_ui.py [--preview <dir>]`：洋紅轉軟 alpha（連柔影一起去）、依連通區塊切件並命名，輸出到 `public/assets/ui2/<sheet>/<name>.png` 與 `manifest.json`；個別素材的修色（珊瑚按下態、選中光暈、計時環預畫弧線、雷達青色轉藍）都寫在腳本裡，重切會自動套用。
3. 檢視：腳本的 `--preview` 會輸出白 / 深 / 灰三種背景的檢視圖，檢查洋紅邊與風格一致性；不合格由人決定是否重生。

UI 元件見 `src/shared/ui/`，規格見 `docs/07`。

## 八、AI 生圖 + Colab TRELLIS.2 3D 原型標準流程 (AI Image to 3D Pipeline)

為維持「一檔一模組」與高效率的原型開發，新坦克的立體原型採「**AI 生圖 → Colab 上的 TRELLIS.2 批次生成帶貼圖高模 → 本機降面烘焙 → 納入 Repo 待作業**」標準工作流（舊的 Modly / TripoSG 素模流程已於 2026-10 廢棄，不再使用）：

> **關卡互動與逐步確認守則**：建立坦克時，每個關卡（階段）Agent 每次僅能提供 2~3 種具體建議或方向供使用者挑選或微調，禁止一次輸出全部流程與所有細節；必須在使用者確認該階段決策後，才能推進到下一關。

1. **主題與機制討論**：
   - 確定生物 / 載具主題、戰鬥定位、射擊樣式與專屬砲彈特性（遵守 `docs/06` 平衡預算與數值四維度）。
2. **AI 生圖規範（兩張圖）**：
   - **第 1 張：坦克本體**（`tools/blender/refs/<id>/<id>_tank.jpg`）：
     - 採 3/4 視角、大頭 Q 版比例、粗墨線或圓潤硬邊、淺灰單色背景（`#e0e0e0`）。
     - 單一車體、嚴禁多視角拼貼、無複雜地面陰影與文字浮水印，確保 3D 擴散演算法能精確重建幾何體。
   - **第 2 張：砲彈本體**（`tools/blender/refs/<id>/<id>_projectile.jpg`）：
     - 獨立單一投射物特寫、3/4 視角、高對比淺灰純色背景。
   - **砲管設計要「可幾何分割」**：遊戲的砲管是獨立旋轉的圖，而 TRELLIS 輸出的是單一 mesh，所以要在生成後依座標把砲管切出來。設計時讓砲管是從車身伸出、朝前、與車身有明顯分界的獨立圓筒；**生成時不要把砲管與車身分開生成**（TRELLIS 每次都把輸出縮放到同一個方框，兩份模型的相對大小與位置會丟失，之後要手動對齊）。備案：實際切不乾淨時，才改畫「無砲管車身」與「單獨砲管」兩張圖分別生成、在 Blender 手動組合。（GLB 切割成精靈圖的實驗腳本已移除；蝸牛改走上面的 2D 生圖路線，車身與砲管本來就分開畫。）
   - **砲彈不生成 GLB**：砲彈在遊戲裡很小且持續旋轉，沿用 2D 做法 —— 直接從 `<id>_projectile.jpg` 以顏色距離去背、縮小成彈體圖（作法見 §六「專屬彈體圖是一次性裁切」）。因此 `tools/colab/stage.sh` 只放 `<id>_tank.jpg`；批次筆記本會把資料夾內所有圖片都轉成 3D，不要把 `_projectile.jpg` 放進 Colab 作業資料夾。
   - **生圖用 agy（Antigravity CLI），由使用者執行**：Agent 只寫 prompt 文件，不呼叫 agy（見下方作業模式）。使用者端指令範例：`agy -p "請讀 <prompt 文件> 並依序生成" --mode accept-edits`，文件中須指定絕對輸出路徑與檔名。
     - 提示須包含：本節的視角 / 背景 / 單一物件規範、色彩限制（嚴禁濁青色）、與 `refs/beetle`、`refs/seahorse` 既有 `*_tank.jpg` 對齊的畫風（光滑 3D 渲染卡通質感、蒸汽龐克黃銅鉚釘、單顆大眼、車頭朝左），以及「不得使用任何現有遊戲的美術」。
     - 概念階段要多方案時，在 prompt 文件中明確列出每一張各自不同方向的圖（不是同一張重複生成），使用者挑選後，選定者再改名為 `<id>_tank.jpg`。
     - 不要加 `--dangerously-skip-permissions`（會被權限分類器拒絕）；以背景方式執行，產生期間 `-p` 不會顯示進度，圖出現在 `concepts/` 後再給使用者看。
     - **agy 作業模式（使用者 2026-10-26 起固定，取代先前「Agent 代為呼叫 agy」的做法）**：① **Agent 絕不主動呼叫 agy**；② Agent 把給 agy 的 prompt 寫成文件（放 `tools/assets/agy-prompts/<主題>.md`，文件內可列多張圖，每張圖各有輸出檔名、尺寸與格線規格），由使用者叫 agy 去讀、執行；③ **每張圖只生一次**，文件內不得重複列出相同的圖（額度有限，不用「多生幾張挑最好」的寫法）；④ agy 完成後，Agent 指定圖片要放的路徑，由使用者叫 agy 搬過去（或自行放入），Agent 再接手去背、切割與驗收；⑤ 成品不合格時由使用者決定是否重生，Agent 只修改 prompt 文件。舊鐵則（同時只跑一個、重用 session、失敗就停手）改由使用者端遵守，prompt 文件開頭註明「依序執行、同一個 session」即可。
     - 場景雲層（`clouds_far`）的做法：每張地圖請 agy 生一張洋紅底的元素圖集，再用 `tools/assets/agy_clouds_compose.py` 去背並錯落排成 1024x400 可銜接的雲層（`--strict` 用於圖內有粉紅/紫色時，`--tall-first` 用於高大元素，`--merge N` 用於零散小點）。
3. **Colab 上的 TRELLIS.2 生成帶貼圖高模**（使用者自己操作，Agent 不在本機生成）：
   1. 使用者把參考圖（第 2 步的 `<id>_tank.jpg`）**上傳到 Google Drive**。
   2. 使用者在 Colab（L4 / A100，需 24GB 以上顯存；左側「密鑰」要有 `HF_TOKEN`）執行 [`tools/colab/trellis2_batch_folder.ipynb`](../tools/colab/trellis2_batch_folder.ipynb)：把 Drive 資料夾內**所有圖片**依序轉成 `<檔名>.glb`（約 100 萬面、4096 貼圖的高模）存回同一資料夾；`TARGETS` 預設 `[10000]`，會多輸出一份 Colab 內直接降到 1 萬面的 `<檔名>_10000.glb`（只當對照用，正式以第 4 步為準），設 `[]` 則只輸出高模。單張版是 [`trellis2_image_to_glb.ipynb`](../tools/colab/trellis2_image_to_glb.ipynb)。
   3. 使用者把高模 GLB **從 Drive 下載到本機**，放進 `tools/blender/refs/<id>/`，再由 Agent 接手第 4 步的降面（高模約 36MB，不能直接進遊戲；只想存放省空間可用 `gltfpack -cc` 做 meshopt 壓縮，約 9.8MB，Blender 5.2 可直接匯入，降面流程實測可照跑）。
   - Agent 協助時不要假設能直接存取 Colab 或 Drive；需要使用者把下載好的 GLB 放到上述資料夾後再繼續。
3.5. **作業流程（使用者與 Agent 分工，2026-10 起固定如此）**：
   1. **Agent 備料**：`bash tools/colab/stage.sh`，把 `refs/<id>/` 裡**還沒有高模**的 `<id>_tank.jpg`（只放坦克圖，不放 `_projectile.jpg`，因為批次筆記本會把資料夾內所有圖片都轉成 3D）連同 `trellis2_batch_folder.ipynb` **複製**到 `tools/colab/inbox/`（已列入 `.gitignore`，不進版控）；`refs/` 的設計圖原地保留。使用者把整個 `inbox/` 上傳 Drive、在 Colab 跑筆記本。
   2. **使用者做完，指定放有 GLB 的資料夾**，Agent 執行 `bash tools/colab/collect.sh <資料夾>`：把 `<id>_tank.glb` 搬回 `refs/<id>/`（`refs/<id>/` 不存在、或目的地已有同名高模就略過不覆蓋；Colab 順手輸出的 `<id>_tank_<面數>.glb` 對照檔不搬）。可先加 `--dry` 預覽。
   3. **Agent 補 10k**：`bash tools/blender/lowpoly/run_missing.sh`，替所有「有高模、還沒有 `<id>_tank_10000.glb`」的坦克產出 10k qcb；沒有 `boost.txt` 的坦克會提示（見下方）。

4. **降面**：
   - **最終交付規格：每台坦克的遊戲用模型 = 10k qcb**（`refs/<id>/<id>_tank_10000.glb`，約 1 萬三角面、2048 貼圖，含顏色、金屬粗糙度 ORM、切線空間法線）。
     - **qcb 的定義**（「qcb」是 2026-10 降面研究時的版本代號，字母含意為依參數名推測：QEC + 貼圖對比 `cgain` + boost）：焊接頂點後做 MeshLab Quadric Edge Collapse，並用**逐頂點權重**分配面數預算 —— 貼圖對比高處（金色飾帶、鉚釘邊緣）與細薄結構（兩者由 `weights.py` 依模型自動算出，參數 `cgain=2 tcap=2`），再加上**眼睛、砲口這類小而圓、最影響觀感的特徵**（球形區域重要度 ×4，即 boost）。只有前兩項、沒有 boost 的是 qu 版，品質略差（蝸牛 10k 的 SSIM 0.83 vs 0.85）。
     - **boost 座標是每台坦克各自的**：存成 `refs/<id>/boost.txt`（一行：`x,y,z,r,f;x,y,z,r,f`，座標為 Blender 匯入後的 Z-up、車頭朝 -Y，r 為半徑、f 為倍數），`run.sh` / `run_missing.sh` 會自動讀取；沒有這個檔就只能得到 qu 版。新坦克的高模進來後，Agent 要先找出眼睛與砲口的座標、請使用者確認後寫入 `boost.txt`，再補 10k。蝸牛的範例見 `refs/snailer/boost.txt`。
   - **用 `tools/blender/lowpoly/run.sh`（2026-10 驗證的標準做法）**：
     ```bash
     bash tools/blender/lowpoly/setup_venv.sh                      # 一次：建立 .venv（uv + Python 3.12 + pymeshlab）
     bash tools/blender/lowpoly/run.sh tools/blender/refs/<id>/<id>_tank.glb 10000   # 輸出 <id>_tank_10000.glb（同資料夾）
     ```
     流程：焊接頂點 → MeshLab Quadric Edge Collapse（兩段降、保持法線 / 邊界、貼圖對比與細薄結構加權）→ Smart UV 重拆 → Cycles 烘焙顏色、金屬粗糙度（ORM）、切線空間法線（OpenGL Y+，glTF 標準）。全程約 1 分鐘；蝸牛 10k 比舊的 Blender Collapse 平均幾何誤差減半（0.17% vs 0.36%）、算圖 SSIM 0.85 vs 0.65。
     - **為什麼不能直接用 Blender 的 Decimate（Collapse）對成品 GLB 降面**：TRELLIS 的 GLB 在 UV 接縫處把頂點拆開（蝸牛 645,893 個頂點，焊接後只剩 481,845），Collapse 把接縫當開放邊，網格會碎；而降完面若直接重拆 UV，原貼圖會全毀，所以必須「焊接 → 降面 → 重拆 UV → 從高模烘焙」。
     - **TRELLIS 高模是雙層薄殼**（壁厚約 0.002，約 53% 的面是外面看不到的內層），所以需要「乾淨單層表面」的 Voxel Remesh、QuadriFlow、Instant Meshes 全部失敗，不要再試；MeshLab QEC 對雙層殼不敏感。
     - **分部件預算**：見上方 qcb 定義；也可臨時用環境變數 `BOOST="x,y,z,r,f;..."` 覆蓋 `boost.txt`。
     - 烘焙參數：2048 貼圖、cage 外擴 0.015、最遠射線 0.05。實測加大反而變差（5k 的 SSIM 0.76 → 0.72～0.74），1024 貼圖特寫會明顯變糊。
     - **尚未驗證**：只在蝸牛一台驗證；Colab 內直接降面（`TARGETS`）的品質沒有與這套做法比較過，以本機這套為準。
   - **品質人工確認守則（重要）**：
     - 降面後**必須由使用者檢視輸出模型**，確認外觀輪廓、特徵細節沒有被過度壓扁或失真破面。
     - 若細節嚴重流失，調高目標面數，或對眼睛 / 砲口等小而圓的特徵設 `BOOST` 加權後重跑，直到品質與面數取得平衡。
   - `refs/<id>/` 只保留設計圖、高模與最終降面成品（例如 `<id>_tank_10000.glb`），中間檔（`.blend`、烘焙貼圖、實驗腳本、其他面數的測試版）不留，需要時由 `run.sh` 重新產生。
5. **模型烘焙與遊戲實機驗證（Playwright E2E 檢驗守則）**：
   - 烘焙貼圖／產生 2.5D Sprite Sheet 並整合進遊戲後，**Agent 必須實際上透過 Playwright E2E 截圖檢視方式，實際載入遊戲畫面檢查成品**（例如 `viewer.html`、大廳展示台「我的戰車」或戰鬥畫面實際運作狀態），嚴禁未經 E2E 截圖自檢就交付。
   - **貼圖烘焙常見踩坑與根因防範 (Post-mortem & Best Practices)**：
     - **自定義 Shader 與 GLTF 不相容導致全白（如 Snailer 案例）**：
       - *根因*：模型材質若使用 Blender 專屬的自定義 Toon Shader（含 `Emission`、`ShaderToRGB` 等非標準節點），在 GLTF 匯出時無法自動轉為標準 PBR `BaseColor`，導致在 Three.js / WebGL 檢視器中直接呈現全白或自發光白模。
       - *解決方案*：必須將幾何體的所有顏色、眼球高光、砲管與車身紋理，在 Blender 內烘焙成標準 PBR 漫反射貼圖（`Base Color Texture`），並接回標準 `Principled BSDF` 導出，確保瀏覽器環境精確還原。
     - **模型自身座標軸向未對齊（如 Seahorse 案例）**：
       - *根因*：AI / 擴散演算法重建 3D 模型時，產生的網格朝向可能旋轉了 90°（例如車頭砲管朝向 `-X` 而非標準的 `-Y`）。若投影烘焙腳本預設以標準朝向前進投射相機，相機會直接從「側腹肋排」斜打過去，導致正面的眼睛花紋貼到噴射口與腹部側面，造成不可挽回的嚴重錯位與扭曲。
       - *解決方案*：在進行任何 UV 投影或烘焙前，**必須先檢驗頂點邊界座標**，確認車頭前進方向嚴格對齊 `-Y`、對稱軸對齊 `X=0`、垂直對齊 `+Z`。若軸向偏移，先在 Blender 內旋轉並強制套用旋轉變換（`bpy.ops.object.transform_apply(rotation=True)`），再進行雙向對齊烘焙。
   - 檢查重點包括：**雙眼與五官幾何是否嚴格對齊眼窩**、輪廓描邊是否有黑邊或鋸齒、背面與側面是否有貼圖拉扯破面、砲管與車身中心軸是否對齊、實機光影與縮放尺寸是否與既有坦克協調，確認無誤後才算完成交付。
