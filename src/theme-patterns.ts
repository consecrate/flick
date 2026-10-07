// Background motifs for premium themes: small flat SVG tiles drawn in the
// theme's accent at low opacity, repeated behind the page.

const TILES: Record<string, { size: number; svg: (c: string) => string }> = {
  grid: {
    size: 24,
    svg: (c) => `<path d="M24 0H0V24" fill="none" stroke="${c}" stroke-opacity=".16" stroke-width="1"/>`,
  },
  petals: {
    size: 140,
    svg: (c) => {
      // Five-petal blossoms: petals are circles around a centre.
      const flower = (x: number, y: number, r: number, o: number) =>
        [0, 1, 2, 3, 4]
          .map((i) => {
            const a = (i * 2 * Math.PI) / 5 - Math.PI / 2;
            return `<circle cx="${(x + Math.cos(a) * r).toFixed(1)}" cy="${(y + Math.sin(a) * r).toFixed(1)}" r="${(r * 0.75).toFixed(1)}" fill-opacity="${o}"/>`;
          })
          .join('');
      return `<g fill="${c}">${flower(30, 34, 7, 0.12)}${flower(102, 96, 5, 0.1)}<circle cx="86" cy="26" r="3" fill-opacity=".12"/><circle cx="34" cy="112" r="2.5" fill-opacity=".1"/></g>`;
    },
  },
  waves: {
    size: 64,
    svg: (c) =>
      `<g fill="none" stroke="${c}" stroke-opacity=".16" stroke-width="2" stroke-linecap="round">` +
      `<path d="M0 16q8-8 16 0t16 0 16 0 16 0"/><path d="M0 48q8-8 16 0t16 0 16 0 16 0"/>` +
      `</g>`,
  },
  pixels: {
    size: 48,
    svg: (c) =>
      `<g fill="${c}" fill-opacity=".14">` +
      `<rect x="4" y="4" width="6" height="6"/><rect x="28" y="16" width="6" height="6"/><rect x="34" y="16" width="6" height="6"/>` +
      `<rect x="14" y="34" width="6" height="6"/><rect x="40" y="38" width="6" height="6" fill-opacity=".08"/>` +
      `</g>`,
  },
  stars: {
    size: 200,
    svg: (c) =>
      `<g fill="${c}">` +
      `<path d="M36 30l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill-opacity=".28"/>` +
      `<path d="M150 128l1.5 3.5 3.5 1.5-3.5 1.5-1.5 3.5-1.5-3.5-3.5-1.5 3.5-1.5z" fill-opacity=".22"/>` +
      `<circle cx="112" cy="44" r="1.3" fill-opacity=".35"/><circle cx="24" cy="150" r="1" fill-opacity=".3"/>` +
      `<circle cx="176" cy="70" r="1" fill-opacity=".35"/><circle cx="84" cy="100" r="1.2" fill-opacity=".25"/>` +
      `<circle cx="70" cy="184" r="1.4" fill-opacity=".3"/><circle cx="188" cy="186" r="1" fill-opacity=".25"/>` +
      `</g>`,
  },
  diamonds: {
    size: 40,
    svg: (c) => `<path d="M20 4 36 20 20 36 4 20z" fill="none" stroke="${c}" stroke-opacity=".11" stroke-width="1.5"/>`,
  },
};

/** A CSS background-image for the motif, or 'none'. */
export function patternImage(pattern: string | undefined, accent: string): string {
  const tile = pattern ? TILES[pattern] : undefined;
  if (!tile) return 'none';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${tile.size}" height="${tile.size}" viewBox="0 0 ${tile.size} ${tile.size}">${tile.svg(accent)}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
