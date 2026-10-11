# Demo video tools

Records the game frame by frame and cuts the demo videos (16:9 and 9:16), with the game's own music and sound effects.

```bash
npm i -D playwright && npx playwright install chromium   # once
tools/video/make.sh /tmp/firefly-video
```

How it works:

- `capture.js` opens the game with `?capture`, which turns off the animation loop. The recorder then steps the game exactly one frame at a time (1/30 s) on a frozen page clock, keeps CSS fades in step, and saves a screenshot per frame. Slow machines still produce perfectly smooth footage.
- `shots.js` scripts each shot: where it starts and which keys are pressed when (by time, or by condition such as "jump when x ≥ 5276"). `node capture.js <shot> /tmp/x --sim` prints the character's path without taking screenshots, which is handy for tuning.
- Every sound the game plays during a shot is logged. `soundtrack.js` replays those sounds, plus the generative music, through an `OfflineAudioContext` on the final timeline.
- `overlays.js` renders the captions and title cards to PNG with the game's fonts. `compose.py` crossfades the shots, adds the overlays and pipes the frames to ffmpeg.
- `edit.json` holds the shot order, crossfade length and caption text.
