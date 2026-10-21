# 專案規劃書：WebRTC 網頁版回合制拋物線坦克對戰 (Tank Artillery Web)

## 一、 開發者背景與專案目標

### 1. 開發者背景與優勢
* **工程與語言能力**：具備前後端語言經驗與工程思維，擅長邏輯架構、系統設計與資料傳輸。
* **技術棧偏好**：以 **Rust (WebAssembly) + Vue 3 + TypeScript + Tailwind CSS** 為主軸。
* **限制與挑戰**：
  * 對遊戲引擎管線、遊戲迴圈（Game Loop）與遊戲專用演算法相對不熟悉。
  * 不具備專業美術、3D 建模與音效製作背景。
* **開發策略**：
  * **AI 賦能 (AI-assisted)**：善用手邊 AI 工具解決遊戲開發知識盲區（如高度圖生成、彈道碰撞、確定性物理計算）與產生客製化美術素材（背景、材質）。
  * **槓桿免費開源生態**：全面導入 CC0 免費圖資（Kenney.nl）、Web 音效生成器（jsfxr）與免伺服器成本的 WebRTC P2P 連線架構，以「零伺服器營運成本、免從零手繪」的方式高效交付。

### 2. 專案核心目標
* **玩法類型**：2D 橫向卷軸回合制拋物線射擊（玩法參考經典回合制砲術遊戲（如《彈彈堂》、《Worms》））。
* **極致成本效益**：連線採用 WebRTC DataChannel (P2P)，搭配免費信令（PeerJS Cloud）與靜態託管（Cloudflare Pages / GitHub Pages），實現**零伺服器與頻寬開銷**。
* **跨平台確定性同步**：透過 Rust 編譯為 Wasm 運算，杜絕瀏覽器 JS 浮點數引擎差異，確保雙方在無中央伺服器情況下仍保持 100% 物理與地形破壞一致。
* **目標交付**：支援 **1v1 至 5v5（最多 10 人星狀 P2P 房間、開戰鎖房與防撞號）** 對戰、跨螢幕起伏山谷大地图（`2400×1100` ~ `2800×1250`）、Kenney CC0 側視戰車與無縫地表磚（見 04-art-asset-pipeline.md）、像素級砲擊破壞炸坑、投籃節奏的砲彈飛行鏡頭跟隨、完整戰車格納庫大廳與對戰 HUD。

---

## 二、 核心架構與技術選型

| 模組 | 選用技術 / 工具 | 說明與優勢 |
| :--- | :--- | :--- |
| **前端框架 & 狀態** | Vue 3 + TypeScript | 負責首頁 2.5D 戰車格納庫、1v1~5v5 房間配對大廳、遊戲 HUD (血條、風向儀、角度計、蓄力條)。 |
| **樣式工具** | Tailwind CSS | 建構明亮韓系街機風格（明亮街機風）的大廳與儀表板。 |
| **核心確定性引擎** | **Rust (Wasm) / Deterministic Core** | 將地形高度演算法、圓形彈坑破壞、確定性拋物線軌跡（定點數運算）獨立封裝，杜絕浮點數誤差，保證最多 10 人 P2P 絕對同步。 |
| **戰場渲染與鏡頭引擎** | **Phaser 3 (WebGL / Canvas)** | 負責跨螢幕大地图平滑鏡頭追焦、滑鼠拖曳瀏覽、視差滾動山脈、2.5D 戰車階層容器、投籃節奏的砲彈飛行尾焰與爆炸粒子特效。 |
| **美術資產管線** | **Kenney CC0 素材 + `tools/assets/bake_kenney_assets.py`** | 將側視戰車零件、視差背景、地表磚與爆炸序列烘焙為執行期資產（原 Blender CLI 管線保留作參考）。 |
| **連線協議** | WebRTC (PeerJS 星狀拓撲) | Host 擔任星狀轉發中心（最多 1 Host + 9 Guests），支援撞號自動重試、開戰後切斷公共信令註冊鎖房防亂入。 |
| **信令服務** | PeerJS Cloud (免費) | 僅在雙方配對建立連線時交換 SDP/ICE，遊戲連線後完全純 P2P。 |
| **美術資源** | Kenney.nl (CC0) / AI 生圖 | 載具與道具使用 Kenney 頂級免費素材；背景與場景使用 AI 生圖（Midjourney / SD / Recraft）切分為多層次視差滾動圖層。 |
| **音效資源** | jsfxr / Kenney Audio / Freesound | 發射、砲彈嘯叫、爆炸、金屬履帶聲；純 Web Audio API 播放。 |
| **靜態部署** | Cloudflare Pages / Vercel / GitHub Pages | 免費 HTTPS 靜態託管（WebRTC 必備 HTTPS 安全上下文）。 |

