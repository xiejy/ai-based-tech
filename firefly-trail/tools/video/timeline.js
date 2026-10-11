// Lay the recorded shots end to end (with crossfades) on one global timeline.
const fs = require('fs');
const path = require('path');
const edit = require('./edit.json');

function timeline(shotsDir) {
  let end = 0;
  const clips = edit.shots.map((s, i) => {
    const meta = JSON.parse(fs.readFileSync(path.join(shotsDir, s.id, 'meta.json'), 'utf8'));
    const xf = s.xf === undefined ? edit.crossfade : s.xf; // crossfade into this shot
    const start = i === 0 ? 0 : Math.floor((end - xf) * edit.fps + 0.5) / edit.fps; // always on a whole frame
    end = start + meta.dur;
    return { ...s, xf, start, dur: meta.dur, frames: meta.frames, meta };
  });
  return { clips, total: end, fps: edit.fps };
}
module.exports = { timeline, edit };
