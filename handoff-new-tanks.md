# 交接：新坦克 Bumble / Quillback / Hopper（2026-10-26）

給下一個 session 的 Agent。先讀這份，再看 `todo.md`「新坦克與新砲彈」區與 `docs/06` §三之十二、`docs/04`「新增坦克零件切割」。

## 狀態一句話

三台新坦克（蜜蜂 `bumble`、刺蝟 `quillback`、跳蛙 `hopper`）的貼圖、砲彈、狀態、數值都已接進遊戲並實機開過打；`vue-tsc` 與 121 個 Vitest 通過。**全部尚未 commit**（使用者還沒下 commit 指令，AGENTS §2.8 禁止自行 commit）。

## 作業模式（使用者 2026-10-26 指定，已寫進 docs/04 §八、docs/07 §四）

- **Agent 絕不呼叫 agy。** 給 agy 的 prompt 寫成文件（`tools/assets/agy-prompts/`），由使用者叫 agy 讀；每張圖只生一次，不重複列同一張。
- agy 完成後，Agent 指定檔案路徑，使用者叫 agy 搬、或自行放入；Agent 接手去背、切割、驗收。
- **新增設計規則、改 `AGENTS.md`、或 Agent 自己想記的內容，一律先問再寫 docs**；使用者明確說「寫進文件」才可直接寫。
- 使用者互動風格：直接給方向，細節放手讓 Agent 決定（這次三台坦克主題與數值都是 Agent 定的）。

## 已完成的內容

| 項目 | 位置 |
|---|---|
| 坦克藍圖 | `src/features/battle/domain/tanks/{bumble,quillback,hopper}.ts`（sortOrder 9 / 10 / 11） |
| 砲彈 | `projectiles/{bumble_swarm,bumble_hive,quill_roll,quill_rain,hopper_tongue,hopper_mud}.ts`（sortOrder 18~23） |
| 新狀態 | `statuses/mired.ts`（泥濘，移動燃料上限 −N%） |
| 舌鞭拉近 | `application/useBattleTurn.ts`：`knockbackPx < 0` 把範圍內坦克拉向射手，到離射手 `PULL_STOP_PX = 60` 為止，射手本人與免疫擊退者不受影響；`tankStats.ts` 顯示「拉近 N px」；`shotExtensions.ts` 註解已更新 |
| 貼圖 | `public/assets/units/tanks/<id>_{a,b}_{hull,barrel,collar,icon,…零件}.png`；砲彈 `public/assets/units/projectiles/shell_{bumble_swarm,bumble_hive,quill_roll,quill_rain,hopper_tongue,hopper_mud}.png` |
| 原圖 | `tools/blender/refs/<id>/<id>_{base,parts,expr,shells}.*`（agy 輸出副檔名 `.png` 但內容是 JPEG；Hopper 的 expr / shells 是網頁版 Gemini 的 `.jpg`） |
| 切割工具 | `tools/sprites2d/slice_parts.py`（新增 `--hue-max`、`--min-v`、`--part-scale`、5 件模式）、`composite_check.py`（`--flag-origin`、`--lid-origin`）、新增 `slice_shells.py`、`bumble_prep.py` |
| 文件 | `docs/06`（陣容表 + §三之十二）、`docs/04`（新增坦克零件切割）、`docs/07` §四（agy 作業模式）、`todo.md` |

零件 id 與錨點（皆車身貼圖像素，`scale 0.4`）：
- Bumble（車身 240×216）：`pivotTex [174,105]`、collar `[146,65]`、antenna `[80,18]` origin `[0.18,1]`、wing `[165,30]` origin `[0.5,1]`（`sway` 快速振翅）。
- Quillback（230×233）：`pivotTex [196,53]`、collar `[170,22]`、spikes `[150,165]` origin `[1,1]`、nose `[222,120]`。
- Hopper（260×201）：`pivotTex [98,16]`、collar `[69,1]`、leg `[62,206]` origin `[0.5,1]`（開火 `pop`）。

