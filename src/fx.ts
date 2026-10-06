// Visual effects: confetti bursts and floating score text.

/** Confetti uses the theme accent and the text color only. */
function themeColors(): string[] {
  const css = getComputedStyle(document.documentElement);
  const accent = css.getPropertyValue('--accent').trim() || '#7aa2f7';
  const text = css.getPropertyValue('--text').trim() || '#e8e8eb';
  return [accent, accent, text];
}

export function confetti(amount = 140, origin?: { x: number; y: number }) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'fx-canvas';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);
  const g = canvas.getContext('2d')!;
  const colors = themeColors();
  const ox = origin?.x ?? canvas.width / 2;
  const oy = origin?.y ?? canvas.height / 3;
  const parts = Array.from({ length: amount }, () => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 9;
    return {
      x: ox,
      y: oy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 6,
      w: 4 + Math.random() * 4,
      h: 2 + Math.random() * 2,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      c: colors[Math.floor(Math.random() * colors.length)],
    };
  });
  const start = performance.now();
  const frame = (t: number) => {
    const elapsed = t - start;
    g.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of parts) {
      p.vy += 0.25;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      g.save();
      g.globalAlpha = Math.max(0, 1 - elapsed / 2200);
      g.translate(p.x, p.y);
      g.rotate(p.r);
      g.fillStyle = p.c;
      g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      g.restore();
    }
    if (elapsed < 2200) requestAnimationFrame(frame);
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
