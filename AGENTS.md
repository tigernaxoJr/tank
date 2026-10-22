# AGENTS.md — 專案開發與規則演進守則

本文件為 AI Agent 在 `tank` 專案中協作時的最高指導原則。

## 1. 持續演進的文件同步守則 (Continuous Rule Documentation)
- **核心規則**：當使用者下達任何指令時，只要 Agent 判斷其中包含**新的設計規則、架構限制、玩法節奏、UI/UX 規範或工程慣例**，就必須把它整理進 `docs/` 目錄下的對應文件（例如 [`docs/02-architecture-and-subagent-guide.md`](./docs/02-architecture-and-subagent-guide.md)、[`docs/06-gameplay-reference-and-physics.md`](./docs/06-gameplay-reference-and-physics.md) 或 [`docs/README.md`](./docs/README.md)）。
- **先問再寫（確認流程）**：下列情況，Agent **不得直接動手改文件或 `AGENTS.md`，必須先問使用者並取得同意**，同意後才寫入：
  1. 使用者下達的指令**更改了遊戲設計**（玩法、數值平衡原則、砲彈 / 坦克 / 地圖設計規則、UI 流程等）。
  2. 使用者下達的指令**更改了 Agent 的工作規則**（也就是要修改 `AGENTS.md` 本身）。
  3. Agent 自己判斷**有需要記進文件的內容**（新的慣例、踩到的坑、決策原因、待辦、工具安裝紀錄等）。
- 詢問時要說清楚：**打算寫進哪個檔案、哪個章節、大致寫什麼**，讓使用者能一次回覆「好」或指定修改；使用者拒絕或要求調整時照辦，不要自行寫入。
- 例外：使用者**明確要求**「寫到文件 / 加入 AGENTS.md」時，視為已經同意，可直接寫入，不必再問。
- 此規則取代舊的「不需等待、主動同步更新文件」做法；原本就必須同步維護的清單（技術棧表、`docs/README.md` 索引、`todo.md` 勾選狀態）在對應變動發生時仍要更新，但新增規則內容仍須先問。

## 2. 專案核心架構與遊戲設計守則索引
詳細規範請見 [`docs/02-architecture-and-subagent-guide.md`](./docs/02-architecture-and-subagent-guide.md)：
1. **VSA 垂直切片 + 務實 DDD**：
   - 功能依 `src/features/<slice>`（`battle`、`lobby`、`audio`）垂直隔離，跨切片僅能透過 `src/shared/kernel/types.ts` 或各 Slice 的 `index.ts` 互動。
   - 中大型模組分層（`domain/`、`application/`、`engine/`、`infra/`、`ui/`），小型模組（如 `audio`、`prng`、`combat`）維持單檔實作，禁止過度設計（YAGNI）。
2. **三大模組化基底註冊表（Registry Pattern）**：
   - 2.5D 坦克（[`tankRegistry.ts`](./src/features/battle/domain/tankRegistry.ts)）、跨螢幕大地圖（[`mapRegistry.ts`](./src/features/battle/domain/mapRegistry.ts)）、砲彈與尾焰特效（[`projectileRegistry.ts`](./src/features/battle/domain/projectileRegistry.ts)）皆採資料驅動註冊表設計，以利日後擴充；坦克與砲彈採「一檔一模組」（`domain/tanks/<id>.ts`、`domain/projectiles/<name>.ts`），由註冊表以 `import.meta.glob` 自動收集，新增項目只需新增一個檔。
3. **投籃拋物線節奏 (Basketball Arc Pacing)**：
   - 開火後必須先由 Phaser 3 鏡頭平滑跟隨砲彈飛行（約 `1.6s ~ 3.3s` 滯空並噴發尾焰），抵達落點瞬間才挖坑扣血，且爆炸後鏡頭需停留約 `1s`（`postImpactHoldMs`）再移交下一回合。
4. **彈道物理一致性**：
   - 一般砲彈共用同一個重力（`STANDARD_GRAVITY_MILLI`），播放時鐘固定為每模擬步 `PLAYBACK_MS_PER_STEP`，不依射程拉伸；僅特殊彈可自訂重力。詳見 [`docs/06-gameplay-reference-and-physics.md`](./docs/06-gameplay-reference-and-physics.md)。
5. **坦克與砲彈平衡**：
   - 設計砲彈須同時考量四個維度：**控制力**（力道 / 風 / 輔助瞄準的容錯）、**血量**、**威力**、**射擊樣式**（單發、霰彈、自動瞄準等），並維持總強度預算相等，詳見 `docs/06` §三之一。
   - 威力要拆成**地形破壞力**與**對坦克破壞力**兩個獨立數值；砲彈可附帶狀態特效（中毒、冰凍 / 減速等，以回合計、確定性結算、不得硬控），規格與建議見 `docs/06` §三之二。
   - 原則是「血量愈少輸出愈高」，砲彈之間不得有嚴格優劣；調整 `tankRegistry` / `projectileRegistry` 數值後必須執行 `node tools/balance/duel_sim.mjs` 確認各配對勝率在約 40%~60%。詳見 [`docs/06-gameplay-reference-and-physics.md`](./docs/06-gameplay-reference-and-physics.md) §三。
