#!/usr/bin/env bash
# Build the demo videos from scratch:  tools/video/make.sh [workDir]
# Needs: node + playwright (with chromium), python3 + pillow + numpy, ffmpeg with libx264.
set -euo pipefail
cd "$(dirname "$0")"
WORK="${1:-/tmp/firefly-video}"
JOBS="${JOBS:-3}"
mkdir -p "$WORK/shots" "$WORK/logs"
SHOTS=$(node -e "console.log(require('./edit.json').shots.map(s => s.id).join(' '))")

echo "1/5 recording shots ($JOBS at a time): $SHOTS"
echo $SHOTS | tr ' ' '\n' | xargs -P "$JOBS" -I{} sh -c "node capture.js {} '$WORK/shots/{}' > '$WORK/logs/{}.log' 2>&1 || (echo 'shot {} failed, see $WORK/logs/{}.log'; exit 255)"

echo "2/5 rendering captions and title cards"
node overlays.js "$WORK/overlays"

echo "3/5 rendering the soundtrack"
node soundtrack.js "$WORK/shots" "$WORK/raw.wav"
# one fixed gain to -14 LUFS plus a peak limiter (no level riding, unlike single-pass loudnorm)
IN=$(ffmpeg -hide_banner -i "$WORK/raw.wav" -af loudnorm=print_format=json -f null - 2>&1 | sed -n 's/.*"input_i" : "\(-\?[0-9.]*\)".*/\1/p')
GAIN=$(python3 -c "print(round(-14 - float('$IN'), 2))")
echo "   measured $IN LUFS, applying ${GAIN} dB"
ffmpeg -y -loglevel error -i "$WORK/raw.wav" -af "volume=${GAIN}dB,alimiter=limit=0.84:attack=5:release=80:level=false" -ar 48000 "$WORK/soundtrack.wav"

echo "4/5 cutting and encoding"
python3 compose.py "$WORK/shots" "$WORK/overlays" "$WORK/soundtrack.wav" "$WORK/firefly-trail-demo-16x9.mp4" landscape
python3 compose.py "$WORK/shots" "$WORK/overlays" "$WORK/soundtrack.wav" "$WORK/firefly-trail-demo-9x16.mp4" vertical

echo "5/5 covers (16:9: the opening quote over the leaf glide; 3:4: the glide by the cherry tree)"
read -r T16 T9 <<< "$(node -e "
  const { timeline } = require('./timeline'); const tl = timeline('$WORK/shots');
  const b = tl.clips.find((c) => c.id === 'blossom'); const g = b.meta.events.find((e) => e.name === 'glide');
  const t = b.start + (g ? g.t : 3.2); console.log('0.6', (t + 0.45).toFixed(2));")"
python3 cover.py "$WORK/firefly-trail-demo-16x9.mp4" "$WORK/firefly-trail-demo-9x16.mp4" "$WORK" "$T16" "$T9"
ls -lh "$WORK"/*.mp4 "$WORK"/cover-*.jpg
