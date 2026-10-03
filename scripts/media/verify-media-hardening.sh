#!/usr/bin/env bash
# verify-media-hardening.sh — smoke happy path + missing/zero-duration edge cases.
# Exit 0 only if guards behave as expected.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

SAMPLES="$ROOT/storage/samples"
TMP="$SAMPLES/hardening-smoke"
mkdir -p "$TMP"

pass=0
fail=0

ok() { echo "PASS: $*"; pass=$((pass + 1)); }
bad() { echo "FAIL: $*" >&2; fail=$((fail + 1)); }

echo "== FFmpeg check =="
./scripts/media/check-ffmpeg.sh

echo "== Ensure dummy =="
./scripts/media/make-dummy-video.sh "$SAMPLES/dummy.mp4" >/dev/null

echo "== Happy path: cut / adapt / thumb =="
./scripts/media/cut-clip.sh "$SAMPLES/dummy.mp4" "$TMP/clip.mp4" 1 3 >/dev/null
./scripts/media/adapt-aspect.sh "$SAMPLES/dummy.mp4" R_9_16 "$TMP/adapt-9-16.mp4" >/dev/null
./scripts/media/generate-thumb.sh "$SAMPLES/dummy.mp4" "$TMP/thumb.jpg" >/dev/null
./scripts/media/bake-demo-fallback.sh "$TMP/demo-fallback-clip.mp4" >/dev/null
ok "happy path scripts"

echo "== Edge: missing input (shell adapt) =="
if ./scripts/media/adapt-aspect.sh "$TMP/does-not-exist.mp4" R_1_1 "$TMP/out.mp4" >/dev/null 2>"$TMP/missing.err"; then
  bad "adapt-aspect should fail on missing input"
else
  if grep -qi "missing\|not found\|Input missing" "$TMP/missing.err"; then
    ok "missing input rejected with clear message"
  else
    bad "missing input failed but message unclear: $(head -2 "$TMP/missing.err")"
  fi
fi

echo "== Edge: TypeScript guards (compiled) =="
NODE="${NODE_BIN:-}"
if [[ -z "$NODE" ]]; then
  if [[ -x /home/cyrus/.local/share/cursor-agent/versions/2026.10.01-e373342/node ]]; then
    NODE=/home/cyrus/.local/share/cursor-agent/versions/2026.10.01-e373342/node
  else
    NODE="$(command -v node || true)"
  fi
fi

TSC="$ROOT/services/worker/node_modules/typescript/bin/tsc"
TYPES="$ROOT/services/worker/node_modules/@types"
if [[ -n "$NODE" && -f "$TSC" ]]; then
  OUTDIR="$TMP/js"
  mkdir -p "$OUTDIR"
  "$NODE" "$TSC" --target ES2022 --module CommonJS --moduleResolution Node \
    --esModuleInterop --strict --skipLibCheck --types node \
    --typeRoots "$TYPES" \
    --outDir "$OUTDIR" --rootDir "$ROOT/services/worker/src" \
    "$ROOT/services/worker/src/media/mediaGuard.ts" \
    "$ROOT/services/worker/src/media/cutClip.ts" \
    "$ROOT/services/worker/src/media/adaptAspect.ts" \
    "$ROOT/services/worker/src/media/thumbnail.ts" \
    "$ROOT/services/worker/src/media/extractAudio.ts"

  # Missing file
  if "$NODE" -e "
    const {cutClip}=require('$OUTDIR/media/cutClip.js');
    cutClip('$TMP/missing.mp4','$TMP/x.mp4',0,1000).then(()=>{console.error('should throw');process.exit(2)}).catch(e=>{
      if(!String(e.message).includes('missing') && !String(e.code||'').includes('INPUT')) { console.error(e); process.exit(1); }
      console.log(e.code+': '+e.message.split('.')[0]);
    });
  "; then
    ok "cutClip missing input → MediaPipelineError"
  else
    bad "cutClip missing input guard"
  fi

  # Zero / tiny duration: 1 still frame with no duration timeline is hard;
  # use empty file for INPUT_EMPTY and out-of-bounds range for RANGE_*.
  : > "$TMP/empty.mp4"
  if "$NODE" -e "
    const {cutClip}=require('$OUTDIR/media/cutClip.js');
    cutClip('$TMP/empty.mp4','$TMP/x.mp4',0,1000).then(()=>{console.error('should throw');process.exit(2)}).catch(e=>{
      if(e.code!=='INPUT_EMPTY' && e.code!=='ZERO_DURATION' && e.code!=='INPUT_MISSING') { console.error(e); process.exit(1); }
      console.log(e.code);
    });
  "; then
    ok "cutClip empty input → clear code"
  else
    bad "cutClip empty input guard"
  fi

  # Start past EOF vs 5s dummy → hard fail
  if "$NODE" -e "
    const {cutClip}=require('$OUTDIR/media/cutClip.js');
    cutClip('$SAMPLES/dummy.mp4','$TMP/oob.mp4',9000,10000).then(()=>{console.error('should throw');process.exit(2)}).catch(e=>{
      if(e.code!=='RANGE_OUT_OF_BOUNDS') { console.error(e); process.exit(1); }
      console.log(e.code);
    });
  "; then
    ok "cutClip start-past-EOF → RANGE_OUT_OF_BOUNDS"
  else
    bad "cutClip start-past-EOF guard"
  fi

  # End past EOF is clamped (SCORE windows often exceed short demo media)
  if "$NODE" -e "
    const {cutClip}=require('$OUTDIR/media/cutClip.js');
    cutClip('$SAMPLES/dummy.mp4','$TMP/clamp.mp4',0,15000).then((r)=>{
      if(!(r.endMs > r.startMs) || r.endMs > 5100) {
        console.error('expected endMs clamped near 5s, got', r);
        process.exit(1);
      }
      console.log('clamped endMs='+r.endMs);
    });
  "; then
    ok "cutClip end-past-EOF → clamped (still cuts)"
  else
    bad "cutClip end-past-EOF clamp"
  fi

  # Zero-duration window
  if "$NODE" -e "
    const {cutClip}=require('$OUTDIR/media/cutClip.js');
    cutClip('$SAMPLES/dummy.mp4','$TMP/zd.mp4',1000,1000).then(()=>{console.error('should throw');process.exit(2)}).catch(e=>{
      if(e.code!=='RANGE_INVALID') { console.error(e); process.exit(1); }
      console.log(e.code);
    });
  "; then
    ok "cutClip zero window → RANGE_INVALID"
  else
    bad "cutClip zero window guard"
  fi
else
  echo "SKIP TS guard tests (node/tsc unavailable)"
fi

echo "== Summary: $pass passed, $fail failed =="
if [[ "$fail" -ne 0 ]]; then
  exit 1
fi
echo "Media hardening smoke OK."
