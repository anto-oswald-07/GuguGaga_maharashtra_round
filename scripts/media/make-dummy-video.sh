#!/usr/bin/env bash
# make-dummy-video.sh — generate a tiny 5s test MP4 (color bars + sine audio).
# Default output: storage/samples/dummy.mp4 (do NOT commit this binary).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT="${1:-$ROOT/storage/samples/dummy.mp4}"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ERROR: ffmpeg not found. Run ./scripts/media/check-ffmpeg.sh first." >&2
  exit 1
fi

mkdir -p "$(dirname "$OUT")"

# 5 seconds, 640x360, H.264 + AAC sine tone — small and reliable for demos.
ffmpeg -y \
  -f lavfi -i "smptebars=size=640x360:rate=30" \
  -f lavfi -i "sine=frequency=440:sample_rate=44100" \
  -t 5 \
  -c:v libx264 -pix_fmt yuv420p -preset ultrafast -crf 28 \
  -c:a aac -b:a 128k \
  -shortest \
  "$OUT"

echo "Wrote dummy video: $OUT"
ls -lh "$OUT"
ffprobe -hide_banner "$OUT" 2>&1 | head -n 20 || true
