// Tiny synthesized sound kit (WebAudio). No audio files needed.
let ctx = null, master = null, vmul = 1;
const loops = {};

export function unlockAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.35; master.connect(ctx.destination);
  } catch { ctx = null; }
}

export function setVolume(v) { if (master) master.gain.value = v; }

function tone({ f = 440, f2 = null, type = 'sine', dur = 0.15, vol = 0.5, delay = 0, attack = 0.005 }) {
  if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t0);
  if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol * vmul), t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.05);
}

function noise({ dur = 0.3, vol = 0.4, delay = 0, hp = 400, lp = 8000 }) {
  if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const h = ctx.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = hp;
  const l = ctx.createBiquadFilter(); l.type = 'lowpass'; l.frequency.value = lp;
  const g = ctx.createGain(); g.gain.value = vol * vmul;
  src.connect(h); h.connect(l); l.connect(g); g.connect(master); src.start(t0);
}

const SFX = {
  ding: () => tone({ f: 1320, type: 'triangle', dur: 0.25, vol: 0.25 }),
  bell: () => { tone({ f: 1760, type: 'sine', dur: 1.2, vol: 0.5 }); tone({ f: 2640, type: 'sine', dur: 0.8, vol: 0.2 }); },
  print: () => { for (let i = 0; i < 6; i++) tone({ f: 900 + (i % 2) * 300, type: 'square', dur: 0.04, vol: 0.08, delay: i * 0.06 }); },
  tvbeep: () => { tone({ f: 880, type: 'square', dur: 0.08, vol: 0.12 }); tone({ f: 1175, type: 'square', dur: 0.1, vol: 0.12, delay: 0.1 }); },
  sizzle: () => noise({ dur: 0.6, vol: 0.18, hp: 3000 }),
  whoosh: () => { noise({ dur: 0.9, vol: 0.5, hp: 200, lp: 2500 }); tone({ f: 80, f2: 200, type: 'sawtooth', dur: 0.6, vol: 0.2 }); },
  psssh: () => noise({ dur: 1.2, vol: 0.4, hp: 1500 }),
  flutter: () => noise({ dur: 0.25, vol: 0.12, hp: 2500 }),
  clunk: () => { tone({ f: 120, f2: 60, type: 'square', dur: 0.15, vol: 0.4 }); noise({ dur: 0.1, vol: 0.3, lp: 1500 }); },
  click: () => tone({ f: 2000, type: 'square', dur: 0.02, vol: 0.1 }),
  plate: () => { tone({ f: 2400, type: 'triangle', dur: 0.08, vol: 0.12 }); tone({ f: 3100, type: 'triangle', dur: 0.06, vol: 0.08, delay: 0.03 }); },
  paper: () => noise({ dur: 0.12, vol: 0.1, hp: 4000 }),
  trash: () => { noise({ dur: 0.25, vol: 0.25, lp: 1200 }); tone({ f: 200, f2: 90, type: 'triangle', dur: 0.2, vol: 0.2 }); },
  doorbell: () => { tone({ f: 1046, type: 'sine', dur: 0.4, vol: 0.2 }); tone({ f: 784, type: 'sine', dur: 0.6, vol: 0.2, delay: 0.25 }); },
  register: () => { tone({ f: 1500, type: 'square', dur: 0.05, vol: 0.1 }); tone({ f: 1500, type: 'square', dur: 0.05, vol: 0.1, delay: 0.08 }); },
  chaching: () => { tone({ f: 2093, type: 'triangle', dur: 0.15, vol: 0.3 }); tone({ f: 2637, type: 'triangle', dur: 0.5, vol: 0.3, delay: 0.12 }); noise({ dur: 0.15, vol: 0.15, hp: 5000, delay: 0.1 }); },
  slam: () => { tone({ f: 90, f2: 40, type: 'sine', dur: 0.35, vol: 0.9 }); noise({ dur: 0.2, vol: 0.5, lp: 900 }); },
  thud: () => { tone({ f: 70, f2: 35, type: 'sine', dur: 0.3, vol: 0.8 }); },
  grumble: () => tone({ f: 140, f2: 110, type: 'sawtooth', dur: 0.4, vol: 0.12 }),
  blegh: () => { tone({ f: 300, f2: 70, type: 'sawtooth', dur: 0.8, vol: 0.3 }); noise({ dur: 0.6, vol: 0.25, lp: 700, delay: 0.2 }); },
  buzz: () => tone({ f: 110, type: 'square', dur: 0.35, vol: 0.18 }),
  splash: () => noise({ dur: 0.5, vol: 0.25, hp: 600, lp: 4000 }),
  pour: () => noise({ dur: 0.8, vol: 0.1, hp: 1200, lp: 5000 }),
  powerdown: () => tone({ f: 600, f2: 40, type: 'sawtooth', dur: 1.0, vol: 0.25 }),
  powerup: () => tone({ f: 60, f2: 700, type: 'sawtooth', dur: 0.7, vol: 0.18 }),
  scratch: () => tone({ f: 800, f2: 120, type: 'sawtooth', dur: 0.4, vol: 0.2 }),
  bus: () => { tone({ f: 220, type: 'square', dur: 0.4, vol: 0.2 }); tone({ f: 277, type: 'square', dur: 0.5, vol: 0.2, delay: 0.45 }); },
  slip: () => { tone({ f: 300, f2: 1400, type: 'sine', dur: 0.35, vol: 0.25 }); tone({ f: 1400, f2: 200, type: 'sine', dur: 0.4, vol: 0.2, delay: 0.35 }); noise({ dur: 0.2, vol: 0.3, lp: 900, delay: 0.75 }); },
  fridge: () => { tone({ f: 90, type: 'sine', dur: 0.25, vol: 0.2 }); noise({ dur: 0.15, vol: 0.12, hp: 200, lp: 1200 }); },
  clatter: () => { for (let i = 0; i < 5; i++) tone({ f: 2200 + Math.random() * 1800, type: 'triangle', dur: 0.08, vol: 0.12, delay: i * 0.05 + Math.random() * 0.03 }); },
  ice: () => { for (let i = 0; i < 4; i++) tone({ f: 3000 + Math.random() * 1500, type: 'sine', dur: 0.04, vol: 0.08, delay: i * 0.04 }); },
  blub: () => { for (let i = 0; i < 5; i++) tone({ f: 180 + Math.random() * 120, f2: 380 + Math.random() * 200, type: 'sine', dur: 0.09, vol: 0.18, delay: i * 0.11 }); },
  plunge: () => { tone({ f: 140, f2: 60, type: 'sine', dur: 0.18, vol: 0.4 }); tone({ f: 420, f2: 900, type: 'sine', dur: 0.12, vol: 0.18, delay: 0.16 }); },
  flush: () => { noise({ dur: 1.1, vol: 0.28, hp: 300, lp: 2500 }); tone({ f: 500, f2: 160, type: 'sine', dur: 1.0, vol: 0.12 }); },
  door: () => { tone({ f: 220, f2: 180, type: 'triangle', dur: 0.08, vol: 0.15 }); noise({ dur: 0.08, vol: 0.12, lp: 900, delay: 0.05 }); },
  pop: () => tone({ f: 660, f2: 990, type: 'sine', dur: 0.08, vol: 0.15 }),
  hover: () => tone({ f: 1800, type: 'sine', dur: 0.03, vol: 0.03 }),
  menu: () => tone({ f: 1200, type: 'triangle', dur: 0.05, vol: 0.08 }),
  deny: () => tone({ f: 180, type: 'square', dur: 0.12, vol: 0.1 }),
};

