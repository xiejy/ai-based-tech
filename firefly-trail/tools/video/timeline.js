// Lay the recorded shots end to end (with crossfades) on one global timeline.
const fs = require('fs');
const path = require('path');
const edit = require('./edit.json');

function timeline(shotsDir) {
  let end = 0;
  const clips = edit.shots.map((s, i) => {
    const meta = JSON.parse(fs.readFileSync(path.join(shotsDir, s.id, 'meta.json'), 'utf8'));
    const start = i === 0 ? 0 : end - edit.crossfade;
    end = start + meta.dur;
    return { ...s, start, dur: meta.dur, frames: meta.frames, meta };
  });
  return { clips, total: end, fps: edit.fps };
}
module.exports = { timeline, edit };
