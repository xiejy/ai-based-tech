/* 萤火小径 · Firefly Trail — renderer. Everything is drawn with code: no image files. */
(function () {
  'use strict';
  const FT = window.FT;
  const U = FT.U;
  const Wd = FT.W;
  const { clamp, lerp, hash, fbm, mix, rgb, mul, lighten, darken, smoothstep, TAU } = U;

  const FONT_ZH = '"ZCOOL XiaoWei", "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", "Microsoft YaHei", serif';
  const FONT_EN = '"Quicksand", "Nunito", system-ui, sans-serif';

  const R = (FT.R = { lite: false });
  let cv, ctx;
  let W = 0, H = 0, dpr = 1, S = 1, baseS = 1, F = 0.62, camRef = 0;
  let cam = { x: 0, y: 0, zoom: 1 };
  let t = 0;
  let G = null;
  const pal = {};
  let tintC = [1, 1, 1];
  const glows = [];
  const GLOW = {};
  let vignette = null, grainPat = null;

  // ---- setup ---------------------------------------------------------------
  function makeGlow(c) {
    const s = document.createElement('canvas');
    s.width = s.height = 128;
    const g = s.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, rgb(c, 1));
    gr.addColorStop(0.22, rgb(c, 0.5));
    gr.addColorStop(0.55, rgb(c, 0.13));
    gr.addColorStop(1, rgb(c, 0));
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    return s;
  }

  const STARS = [];
  const CLOUDS = [];
  function makeSky() {
    for (let i = 0; i < 240; i++) {
      STARS.push({ u: hash(i * 1.17 + 0.3), v: Math.pow(hash(i * 2.31 + 5.1), 1.3), r: 0.6 + Math.pow(hash(i * 3.7), 3) * 2.2, tw: 0.6 + hash(i * 9.1) * 2.5, ph: hash(i * 4.4) * 6.28 });
    }
    for (let i = 0; i < 13; i++) {
      const n = 4 + Math.floor(hash(i * 8.3) * 3);
      const puffs = [];
      for (let j = 0; j < n; j++) {
        const r = 17 + 15 * Math.sin((Math.PI * (j + 0.5)) / n) + hash(i * 10 + j) * 7;
        puffs.push({ dx: (j - (n - 1) / 2) * 25, dy: -r * 0.5, r });
      }
      CLOUDS.push({ lx: hash(i * 3.1 + 1) * 3600, y: -360 + hash(i * 7.7) * 190, s: 0.55 + hash(i * 5.3) * 0.8, p: 0.03 + hash(i * 2.9) * 0.1, puffs, n });
    }
  }

  R.init = function (canvas) {
    cv = canvas;
    ctx = cv.getContext('2d', { alpha: false });
    GLOW.warm = makeGlow([255, 208, 130]);
    GLOW.gold = makeGlow([255, 236, 170]);
    GLOW.cool = makeGlow([140, 228, 255]);
    GLOW.pink = makeGlow([255, 168, 205]);
    GLOW.white = makeGlow([235, 240, 255]);
    makeSky();
    R.resize();
  };

  R.resize = function () {
    W = window.innerWidth;
    H = window.innerHeight;
    dpr = R.lite ? 1 : Math.min(window.devicePixelRatio || 1, W * H > 1400000 ? 1.5 : 2);
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    cv.style.width = W + 'px';
    cv.style.height = H + 'px';
    baseS = Math.min(H / 540, W / 520);
    F = H > W * 1.1 ? 0.66 : 0.62;
    camRef = -(F - 0.5) * (H / baseS);

    vignette = document.createElement('canvas');
    vignette.width = vignette.height = 256;
    const vg = vignette.getContext('2d');
    const gr = vg.createRadialGradient(128, 128, 60, 128, 128, 182);
    gr.addColorStop(0, 'rgba(30,24,60,0)');
    gr.addColorStop(1, 'rgba(30,24,60,0.32)');
    vg.fillStyle = gr;
    vg.fillRect(0, 0, 256, 256);

    const gc = document.createElement('canvas');
    gc.width = gc.height = 128;
    const gx = gc.getContext('2d');
    const id = gx.createImageData(128, 128);
    for (let i = 0; i < id.data.length; i += 4) {
      const v = 128 + (Math.random() - 0.5) * 170;
      id.data[i] = id.data[i + 1] = id.data[i + 2] = v;
      id.data[i + 3] = 255;
    }
    gx.putImageData(id, 0, 0);
    grainPat = ctx.createPattern(gc, 'repeat');
  };

  R.view = () => ({ W, H, baseS, F });

  // ---- coordinate helpers --------------------------------------------------
  const sx = (x) => (x - cam.x) * S + W / 2;
  const sy = (y) => (y - cam.y) * S + H / 2;
  const lsy = (ly, p) => (ly - (camRef + (cam.y - camRef) * p)) * S + H / 2;
  const worldT = () => ctx.setTransform(S * dpr, 0, 0, S * dpr, (W / 2 - cam.x * S) * dpr, (H / 2 - cam.y * S) * dpr);
  const screenT = () => ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const T = (c) => rgb(mul(c, tintC));
  R.toScreen = (x, y) => [sx(x), sy(y)];

  function circle(x, y, r) {
    ctx.moveTo(x + r, y);
    ctx.arc(x, y, r, 0, TAU);
  }
  function rrect(x, y, w, h, r) {
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function glow(x, y, r, a, kind) {
    if (a > 0.01) glows.push(x, y, r, a, kind || 'warm');
  }
  function hGrad(key, x0, x1) {
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    const n = Math.max(2, Math.ceil((x1 - x0) / 160));
    for (let i = 0; i <= n; i++) g.addColorStop(i / n, rgb(Wd.colAt(key, x0 + ((x1 - x0) * i) / n)));
    return g;
  }

  // ---- sky -----------------------------------------------------------------
  function drawSky() {
    const hy = Math.max(40, lsy(-30, 0.05));
    const g = ctx.createLinearGradient(0, 0, 0, hy);
    g.addColorStop(0, rgb(pal.skyTop));
    g.addColorStop(0.55, rgb(pal.skyMid));
    g.addColorStop(1, rgb(pal.skyBot));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    const night = pal.night;
    if (night > 0.02) {
      const boost = G.ending ? 1 + Math.min(1, G.ending.t * 0.2) * 0.6 : 1;
      for (const s of STARS) {
        const a = clamp(night * boost * (0.55 + 0.45 * Math.sin(t * s.tw + s.ph)), 0, 1);
        const x = (((s.u * W * 1.2 - cam.x * 0.015 * S) % W) + W) % W;
        const y = s.v * hy * 0.92;
        const r = s.r;
        ctx.fillStyle = `rgba(255,250,232,${a.toFixed(3)})`;
        ctx.fillRect(x - r / 2, y - r / 2, r, r);
        if (r > 2) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = a * 0.5;
          ctx.drawImage(GLOW.white, x - r * 4, y - r * 4, r * 8, r * 8);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
        }
      }
      // shooting stars
      ctx.lineCap = 'round';
      for (const s of G.shooters) {
        const k = s.life / s.max;
        const a = Math.sin(Math.PI * k) * night;
        const x = s.u * W + s.vx * s.life * 60, y = s.v * hy + s.vy * s.life * 60;
        const gr = ctx.createLinearGradient(x, y, x - s.vx * 9, y - s.vy * 9);
        gr.addColorStop(0, `rgba(255,252,235,${a.toFixed(3)})`);
        gr.addColorStop(1, 'rgba(255,252,235,0)');
        ctx.strokeStyle = gr;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - s.vx * 9, y - s.vy * 9);
        ctx.stroke();
      }
    }

    // sun
    const sunX = W * 0.74, sunY = hy - pal.sunH * hy * 0.9;
    const dayA = 1 - smoothstep(0.3, 0.8, night);
    if (dayA > 0.01) {
      const gr = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 300 * S);
      gr.addColorStop(0, rgb(pal.sunGlow, 0.75 * dayA));
      gr.addColorStop(0.35, rgb(pal.sunGlow, 0.25 * dayA));
      gr.addColorStop(1, rgb(pal.sunGlow, 0));
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = rgb(pal.sun, dayA);
      ctx.beginPath();
      circle(sunX, sunY, 30 * S);
      ctx.fill();
    }
    // moon
    const moonA = smoothstep(0.35, 0.9, night);
    if (moonA > 0.01) {
      const mx = W * 0.76, my = hy * 0.26;
      const gr = ctx.createRadialGradient(mx, my, 0, mx, my, 200 * S);
      gr.addColorStop(0, `rgba(200,205,255,${(0.35 * moonA).toFixed(3)})`);
      gr.addColorStop(1, 'rgba(200,205,255,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = `rgba(253,247,222,${moonA.toFixed(3)})`;
      ctx.beginPath();
      circle(mx, my, 24 * S);
      ctx.fill();
      ctx.fillStyle = `rgba(214,206,190,${(0.35 * moonA).toFixed(3)})`;
      ctx.beginPath();
      circle(mx - 7 * S, my - 5 * S, 5 * S);
      circle(mx + 8 * S, my + 6 * S, 3.5 * S);
      circle(mx + 3 * S, my - 10 * S, 2.5 * S);
      ctx.fill();
      R.moonX = mx;
    } else R.moonX = null;
  }

  function drawClouds() {
    if (pal.cloudA < 0.05) return;
    const SPAN = Math.max(3600, W / S + 900);
    for (const c of CLOUDS) {
      const rel = ((((c.lx + t * 6 * (0.6 + c.s) - cam.x * c.p) % SPAN) + SPAN) % SPAN) - SPAN / 2;
      const X = W / 2 + rel * S;
      const Y = lsy(c.y, c.p);
      const k = c.s * S;
      const half = (c.n * 13 + 26) * k;
      if (X + half < 0 || X - half > W) continue;
      ctx.globalAlpha = pal.cloudA;
      for (let pass = 0; pass < 2; pass++) {
        const oy = pass === 0 ? 5 * k : 0;
        ctx.fillStyle = rgb(pass === 0 ? pal.cloudSh : pal.cloud);
        ctx.beginPath();
        for (const p of c.puffs) circle(X + p.dx * k, Y + p.dy * k + oy, p.r * k * (pass ? 0.94 : 1));
        rrect(X - (c.n * 12.5 + 14) * k, Y - 14 * k + oy, (c.n * 25 + 28) * k, 14 * k, 7 * k);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  // ---- distant layers ------------------------------------------------------
  const LAYERS = [
    { p: 0.06, base: -70, amp: 200, freq: 0.0019, seed: 1.3, ridge: 0.62, key: 'm0', fog: 0.45, cap: 1 },
    { p: 0.16, base: -45, amp: 135, freq: 0.0026, seed: 7.1, ridge: 0.45, key: 'm1', fog: 0.35, cap: 0.7 },
    { p: 0.32, base: -24, amp: 82, freq: 0.0034, seed: 3.7, ridge: 0.2, key: 'm2', fog: 0.25, cap: 0.3 },
    { p: 0.55, base: -6, amp: 52, freq: 0.0042, seed: 9.2, ridge: 0, key: 'm3', fog: 0.12, cap: 0, trees: true },
  ];
  function profile(L, lx) {
    const n = fbm(lx * L.freq + L.seed, 4);
    if (!L.ridge) return n;
    const r = 1 - Math.abs(fbm(lx * L.freq * 0.7 + L.seed * 3, 3) * 2 - 1);
    return n * (1 - L.ridge) + r * L.ridge;
  }
  function drawLayers() {
    for (const L of LAYERS) {
      const col = pal[L.key];
      const off = cam.x * L.p;
      ctx.beginPath();
      ctx.moveTo(-10, H + 10);
      for (let px = -10; px <= W + 16; px += 6) {
        const lx = off + (px - W / 2) / S;
        ctx.lineTo(px, lsy(L.base - L.amp * profile(L, lx), L.p));
      }
      ctx.lineTo(W + 16, H + 10);
      ctx.closePath();
      const top = lsy(L.base - L.amp * 0.95, L.p), bot = lsy(L.base + 70, L.p);
      const g = ctx.createLinearGradient(0, top, 0, Math.max(bot, top + 1));
      g.addColorStop(0, rgb(mix(col, [255, 255, 255], pal.cap * 0.6 * L.cap)));
      g.addColorStop(0.3, rgb(col));
      g.addColorStop(1, rgb(mix(col, pal.skyBot, L.fog)));
      ctx.fillStyle = g;
      ctx.fill();
      if (L.trees) drawLayerTrees(L, off);
    }
  }
  function drawLayerTrees(L, off) {
    const cell = 44;
    const lx0 = off - W / 2 / S - 40, lx1 = off + W / 2 / S + 40;
    ctx.fillStyle = rgb(pal.treeFar);
    ctx.beginPath();
    for (let c = Math.floor(lx0 / cell); c <= Math.ceil(lx1 / cell); c++) {
      const lx = c * cell + hash(c * 2.1 + 0.7) * 30;
      const wx = lx / L.p;
      const zb = Wd.zoneBlend(wx);
      const z = hash(c * 5.7) < zb[2] ? zb[1] : zb[0];
      if (hash(c * 1.37 + 4) > Wd.PAL[z].treeD * 0.9 + 0.08) continue;
      const X = (lx - off) * S + W / 2;
      const Y = lsy(L.base - L.amp * profile(L, lx), L.p) + 2;
      const s = (0.55 + hash(c * 3.3) * 0.55) * S;
      if (z === 3 || z === 4) {
        ctx.moveTo(X - 11 * s, Y);
        ctx.lineTo(X, Y - 46 * s);
        ctx.lineTo(X + 11 * s, Y);
      } else if (z !== 5) {
        ctx.rect(X - 1.5 * s, Y - 14 * s, 3 * s, 14 * s);
        circle(X, Y - 24 * s, 13 * s);
        circle(X - 8 * s, Y - 16 * s, 8 * s);
        circle(X + 8 * s, Y - 17 * s, 9 * s);
      }
    }
    ctx.fill();
  }

  // ---- trees ---------------------------------------------------------------
  const TREE_CELL = 210;
  const treeCache = new Map();
  function blockedForDecor(x, pad) {
    if (Math.abs(x - Wd.HOME.x) < 160 + pad || Math.abs(x - Wd.SIGN.x) < 50 + pad) return true;
    if (Math.abs(x - Wd.LIGHTHOUSE.x) < 160 + pad) return true;
    if (x > Wd.LAKE0 - 110 - pad && x < Wd.LAKE1 + 110 + pad) return true;
    if (x > Wd.SHORE - 420) return true;
    for (const l of Wd.LANTERNS) if (Math.abs(x - l.x) < 90 + pad) return true;
    for (const n of Wd.NPCS) if (Math.abs(x - n.x) < 70 + pad) return true;
    for (const p of Wd.PLATS) if (Math.abs(x - p.x) < p.w / 2 + 40 + pad) return true;
    for (const b of Wd.BIG_TREES) if (Math.abs(x - b.x) < 120 + pad) return true;
    return false;
  }
  function treeAt(c) {
    if (treeCache.has(c)) return treeCache.get(c);
    let tr = null;
    const x = c * TREE_CELL + 30 + hash(c * 1.91 + 0.3) * 150;
    const zb = Wd.zoneBlend(x);
    const z = hash(c * 7.13 + 1.1) < zb[2] ? zb[1] : zb[0];
    if (hash(c * 3.77 + 2.2) < Wd.PAL[z].treeD && !blockedForDecor(x, 20)) {
      const h = hash(c * 6.1);
      const kind = z === 1 ? 'blossom' : z === 2 ? (h < 0.5 ? 'willow' : 'round') : z === 3 ? (h < 0.65 ? 'pine' : 'round') : z === 4 ? 'snowpine' : 'round';
      tr = { x, z, kind, s: 0.75 + hash(c * 5.3) * 0.6, ph: hash(c) * 6.28 };
    }
    treeCache.set(c, tr);
    return tr;
  }
  function roundTree(x, gy, s, P, ph, blossom, h0) {
    const h = (h0 || 92) * s;
    const sw = Math.sin(t * 0.9 + ph) * 2 * s;
    ctx.fillStyle = rgb(P.trunk);
    ctx.beginPath();
    ctx.moveTo(x - 6 * s, gy + 8);
    ctx.lineTo(x - 3.2 * s, gy - h);
    ctx.lineTo(x + 3.2 * s, gy - h);
    ctx.lineTo(x + 6 * s, gy + 8);
    ctx.closePath();
    ctx.moveTo(x, gy - h * 0.55);
    ctx.lineTo(x + 18 * s, gy - h * 0.8);
    ctx.lineTo(x + 19 * s, gy - h * 0.76);
    ctx.lineTo(x + 2 * s, gy - h * 0.45);
    ctx.fill();
    const cx = x + sw, cy = gy - h - 8 * s;
    ctx.fillStyle = rgb(darken(P.leaf, 0.12));
    ctx.beginPath();
    circle(cx + 6 * s, cy + 8 * s, 36 * s);
    circle(cx + 30 * s, cy + 16 * s, 26 * s);
    ctx.fill();
    ctx.fillStyle = rgb(P.leaf);
    ctx.beginPath();
    circle(cx, cy, 36 * s);
    circle(cx - 28 * s, cy + 12 * s, 26 * s);
    circle(cx + 27 * s, cy + 10 * s, 27 * s);
    circle(cx + 4 * s, cy - 24 * s, 28 * s);
    ctx.fill();
    ctx.fillStyle = rgb(P.leafHi, 0.85);
    ctx.beginPath();
    circle(cx - 10 * s, cy - 22 * s, 15 * s);
    circle(cx - 31 * s, cy + 4 * s, 10 * s);
    circle(cx + 14 * s, cy - 36 * s, 8 * s);
    ctx.fill();
    if (blossom) {
      ctx.fillStyle = rgb(lighten(P.leafHi, 0.4));
      ctx.beginPath();
      for (let i = 0; i < 14; i++) {
        const a = hash(ph * 10 + i) * TAU, d = hash(ph * 7 + i * 3) * 40 * s;
        circle(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, 2.6 * s);
      }
      ctx.fill();
    }
  }
  function pineTree(x, gy, s, P, ph, snowy) {
    const sw = Math.sin(t * 0.8 + ph) * 1.6 * s;
    ctx.fillStyle = rgb(P.trunk);
    ctx.fillRect(x - 4 * s, gy - 24 * s, 8 * s, 24 * s + 8);
    const sh = darken(P.leaf, 0.18);
    for (let i = 0; i < 4; i++) {
      const w = (40 - i * 8) * s, by = gy - 18 * s - i * 28 * s, ty = by - 46 * s;
      const ax = x + (sw * (i + 1)) / 4;
      ctx.fillStyle = rgb(P.leaf);
      ctx.beginPath();
      ctx.moveTo(x - w, by);
      ctx.quadraticCurveTo(x, by + 7 * s, x + w, by);
      ctx.lineTo(ax, ty);
      ctx.fill();
      ctx.fillStyle = rgb(sh);
      ctx.beginPath();
      ctx.moveTo(ax, ty);
      ctx.lineTo(x + w, by);
      ctx.quadraticCurveTo(x + w * 0.5, by + 5 * s, x + 2 * s, by + 4 * s);
      ctx.fill();
      if (snowy) {
        ctx.fillStyle = rgb(P.leafHi);
        ctx.beginPath();
        ctx.moveTo(ax, ty);
        ctx.lineTo(ax + w * 0.42, ty + 22 * s);
        ctx.quadraticCurveTo(ax + w * 0.2, ty + 18 * s, ax, ty + 23 * s);
        ctx.quadraticCurveTo(ax - w * 0.2, ty + 18 * s, ax - w * 0.42, ty + 22 * s);
        ctx.fill();
      }
    }
  }
  function willowTree(x, gy, s, P, ph) {
    const h = 84 * s;
    ctx.fillStyle = rgb(P.trunk);
    ctx.beginPath();
    ctx.moveTo(x - 6 * s, gy + 8);
    ctx.quadraticCurveTo(x - 5 * s, gy - h * 0.5, x - 2 * s, gy - h);
    ctx.lineTo(x + 3 * s, gy - h);
    ctx.quadraticCurveTo(x + 2 * s, gy - h * 0.5, x + 6 * s, gy + 8);
    ctx.fill();
    const cx = x, cy = gy - h - 6 * s;
    ctx.fillStyle = rgb(P.leaf);
    ctx.beginPath();
    circle(cx, cy, 30 * s);
    circle(cx - 26 * s, cy + 8 * s, 22 * s);
    circle(cx + 26 * s, cy + 8 * s, 22 * s);
    ctx.fill();
    ctx.strokeStyle = rgb(P.leaf);
    ctx.lineWidth = 3.2 * s;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < 11; i++) {
      const bx = cx - 42 * s + i * 8.4 * s;
      const len = (30 + hash(ph + i) * 34) * s;
      const sway = Math.sin(t * 1.2 + i * 0.7 + ph) * 4 * s;
      ctx.moveTo(bx, cy + 10 * s);
      ctx.quadraticCurveTo(bx + sway * 0.5, cy + 10 * s + len * 0.5, bx + sway, cy + 10 * s + len);
    }
    ctx.stroke();
    ctx.fillStyle = rgb(P.leafHi, 0.8);
    ctx.beginPath();
    circle(cx - 8 * s, cy - 14 * s, 12 * s);
    circle(cx - 30 * s, cy + 2 * s, 8 * s);
    ctx.fill();
  }
  function drawTrees(x0, x1) {
    for (const b of Wd.BIG_TREES) {
      if (b.x < x0 - 200 || b.x > x1 + 200) continue;
      roundTree(b.x, Wd.surfaceY(b.x), b.s, Wd.PAL[1], b.x * 0.01, true, b.h / b.s);
    }
    for (let c = Math.floor((x0 - 120) / TREE_CELL); c <= Math.floor((x1 + 120) / TREE_CELL); c++) {
      const tr = treeAt(c);
      if (!tr) continue;
      const gy = Wd.surfaceY(tr.x);
      const P = Wd.PAL[tr.z];
      if (tr.kind === 'pine') pineTree(tr.x, gy, tr.s * 1.15, P, tr.ph, false);
      else if (tr.kind === 'snowpine') pineTree(tr.x, gy, tr.s, P, tr.ph, true);
      else if (tr.kind === 'willow') willowTree(tr.x, gy, tr.s, P, tr.ph);
      else roundTree(tr.x, gy, tr.s, P, tr.ph, tr.kind === 'blossom');
    }
  }

  // ---- ground --------------------------------------------------------------
  function drawGround(x0, x1) {
    const bottom = cam.y + H / 2 / S + 40;
    ctx.beginPath();
    ctx.moveTo(x0, bottom);
    for (let x = x0; x <= x1 + 6; x += 6) ctx.lineTo(x, Wd.terrainY(x));
    ctx.lineTo(x1 + 6, bottom);
    ctx.closePath();
    ctx.fillStyle = hGrad('gTop', x0, x1);
    ctx.fill();
    const vg = ctx.createLinearGradient(0, -50, 0, 230);
    vg.addColorStop(0, rgb(pal.gDeep, 0));
    vg.addColorStop(0.4, rgb(pal.gDeep, 0.38));
    vg.addColorStop(1, rgb(darken(pal.gDeep, 0.2), 0.85));
    ctx.fillStyle = vg;
    ctx.fill();
    // soft light rim along the top
    ctx.beginPath();
    let pen = false;
    for (let x = x0; x <= x1 + 6; x += 6) {
      if ((x > Wd.LAKE0 && x < Wd.LAKE1) || x > Wd.SHORE + 30) {
        pen = false;
        continue;
      }
      const y = Wd.terrainY(x) + 1.4;
      if (pen) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
      pen = true;
    }
    ctx.strokeStyle = hGrad('gRim', x0, x1);
    ctx.lineWidth = 3.2;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  const noGrass = (x) => (x > Wd.LAKE0 - 50 && x < Wd.LAKE1 + 50) || x > Wd.SHORE - 60;

  function drawGrass(x0, x1) {
    const p = G.player;
    const wind = Math.sin(t * 0.5) * 0.12 + Math.sin(t * 1.3) * 0.05;
    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      const off = pass * 2.5;
      for (let x = Math.floor(x0 / 5) * 5 + off; x < x1; x += 5) {
        if (noGrass(x)) continue;
        const hh = hash(x * 0.37 + pass * 9);
        const gh = Wd.numAt('grassH', x);
        const y = Wd.surfaceY(x) + 1.5;
        const len = gh * (0.55 + hh * 0.9) * (pass ? 0.8 : 1);
        let a = Math.sin(t * 1.7 + x * 0.045) * 0.2 + wind + (hh - 0.5) * 0.4;
        const d = x - p.x;
        if (Math.abs(d) < 26 && p.y > y - 34) a += Math.sign(d) * (1 - Math.abs(d) / 26) * 0.9;
        ctx.moveTo(x - 1.2, y);
        ctx.quadraticCurveTo(x + Math.sin(a) * len * 0.4, y - len * 0.55, x + Math.sin(a) * len, y - Math.cos(a) * len);
        ctx.lineTo(x + 1.2, y);
      }
      ctx.fillStyle = hGrad(pass ? 'grassHi' : 'grass', x0, x1);
      ctx.fill();
    }
  }

  function flowerHead(x, y, r, col, k) {
    ctx.fillStyle = col;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + k;
      circle(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.8, r * 0.75);
    }
    ctx.fill();
    ctx.fillStyle = 'rgba(255,214,110,0.95)';
    ctx.beginPath();
    circle(x, y, r * 0.55);
    ctx.fill();
  }
  function drawFlowers(x0, x1) {
    ctx.lineWidth = 1;
    for (let c = Math.floor(x0 / 23); c <= Math.ceil(x1 / 23); c++) {
      const h = hash(c * 1.73 + 5);
      const x = c * 23 + hash(c * 2.9) * 15;
      if (noGrass(x)) continue;
      if (h > Wd.numAt('flowerD', x)) continue;
      const y = Wd.surfaceY(x);
      const sh = 5 + hash(c * 4.1) * 8;
      const sway = Math.sin(t * 1.5 + c) * 1.5;
      const key = ['f1', 'f2', 'f3'][Math.floor(hash(c * 6.6) * 3)];
      ctx.strokeStyle = rgb(Wd.colAt('grass', x));
      ctx.beginPath();
      ctx.moveTo(x, y + 1);
      ctx.quadraticCurveTo(x, y - sh * 0.5, x + sway, y - sh);
      ctx.stroke();
      flowerHead(x + sway, y - sh, 1.9, rgb(Wd.colAt(key, x)), c);
    }
    // flowers that bloomed around lit lanterns
    for (const L of G.lanterns) {
      if (!L.lit || L.x < x0 - 200 || L.x > x1 + 200) continue;
      for (const f of L.flowers) {
        const g = clamp((L.litT - f.delay) / 0.7, 0, 1);
        if (g <= 0) continue;
        const e = 1 + 2.7 * Math.pow(g - 1, 3) + 1.7 * Math.pow(g - 1, 2); // ease out back
        const x = L.x + f.dx, y = Wd.surfaceY(x);
        const sh = f.h * e;
        const sway = Math.sin(t * 1.4 + f.dx) * 1.5 * g;
        ctx.strokeStyle = rgb(Wd.colAt('grass', x));
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(x, y + 1);
        ctx.quadraticCurveTo(x, y - sh * 0.5, x + sway, y - sh);
        ctx.stroke();
        flowerHead(x + sway, y - sh, 2.6 * e, f.col, f.dx);
        if (pal.dark > 0.2) glow(x + sway, y - sh, 14, 0.35 * pal.dark * g, f.glow);
      }
    }
  }

  function drawDecor(x0, x1) {
    for (let c = Math.floor((x0 - 40) / 150); c <= Math.ceil((x1 + 40) / 150); c++) {
      if (hash(c * 9.31 + 2) > 0.33) continue;
      const x = c * 150 + hash(c * 4.7) * 100;
      if (blockedForDecor(x, -30) && !(x > Wd.SHORE - 420 && x < Wd.SHORE - 120 && Math.abs(x - Wd.LIGHTHOUSE.x) > 120)) continue;
      const zb = Wd.zoneBlend(x);
      const z = zb[2] > 0.5 ? zb[1] : zb[0];
      const y = Wd.surfaceY(x) + 3;
      const s = 0.7 + hash(c * 2.2) * 0.6;
      const P = Wd.PAL[z];
      if (z === 4 || z === 5) {
        const base = z === 4 ? [150, 160, 196] : [92, 98, 140];
        ctx.fillStyle = T(base);
        ctx.beginPath();
        ctx.ellipse(x, y, 15 * s, 10 * s, 0, Math.PI, TAU);
        ctx.ellipse(x + 12 * s, y, 9 * s, 6 * s, 0, Math.PI, TAU);
        ctx.fill();
        ctx.fillStyle = T(z === 4 ? [246, 249, 255] : [120, 128, 172]);
        ctx.beginPath();
        ctx.ellipse(x - 2 * s, y - 8 * s, 11 * s, 3.5 * s, 0, Math.PI, TAU);
        ctx.fill();
      } else {
        ctx.fillStyle = rgb(darken(P.leaf, 0.05));
        ctx.beginPath();
        circle(x, y - 8 * s, 12 * s);
        circle(x - 11 * s, y - 4 * s, 9 * s);
        circle(x + 11 * s, y - 4 * s, 10 * s);
        ctx.fill();
        ctx.fillStyle = rgb(P.leafHi, 0.8);
        ctx.beginPath();
        circle(x - 4 * s, y - 13 * s, 5 * s);
        ctx.fill();
        if (hash(c * 3.3) < 0.5) {
          ctx.fillStyle = rgb(P.f1);
          ctx.beginPath();
          circle(x + 5 * s, y - 9 * s, 2 * s);
          circle(x - 8 * s, y - 6 * s, 2 * s);
          circle(x + 10 * s, y - 2 * s, 2 * s);
          ctx.fill();
        }
      }
    }
  }

  // ---- water ---------------------------------------------------------------
  const LILIES = [[8040, 15], [8190, 11], [8420, 18], [8650, 12], [8860, 20], [9030, 14]];
  function drawLake(x0, x1) {
    const L0 = Wd.LAKE0 - 50, L1 = Wd.LAKE1 + 50;
    if (x1 < L0 || x0 > L1) return;
    const by = Wd.BRIDGE_Y, ly = Wd.LAKE_Y;
    const wood = [176, 128, 86], woodD = [128, 88, 62];
    // posts in the water
    ctx.fillStyle = T(woodD);
    for (let px = Wd.LAKE0 + 40; px < Wd.LAKE1; px += 120) ctx.fillRect(px - 3, by + 6, 6, Wd.terrainY(px) - by - 4);
    // water
    const a0 = Math.max(x0, Wd.LAKE0), a1 = Math.min(x1, Wd.LAKE1);
    if (a1 > a0) {
      ctx.beginPath();
      const tops = [];
      for (let x = a0; x <= a1 + 5; x += 5) {
        const y = ly + Math.sin(x * 0.05 + t * 1.6) * 0.8;
        tops.push(x, y);
        if (x === a0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      for (let i = tops.length - 2; i >= 0; i -= 2) ctx.lineTo(tops[i], Math.max(tops[i + 1], Wd.terrainY(tops[i])));
      ctx.closePath();
      const g = ctx.createLinearGradient(0, ly, 0, ly + 150);
      g.addColorStop(0, rgb(mix(pal.water, pal.waterHi, 0.45), 0.92));
      g.addColorStop(1, rgb(darken(pal.water, 0.25), 0.95));
      ctx.fillStyle = g;
      ctx.fill();
      // reflection of the sky + shimmer
      ctx.fillStyle = rgb(pal.waterHi, 0.5);
      for (let i = 0; i < 22; i++) {
        const xx = Wd.LAKE0 + ((((hash(i * 3.3) * 1200 + t * 10 * (hash(i * 7.1) - 0.5)) % 1200) + 1200) % 1200);
        const yy = ly + 3 + hash(i * 5.9) * 46;
        if (xx < x0 || xx > x1 || Wd.terrainY(xx) < yy + 3) continue;
        const w = 8 + hash(i * 2.3) * 26;
        ctx.globalAlpha = 0.25 + 0.3 * Math.sin(t * 1.8 + i * 1.3);
        ctx.fillRect(xx - w / 2, yy, w, 1.3);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(40,40,70,0.10)';
      ctx.fillRect(Math.max(a0, Wd.LAKE0), ly + 1, Math.min(a1, Wd.LAKE1) - Math.max(a0, Wd.LAKE0), 9);
    }
    // lily pads
    for (const [lx, r] of LILIES) {
      if (lx < x0 - 30 || lx > x1 + 30) continue;
      const bob = Math.sin(t * 1.3 + lx) * 0.6;
      ctx.fillStyle = T([104, 172, 104]);
      ctx.beginPath();
      ctx.ellipse(lx, ly + 1 + bob, r, r * 0.3, 0, 0.25, TAU - 0.05);
      ctx.lineTo(lx, ly + 1 + bob);
      ctx.fill();
      if (r < 16 && hash(lx) < 0.6) {
        ctx.fillStyle = T([255, 190, 210]);
        ctx.beginPath();
        ctx.ellipse(lx - 2, ly - 3 + bob, 3, 4.5, -0.4, 0, TAU);
        ctx.ellipse(lx + 2, ly - 3 + bob, 3, 4.5, 0.4, 0, TAU);
        ctx.ellipse(lx, ly - 4 + bob, 2.5, 5, 0, 0, TAU);
        ctx.fill();
      }
    }
    // bridge deck
    const d0 = Wd.LAKE0 - 60, d1 = Wd.LAKE1 + 60;
    ctx.fillStyle = T(wood);
    ctx.fillRect(d0, by - 1, d1 - d0, 8);
    ctx.fillStyle = T(lighten(wood, 0.25));
    ctx.fillRect(d0, by - 1, d1 - d0, 2);
    ctx.fillStyle = T(woodD);
    for (let x = d0; x < d1; x += 15) ctx.fillRect(x, by + 1, 1, 6);
    // railing
    ctx.fillStyle = T(woodD);
    const posts = [];
    for (let px = d0 + 10; px <= d1; px += 120) {
      posts.push(px);
      ctx.fillRect(px - 2.5, by - 24, 5, 24);
    }
    ctx.strokeStyle = T([236, 214, 170]);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i < posts.length - 1; i++) {
      ctx.moveTo(posts[i], by - 22);
      ctx.quadraticCurveTo((posts[i] + posts[i + 1]) / 2, by - 13, posts[i + 1], by - 22);
    }
    ctx.stroke();
  }

  function seaLevel() {
    return Wd.SEA_Y + Math.sin(t * 0.8) * 3;
  }
  R.seaLevel = seaLevel;
  function drawSea(x0, x1) {
    const xa = Math.max(x0, Wd.SHORE - 360);
    if (x1 < xa) return;
    const lvl = seaLevel();
    const tops = [];
    ctx.beginPath();
    for (let x = xa; x <= x1 + 8; x += 8) {
      const y = lvl + Math.sin(x * 0.018 + t * 1.4) * 1.3 + Math.sin(x * 0.007 - t * 0.6) * 1.5;
      tops.push(x, y);
      if (x === xa) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let i = tops.length - 2; i >= 0; i -= 2) ctx.lineTo(tops[i], Math.max(tops[i + 1], Wd.terrainY(tops[i])));
    ctx.closePath();
    const g = ctx.createLinearGradient(0, lvl, 0, lvl + 260);
    g.addColorStop(0, rgb(mix(pal.water, pal.waterHi, 0.35), 0.93));
    g.addColorStop(1, rgb(darken(pal.water, 0.35), 0.98));
    ctx.fillStyle = g;
    ctx.fill();
    const k = Math.sqrt(Math.max(0, (lvl - Wd.BEACH_Y) / (Wd.SEA_Y - Wd.BEACH_Y)));
    const xs = Wd.SHORE - 300 + 300 * k;
    // the sand under the water fades into the deep blue
    const deep = darken(pal.water, 0.3);
    const tg = ctx.createLinearGradient(xs, 0, xs + 340, 0);
    tg.addColorStop(0, rgb(deep, 0));
    tg.addColorStop(1, rgb(deep, 0.9));
    ctx.fillStyle = tg;
    ctx.fillRect(xs, lvl + 4, Math.max(0, x1 - xs + 20), cam.y + H / S);
    // foam where the waves reach the sand
    const fg = ctx.createLinearGradient(xs - 6, 0, xs + 160, 0);
    fg.addColorStop(0, 'rgba(240,246,255,0.85)');
    fg.addColorStop(1, 'rgba(240,246,255,0)');
    ctx.strokeStyle = fg;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    for (let x = xs - 4; x < xs + 170; x += 6) {
      const y = lvl + Math.sin(x * 0.018 + t * 1.4) * 1.3 + Math.sin(x * 0.007 - t * 0.6) * 1.5 - 0.5;
      if (x === xs - 4) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    // glints
    ctx.fillStyle = rgb(pal.waterHi, 0.6);
    for (let i = 0; i < 30; i++) {
      const xx = Wd.SHORE + ((hash(i * 2.7) * 2400 + t * 8 * (hash(i) - 0.5) + 2400) % 2400);
      if (xx < x0 || xx > x1) continue;
      const yy = lvl + 4 + hash(i * 6.1) * 90;
      ctx.globalAlpha = Math.max(0, Math.sin(t * 1.5 + i * 2.1)) * 0.55;
      ctx.fillRect(xx, yy, 6 + hash(i * 3.9) * 18, 1.3);
    }
    ctx.globalAlpha = 1;
    R.shoreX = xs;
  }
  function drawMoonPath() {
    if (R.moonX == null || R.shoreX == null) return;
    const wx = cam.x + (R.moonX - W / 2) / S;
    if (wx < R.shoreX + 60) return;
    const lvl = sy(seaLevel());
    const a = smoothstep(0.35, 0.9, pal.night);
    for (let i = 0; i < 34; i++) {
      const y = lvl + 4 + i * 6.5 * Math.sqrt(S);
      if (y > H) break;
      const w = (16 + i * 2.2) * S * (0.55 + 0.45 * Math.sin(t * 2.3 + i * 1.7));
      ctx.fillStyle = `rgba(255,244,214,${(a * 0.42 * (1 - i / 34)).toFixed(3)})`;
      ctx.fillRect(R.moonX - w / 2 + Math.sin(t + i) * 3, y, w, 1.6 * Math.sqrt(S));
    }
  }

  // ---- props ---------------------------------------------------------------
  function drawHome() {
    const x = Wd.HOME.x, gy = Wd.surfaceY(x);
    ctx.fillStyle = T([185, 120, 95]);
    ctx.fillRect(x + 24, gy - 132, 15, 46);
    ctx.fillStyle = T([160, 100, 80]);
    ctx.fillRect(x + 22, gy - 135, 19, 6);
    ctx.fillStyle = T([248, 236, 214]);
    ctx.beginPath();
    rrect(x - 52, gy - 76, 104, 80, 3);
    ctx.fill();
    ctx.fillStyle = T([232, 214, 186]);
    ctx.fillRect(x + 30, gy - 76, 22, 80);
    ctx.fillStyle = T([217, 122, 95]);
    ctx.beginPath();
    ctx.moveTo(x - 68, gy - 70);
    ctx.quadraticCurveTo(x - 30, gy - 102, x, gy - 128);
    ctx.quadraticCurveTo(x + 30, gy - 102, x + 68, gy - 70);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = T([186, 96, 76]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 1; i < 4; i++) {
      const yy = gy - 70 - i * 13;
      const hw = 68 - i * 15;
      ctx.moveTo(x - hw, yy);
      ctx.quadraticCurveTo(x, yy + 3, x + hw, yy);
    }
    ctx.stroke();
    // door
    ctx.fillStyle = T([154, 107, 79]);
    ctx.beginPath();
    ctx.moveTo(x + 10, gy + 2);
    ctx.lineTo(x + 10, gy - 34);
    ctx.arc(x + 21, gy - 34, 11, Math.PI, TAU);
    ctx.lineTo(x + 32, gy + 2);
    ctx.fill();
    ctx.fillStyle = T([250, 210, 120]);
    ctx.beginPath();
    circle(x + 28, gy - 18, 1.8);
    ctx.fill();
    // window with warm light
    ctx.fillStyle = 'rgb(255,226,160)';
    ctx.beginPath();
    rrect(x - 38, gy - 56, 30, 26, 3);
    ctx.fill();
    ctx.fillStyle = T([255, 255, 255]);
    ctx.fillRect(x - 24, gy - 56, 2.5, 26);
    ctx.fillRect(x - 38, gy - 44, 30, 2.5);
    glow(x - 23, gy - 43, 50, 0.25 + 0.5 * pal.dark, 'warm');
    // flower box
    ctx.fillStyle = T([150, 104, 74]);
    ctx.fillRect(x - 41, gy - 30, 36, 6);
    ctx.fillStyle = T([255, 160, 170]);
    ctx.beginPath();
    for (let i = 0; i < 5; i++) circle(x - 37 + i * 7, gy - 32, 2.8);
    ctx.fill();
    // stepping stones
    ctx.fillStyle = T([210, 200, 186]);
    ctx.beginPath();
    ctx.ellipse(x + 21, gy + 2, 10, 2.5, 0, 0, TAU);
    ctx.ellipse(x + 42, gy + 3, 7, 2, 0, 0, TAU);
    ctx.fill();
  }

  function drawSign() {
    const x = Wd.SIGN.x, gy = Wd.surfaceY(x);
    ctx.fillStyle = T([141, 107, 82]);
    ctx.fillRect(x - 3, gy - 62, 6, 66);
    ctx.fillStyle = T([207, 155, 108]);
    ctx.beginPath();
    ctx.moveTo(x - 32, gy - 64);
    ctx.lineTo(x + 26, gy - 64);
    ctx.lineTo(x + 37, gy - 54);
    ctx.lineTo(x + 26, gy - 44);
    ctx.lineTo(x - 32, gy - 44);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = T([96, 64, 46]);
    ctx.font = (G.lang === 'zh' ? '600 11px ' + FONT_ZH : '700 8.5px ' + FONT_EN);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(FT.STR[G.lang].sign, x - 1, gy - 53.5);
  }

  function drawLantern(L) {
    const x = L.x, gy = Wd.surfaceY(x);
    const ST = [205, 198, 188], SD = [166, 158, 148];
    ctx.fillStyle = T(SD);
    ctx.beginPath();
    rrect(x - 17, gy - 9, 34, 11, 2);
    ctx.fill();
    ctx.fillStyle = T(ST);
    ctx.fillRect(x - 6, gy - 39, 12, 31);
    ctx.fillStyle = T(SD);
    ctx.fillRect(x + 1, gy - 39, 5, 31);
    ctx.fillStyle = T(ST);
    ctx.beginPath();
    rrect(x - 15, gy - 46, 30, 8, 2);
    ctx.fill();
    ctx.fillRect(x - 11, gy - 67, 22, 22);
    const fl = 0.85 + 0.15 * Math.sin(t * 9 + x) * Math.sin(t * 5.3);
    const on = L.lit ? clamp(L.litT * 1.5, 0, 1) : 0;
    ctx.fillStyle = rgb(mix(mul([92, 86, 96], tintC), [255, 214, 128], on * fl));
    ctx.fillRect(x - 6.5, gy - 63, 13, 14);
    ctx.fillStyle = T(SD);
    ctx.fillRect(x - 1, gy - 63, 2, 14);
    ctx.fillStyle = T([150, 141, 132]);
    ctx.beginPath();
    ctx.moveTo(x - 25, gy - 64);
    ctx.quadraticCurveTo(x - 12, gy - 67, x - 7, gy - 79);
    ctx.lineTo(x + 7, gy - 79);
    ctx.quadraticCurveTo(x + 12, gy - 67, x + 25, gy - 64);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    circle(x, gy - 82, 3.6);
    ctx.fill();
    ctx.fillStyle = T([120, 170, 110]);
    ctx.beginPath();
    circle(x - 12, gy - 8, 3);
    circle(x - 8, gy - 9, 2.2);
    circle(x + 13, gy - 8, 2.5);
    ctx.fill();
    if (on > 0) {
      glow(x, gy - 56, 95 + fl * 10, 0.85 * on, 'warm');
      glow(x, gy - 56, 26, on, 'gold');
    } else {
      glow(x, gy - 56, 20 + 4 * Math.sin(t * 2), 0.18, 'warm');
    }
  }

  function drawLighthouse() {
    const x = Wd.LIGHTHOUSE.x, gy = Wd.surfaceY(x);
    const lit = G.lighthouse.lit ? clamp(G.lighthouse.litT, 0, 1) : 0;
    ctx.fillStyle = T([150, 150, 180]);
    ctx.beginPath();
    ctx.ellipse(x - 30, gy + 2, 20, 10, 0, Math.PI, TAU);
    ctx.ellipse(x + 34, gy + 2, 16, 8, 0, Math.PI, TAU);
    ctx.fill();
    const top = gy - 222;
    const wAt = (y) => lerp(26, 17, (gy - y) / (gy - top));
    ctx.fillStyle = T([244, 240, 232]);
    ctx.beginPath();
    ctx.moveTo(x - 26, gy + 2);
    ctx.lineTo(x - 17, top);
    ctx.lineTo(x + 17, top);
    ctx.lineTo(x + 26, gy + 2);
    ctx.fill();
    ctx.fillStyle = T([226, 118, 110]);
    for (let k = 0; k < 3; k++) {
      const y0 = gy - 38 - k * 62, y1 = y0 - 28;
      ctx.beginPath();
      ctx.moveTo(x - wAt(y0), y0);
      ctx.lineTo(x - wAt(y1), y1);
      ctx.lineTo(x + wAt(y1), y1);
      ctx.lineTo(x + wAt(y0), y0);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(40,40,90,0.13)';
    ctx.beginPath();
    ctx.moveTo(x + 4, gy + 2);
    ctx.lineTo(x + 3, top);
    ctx.lineTo(x + 17, top);
    ctx.lineTo(x + 26, gy + 2);
    ctx.fill();
    ctx.fillStyle = T([90, 70, 80]);
    ctx.beginPath();
    ctx.moveTo(x - 7, gy + 2);
    ctx.lineTo(x - 7, gy - 16);
    ctx.arc(x, gy - 16, 7, Math.PI, TAU);
    ctx.lineTo(x + 7, gy + 2);
    ctx.fill();
    ctx.fillStyle = lit ? 'rgb(255,220,150)' : T([90, 96, 130]);
    ctx.fillRect(x - 3, gy - 126, 6, 9);
    ctx.fillRect(x - 3, gy - 70, 6, 8);
    ctx.fillStyle = T([196, 98, 92]);
    ctx.fillRect(x - 25, top - 6, 50, 7);
    ctx.strokeStyle = T([196, 98, 92]);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x - 23, top - 6);
    ctx.lineTo(x - 23, top - 15);
    ctx.lineTo(x + 23, top - 15);
    ctx.lineTo(x + 23, top - 6);
    for (let i = -16; i <= 16; i += 8) {
      ctx.moveTo(x + i, top - 6);
      ctx.lineTo(x + i, top - 15);
    }
    ctx.stroke();
    ctx.fillStyle = rgb(mix(mul([80, 92, 140], tintC), [255, 226, 150], lit));
    ctx.fillRect(x - 13, top - 38, 26, 30);
    ctx.fillStyle = T([196, 98, 92]);
    ctx.fillRect(x - 13, top - 38, 2.5, 30);
    ctx.fillRect(x + 10.5, top - 38, 2.5, 30);
    ctx.fillRect(x - 1.2, top - 38, 2.4, 30);
    ctx.fillStyle = T([226, 118, 110]);
    ctx.beginPath();
    ctx.moveTo(x - 19, top - 37);
    ctx.quadraticCurveTo(x - 10, top - 58, x, top - 64);
    ctx.quadraticCurveTo(x + 10, top - 58, x + 19, top - 37);
    ctx.fill();
    ctx.beginPath();
    circle(x, top - 66, 3.4);
    ctx.fill();
    R.lampY = top - 23;
    if (lit > 0) {
      glow(x, top - 23, 160, 0.9 * lit, 'warm');
      glow(x, top - 23, 40, lit, 'gold');
    } else glow(x, top - 23, 28, 0.15, 'warm');
  }
  function drawBeam() {
    if (!G.lighthouse.lit) return;
    const lit = clamp(G.lighthouse.litT, 0, 1);
    const x = Wd.LIGHTHOUSE.x, y = R.lampY;
    const th = t * 0.85;
    for (const side of [1, -1]) {
      const c = Math.cos(th) * side;
      if (c <= 0) continue;
      const len = 1500;
      const half = 18 + 150 * (1 - c);
      const dir = Math.sin(th) > 0 ? 1 : -1;
      const ex = x + dir * len;
      const g = ctx.createLinearGradient(x, y, ex, y);
      g.addColorStop(0, `rgba(255,236,180,${(0.42 * lit * Math.pow(c, 0.7)).toFixed(3)})`);
      g.addColorStop(1, 'rgba(255,236,180,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x, y - 6);
      ctx.lineTo(ex, y - half - 40);
      ctx.lineTo(ex, y + half - 40);
      ctx.lineTo(x, y + 6);
      ctx.fill();
    }
  }

  function drawPlatform(p) {
    if (p.type === 'cloud') {
      const c = p.x > 15000 ? lighten(pal.cloud, 0.3) : pal.cloud;
      const sh = p.x > 15000 ? lighten(pal.cloudSh, 0.2) : pal.cloudSh;
      for (let pass = 0; pass < 2; pass++) {
        ctx.fillStyle = rgb(pass ? c : sh);
        ctx.beginPath();
        const oy = pass ? 0 : 4;
        const n = 5;
        for (let i = 0; i < n; i++) {
          const dx = (i - (n - 1) / 2) * (p.w / n);
          const r = 15 + 8 * Math.sin((Math.PI * (i + 0.5)) / n);
          circle(p.x + dx, p.y + 14 - r * 0.5 + oy, r);
        }
        rrect(p.x0 - 6, p.y + 6 + oy, p.w + 12, 14, 7);
        ctx.fill();
      }
    } else if (p.type === 'branch') {
      const tr = Wd.BIG_TREES.reduce((a, b) => (Math.abs(b.x - p.x) < Math.abs(a.x - p.x) ? b : a));
      const P = Wd.PAL[1];
      ctx.strokeStyle = rgb(P.trunk);
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      const ex = p.side > 0 ? p.x1 - 10 : p.x0 + 10;
      ctx.moveTo(ex, p.y + 5);
      ctx.quadraticCurveTo((ex + tr.x) / 2, p.y + 8, tr.x, p.y + 34);
      ctx.stroke();
      ctx.fillStyle = rgb(P.trunk);
      ctx.beginPath();
      rrect(p.x0, p.y, p.w, 9, 4.5);
      ctx.fill();
      ctx.fillStyle = rgb(lighten(P.trunk, 0.25));
      ctx.fillRect(p.x0 + 4, p.y, p.w - 8, 2);
      ctx.fillStyle = rgb(P.leaf);
      ctx.beginPath();
      const far = p.side > 0 ? p.x0 + 6 : p.x1 - 6;
      circle(far, p.y + 2, 11);
      circle(far + p.side * 12, p.y - 2, 8);
      circle(ex - p.side * 20, p.y + 8, 7);
      ctx.fill();
      ctx.fillStyle = rgb(P.leafHi);
      ctx.beginPath();
      circle(far - 3, p.y - 2, 4);
      ctx.fill();
    } else if (p.type === 'mush') {
      ctx.fillStyle = T([243, 230, 207]);
      ctx.beginPath();
      ctx.moveTo(p.x - 9, p.ground + 6);
      ctx.quadraticCurveTo(p.x - 5, (p.ground + p.y) / 2, p.x - 7, p.y + 22);
      ctx.lineTo(p.x + 7, p.y + 22);
      ctx.quadraticCurveTo(p.x + 5, (p.ground + p.y) / 2, p.x + 9, p.ground + 6);
      ctx.fill();
      ctx.save();
      ctx.translate(p.x, p.y + 24);
      ctx.scale(1 + p.squish * 0.18, 1 - p.squish * 0.3);
      const rx = p.w / 2 + 12;
      ctx.fillStyle = T([246, 205, 192]);
      ctx.beginPath();
      ctx.ellipse(0, 0, rx - 3, 6, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = T([232, 108, 122]);
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, 26, 0, Math.PI, TAU);
      ctx.fill();
      ctx.fillStyle = T([255, 244, 236]);
      ctx.beginPath();
      const dots = [[-0.55, -0.35, 5], [-0.1, -0.75, 6], [0.4, -0.45, 4.5], [0.75, -0.2, 3], [-0.85, -0.12, 3]];
      for (const [dx, dy, r] of dots) circle(dx * rx, dy * 26, r);
      ctx.fill();
      ctx.restore();
      for (const [dx, dy] of [[-0.55, -0.35], [-0.1, -0.75], [0.4, -0.45]]) glow(p.x + dx * (p.w / 2 + 12), p.y + 24 + dy * 26, 22, 0.25 + 0.15 * Math.sin(t * 2 + dx * 5), 'cool');
    } else if (p.type === 'rock') {
      const top = p.y, bot = p.ground + 8;
      const hgt = bot - top;
      const n = Math.max(1, Math.round(hgt / 46));
      for (let i = 0; i < n; i++) {
        const y1 = top + (hgt * i) / n, y0 = top + (hgt * (i + 1)) / n;
        const inset = (i === 0 ? 0 : 4) + hash(p.x + i) * 5;
        const x0 = p.x0 + inset - (n - 1 - i) * 0, x1 = p.x1 - inset + (i % 2 ? 4 : -2);
        ctx.fillStyle = T([172, 172, 196]);
        ctx.beginPath();
        rrect(x0, y1, x1 - x0, y0 - y1 + 4, 16);
        ctx.fill();
        ctx.fillStyle = T([140, 140, 172]);
        ctx.beginPath();
        rrect(x0 + (x1 - x0) * 0.55, y1 + 4, (x1 - x0) * 0.45, y0 - y1, 14);
        ctx.fill();
        ctx.fillStyle = T([204, 204, 226]);
        ctx.beginPath();
        rrect(x0 + 6, y1 + 8, 8, (y0 - y1) * 0.5, 4);
        ctx.fill();
      }
      ctx.fillStyle = T([246, 249, 255]);
      ctx.beginPath();
      ctx.moveTo(p.x0 - 3, top + 6);
      ctx.quadraticCurveTo(p.x0 - 2, top - 5, p.x0 + 14, top - 5);
      ctx.lineTo(p.x1 - 12, top - 5);
      ctx.quadraticCurveTo(p.x1 + 3, top - 5, p.x1 + 2, top + 6);
      ctx.quadraticCurveTo(p.x1 - 8, top + 4, p.x1 - 14, top + 9);
      ctx.quadraticCurveTo(p.x1 - 22, top + 13, p.x1 - 28, top + 6);
      ctx.lineTo(p.x0 + 26, top + 6);
      ctx.quadraticCurveTo(p.x0 + 18, top + 15, p.x0 + 10, top + 7);
      ctx.closePath();
      ctx.fill();
    }
  }

  // ---- creatures -----------------------------------------------------------
  function drawNPC(n) {
    const gy = n.water ? Wd.LAKE_Y + Math.sin(t * 1.3 + n.x) * 0.6 : Wd.surfaceY(n.x);
    const happy = n.petT < 2.5;
    ctx.save();
    ctx.translate(n.x + (n.dx || 0), gy - (n.hop || 0));
    ctx.scale(n.face, 1);
    const line = (c, w) => {
      ctx.strokeStyle = c;
      ctx.lineWidth = w;
      ctx.lineCap = 'round';
    };
    const eyes = (pts, closed) => {
      if (closed) {
        line(T([70, 50, 50]), 1.3);
        ctx.beginPath();
        for (const [x, y] of pts) {
          ctx.moveTo(x - 2, y);
          if (happy) ctx.quadraticCurveTo(x, y - 2.5, x + 2, y);
          else ctx.quadraticCurveTo(x, y + 1.6, x + 2, y);
        }
        ctx.stroke();
      } else {
        ctx.fillStyle = T([50, 40, 44]);
        ctx.beginPath();
        for (const [x, y] of pts) ctx.ellipse(x, y, 1.4, 1.9, 0, 0, TAU);
        ctx.fill();
      }
    };
    const blush = (pts) => {
      ctx.fillStyle = 'rgba(255,140,150,0.45)';
      ctx.beginPath();
      for (const [x, y] of pts) circle(x, y, 2.2);
      ctx.fill();
    };
    if (n.type === 'cat') {
      const O = [242, 168, 92], OD = [214, 130, 66];
      const br = 1 + Math.sin(t * 1.6) * 0.04;
      line(T(O), 4.5);
      ctx.beginPath();
      ctx.moveTo(18, -6);
      ctx.quadraticCurveTo(28, 0, 14, 1);
      ctx.quadraticCurveTo(0, 2, -4, -1);
      ctx.stroke();
      ctx.fillStyle = T(O);
      ctx.beginPath();
      ctx.ellipse(4, -9 * br, 17, 9.5 * br, 0, 0, TAU);
      ctx.fill();
      line(T(OD), 2);
      ctx.beginPath();
      for (const sxp of [2, 8, 14]) {
        ctx.moveTo(sxp - 2, -17 * br);
        ctx.quadraticCurveTo(sxp, -13 * br, sxp - 1, -10 * br);
      }
      ctx.stroke();
      ctx.fillStyle = T([255, 244, 228]);
      ctx.beginPath();
      ctx.ellipse(0, -3, 10, 3.5, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = T(O);
      ctx.beginPath();
      circle(-12, -11, 8.5);
      ctx.moveTo(-19, -14);
      ctx.lineTo(-18, -23);
      ctx.lineTo(-12, -17);
      ctx.moveTo(-10, -18);
      ctx.lineTo(-5, -23);
      ctx.lineTo(-5, -14);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,170,170,0.8)';
      ctx.beginPath();
      ctx.moveTo(-17.5, -16);
      ctx.lineTo(-17, -20.5);
      ctx.lineTo(-14, -17.5);
      ctx.fill();
      ctx.fillStyle = T([255, 244, 228]);
      ctx.beginPath();
      ctx.ellipse(-13, -7, 4, 2.8, 0, 0, TAU);
      ctx.fill();
      eyes([[-16, -11], [-9, -11]], true);
      blush([[-18, -7], [-7, -7]]);
    } else if (n.type === 'fawn') {
      const C = [222, 168, 112], CL = [244, 214, 176];
      const bob = Math.sin(t * 1.4) * 0.05 + (happy ? Math.sin(t * 8) * 0.04 : 0);
      line(T([185, 133, 82]), 2.6);
      ctx.beginPath();
      for (const [lx, ph] of [[-9, 0], [-4, 1], [6, 2], [10, 3]]) {
        ctx.moveTo(lx, -20);
        ctx.lineTo(lx + Math.sin(t * 0.7 + ph) * 0.6, 0);
      }
      ctx.stroke();
      ctx.fillStyle = T(C);
      ctx.beginPath();
      ctx.ellipse(0, -24, 15, 8.5, 0, 0, TAU);
      ctx.moveTo(6, -28);
      ctx.lineTo(10, -42);
      ctx.lineTo(16, -40);
      ctx.lineTo(12, -24);
      ctx.fill();
      ctx.fillStyle = T([255, 252, 246]);
      ctx.beginPath();
      for (const [x, y] of [[-6, -28], [-1, -29], [4, -28], [-3, -25], [2, -25.5]]) circle(x, y, 1.3);
      ctx.ellipse(-15, -27, 3, 2.2, 0.4, 0, TAU);
      ctx.fill();
      ctx.save();
      ctx.translate(13, -42);
      ctx.rotate(bob);
      ctx.fillStyle = T(C);
      ctx.beginPath();
      ctx.ellipse(0, 0, 6.8, 6, 0, 0, TAU);
      ctx.ellipse(-4, -6, 2.6, 5.5, -0.8 + Math.sin(t * 3) * 0.1, 0, TAU);
      ctx.ellipse(4, -7, 2.6, 5.5, 0.5, 0, TAU);
      ctx.fill();
      ctx.fillStyle = T(CL);
      ctx.beginPath();
      ctx.ellipse(5, 2, 4.5, 3.2, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = T([60, 44, 40]);
      ctx.beginPath();
      circle(9, 1, 1.5);
      ctx.fill();
      eyes([[2.5, -1]], happy);
      blush([[3, 3]]);
      ctx.restore();
    } else if (n.type === 'frog') {
      const G1 = [130, 198, 112];
      const puff = happy ? Math.max(0, Math.sin(n.petT * 9)) : 0;
      ctx.fillStyle = T(G1);
      ctx.beginPath();
      ctx.ellipse(0, -7, 11, 8, 0, 0, TAU);
      circle(-5, -13, 4.2);
      circle(5, -13, 4.2);
      ctx.ellipse(-10, -2, 4, 2.5, 0, 0, TAU);
      ctx.ellipse(10, -2, 4, 2.5, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = T([218, 240, 176]);
      ctx.beginPath();
      ctx.ellipse(1, -4, 7, 4, 0, 0, TAU);
      if (puff > 0) circle(1, -2, 2 + puff * 4);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      circle(-5, -13.5, 2.6);
      circle(5, -13.5, 2.6);
      ctx.fill();
      eyes([[-4.6, -13.5], [5.4, -13.5]], happy);
      line(T([60, 100, 60]), 1.1);
      ctx.beginPath();
      ctx.moveTo(-4, -7);
      ctx.quadraticCurveTo(0, -4.5, 4, -7);
      ctx.stroke();
      blush([[-7, -8], [7, -8]]);
    } else if (n.type === 'fox') {
      const O = [239, 140, 76], D = [90, 60, 52];
      const wag = Math.sin(t * (happy ? 7 : 1.5)) * (happy ? 0.25 : 0.08);
      ctx.save();
      ctx.translate(-5, -5);
      ctx.rotate(wag);
      line(T(O), 10);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(-22, 0, -20, -20);
      ctx.stroke();
      ctx.fillStyle = T([255, 248, 240]);
      ctx.beginPath();
      circle(-20, -22, 5.5);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = T(O);
      ctx.beginPath();
      ctx.ellipse(0, -13, 10, 13, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = T([255, 248, 240]);
      ctx.beginPath();
      ctx.ellipse(3, -14, 5, 9, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = T(D);
      ctx.beginPath();
      rrect(-3, -6, 4, 6.5, 2);
      rrect(4, -6, 4, 6.5, 2);
      ctx.fill();
      ctx.fillStyle = T(O);
      ctx.beginPath();
      circle(2, -31, 9);
      ctx.moveTo(-6, -35);
      ctx.lineTo(-4, -47);
      ctx.lineTo(2, -38);
      ctx.moveTo(4, -38);
      ctx.lineTo(10, -47);
      ctx.lineTo(11, -34);
      ctx.moveTo(8, -33);
      ctx.lineTo(16, -29);
      ctx.lineTo(8, -26);
      ctx.fill();
      ctx.fillStyle = T(D);
      ctx.beginPath();
      ctx.moveTo(-4.6, -43);
      ctx.lineTo(-4, -47);
      ctx.lineTo(-2.2, -44.5);
      ctx.moveTo(8.6, -44.5);
      ctx.lineTo(10, -47);
      ctx.lineTo(10.3, -43);
      ctx.fill();
      ctx.fillStyle = T([255, 248, 240]);
      ctx.beginPath();
      ctx.ellipse(7, -27.5, 6, 3.5, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = T(D);
      ctx.beginPath();
      circle(15.5, -29, 1.6);
      ctx.fill();
      eyes([[1, -32], [8, -32]], true);
      blush([[-1, -28], [10, -28]]);
    } else if (n.type === 'rabbit') {
      const Wc = [250, 251, 255];
      const ear = Math.sin(t * 2) * 0.08 + (happy ? Math.sin(t * 10) * 0.15 : 0);
      ctx.fillStyle = T(Wc);
      ctx.beginPath();
      circle(0, -11, 11);
      circle(-10, -8, 3.6);
      ctx.fill();
      ctx.fillStyle = T([214, 222, 245]);
      ctx.beginPath();
      ctx.ellipse(3, -3, 8, 3, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = T(Wc);
      ctx.beginPath();
      circle(6, -24, 8);
      ctx.fill();
      for (const [ex, rot] of [[3, -0.25], [9, 0.2]]) {
        ctx.save();
        ctx.translate(ex, -30);
        ctx.rotate(rot + ear);
        ctx.fillStyle = T(Wc);
        ctx.beginPath();
        ctx.ellipse(0, -8, 3.2, 9, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,180,190,0.8)';
        ctx.beginPath();
        ctx.ellipse(0, -8, 1.4, 6.5, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = T([120, 172, 230]);
      ctx.beginPath();
      rrect(-4, -18.5, 15, 4, 2);
      rrect(-3, -16, 4, 8, 2);
      ctx.fill();
      ctx.fillStyle = 'rgb(255,160,170)';
      ctx.beginPath();
      circle(13.5, -23.5, 1.3);
      ctx.fill();
      eyes([[9, -25.5]], happy);
      blush([[10, -21.5]]);
    } else if (n.type === 'crab') {
      const C = [238, 112, 86];
      const pinch = Math.sin(t * (happy ? 12 : 2)) * 0.3;
      line(T(C), 1.8);
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        ctx.moveTo(-8 + i * 3, -5);
        ctx.lineTo(-14 + i * 3, 0);
        ctx.moveTo(8 - i * 3, -5);
        ctx.lineTo(14 - i * 3, 0);
      }
      ctx.moveTo(-4, -12);
      ctx.lineTo(-5, -19);
      ctx.moveTo(4, -12);
      ctx.lineTo(5, -19);
      ctx.moveTo(-9, -9);
      ctx.lineTo(-14, -13);
      ctx.moveTo(9, -9);
      ctx.lineTo(14, -13);
      ctx.stroke();
      ctx.fillStyle = T(C);
      ctx.beginPath();
      ctx.ellipse(0, -8, 12, 7, 0, 0, TAU);
      for (const s of [-1, 1]) {
        ctx.moveTo(s * 16 + 4.5, -14);
        ctx.arc(s * 16, -14, 4.5, 0, TAU);
      }
      ctx.fill();
      ctx.strokeStyle = T(C);
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      for (const s of [-1, 1]) {
        ctx.moveTo(s * 16, -18);
        ctx.lineTo(s * 16 + s * 3, -22 - pinch * 4);
      }
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      circle(-5, -20, 2.6);
      circle(5, -20, 2.6);
      ctx.fill();
      eyes([[-5, -20], [5, -20]], happy);
      line(T([150, 60, 50]), 1);
      ctx.beginPath();
      ctx.moveTo(-3, -7);
      ctx.quadraticCurveTo(0, -5, 3, -7);
      ctx.stroke();
      blush([[-7, -8], [7, -8]]);
    }
    ctx.restore();
  }

  // ---- the little wanderer -------------------------------------------------
  const CLOAK = [253, 243, 224], CLOAK_SH = [233, 214, 186], SKIN = [255, 226, 200], LEG = [110, 84, 76], SCARF = [233, 102, 92], EYE = [58, 46, 48];
  function drawPlayer() {
    const p = G.player;
    const tc = mix(tintC, [1, 1, 1], 0.4);
    const C = (c, a) => rgb(mul(c, tc), a);
    // shadow
    const shY = p.onPlat ? p.onPlat.y : Wd.surfaceY(p.x);
    const hgt = Math.max(0, shY - p.y);
    const sk = clamp(1 - hgt / 220, 0.2, 1);
    ctx.fillStyle = `rgba(30,30,60,${(0.16 * sk).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(p.x, shY + 1, 14 * sk, 3.4 * sk, 0, 0, TAU);
    ctx.fill();
    // scarf tail (world space)
    ctx.lineCap = 'round';
    ctx.strokeStyle = C(SCARF);
    const sc = p.scarf;
    for (let i = 1; i < sc.length; i++) {
      ctx.lineWidth = 4.4 - (i / sc.length) * 1.6;
      ctx.beginPath();
      ctx.moveTo(sc[i - 1].x, sc[i - 1].y);
      ctx.lineTo(sc[i].x, sc[i].y);
      ctx.stroke();
    }
    ctx.save();
    ctx.translate(p.x, p.y);
    const sxs = 1 + (1 - p.sq) * 0.8;
    ctx.scale(p.face * sxs, p.sq);
    const moving = Math.min(1, Math.abs(p.vx) / 160);
    const ph = p.anim;
    const breathe = Math.sin(t * 2.2) * 0.5;
    let headY;
    if (p.sitting) {
      ctx.strokeStyle = C(LEG);
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-1, -5);
      ctx.lineTo(9, -3);
      ctx.moveTo(-4, -4);
      ctx.lineTo(6, -1.5);
      ctx.stroke();
      ctx.fillStyle = C(CLOAK);
      ctx.beginPath();
      ctx.moveTo(-7, -21);
      ctx.quadraticCurveTo(-12, -10, -12, -1);
      ctx.lineTo(9, -1);
      ctx.quadraticCurveTo(9, -12, 7, -21);
      ctx.fill();
      ctx.fillStyle = C(CLOAK_SH);
      ctx.fillRect(-12, -3.5, 21, 2.5);
      headY = -31 + breathe * 0.6;
    } else {
      const air = !p.grounded;
      ctx.strokeStyle = C(LEG);
      ctx.lineWidth = 4;
      ctx.beginPath();
      for (const leg of [-1, 1]) {
        const hx = leg * 3.2;
        const ang = air ? leg * 0.35 + 0.25 : Math.sin(ph + (leg > 0 ? 0 : Math.PI)) * 0.7 * moving;
        const lift = air ? 2 : Math.max(0, Math.cos(ph + (leg > 0 ? 0 : Math.PI))) * 3 * moving;
        ctx.moveTo(hx, -11);
        ctx.lineTo(hx + Math.sin(ang) * 10, -11 + Math.cos(ang) * 10.5 - lift);
      }
      ctx.stroke();
      const sway = Math.sin(ph) * 1.4 * moving + (air ? clamp(-p.vy * 0.004, -2, 2) : 0) + clamp(p.vx * 0.012, -2.5, 2.5);
      ctx.fillStyle = C(CLOAK);
      ctx.beginPath();
      ctx.moveTo(-7, -27);
      ctx.quadraticCurveTo(-11, -17, -12 - sway, -8);
      ctx.quadraticCurveTo(0, -6, 12 - sway, -8);
      ctx.quadraticCurveTo(11, -17, 7, -27);
      ctx.fill();
      ctx.strokeStyle = C(CLOAK_SH);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-11.5 - sway, -8.5);
      ctx.quadraticCurveTo(0, -6.5, 11.5 - sway, -8.5);
      ctx.stroke();
      // arm
      const arm = p.glide > 0.3 ? -1.2 : Math.sin(ph + Math.PI) * 0.5 * moving + 0.2;
      ctx.strokeStyle = C(CLOAK_SH);
      ctx.lineWidth = 3.6;
      ctx.beginPath();
      ctx.moveTo(1, -23);
      ctx.lineTo(1 + Math.sin(arm) * 8, -23 + Math.cos(arm) * 8);
      ctx.stroke();
      headY = -38 + breathe * 0.5 + Math.abs(Math.sin(ph)) * -1.2 * moving;
    }
    // scarf knot
    ctx.fillStyle = C(SCARF);
    ctx.beginPath();
    rrect(-8, headY + 9, 16, 5.5, 2.7);
    ctx.fill();
    // hood with little ears
    ctx.fillStyle = C(CLOAK);
    ctx.beginPath();
    circle(0, headY, 13);
    ctx.moveTo(-11, headY - 5);
    ctx.lineTo(-11.5, headY - 20);
    ctx.lineTo(-2.5, headY - 12);
    ctx.moveTo(2.5, headY - 12);
    ctx.lineTo(11.5, headY - 20);
    ctx.lineTo(11, headY - 5);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,170,180,0.7)';
    ctx.beginPath();
    ctx.moveTo(-9.8, headY - 9);
    ctx.lineTo(-10.2, headY - 16.5);
    ctx.lineTo(-5.5, headY - 12.5);
    ctx.moveTo(5.5, headY - 12.5);
    ctx.lineTo(10.2, headY - 16.5);
    ctx.lineTo(9.8, headY - 9);
    ctx.fill();
    // face
    ctx.fillStyle = C(SKIN);
    ctx.beginPath();
    circle(2.6, headY + 1.6, 9.4);
    ctx.fill();
    ctx.strokeStyle = C(CLOAK);
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.arc(2.6, headY + 1.6, 9.8, Math.PI * 1.08, Math.PI * 1.92);
    ctx.stroke();
    const blink = p.blink > 0;
    ctx.fillStyle = C(EYE);
    ctx.strokeStyle = C(EYE);
    if (blink || p.sitting && p.sitT > 3) {
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (const ex of [0.5, 6.8]) {
        ctx.moveTo(ex - 1.8, headY + 1.8);
        ctx.quadraticCurveTo(ex, headY + 3.2, ex + 1.8, headY + 1.8);
      }
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.ellipse(0.5, headY + 1.6, 1.35, 1.95, 0, 0, TAU);
      ctx.ellipse(6.8, headY + 1.6, 1.35, 1.95, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      circle(1, headY + 0.9, 0.5);
      circle(7.3, headY + 0.9, 0.5);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,135,140,0.42)';
    ctx.beginPath();
    circle(-2, headY + 5.2, 2.1);
    circle(9.6, headY + 5.2, 2.1);
    ctx.fill();
    ctx.strokeStyle = C([170, 100, 100]);
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(2.6, headY + 6);
    ctx.quadraticCurveTo(3.8, headY + 7.2, 5, headY + 6);
    ctx.stroke();
    // leaf umbrella
    if (p.glide > 0.02) {
      const g = p.glide;
      ctx.strokeStyle = C([96, 130, 70]);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(4, -20);
      ctx.lineTo(5, -20 - 40 * g);
      ctx.stroke();
      ctx.save();
      ctx.translate(5, -22 - 40 * g);
      ctx.rotate(Math.sin(t * 3) * 0.07 - 0.05);
      ctx.scale(g, g);
      ctx.fillStyle = C([122, 194, 106]);
      ctx.beginPath();
      ctx.moveTo(-28, 4);
      ctx.quadraticCurveTo(-20, -14, 0, -14);
      ctx.quadraticCurveTo(22, -14, 30, 3);
      ctx.quadraticCurveTo(0, -2, -28, 4);
      ctx.fill();
      ctx.strokeStyle = C([160, 220, 130]);
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(-24, 2);
      ctx.quadraticCurveTo(0, -11, 27, 1);
      for (let i = -2; i <= 2; i++) {
        ctx.moveTo(i * 9, -7 + Math.abs(i) * 1.5);
        ctx.lineTo(i * 9 + 4, -1);
      }
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  function moteCore(x, y, r, k) {
    if (pal.dark < 0.6) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 4.2);
      g.addColorStop(0, `rgba(255,214,120,${(0.55 * (1 - pal.dark) * k).toFixed(3)})`);
      g.addColorStop(1, 'rgba(255,214,120,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      circle(x, y, r * 4.2);
      ctx.fill();
    }
    ctx.fillStyle = `rgba(255,251,228,${k.toFixed(3)})`;
    ctx.beginPath();
    circle(x, y, r);
    ctx.fill();
    glow(x, y, r * 9, 0.7 * k, 'warm');
  }
  function drawMotes(x0, x1) {
    for (const m of G.motes) {
      if (m.got || m.x < x0 || m.x > x1) continue;
      const y = m.y + Math.sin(t * 2 + m.id) * 5;
      moteCore(m.x, y, 4.3 + Math.sin(t * 3 + m.id) * 0.5, 1);
    }
    for (const m of G.trail) moteCore(m.x, m.y, 3.4, 0.95);
    for (const f of G.flying) moteCore(f.x, f.y, 3.8, 1);
  }

  // ---- particles -----------------------------------------------------------
  function drawParticles() {
    for (const q of G.parts) {
      const k = q.life / q.max;
      const fade = Math.min(1, (1 - k) * 4) * Math.min(1, k * 8 + 0.2);
      switch (q.type) {
        case 'petal':
        case 'leaf':
          ctx.save();
          ctx.translate(q.x, q.y);
          ctx.rotate(q.rot);
          ctx.scale(1, Math.sin(q.flip));
          ctx.fillStyle = rgb(q.col, fade * 0.95);
          ctx.beginPath();
          ctx.ellipse(0, 0, q.size, q.size * 0.55, 0, 0, TAU);
          ctx.fill();
          ctx.restore();
          break;
        case 'snow':
        case 'fluff':
          ctx.fillStyle = `rgba(255,255,255,${(fade * 0.9).toFixed(3)})`;
          ctx.beginPath();
          circle(q.x, q.y, q.size);
          ctx.fill();
          if (q.type === 'fluff') {
            ctx.strokeStyle = `rgba(255,255,255,${(fade * 0.6).toFixed(3)})`;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
              const a = (i / 6) * TAU + q.rot;
              ctx.moveTo(q.x, q.y);
              ctx.lineTo(q.x + Math.cos(a) * 4, q.y + Math.sin(a) * 4);
            }
            ctx.stroke();
          }
          break;
        case 'dust':
          ctx.fillStyle = rgb(q.col, fade * 0.35);
          ctx.beginPath();
          circle(q.x, q.y, q.size * (1.4 - k * 0.6));
          ctx.fill();
          break;
        case 'smoke':
          ctx.fillStyle = `rgba(245,245,250,${(fade * 0.35).toFixed(3)})`;
          ctx.beginPath();
          circle(q.x, q.y, q.size * (2.2 - k * 1.4));
          ctx.fill();
          break;
        case 'splash':
          ctx.fillStyle = rgb(pal.waterHi, fade * 0.85);
          ctx.beginPath();
          circle(q.x, q.y, q.size);
          ctx.fill();
          break;
        case 'heart': {
          ctx.save();
          ctx.translate(q.x, q.y);
          const s = q.size * (0.7 + 0.3 * Math.min(1, (1 - k) * 5));
          ctx.scale(s, s);
          ctx.fillStyle = `rgba(255,128,150,${fade.toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(0, 3);
          ctx.bezierCurveTo(-6, -1, -3, -6, 0, -3);
          ctx.bezierCurveTo(3, -6, 6, -1, 0, 3);
          ctx.fill();
          ctx.restore();
          break;
        }
        case 'zzz':
          ctx.fillStyle = `rgba(90,80,110,${(fade * 0.7).toFixed(3)})`;
          ctx.font = `600 ${q.size}px ${FONT_EN}`;
          ctx.textAlign = 'center';
          ctx.fillText('z', q.x, q.y);
          break;
        case 'sparkle':
          ctx.fillStyle = `rgba(255,248,215,${fade.toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(q.x, q.y - q.size * 2);
          ctx.lineTo(q.x + q.size * 0.5, q.y);
          ctx.lineTo(q.x, q.y + q.size * 2);
          ctx.lineTo(q.x - q.size * 0.5, q.y);
          ctx.moveTo(q.x - q.size * 2, q.y);
          ctx.lineTo(q.x, q.y + q.size * 0.5);
          ctx.lineTo(q.x + q.size * 2, q.y);
          ctx.lineTo(q.x, q.y - q.size * 0.5);
          ctx.fill();
          glow(q.x, q.y, q.size * 6, fade * 0.5, 'gold');
          break;
        case 'firefly': {
          const fl = 0.5 + 0.5 * Math.sin(t * 3 + q.ph);
          ctx.fillStyle = `rgba(240,255,190,${(fade * fl).toFixed(3)})`;
          ctx.beginPath();
          circle(q.x, q.y, 1.6);
          ctx.fill();
          glow(q.x, q.y, 16, fade * fl * (0.4 + 0.6 * pal.dark), q.glow || 'gold');
          break;
        }
        case 'butterfly': {
          const flap = Math.abs(Math.sin(t * 12 + q.ph));
          ctx.save();
          ctx.translate(q.x, q.y);
          ctx.scale(q.vx > 0 ? 1 : -1, 1);
          ctx.fillStyle = rgb(q.col, fade);
          ctx.beginPath();
          ctx.ellipse(-2, -2, 4 * flap + 0.6, 3.5, -0.4, 0, TAU);
          ctx.ellipse(-1.5, 1.5, 2.6 * flap + 0.4, 2.4, 0.4, 0, TAU);
          ctx.fill();
          ctx.restore();
          break;
        }
        case 'skylantern': {
          const sw = Math.sin(t * 1.3 + q.ph) * 0.08;
          ctx.save();
          ctx.translate(q.x, q.y);
          ctx.rotate(sw);
          ctx.fillStyle = `rgba(255,196,120,${fade.toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(-5, -8);
          ctx.lineTo(5, -8);
          ctx.lineTo(4, 5);
          ctx.lineTo(-4, 5);
          ctx.fill();
          ctx.fillStyle = `rgba(255,236,170,${fade.toFixed(3)})`;
          ctx.fillRect(-3, 3, 6, 2);
          ctx.restore();
          glow(q.x, q.y, 34, fade * 0.8, 'warm');
          break;
        }
      }
    }
  }

  function drawWhale() {
    const w = G.whale;
    if (!w) return;
    const D = 2.4;
    const k = clamp(w.t / D, 0, 1);
    const x = w.x + k * 300;
    const lvl = seaLevel();
    const y = lvl + 30 - Math.sin(Math.PI * k) * 150;
    const ang = Math.atan2(-Math.cos(Math.PI * k) * 150 * Math.PI, 300) ;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x - 400, lvl - 2000, 800, 2000);
    ctx.clip();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.fillStyle = T([88, 112, 178]);
    ctx.beginPath();
    ctx.ellipse(0, 0, 58, 22, 0, 0, TAU);
    ctx.moveTo(-50, -4);
    ctx.quadraticCurveTo(-74, -6, -86, -22);
    ctx.quadraticCurveTo(-76, -4, -88, 10);
    ctx.quadraticCurveTo(-72, 2, -50, 8);
    ctx.fill();
    ctx.fillStyle = T([200, 214, 245]);
    ctx.beginPath();
    ctx.ellipse(8, 10, 44, 10, 0.05, 0, Math.PI);
    ctx.fill();
    ctx.fillStyle = T([60, 76, 130]);
    ctx.beginPath();
    ctx.ellipse(4, 12, 16, 5, 0.6, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#1d2240';
    ctx.beginPath();
    circle(36, -2, 2.4);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,140,160,0.5)';
    ctx.beginPath();
    circle(38, 5, 3.5);
    ctx.fill();
    ctx.restore();
  }

  // two soft hills in front of the path give the bottom of the screen some depth
  const BANDS = [
    { p: 1.16, base: 94, amp: 26, freq: 0.0031, seed: 4.4, dk: 0.2, lift: 0.1 },
    { p: 1.38, base: 176, amp: 34, freq: 0.0023, seed: 8.8, dk: 0.42, lift: 0 },
  ];
  // the near hills dip down in front of the lake and the sea so the water stays visible
  function bandDrop(wx) {
    const dl = wx < Wd.LAKE0 ? Wd.LAKE0 - wx : wx > Wd.LAKE1 ? wx - Wd.LAKE1 : 0;
    return Math.max(150 * (1 - smoothstep(0, 420, dl)), 150 * smoothstep(Wd.SHORE - 1500, Wd.SHORE - 100, wx));
  }
  function drawForeground() {
    for (const B of BANDS) {
      const off = cam.x * B.p;
      const pts = [];
      for (let px = -12; px <= W + 18; px += 7) {
        const lx = off + (px - W / 2) / S;
        const drop = bandDrop(cam.x + (px - W / 2) / S);
        pts.push(px, lsy(B.base + drop - B.amp * fbm(lx * B.freq + B.seed, 3) * 1.6, B.p));
      }
      let minY = H;
      for (let i = 1; i < pts.length; i += 2) minY = Math.min(minY, pts[i]);
      if (minY > H + 4) continue;
      const colAtPx = (key, px) => Wd.colAt(key, cam.x + (px - W / 2) / S);
      const hg = (fn) => {
        const g = ctx.createLinearGradient(0, 0, W, 0);
        for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, rgb(fn((i / 6) * W)));
        return g;
      };
      ctx.beginPath();
      ctx.moveTo(-12, H + 10);
      for (let i = 0; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
      ctx.lineTo(W + 18, H + 10);
      ctx.closePath();
      ctx.fillStyle = hg((px) => lighten(mix(colAtPx('gTop', px), colAtPx('gDeep', px), B.dk), B.lift));
      ctx.fill();
      const vg = ctx.createLinearGradient(0, minY, 0, minY + 160 * S);
      vg.addColorStop(0, rgb(pal.gDeep, 0));
      vg.addColorStop(1, rgb(darken(pal.gDeep, 0.2), 0.55));
      ctx.fillStyle = vg;
      ctx.fill();
      // rim
      ctx.beginPath();
      for (let i = 0; i < pts.length; i += 2) (i ? ctx.lineTo : ctx.moveTo).call(ctx, pts[i], pts[i + 1] + 1.5);
      ctx.strokeStyle = hg((px) => mix(colAtPx('gRim', px), colAtPx('gDeep', px), B.dk * 0.6));
      ctx.lineWidth = 3 * S * B.p * 0.7;
      ctx.stroke();
      // grass & flowers on the rim
      const k = S * B.p;
      ctx.beginPath();
      for (let i = 0; i < pts.length - 2; i += 2) {
        for (let j = 0; j < 2; j++) {
          const px = pts[i] + j * 3.5;
          const y = lerp(pts[i + 1], pts[i + 3], j * 0.5) + 2;
          const wx = off + (px - W / 2) / S;
          const h = hash(Math.round(wx * 0.5) * 0.73 + B.seed);
          const len = Wd.numAt('grassH', cam.x + (px - W / 2) / S) * (0.6 + h * 0.9) * k * 0.9;
          const a = Math.sin(t * 1.6 + wx * 0.04) * 0.2 + (h - 0.5) * 0.5;
          ctx.moveTo(px - 1.3 * k, y);
          ctx.quadraticCurveTo(px + Math.sin(a) * len * 0.4, y - len * 0.55, px + Math.sin(a) * len, y - Math.cos(a) * len);
          ctx.lineTo(px + 1.3 * k, y);
        }
      }
      ctx.fillStyle = hg((px) => mix(colAtPx('grass', px), colAtPx('gDeep', px), B.dk * 0.8));
      ctx.fill();
      for (let i = 0; i < pts.length - 2; i += 2) {
        const wx = Math.round((off + (pts[i] - W / 2) / S) / 9);
        const h = hash(wx * 1.91 + B.seed * 3);
        const fx = cam.x + (pts[i] - W / 2) / S;
        if (h > Wd.numAt('flowerD', fx) * 0.5) continue;
        const key = ['f1', 'f2', 'f3'][Math.floor(hash(wx * 4.3) * 3)];
        const stem = (5 + hash(wx * 2.7) * 9) * k * 0.8;
        const X = pts[i] + Math.sin(t * 1.5 + wx) * 1.5 * k, Y = pts[i + 1] + 2 - stem;
        ctx.strokeStyle = rgb(mix(colAtPx('grass', pts[i]), colAtPx('gDeep', pts[i]), B.dk));
        ctx.lineWidth = 1.1 * k * 0.7;
        ctx.beginPath();
        ctx.moveTo(pts[i], pts[i + 1] + 2);
        ctx.quadraticCurveTo(pts[i], Y + stem * 0.4, X, Y);
        ctx.stroke();
        flowerHead(X, Y, 2.2 * k * 0.8, rgb(mix(Wd.colAt(key, fx), colAtPx('gDeep', pts[i]), B.dk * 0.5)), wx);
      }
    }
  }

  // ---- text bubbles --------------------------------------------------------
  function wrap(text, maxW, zh) {
    const out = [];
    for (const para of text.split('\n')) {
      const units = zh ? Array.from(para) : para.split(' ');
      let line = '';
      for (const u of units) {
        const test = line ? (zh ? line + u : line + ' ' + u) : u;
        // never start a line with closing punctuation (，。！？…)
        if (ctx.measureText(test).width > maxW && line && !(zh && /[，。！？、…～）」』]/.test(u))) {
          out.push(line);
          line = u;
        } else line = test;
      }
      out.push(line);
    }
    return out;
  }
  function drawBubble(b) {
    const zh = G.lang === 'zh';
    const px = FT.capture ? 24 : Math.round(clamp(12 * Math.sqrt(baseS) * 1.1, 13, 19)); // bigger in the demo video
    ctx.font = zh ? `${px + 1}px ${FONT_ZH}` : `600 ${px}px ${FONT_EN}`;
    const full = wrap(b.text, px * (zh ? 13 : 16), zh);
    // typewriter: reveal the final layout character by character, so words never jump between lines
    let left = Math.max(1, Math.floor(b.chars));
    const lines = [];
    for (const l of full) {
      if (left <= 0) break;
      const ch = Array.from(l);
      lines.push(ch.slice(0, left).join(''));
      left -= ch.length + (zh ? 0 : 1);
    }
    let w = 0;
    for (const l of full) w = Math.max(w, ctx.measureText(l).width);
    w += px * 1.5;
    const lh = px * 1.4;
    const h = full.length * lh + px * 0.9;
    const X = sx(b.x), Y = sy(b.y);
    const k = px / 16;
    // side: shift the bubble away from the player's head; the tail keeps pointing at the speaker
    const off = (b.side || 0) * (w / 2 - 18 * k);
    const bx = clamp(X - w / 2 + off, 8, W - 8 - w), by = Y - h - 12 * k;
    const tx = clamp(X, bx + 16 * k, bx + w - 16 * k);
    ctx.globalAlpha = b.a;
    ctx.fillStyle = 'rgba(60,40,70,0.12)';
    ctx.beginPath();
    rrect(bx + 2, by + 3, w, h, px * 0.8);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,252,247,0.95)';
    ctx.beginPath();
    rrect(bx, by, w, h, px * 0.8);
    ctx.moveTo(tx - 7 * k, by + h - 1);
    ctx.lineTo(X, by + h + 9 * k);
    ctx.lineTo(tx + 7 * k, by + h - 1);
    ctx.fill();
    ctx.fillStyle = '#5c4a55';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    lines.forEach((l, i) => ctx.fillText(l, bx + px * 0.75, by + px * 0.45 + lh * (i + 0.5)));
    ctx.globalAlpha = 1;
  }
  function drawPrompt(pr) {
    const X = sx(pr.x), Y = sy(pr.y) - 6 + Math.sin(t * 4) * 3;
    const r = Math.round(clamp(11 * Math.sqrt(baseS), 11, 17));
    ctx.fillStyle = 'rgba(255,252,247,0.92)';
    ctx.beginPath();
    circle(X, Y, r);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,190,110,0.9)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#6b5560';
    ctx.font = `700 ${Math.round(r * 1.05)}px ${FONT_EN}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pr.label, X, Y + 1);
  }

  // ---- frame ---------------------------------------------------------------
  R.render = function (game) {
    G = game;
    t = G.t;
    cam = G.cam;
    S = baseS * cam.zoom;
    Wd.palAt(cam.x, pal);
    tintC = pal.tint;
    glows.length = 0;
    const halfW = W / 2 / S;
    const x0 = cam.x - halfW - 60, x1 = cam.x + halfW + 60;

    screenT();
    drawSky();
    drawClouds();
    drawLayers();

    worldT();
    drawTrees(x0, x1);
    drawGround(x0, x1);
    drawLake(x0, x1);
    if (Math.abs(Wd.HOME.x - cam.x) < halfW + 150) drawHome();
    if (Math.abs(Wd.SIGN.x - cam.x) < halfW + 60) drawSign();
    for (const p of Wd.PLATS) if (p.x1 > x0 && p.x0 < x1) drawPlatform(p);
    for (const L of G.lanterns) if (Math.abs(L.x - cam.x) < halfW + 140) drawLantern(L);
    if (Math.abs(Wd.LIGHTHOUSE.x - cam.x) < halfW + 200) drawLighthouse();
    drawDecor(x0, x1);
    drawGrass(x0, x1);
    drawFlowers(x0, x1);
    for (const n of G.npcs) if (Math.abs(n.x - cam.x) < halfW + 60) drawNPC(n);
    drawMotes(x0, x1);
    drawPlayer();
    drawSea(x0, x1);
    drawWhale();
    drawParticles();

    // light
    ctx.globalCompositeOperation = 'lighter';
    drawBeam();
    const gk = 0.45 + 0.55 * pal.dark;
    for (let i = 0; i < glows.length; i += 5) {
      const r = glows[i + 2];
      ctx.globalAlpha = Math.min(1, glows[i + 3] * gk);
      ctx.drawImage(GLOW[glows[i + 4]], glows[i] - r, glows[i + 1] - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    screenT();
    drawMoonPath();
    drawForeground();
    for (const b of G.bubbles) drawBubble(b);
    if (G.prompt) drawPrompt(G.prompt);

    ctx.drawImage(vignette, 0, 0, W, H);
    if (!R.lite) {
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = 0.055;
      ctx.fillStyle = grainPat;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  };
})();