重切零件時，腳本輸出的零件檔名是 `flag` / `lid` / `extra`，**要手動改成上面的零件 id**（見 docs/04）。重切指令與參數：Bumble 先 `bumble_prep.py` 再 `slice_parts.py --hull-w 240 --trim-boxes "145,65,215,145" --collar 174,105,28,40 --barrel-scale 1,0.75 --hue-max 34 --min-v 125`；Quillback `--hull-w 230 --trim-boxes "170,20,225,90;40,140,205,235" --collar 196,53,26,34 --barrel-scale 1,0.72 --hue-max 34 --min-v 125`；Hopper `--hull-w 260 --trim-boxes "60,0,135,40" --collar 98,16,31,18 --barrel-scale 0.55,0.75 --hue-max 34 --min-v 175 --part-scale flag=0.5,lid=0.5,extra=0.5`。

## 數值與平衡

`node tools/balance/duel_sim.mjs`（跑約一分鐘）：σ = 25 / 45 / 70 三組，三台對其他機種大多 40%~60%；Quillback 對部分機種約 60%~63%（偏強，先降 `QUILL_ROLL` 單發 23），Hawkeye 原本就偏低。模擬器**不含**舌鞭拉近、泥濘、Bumble 免摔高爬坡、Quillback 裝甲，真實手感待實機。

## 未完成（優先順序）

1. **表情圖集（卡在 agy 額度）**：prompt 已寫好 `tools/assets/agy-prompts/expr-sheets-bumble-quillback-hopper.md`（純洋紅底、無格線與底磚）。使用者生好後輸出在 `tools/blender/refs/<id>/<id>_expr2.png`；Agent 做：`python -I tools/sprites2d/slice_expr.py <sheet> <outdir> --ball-px <車身眼球直徑 ×2>` → `pack_face_atlas.py <outdir> <id> [--scale]` → 在藍圖 `face` 加 `atlas: <ID>_FACE`（照 `tanks/hermit.ts`、`faceAtlases/hermit.ts`）→ 實機校正 `face.x / y / eyeGap`。第 4 列第 7 格刻意留空（`fx_star` 由程式畫）。舊的 `*_expr.png` 有底磚，不要用。
2. **實機校正**（`todo.md`）：臉座標是估計值；Bumble 臉在左（頭）、砲管在右（尾端蜂針）是否怪；Quillback 竹節砲管偏橄欖黃綠是否太濁；Hopper 後腿位置與下壓動畫；Hopper 基準圖車身自帶一隻閉眼，程式眼睛疊在上面；舌鞭拉近與泥濘手感。
3. **三項尚未實作的機制**（需新引擎機制，動工前先討論）：Bumble 懸浮走位、Quillback 近距離反傷、Hopper 跳躍位移。藍圖的 `passive.description` 已寫成「目前實際有的效果」，沒有宣稱未實作的機制。
4. 平衡模擬器補舌鞭 / 泥濘的效用模型。
5. 使用者下 commit 指令後：建議分成 ① agy 作業模式與 docs、② 新坦克資料與貼圖、③ 舌鞭拉近引擎與工具腳本 三個 commit（commit 訊息結尾要加 Co-Authored-By 行，見 session 附註）。

## 踩過的坑

- 本機 `python3` 是 Windows Store 佔位程式，會靜默失敗；一律用 `python`（3.14）。改 CRLF 檔（`docs/04`）要用 `newline=''` 讀寫，否則整檔換行會被改掉。
- 預覽伺服器 `vite`（port 5173）可能還在背景跑；戰鬥畫面載入時會先出現純藍畫面，等 3~5 秒。瀏覽器窗格大小不穩時，用 JS 依按鈕文字點（練習 → 換車 → 戰車名 → 開打）比用座標可靠。
- `slice_parts.py` 的陣營色轉換（橘 → 藍）預設色相 8~40、明度 > 60，會把棕色條紋 / 斑點與金黃陰影一起轉掉；新坦克用 `--hue-max` 與 `--min-v` 收緊，並用 `--trim-boxes` 限制車身的轉色範圍。
- 護套孔洞比砲管細（agy / Gemini 都這樣）：用 `--barrel-scale` 壓扁砲管，並讓護套前圈（`collar`，`z: overBarrel`）蓋在砲管上。
