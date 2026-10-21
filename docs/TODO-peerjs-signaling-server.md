# 待辦評估：自建輕量 PeerJS 信令伺服器與前端彈性切換

## 1. 背景與動機
目前遊戲的多人連線機制依賴 PeerJS 官方提供的免費公共信令伺服器進行房間註冊與 WebRTC 握手（Signaling）。

* **優點**：架構純前端、免伺服器運維成本、開箱即用。
* **潛在風險**：
  1. **房間 ID 全球共用**：雖有加前綴，但在公共伺服器上若遇相同房號會產生衝突報錯。
  2. **尖峰時期進房塞車**：全球多個專案共用公共信令伺服器，人多時開房/進房握手可能出現連線逾時。
  3. **缺乏掌控度**：無法限制惡意流量或自訂房間連線生命週期。

> **註**：遊戲對戰本身是 WebRTC DataChannel P2P（點對點）直連，**對戰中的頻寬與延遲不受伺服器影響**，此處改進僅針對「進房牽線（Signaling）」階段。

---

## 2. 目標架構

1. **極輕量專用信令伺服器**：
   - 僅負責玩家連線握手（SDP/ICE 交換），不處理遊戲邏輯、不中繼遊戲即時資料。
   - 資源消耗極低，可在免費或低成本容器/VPS（Docker / Fly.io / Render / Railway）上運行。

2. **前端彈性連接（相容模式）**：
   - 保留未配置私有伺服器時的開箱即用能力。
   - 支援透過環境變數無痛切換「自建伺服器」或「官方公共伺服器」。
   - （可選）進階實作自建伺服器連線失敗時自動 Fallback 至公共伺服器。

---

## 3. 實作規劃

### Phase 1: 輕量信令服務端 (`server/`)
- 使用 Node.js 官方 `peer` 套件：
  ```javascript
  import { PeerServer } from 'peer';

  const PORT = process.env.PORT || 9000;
  const server = PeerServer({
    port: Number(PORT),
    path: '/signaling',
    allow_discovery: true,
  });

  console.log(`PeerJS signaling server running on port ${PORT}`);
  ```
- 提供基礎 `Dockerfile` 與 `docker-compose.yml` 方便一鍵部署。

### Phase 2: 前端連線配接器重構 (`src/features/lobby/infra/peerAdapter.ts`)
- 讀取 Vite 環境變數：
  ```typescript
  // .env 或 .env.production
  VITE_PEER_HOST="signaling.example.com"
  VITE_PEER_PORT="443"
  VITE_PEER_PATH="/signaling"
  VITE_PEER_SECURE="true"
  ```
- 封裝 `getPeerConfig()`：
  - 若環境變數完整指定，連線至專屬伺服器。
  - 若未指定環境變數，維持使用預設 PeerJS 官方公共伺服器。
- （可選）加入 ICE / STUN / TURN 擴充配置位，以備未來網路環境嚴苛時加掛 TURN 伺服器。

---

## 3.5 房間目錄 API（房間列表）

**限制：只有連線到自建信令伺服器時才有房間列表。** 公共信令伺服器（`0.peerjs.com`）沒有 `/rooms`，連線者清單也不開放（實測皆為 404），
所以沒設定 `VITE_PEER_HOST` 時，大廳不顯示列表，只提示「請輸入 6 碼房號」。自建伺服器已設定但連不上時，列表顯示「無法連線到房間目錄」，仍可輸入房號加入。

目錄由 `server/roomDirectory.js` 實作，與信令共用同一個連接埠；前端客戶端為 `src/features/lobby/infra/roomDirectory.ts`。
目錄只存房間公開資訊（房號、房名、房主暱稱、地圖、人數、狀態），不存任何 IP，也不中繼遊戲資料。

| 方法與路徑 | 說明 |
|---|---|
| `GET /rooms` | 回傳 `{ rooms: [...] }`；等待中的房間排前面，其次依最近更新時間 |
| `PUT /rooms/:code` | 註冊或更新房間，也當作心跳。body：`name`、`hostName`、`mapId`、`players`、`maxPlayers`、`status`（`waiting` / `playing`） |
| `DELETE /rooms/:code` | 移除房間（房主離開時呼叫） |

- **token**：第一次 `PUT` 會回傳 `token`；之後同一房號的更新與刪除都必須帶 `x-room-token`，否則回 403，避免他人劫持或惡意刪房。
- **心跳與逾時**：房主每 10 秒 `PUT` 一次；超過 `ROOMS_TTL_MS`（預設 30 秒）沒有心跳的房間自動清除，房主直接關頁面也不會留下殭屍房間。
- **驗證與防濫用**：房號必須是 6 碼（`A-Z`、`2-9`）；文字去除控制字元與 `<>` 並限制長度（房名 24、暱稱 16）；`mapId` 只允許小寫英數底線；
  人數 1 ~ 10；請求本體上限 2KB；每個 IP 每分鐘 120 次；目錄最多 500 間（超過回 503）。
- **容錯**：目錄是加分功能，連不上時前端只顯示提示，不影響開房、進房與對戰。
- **伺服器環境變數**：`ROOMS_PATH`（預設 `/rooms`）、`ROOMS_TTL_MS`、`ALLOWED_ORIGIN`（CORS，預設 `*`，正式環境建議設成遊戲網址）。
- **前端環境變數**：`VITE_ROOMS_PATH`（預設 `/rooms`）；其餘由 `VITE_PEER_HOST` / `VITE_PEER_PORT` / `VITE_PEER_SECURE` 推導。
- **測試**：`cd server && npm test`（`roomDirectory.test.mjs`，涵蓋驗證、token、逾時排序、上限與限流）。
- **部署注意**：`server/Dockerfile` 必須同時複製 `index.js` 與 `roomDirectory.js`。

---

## 4. 驗收標準 (已完成實作)
- [x] 未設定環境變數時，本機或展示部署仍可透過公共 PeerJS 正常開房與對戰（`getPeerConfig()` 預設使用 `0.peerjs.com`）。
- [x] 設定自建伺服器環境變數（`VITE_PEER_HOST` / `VITE_PEER_PORT` / `VITE_PEER_PATH` / `VITE_PEER_SECURE`）後，成功連線至私有信令伺服器（`server/index.js` 與 `docker-compose.yml`）進行牽線。
- [x] 模擬私有伺服器離線時，支援透過 `VITE_PEER_FALLBACK_PUBLIC=true`（預設開啟）自動平滑回退至官方公共池，或於關閉回退時顯示清楚的自建伺服器離線錯誤提示。
