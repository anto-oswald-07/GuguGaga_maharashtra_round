#!/usr/bin/env bash
# adapt-aspect.sh — center-crop (default) or pad a video to 16:9 / 9:16 / 1:1.
# Usage:
#   ./scripts/media/adapt-aspect.sh [INPUT] [ASPECT] [OUTPUT]
# Defaults:
#   INPUT  = storage/samples/dummy.mp4
#   ASPECT = R_9_16   (R_16_9 | R_9_16 | R_1_1 | all)
#   OUTPUT = storage/samples/dummy-adapt-<aspect>.mp4  (or outdir when ASPECT=all)
#
# Env:
#   FIT=crop|pad   (default crop — center fill)
#   PRESET=ultrafast
#   CRF=23
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
INPUT="${1:-$ROOT/storage/samples/dummy.mp4}"
ASPECT="${2:-R_9_16}"
FIT="${FIT:-crop}"
PRESET="${PRESET:-ultrafast}"
CRF="${CRF:-23}"

if [[ ! -f "$INPUT" ]]; then
  echo "Input missing: $INPUT" >&2
  echo "Run ./scripts/media/make-dummy-video.sh first." >&2
  exit 1
fi

dims_for() {
  case "$1" in
    R_16_9) echo "1280 720" ;;
    R_9_16) echo "720 1280" ;;
    R_1_1)  echo "1080 1080" ;;
    *) echo "Unknown aspect: $1 (use R_16_9 | R_9_16 | R_1_1 | all)" >&2; exit 1 ;;
  esac
}

filter_for() {
  local w="$1" h="$2"
  if [[ "$FIT" == "pad" ]]; then
    echo "scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:black,setsar=1"
  else
    echo "scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1"
  fi
}

run_one() {
  local aspect="$1"
  local output="$2"
  read -r W H <<<"$(dims_for "$aspect")"
  local vf
  vf="$(filter_for "$W" "$H")"
  mkdir -p "$(dirname "$output")"
  echo "adapt $aspect (${W}x${H}, fit=$FIT) → $output"
  ffmpeg -y -i "$INPUT" -vf "$vf" \
    -c:v libx264 -preset "$PRESET" -crf "$CRF" \
    -c:a aac -b:a 128k -movflags +faststart \
    "$output" </dev/null
  ffprobe -v error -show_entries stream=width,height -of csv=p=0:s=x "$output" | head -1
}

if [[ "$ASPECT" == "all" ]]; then
  OUTDIR="${3:-$ROOT/storage/samples}"
  mkdir -p "$OUTDIR"
  for a in R_16_9 R_9_16 R_1_1; do
    slug="$(echo "$a" | tr '[:upper:]' '[:lower:]' | tr '_' '-')"
    run_one "$a" "$OUTDIR/dummy-adapt-${slug}.mp4"
  done
else
  slug="$(echo "$ASPECT" | tr '[:upper:]' '[:lower:]' | tr '_' '-')"
  OUTPUT="${3:-$ROOT/storage/samples/dummy-adapt-${slug}.mp4}"
  run_one "$ASPECT" "$OUTPUT"
fi
