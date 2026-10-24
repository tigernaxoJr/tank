#!/usr/bin/env bash
# 步驟 3：替所有「有高模、還沒有 10k」的坦克補上 10k qcb。
#   bash tools/blender/lowpoly/run_missing.sh [target=10000]
# 沿用 run.sh：refs/<id>/boost.txt 存在才是 qcb（眼睛 / 砲口加權），沒有就是未加權的 qu 版並提示。
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
T="${1:-10000}"
for d in "$ROOT"/tools/blender/refs/*/; do
  id="$(basename "$d")"
  hi="$d${id}_tank.glb"; out="$d${id}_tank_${T}.glb"
  [ -f "$hi" ] || continue
  if [ -f "$out" ]; then echo "略過（已有 ${T}）: $id"; continue; fi
  [ -f "$d/boost.txt" ] || echo "注意: $id 沒有 boost.txt，這次只會是未加權的 qu 版（請先找眼睛 / 砲口座標）"
  echo "== $id"; bash "$HERE/run.sh" "$hi" "$T"
done
