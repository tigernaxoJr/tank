# 系統架構與 Subagent 派發規範 (02-architecture-and-subagent-guide.md)

本專案為 **Tank Artillery Web**（基於 Rust Wasm + Vue 3 + TypeScript + WebRTC P2P 的回合制拋物線坦克對戰遊戲）。
為了讓專案易於維護，且能穩定拆解並派發給**較低階或輕量級的 Subagent（如 `flash` / `flash_lite`）**獨立實作，本專案嚴格採用 **VSA (Vertical Slice Architecture，垂直切片架構)** 搭配 **務實 DDD (Pragmatic Domain-Driven Design)**。

---

## 一、 核心設計原則

### 1. VSA 垂直切片隔離 (Vertical Slice Isolation)
* **以「業務功能切片 (Feature Slice)」為第一級目錄邊界**，而非傳統的技術水平分層（禁止在頂層建立全域的 `controllers/`、`models/`、`services/`、`views/`）。
* **高內聚、零跨切片私自耦合**：
  * 每個 Slice（例如 `src/features/battle`、`src/features/lobby`、`src/features/audio` 或 Rust 端的 `terrain`、`ballistics`）封裝該功能所需的完整邏輯。
  * **嚴禁跨 Slice 直接引用內部檔案**（例如禁止從 `features/lobby/ui/LobbyPanel.vue` 直接 import `features/battle/domain/battleState.ts`）。
  * 跨 Slice 的共享型別、領域事件與通訊協議，一律只能透過 `src/shared/kernel/types.ts` 或 Slice 根目錄的 `index.ts` (Public API) 進行互動。

### 2. 務實 DDD 分層 (Pragmatic DDD — 依複雜度彈性縮放)
我們重視 DDD 的「語意邊界、純領域邏輯與基礎設施解耦」，但**堅決反對教條式過度拆分（No Over-engineering / YAGNI）**：

| 模組規模 | 判定標準 | 目錄與檔案結構規範 | 專案實例 |
| :--- | :--- | :--- | :--- |
| **中大型 Slice** | 包含狀態機、複雜業務規則、外部 I/O (WebRTC / Canvas / Wasm) | 拆分為 `domain/` (純實體、值物件、規則)、`application/` (Use Case 協調)、`infra/` (外部 Adapter)、`ui/` (Vue 元件) | `src/features/battle/`、`src/features/lobby/` |
| **小型 Slice** | 單一職責、規則單純、無複雜跨層轉換（通常 < 150 行） | **禁止拆分多個子資料夾與空殼介面**。直接以單一 `index.ts` 或單一 `.rs` 檔內聚完成，內部用型別與純函數維持 DDD 語意即可 | `src/features/audio/index.ts`、`crates/tank-core/src/prng.rs` |

---

## 二、 專案目錄結構總覽

```text
tank/
├── docs/                         # 專案文件中心（依序號與主題分類）
│   ├── README.md                 # 文件索引與命名規範
│   ├── 01-project-proposal.md    # 產品目標、技術選型與里程碑規劃
│   ├── 02-architecture-and-subagent-guide.md # VSA + 務實 DDD 架構與 Subagent 派發規範
│   ├── 03-execution-plan.md      # 拆解至單一 Slice 的 Subagent 執行計畫 (Work Packages)
│   └── 04-art-asset-pipeline.md  # CC0 美術素材來源、烘焙腳本與戰場渲染規則
├── package.json                  # 前端依賴與構建腳本
├── vite.config.ts                # Vite + Vue 3 + Tailwind v4 設定
├── crates/
│   └── tank-core/                # [Rust Wasm Engine] 確定性物理與地形核心
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs            # Wasm 匯出入口
│           ├── prng.rs           # [小型 Slice] 確定性隨機種子 (單檔實作)
│           ├── terrain.rs        # [核心 Slice] 地形遮罩、圓形挖坑、DirtyRect、FNV-1a Hash
│           ├── ballistics.rs     # [核心 Slice] 千分位定點數拋物線步進與碰撞檢測
│           └── combat.rs         # [小型 Slice] 爆炸整數距離衰減傷害計算 (單檔實作)
└── src/
    ├── App.vue                   # 頂層佈局組裝 (僅組合各 Slice Public UI)
    ├── main.ts                   # 應用掛載入口
    ├── shared/                   # [Shared Kernel] 跨切片共享契約
    │   ├── kernel/
    │   │   └── types.ts          # P2P 協議訊息、指令 (FireActionCommand) 與共用基礎型別
    │   └── wasm/
    │       └── index.ts          # Rust Wasm 介面契約 (Port) 與測試替身邊界
    └── features/                 # [VSA Feature Slices]
        ├── battle/               # [中大型 Slice] 回合戰鬥、Phaser 3 引擎與三大模組化註冊表
        │   ├── domain/           # 純領域規則與三大模組化基底引擎：
        │   │   ├── battleState.ts        # 1v1~5v5 交錯回合狀態機与勝負判定
        │   │   ├── tankRegistry.ts       # [模組化坦克基底] 2.5D 戰車屬性與精靈圖錨點註冊表
        │   │   ├── mapRegistry.ts        # [模組化地圖基底] 跨螢幕大地图尺寸、波形與無縫材質註冊表
        │   │   └── projectileRegistry.ts # [模組化砲彈基底] 投籃節奏飛行時間、重力/風阻與尾焰特效註冊表
        │   ├── application/      # 兩階段開火編排 (prepareFireTrajectory -> 飛行演出 -> commitFireImpact)
        │   ├── engine/           # Phaser 3 BattleScene (鏡頭平滑追焦、2.5D 容器、粒子與地形 CanvasTexture)
        │   ├── ui/               # BattleArena、BattleCanvas (Phaser 橋接 + 雷達小地圖)、BattleHud
        │   └── index.ts          # Battle Slice 唯一對外匯出入口
        ├── lobby/                # [中型 Slice] PeerJS 配對大廳與房間狀態
        │   ├── domain/           # 房號產生規則、連線狀態機
        │   ├── infra/            # PeerJS WebRTC DataChannel 封裝
        │   ├── ui/               # 大廳連線介面
        │   └── index.ts          # Lobby Slice 唯一對外匯出入口
        └── audio/                # [小型 Slice] Web Audio / jsfxr 音效控制 (務實單檔，不拆子層)
            └── index.ts
```

