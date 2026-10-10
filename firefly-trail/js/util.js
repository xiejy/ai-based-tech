/* 萤火小径 · Firefly Trail — small math / color helpers */
(function () {
  'use strict';
  const FT = (window.FT = window.FT || {});

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => t * t * (3 - 2 * t);
  const smoothstep = (a, b, v) => smooth(clamp((v - a) / (b - a), 0, 1));
  const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));
  const approach = (v, target, step) => (v < target ? Math.min(v + step, target) : Math.max(v - step, target));

  function hash(n) {
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
    return s - Math.floor(s);
  }
  function noise1(x) {
    const i = Math.floor(x);
    const f = x - i;
    return lerp(hash(i), hash(i + 1), smooth(f));
  }
  function fbm(x, oct) {
    let a = 0.5, s = 0, n = 0, f = 1;
    for (let i = 0; i < (oct || 4); i++) {
      s += a * noise1(x * f + i * 17.31);
      n += a;
      a *= 0.5;
      f *= 2.03;
    }
    return s / n;
  }

  function hex(h) {
    const v = parseInt(h.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const mul = (c, m) => [c[0] * m[0], c[1] * m[1], c[2] * m[2]];
  const WHITE = [255, 255, 255];
  const BLACK = [0, 0, 0];
  const lighten = (c, t) => mix(c, WHITE, t);
  const darken = (c, t) => mix(c, BLACK, t);
  function rgb(c, a) {
    const r = Math.round(c[0]), g = Math.round(c[1]), b = Math.round(c[2]);
    return a === undefined ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a.toFixed(3)})`;
  }

  FT.U = { clamp, lerp, smooth, smoothstep, damp, approach, hash, noise1, fbm, hex, mix, mul, lighten, darken, rgb, WHITE, BLACK, TAU: Math.PI * 2 };
})();
