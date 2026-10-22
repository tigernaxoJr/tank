# 執行與派發計畫 (03-execution-plan.md)

本文件將 [01-project-proposal.md](./01-project-proposal.md) 的 4 個里程碑，依照 [02-architecture-and-subagent-guide.md](./02-architecture-and-subagent-guide.md) 的 **VSA + 務實 DDD** 原則，拆解為可逐一派發給**低階 Subagent（如 `flash` / `flash_lite`）**獨立完成並自動驗收的最小工作包（Work Packages）。

---

## 派發執行守則
1. **一次一包 (One Work Package per Subagent)**：每個任務只允許修改指定的目標檔案，不跨 Slice 修改。
2. **硬性驗收門檻**：Subagent 回報完成前，必須通過該工作包指定的 `Verification` 指令。
3. **共用契約先行**：若需擴充跨模組型別，由主 Agent 先更新 `src/shared/kernel/types.ts` 或 `src/shared/wasm/index.ts`，再派發給 Subagent。

---

## Phase 1：Rust Wasm 確定性核心與橋接 (`crates/tank-core` & `src/shared/wasm`)

- [x] **WP-1.1：核心演算法原型與基礎測試**（已完成）
  - **範圍**：`prng.rs`、`terrain.rs`、`ballistics.rs`、`combat.rs`
  - **驗收**：`cargo test --manifest-path crates/tank-core/Cargo.toml`
- [x] **WP-1.2：地形高度查詢、地面法向量與像素緩衝輸出**（已完成）
  - **目標檔案**：`crates/tank-core/src/terrain.rs`
  - **任務內容**：
    1. 新增 `surface_y(x: i32) -> i32`：取得指定 X 座標最上層實心像素的 Y 值（供坦克貼地與下墜計算）。
    2. 新增 `surface_slope_deg(x: i32, sample_span: i32) -> i32`：計算指定位置左右區間的地面傾角（整數度數，供車身旋轉）。
    3. 新增 `mask_ptr() -> *const u8`：供前端 Canvas 讀取遮罩緩衝區。
    4. 補齊單元測試。
  - **驗收**：`cargo test --manifest-path crates/tank-core/Cargo.toml`
- [x] **WP-1.3：拋物線軌跡陣列與坦克碰撞判定**（已完成）
  - **目標檔案**：`crates/tank-core/src/ballistics.rs`
  - **任務內容**：
    1. 擴充彈道模擬，支援傳入目標坦克座標與碰撞半徑，若命中坦克即提前引爆。
    2. 新增預覽用的輕量步進點計算（供前端繪製瞄準虛線）。
    3. 補齊單元測試。
  - **驗收**：`cargo test --manifest-path crates/tank-core/Cargo.toml`
- [x] **WP-1.4：Wasm Adapter 與確定性 TS Fallback 實作**（已完成）
  - **目標檔案**：`src/shared/wasm/index.ts`
  - **任務內容**：
    1. 實作 `TankCorePort` 的預設 Adapter（優先載入 `pkg/tank_core.js`，若未編譯則自動切換為內建確定性 TS 實作，確保前端開發與測試不卡關）。
  - **驗收**：`npx vue-tsc -b`

---

## Phase 2：單機雙人熱座對戰 (Pass & Play) (`src/features/battle`)

- [x] **WP-2.1：Battle Domain 狀態機與傷害結算**（已完成）
  - **目標檔案**：`src/features/battle/domain/battleState.ts`
  - **任務內容**：
    1. 加入回合階段狀態（`AIMING` | `FIRING` | `SETTLING` | `GAME_OVER`）。
    2. 實作坦克移動扣減行動力、地面被炸空後的 Y 軸貼地下墜更新、生命值歸零勝負判定。
  - **驗收**：`npx vue-tsc -b`
