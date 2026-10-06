// Tiny synthesized sound effects (no audio files needed).

let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(on: boolean) {
  enabled = on;
}

function ac(): AudioContext | null {
  if (!enabled) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.12) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + start;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function sweep(from: number, to: number, dur: number, type: OscillatorType = 'sawtooth', gain = 0.08) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(from, t);
  o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export const sfx = {
  click: () => tone(660, 0, 0.05, 'triangle', 0.05),
  correct: (combo = 0) => {
    const base = 523 * Math.pow(2, Math.min(combo, 12) / 12);
    tone(base, 0, 0.12, 'triangle');
    tone(base * 1.5, 0.08, 0.18, 'triangle');
  },
  wrong: () => {
    tone(196, 0, 0.18, 'square', 0.06);
    tone(147, 0.12, 0.25, 'square', 0.06);
  },
  coin: () => {
    tone(988, 0, 0.08, 'square', 0.05);
    tone(1319, 0.07, 0.2, 'square', 0.05);
  },
  levelUp: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.1, 0.3, 'triangle', 0.1)),
  victory: () => [392, 523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.25, 'triangle', 0.09)),
  gameOver: () => [392, 330, 262, 196].forEach((f, i) => tone(f, i * 0.15, 0.3, 'sawtooth', 0.05)),
  hit: () => sweep(400, 80, 0.2, 'sawtooth', 0.1),
  hurt: () => sweep(200, 60, 0.3, 'square', 0.07),
  flip: () => sweep(300, 600, 0.08, 'sine', 0.05),
  tick: () => tone(1200, 0, 0.03, 'square', 0.03),
  unlock: () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, i * 0.07, 0.25, 'sine', 0.1)),
};
