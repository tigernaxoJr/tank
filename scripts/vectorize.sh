#!/usr/bin/env bash
# PNG → SVG vectorizing pipeline (see docs/04-art-asset-pipeline.md §四).
#
#   rembg (bg removal) → Lanczos upscale → split alpha → remap RGB to source palette
#   → vtracer (spline) → svgo
#
# Usage:
#   scripts/vectorize.sh <input.png> [output.svg] [options]
#
# Options:
#   -s, --scale <pct>     upscale before tracing (default 400; use 100~200 for >=1024px images)
#   -c, --colors <n>      palette size, taken from the source's most frequent colors (default 20)
#   --rembg / --no-rembg  force / skip background removal (default: auto — only when the input
#                         has no transparent pixels)
#   --preview             also write <output>.preview.png (SVG rendered back to raster)
#   -k, --keep            keep the intermediate files and print their directory
#
# Requires: magick (ImageMagick 7), vtracer (cargo install vtracer — NOT the pip binding,
# which crashes on Python 3.14), svgo (npm i -g svgo), rembg (pip install "rembg[cpu,cli]",
# only when background removal runs; first run downloads a ~1GB model).
set -euo pipefail

die() { echo "vectorize: $*" >&2; exit 1; }

input="" output="" scale=400 colors=20 rembg=auto preview=0 keep=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    -s|--scale) scale="$2"; shift 2 ;;
    -c|--colors) colors="$2"; shift 2 ;;
    --rembg) rembg=yes; shift ;;
    --no-rembg) rembg=no; shift ;;
    --preview) preview=1; shift ;;
    -k|--keep) keep=1; shift ;;
    -h|--help) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) die "unknown option: $1" ;;
    *) if [[ -z "$input" ]]; then input="$1"; elif [[ -z "$output" ]]; then output="$1"; else die "too many arguments"; fi; shift ;;
  esac
done
[[ -n "$input" ]] || die "missing input (see --help)"
[[ -f "$input" ]] || die "no such file: $input"
[[ -n "$output" ]] || output="${input%.*}.svg"

# Locate tools; winget/cargo installs are not always on PATH in Git Bash.
export PATH="$PATH:$HOME/.cargo/bin"
MAGICK="$(command -v magick || true)"
if [[ -z "$MAGICK" ]]; then
  for m in /c/Program\ Files/ImageMagick*/magick.exe; do [[ -x "$m" ]] && MAGICK="$m"; done
fi
[[ -n "$MAGICK" ]] || die "ImageMagick 7 (magick) not found"
command -v vtracer >/dev/null || die "vtracer not found (cargo install vtracer)"
command -v svgo >/dev/null || die "svgo not found (npm i -g svgo)"

work="$(mktemp -d)"
if [[ $keep -eq 0 ]]; then trap 'rm -rf "$work"' EXIT; fi

# 1. Background removal. Skip when the image already carries transparency.
if [[ "$rembg" == auto ]]; then
  [[ "$("$MAGICK" "$input" -format '%[opaque]' info:)" == True ]] && rembg=yes || rembg=no
fi
if [[ "$rembg" == yes ]]; then
  command -v rembg >/dev/null || die "rembg not found (pip install \"rembg[cpu,cli]\")"
  echo "· removing background (rembg)"
  rembg i "$input" "$work/src.png" >/dev/null 2>&1 || die "rembg failed"
else
  "$MAGICK" "$input" -alpha on "$work/src.png"
fi

# 2. Palette = the N most frequent opaque colors of the source. Anti-aliased in-between
#    colors are rare, so they drop out; plain `-colors N` would drift hues instead.
"$MAGICK" "$work/src.png" -channel A -threshold 50% +channel -background none -alpha remove \
  -format %c histogram:info:- | sort -rn | head -n "$colors" | grep -o '#[0-9A-Fa-f]\{6\}' > "$work/pal.txt"
[[ -s "$work/pal.txt" ]] || die "could not extract a palette (image fully transparent?)"
mapfile -t swatches < <(sed 's/^/xc:/' "$work/pal.txt")
"$MAGICK" -size 1x1 "${swatches[@]}" +append "$work/pal.png"

# 3. Smooth upscale, with alpha handled separately: quantizing/remapping with alpha on turns
#    the transparent background into an opaque (or black) rectangle.
"$MAGICK" "$work/src.png" -filter Lanczos -resize "${scale}%" -alpha extract -threshold 50% "$work/mask.png"
"$MAGICK" "$work/src.png" -filter Lanczos -resize "${scale}%" -background "#808080" -alpha remove \
  -dither None -remap "$work/pal.png" "$work/rgb.png"
"$MAGICK" "$work/rgb.png" "$work/mask.png" -alpha off -compose CopyOpacity -composite "$work/flat.png"

# 4. Trace + optimize.
echo "· tracing (vtracer, $(wc -l < "$work/pal.txt") colors, ${scale}%)"
vtracer --input "$work/flat.png" --output "$work/raw.svg" --colormode color --mode spline \
  --filter_speckle 12 --color_precision 8 --gradient_step 16 --corner_threshold 60 --segment_length 6 >/dev/null
mkdir -p "$(dirname "$output")"
svgo -q "$work/raw.svg" -o "$output"

if [[ $preview -eq 1 ]]; then
  "$MAGICK" -background none "$output" "${output%.*}.preview.png"
fi

paths=$(grep -o '<path' "$output" | wc -l)
echo "✓ $output ($(wc -c < "$output" | tr -d ' ') bytes, $paths paths)"
[[ $keep -eq 1 ]] && echo "  intermediates: $work"
exit 0