export function play(name, vol = 1) {
  if (!ctx || !SFX[name]) return;
  vmul = vol; SFX[name](); vmul = 1;
}

// Continuous noise-event loops. Called every frame with which ones are on.
const LOOP_DEFS = {
  alarm: (t) => { if (Math.floor(t * 4) % 2 === 0) tone({ f: 3200, type: 'square', dur: 0.2, vol: 0.12 }); },
  blender: () => noise({ dur: 0.3, vol: 0.12, hp: 300, lp: 3000 }),
  jukebox: (t) => { const notes = [262, 330, 392, 330, 349, 440, 392, 294]; tone({ f: notes[Math.floor(t * 4) % notes.length], type: 'square', dur: 0.22, vol: 0.12 }); tone({ f: 65, type: 'square', dur: 0.2, vol: 0.15 }); },
};
// active = { loopName: volume }
export function updateLoops(active) {
  if (!ctx) return;
  const t = ctx.currentTime;
  for (const name in LOOP_DEFS) {
    if (!(name in active)) { delete loops[name]; continue; }
    const volume = active[name];
    if (!loops[name] || t >= loops[name]) {
      loops[name] = t + 0.25;
      vmul = volume; LOOP_DEFS[name](t); vmul = 1;
    }
  }
}

// ---------------------------------------------------------------------------
// Diner radio: one long streamed track, muffled in the kitchen, cranked and
// skipping when the jukebox gets stuck, silent when the power is out.
// ---------------------------------------------------------------------------
const music = { el: null, gain: null, filter: null, enabled: true, ok: false, failed: false, lastSkip: 0, started: false };