- [x] **WP-2.2：Battle Application 發射與物理調度**（已完成）
  - **目標檔案**：`src/features/battle/application/useBattleTurn.ts`
  - **任務內容**：
    1. 串接 `TankCorePort`：當觸發 `executeFireAction` 時，計算彈道落點 → 呼叫 `carveCircle` 挖坑 → 計算雙方坦克傷害 → 更新坦克貼地座標 → 切換回合並更新風向。
  - **驗收**：`npx vue-tsc -b`
- [x] **WP-2.3：雙層 Canvas 渲染器 (Terrain Layer + Entity Layer)**（已完成）
  - **目標檔案**：`src/features/battle/ui/BattleCanvas.vue`（新建）並掛載進 `BattleArena.vue`
  - **任務內容**：
    1. 底層 Canvas：繪製地形遮罩，並在爆炸時依 `DirtyRect` 局部清除像素。
    2. 上層 Canvas：繪製 P1/P2 坦克、砲管角度、瞄準預覽線與飛行中的砲彈動畫。
  - **驗收**：`npx vue-tsc -b`
- [x] **WP-2.4：對戰 HUD 與鍵盤控制器**（已完成）
  - **目標檔案**：`src/features/battle/ui/BattleHud.vue`（新建）與 `BattleArena.vue`
  - **任務內容**：
    1. 實作風向儀、回合倒數計時、角度指示器、空白鍵長按蓄力條（Oscillating Power Bar）。
    2. 支援左右鍵移動、上下鍵調角度、空白鍵蓄力發射。
  - **驗收**：`npx vue-tsc -b`

---

## Phase 3：WebRTC P2P 連線對戰 (`src/features/lobby`)

- [x] **WP-3.1：PeerJS DataChannel Transport 實作**（已完成）
  - **目標檔案**：`src/features/lobby/infra/peerAdapter.ts`
  - **任務內容**：
    1. 使用 `peerjs` 實作 `PeerTransportPort`（`hostRoom`、`joinRoom`、`send`、`disconnect`）。
    2. 配置 Google STUN 伺服器與連線狀態/錯誤回呼。
  - **驗收**：`npx vue-tsc -b`
- [x] **WP-3.2：大廳配對 UI 與種子同步握手**（已完成）
  - **目標檔案**：`src/features/lobby/ui/LobbyPanel.vue`、`src/shared/kernel/types.ts`
  - **任務內容**：
    1. 擴充 `HANDSHAKE_INIT`（含地圖 `seed`）協議型別。
    2. 實作「建立房間 / 輸入 6 碼房號加入」UI、連線狀態顯示與斷線提示。
    3. 透過 `App.vue` 將收到的遠端 `FireActionCommand` 轉交給 `Battle` slice 執行，並在回合結束比對 `SYNC_HASH`。
  - **驗收**：`npx vue-tsc -b`

---

## Phase 4：音效、視覺打磨與自動化部署 (`src/features/audio` & CI)

- [x] **WP-4.1：Web Audio 程序化音效合成器（小型單檔 Slice）**（已完成）
  - **目標檔案**：`src/features/audio/index.ts`
  - **任務內容**：
    1. 遵循「小型模組不拆分」原則，直接在 `index.ts` 內用瀏覽器原生 `AudioContext` 實作 `fire`、`explosion`、`move`、`tick` 四種合成音效與靜音開關。
  - **驗收**：`npx vue-tsc -b`
- [x] **WP-4.2：爆炸粒子與畫面震動特效**（已完成）
  - **目標檔案**：`src/features/battle/ui/BattleCanvas.vue`
  - **任務內容**：
    1. 命中爆炸時觸發短暫 Canvas 位移震動（Screen Shake）與簡易圓形擴散火花粒子。
  - **驗收**：`npx vue-tsc -b`
- [x] **WP-4.3：GitHub Actions 自動化構建與部署腳本**（已完成）
  - **目標檔案**：`.github/workflows/deploy.yml`
  - **任務內容**：
    1. 自動安裝 Rust、`wasm-pack`、Node.js，執行 `cargo test`、`pnpm run build:wasm` 與 `pnpm run build` 產出靜態網站。
