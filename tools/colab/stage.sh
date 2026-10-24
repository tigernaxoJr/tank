#!/usr/bin/env bash
# 步驟 1：把「還沒有高模」的坦克設計圖 + 批次筆記本複製到 tools/colab/inbox/，整個資料夾上傳 Drive 即可跑。
#   bash tools/colab/stage.sh
# 只複製 <id>_tank.jpg（不含 _projectile.jpg 等，批次筆記本會把資料夾內所有圖片都轉成 3D）；
# refs/<id>/ 的設計圖原地保留。
set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
INBOX="$ROOT/tools/colab/inbox"
mkdir -p "$INBOX"
n=0
for d in "$ROOT"/tools/blender/refs/*/; do
  id="$(basename "$d")"
  img="$d${id}_tank.jpg"
  [ -f "$img" ] || continue
  if [ -f "$d${id}_tank.glb" ]; then echo "略過（已有高模）: $id"; continue; fi
  cp "$img" "$INBOX/"; echo "放入: ${id}_tank.jpg"; n=$((n+1))
done
cp "$ROOT/tools/colab/trellis2_batch_folder.ipynb" "$INBOX/"
echo "共 $n 張待生成；資料夾：$INBOX"
