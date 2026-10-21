# TODO

尚未完成的工作清單。完成後請勾選並同步更新 `docs/`（見 `AGENTS.md` §1）。

## 優先（已確認要做）

- [x] **選車面板補上數值**（已完成）
  - `src/features/battle/domain/tankStats.ts` 的 `buildTankCard` 從 registry 推導血量、輸出、機動與兩種砲彈的威力 / 範圍 / 射程 / 風阻。
  - `src/features/lobby/ui/TankStatPanel.vue` 以長條圖呈現，大廳左欄的選車詳情已套用；卡片小字顯示 HP 與輸出倍率。
  - 後續可選：房間內與單機各隊逐位選車的小按鈕也可加上懸浮提示（目前只顯示名稱縮寫）。
- [x] **房間列表**（已完成：僅在設定自建信令伺服器 `VITE_PEER_HOST` 時啟用；公共信令伺服器沒有 `/rooms`，大廳降級為輸入房號。尚待：實機兩人連線驗證、部署到實際伺服器後的跨網域測試）
  - 目前純 P2P 沒有房間目錄；需要信令伺服器（`server/index.js`）提供 HTTP / WebSocket 的房間註冊與查詢。
  - 房主建立房間時註冊（房號、房名、地圖、人數 / 上限、狀態：等待中 / 遊戲中）；開戰與關房時更新或移除；心跳逾時自動清除。
  - 大廳首頁顯示列表，可點擊加入；沒有自建伺服器時要有清楚的降級提示（只能輸入房號）。
  - 注意：不洩漏玩家 IP 以外的資訊；列表 API 需限流。
  - 相關文件：`docs/TODO-peerjs-signaling-server.md`。

## 玩法（來自影片參考與討論）

- [ ] 結算畫面加上戰績與獎勵顯示（只做顯示）。
- [ ] 道具欄、金幣與商店（大型功能，動工前先討論）。
- [ ] 房主可改房名；房間內可選模式。
- [ ] 實機驗證 P2P 房間「準備完畢」流程（需兩個瀏覽器連線；目前只做了程式與型別檢查）。

- [x] 電腦難度分五級（新手 / 弱 / 中等 / 強 / 變態），單機各隊可選（見 `docs/06` §三之三）。

## 砲彈與平衡（規格見 `docs/06-gameplay-reference-and-physics.md` §三之一、三之二）

- [x] 把 `blastRadius` 拆成 `damageRadius` / `terrainRadius`（已完成，純重構、數值不變；坦克加成也拆成 `damageRadiusBonus` / `terrainRadiusBonus`）。
- [ ] 新增 `terrainDepth`（鑽地彈用）。
- [ ] 狀態特效系統（規格見 `docs/06` §三之二第 2 節；以回合計、確定性結算、不得硬控、同種不疊加、要算進砲彈預算）
  - [ ] ① `StatusEffectBlueprint` registry（資料驅動，風格同 tank / map / projectile 註冊表）。
  - [ ] ② 坦克狀態記錄身上的效果與剩餘回合；回合開始時結算（兩端同邏輯，不用 `Math.random`）。
  - [ ] ③ 先做中毒（每回合扣固定血量），把註冊表、結算、HUD 整條流程打通。
  - [ ] ④ 再做冰凍 / 減速（減少移動燃料或力道上限，不得完全無法行動）。
  - [ ] ⑤ HUD 顯示狀態圖示與剩餘回合。
  - [ ] ⑥ 之後可擴充：燃燒、護盾、修復 / 淨化、擊退、風暴。
  - [ ] 每加一種效果，先更新 `tools/balance/duel_sim.mjs` 再調砲彈數值。
- [ ] 新射擊樣式：霰彈、追蹤彈、墊土彈、修復彈等；先更新 `tools/balance/duel_sim.mjs` 再改數值。
- [ ] 平衡模擬器補上地形、風向、移動的模型（目前只比平均對轟）。
- [ ] 實際遊玩微調疾風磁軌（76 HP）手感。

## 技術債

- [ ] `crates/tank-core`（Rust 版確定性核心）尚未移植 `layout` / BEDROCK / `groundBelow`，也沒有砲彈 `speedMultiplier`；切換到 Wasm 前必須補齊（見 `docs/05-map-layout-design.md` §六）。
- [ ] 行走時從高處走下橋緣不計摔落傷害。
- [ ] 回合倒數目前時間到會自動以目前瞄準開火；可評估改為「跳過回合」選項。
