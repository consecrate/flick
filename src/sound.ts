// Synthesized sound effects (no audio files needed).
// Every sound is built from soft voices (marimba, bell, pop, filtered noise)
// and runs through one master chain: volume -> compressor -> speakers, with a
// small generated reverb send so notes ring instead of clicking off.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let reverb: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let enabled = true;
let volume = 0.7;

export function setSoundEnabled(on: boolean) {
  enabled = on;
}

export function setSoundVolume(v: number) {
  volume = Math.max(0, Math.min(1, v));
  if (master && ctx) master.gain.setTargetAtTime(volume * 0.9, ctx.currentTime, 0.02);
}

function impulse(c: AudioContext, seconds: number) {
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  return buf;
}

function ac(): AudioContext | null {
  if (!enabled || volume === 0) return null;
  try {
    if (!ctx) {
      ctx = new AudioContext();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 4;
      master = ctx.createGain();
      master.gain.value = volume * 0.9;
      master.connect(comp).connect(ctx.destination);
      const conv = ctx.createConvolver();
      conv.buffer = impulse(ctx, 1.4);
      reverb = ctx.createGain();
      reverb.gain.value = 0.22;
      reverb.connect(conv).connect(master);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Route a voice to the master bus, with an optional reverb send and stereo position. */
function out(c: AudioContext, node: AudioNode, wet = 1, pan = 0) {
  let last: AudioNode = node;
  if (pan) {
    const p = c.createStereoPanner();
    p.pan.value = pan;
    node.connect(p);
    last = p;
  }
  last.connect(master!);
  if (wet > 0) {
    const send = c.createGain();
    send.gain.value = wet;
    last.connect(send).connect(reverb!);
  }
}

type Voice = { type?: OscillatorType; gain?: number; attack?: number; wet?: number; pan?: number; bend?: number };

/** One enveloped oscillator. `bend` glides the pitch by that ratio over the note. */
function osc(freq: number, start: number, dur: number, { type = 'sine', gain = 0.1, attack = 0.005, wet = 1, pan = 0, bend = 1 }: Voice = {}) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + start;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (bend !== 1) o.frequency.exponentialRampToValueAtTime(freq * bend, t + dur * 0.6);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  out(c, g, wet, pan);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** Wooden, rounded note: a sine with a quick, quiet overtone. */
function marimba(freq: number, start = 0, gain = 0.12, pan = 0) {
  osc(freq, start, 0.45, { gain, pan, wet: 0.6 });
  osc(freq * 4, start, 0.08, { gain: gain * 0.25, pan, wet: 0.2 });
}

/** Glassy bell: inharmonic partials with long decay. */
function bell(freq: number, start = 0, gain = 0.07, pan = 0) {
  osc(freq, start, 1.2, { gain, pan, wet: 1 });
  osc(freq * 2.76, start, 0.5, { gain: gain * 0.35, pan, wet: 1 });
  osc(freq * 5.4, start, 0.25, { gain: gain * 0.15, pan, wet: 1 });
}

/** Bubble pop: a sine that jumps up in pitch very quickly. */
function pop(freq: number, start = 0, gain = 0.08, up = 1.8) {
  osc(freq, start, 0.09, { gain, bend: up, wet: 0.15 });
}

/** Filtered noise sweep for whooshes, flips and impacts. */
function noise(start: number, dur: number, from: number, to: number, gain = 0.06, q = 1.2, wet = 0.4) {
  const c = ac();
  if (!c || !noiseBuf) return;
  const t = c.currentTime + start;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = q;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + dur * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g);
  out(c, g, wet);
  src.start(t);
  src.stop(t + dur + 0.05);
}

const semis = (base: number, n: number) => base * Math.pow(2, n / 12);
const C5 = 523.25;

// Don't stack the same short UI sound when several fire in one frame.
const last: Record<string, number> = {};
function throttled(name: string, ms: number, fn: () => void) {
  const now = performance.now();
  if (now - (last[name] ?? 0) < ms) return;
  last[name] = now;
  fn();
}

export const sfx = {
  /** Soft tap for ordinary buttons. */
  tap: () => throttled('tap', 40, () => pop(720, 0, 0.05, 1.5)),
  /** Kept for existing callers. */
  click: () => throttled('tap', 40, () => pop(720, 0, 0.05, 1.5)),
  /** Moving between pages. */
  nav: () => throttled('nav', 60, () => marimba(semis(C5, 7), 0, 0.06)),
  /** Choosing an answer or a match tile. */
  select: () => throttled('select', 30, () => pop(520, 0, 0.07, 2)),
  toggle: (on: boolean) => (on ? (pop(500, 0, 0.06, 1.6), pop(800, 0.06, 0.05, 1.5)) : (pop(700, 0, 0.05, 0.7), pop(460, 0.06, 0.05, 0.7))),
  open: () => noise(0, 0.22, 600, 2400, 0.035, 0.8, 0.3),
  close: () => noise(0, 0.18, 2200, 500, 0.03, 0.8, 0.2),
  /** Two rising notes; climbs a semitone per combo step. */
  correct: (combo = 0) => {
    const base = semis(C5, Math.min(combo, 12));
    marimba(base, 0, 0.12, -0.15);
    marimba(semis(base, 7), 0.08, 0.12, 0.15);
    if (combo >= 3) bell(semis(base, 19), 0.16, 0.035);
  },
  /** A soft, low "bonk" rather than a buzzer. */
  wrong: () => {
    osc(240, 0, 0.22, { type: 'triangle', gain: 0.12, bend: 0.7, wet: 0.2 });
    osc(180, 0.11, 0.3, { type: 'triangle', gain: 0.1, bend: 0.75, wet: 0.3 });
  },
  coin: () => {
    bell(1568, 0, 0.05, 0.2);
    bell(2093, 0.07, 0.05, 0.2);
  },
  /** One tick per counted step, used while numbers count up. */
  count: (i = 0) => throttled('count', 45, () => osc(semis(1046, (i % 12) / 2), 0, 0.05, { gain: 0.025, wet: 0.1 })),
  levelUp: () => {
    [0, 4, 7, 12, 16].forEach((n, i) => marimba(semis(C5, n), i * 0.08, 0.1, -0.3 + i * 0.15));
    [12, 16, 19, 24].forEach((n) => bell(semis(C5, n), 0.45, 0.03));
  },
  victory: () => {
    [0, 4, 7, 12].forEach((n, i) => marimba(semis(C5, n), i * 0.07, 0.1, -0.2 + i * 0.13));
    [7, 12, 16].forEach((n) => bell(semis(C5, n), 0.32, 0.03));
  },
  gameOver: () => [7, 4, 0, -5].forEach((n, i) => osc(semis(C5 / 2, n), i * 0.16, 0.4, { type: 'triangle', gain: 0.08, wet: 0.6 })),
  hit: () => {
    noise(0, 0.14, 3000, 400, 0.12, 0.7, 0.2);
    osc(180, 0, 0.18, { gain: 0.18, bend: 0.4, wet: 0.2 });
  },
  hurt: () => {
    osc(140, 0, 0.3, { type: 'triangle', gain: 0.14, bend: 0.5, wet: 0.2 });
    noise(0, 0.2, 800, 200, 0.06, 1, 0.1);
  },
  flip: () => noise(0, 0.16, 900, 3200, 0.05, 1.5, 0.2),
  /** Wood-block tick for the last seconds of a timer. */
  tick: () => osc(1800, 0, 0.03, { gain: 0.05, wet: 0.05 }),
  unlock: () => [12, 16, 19, 24].forEach((n, i) => bell(semis(C5, n), i * 0.07, 0.045, -0.3 + i * 0.2)),
  /** Mascot poke. */
  boing: () => {
    osc(260, 0, 0.35, { gain: 0.1, bend: 2.2, wet: 0.3 });
    osc(390, 0.02, 0.2, { gain: 0.04, bend: 1.8, wet: 0.3 });
  },
  /** Treasure chest: a short rattle, then sparkle. */
  chest: () => {
    [0, 0.07, 0.14].forEach((t) => noise(t, 0.06, 1800, 900, 0.07, 3, 0.1));
    sfx.unlock();
    setTimeout(() => sfx.coin(), 320);
  },
};
