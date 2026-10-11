#!/usr/bin/env bash
# Build the demo videos from scratch:  tools/video/make.sh [workDir]
# Needs: node + playwright (with chromium), python3 + pillow + numpy, ffmpeg with libx264.
set -euo pipefail
cd "$(dirname "$0")"
WORK="${1:-/tmp/firefly-video}"
JOBS="${JOBS:-3}"
mkdir -p "$WORK/shots" "$WORK/logs"
SHOTS=$(node -e "console.log(require('./edit.json').shots.map(s => s.id).join(' '))")

echo "1/4 recording shots ($JOBS at a time): $SHOTS"
echo $SHOTS | tr ' ' '\n' | xargs -P "$JOBS" -I{} sh -c "node capture.js {} '$WORK/shots/{}' > '$WORK/logs/{}.log' 2>&1 || (echo 'shot {} failed, see $WORK/logs/{}.log'; exit 255)"

echo "2/4 rendering captions and title cards"
node overlays.js "$WORK/overlays"

echo "3/4 rendering the soundtrack"
node soundtrack.js "$WORK/shots" "$WORK/raw.wav"
ffmpeg -y -loglevel error -i "$WORK/raw.wav" -af "loudnorm=I=-16:TP=-1.5:LRA=11" -ar 48000 "$WORK/soundtrack.wav"

echo "4/4 cutting and encoding"
python3 compose.py "$WORK/shots" "$WORK/overlays" "$WORK/soundtrack.wav" "$WORK/firefly-trail-demo-16x9.mp4" landscape
python3 compose.py "$WORK/shots" "$WORK/overlays" "$WORK/soundtrack.wav" "$WORK/firefly-trail-demo-9x16.mp4" vertical
ls -lh "$WORK"/*.mp4
