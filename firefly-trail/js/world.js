/* 萤火小径 · Firefly Trail — the world: six biomes laid out from morning to night */
(function () {
  'use strict';
  const FT = window.FT;
  const { hex, mix, lerp, smoothstep, fbm, noise1 } = FT.U;

  const ZW = 3400; // width of one biome
  const NZ = 6;
  const LAKE0 = 7950, LAKE1 = 9150, LAKE_C = (LAKE0 + LAKE1) / 2;
  const SHORE = 19500; // where the sand meets the sea
  const SEA_Y = 30;
  const BEACH_Y = 22;

  function P(o) {
    const r = {};
    for (const k in o) r[k] = typeof o[k] === 'string' ? hex(o[k]) : o[k];
    return r;
  }

  // Each biome is also a time of day, so walking east is walking into the night.
  const PAL = [
    P({ // 0 · Flower Meadow · morning
      skyTop: '#7db6e6', skyMid: '#b9dcf1', skyBot: '#fde8d2', sun: '#fff8e3', sunGlow: '#fff0c8',
      cloud: '#ffffff', cloudSh: '#d9e9f7', m0: '#b8cfe7', m1: '#a3c6de', m2: '#9bc9b1', m3: '#87bf91', treeFar: '#73ad85',
      gTop: '#8fd077', gRim: '#c6ee9e', gDeep: '#4b8551', grass: '#77bd62', grassHi: '#b2e38b',
      f1: '#ffc4d3', f2: '#fff09a', f3: '#ffffff', leaf: '#68b26a', leafHi: '#9fd683', trunk: '#8d6b52',
      water: '#6fbcd9', waterHi: '#e6f7ff', tint: [1, 1, 1],
      sunH: 0.74, night: 0, dark: 0, cap: 0, cloudA: 0.96, grassH: 11, flowerD: 0.5, treeD: 0.34, amp: 46, base: 0, wind: 0.6,
    }),
    P({ // 1 · Blossom Hill · late morning
      skyTop: '#8cb6ec', skyMid: '#d4d8f4', skyBot: '#ffe0ea', sun: '#fff8ea', sunGlow: '#ffeede',
      cloud: '#fffafc', cloudSh: '#e8d9ef', m0: '#c8c4e6', m1: '#bdb5de', m2: '#e3b6cd', m3: '#a7cf8f', treeFar: '#d99fba',
      gTop: '#96d07d', gRim: '#ccef9f', gDeep: '#558e55', grass: '#82c46c', grassHi: '#bbe795',
      f1: '#ffc0d3', f2: '#ffffff', f3: '#f6a3c2', leaf: '#f5b2c8', leafHi: '#ffdbe7', trunk: '#7c5b57',
      water: '#7cc3dd', waterHi: '#f1f7ff', tint: [1, 0.99, 1],
      sunH: 0.66, night: 0, dark: 0, cap: 0.1, cloudA: 0.95, grassH: 10, flowerD: 0.55, treeD: 0.62, amp: 40, base: -8, wind: 0.9,
    }),
    P({ // 2 · Mirror Lake · golden afternoon
      skyTop: '#6ca6dd', skyMid: '#cfe0e5', skyBot: '#ffdcaa', sun: '#fff1c6', sunGlow: '#ffe2a6',
      cloud: '#fff9ef', cloudSh: '#ecd8c0', m0: '#a6bed6', m1: '#8eb2c6', m2: '#7fb3a3', m3: '#6fae7d', treeFar: '#5f9d7b',
      gTop: '#94c96b', gRim: '#d1e78f', gDeep: '#527d46', grass: '#86bb5d', grassHi: '#c8e188',
      f1: '#fff19c', f2: '#ffffff', f3: '#cbb8ff', leaf: '#68a768', leafHi: '#a9d27e', trunk: '#876449',
      water: '#5fb2d0', waterHi: '#fff1d2', tint: [1, 0.97, 0.92],
      sunH: 0.46, night: 0, dark: 0.05, cap: 0, cloudA: 0.9, grassH: 12, flowerD: 0.4, treeD: 0.42, amp: 32, base: -4, wind: 0.4,
    }),
    P({ // 3 · Twilight Woods · sunset
      skyTop: '#5c69b0', skyMid: '#e693a5', skyBot: '#ffc489', sun: '#ffdca0', sunGlow: '#ffae78',
      cloud: '#f6b2b3', cloudSh: '#b98bb0', m0: '#8f80b4', m1: '#7a73a6', m2: '#4f7d86', m3: '#3e6c69', treeFar: '#33605f',
      gTop: '#5c9a6a', gRim: '#a3c98c', gDeep: '#26493f', grass: '#4d8a60', grassHi: '#93c288',
      f1: '#ffd59e', f2: '#ff9fb2', f3: '#c4f0ff', leaf: '#3c7d69', leafHi: '#6aa98a', trunk: '#5a4346',
      water: '#5a83b0', waterHi: '#ffc4a8', tint: [1, 0.86, 0.84],
      sunH: 0.16, night: 0.05, dark: 0.38, cap: 0, cloudA: 0.85, grassH: 10, flowerD: 0.35, treeD: 0.86, amp: 44, base: -14, wind: 0.5,
    }),
    P({ // 4 · Snowfield · dusk
      skyTop: '#2e3c7c', skyMid: '#7c7ec1', skyBot: '#f2b5c3', sun: '#ffd8c4', sunGlow: '#f4a3b8',
      cloud: '#9b94ca', cloudSh: '#6f6aa8', m0: '#6c74ae', m1: '#8d93c7', m2: '#b6bee2', m3: '#dfe5f6', treeFar: '#4b5e93',
      gTop: '#eef3fc', gRim: '#ffffff', gDeep: '#8c9ccc', grass: '#c9d5f0', grassHi: '#ffffff',
      f1: '#bfe3ff', f2: '#ffffff', f3: '#e3d2ff', leaf: '#3d5b86', leafHi: '#eef3ff', trunk: '#5a4c5e',
      water: '#4f5f9c', waterHi: '#d8c7ea', tint: [0.8, 0.83, 1],
      sunH: -0.06, night: 0.42, dark: 0.62, cap: 0.85, cloudA: 0.8, grassH: 3.5, flowerD: 0.18, treeD: 0.5, amp: 78, base: -40, wind: 1.2,
    }),
    P({ // 5 · Starlit Shore · night
      skyTop: '#0a1431', skyMid: '#1e2d65', skyBot: '#4b4889', sun: '#fdf6dc', sunGlow: '#8c8fd6',
      cloud: '#2a386f', cloudSh: '#1c2756', m0: '#1c2959', m1: '#233269', m2: '#2a3d76', m3: '#33477d', treeFar: '#1a2953',
      gTop: '#8b89b5', gRim: '#c7c6ea', gDeep: '#3b3a66', grass: '#566b98', grassHi: '#9cadd8',
      f1: '#9fe8ff', f2: '#fff6c0', f3: '#e1c8ff', leaf: '#2c476b', leafHi: '#4d6c97', trunk: '#3a3450',
      water: '#1c376d', waterHi: '#8fa9f5', tint: [0.56, 0.62, 0.88],
      sunH: -0.3, night: 1, dark: 1, cap: 0, cloudA: 0.6, grassH: 6, flowerD: 0.12, treeD: 0.1, amp: 26, base: -6, wind: 0.7,
    }),
  ];
  const KEYS = Object.keys(PAL[0]);

  // Which two biomes to blend at world x, and how much.
  function zoneBlend(x) {
    const t = x / ZW - 0.5;
    const i = Math.floor(t);
    if (i < 0) return [0, 0, 0];
    if (i >= NZ - 1) return [NZ - 1, NZ - 1, 0];
    return [i, i + 1, smoothstep(0.3, 0.7, t - i)];
  }
  function palAt(x, out) {
    const [a, b, w] = zoneBlend(x);
    const A = PAL[a], B = PAL[b];
    out = out || {};
    for (const k of KEYS) {
      const va = A[k], vb = B[k];
      out[k] = Array.isArray(va) ? mix(va, vb, w) : lerp(va, vb, w);
    }
    return out;
  }
  function colAt(key, x) {
    const [a, b, w] = zoneBlend(x);
    return mix(PAL[a][key], PAL[b][key], w);
  }
  function numAt(key, x) {
    const [a, b, w] = zoneBlend(x);
    return lerp(PAL[a][key], PAL[b][key], w);
  }
  const zoneIndex = (x) => Math.max(0, Math.min(NZ - 1, Math.floor(x / ZW)));

  // ---- Things in the world -------------------------------------------------
  const HOME = { x: 330 };
  const SIGN = { x: 790 };
  const LIGHTHOUSE = { x: 19110 };
  const LANTERNS = [2650, 6050, 9750, 12950, 16250].map((x, i) => ({ x, i }));
  const NPCS = [
    { type: 'cat', x: 1550 },
    { type: 'fawn', x: 4760 },
    { type: 'frog', x: 8860, water: true },
    { type: 'fox', x: 11500 },
    { type: 'rabbit', x: 15060 },
    { type: 'crab', x: 18320 },
  ];
  // one-way platforms; h = height above the ground
  const PLATS = [
    { type: 'cloud', x: 2060, w: 150, h: 92 },
    { type: 'branch', x: 4170, w: 130, h: 84, side: 1 },
    { type: 'branch', x: 5225, w: 120, h: 82, side: 1 },
    { type: 'branch', x: 5405, w: 120, h: 165, side: -1 },
    { type: 'mush', x: 10900, w: 84, h: 62, bounce: true },
    { type: 'mush', x: 11850, w: 92, h: 72, bounce: true },
    { type: 'mush', x: 12500, w: 84, h: 56, bounce: true },
    { type: 'rock', x: 14300, w: 104, h: 80 },
    { type: 'rock', x: 14462, w: 104, h: 160 },
    { type: 'cloud', x: 18860, w: 140, h: 96 },
  ];
  const BIG_TREES = [ // the blossom trees the branches grow from
    { x: 4250, h: 210, s: 1.25 },
    { x: 5315, h: 290, s: 1.45 },
  ];
  // glimmers: [x, height above ground]
  const MOTES = [
    [900, 34], [1240, 105], [1700, 40], [2060, 172], [2350, 60], [3050, 110],
    [3800, 40], [4170, 164], [4600, 110], [5405, 248], [5700, 45], [6400, 100],
    [7300, 45], [7700, 105], [8300, 80], [8550, 150], [8800, 80], [10000, 50],
    [10500, 45], [10900, 290], [11250, 90], [11850, 310], [12200, 50], [12500, 275],
    [13950, 50], [14462, 242], [15300, 110], [15700, 45], [16000, 120], [16700, 60],
    [17400, 50], [17900, 115], [18550, 45], [18860, 176],
  ];

  // ---- Terrain ------------------------------------------------------------
  const FLATS = [
    { x: HOME.x, w: 150, b: 170 },
    { x: SIGN.x, w: 40, b: 140 },
    { x: LIGHTHOUSE.x, w: 110, b: 160 },
    { x: LAKE_C, w: (LAKE1 - LAKE0) / 2 + 150, b: 260 },
  ];
  LANTERNS.forEach((l) => FLATS.push({ x: l.x, w: 60, b: 150 }));
  NPCS.forEach((n) => { if (!n.water) FLATS.push({ x: n.x, w: 40, b: 120 }); });

  function rawY(x) {
    const amp = numAt('amp', x), base = numAt('base', x);
    let y = base - amp * (fbm(x * 0.0011 + 11.7, 4) - 0.5) * 2.4 - 7 * (noise1(x * 0.011) - 0.5);
    y = lerp(y, BEACH_Y, smoothstep(SHORE - 1700, SHORE - 300, x));
    if (x > SHORE - 300) {
      const k = (x - (SHORE - 300)) / 300;
      y = BEACH_Y + (SEA_Y - BEACH_Y) * k * k;
      if (x > SHORE + 60) y += (x - SHORE - 60) * 0.75; // the sea gets deep quickly past the wading spot
    }
    return y;
  }
  FLATS.forEach((f) => (f.y = rawY(f.x)));

  const HM0 = -4000, HM1 = 24000, HS = 4;
  const HN = Math.ceil((HM1 - HM0) / HS) + 2;
  const surf = new Float32Array(HN);
  const terr = new Float32Array(HN);
  for (let i = 0; i < HN; i++) {
    const x = HM0 + i * HS;
    let y = rawY(x);
    for (const f of FLATS) {
      const d = Math.abs(x - f.x);
      if (d < f.w + f.b) y = lerp(y, f.y, 1 - smoothstep(f.w, f.w + f.b, d));
    }
    surf[i] = y;
    let t = y;
    if (x > LAKE0 && x < LAKE1) t += 150 * Math.pow(Math.sin((Math.PI * (x - LAKE0)) / (LAKE1 - LAKE0)), 0.55);
    terr[i] = t;
  }
  function sample(arr, x) {
    let f = (x - HM0) / HS;
    if (f < 0) f = 0;
    else if (f > HN - 2) f = HN - 2;
    const i = f | 0;
    return arr[i] + (arr[i + 1] - arr[i]) * (f - i);
  }
  const surfaceY = (x) => sample(surf, x); // where feet walk (the bridge over the lake)
  const terrainY = (x) => sample(terr, x); // the actual earth (lake bed)
  const BRIDGE_Y = surfaceY(LAKE_C);
  const LAKE_Y = BRIDGE_Y + 20;
  const onBridge = (x) => x > LAKE0 - 40 && x < LAKE1 + 40;

  function groundKind(x) {
    if (onBridge(x)) return 'wood';
    const z = zoneBlend(x);
    const d = z[2] > 0.5 ? z[1] : z[0];
    return d === 4 ? 'snow' : d === 5 ? 'sand' : 'grass';
  }

  PLATS.forEach((p) => {
    p.ground = surfaceY(p.x);
    p.y = p.ground - p.h;
    p.x0 = p.x - p.w / 2;
    p.x1 = p.x + p.w / 2;
    p.squish = 0;
  });

  FT.W = {
    ZW, NZ, PAL, KEYS, LAKE0, LAKE1, LAKE_C, SHORE, SEA_Y, BEACH_Y, BRIDGE_Y, LAKE_Y,
    WORLD_MIN: 170, WORLD_MAX: SHORE + 40,
    HOME, SIGN, LIGHTHOUSE, LANTERNS, NPCS, PLATS, BIG_TREES, MOTES,
    zoneBlend, palAt, colAt, numAt, zoneIndex, surfaceY, terrainY, onBridge, groundKind,
  };
})();