6. **全畫面街機駕駛艙 HUD 與零捲動守則**：
   - 戰鬥畫面必須以 `100dvh`（`fixed inset-0`）全視窗呈現，所有儀表板與控制項直接疊加在遊戲畫布上（禁止傳統 HTML 表單滑桿與網頁捲動），且對戰設定區必須支援直覺選車。
7. **遊戲大廳美學與零表單捲動守則 (Lobby Visual Style: Sky, War, Joy)**：
   - 大廳走「天空 (Sky) × 戰爭 (War) × 歡樂 (Joy)」明亮街機風格，主色為湛藍、陽光金、暖橘與亮白，**嚴禁使用果青色 (Murky Teal / Cyan-green) 等濁色調**。
   - 大廳 UI 採「卡通粗描邊」視覺系統（深墨色粗外框、色塊上疊每種表面專屬的手工紋理、硬陰影，token 與 `.toon-*` 元件類別集中在 `src/style.css`，新元件只能組合它們）。
   - 地圖禁止下拉捲動表單，改以地圖卡（左右箭頭切換）+ 彈窗圖庫；坦克採「我的戰車卡」2.5D 展示台；大廳動態載入地圖視差圖層維持遊戲質感。詳見 [`docs/02-architecture-and-subagent-guide.md`](./docs/02-architecture-and-subagent-guide.md)。
8. **Git Commit 鐵律**：
   - 在使用者給出明確的 commit 指令前，**絕對禁止**自行執行 `git commit`。

## 3. 工具與依賴自主權 (Tooling Autonomy)
- Agent 若需要工具、函式庫、框架或**引擎**（npm 套件、CLI、cargo crate、物理／音效／渲染引擎、影片與素材處理工具如 `yt-dlp`、`ffmpeg` 等）來完成任務，**可自行安裝與引入**，無需事先詢問。
- 安裝後須同步更新 `package.json` / `Cargo.toml` 等依賴宣告，並將其記錄至下方技術棧文件（工具型安裝若只在本機使用、不進專案，記在 `docs/` 對應文件即可）。
- 例外仍須遵守：下載來源不明的檔案要放在獨立資料夾、不得把第三方遊戲的美術／音樂／文字帶進專案（見 `docs/05-map-layout-design.md` 版權守則）；**整套取代**現有核心（Vue、Phaser、PeerJS 等）仍屬第 4 節的重大改動。

## 4. 重大改動須先與人類討論 (Major Changes Require Discussion)
- 下列屬**重大改動**，動工前**必須先與使用者討論並取得同意**：
  - **整套更換**核心技術棧（如換前端框架、換掉 Phaser 或網路層）；在既有核心上**新增**引擎或函式庫屬第 3 節的自主範圍，不在此限。
  - 變更 VSA 切片邊界、註冊表機制等架構原則。
  - 大規模重構、刪除既有功能、破壞性的資料／協定格式變更。
- 一般性新增功能、Bug 修復、小型依賴引入屬日常改動，可直接進行。

## 6. 缺口評估原則 (Gap Assessment)
- 被問到「還有什麼缺口」或規劃下一步時，Agent 依下列優先順序評估與排列，`todo.md` 也照此分區：
  1. **缺少的程式碼與 bug**（含文件與實作不一致、測試缺口、兩端行為不一致）——最優先。
  2. **遊戲性**（平衡、手感、玩家可感知的行為）。
  3. **未實作的功能**（尚在評估、待討論的構想與新內容）。
- 先實際檢查（型別檢查、測試、閱讀程式碼）再列缺口；未驗證的推測要標明「疑似、待驗證」。

## 5. 技術棧 (Tech Stack) — 須隨變動同步維護
| 領域 | 技術 |
|---|---|
| 前端框架 | Vue 3 + TypeScript (`vue-tsc`) |
| 建置工具 | Vite 6 |
| 套件管理 | pnpm 10（`packageManager` 欄位鎖定版本，`pnpm-lock.yaml` 須提交；`server/` 目前仍為 npm） |
| 樣式 | Tailwind CSS 4 (`@tailwindcss/vite`) |
| 遊戲引擎／渲染 | Phaser 3（2.5D 戰鬥場景、鏡頭、特效） |
| 測試 | Vitest（`pnpm test`，測試在 `src/test/`；Rust 核心用 `pnpm run test:rust`） |
| 連線 | PeerJS (WebRTC P2P) + 輕量信令伺服器 (`server/`, Node.js)；`@noble/hashes`（SHA-256，連線對戰的彈藥承諾 / 揭露） |
| 核心運算 | Rust → WebAssembly (`crates/tank-core`, `wasm-pack`) |
| 美術資產管線 | Blender 算繪 (`tools/blender`)、Kenney 烘焙 (`tools/assets/bake_kenney_assets.py`, Pillow)、原創地圖主題、Q 版坦克/砲彈與大廳/HUD 紋理程式繪製 (`tools/assets/paint_map_themes.mjs`、`tools/assets/paint_units.mjs`、`tools/assets/paint_ui.mjs`, `@resvg/resvg-js` devDependency)、vtracer / magick / svgo / rembg（見 [`docs/04-art-asset-pipeline.md`](./docs/04-art-asset-pipeline.md)） |
| 素材授權 | Kenney CC0 + 專案原創程式繪製美術（地圖主題、坦克、砲彈；見 `CREDITS.md`） |
- 新增、移除或升級上述任一技術時，**必須同步更新本表**與 [`docs/README.md`](./docs/README.md)。