export function setMusicEnabled(v) { music.enabled = v; }
export function musicEnabled() { return music.enabled; }
export function musicWorking() { return music.ok && !music.failed; }

function initMusic(url) {
  if (music.el || !ctx) return;
  const el = new Audio();
  el.crossOrigin = 'anonymous';
  el.preload = 'auto';
  el.loop = true;
  el.src = url;
  el.addEventListener('playing', () => { music.ok = true; });
  el.addEventListener('error', () => { music.failed = true; });
  try {
    const src = ctx.createMediaElementSource(el);
    music.filter = ctx.createBiquadFilter(); music.filter.type = 'lowpass'; music.filter.frequency.value = 18000;
    music.gain = ctx.createGain(); music.gain.gain.value = 0;
    src.connect(music.filter); music.filter.connect(music.gain); music.gain.connect(master);
  } catch { music.failed = true; }
  music.el = el;
}

// o = { url, length, playing, inKitchen, blast, power, syncTime, vol: {dining, kitchen, blast}, skipEvery }
export function updateMusic(o) {
  if (!ctx) return;
  if (!music.el) initMusic(o.url);
  const el = music.el;
  if (!el || music.failed) return;
  const on = o.playing && o.power && music.enabled;
  if (!on) { if (!el.paused) el.pause(); return; }
  if (el.paused) {
    // start (or resume) at the shared point in the mix so both players hear about the same song
    const want = ((o.syncTime % o.length) + o.length) % o.length;
    if (!music.started || Math.abs(el.currentTime - want) > 6) { try { el.currentTime = want; } catch {} }
    music.started = true;
    el.play().catch(() => {});
  }
  const t = ctx.currentTime;
  const target = o.blast ? o.vol.blast * (o.inKitchen ? 0.6 : 1) : o.inKitchen ? o.vol.kitchen : o.vol.dining;
  music.gain.gain.setTargetAtTime(target, t, 0.25);
  music.filter.frequency.setTargetAtTime(o.inKitchen ? (o.blast ? 2200 : 650) : 18000, t, 0.2);
  // stuck jukebox: the record skips back over and over
  if (o.blast && performance.now() - music.lastSkip > o.skipEvery * 1000) {
    music.lastSkip = performance.now();
    try { el.currentTime = Math.max(0, el.currentTime - o.skipEvery); } catch {}
  }
}
export const _music = music; // debug
