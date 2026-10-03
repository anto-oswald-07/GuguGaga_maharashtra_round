#!/usr/bin/env bash
# bake-demo-fallback.sh — pre-bake a tiny emergency "rendered clip" for demos.
# Does NOT commit the binary (storage/ is gitignored). Judges regenerate on site.
#
# Default output: storage/samples/demo-fallback-clip.mp4
#
# Usage:
#   ./scripts/media/bake-demo-fallback.sh
#   ./scripts/media/bake-demo-fallback.sh /path/to/out.mp4
#
# When to use (Integration / live demo):
#   If RENDER_CLIP / RENDER_TIMELINE fails mid-demo, upload or copy this file
#   as a stand-in Asset so Packs / download UI still works.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT="${1:-$ROOT/storage/samples/demo-fallback-clip.mp4}"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ERROR: ffmpeg not found. Run ./scripts/media/check-ffmpeg.sh first." >&2
  exit 1
fi

mkdir -p "$(dirname "$OUT")"

# 3s labeled 720x1280 (9:16) clip — looks like a Shorts/Reels render fallback.
# Keep ultrafast + short so bake is <2s on a laptop.
ffmpeg -y \
  -f lavfi -i "color=c=0x1a1a2e:s=720x1280:d=3:r=30" \
  -f lavfi -i "sine=frequency=523.25:sample_rate=44100:duration=3" \
  -vf "drawtext=text='CreatorAi demo fallback clip':fontsize=36:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:borderw=2:bordercolor=black" \
  -c:v libx264 -pix_fmt yuv420p -preset ultrafast -crf 28 \
  -c:a aac -b:a 96k \
  -shortest \
  -movflags +faststart \
  "$OUT"

echo "Wrote demo fallback clip: $OUT"
ls -lh "$OUT"
ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0:s=x "$OUT"
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$OUT" \
  | awk '{ printf "duration: %.3fs\n", $1 }'
echo "See docs/demo/media-checklist.md § Emergency fallback"
