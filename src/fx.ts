// Visual effects: confetti bursts and floating score text.

/** Confetti mixes the theme accent with the mascot's sunny palette. */
function themeColors(): string[] {
  const css = getComputedStyle(document.documentElement);
  const accent = css.getPropertyValue('--accent').trim() || '#6c5cff';
  return [accent, accent, '#ffd23f', '#ff7aa8', '#1fb46a', '#4cc9f0'];
}

type Shape = 'rect' | 'circle' | 'star';

export function confetti(amount = 140, origin?: { x: number; y: number }) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'fx-canvas';
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  document.body.appendChild(canvas);
  const g = canvas.getContext('2d')!;
  g.scale(dpr, dpr);
  const colors = themeColors();
  const W = window.innerWidth;
  const H = window.innerHeight;
  // Big bursts fire from both lower corners as well as the centre.
  const sources = amount >= 150 && !origin ? [{ x: W / 2, y: H / 3, a: -Math.PI / 2, spread: Math.PI * 2 }, { x: 0, y: H, a: -Math.PI / 3, spread: 0.6 }, { x: W, y: H, a: (-2 * Math.PI) / 3, spread: 0.6 }] : [{ x: origin?.x ?? W / 2, y: origin?.y ?? H / 3, a: -Math.PI / 2, spread: Math.PI * 2 }];
  const parts = Array.from({ length: amount }, (_, i) => {
    const src = sources[i % sources.length];
    const corner = src.spread < Math.PI;
    const angle = src.a + (Math.random() - 0.5) * src.spread;
    const speed = corner ? 14 + Math.random() * 10 : 4 + Math.random() * 9;
    const shape: Shape = Math.random() < 0.55 ? 'rect' : Math.random() < 0.7 ? 'circle' : 'star';
    return {
      x: src.x,
      y: src.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - (corner ? 0 : 6),
      w: 6 + Math.random() * 5,
      h: 3 + Math.random() * 3,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      // Wobble makes paper flutter instead of spinning flat.
      wob: Math.random() * Math.PI * 2,
      c: colors[Math.floor(Math.random() * colors.length)],
      shape,
    };
  });
  const star = (s: number) => {
    g.beginPath();
    for (let k = 0; k < 10; k++) {
      const rad = k % 2 ? s * 0.45 : s;
      const a = (k * Math.PI) / 5 - Math.PI / 2;
      g.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    g.closePath();
    g.fill();
  };
  const LIFE = 2600;
  const start = performance.now();
  const frame = (t: number) => {
    const elapsed = t - start;
    g.clearRect(0, 0, W, H);
    for (const p of parts) {
      p.vy += 0.28;
      p.vx *= 0.985;
      p.vy *= 0.995;
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      p.wob += 0.15;
      g.save();
      g.globalAlpha = Math.max(0, 1 - Math.max(0, elapsed - LIFE * 0.55) / (LIFE * 0.45));
      g.translate(p.x, p.y);
      g.rotate(p.r);
      g.fillStyle = p.c;
      if (p.shape === 'rect') {
        g.scale(1, Math.cos(p.wob));
        g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      } else if (p.shape === 'circle') {
        g.beginPath();
        g.arc(0, 0, p.h, 0, Math.PI * 2);
        g.fill();
      } else star(p.w * 0.7);
      g.restore();
    }
    if (elapsed < LIFE) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}

/** Float a short label (e.g. "+14 XP") up from an element or point. */
export function floatText(text: string, at: HTMLElement | { x: number; y: number } | null, color = 'var(--text)') {
  let x = window.innerWidth / 2;
  let y = window.innerHeight / 2;
  if (at instanceof HTMLElement) {
    const r = at.getBoundingClientRect();
    x = r.left + r.width / 2;
    y = r.top;
  } else if (at) {
    x = at.x;
    y = at.y;
  }
  const el = document.createElement('div');
  el.className = 'float-text';
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.style.color = color;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1100);
}

export function shake(el: HTMLElement | null) {
  if (!el) return;
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
}
