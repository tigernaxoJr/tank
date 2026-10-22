# 專案重構與程式碼收斂規劃 (Refactoring & Code Convergence)

本文件紀錄專案程式碼收斂、模組化重構的分析結論與漸進式改善清單。

## 一、現況分析與核心瓶頸

專案採用 Vertical Slice Architecture (VSA) 與 Pragmatic DDD，物理與狀態結算核心健全。然而在展示層與前端互動層集中了數個超過 500 行至 1,400 行的「巨石檔案」，是後續功能迭代與測試的主要瓶頸：

| 檔案路徑 | 行數 | 核心職責過載問題 |
|---|---|---|
| [`src/features/lobby/ui/LobbyPanel.vue`](./src/features/lobby/ui/LobbyPanel.vue) | ~1,420 | 混雜 P2P 信令、房間狀態機、本地對戰設定、地圖畫布生命週期、房間目錄輪詢 |
| [`src/features/battle/engine/BattleScene.ts`](./src/features/battle/engine/BattleScene.ts) | ~1,266 | 混雜視差天候背景、地形像素重繪、砲彈軌跡/尾焰粒子、鏡頭跟隨狀態機、坦克動畫 |
| [`src/features/lobby/infra/peerAdapter.ts`](./src/features/lobby/infra/peerAdapter.ts) | ~519 | WebRTC 連線建立、心跳、重新連線、封包廣播與反序列化集中在單檔 |
| [`src/features/battle/ui/BattleArena.vue`](./src/features/battle/ui/BattleArena.vue) | ~528 | 兼管 Phaser 生命週期、鍵盤輸入、狀態輪詢、對戰倒數與音效觸發 |
| [`src/features/battle/ui/BattleHud.vue`](./src/features/battle/ui/BattleHud.vue) | ~523 | 街機 HUD、開火力道角度計算、行動控制項與雙向溝通狀態疊加 |

---

## 二、收斂方案與拆解藍圖

### P1. 拆解 `LobbyPanel.vue` (預期 1,420 行 → ~400 行)
- **抽出 Composables**：
  - `src/features/lobby/ui/composables/useLobbyPeer.ts`：專責 WebRTC P2P 生命週期、斷線重連、信令事件。
  - `src/features/lobby/ui/composables/useRoomSession.ts`：專責隊伍分配、席位進出、房主權限轉移。
  - `src/features/lobby/ui/composables/useLocalSkirmish.ts`：專責本地單機/Bot 測試設定。
- **拆分子元件 (Presentational Components)**：
  - `src/features/lobby/ui/components/LobbyRoomList.vue`（公開房間列表、房間碼輸入與狀態顯示）
  - `src/features/lobby/ui/components/LobbyRosterView.vue`（紅藍隊玩家席位、Bot 槽位與踢人/改名控制）
  - `src/features/lobby/ui/components/LobbyMapSelector.vue`（地圖切換與 Canvas 預覽）

### P2. 模組化 `BattleScene.ts` (預期 1,266 行 → ~500 行)
採用 Phaser 系統/經理人（Manager）模式分離關注點：
- `src/features/battle/engine/systems/BattleCameraManager.ts`：砲彈跟隨平滑過渡、落點停留 1s（`postImpactHoldMs`）、震動回饋與鏡頭重設。
- `src/features/battle/engine/systems/TerrainRenderer.ts`：Dirty Rect 取樣、Canvas 像素重繪、土壤碎屑濺灑。
- `src/features/battle/engine/systems/ProjectileFxSystem.ts`：砲彈尾焰粒子發射器、光暈拖尾、命中爆炸序列影格。
- `src/features/battle/engine/systems/EnvironmentBackdrop.ts`：天候渲染、雲層隨風飄移、遠中近丘視差層。

### P3. 收斂 `BattleArena.vue` 與 `BattleHud.vue`
- 抽出 `src/features/battle/ui/composables/useBattleInput.ts`：統一處理鍵盤、觸控或手把的開火力道、角度與道具快捷鍵。
- 音效事件解耦：將 UI/場景中散落的 `playAudio(...)` 呼叫收斂至戰鬥事件監聽（Domain Event Bus），UI 只依賴 ViewModel。

### P4. 型別衍生與 Registry 嚴格收斂
- 移除手動維護的聯集型別，統一由 Registry 派生（`export type TankId = keyof typeof TANK_REGISTRY`）。
- 嚴格界定 `src/shared/kernel/types.ts` 僅保留網路傳輸 DTO 與核心識別碼，領域特化型別回歸 `battle/domain/`。

---

## 三、執行原則
1. **零功能破壞 (Behavior Preservation)**：每一項拆解均須確保現有測試全數通過（`npm test`），不更動任何公開 API。
2. **小步前進 (Atomic Refactoring)**：每次重構以單一 Composable 或子元件為單位，避免大範圍跨檔案破壞性修改。
3. **遵循 Commit 守則**：重構過程中嚴禁自動 commit，所有修改保留至使用者確認。
