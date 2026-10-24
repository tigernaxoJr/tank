#!/usr/bin/env bash
# TRELLIS.2 高模 GLB → 低面數、帶貼圖的 GLB（焊接 → MeshLab QEC → 重拆 UV → Cycles 烘焙 顏色 / ORM / 法線）
#   bash tools/blender/lowpoly/run.sh <high.glb> [target_tris=10000] [tex=2048] [out.glb]
# 預設輸出：<高模所在資料夾>/<高模檔名>_<target>.glb
# 環境變數：
#   BLENDER  blender.exe 路徑（預設 C:/Program Files/Blender Foundation/Blender 5.2/blender.exe）
#   BOOST    分部件預算，球形區域重要度倍數 "x,y,z,r,f;x,y,z,r,f"（座標為 Blender 匯入後的 Z-up、車頭朝 -Y；
#            眼睛 / 砲口這類小而圓的特徵適用，座標是每台坦克各自的）。
#            沒設時會讀「高模所在資料夾」的 boost.txt（內容就是上面那個字串）；兩者都沒有就不加權（qu 版）
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
[ -n "$1" ] || { sed -n '2,10p' "$0"; exit 1; }
HI="$(cygpath -m "$(realpath "$1")")"
T="${2:-10000}"; TEX="${3:-2048}"
STEM="$(basename "$HI" .glb)"
OUT="${4:-$(dirname "$HI")/${STEM}_${T}.glb}"; OUT="$(cygpath -m "$(realpath -m "$OUT")")"
B="${BLENDER:-/c/Program Files/Blender Foundation/Blender 5.2/blender.exe}"
if [ -x "$HERE/.venv/Scripts/python.exe" ]; then PY="$HERE/.venv/Scripts/python.exe"
elif [ -x "$HERE/.venv/bin/python" ]; then PY="$HERE/.venv/bin/python"
else echo "找不到 .venv，請先執行 bash tools/blender/lowpoly/setup_venv.sh"; exit 1; fi

W="$HERE/work/$STEM"; mkdir -p "$W"
A=$((T*1035/1000))   # Blender 匯入 PLY 會丟掉 ~3% 重複的非流形面，先多留一點

"$B" --background --python "$HERE/prep.py" -- "$HI" "$W/high_welded.ply"       # 焊接 UV 接縫拆開的頂點
"$B" --background --python "$HERE/weights.py" -- "$HI" "$W/weights.npz"        # 厚度 + 貼圖對比
EXTRA=()
if [ -z "$BOOST" ] && [ -f "$(dirname "$HI")/boost.txt" ]; then BOOST="$(tr -d '\r\n' < "$(dirname "$HI")/boost.txt")"; fi
if [ -n "$BOOST" ]; then echo "boost: $BOOST"; EXTRA=("boost=$BOOST"); else echo "boost: 無（qu 版，未加權眼睛 / 砲口）"; fi
"$PY" -I "$HERE/qec.py" "$W/high_welded.ply" "$W/low.ply" "$A" weights="$W/weights.npz" cgain=2 tcap=2 "${EXTRA[@]}"
"$B" --background --python "$HERE/bake.py" -- "$HI" "$W/low.ply" "$OUT" "$TEX" 0.015 0.05
echo "done: $OUT"
