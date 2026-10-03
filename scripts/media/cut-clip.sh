#!/usr/bin/env bash
# cut-clip.sh — cut a precise time window from a video to MP4 (Phase 7).
# Usage:
#   ./scripts/media/cut-clip.sh [INPUT] [OUTPUT] [START_SEC] [END_SEC]
# Defaults (2s smoke from dummy):
#   INPUT     = storage/samples/dummy.mp4
#   OUTPUT    = storage/samples/dummy-clip.mp4
#   START_SEC = 1
#   END_SEC   = 3
#
# Env:
#   MODE=reencode|copy   (default reencode — accurate; copy may keyframe-drift)
#
# Production render path (SDD):
#   storage/workspaces/{workspaceId}/renders/{jobId}/output.mp4
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INPUT="${1:-$ROOT/storage/samples/dummy.mp4}"
OUTPUT="${2:-$ROOT/storage/samples/dummy-clip.mp4}"
START_SEC="${3:-1}"
END_SEC="${4:-3}"
MODE="${MODE:-reencode}"

if ! command -v ffmpeg >/dev/null 2>&1 || ! command -v ffprobe >/dev/null 2>&1; then
  echo "ERROR: ffmpeg/ffprobe missing. Run ./scripts/media/check-ffmpeg.sh" >&2
  exit 1
fi

if [[ ! -f "$INPUT" ]]; then
  echo "ERROR: input video not found: $INPUT" >&2
  echo "Hint: ./scripts/media/make-dummy-video.sh" >&2
  exit 1
fi

DURATION="$(awk -v s="$START_SEC" -v e="$END_SEC" 'BEGIN {
  d = e - s;
  if (d <= 0) { exit 1 }
  printf "%.3f", d
}')" || {
  echo "ERROR: END_SEC must be > START_SEC (got ${START_SEC} .. ${END_SEC})" >&2
  exit 1
}

mkdir -p "$(dirname "$OUTPUT")"

if [[ "$MODE" == "copy" ]]; then
  # Fast but may start at prior keyframe.
  ffmpeg -y \
    -ss "$START_SEC" \
    -i "$INPUT" \
    -t "$DURATION" \
    -c copy \
    -avoid_negative_ts make_zero \
    "$OUTPUT"
else
  # Default: re-encode for accurate boundaries (Phase 7 choice).
  ffmpeg -y \
    -i "$INPUT" \
    -ss "$START_SEC" \
    -t "$DURATION" \
    -c:v libx264 -preset ultrafast -crf 23 \
    -c:a aac -b:a 128k \
    -movflags +faststart \
    "$OUTPUT"
fi

echo "Wrote clip: $OUTPUT (start=${START_SEC}s end=${END_SEC}s dur=${DURATION}s mode=${MODE})"
ls -lh "$OUTPUT"
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$OUTPUT" \
  | awk '{ printf "ffprobe duration: %.3fs\n", $1 }'