---

## 三、 針對低階 Subagent 的任務派發設計指南 (Subagent Dispatch Guide)

本架構專為「主 Agent (Orchestrator) 拆解任務 → 派發給低階 Subagent 獨立執行」而設計。主 Agent 在派發任務時，請遵守以下規則以確保低階模型高成功率：

### 1. 單次派發只鎖定單一 Slice (Single-Slice Context Bounding)
低階 Subagent 在面對跨越多個模組與多層抽象時容易產生幻覺或改壞其他模組。派發時應限制其讀寫範圍：
* **Rust 演算法任務**：只給定 `crates/tank-core/src/<slice>.rs`，要求補齊純函數與 `#[cfg(test)]` 單元測試，驗收指令固定為 `cargo test --manifest-path crates/tank-core/Cargo.toml`。
* **前端 UI / 狀態任務**：只給定 `src/features/<slice>/` 與 `src/shared/kernel/types.ts`，驗收指令固定為 `npx vue-tsc -b`。

### 2. 標準 Subagent Prompt 模板
派發給 Subagent 時，請直接複製並填入以下結構：

```markdown
### 任務目標 (Task)
在 `<目標 Slice 路徑>` 實作 `<具體功能名稱>`。

### 邊界與架構限制 (Constraints)
1. **VSA 隔離**：你只能新增或修改 `<目標 Slice 路徑>` 下的檔案，嚴禁修改其他 `features/*` 內部檔案。
2. **務實 DDD**：
   - 若目標為小型模組（< 150 行），請保持在單一檔案內完成，不要新增多餘的 interface、factory 或子資料夾。
   - 若目標為 `battle` 或 `lobby` 的 `domain/`，請保持純函數與純型別，禁止在 `domain/` 內引入 DOM、`window`、Vue `ref` 或 `peerjs`。
3. **跨模組契約**：所有跨模組資料格式以 `src/shared/kernel/types.ts` 為準。

### 驗收標準 (Verification)
完成後請執行 `<cargo test 或 npx vue-tsc -b>` 確保零錯誤。
```

### 3. 各開發階段 (Milestones) 建議派發清單
* **Task 1-A (Rust Terrain)**：交由 Subagent 擴充 `crates/tank-core/src/terrain.rs`（加入法向量計算與像素緩衝區指標輸出）。
* **Task 1-B (Rust Ballistics)**：交由 Subagent 擴充 `crates/tank-core/src/ballistics.rs`（支援預覽軌跡點陣列輸出）。
* **Task 2-A (Battle HUD & Canvas)**：交由 Subagent 在 `src/features/battle/ui/` 實作雙層 Canvas 與蓄力條，僅依賴 `TankCorePort` 介面。
* **Task 3-A (Lobby PeerJS)**：交由 Subagent 在 `src/features/lobby/infra/peerAdapter.ts` 實作 `PeerTransportPort`。
* **Task 4-A (Audio Synth)**：交由 Subagent 在單檔 `src/features/audio/index.ts` 內用原生 Web Audio API 實作 4 種合成音效。

---

## 四、 遊戲基底引擎與擴充設計守則 (Modular Game Engine Rules)

為確保日後新增戰車、地圖或砲彈特效時零重構成本，所有擴充一律遵循以下「**資料驅動註冊表 (Registry Pattern)**」與演出節奏規範：

1. **三大模組化註冊表（單一修改點原則）**：
   * **美術一律使用 CC0 素材並經烘焙腳本產出**：詳見 [`04-art-asset-pipeline.md`](./04-art-asset-pipeline.md)。新增素材須同步更新根目錄 [`CREDITS.md`](../CREDITS.md)。
   * **新增/修改坦克**：依 [04 §六](./04-art-asset-pipeline.md) 的 Q 版風格在 [`tools/assets/paint_units.mjs`](../tools/assets/paint_units.mjs) 的 `TANKS` 畫出原創車身/砲管並執行 `pnpm run paint:units`，再在 [`domain/tanks/`](../src/features/battle/domain/tanks/) 新增 `<id>.ts`（default export `defineTank({...})`，由 [`tankRegistry.ts`](../src/features/battle/domain/tankRegistry.ts) 以 `import.meta.glob` 自動收集，需設定唯一的 `sortOrder`；內容為 `TankBlueprint`，`getSprites` 由 id 自動推導：`sprite.scale`、砲塔轉軸 `pivotX/pivotY`，以及表情臉部位置 `sprite.face`：眼睛中心 `x/y`、兩眼距離 `eyeGap`、眼睛半高 `eyeSize`，以面向右為準，臉不可蓋住車身上的徽章與履帶）。
   * **新增/修改跨螢幕大地图**：於 [`mapRegistry.ts`](../src/features/battle/domain/mapRegistry.ts) 新增 `MapBlueprint`（寬高如 `2400×1100` ~ `2800×1250`、波形參數、天空漸層、裝飾數量/間距、`maxWind` 風速上限、爆炸土塊顏色），並在烘焙腳本的 `MAPS` / `PROPS` 補上同 id 的設定。
   * **地圖版型與多層地形**：地圖以「基礎波形 + `layout` 特徵」組成（浮空島、吊橋、雙層薄地、階梯台地、不可破壞基岩 `BEDROCK`），`theme` 指向既有美術主題即可。坦克貼地一律用 `groundBelow`（從腳下往下找），行走一律走 `walkAlongTerrain`（爬坡上限、低天花板阻擋、不自走入深淵）。詳見 [`05-map-layout-design.md`](./05-map-layout-design.md)。
   * **參考其他遊戲的版權守則**：只能借用通用地形版型概念；禁止複製他作的地圖圖片、地形資料、音樂與文字，遊戲內地圖名稱與描述不得使用他作名稱或商標。
   * **新增/修改砲彈與飛行特效**：在 [`domain/projectiles/`](../src/features/battle/domain/projectiles/) 新增 `<name>.ts`（default export `defineProjectile({...})`，由 [`projectileRegistry.ts`](../src/features/battle/domain/projectileRegistry.ts) 以 `import.meta.glob` 自動收集，需設定唯一的 `sortOrder`；內容為 `ProjectileBlueprint`，設定 `damageRadius`、`terrainRadius`、`maxDamage`、`speedMultiplier`、`gravityMilli`、`windMultiplier`、`postImpactHoldMs` 與 `visual.fx`；一般彈重力用 `STANDARD_GRAVITY_MILLI`，播放時鐘為全域 `PLAYBACK_MS_PER_STEP`，見 [`06-gameplay-reference-and-physics.md`](./06-gameplay-reference-and-physics.md)）。
   * **特效一律資料化**：砲口光暈、飛行尾焰（光點 / 擴散環 / 煙霧 / 火星機率）與爆炸序列都由 `visual.fx`（`ProjectileFx`）的參數描述，`BattleScene` 只讀參數，**不得**出現依彈種 id 或樣式名稱分支的程式（如 `if (isPlasma)`）。需要新外觀就擴充 `ProjectileFx` 欄位，而不是在渲染器加分支。
   * **禁止寫死機種 / 彈種 id**：查表用 `getTankSpec(id)` / `getProjectileSpec(id)`（找不到時退回清單第一筆），預設陣容用 `tankAt(i)` 輪流取，CPU 選彈依砲彈屬性（如 `maxDamage`）判斷，不得寫 `'bastion'`、`'HAWK_RAIL'` 等字面值（測試固定資料除外），這樣新增項目才不必到處補。
   * **id 型別與一致性**：`TankArchetypeId`、`BulletType` 為 `string`（自動收集推不出字面值聯集，且 shared kernel 不得反向依賴 feature），打錯 id 不會被編譯器擋下，改由 [`registry.test.ts`](../src/test/registry.test.ts) 守住：id / `sortOrder` 不重複、`shots` 都已註冊、坦克與彈體美術檔都存在。新增機種或砲彈後務必跑 `pnpm test`。
2. **開火與鏡頭跟隨的「投籃拋物線節奏 (Basketball Arc Pacing)」**：
   * **嚴禁瞬移結算**：按下開火後，必須先呼叫 `prepareFireTrajectory` 進入 `FIRING` 階段，由 Phaser 鏡頭平滑跟隨砲彈升空、過頂、下墜（依彈種不同保證 `1.55s ~ 3.35s` 的流暢滯空時間，並沿途噴發專屬尾焰粒子）。
   * **命中瞬間才挖坑扣血**：只有當砲彈動畫實際抵達終點時，才觸發 `commitFireImpact` 挖出彈坑、扣除坦克血量並觸發坦克下墜。
   * **爆炸後鏡頭停留 (`postImpactHoldMs`)**：爆炸發生後，鏡頭必須在彈坑處停留約 `0.85s ~ 1.15s` 讓玩家看清傷害與地形崩塌結果，最後才呼叫 `finalizeTurnAfterHold` 平滑移交鏡頭給下一位行動玩家。
3. **戰鬥規則與電腦對手 (Combat Rules & CPU Opponent)**：
   * **砲口初速單一公式**：開火結算、瞄準預覽與電腦 AI 必須共用 `battleState.ts` 的 `launchVelocity()`，禁止各自複製公式。
   * **地形塌陷傷害**：`commitFireImpact` 挖坑後所有坦克（含殘骸）貼回新地表；下墜超過 30px 起每 6px 扣 1 HP（上限 30），墜出地圖底部（深淵）直接陣亡。回傳 `ImpactResult.damageByPlayer` 供畫面跳出傷害數字與 K.O.。
   * **風速依地圖而定**：每回合風速範圍為 `±MapBlueprint.maxWind`（山谷 8、峽谷 10、冰原 14），雲層會隨風向飄移作為視覺提示。
   * **瞄準預覽只畫前段**：預覽彈道固定只模擬前 `AIM_PREVIEW_STEPS = 60` 步，保留判斷落點的技術含量。
   * **蓄力以時間計算**：長按蓄力速度為每秒 28%（`CHARGE_RATE_PER_SEC`，10 → 100 約 3.2 秒；2026-10-23 由 45 調慢，因為人類對力道的控制力偏差），不得依賴 `requestAnimationFrame` 幀數，避免高更新率螢幕蓄力過快。按下與放開的時間一律取事件的 `timeStamp`，不用處理事件當下的 `performance.now()`，否則掉幀時放開後力道還會多漲（細節見 `docs/06` §三之四）。
   * **每位玩家各自記憶**：彈種選擇與「上一發力道」游標以玩家為單位保存，熱座輪流時互不覆蓋。
   * **電腦對手 (`domain/botBrain.ts`)**：純函數；`planBotShot` 以仰角 × 力道暴力搜尋最接近目標的落點並加入人性化誤差，`planBotMove` 在原地射擊被地形擋住或換位能明顯提高命中時才花燃料移動。Bot 只負責「決定參數」，實際開火仍走一般 `FireActionCommand` 流程。單機模式由 `RosterSlot.isBot` 指定（大廳預設「玩家 vs 電腦」，兩隊皆設為電腦即為觀戰模式）；連線對戰中只有「玩家斷線且房間設為電腦接手」才會出現電腦，且 AI 只在房主端運算（`runsBot`），走位與開火以 `ACTION_MOVE` / `ACTION_FIRE` 廣播（見 `06` §三之六）。
   * **平衡基準**：調整 `TankBlueprint` 數值後，以 Bot 對 Bot 在三張地圖、雙方換邊各打一場的對戰矩陣驗證，任一機種組合勝率不應明顯偏離 50%（目前 Aegis vs Goliath 約 23:25）。
4. **1v1 ~ 5v5 星狀 P2P 與防亂入守則**：
   * 房主採星狀拓撲管理最多 9 條客機連線（上限 10 人），開房遇 `unavailable-id` 自動重試新房號。
   * 房主按下開戰後立即呼叫 `lockRoom()` 切斷公共 PeerJS 信令註冊，杜絕外部陌生人於對戰途中亂入。
   * **房主權威**：房主轉發客端動作前必須驗證來源（`ACTION_FIRE` / `ACTION_MOVE` 的 `playerId` 須等於送件連線槽位，`isForgedAction`）；`RESYNC_REQUEST` 只給房主處理、不轉發。
   * **協議訊息一覽**（`shared/kernel/types.ts` 的 `ProtocolMessage`）：大廳類 `PLAYER_JOIN_INFO` / `UPDATE_PLAYER_SETUP` / `LOBBY_ROSTER_UPDATE`（含 `disconnectPolicy`）/ `START_BATTLE`；
     對戰類 `ACTION_FIRE` / `ACTION_MOVE`（兩端以相同指令各自確定性模擬）、`SYNC_HASH`、`RESYNC_REQUEST` / `RESYNC_STATE`（見 `06` §三之五）、`PLAYER_LEFT`（見 `06` §三之六）。新增訊息時要同步更新此清單。
   * **彈藥承諾欄位**：`RosterSlot.loadoutRoot`（Merkle 根，隨名單廣播）、`ACTION_FIRE.reveal`（開火時揭露所用那一格）、`PLAYER_JOIN_INFO` / `UPDATE_PLAYER_SETUP` 的 `loadoutRoot`，規則見 `06` §三之七。
   * **真人坦克的砲彈原文不得進入任何廣播或快照**（名單、`START_BATTLE`、`RESYNC_STATE` 的 `BattleState` JSON 都只能有承諾根）；原文 `LoadoutSecret` 只留在本機，由 `registry` 以外的 `loadout.ts` 管理。
5. **全畫面街機駕駛艙 HUD 與零捲動守則 (In-Canvas Arcade HUD & Zero Page Scrolling)**：
   * **禁止外置 HTML 表單與頁面捲動**：進入對戰後（[`BattleArena.vue`](../src/features/battle/ui/BattleArena.vue)），畫面必須以 `fixed inset-0 h-dvh w-screen overflow-hidden` 佔滿整個瀏覽器視窗，**絕對不可出現垂直或水平捲軸**。
   * **Phaser 畫布使用 `Scale.RESIZE`**：畫布等於視窗大小、不裁切；寬度不足 `lg` 時頂部對戰列改為靠左並下移，避免與左上鏡頭列、右上雷達重疊。
   * **內嵌式街機儀表板 Overlay**：所有戰鬥資訊與操控（隊伍總血量、風向羅盤、小地圖、2.5D 戰車頭像、仰角微調、彈藥切換、30 格街機蓄力槽與開火鈕）必須作為 `absolute inset-0 pointer-events-none` 圖層直接疊加於 Phaser 遊戲畫布上方（[`BattleHud.vue`](../src/features/battle/ui/BattleHud.vue)），禁止使用傳統 `<input type="range">` 滑桿表單。
   * **手機手把版面（觸控 / 窄螢幕）**：`(pointer: coarse)` 或寬度 < 768px 時，底部駕駛艙換成手把式版面（`BattleHud.vue` 的 `touchLayout`）：
     - 左手 **方向鍵**：左右＝移動、上下＝仰角（按住連續作用），中央顯示仰角與砲口朝向；右手 **兩顆彈種圓鈕＋跳過＋大顆發射鈕**（按住蓄力、放開開火）；中間一條精簡狀態列（戰車頭像、名稱、狀態、血量 / 燃料小條、我的 / 回合切換）與可拖曳的力道條。矮螢幕（高度 ≤ 420px）方向鍵與發射鈕自動縮小。
     - **多指操作互不干擾**：按住移動、仰角、力道條與發射鈕都只認按下的那根手指（`pointerId`），另一隻手放開不會停止動作或提早開火。手把按鈕一律 `touch-action: none`、禁止長按選單與選字。
     - 版面避開瀏海與圓角（`env(safe-area-inset-*)`，`viewport-fit=cover`）；窄螢幕時記分板下移一列、雷達收成右上角按鈕，點開才顯示。
     - 雷達小地圖可點擊或拖曳移動鏡頭（手指也行）。
   * **戰場鏡頭依畫面高度縮放（2026-10-23）**：畫面高度低於 `VIEW_TARGET_H`（640 px）時，`BattleScene.layoutBackdrop` 把主鏡頭拉遠（`zoom = clamp(高度 / 640, MIN_ZOOM 0.5, 1)`），手機橫拿看到的範圍約是 1:1 的 1.8 倍；桌面與平板（高度 ≥ 640）維持 1:1、不放大。注意事項：① 背景（天空、太陽、三層視差）是 `scrollFactor 0`，鏡頭縮放會連它們一起縮，所以以 `backdropX/Y` 反向放大並以畫面中心換算位置；② `BattleCameraManager.notifyMoved` 回報的是世界座標中實際看得到的矩形（寬高 = 畫布 / zoom），雷達視野框依此畫；③ 拖曳鏡頭的位移除以 zoom；④ 追焦時坦克略低於視野中心 0.08 個視野高（以縮放後視野高換算）。
   * **手機底部資訊列壓成單行**：矮螢幕（高度 ≤ 420px）中間的狀態面板只留血量 / 燃料小條、我的 / 回合切換、力道條與數值（隱藏頭像與車名），半透明，避免遮住戰場。
   * **仰角顯示相對地面**：儀表盤與方向鍵中央的主要數字是「對地」仰角（水平線 = 0°，可為負），副數字是砲管相對車體的角度；儀表盤上機種打不出去的角度段（灰色）隨車體傾斜一起轉。規則見 `docs/06` §三之五.6。
   * **手機只支援橫向**：觸控裝置直拿時（`orientation: portrait` 且 `pointer: coarse`）由 `index.html` 的 `#rotate-hint` 蓋上「請把手機轉成橫向」提示；manifest **不宣告** `orientation`（Android WebAPK 直拿時被強制橫向啟動會卡住、點桌面圖示沒反應），改在安裝成 App（standalone / fullscreen）啟動後由 `main.ts` 呼叫 `screen.orientation.lock('landscape')`，直拿時由提示畫面處理。新的手機版面只需要設計橫向。
6. **PWA（可安裝、離線）**：
   * `vite-plugin-pwa`（`vite.config.ts`）產生 manifest 與 Workbox service worker：`display: fullscreen`、`orientation: landscape`、`registerType: autoUpdate`（`main.ts` 的 `registerSW`），程式與 `public/` 素材全部預先快取，單機練習可離線玩；連線對戰仍需網路。
   * **圖示與啟動畫面**由 `tools/assets/paint_pwa.mjs`（`pnpm run paint:pwa`）用原創卡通粗描邊美術繪製到 `public/icons/`：一般圖示（圓角框、透明角）、maskable 圖示（滿版，主體在中央 80% 安全區）、`apple-touch-icon`、`favicon.svg`，以及 iOS `apple-touch-startup-image`（**只有橫向**，常見 iPhone / iPad 尺寸，在 `index.html` 以 media query 對應）。改圖要改腳本重畫，不要手改 PNG。
   * **開啟畫面**：`index.html` 內嵌 `#boot-splash`（天空漸層、圖示、標題、載入條），Vue 掛載且字型就緒後由 `main.ts` 淡出移除，Android 與 iOS 都看得到同一個開場。
7. **對戰前直覺選車守則 (Direct Match Tank Selection)**：
   * 無論在 **P2P 連線配對區**（進房前與房間候戰室）或 **單機多人熱座 (Hotseat，每隊 1~5 台，兩隊可不同)** 的隊伍編制面板中，都必須讓每位玩家能直覺挑選或更換出戰坦克。選車一律開 **選車彈窗 (`TankPickerModal.vue`)**：`TANK_LIST` 全部機種（目前 6 台，見 `docs/06` §三之八）的卡片（車身、名稱、定位、耐久／火力／機動小數值條）＋最後一格 **「隨機」**；自己的戰車（我的戰車卡「換車」）與單機每一席都用同一個彈窗，不在版面裡平鋪整排車種按鈕。
   * **隨機戰車**：`RANDOM_TANK` 只存在大廳 UI（[`tankChoice.ts`](../src/features/lobby/ui/tankChoice.ts)），開打前一定換成真正的機種 id，戰鬥端永遠收不到 `random`。單機每一席在按「開打」時才抽；連線對戰因為彈藥承諾要綁定機種，選「隨機」當下就抽好，名單帶 `randomTank` 旗標讓所有人的席次只顯示問號，開打才揭曉。隨機時畫面一律用問號牌（`.toon-mystery`），**不可用抽到機種的剪影或由它推得的插圖**，否則等於洩漏結果；數值條與彈藥格也隱藏，帶該機種存好的彈藥上場。
8. **遊戲大廳美學與介面守則 (Lobby Visual Style: Sky, War, Joy & Zero Form Scroll)**：
   * **天空、戰爭、歡樂風格**：大廳採「晴空高照 (Sky) × 裝甲軍武 (War) × 街機歡樂 (Joy)」主題，營造明亮、通透、富戰術活力的街機氛圍，絕不使用死黑、陰沉昏暗的沉重配色。
   * **色彩明度與純淨度**：主色調為晴空湛藍 (Sky / Royal Blue)、陽光金 (Golden Amber)、鮮明暖橘與清亮白。**嚴格禁止使用果青色 (Murky Teal / Cyan-green) 等濁色調**，維持純淨飽滿的視覺能量。
   * **拒絕網頁表單感與垂直捲動 (Zero Form Scroll)**：
     - 地圖選擇禁止採用長條下拉或多按鈕垂直列表（杜絕「選個地圖還要往下拉」）。一律用 **地圖卡 (`MapPickerCard.vue`)**：縮圖＋左右箭頭切換＋中英分行的地圖名與簡介，非房主或已開戰時唯讀；卡上「全部地圖」開啟 **全地圖圖庫 (`StageSelectModal.vue`)** 網格選圖。
     - **地圖預覽圖**一律用 `MapPreview.vue`（`loadMapPreview`，`battle/ui/mapPreview.ts`）：以戰場同一個確定性地形核心生成，畫上主題天空、太陽 / 月亮、三層視差山丘、地表 / 土壤 / 基岩紋理、朝空氣的墨線外框、深淵霧氣與兩隊出生點小旗，以 2 倍像素繪製。地圖卡、全地圖圖庫、公開戰局房間卡共用它；戰鬥雷達用同一套背景（`paintMapBackdrop`），另外標出出手坦克（黃色脈動圈）、陣亡叉叉與鏡頭範圍（範圍外壓暗）。
     - 坦克選角用 **我的戰車卡 (`TankHangarPodium.vue`)**：雲朵天空展示台上的 2.5D 浮動戰車＋兩色塗裝預覽、名稱旁「換車」按鈕（開選車彈窗）、耐久／火力／機動粗框數值條、主彈／副彈格（「換彈」開 `LoadoutPicker` 彈窗）。大廳、房間與單機頁都要看得到它。
     - 大廳背景動態載入當前所選地圖的無縫視差圖層（飄移雲層、遠山、丘陵與天體），使大廳具備與戰場一致的精緻質感與空氣感。
   * **「卡通粗描邊」視覺系統**：大廳 UI 與 Q 版坦克美術同一種語言——深墨色粗外框、色塊上疊**手工材質紋理**、往下的硬陰影。所有 token 與元件類別集中在 `src/style.css`，新元件只能組合它們，不要另開一套：
     - **材質**（`tools/assets/paint_ui.mjs` 產生的 `src/assets/ui/*.svg`，每種表面各自設計，見 `docs/04` §七）：面板＝奶油紙（紙漿纖維 `paper.svg`）＋上緣受光亮邊；按鈕 / 輸入框 / 分段切換＝卡紙紋（`card.svg`），按鈕再加玩具塑膠光澤（上亮邊、下暗邊）；緞帶＝白色虛線車縫線；戰鬥 HUD 操控面板＝`.toon-panel--plate`（髮絲紋金屬 `plate.svg`＋四角鉚釘）；我的戰車展示台與空戰局插圖改用畫好的天空（`stage_sky.svg`、`empty_sky.svg`）與草皮台（`stage_turf.svg`）。紋理必須淡到不影響文字閱讀；新表面要新畫一張專屬紋理，不能直接沿用別的表面的圖。
     - **紋理不被蓋掉**：`.toon-btn` 的變體與元件內的上色一律改 `background-color`（或 Tailwind `bg-*`），不要用 `background` 簡寫，否則會清掉紋理圖層。
     - **色票**（Tailwind `@theme`）：`ink` 墨線 `#1d2340`、`cream` 面板底、`paper` 白、`mist` 淡藍、`sun` 陽光黃（主要動作）、`sky` 天空藍（次要動作 / 標題緞帶）、`coral` 珊瑚紅（錯誤 / 對戰中）、`grass` 草綠（可加入 / 準備好）、`team-a` 橘隊、`team-b` 藍隊。
     - **元件類別**：`.toon-panel`（奶油紙面板＋3px 墨線＋硬陰影；`.toon-panel--plate` 為 HUD 金屬板）、`.toon-ribbon`（面板左上角標題緞帶，含車縫線）、`.toon-btn` ＋ `--sun / --sky / --coral / --grass`（按下會壓下去的硬陰影按鈕）、`.toon-input`、`.toon-pill`、`.toon-segment`（以 `aria-pressed` 標示選中的分段切換）、`.toon-title`（白字＋墨色描邊＋硬陰影的大標題）、`.toon-mystery`（隨機戰車的問號牌，大小用 `h-*`／`text-*` 控制）。
     - **標題與副標的間距**：`.toon-title` 的描邊與硬陰影會吃掉約 7px，標題下方接副標或膠囊時用 `flex flex-col` 的 `gap-3` 以上，不要用 `mt-1` 緊貼。
     - **字型**：中文 jf 粉圓 (Huninn)、標題 / 數字 / 英文 Baloo 2（`font-toon` / `font-num`，皆 SIL OFL，見 `CREDITS.md`）。
     - 不用 emoji 當圖示；字級以 `text-sm` 為下限（徽章小字除外），層級靠字級與顏色，不靠全部加粗。
   * **手機橫拿＝一屏放完、整頁不捲動**：`src/style.css` 定義 `phone` 變體（`orientation: landscape` 且高度 ≤ 540px）。在 `phone` 下大廳、單機頁、房間與開房彈窗都鎖在一個畫面內（`h-full` / `overflow-hidden`，左右讓出 `safe-area-inset`），內容改成並排多欄：
     - 大廳：我的戰車｜連線對戰＋單機練習（有房間目錄時疊成一欄）｜公開戰局；房間與單機頁：我的戰車｜隊伍｜戰場；開房彈窗：設定｜地圖卡。頂欄壓成一行。
     - 縮減方式：展示台變矮、戰車整組縮小，彈藥格只留圖示；地圖卡隱藏簡介與英文名；房間席位改成單列，狀態標籤收成戰車徽章上的小圓點（金＝房主、綠＝準備好、灰＝整備中）；入口卡插圖只在有空間時顯示。
     - 只有本來就是清單的區塊（單機 10 個席位、公開戰局）可以在面板內捲動；整頁不得捲動。改動大廳版面後要在 740×360、667×340、932×430 檢查沒有溢出。
     - 直立的窄螢幕（桌機窄視窗）仍是整頁往下捲、各欄依序排列（`min-h-full`），寬螢幕（`lg`）鎖在一個畫面內；不可用固定高度把面板擠到互相重疊。
   * **大廳三畫面＋單機頁**：大廳為 `fixed inset-0` 全畫面，由 `LobbyPanel.vue` 依狀態切換（`lobbyView`: `hub` / `room` / `hotseat`），連線與協定邏輯留在 `LobbyPanel`，畫面元件只收 props / 發事件：
     1. **大廳 (`LobbyHub.vue`)**：頂欄（描邊標題字、玩家牌＝目前戰車頭像＋可直接改的名稱＋信令狀態點、指南按鈕）＋左側我的戰車卡＋右側兩張並排的主要入口卡：**「連線對戰」**（我方 vs 對手插圖、6 碼房號輸入＋加入、「或」分隔、＋開新戰局、錯誤訊息）與 **「單機練習」**（插圖、說明、開始練習）。目前的主要玩法是「輸入房號加入」與「單機練習」，版面以它們為主，**戰局列表不能反客為主**：只有伺服器提供房間目錄時才在入口卡下方出現「公開戰局」面板（搜尋、重新整理、房間卡：地圖縮圖、房號、名稱、房主與地圖、10 顆人數點、可加入／對戰中／已滿，可加入者排前；沒房間時只顯示一行提示），沒有目錄時整個面板不顯示。連線中以遮罩顯示並可取消。
     2. **開新戰局 (`CreateRoomDialog.vue`)**：左欄房間名稱、斷線規則（算他陣亡／電腦接手）、開房按鈕；右欄地圖卡。
     3. **房間 (`RoomView.vue`)**：頂欄（返回、房間名與人數狀態、房號牌＋複製／邀請連結）＋三欄：我的戰車卡｜「隊伍」面板（橘隊、藍隊各固定 5 席並排，正中 VS 徽章；座位顯示戰車頭像（選隨機者顯示問號牌）、房主／準備好／整備中、名稱，本人座位加黃框；點空位換隊；藍隊坦克水平翻轉面向對手）｜「戰場」面板（地圖卡、斷線規則，僅房主可改；底部「開打！」或「準備」大按鈕與提示文字）。
     - **單機練習頁**：頂欄（返回、描邊標題「單機練習」與下方一行說明文字，間距見上方標題規則）＋同樣三欄——我的戰車卡｜隊伍｜戰場（地圖卡＋開打）。
       - **以席位為單位，不以隊伍為單位**（`useLocalSkirmish` 的 `hotseatSeats`）：每隊固定 5 席，每一席各自選 **玩家／電腦／空位**，電腦席各自設定難度。沒有「NvN」人數選擇，兩隊人數可以不同（例如 2v4），開打標籤顯示實際人數。
       - 預設 1v1：A1 玩家、B1 中等電腦，其餘空位。**A1 是我的戰車，不能改成空位**（與我的戰車卡同步）；每隊至少留一台，最後一台的「✕ 空位」停用。
       - **席次卡同一大小**：佔用席＝席號、戰車頭像或問號牌、名稱（點擊開選車彈窗）＋右側「玩家｜電腦｜✕」切換與「‹ 難度 ›」；難度列**永遠佔位**，玩家席時隱藏，卡片高度不變。空位席＝虛線框、「空位」＋「＋ 玩家」「＋ 電腦」兩顆按鈕。
       - **出戰名稱**：A1 用大廳玩家牌上的名字（空白時退回「橘隊 A1」），其餘玩家席為「橘隊 A2」「藍隊 B1」，電腦席為「🤖 CPU B1」（HUD 去掉 emoji、改標「電腦」）。
       - 人數不均時出手順序照席號交錯（2v4 → A1 B1 A2 B2 B3 B4），每台坦克每輪各一次。
   * **參考他作的原則**：可以參考其他砲擊遊戲的大廳**流程概念**（房間列表 → 開房彈窗 → 房內座位與選車），但版面、造型、配色與命名須重新原創設計，不得照搬他作的格狀排列、框線條紋或角色造型，以避免抄襲嫌疑。

## 五、 測試策略與一致性驗證 (Testing)

- **前端 / 戰鬥邏輯**：Vitest（`pnpm test`），測試放在 `src/test/`：確定性核心與 PRNG、風規則、傷害 / 裝甲 / 摔落公式、開火三階段流程、移動與走下高處、斷線處置、動作來源驗證、電腦 AI、註冊表一致性。
  修 bug 時先補回歸測試（例：直擊吃滿傷害）；測試 helper 在 `src/test/helpers.ts`（`setupBattle` 與 `BattleArena.resetMatch` 同一流程）。
- **Rust 核心 ↔ TS 核心一致性**：`src/test/parity.test.ts` 用 TS 核心對所有地圖 × 數個 seed 產生黃金檔 `crates/tank-core/tests/fixtures/golden.json`（地形雜湊、地表 / 坡度 / 材質取樣、挖坑後狀態、彈道），
  Rust 的 `crates/tank-core/tests/parity.rs`（`pnpm run test:rust`）讀同一份檔案逐項比對。改了 TS 核心行為後：`UPDATE_GOLDEN=1 pnpm test` 重新產生黃金檔，再跑 `pnpm run test:rust` 確認 Rust 跟上。
  Rust 地形參數用 JSON 傳入（`TerrainGrid::reset_terrain(seed, json)`，與 TS `TerrainWaveOptions` 同形）；砲彈 `speedMultiplier`、吸附、風敏感度屬 TS 應用層，不在核心內。
- **房間目錄伺服器**：`server/roomDirectory.test.mjs`（需先在 `server/` 執行 `npm install`，再 `node --test`；已接進 `pnpm test`，`test` 腳本會先跑 Vitest 再跑 `npm test --prefix server`）。
- **平衡**：`node tools/balance/duel_sim.mjs`（見 `06` §三）。
- 目前執行期仍使用 TS 版核心；Rust/Wasm 版尚未接上轉接層。

### 測試結果紀錄（每次跑測試後追加一列）

> 規則：每次執行測試（`pnpm test`、`pnpm run test:rust`、`node tools/balance/duel_sim.mjs`、CI）後，把日期、範圍、結果與對應的 commit 或改動摘要追加到下表。失敗也要記錄，並註明原因與處理狀態。

| 日期 | 範圍 | 指令 | 結果 | 備註 |
|---|---|---|---|---|
| 2026-10-22 | 型別檢查 | `npx vue-tsc -b` | ✅ 通過 | 疾風電漿彈調整後（見下列平衡列） |
| 2026-10-22 | 前端 + server 單元測試 | `pnpm test` | ✅ Vitest 42 / 42、server node:test 4 / 4 | 疾風電漿彈調整後，未 commit |
| 2026-10-22 | Rust 核心 | `cargo test --manifest-path crates/tank-core/Cargo.toml` | ✅ 9 + 1 通過 | 最近一次執行（調整前）；Rust 未變動 |
| 2026-10-22 | 平衡模擬（σ = 25 / 45 / 70 px） | `node tools/balance/duel_sim.mjs` | ✅ 各配對在 40%~59%；疾風 σ=70 時改選電漿彈，對 goliath 為 42% | 疾風電漿彈傷害半徑 30→40、吸附 26→22（`projectileRegistry.ts` 與 `duel_sim.mjs` 同步）；未 commit。**註：此列的選彈結果已被下列確定性版本取代（當時仍為取樣選彈）** |
| 2026-10-22 | 平衡模擬（確定性版本，σ = 25 / 45 / 70 px，種子 20261022，每組 20000 場） | `node tools/balance/duel_sim.mjs` | ✅ 各配對在 41%~59%；三種精度都選 RAILGUN（疾風），無翻面；連跑兩次輸出逐字相同 | 改為固定種子 PRNG、選彈用期望傷害的確定性積分；未 commit |
| 2026-10-22 | 平衡模擬（加入 σ = 5 px 近似精準，參考用） | `node tools/balance/duel_sim.mjs` | ✅ 執行成功；σ=25 / 45 / 70 仍在 41%~59%；σ=5 為 0% / 100%（aegis 對所有對手 0%，疾風對 aegis 與 goliath 100%） | 不納入 40%~60% 目標，待決定是否調整數值；未 commit |
| 2026-10-22 | CI（main，commit `9c5da5b`） | GitHub Actions `Deploy to GitHub Pages` | ✅ 成功（含 `pnpm test`、型別檢查、建置、部署） | run [39736386678](https://github.com/tigernaxoJr/tank/actions/runs/39736386678) |
| 2026-10-22 | 前端型別檢查 + 建置 | `pnpm run build` | ✅ 通過（`vue-tsc -b && vite build`，零錯誤） | 遊戲大廳美化重構（天空、戰爭、歡樂風格，零表單捲動）；未 commit |
| 2026-10-22 | 前端 + server 單元測試 | `pnpm test` | ✅ Vitest 59 / 59、server node:test 4 / 4 通過 | 大廳重構與 UI 音效擴充後；未 commit |
| 2026-10-22 | Rust 核心 | `cargo test --manifest-path crates/tank-core/Cargo.toml` | ✅ 10 + 1 通過 | 新增 `fill_circle`（築壘彈堆土）與測試；本機以 `wasm-pack` 重建 `src/shared/wasm/pkg`；未 commit |
| 2026-10-22 | 前端 + server 單元測試 | `pnpm test` | ✅ Vitest 88 / 88、server node:test 4 / 4 通過 | 坦克與砲彈陣容重新設計（6 台、12 種砲彈、狀態效果、散彈 / 跳彈 / 碎裂 / 高拋、堆土 / 鑽地 / 擊退），新增 `mechanics.test.ts`；未 commit |
| 2026-10-22 | 前端型別檢查 + 建置 | `pnpm run build` | ✅ 通過 | 同上；未 commit |
| 2026-10-22 | 平衡模擬（σ = 5 / 25 / 45 / 70 px，種子 20261022，每組 20000 場） | `node tools/balance/duel_sim.mjs` | ⚠️ 各機種平均勝率 41%~61%，多數配對 35%~65%；4 組配對在單一精度超過 65%（原因與取捨見 `docs/06` §三之八.4） | 新陣容；模擬器新增散彈 / 碎裂 / 中毒 / 破甲 / 護盾 / 紮根模型；未 commit |
