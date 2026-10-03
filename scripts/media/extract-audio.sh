#!/usr/bin/env bash
# extract-audio.sh — pull mono WAV/MP3 from a video for STT (Whisper) input.
# Usage:
#   ./scripts/media/extract-audio.sh [INPUT_VIDEO] [OUTPUT_AUDIO]
# Defaults:
#   INPUT  = storage/samples/dummy.mp4
#   OUTPUT = storage/samples/dummy-audio.wav
#
# Env overrides:
#   SAMPLE_RATE  — Hz (default 16000)
#   CHANNELS     — 1 or 2 (default 1)
#   FORMAT       — wav | mp3 (default from output extension, else wav)
#
# Production derivative path (SDD):
#   storage/workspaces/{workspaceId}/derivatives/{assetId}/audio.wav
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INPUT="${1:-$ROOT/storage/samples/dummy.mp4}"
OUTPUT="${2:-$ROOT/storage/samples/dummy-audio.wav}"
SAMPLE_RATE="${SAMPLE_RATE:-16000}"
CHANNELS="${CHANNELS:-1}"

if ! command -v ffmpeg >/dev/null 2>&1 || ! command -v ffprobe >/dev/null 2>&1; then
  echo "ERROR: ffmpeg/ffprobe missing. Run ./scripts/media/check-ffmpeg.sh" >&2
  exit 1
fi

if [[ ! -f "$INPUT" ]]; then
  echo "ERROR: input media not found: $INPUT" >&2
  echo "Hint: ./scripts/media/make-dummy-video.sh" >&2
  exit 1
fi

EXT="$(printf '%s' "${OUTPUT##*.}" | tr '[:upper:]' '[:lower:]')"
FORMAT="${FORMAT:-$EXT}"
if [[ "$FORMAT" != "wav" && "$FORMAT" != "mp3" ]]; then
  FORMAT="wav"
fi

mkdir -p "$(dirname "$OUTPUT")"

ARGS=(
  -y
  -i "$INPUT"
  -vn
  -ar "$SAMPLE_RATE"
  -ac "$CHANNELS"
)

if [[ "$FORMAT" == "wav" ]]; then
  ARGS+=(-acodec pcm_s16le "$OUTPUT")
else
  ARGS+=(-acodec libmp3lame -b:a "${BITRATE:-64k}" "$OUTPUT")
fi

ffmpeg "${ARGS[@]}"

echo "Wrote audio: $OUTPUT (format=${FORMAT}, ${SAMPLE_RATE}Hz, ${CHANNELS}ch)"
ls -lh "$OUTPUT"
ffprobe -hide_banner -show_streams -select_streams a "$OUTPUT" 2>&1 | head -n 25 || true
