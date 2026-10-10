/* 萤火小径 · Firefly Trail — game state, input, physics and the gentle little story */
(function () {
  'use strict';
  const FT = window.FT;
  const U = FT.U, Wd = FT.W, R = FT.R, A = FT.Audio;
  const { clamp, lerp, damp, approach, hash } = U;
  const SAVE_KEY = 'firefly-trail-save-v1';
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const NOSAVE = params.has('nosave');

  const G = (FT.G = {
    t: 0,
    state: 'title',
    lang: 'zh',
    cam: { x: 600, y: 0, zoom: 1 },
    focusY: 0,
    lookX: 0,
    player: null,
    motes: [],
    trail: [],
    flying: [],
    lanterns: [],
    lighthouse: { lit: false, litT: 0 },
    npcs: [],
    parts: [],
    shooters: [],
    bubbles: [],
    prompt: null,
    whale: null,
    ending: null,
    ended: false,
    cardOpen: false,
    cardT: 0,
    pendingCard: null,
    zone: -1,
    touch: false,
  });

  // ---- storage (always optional) ------------------------------------------
  const store = {
    get() {
      if (NOSAVE) return null;
      try {
        return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      } catch {
        return null;
      }
    },
    set(v) {
      if (NOSAVE) return;
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(v));
      } catch { /* private mode etc. */ }
    },
    clear() {
      try {
        localStorage.removeItem(SAVE_KEY);
      } catch { /* ignore */ }
    },
  };
  function save() {
    if (G.state !== 'play') return;
    store.set({
      got: G.motes.filter((m) => m.got).map((m) => m.id),
      held: G.trail.length + G.flying.length,
      lit: G.lanterns.map((l) => l.lit),
      lh: G.lighthouse.lit,
      x: Math.round(G.player.x),
      lang: G.lang,
      muted: A.muted,
    });
  }

  // ---- world state ---------------------------------------------------------
  function makePlayer(x) {
    const y = Wd.surfaceY(x);
    const scarf = [];
    for (let i = 0; i < 8; i++) scarf.push({ x: x - i * 4, y: y - 26, px: x - i * 4, py: y - 26 });
    return { x, y, vx: 0, vy: 0, face: 1, grounded: true, onPlat: null, sitting: false, sitT: 0, glide: 0, glideSnd: false, anim: 0, sq: 1, blink: 0, blinkT: 3, coyote: 0, jumpBuf: 0, holdDir: 0, holdT: 0, stepPh: 0, airT: 0, scarf, thought: 0 };
  }
  const FLOWER_COLS = [
    ['rgb(255,196,214)', 'pink'], ['rgb(255,240,160)', 'warm'], ['rgb(255,255,255)', 'white'],
    ['rgb(200,186,255)', 'pink'], ['rgb(170,232,255)', 'cool'],
  ];
  function resetWorld() {
    G.motes = Wd.MOTES.map(([x, h], id) => ({ id, x, y: Wd.surfaceY(x) - h, got: false }));
    G.lanterns = Wd.LANTERNS.map((l) => {
      const flowers = [];
      for (let i = 0; i < 18; i++) {
        let dx = (hash(l.x + i * 3.1) * 2 - 1) * 150;
        if (Math.abs(dx) < 24) dx += dx < 0 ? -24 : 24;
        const c = FLOWER_COLS[Math.floor(hash(l.x * 0.3 + i) * FLOWER_COLS.length)];
        flowers.push({ dx, delay: (Math.abs(dx) / 150) * 1.1 + hash(i * 7.7 + l.x) * 0.3, h: 7 + hash(i * 2.3 + l.x) * 11, col: c[0], glow: c[1] });
      }
      return { x: l.x, i: l.i, lit: false, litT: 0, fed: 0, busy: false, flowers, bub: { text: '', a: 0, chars: 0 } };
    });
    G.lighthouse = { lit: false, litT: 0, bub: { text: '', a: 0, chars: 0 } };
    G.npcs = Wd.NPCS.map((n) => ({ ...n, face: 1, petT: 99, line: 0, dx: 0, hop: 0, zzz: 0, bub: { text: '', a: 0, chars: 0 } }));
    G.trail = [];
    G.flying = [];
    G.parts = [];
    G.whale = null;
    G.ending = null;
    G.ended = false;
    G.pendingCard = null;
    G.player = makePlayer(480);
    G.playerBub = { text: '', a: 0, chars: 0 };
  }
  function applySave(s) {
    if (!s) return;
    if (Array.isArray(s.got)) for (const id of s.got) if (G.motes[id]) G.motes[id].got = true;
    if (Array.isArray(s.lit)) s.lit.forEach((v, i) => { if (v && G.lanterns[i]) { G.lanterns[i].lit = true; G.lanterns[i].litT = 99; } });
    if (s.lh) {
      G.lighthouse.lit = true;
      G.lighthouse.litT = 99;
      G.ended = true;
    }
    G.player = makePlayer(clamp(+s.x || 480, Wd.WORLD_MIN, Wd.WORLD_MAX - 20));
    for (let i = 0; i < Math.min(40, s.held | 0); i++) G.trail.push({ x: G.player.x - 10 - i * 8, y: G.player.y - 40 });
  }

  // ---- input ---------------------------------------------------------------
  const keys = { left: false, right: false, jump: false, run: false };
  const touch = { left: false, right: false, jump: false };
  let pressJump = false, pressAct = false, pressSit = false;
  const KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    Space: 'jump', ArrowUp: 'jump', KeyW: 'jump', KeyK: 'jump', KeyZ: 'jump',
    ShiftLeft: 'run', ShiftRight: 'run',
  };
  window.addEventListener('keydown', (e) => {
    const k = e.code;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) e.preventDefault();
    if (G.state === 'title') {
      if (!e.repeat && (k === 'Enter' || k === 'Space')) startGame(false);
      return;
    }
    if (G.cardOpen) {
      if (!e.repeat && ['Enter', 'Space', 'KeyE', 'Escape', 'KeyJ', 'KeyX'].includes(k)) closeCard();
      return;
    }
    if (KEYMAP[k]) {
      if (KEYMAP[k] === 'jump' && !keys.jump) pressJump = true;
      keys[KEYMAP[k]] = true;
    }
    if (e.repeat) return;
    if (k === 'KeyE' || k === 'Enter' || k === 'KeyJ' || k === 'KeyX') pressAct = true;
    if (k === 'ArrowDown' || k === 'KeyS') pressSit = true;
    if (k === 'KeyM') toggleSound();
    if (k === 'KeyL') toggleLang();
  });
  window.addEventListener('keyup', (e) => {
    const m = KEYMAP[e.code];
    if (m) keys[m] = false;
  });
  window.addEventListener('blur', () => {
    keys.left = keys.right = keys.jump = keys.run = false;
    touch.left = touch.right = touch.jump = false;
  });

  function bindTouch() {
    document.querySelectorAll('#touch [data-k]').forEach((b) => {
      const k = b.dataset.k;
      const down = (e) => {
        e.preventDefault();
        A.init();
        try { b.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        b.classList.add('on');
        if (G.cardOpen) {
          closeCard();
          return;
        }
        if (k === 'left' || k === 'right') touch[k] = true;
        if (k === 'jump') {
          touch.jump = true;
          pressJump = true;
        }
        if (k === 'act') pressAct = true;
        if (k === 'sit') pressSit = true;
      };
      const up = (e) => {
        e.preventDefault();
        b.classList.remove('on');
        if (k in touch) touch[k] = false;
      };
      b.addEventListener('pointerdown', down);
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('lostpointercapture', up);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
    });
  }
  function enableTouchUI() {
    if (G.touch) return;
    G.touch = true;
    document.body.classList.add('touch');
    setTexts();
  }

  // ---- particles -----------------------------------------------------------
  const MAXP = 340;
  function part(o) {
    if (G.parts.length >= MAXP) return;
    o.life = 0;
    o.vx = o.vx || 0;
    o.vy = o.vy || 0;
    o.ph = o.ph === undefined ? Math.random() * 6.28 : o.ph;
    G.parts.push(o);
  }
  const rnd = (a, b) => a + Math.random() * (b - a);
  function dust(x, y, n, col) {
    const c = col || Wd.colAt('gRim', x);
    for (let i = 0; i < n; i++) part({ type: 'dust', x: x + rnd(-6, 6), y: y - 2, vx: rnd(-40, 40), vy: rnd(-40, -10), g: 60, size: rnd(2, 4), col: c, max: rnd(0.4, 0.7) });
  }
  function sparkles(x, y, n, spread) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, s = rnd(20, spread || 90);
      part({ type: 'sparkle', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, drag: 2.2, size: rnd(1.2, 2.4), max: rnd(0.6, 1.2) });
    }
  }
  function splash(x, y, n) {
    for (let i = 0; i < n; i++) part({ type: 'splash', x: x + rnd(-10, 10), y, vx: rnd(-60, 60), vy: rnd(-220, -60), g: 600, size: rnd(1.2, 2.6), max: rnd(0.6, 1) });
  }
  function hearts(x, y) {
    for (let i = 0; i < 4; i++) part({ type: 'heart', x: x + rnd(-10, 10), y: y - rnd(0, 8), vx: rnd(-18, 18), vy: rnd(-55, -30), size: rnd(1, 1.5), max: rnd(1.2, 1.8) });
  }

  // ambient weather per biome: particles per second
  const RATES = [
    { fluff: 1.1, butterfly: 0.14 },
    { petal: 7, butterfly: 0.08 },
    { fluff: 0.35, leaf: 0.2, butterfly: 0.1, firefly: 0.25 },
    { leaf: 1.3, firefly: 2.4 },
    { snow: 17 },
    { firefly: 0.8, sparkle: 0.7 },
  ];
  const PETALS = [[255, 196, 214], [255, 214, 228], [250, 180, 205], [255, 236, 242]];
  const LEAVES = [[236, 150, 90], [222, 120, 96], [150, 180, 100], [244, 190, 110]];
  const WINGS = [[255, 240, 150], [255, 255, 255], [255, 200, 220], [190, 220, 255]];
  function view() {
    const v = R.view();
    const S = v.baseS * G.cam.zoom;
    return { hw: v.W / 2 / S, hh: v.H / 2 / S };
  }
  function spawnAmbient(dt) {
    const { hw, hh } = view();
    const cx = G.cam.x, top = G.cam.y - hh;
    const [a, b, w] = Wd.zoneBlend(cx);
    const types = new Set([...Object.keys(RATES[a]), ...Object.keys(RATES[b])]);
    let butterflies = 0;
    for (const q of G.parts) if (q.type === 'butterfly') butterflies++;
    for (const type of types) {
      let n = ((RATES[a][type] || 0) * (1 - w) + (RATES[b][type] || 0) * w) * dt;
      while (n > 0) {
        if (Math.random() < n) spawnOne(type, cx, top, hw, hh, butterflies);
        n -= 1;
      }
    }
  }
  function spawnOne(type, cx, top, hw, hh, butterflies) {
    const x = cx + rnd(-1.1, 1.3) * hw;
    if (type === 'petal') part({ type, x, y: top - 10, vx: rnd(-50, -15), vy: rnd(22, 45), size: rnd(2.6, 4.2), col: PETALS[(Math.random() * 4) | 0], rot: rnd(0, 6), vrot: rnd(-2, 2), flip: rnd(0, 6), max: 14 });
    else if (type === 'leaf') part({ type, x, y: top - 10, vx: rnd(-45, -10), vy: rnd(30, 50), size: rnd(3, 4.5), col: LEAVES[(Math.random() * 4) | 0], rot: rnd(0, 6), vrot: rnd(-2, 2), flip: rnd(0, 6), max: 14 });
    else if (type === 'snow') part({ type, x, y: top - 10, vx: rnd(-25, 5), vy: rnd(28, 60), size: rnd(1.1, 2.8), max: 16 });
    else if (type === 'fluff') {
      const gx = cx - hw * 1.1;
      part({ type, x: gx, y: Wd.surfaceY(gx) - rnd(20, 160), vx: rnd(18, 40), vy: rnd(-6, 2), size: 1.4, rot: rnd(0, 6), max: 18 });
    } else if (type === 'butterfly') {
      if (butterflies >= 3) return;
      part({ type, x, y: Wd.surfaceY(x) - rnd(25, 80), vx: rnd(-30, 30), vy: 0, col: WINGS[(Math.random() * 4) | 0], max: 22, wander: 1 });
    } else if (type === 'firefly') {
      part({ type, x, y: Wd.surfaceY(x) - rnd(8, 130), vx: rnd(-12, 12), vy: rnd(-8, 8), max: rnd(5, 9), wander: 1, glow: Math.random() < 0.3 ? 'cool' : 'gold' });
    } else if (type === 'sparkle') {
      const sx = Math.max(x, Wd.SHORE + 20);
      part({ type, x: sx, y: R.seaLevel() + rnd(4, 60), vx: 0, vy: 0, size: rnd(0.8, 1.6), max: rnd(0.8, 1.6) });
    }
  }
  function updateParts(dt) {
    const { hw } = view();
    const t = G.t;
    for (let i = G.parts.length - 1; i >= 0; i--) {
      const q = G.parts[i];
      q.life += dt;
      if (q.wander) {
        q.vx = clamp(q.vx + rnd(-140, 140) * dt, -45, 45);
        q.vy = clamp(q.vy + rnd(-140, 140) * dt, -35, 35);
        const gy = Wd.surfaceY(q.x);
        if (q.y > gy - 8) q.vy = -Math.abs(q.vy) - 5;
        if (q.y < gy - 200) q.vy = Math.abs(q.vy);
      }
      if (q.type === 'petal' || q.type === 'leaf') {
        q.vx += Math.sin(t * 2 + q.ph) * 30 * dt;
        q.rot += q.vrot * dt;
        q.flip += dt * 3;
      }
      if (q.type === 'snow') q.x += Math.sin(t * 1.3 + q.ph) * 12 * dt;
      if (q.type === 'fluff') q.y += Math.sin(t * 1.1 + q.ph) * 8 * dt;
      if (q.g) q.vy += q.g * dt;
      if (q.drag) {
        q.vx *= Math.exp(-q.drag * dt);
        q.vy *= Math.exp(-q.drag * dt);
      }
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      if ((q.type === 'petal' || q.type === 'leaf' || q.type === 'snow') && q.y > Wd.surfaceY(q.x) - 1) {
        q.y = Wd.surfaceY(q.x) - 1;
        q.vx = q.vy = q.vrot = 0;
        q.life = Math.max(q.life, q.max - 1.2);
      }
      if (q.type === 'splash' && q.vy > 0 && q.y > R.seaLevel() + 2 && q.x > Wd.SHORE - 200) q.life = q.max;
      if (q.life >= q.max || Math.abs(q.x - G.cam.x) > hw * 1.6 + 200) G.parts.splice(i, 1);
    }
    for (let i = G.shooters.length - 1; i >= 0; i--) {
      const s = G.shooters[i];
      s.life += dt;
      if (s.life > s.max) G.shooters.splice(i, 1);
    }
  }

  // ---- player --------------------------------------------------------------
  function updatePlayer(dt) {
    const p = G.player;
    const locked = G.cardOpen;
    let dir = 0;
    if (!locked) dir = (keys.right || touch.right ? 1 : 0) - (keys.left || touch.left ? 1 : 0);
    const jumpHeld = !locked && (keys.jump || touch.jump);
    if (dir !== 0) {
      if (p.sitting) p.sitting = false;
      p.face = dir;
      if (dir === p.holdDir) p.holdT += dt;
      else {
        p.holdDir = dir;
        p.holdT = 0;
      }
    } else {
      p.holdDir = 0;
      p.holdT = 0;
    }
    const running = keys.run || p.holdT > 1.1;
    const maxV = running ? 290 : 172;
    const acc = dir === 0 ? (p.grounded ? 1500 : 500) : p.grounded ? 1150 : 800;
    p.vx = approach(p.vx, dir * maxV, acc * dt);

    if (pressSit && !locked && p.grounded && Math.abs(p.vx) < 60) {
      p.sitting = !p.sitting;
      p.sitT = 0;
      if (p.sitting) p.thought = Math.floor(Math.random() * 6);
    }
    if (p.sitting) {
      p.sitT += dt;
      p.vx = 0;
    }

    if (pressJump && !locked) p.jumpBuf = 0.14;
    p.jumpBuf -= dt;
    p.coyote -= dt;
    if (p.jumpBuf > 0 && (p.grounded || p.coyote > 0)) {
      p.vy = -615;
      p.grounded = false;
      p.onPlat = null;
      p.coyote = p.jumpBuf = 0;
      p.sitting = false;
      p.sq = 1.22;
      A.play('jump');
      dust(p.x, p.y, 4);
    }

    let g = 1500;
    if (p.vy < 0 && !jumpHeld) g = 2700;
    const wantGlide = !p.grounded && jumpHeld && p.vy > 20;
    if (wantGlide && !p.glideSnd) {
      A.play('glide');
      p.glideSnd = true;
    }
    if (!wantGlide && p.grounded) p.glideSnd = false;
    p.glide = approach(p.glide, wantGlide ? 1 : 0, dt * 6);
    p.vy += g * dt;
    if (wantGlide) p.vy = Math.min(p.vy, lerp(700, 70, p.glide));
    p.vy = Math.min(p.vy, 900);

    const prevY = p.y;
    p.x += p.vx * dt;
    if (p.x < Wd.WORLD_MIN || p.x > Wd.WORLD_MAX) {
      p.x = clamp(p.x, Wd.WORLD_MIN, Wd.WORLD_MAX);
      p.vx = 0;
    }
    p.y += p.vy * dt;

    const wasGrounded = p.grounded;
    p.grounded = false;
    let bounced = false;
    if (p.onPlat) {
      const q = p.onPlat;
      if (p.vy >= 0 && p.x > q.x0 - 4 && p.x < q.x1 + 4) {
        p.y = q.y;
        p.vy = 0;
        p.grounded = true;
      } else p.onPlat = null;
    }
    if (!p.grounded && p.vy >= 0) {
      for (const q of Wd.PLATS) {
        if (p.x > q.x0 - 4 && p.x < q.x1 + 4 && prevY <= q.y + 0.5 && p.y >= q.y) {
          p.y = q.y;
          if (q.bounce) {
            p.vy = -940;
            q.squish = 1;
            p.sq = 0.72;
            bounced = true;
            p.airT = 0;
            A.play('bounce');
            sparkles(p.x, q.y, 6, 60);
          } else {
            p.vy = 0;
            p.grounded = true;
            p.onPlat = q;
          }
          break;
        }
      }
    }
    const gy = Wd.surfaceY(p.x);
    if (!p.grounded && !bounced && p.vy >= 0) {
      if (p.y >= gy) {
        p.y = gy;
        p.vy = 0;
        p.grounded = true;
        p.onPlat = null;
      } else if (wasGrounded && !p.onPlat && gy - p.y < 14) {
        p.y = gy;
        p.vy = 0;
        p.grounded = true;
      }
    }
    if (p.y > gy) {
      p.y = gy;
      if (p.vy > 0) p.vy = 0;
    }
    if (p.grounded && !wasGrounded) {
      if (p.airT > 0.22) {
        A.play('land');
        dust(p.x, p.y, 6);
        p.sq = 0.8;
        if (p.x > (R.shoreX || Wd.SHORE)) splash(p.x, p.y, 8);
      }
      p.glideSnd = false;
    }
    if (wasGrounded && !p.grounded && p.vy >= 0) p.coyote = 0.1;
    p.airT = p.grounded ? 0 : p.airT + dt;
    p.sq = damp(p.sq, 1, 11, dt);

    if (p.grounded && Math.abs(p.vx) > 30) {
      p.anim += Math.abs(p.vx) * dt * 0.075;
      const before = Math.floor(p.stepPh);
      p.stepPh += (Math.abs(p.vx) * dt) / (running ? 46 : 38);
      if (Math.floor(p.stepPh) !== before) {
        const wet = p.x > (R.shoreX || Wd.SHORE) - 4;
        A.play(wet ? 'splash' : 'step', Wd.groundKind(p.x));
        if (wet) splash(p.x, p.y, 3);
        else if (running) dust(p.x - p.face * 6, p.y, 2);
      }
    } else if (p.grounded) p.anim = lerp(p.anim, Math.round(p.anim / Math.PI) * Math.PI, 0.2);

    p.blinkT -= dt;
    p.blink -= dt;
    if (p.blinkT < 0) {
      p.blink = 0.12;
      p.blinkT = 2.4 + Math.random() * 3.2;
    }

    // scarf: a little verlet chain that trails behind
    const sc = p.scarf;
    sc[0].x = p.x - p.face * 2;
    sc[0].y = p.y + (p.sitting ? -18 : -26) * p.sq;
    const fl = Math.sin(G.t * 6) * 40;
    for (let i = 1; i < sc.length; i++) {
      const s = sc[i];
      const vx = (s.x - s.px) * 0.9, vy = (s.y - s.py) * 0.9;
      s.px = s.x;
      s.py = s.y;
      s.x += vx + (-p.face * 70 + Math.sin(G.t * 5 + i) * 60) * dt * dt;
      s.y += vy + (260 + fl * (i / sc.length)) * dt * dt;
    }
    for (let k = 0; k < 3; k++) {
      for (let i = 1; i < sc.length; i++) {
        const a = sc[i - 1], b = sc[i];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.001;
        const diff = (d - 4.2) / d;
        b.x -= dx * diff;
        b.y -= dy * diff;
      }
    }
    for (const s of sc) {
      const sgy = (p.onPlat ? p.onPlat.y : Wd.surfaceY(s.x)) - 1;
      if (s.y > sgy) s.y = sgy;
    }
  }

  function updateTrail(dt) {
    const p = G.player;
    let lx = p.x - p.face * 10, ly = p.y - 40;
    for (let i = 0; i < G.trail.length; i++) {
      const m = G.trail[i];
      const tx = lx - p.face * 9 + Math.sin(G.t * 2 + i) * 3;
      const ty = ly + Math.sin(G.t * 2.6 + i * 1.3) * 4 - 2;
      m.x = damp(m.x, tx, 7 - Math.min(4, i * 0.25), dt);
      m.y = damp(m.y, ty, 7 - Math.min(4, i * 0.25), dt);
      lx = m.x;
      ly = m.y;
    }
    // collect
    const cx = p.x, cy = p.y - 22;
    for (const m of G.motes) {
      if (m.got) continue;
      const my = m.y + Math.sin(G.t * 2 + m.id) * 5;
      if (Math.abs(m.x - cx) < 34 && Math.abs(my - cy) < 38 && Math.hypot(m.x - cx, my - cy) < 36) {
        m.got = true;
        G.trail.push({ x: m.x, y: my });
        A.play('collect', G.motes.filter((q) => q.got).length - 1);
        sparkles(m.x, my, 9, 80);
        bumpHud('pill-motes');
        save();
      }
    }
    // glimmers flying into a lantern
    for (let i = G.flying.length - 1; i >= 0; i--) {
      const f = G.flying[i];
      f.t += dt;
      if (f.t < 0) continue;
      const k = clamp(f.t / f.dur, 0, 1);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      f.x = lerp(f.sx, f.tx, e);
      f.y = lerp(f.sy, f.ty, e) - Math.sin(Math.PI * k) * 70;
      if (k >= 1) {
        G.flying.splice(i, 1);
        const L = f.L;
        L.fed++;
        sparkles(f.tx, f.ty, 6, 50);
        A.play('collect', 10 + L.fed * 2);
        if (L.fed >= 3) lightLantern(L);
      }
    }
  }

  // ---- talking, lanterns, lighthouse --------------------------------------
  const NPC_H = { cat: 28, fawn: 56, frog: 22, fox: 52, rabbit: 50, crab: 28 };
  const NPC_PITCH = { cat: 760, fawn: 980, frog: 260, fox: 620, rabbit: 1200, crab: 1500 };
  function S_() {
    return FT.STR[G.lang];
  }
  function bubble(b, visible, text, dt) {
    if (text !== b.text) {
      if (b.a > 0.05 && visible) b.chars = 0;
      b.text = text;
    }
    b.a = approach(b.a, visible ? 1 : 0, dt * (visible ? 5 : 3));
    if (visible) b.chars += dt * (G.lang === 'zh' ? 16 : 45);
    else if (b.a <= 0) b.chars = 0;
  }
  function updateTalk(dt) {
    const p = G.player;
    const str = S_();
    G.bubbles.length = 0;
    for (const n of G.npcs) {
      const d = p.x - n.x;
      n.petT += dt;
      if (n.type !== 'cat' && n.type !== 'frog' && Math.abs(d) < 260) n.face = d > 0 ? 1 : -1;
      if (n.type === 'frog') n.face = d > 0 ? 1 : -1;
      n.hop = n.type === 'fawn' || n.type === 'rabbit' ? (n.petT < 0.8 ? Math.abs(Math.sin(n.petT * 8)) * 6 : 0) : 0;
      if (n.type === 'crab') n.dx = Math.abs(d) < 140 ? damp(n.dx, 0, 2, dt) : Math.sin(G.t * 0.45) * 26;
      if (n.type === 'cat' && n.petT > 3 && Math.abs(d) < 600) {
        n.zzz -= dt;
        if (n.zzz < 0) {
          n.zzz = 1.6;
          part({ type: 'zzz', x: n.x - 18, y: Wd.surfaceY(n.x) - 26, vx: -6, vy: -14, size: rnd(7, 10), max: 2.4 });
        }
      }
      const vis = Math.abs(d) < (n.water ? 140 : 115) && G.state === 'play';
      bubble(n.bub, vis, FT.NPC_LINES[n.type][G.lang][n.petT < 6 ? 1 : 0], dt);
      if (n.bub.a > 0.01) {
        const gy = n.water ? Wd.LAKE_Y : Wd.surfaceY(n.x);
        G.bubbles.push({ x: n.x, y: gy - NPC_H[n.type] - 4, text: n.bub.text, chars: n.bub.chars, a: n.bub.a });
      }
    }
    for (const L of G.lanterns) {
      if (L.lit) {
        L.litT += dt;
        L.bub.a = 0;
        continue;
      }
      const need = 3 - G.trail.length;
      const text = need > 0 ? str.needMotes.replace('{n}', need) : str.lanternHint;
      const vis = Math.abs(p.x - L.x) < 90 && !L.busy && G.state === 'play';
      bubble(L.bub, vis, text, dt);
      if (L.bub.a > 0.01) G.bubbles.push({ x: L.x, y: Wd.surfaceY(L.x) - 92, text: L.bub.text, chars: L.bub.chars, a: L.bub.a });
    }
    const LH = G.lighthouse;
    if (LH.lit) LH.litT += dt;
    else {
      const lit = G.lanterns.filter((l) => l.lit).length;
      const text = lit >= 5 ? str.lighthouseReady : str.lighthouseWait.replace('{n}', lit);
      const vis = Math.abs(p.x - Wd.LIGHTHOUSE.x) < 110 && G.state === 'play';
      bubble(LH.bub, vis, text, dt);
      if (LH.bub.a > 0.01) G.bubbles.push({ x: Wd.LIGHTHOUSE.x, y: Wd.surfaceY(Wd.LIGHTHOUSE.x) - 60, text: LH.bub.text, chars: LH.bub.chars, a: LH.bub.a });
    }
    const thinking = p.sitting && p.sitT > 3.2 && !G.cardOpen;
    bubble(G.playerBub, thinking, str.thoughts[p.thought % str.thoughts.length], dt);
    if (G.playerBub.a > 0.01) G.bubbles.push({ x: p.x, y: p.y - 46, text: G.playerBub.text, chars: G.playerBub.chars, a: G.playerBub.a });
  }

  function nearest() {
    const p = G.player;
    let best = null, bd = 1e9;
    const consider = (kind, obj, x, range, y) => {
      const d = Math.abs(p.x - x);
      if (d < range && d < bd) {
        bd = d;
        best = { kind, obj, x, y };
      }
    };
    for (const L of G.lanterns) if (!L.busy) consider('lantern', L, L.x, 64, Wd.surfaceY(L.x) - 104);
    for (const n of G.npcs) {
      const gy = n.water ? Wd.LAKE_Y : Wd.surfaceY(n.x);
      consider('npc', n, n.x, n.water ? 120 : 64, gy - NPC_H[n.type] + 6);
    }
    consider('lighthouse', G.lighthouse, Wd.LIGHTHOUSE.x, 84, Wd.surfaceY(Wd.LIGHTHOUSE.x) - 30);
    return best;
  }
  function updateInteract() {
    const near = G.cardOpen || G.ending && !G.ended ? null : nearest();
    G.prompt = near ? { x: near.x + (near.kind === 'npc' ? 22 : 0), y: near.y, label: G.touch ? '✋' : 'E' } : null;
    document.body.classList.toggle('can-act', !!near);
    if (!pressAct || !near) return;
    const p = G.player;
    p.sitting = false;
    if (near.kind === 'lantern') {
      const L = near.obj;
      if (L.lit) openCard('lantern', L.i);
      else if (G.trail.length >= 3) startLighting(L);
      else {
        A.play('nope');
        L.bub.chars = 0;
      }
    } else if (near.kind === 'npc') {
      const n = near.obj;
      n.petT = 0;
      n.bub.chars = 0;
      const gy = n.water ? Wd.LAKE_Y : Wd.surfaceY(n.x);
      hearts(n.x, gy - NPC_H[n.type]);
      A.play('chirp', NPC_PITCH[n.type]);
      A.play('pet');
    } else if (near.kind === 'lighthouse') {
      const lit = G.lanterns.filter((l) => l.lit).length;
      if (G.lighthouse.lit) openCard('ending');
      else if (lit >= 5) startEnding();
      else {
        A.play('nope');
        G.lighthouse.bub.chars = 0;
      }
    }
  }
  function startLighting(L) {
    L.busy = true;
    L.fed = 0;
    const take = G.trail.splice(G.trail.length - 3, 3);
    const ty = Wd.surfaceY(L.x) - 56;
    take.forEach((m, i) => G.flying.push({ x: m.x, y: m.y, sx: m.x, sy: m.y, tx: L.x, ty, t: -i * 0.2, dur: 0.95, L }));
    bumpHud('pill-motes');
  }
  function lightLantern(L) {
    L.lit = true;
    L.busy = false;
    L.litT = 0;
    A.play('lantern');
    sparkles(L.x, Wd.surfaceY(L.x) - 56, 26, 140);
    G.pendingCard = { kind: 'lantern', idx: L.i, at: G.t + 1.7 };
    updateHud();
    bumpHud('pill-lanterns');
    save();
  }
  function startEnding() {
    G.lighthouse.lit = true;
    G.lighthouse.litT = 0;
    G.ending = { t: 0, card: false, whale: false };
    A.play('ending');
    sparkles(Wd.LIGHTHOUSE.x, R.lampY || Wd.surfaceY(Wd.LIGHTHOUSE.x) - 245, 30, 160);
    save();
  }
  function updateEnding(dt) {
    const e = G.ending;
    if (!e) return;
    e.t += dt;
    if (e.t > 1.2 && e.t < 16 && Math.random() < dt * 3.2) {
      const x = Wd.LIGHTHOUSE.x + rnd(-900, 500);
      part({ type: 'skylantern', x, y: Wd.surfaceY(Math.min(x, Wd.SHORE)) - rnd(0, 30), vx: rnd(-6, 6), vy: rnd(-34, -20), max: rnd(14, 20) });
    }
    if (!e.whale && e.t > 3.6) {
      e.whale = true;
      G.whale = { t: 0, x: Wd.SHORE + 200 };
      splash(Wd.SHORE + 200, R.seaLevel(), 16);
      A.play('splash');
    }
    if (!e.card && e.t > 7) {
      e.card = true;
      openCard('ending');
    }
  }
  function updateWhale(dt) {
    const w = G.whale;
    if (!w) return;
    const before = w.t;
    w.t += dt;
    if (before < 2.4 && w.t >= 2.4) {
      splash(w.x + 300, R.seaLevel(), 20);
      A.play('splash');
    }
    if (w.t > 3) G.whale = null;
  }

  // ---- cards ---------------------------------------------------------------
  function openCard(kind, idx) {
    const other = G.lang === 'zh' ? 'en' : 'zh';
    const data = kind === 'ending' ? FT.ENDING : FT.CARDS[idx];
    $('card-stamp').textContent = kind === 'ending' ? '塔' : '灯';
    $('card-title').textContent = data[G.lang][0];
    $('card-main').textContent = data[G.lang][1];
    $('card-alt').textContent = data[other][1];
    $('card-ded').textContent = kind === 'ending' ? S_().dedication : '';
    $('card-tap').textContent = kind === 'ending' ? S_().keepWandering : S_().tapContinue;
    $('card').className = kind === 'ending' ? 'show ending' : 'show';
    G.cardOpen = true;
    G.cardKind = kind;
    G.cardT = 0;
    G.player.sitting = false;
    A.play('card');
  }
  function closeCard() {
    if (!G.cardOpen || G.cardT < 0.6) return;
    $('card').className = '';
    G.cardOpen = false;
    if (G.cardKind === 'ending') G.ended = true;
    A.play('ui');
  }

  // ---- HUD / DOM -----------------------------------------------------------
  function setTexts() {
    const s = S_();
    document.documentElement.lang = G.lang === 'zh' ? 'zh-CN' : 'en';
    $('t-title').textContent = s.title;
    $('t-sub').textContent = s.subtitle;
    $('t-tag').textContent = s.tagline;
    $('t-ded').textContent = s.dedication;
    $('t-controls').textContent = G.touch ? s.controlsTouch : s.controlsKey;
    $('hint').textContent = G.touch ? s.controlsTouch : s.controlsKey;
    $('t-landscape').textContent = s.landscape;
    const hasSave = G.hasProgress;
    $('btn-start').textContent = hasSave ? s.cont : s.start;
    $('btn-new').textContent = s.newgame;
    $('btn-new').classList.toggle('hidden', !hasSave);
    $('btn-lang').textContent = s.lang;
    $('t-lang').textContent = s.lang;
    $('btn-sound').setAttribute('aria-label', s.sound);
    document.title = G.lang === 'zh' ? '萤火小径 · Firefly Trail' : 'Firefly Trail · 萤火小径';
    if (G.zone >= 0) showToast(G.zone, true);
  }
  function updateHud() {
    $('mote-count').textContent = G.trail.length;
    const lit = G.lanterns.map((l) => l.lit);
    document.querySelectorAll('#pill-lanterns .lan').forEach((el, i) => el.classList.toggle('on', !!lit[i]));
    document.body.classList.toggle('muted', A.muted);
  }
  function bumpHud(id) {
    const el = $(id);
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
    updateHud();
  }
  let toastTimer = 0;
  function showToast(z, quiet) {
    const s = S_();
    $('toast-name').textContent = s.zones[z][0];
    $('toast-sub').textContent = s.zones[z][1];
    if (quiet && !$('toast').classList.contains('show')) return;
    $('toast').classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('toast').classList.remove('show'), 3600);
  }
  function toggleSound() {
    A.init();
    A.setMuted(!A.muted);
    updateHud();
    save();
    if (!A.muted) A.play('ui');
  }
  function toggleLang() {
    G.lang = G.lang === 'zh' ? 'en' : 'zh';
    setTexts();
    save();
    A.play('ui');
  }

  // ---- camera ---------------------------------------------------------------
  function updateCamera(dt) {
    const p = G.player;
    const v = R.view();
    const S = v.baseS * G.cam.zoom;
    G.lookX = damp(G.lookX, p.sitting ? 0 : p.face * Math.min(110, 30 + Math.abs(p.vx) * 0.28), 1.4, dt);
    // during the finale, frame the lighthouse together with the sea
    const show = G.ending && G.ending.t < 14 && Math.abs(p.x - Wd.LIGHTHOUSE.x) < 700;
    G.cam.x = damp(G.cam.x, show ? Wd.LIGHTHOUSE.x + 330 : p.x + G.lookX, show ? 1.2 : 3.4, dt);
    let fy = G.focusY;
    if (p.grounded) fy = damp(fy, p.y, 4, dt);
    else {
      if (p.y > fy) fy = damp(fy, p.y, 5, dt);
      if (p.y < fy - 100) fy = damp(fy, p.y + 100, 4, dt);
    }
    G.focusY = fy;
    G.cam.zoom = damp(G.cam.zoom, show ? 0.8 : p.sitting && p.sitT > 0.6 ? 0.84 : 1, 1.1, dt);
    G.cam.y = fy - (v.F - 0.5) * (v.H / S);
  }
  function updateTitleCam(dt) {
    const v = R.view();
    const S = v.baseS * G.cam.zoom;
    G.titleX = (G.titleX || 520) + dt * 70;
    if (G.titleX > Wd.SHORE + 200) G.titleX = 520;
    G.cam.x = G.titleX;
    let avg = 0;
    for (let i = -4; i <= 4; i++) avg += Wd.surfaceY(G.cam.x + i * 70);
    avg /= 9;
    G.focusY = G.focusY ? damp(G.focusY, avg, 1.5, dt) : avg;
    G.cam.y = G.focusY - (v.F - 0.5) * (v.H / S);
  }

  // ---- main loop ------------------------------------------------------------
  let saveT = 0;
  function step(dt) {
    G.t += dt;
    if (G.state === 'play') {
      updatePlayer(dt);
      updateTrail(dt);
      updateInteract();
      updateCamera(dt);
      updateEnding(dt);
      if (G.cardOpen) G.cardT += dt;
      if (G.pendingCard && G.t > G.pendingCard.at) {
        const c = G.pendingCard;
        G.pendingCard = null;
        openCard(c.kind, c.idx);
      }
      const z = Wd.zoneIndex(G.player.x);
      if (z !== G.zone) {
        G.zone = z;
        showToast(z);
      }
      document.body.classList.toggle('sitting', G.player.sitting && G.player.sitT > 1);
      saveT += dt;
      if (saveT > 4) {
        saveT = 0;
        save();
      }
    } else {
      updateTitleCam(dt);
    }
    pressJump = pressAct = pressSit = false;
    for (const q of Wd.PLATS) q.squish = Math.max(0, q.squish - dt * 3.5);
    updateTalk(dt);
    spawnAmbient(dt);
    const pal = Wd.palAt(G.cam.x, {});
    if (pal.night > 0.4 && Math.random() < dt * (G.ending && G.ending.t < 22 ? 1.3 : 0.07 * pal.night)) {
      G.shooters.push({ u: rnd(0.25, 1), v: rnd(0.02, 0.45), vx: -rnd(4, 7), vy: rnd(1.4, 2.6), life: 0, max: rnd(0.7, 1.2) });
    }
    if (Math.abs(G.cam.x - Wd.HOME.x) < 1200 && Math.random() < dt * 2.2) {
      const hx = Wd.HOME.x + 32, hy = Wd.surfaceY(Wd.HOME.x) - 137;
      part({ type: 'smoke', x: hx, y: hy, vx: rnd(6, 16), vy: rnd(-26, -16), size: rnd(3, 5), max: 5 });
    }
    updateParts(dt);
    updateWhale(dt);
    if (A.ctx) {
      const x = G.state === 'play' ? G.player.x : G.cam.x;
      const lakeD = x < Wd.LAKE0 ? Wd.LAKE0 - x : x > Wd.LAKE1 ? x - Wd.LAKE1 : 0;
      const water = Math.max(clamp(1 - lakeD / 600, 0, 1) * 0.6, clamp(1 - (Wd.SHORE - x) / 1000, 0, 1));
      A.update(dt, { night: Wd.numAt('night', x), wind: Wd.numAt('wind', x), water });
    }
  }

  // if the device struggles, quietly switch to a lighter rendering mode once
  const perf = { n: 0, sum: 0, done: false };
  function governor(raw) {
    if (perf.done || R.lite || G.state !== 'play' || document.hidden || raw <= 0 || raw > 1) return;
    if (++perf.n <= 15) return; // let things settle after loading
    perf.sum += raw;
    const k = perf.n - 15;
    if (k >= 120 || (perf.sum > 2.5 && k >= 8)) {
      perf.done = true;
      if (perf.sum / k > 0.026) {
        R.lite = true;
        R.resize();
      }
    }
  }
  let last = 0;
  function frame(now) {
    const real = (now - (last || now)) / 1000;
    const raw = Math.min(0.1, real);
    last = now;
    governor(real);
    const n = Math.max(1, Math.ceil(raw / 0.018));
    for (let i = 0; i < n; i++) step(raw / n);
    R.render(G);
    requestAnimationFrame(frame);
  }

  // ---- start / title ---------------------------------------------------------
  function fadeThen(fn) {
    const f = $('fade');
    f.classList.add('on');
    setTimeout(() => {
      fn();
      setTimeout(() => f.classList.remove('on'), 60);
    }, 520);
  }
  function startGame(fresh) {
    if (G.state !== 'title' || G.starting) return;
    G.starting = true;
    A.init();
    A.play('ui');
    fadeThen(() => {
      resetWorld();
      if (fresh) store.clear();
      else applySave(store.get());
      G.state = 'play';
      G.starting = false;
      document.body.classList.remove('on-title');
      document.body.classList.add('playing');
      const p = G.player;
      G.cam.x = p.x + 30;
      G.focusY = p.y;
      G.cam.zoom = 1;
      G.zone = -1;
      updateHud();
      document.body.classList.add('show-hint');
      setTimeout(() => document.body.classList.remove('show-hint'), 9000);
      save();
    });
  }

  function init() {
    const s = store.get();
    if (s && s.lang) G.lang = s.lang;
    else if (!/^zh/i.test(navigator.language || 'zh') && params.get('lang') !== 'zh') G.lang = 'en';
    if (params.get('lang')) G.lang = params.get('lang') === 'en' ? 'en' : 'zh';
    if (s && s.muted) A.muted = true;
    G.hasProgress = !!(s && ((s.got && s.got.length) || (s.lit && s.lit.some(Boolean))));
    resetWorld();
    if (params.has('lite')) R.lite = true;
    R.init($('game'));
    window.addEventListener('resize', () => R.resize());
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) enableTouchUI();
    window.addEventListener('touchstart', enableTouchUI, { passive: true, once: true });
    bindTouch();
    $('btn-start').addEventListener('click', () => startGame(false));
    $('btn-new').addEventListener('click', () => startGame(true));
    $('btn-sound').addEventListener('click', toggleSound);
    $('btn-lang').addEventListener('click', toggleLang);
    $('t-lang').addEventListener('click', toggleLang);
    $('btn-full').addEventListener('click', () => {
      const d = document;
      if (d.fullscreenElement) d.exitFullscreen && d.exitFullscreen();
      else if (d.documentElement.requestFullscreen) d.documentElement.requestFullscreen().catch(() => {});
    });
    if (!document.documentElement.requestFullscreen) $('btn-full').classList.add('hidden');
    $('card').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      closeCard();
    });
    document.addEventListener('visibilitychange', () => {
      if (!A.ctx) return;
      if (document.hidden) A.ctx.suspend();
      else A.ctx.resume();
    });
    window.addEventListener('pointerdown', () => A.ctx && A.ctx.state === 'suspended' && !document.hidden && A.ctx.resume());
    setTexts();
    updateHud();
    document.body.classList.add('on-title');

    // handy for testing: ?play&x=12000&motes=9&lit=3&ending
    if (params.has('play')) {
      G.state = 'play';
      document.body.classList.remove('on-title');
      document.body.classList.add('playing');
      if (!NOSAVE) applySave(store.get());
      if (params.get('x')) G.player = makePlayer(clamp(+params.get('x'), Wd.WORLD_MIN, Wd.WORLD_MAX));
      const lit = +params.get('lit') || 0;
      for (let i = 0; i < lit && i < 5; i++) {
        G.lanterns[i].lit = true;
        G.lanterns[i].litT = 99;
      }
      for (let i = 0; i < (+params.get('motes') || 0); i++) G.trail.push({ x: G.player.x, y: G.player.y - 40 });
      if (params.has('sit')) {
        G.player.sitting = true;
        G.player.sitT = 5;
      }
      if (params.get('face')) G.player.face = +params.get('face');
      G.cam.x = G.player.x + G.player.face * 30;
      G.focusY = G.player.y;
      if (params.has('ending')) startEnding();
      updateHud();
    }
    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