---

## 三、 免費資源與 AI 協作運用指南

### 1. 免費美術素材清單
* **載具與武器**：
  * **Kenney.nl** (CC0 授權，商用免費)：[Kenney Tanks](https://kenney.nl/assets/tanks) 或 [Kenney Topdown Tanks](https://kenney.nl/assets/top-down-tanks)，內含多種車身、砲管、履帶切片。
  * **OpenGameArt.org**：搜尋 "Artillery"、"Worms style terrain"、"Explosion spritesheet"。
* **特效與粒子**：
  * Kenney Particle Pack、爆炸 Spritesheet。
* **背景與地貌**：
  * 利用 AI 工具（Midjourney / Stable Diffusion / Recraft / DALL-E）提示詞生成橫向無縫卷軸圖層（如：`2d side-scrolling parallax background, stylized cartoon mountains, sky layer, seamless horizontal tile, vector game art --no tanks`）。
  * 地形表面材質紋理（泥土、草地）可由 AI 產生 256x256 Seamless texture，再交給 Canvas Pattern 填充。

### 2. 免費音效與音樂
* **音效生成器**：
  * [jsfxr](https://sfxr.me/) 或 [Chiptone]：生成懷舊 8-bit / 復古遊戲的開火、爆炸、倒數計時音效。
  * [Freesound.org] / Kenney Audio Pack：真實或卡通爆炸聲、風聲、履帶聲。
* **背景音樂**：
  * [Incompetech](https://incompetech.com/) (Kevin MacLeod, CC-BY) 或 Suno/Udio AI 生成輕快對戰 BGM。

### 3. 如何發揮 AI 最大效能
* **Rust 物理與地形演算法生成**：讓 AI 撰寫 Rust 端的「高度圖生成（Perlin Noise）」與「圓形破壞演算法（2D array / 1D Bitmask 挖洞）」，並提供單元測試。
* **Vue 3 UI 組件開發**：將 HUD、風向指南針、力度計交由 AI 撰寫成 Tailwind Vue 元件。
* **P2P 協議除錯**：請 AI 設計並校驗房間建立、斷線重連、雙方 Frame Lockstep 或 Event 同步的狀態機邏輯。

---

## 四、 系統架構與狀態同步設計

### 1. 雙層分工架構 (Vue + TS + Rust Wasm) 與 VSA + 務實 DDD 原則

> 詳細目錄規範與低階 Subagent 任務派發指南請參閱 [02-architecture-and-subagent-guide.md](./02-architecture-and-subagent-guide.md)。
> * **VSA (Vertical Slice Architecture) 模組隔離**：以業務切片（`features/battle`、`features/lobby`、`features/audio` 及 Rust `terrain`、`ballistics`、`combat`、`prng`）作為邊界，切片間僅透過 `shared/kernel` 契約通訊，方便將單一切片獨立派發給較低階的 Subagent 完成。
> * **務實 DDD (Pragmatic DDD)**：中大型切片（如 `battle`、`lobby`）區分 `domain` / `application` / `infra` / `ui`；小型單純切片（如 `audio`、`prng`）直接單檔內聚實作，禁止過度拆分與空殼抽象。

```text
┌────────────────────────────────────────────────────────┐
│                      Vue 3 + TS                        │
│   [Lobby / UI / HUD] ◄─── PeerJS (WebRTC DataChannel)  │
│           │                                            │
│           ▼ (每幀驅動 / 傳入玩家操控事件)             │
│   [Render Pipeline (2D Canvas)]                        │
└───────────┬────────────────────────────────────────────┘
            │ 記憶體共享 (Shared Memory / TypedArray)
            ▼
┌────────────────────────────────────────────────────────┐
│                   Rust (WASM Engine)                   │
│  - PRNG (隨機種子產生器: 地形/風向/掉落物)             │
│  - 地形高度圖與像素遮罩 (Terrain Bitmask)               │
│  - 圓形彈坑破壞演算法 (Dig Hole & Collapse)            │
│  - 確定性拋物線物理軌跡 (Fixed-point / Deterministic)  │
│  - 坦克受損、下墜與法向量貼地角度計算                 │
└────────────────────────────────────────────────────────┘
```

### 2. 確定性同步模型（Deterministic Sync）
* **地圖生成**：Host 廣播一個整數 `seed`，雙方 Rust 模組依相同 PRNG 演算法產生 100% 一致的地形曲線。
* **操作同步 (Turn Actions)**：發射端在發射時送出參數，雙方本地丟入 Rust 物理核心運算：
  ```json
  {
    "type": "ACTION_FIRE",
    "turnId": 5,
    "playerId": "p1",
    "angle": 45.0,
    "power": 80.0,
    "wind": 12,
    "bulletType": "MISSILE_STANDARD"
  }
  ```
* **校驗機制**：回合結束時，雙方回傳一個輕量 `hash(terrain_pixels_sample + tank_hps)`，若不一致則由 Host 強制同步修正。

---

## 五、 核心功能與開發里程碑 (Milestones)

### Phase 1: Rust Wasm 核心與 Canvas 原型 (Week 1)
* [ ] **Rust 專案建立**：配置 `wasm-pack`，匯出地形結構體與物理模擬函式。
* [ ] **可破壞地形實作**：
  * Rust 管理寬度 $W \times H$ 的像素/遮罩陣列。
  * 實作 `carve_circle(x, y, radius)`，並輸出 Dirty 區塊給 JS Canvas 更新。
* [ ] **確定性拋物線物理**：
  * 風向向量、重力加速度常數、速度積分。
  * 每步步進檢測是否撞擊地形或邊界。

### Phase 2: Vue 3 + Tailwind 遊戲前端與單機雙人 (Week 2)
* [ ] **Vue 3 整合**：以 Vite + Vue 3 載入 Wasm 模組。
* [ ] **Tailwind HUD 與控制介面**：
  * 角度調整器、蓄力條（長按空白鍵震盪計）、回合倒數計時器、風向風速指示。
* [ ] **坦克操控與動態**：
  * 依地形法向量旋轉車身角度；地面被炸空時觸發下墜動畫。
* [ ] **熱座模式 (Pass & Play)**：P1 與 P2 在同一個鍵盤/畫面輪流操作射擊，驗證打擊手感與傷害判定。

### Phase 3: WebRTC P2P 連線對戰 (Week 3)
* [ ] **PeerJS 大廳介面**：
  * 一鍵開房：生成 4~6 碼短房間號或分享連結。
  * 加入房間：輸入房號即刻連線。
* [ ] **連線狀態機處理**：
  * 握手階段（Host 傳送地圖種子、雙方角色選擇）。
  * 戰鬥階段（移動位置同步、發射事件廣播）。
  * 斷線優雅處理與重連判定。

### Phase 4: 素材打磨、音效與發布 (Week 4)
* [ ] **素材置換**：換入 Kenney 坦克精靈圖、多層視差滾動背景。
* [ ] **視覺特效**：爆風火花粒子、爆炸彈坑周圍碎石飛散、受擊鏡頭震動（Screen Shake）。
* [ ] **音效系統**：整合 jsfxr 音效與背景音，支援靜音/音量滑桿。
* [ ] **自動化構建與上線**：配置 GitHub Actions 自動 `wasm-pack build` 並部署至 Cloudflare Pages。

---

## 六、 潛在挑戰與解法

1. **Wasm 與 JS 傳輸效能**：
   * *解法*：不每幀傳遞整個大畫布，而是透過 Wasm 共享記憶體（`WebAssembly.Memory`）或僅在爆炸時回傳受影響的局部髒矩形（Dirty Rect），將繪製負擔降到最低。
2. **跨 NAT P2P 穿透**：
   * *解法*：預設提供 Google 免費公用 STUN 伺服器；遇極端對稱型 NAT 連不上時，介面友善提示並提供單機雙人模式。
3. **Rust 學習曲線**：
   * *解法*：初期僅將「拋物線步進」與「遮罩布林挖洞」2~3 個函數交由 Rust 處理，其餘邏輯仍可由 TypeScript 承擔，後續再逐步將規則移入 Rust。
