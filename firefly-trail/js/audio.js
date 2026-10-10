/* 萤火小径 · Firefly Trail — generative ambient music + soft sound effects (Web Audio, no files) */
(function () {
  'use strict';
  const FT = window.FT;
  const { clamp } = FT.U;

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  // Cmaj7 → Am7 → Fmaj7 → G6 : warm and a little wistful
  const CHORDS = [
    [48, 55, 59, 64, 67],
    [45, 52, 55, 60, 64],
    [41, 52, 57, 60, 64],
    [43, 50, 55, 59, 64],
  ];
  const PENTA = [72, 74, 76, 79, 81, 84, 86, 88, 91];

  FT.Audio = {
    ctx: null,
    muted: false,
    night: 0,

    init() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = (this.ctx = new AC());

      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 3;
      comp.connect(ctx.destination);
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.85;
      this.master.connect(comp);

      this.reverb = ctx.createConvolver();
      this.reverb.buffer = this.impulse(3.4);
      const rv = ctx.createGain();
      rv.gain.value = 0.55;
      this.reverb.connect(rv).connect(this.master);

      this.music = ctx.createGain();
      this.music.gain.value = 0.5;
      this.music.connect(this.master);
      const mSend = ctx.createGain();
      mSend.gain.value = 0.7;
      this.music.connect(mSend).connect(this.reverb);

      // a soft echo for the melody
      this.echo = ctx.createDelay(1.5);
      this.echo.delayTime.value = 0.48;
      const fb = ctx.createGain();
      fb.gain.value = 0.32;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2200;
      this.echo.connect(lp).connect(fb).connect(this.echo);
      lp.connect(this.music);

      this.sfx = ctx.createGain();
      this.sfx.gain.value = 0.75;
      this.sfx.connect(this.master);
      const sSend = ctx.createGain();
      sSend.gain.value = 0.3;
      this.sfx.connect(sSend).connect(this.reverb);

      // noise for wind / water / footsteps
      const len = ctx.sampleRate * 2;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

      this.wind = this.loopNoise('bandpass', 420, 0.7);
      this.water = this.loopNoise('lowpass', 650, 0.5);

      this.nextChord = ctx.currentTime + 0.2;
      this.chord = 0;
      this.nextNote = ctx.currentTime + 1.2;
      this.melIdx = 3;
    },

    impulse(sec) {
      const ctx = this.ctx;
      const n = Math.floor(ctx.sampleRate * sec);
      const buf = ctx.createBuffer(2, n, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6);
      }
      return buf;
    },

    loopNoise(type, freq, q) {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(this.master);
      src.start();
      return { src, f, g };
    },

    setMuted(m) {
      this.muted = m;
      if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.85, this.ctx.currentTime, 0.15);
    },

    // called every frame
    update(dt, env) {
      const ctx = this.ctx;
      if (!ctx || ctx.state !== 'running') return;
      const now = ctx.currentTime;
      this.night = env.night;

      this.wind.g.gain.setTargetAtTime(0.018 + 0.03 * env.wind * (0.6 + 0.4 * Math.sin(now * 0.31) * Math.sin(now * 0.17)), now, 0.5);
      this.wind.f.frequency.setTargetAtTime(340 + 160 * Math.sin(now * 0.23), now, 0.5);
      const wave = 0.65 + 0.35 * Math.sin(now * 0.9);
      this.water.g.gain.setTargetAtTime(0.11 * env.water * wave, now, 0.3);

      // pads
      while (this.nextChord < now + 0.5) {
        const dur = 7.2;
        this.pad(CHORDS[this.chord], this.nextChord, dur);
        this.chord = (this.chord + 1) % CHORDS.length;
        this.nextChord += dur;
      }
      // a sparse music-box melody
      const step = 0.42 + 0.2 * env.night;
      while (this.nextNote < now + 0.4) {
        if (Math.random() < 0.34 - 0.08 * env.night) {
          this.melIdx = clamp(this.melIdx + [-2, -1, -1, 1, 1, 2, 0][(Math.random() * 7) | 0], 0, PENTA.length - 1);
          const m = PENTA[this.melIdx] - (env.night > 0.6 ? 12 : 0);
          this.bell(mtof(m), this.nextNote, 0.05, this.music, true);
        }
        this.nextNote += step;
      }
    },

    pad(notes, t, dur) {
      const ctx = this.ctx;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900 - 300 * this.night;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(1, t + 2.6);
      g.gain.setValueAtTime(1, t + dur - 0.4);
      g.gain.linearRampToValueAtTime(0, t + dur + 2.8);
      lp.connect(g).connect(this.music);
      notes.forEach((m, i) => {
        for (const det of [-5, 5]) {
          const o = ctx.createOscillator();
          o.type = i === 0 ? 'sine' : 'triangle';
          o.frequency.value = mtof(m);
          o.detune.value = det;
          const og = ctx.createGain();
          og.gain.value = i === 0 ? 0.05 : 0.016;
          o.connect(og).connect(lp);
          o.start(t);
          o.stop(t + dur + 3);
        }
      });
    },

    bell(freq, t, vol, dest, echo) {
      const ctx = this.ctx;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
      g.connect(dest || this.sfx);
      if (echo) g.connect(this.echo);
      [[1, 1], [2.0, 0.28], [3.01, 0.08], [4.2, 0.03]].forEach(([r, a]) => {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = freq * r;
        const og = ctx.createGain();
        og.gain.value = a;
        o.connect(og).connect(g);
        o.start(t);
        o.stop(t + 2.5);
      });
    },

    noiseHit(t, dur, type, freq, q, vol, freqEnd) {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.setValueAtTime(freq, t);
      if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f).connect(g).connect(this.sfx);
      src.start(t, Math.random() * 1.5);
      src.stop(t + dur + 0.05);
    },

    tone(type, f0, f1, t, dur, vol) {
      const ctx = this.ctx;
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(this.sfx);
      o.start(t);
      o.stop(t + dur + 0.05);
    },

    play(name, arg) {
      const ctx = this.ctx;
      if (!ctx || ctx.state !== 'running') return;
      const t = ctx.currentTime + 0.005;
      switch (name) {
        case 'collect': {
          const n = arg || 0;
          const m = PENTA[n % 5] + 12 * Math.floor((n % 10) / 5);
          this.bell(mtof(m), t, 0.12);
          this.bell(mtof(m + 7), t + 0.07, 0.05);
          break;
        }
        case 'jump':
          this.noiseHit(t, 0.16, 'bandpass', 700, 1.2, 0.06, 1800);
          this.tone('sine', 330, 520, t, 0.12, 0.025);
          break;
        case 'land':
          this.tone('sine', 140, 60, t, 0.12, 0.08);
          this.noiseHit(t, 0.08, 'lowpass', 900, 0.7, 0.04);
          break;
        case 'glide':
          this.noiseHit(t, 0.25, 'highpass', 2500, 0.7, 0.03, 4000);
          break;
        case 'bounce':
          this.tone('sine', 180, 620, t, 0.28, 0.12);
          this.tone('triangle', 360, 1240, t + 0.02, 0.22, 0.03);
          break;
        case 'step': {
          const kind = arg;
          if (kind === 'snow') this.noiseHit(t, 0.09, 'bandpass', 2600, 1.4, 0.05);
          else if (kind === 'wood') this.tone('sine', 210, 150, t, 0.08, 0.05);
          else if (kind === 'sand') this.noiseHit(t, 0.08, 'lowpass', 1100, 0.6, 0.035);
          else this.noiseHit(t, 0.06, 'bandpass', 1500, 0.8, 0.022);
          break;
        }
        case 'splash':
          this.noiseHit(t, 0.3, 'lowpass', 1600, 0.6, 0.05, 500);
          break;
        case 'chirp': {
          const b = arg || 700;
          this.tone('triangle', b, b * 1.5, t, 0.12, 0.05);
          this.tone('triangle', b * 1.2, b * 0.9, t + 0.13, 0.16, 0.045);
          break;
        }
        case 'pet':
          [0, 0.09, 0.18].forEach((d, i) => this.bell(mtof(84 + [0, 4, 7][i]), t + d, 0.05));
          break;
        case 'lantern':
          [72, 76, 79, 83, 86, 88].forEach((m, i) => this.bell(mtof(m), t + i * 0.11, 0.09));
          this.pad([60, 64, 67, 71], t, 3);
          break;
        case 'nope':
          this.tone('sine', 420, 360, t, 0.18, 0.04);
          break;
        case 'card':
          this.noiseHit(t, 0.5, 'bandpass', 900, 0.5, 0.03, 2600);
          this.bell(mtof(88), t + 0.1, 0.05);
          break;
        case 'ending':
          [60, 64, 67, 71, 74, 76, 79, 83, 86].forEach((m, i) => this.bell(mtof(m), t + i * 0.16, 0.08));
          this.pad([48, 55, 60, 64, 67, 71], t, 8);
          break;
        case 'ui':
          this.bell(mtof(84), t, 0.04);
          break;
      }
    },
  };
})();
