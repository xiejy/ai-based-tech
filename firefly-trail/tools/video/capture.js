// Record one shot of the game frame by frame.
//   node capture.js <shotId> <outDir> [--sim] [--fps 30] [--every N]
// --sim  : no screenshots, just print the character's path and sound events (for tuning a shot)
// --every: only save every Nth frame (quick previews)
const fs = require('fs');
const path = require('path');
const { loadPlaywright, serve, GAME_ROOT } = require('./lib');
const SHOTS = require('./shots');

const args = process.argv.slice(2);
const flag = (n, d) => {
  const i = args.indexOf(n);
  return i < 0 ? d : args[i + 1];
};
const id = args[0], out = args[1];
const SIM = args.includes('--sim');
const FPS = +flag('--fps', 30);
const EVERY = +flag('--every', 1);
const shot = SHOTS.find((s) => s.id === id);
if (!shot) {
  console.error('unknown shot', id, '— known:', SHOTS.map((s) => s.id).join(', '));
  process.exit(1);
}

// keep CSS fades and transitions in step with the recorder's clock
const SYNC = `(vt) => {
  for (const a of document.getAnimations()) {
    if (a.__vs === undefined) { a.__vs = vt; a.pause(); }
    const t = (vt - a.__vs) * 1000;
    const end = a.effect && a.effect.getComputedTiming().endTime;
    if (end !== undefined && end !== Infinity && t >= end) a.cancel();
    else a.currentTime = t;
  }
}`;

(async () => {
  const { chromium } = loadPlaywright();
  const { server, base } = await serve(GAME_ROOT);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5, locale: 'zh-CN' });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => (m.type() === 'error' ? errors.push(m.text()) : process.env.VERBOSE && console.log('page:', m.text())));
  await page.clock.install({ time: 0 });
  await page.goto(`${base}?capture&nosave&lang=${shot.lang || 'zh'}${shot.query ? '&' + shot.query : ''}`);
  await page.waitForFunction(() => window.FT && FT.capture);
  // freeze the page clock: from here on it only moves when we step a frame
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 250);
  // load every glyph the game can show, so no text pops in mid-shot
  await page.evaluate(async () => {
    const all = JSON.stringify([FT.STR, FT.NPC_LINES, FT.CARDS, FT.ENDING]) + '0123456789 EN中✋';
    await Promise.all([
      document.fonts.load('40px "ZCOOL XiaoWei"', all),
      document.fonts.load('600 20px "Quicksand"', all),
      document.fonts.load('700 20px "Quicksand"', all),
    ]);
    await document.fonts.ready;
  });
  if (shot.setup) await page.evaluate(shot.setup);
  const sync = await page.evaluateHandle(SYNC);
  if (!SIM) fs.mkdirSync(out, { recursive: true });

  const dt = 1 / FPS;
  const acts = (shot.actions || []).map(([t, type, key]) => ({ t, type, key })).sort((a, b) => a.t - b.t);
  let ai = 0;
  const seq = shot.seq || [];
  let si = 0, seqAt = 0;
  const pre = Math.round((shot.preroll || 0) * FPS);
  const total = Math.round(shot.dur * FPS);
  const log = [];
  const t0 = Date.now();
  for (let f = -pre; f < total; f++) {
    const t = f * dt;
    if (f === 0) await page.evaluate(() => FT.capture.start());
    const todo = [];
    while (ai < acts.length && acts[ai].t <= t + 1e-6) todo.push(acts[ai++]);
    // condition-driven steps: each waits for its condition (JS using p, G, t) or a delay after the previous step
    while (si < seq.length && f >= -pre) {
      const [cond, type, key] = seq[si];
      const ok = typeof cond === 'number' ? t >= seqAt + cond - 1e-6 : await page.evaluate(([c, tt]) => new Function('p', 'G', 't', 'return (' + c + ')')(FT.G.player, FT.G, tt), [cond, t]);
      if (!ok) break;
      todo.push({ type, key });
      seqAt = t;
      si++;
    }
    for (const a of todo) {
      if (a.type === 'down') await page.keyboard.down(a.key);
      else if (a.type === 'up') await page.keyboard.up(a.key);
      else if (a.type === 'press') await page.keyboard.press(a.key);
      else if (a.type === 'eval') await page.evaluate(a.key);
    }
    if (shot.perFrame) await page.evaluate(shot.perFrame);
    const shoot = !SIM && f >= 0 && f % EVERY === 0;
    await page.evaluate(([d, r]) => FT.capture.advance(d, r), [dt, shoot || (SIM && false)]);
    await page.clock.runFor(Math.round((f + pre + 1) * 1000 * dt) - Math.round((f + pre) * 1000 * dt));
    await page.evaluate(([fn, vt]) => fn(vt), [sync, t + dt]);
    if (shoot) {
      const buf = await page.screenshot({ type: 'jpeg', quality: 94 });
      fs.writeFileSync(path.join(out, `f${String(f).padStart(5, '0')}.jpg`), buf);
    }
    if (SIM && f % 3 === 0) {
      const s = await page.evaluate(() => FT.capture.state());
      log.push(`${t.toFixed(2)}s x=${s.x.toFixed(0)} y=${s.y.toFixed(0)} vy=${s.vy.toFixed(0)} ${s.grounded ? 'G' : 'air'}${s.plat ? ' on ' + s.plat : ''} motes=${s.motes} got=[${s.got}] card=${s.card} cam=${s.camX.toFixed(0)} z=${s.zoom.toFixed(2)}`);
    }
    if (!SIM && f >= 0 && f % 60 === 0) process.stdout.write(`${id} ${f}/${total} (${((Date.now() - t0) / 1000).toFixed(0)}s)\n`);
  }
  const meta = await page.evaluate(() => ({ events: FT.capture.events, env: FT.capture.env, state: FT.capture.state() }));
  if (SIM) {
    console.log(log.join('\n'));
    console.log('events:', meta.events.map((e) => `${e.t.toFixed(2)} ${e.name}${e.arg !== null ? '(' + e.arg + ')' : ''}`).join(', '));
  } else {
    fs.writeFileSync(path.join(out, 'meta.json'), JSON.stringify({ id, fps: FPS, frames: total, dur: shot.dur, events: meta.events, env: meta.env }, null, 1));
  }
  console.log('final', JSON.stringify(meta.state));
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
  await browser.close();
  server.close();
})();
