#!/usr/bin/env bash
# generate-thumb.sh — capture a mid-frame JPEG thumbnail from a video.
# Usage:
#   ./scripts/media/generate-thumb.sh [INPUT_VIDEO] [OUTPUT_JPEG]
# Defaults:
#   INPUT  = storage/samples/dummy.mp4
#   OUTPUT = storage/samples/dummy-thumb.jpg
#
# Production derivative path (SDD):
#   storage/workspaces/{workspaceId}/derivatives/{assetId}/thumb.jpg
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INPUT="${1:-$ROOT/storage/samples/dummy.mp4}"
OUTPUT="${2:-$ROOT/storage/samples/dummy-thumb.jpg}"

if ! command -v ffmpeg >/dev/null 2>&1 || ! command -v ffprobe >/dev/null 2>&1; then
  echo "ERROR: ffmpeg/ffprobe missing. Run ./scripts/media/check-ffmpeg.sh" >&2
  exit 1
fi

if [[ ! -f "$INPUT" ]]; then
  echo "ERROR: input video not found: $INPUT" >&2
  echo "Hint: ./scripts/media/make-dummy-video.sh" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUTPUT")"

DURATION="$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$INPUT" 2>/dev/null || true)"
SEEK="0"
if [[ -n "${DURATION:-}" ]]; then
  # bash arithmetic: mid-frame
  SEEK="$(awk -v d="$DURATION" 'BEGIN { if (d+0 > 0) printf "%.3f", d/2; else print "0" }')"
fi

ffmpeg -y \
  -ss "$SEEK" \
  -i "$INPUT" \
  -frames:v 1 \
  -q:v 2 \
  -update 1 \
  "$OUTPUT"

echo "Wrote thumbnail: $OUTPUT (seek=${SEEK}s)"
ls -lh "$OUTPUT"
