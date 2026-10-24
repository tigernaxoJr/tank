#!/usr/bin/env bash
# 建立降面用的 Python 虛擬環境（一次即可）：bash tools/blender/lowpoly/setup_venv.sh
# pymeshlab 目前沒有 Python 3.14 的 wheel，所以固定用 3.12（需要 uv：https://docs.astral.sh/uv/）
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
uv venv --python 3.12 "$HERE/.venv"
if [ -x "$HERE/.venv/Scripts/python.exe" ]; then PY="$HERE/.venv/Scripts/python.exe"; else PY="$HERE/.venv/bin/python"; fi
uv pip install --python "$PY" -r "$HERE/requirements.txt"
echo "ok: $PY"
