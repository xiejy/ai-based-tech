// Render the game's own generative music + the recorded sound effects for the whole edit, offline.
//   node soundtrack.js <shotsDir> <out.wav>
const fs = require('fs');
const { loadPlaywright, serve, GAME_ROOT } = require('./lib');
const { timeline } = require('./timeline');

const [shotsDir, outFile] = process.argv.slice(2);
const tl = timeline(shotsDir);
const dt = 1 / tl.fps;

// sound events on the global clock
const events = [];
for (const c of tl.clips) for (const e of c.meta.events) events.push({ t: c.start + e.t, name: e.name, arg: e.arg });
// ambience (night / wind / water) per frame: during a crossfade, switch to the incoming shot halfway
const env = [];
for (let i = 0; i * dt < tl.total; i++) {
  const t = i * dt;
  let c = tl.clips[0];
  for (const k of tl.clips) if (t >= k.start + (k === tl.clips[0] ? 0 : k.xf / 2)) c = k;
  const e = c.meta.env[Math.min(c.meta.env.length - 1, Math.max(0, Math.round((t - c.start) / dt)))];
  env.push({ night: e.night, wind: e.wind, water: e.water });
}

(async () => {
  const { chromium } = loadPlaywright();
  const { server, base } = await serve(GAME_ROOT);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto(base + '?capture&nosave');
  await page.waitForFunction(() => window.FT && FT.capture);
  const b64 = await page.evaluate(async ({ total, dt, events, env }) => {
    const sr = 48000;
    const PRE = 3; // render 3 s early and drop them, so the music is already playing on the first frame
    const ctx = new OfflineAudioContext(2, Math.ceil(sr * (total + PRE)), sr);
    const A = FT.Audio;
    FT.capture.stop();
    A.ctx = null;
    A.muted = false;
    A.init(ctx);
    const g = A.master.gain;
    g.setValueAtTime(0.0001, 0);
    g.setValueAtTime(0.0001, PRE);
    g.linearRampToValueAtTime(0.85, PRE + 0.04);
    g.setValueAtTime(0.85, PRE + total - 2.6);
    g.linearRampToValueAtTime(0.0001, PRE + total);
    for (let i = 0; i * dt < PRE; i++) A.update(dt, env[0], i * dt);
    for (let i = 0; i < env.length; i++) A.update(dt, env[i], PRE + i * dt);
    for (const e of events) A.play(e.name, e.arg === null ? undefined : e.arg, PRE + e.t);
    const buf = await ctx.startRendering();
    // 16-bit stereo WAV
    const off = Math.round(PRE * sr);
    const n = buf.length - off, L = buf.getChannelData(0).subarray(off), R = buf.getChannelData(1).subarray(off);
    const out = new DataView(new ArrayBuffer(44 + n * 4));
    const str = (o, s) => [...s].forEach((ch, i) => out.setUint8(o + i, ch.charCodeAt(0)));
    str(0, 'RIFF'); out.setUint32(4, 36 + n * 4, true); str(8, 'WAVE'); str(12, 'fmt ');
    out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true);
    out.setUint32(24, sr, true); out.setUint32(28, sr * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true);
    str(36, 'data'); out.setUint32(40, n * 4, true);
    for (let i = 0; i < n; i++) {
      out.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true);
      out.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true);
    }
    const bytes = new Uint8Array(out.buffer);
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }, { total: tl.total, dt, events, env });
  fs.writeFileSync(outFile, Buffer.from(b64, 'base64'));
  console.log(`wrote ${outFile}: ${tl.total.toFixed(2)}s, ${events.length} sound events`);
  await browser.close();
  server.close();
})();
