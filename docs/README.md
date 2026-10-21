# Tank Artillery Web — 文件中心 (Documentation Index)

本目錄統一收納專案的所有規劃、架構與技術規格文件。

## 文件清單

1. **[01-project-proposal.md](./01-project-proposal.md)**  
   專案規劃書：開發策略、技術選型（Rust Wasm + Vue 3 + WebRTC）、免費美術/音效資源與 4 階段開發里程碑。
2. **[02-architecture-and-subagent-guide.md](./02-architecture-and-subagent-guide.md)**  
   系統架構與 Subagent 派發規範：VSA 垂直切片隔離、務實 DDD 分層標準（大小模組裁量原則）、目錄結構與低階 Subagent 任務派發模板。
3. **[03-execution-plan.md](./03-execution-plan.md)**  
   執行與派發計畫：將 Phase 1 ~ Phase 4 拆解為鎖定單一檔案/切片的 Work Packages (`WP-1.1` ~ `WP-4.3`)，附帶驗收指令，可直接逐項派發給低階 Subagent 執行。
4. **[04-art-asset-pipeline.md](./04-art-asset-pipeline.md)**  
   美術素材管線與授權規範：Kenney CC0 素材來源、`tools/assets/bake_kenney_assets.py` 烘焙流程、原創地圖主題 (`paint:maps`) 與 Q 版坦克/砲彈美術風格 (`paint:units`，§六)、戰場圖層/地形著色/裝飾/坦克渲染規則與 `CREDITS.md` 維護要求。
5. **[05-map-layout-design.md](./05-map-layout-design.md)**  
   地圖版型設計守則：浮空島 / 吊橋 / 雙層薄地 / 階梯台地 / 不可破壞基岩的 `layout` 特徵、多層地形貼地與行走規則，以及參考其他遊戲時的版權守則。
6. **[06-gameplay-reference-and-physics.md](./06-gameplay-reference-and-physics.md)**  
   玩法參考（房間準備制、每台車兩種砲彈、回合倒數）與彈道物理守則：一般彈共用重力、固定播放時鐘、版權界線。
7. **[TODO-peerjs-signaling-server.md](./TODO-peerjs-signaling-server.md)**  
   自建輕量 PeerJS 信令伺服器（`server/` + `docker-compose.yml`）與前端環境變數彈性切換 / 自動 Fallback 規格，以及房間目錄 API（房間列表，僅自建伺服器可用）。

## 待辦清單
尚未完成的工作統一維護於根目錄 [`todo.md`](../todo.md)。

## 新增文件命名規範
後續新增文件請統一放至此 `docs/` 目錄，並採 **`<兩位數序號>-<kebab-case-主題>.md`** 命名（例如：`03-p2p-protocol-spec.md`、`04-art-and-audio-pipeline.md`），以維持閱讀順序與擴充性。

## 技術棧
技術棧清單維護於根目錄 [`AGENTS.md`](../AGENTS.md) 第 5 節（Vue 3 + TS、Vite、Tailwind 4、Phaser 3、PeerJS、Rust/WASM 等）；變動時須同步更新。
