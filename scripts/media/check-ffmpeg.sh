#!/usr/bin/env bash
# check-ffmpeg.sh — verify ffmpeg and ffprobe are available on PATH.
# Exit 0 on success; non-zero if either tool is missing.
set -euo pipefail

missing=0

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ERROR: ffmpeg not found on PATH" >&2
  echo "Install: sudo apt-get install -y ffmpeg   # or: brew install ffmpeg" >&2
  missing=1
else
  echo "OK: ffmpeg"
  ffmpeg -version | head -n 1
fi

if ! command -v ffprobe >/dev/null 2>&1; then
  echo "ERROR: ffprobe not found on PATH" >&2
  echo "Install: sudo apt-get install -y ffmpeg   # or: brew install ffmpeg" >&2
  missing=1
else
  echo "OK: ffprobe"
  ffprobe -version | head -n 1
fi

if [[ "$missing" -ne 0 ]]; then
  exit 1
fi

echo "FFmpeg tooling check passed."
exit 0
