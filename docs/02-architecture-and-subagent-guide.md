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
   * **禁止寫死機種 / 彈種 id**：查表用 `getTankSpec(id)` / `getProjectileSpec(id)`（找不到時退回清單第一筆），預設陣容用 `tankAt(i)` 輪流取，CPU 選彈依砲彈屬性（如 `maxDamage`）判斷，不得寫 `'aegis'`、`'MISSILE_PLASMA'` 等字面值（測試固定資料除外），這樣新增項目才不必到處補。
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
   * **蓄力以時間計算**：長按蓄力速度為每秒 80%（`CHARGE_RATE_PER_SEC`），不得依賴 `requestAnimationFrame` 幀數，避免高更新率螢幕蓄力過快。
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
6. **對戰前直覺選車守則 (Direct Match Tank Selection)**：
   * 無論在 **P2P 連線配對區**（進房前與房間候戰室）或 **單機多人熱座 (Hotseat 1v1~5v5)** 的隊伍編制面板中，都必須直接提供 2.5D 戰車型號切換按鈕（`aegis` / `goliath` / `zephyr`），讓每位玩家都能在開戰設定區直覺挑選或更換出戰坦克。

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
