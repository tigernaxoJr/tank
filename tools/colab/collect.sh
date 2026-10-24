#!/usr/bin/env bash
# 步驟 2：把使用者在 Colab 做完的高模搬回 tools/blender/refs/<id>/。
#   bash tools/colab/collect.sh <含 GLB 的資料夾> [--dry]
# 只處理 <id>_tank.glb（對應 refs/<id>/ 必須存在）；Colab 順手輸出的 <id>_tank_<面數>.glb 對照檔不搬。
# 目的地已有同名高模時不覆蓋，需要使用者先確認。
set -e
SRC="$1"; DRY="$2"
[ -d "$SRC" ] || { sed -n '2,6p' "$0"; exit 1; }
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
for f in "$SRC"/*_tank.glb; do
  [ -f "$f" ] || continue
  b="$(basename "$f")"; id="${b%_tank.glb}"
  dest="$ROOT/tools/blender/refs/$id"
  if [ ! -d "$dest" ]; then echo "略過（refs 沒有 $id）: $b"; continue; fi
  if [ -f "$dest/$b" ]; then echo "略過（已存在，不覆蓋）: $dest/$b"; continue; fi
  if [ "$DRY" = "--dry" ]; then echo "[dry] 會搬: $b -> refs/$id/"; else mv "$f" "$dest/$b"; echo "已搬: $b -> refs/$id/"; fi
done
