// Skins change how Flicky's body looks. Each is flat colour and shapes (no
// gradients), drawn in Flicky's own coordinates: the body is the rounded rect
// x=32 y=16 w=64 h=84 r=16, tilted with the rest of Flicky.

import type { ReactNode } from 'react';

export interface SkinStyle {
  /** Body fill. */
  body: string;
  /** The card behind Flicky. */
  back: string;
  /** Outline and pupils. */
  ink: string;
  /** Mouth colour, when the face sits on a dark body. Defaults to ink. */
  mouth?: string;
  /** Forehead bolt colour. */
  bolt?: string;
  /** Space needed above the body for `behind` parts, in drawing units. */
  headroom?: number;
  /** Drawn behind the body (ears, horns, antenna, wings). */
  behind?: ReactNode;
  /** Drawn on the body, clipped to its shape. */
  pattern?: ReactNode;
  /** Drawn over the face (headband tails, sparkles). */
  front?: ReactNode;
}

const DARK = '#191f33';

/** Scattered dots, fixed so every Flicky looks the same. */
const STARS: [number, number, number][] = [
  [40, 26, 1.2], [88, 30, 1.6], [44, 42, 1], [90, 46, 1.1], [38, 78, 1.4], [70, 88, 1], [84, 92, 1.3], [58, 30, 0.9], [92, 70, 1],
];

function pixels(): ReactNode {
  const colors = ['#4cc9f0', '#3ab0dc', '#64d4f5', '#4cc9f0', '#2f9bc7'];
  const out: ReactNode[] = [];
  let k = 7;
  for (let y = 16; y < 100; y += 6) {
    for (let x = 32; x < 96; x += 6) {
      k = (k * 31 + 11) % 97;
      out.push(<rect key={`${x}-${y}`} x={x} y={y} width="6" height="6" fill={colors[k % colors.length]} />);
    }
  }
  return out;
}

export const SKINS: Record<string, SkinStyle> = {
  'skin-panda': {
    headroom: 12,
    body: '#fbfbfd',
    back: '#2b2d42',
    ink: DARK,
    behind: (
      <g fill="#2b2d42">
        <circle cx="38" cy="20" r="10" />
        <circle cx="90" cy="20" r="10" />
      </g>
    ),
    pattern: (
      <g fill="#2b2d42">
        <ellipse cx="48" cy="57" rx="11" ry="13" transform="rotate(-25 48 57)" />
        <ellipse cx="80" cy="57" rx="11" ry="13" transform="rotate(25 80 57)" />
        <ellipse cx="64" cy="66" rx="4" ry="3" />
      </g>
    ),
  },
  'skin-watermelon': {
    body: '#ff5d73',
    back: '#2fbf71',
    ink: DARK,
    bolt: '#fff',
    pattern: (
      <>
        <rect x="32" y="16" width="64" height="84" rx="16" fill="none" stroke="#2fbf71" strokeWidth="14" />
        <rect x="38" y="22" width="52" height="72" rx="11" fill="none" stroke="#f4ffe8" strokeWidth="4" />
        <g fill={DARK}>
          {[
            [46, 84], [58, 90], [72, 89], [84, 82], [44, 38], [86, 40], [76, 30],
          ].map(([x, y]) => (
            <ellipse key={`${x}${y}`} cx={x} cy={y} rx="2" ry="3.2" transform={`rotate(${x > 64 ? 20 : -20} ${x} ${y})`} />
          ))}
        </g>
      </>
    ),
  },
  'skin-tiger': {
    headroom: 14,
    body: '#ff9a3c',
    back: '#2b2d42',
    ink: DARK,
    behind: (
      <g fill="#ff9a3c" stroke={DARK} strokeWidth="2">
        <path d="M34 26 36 8 52 18z" />
        <path d="M94 26 92 8 76 18z" />
      </g>
    ),
    pattern: (
      <>
        <ellipse cx="64" cy="76" rx="18" ry="12" fill="#fff4e6" />
        <g fill={DARK}>
          <path d="M32 40h12l-12 6zM32 52h10l-10 5zM32 82h12l-12 6z" />
          <path d="M96 40H84l12 6zM96 52H86l10 5zM96 82H84l12 6z" />
          <path d="M54 16l4 8 4-8zM70 16l4 8 4-8z" />
        </g>
      </>
    ),
  },
  'skin-ninja': {
    body: '#23252f',
    back: '#c81d25',
    ink: DARK,
    mouth: '#f5f5f7',
    pattern: (
      <>
        <rect x="32" y="45" width="64" height="21" rx="3" fill="#f2c9a0" />
        <rect x="32" y="30" width="64" height="9" fill="#e5383b" />
      </>
    ),
    front: (
      <path d="M95 33q12-2 16 6q-8-3-14 2M95 35q10 6 10 16q-5-8-12-10" fill="#e5383b" stroke={DARK} strokeWidth="1.5" strokeLinejoin="round" />
    ),
  },
  'skin-robot': {
    headroom: 22,
    body: '#c4ccd6',
    back: '#5b6b7a',
    ink: DARK,
    bolt: '#ff5d5d',
    behind: (
      <g stroke={DARK} strokeWidth="2">
        <path d="M64 16V4" />
        <circle cx="64" cy="3" r="4" fill="#ff5d5d" />
        <rect x="24" y="48" width="9" height="18" rx="3" fill="#8b99a8" />
        <rect x="95" y="48" width="9" height="18" rx="3" fill="#8b99a8" />
      </g>
    ),
    pattern: (
      <>
        <rect x="40" y="82" width="48" height="12" rx="4" fill="#8b99a8" />
        <g fill="#5b6b7a">
          <circle cx="38" cy="22" r="2" />
          <circle cx="90" cy="22" r="2" />
          <circle cx="38" cy="94" r="2" />
          <circle cx="90" cy="94" r="2" />
        </g>
        <g fill="#7ef0b0">
          <rect x="46" y="86" width="6" height="4" rx="1" />
          <rect x="56" y="86" width="6" height="4" rx="1" />
          <rect x="66" y="86" width="6" height="4" rx="1" fill="#ffd23f" />
          <rect x="76" y="86" width="6" height="4" rx="1" fill="#ff5d5d" />
        </g>
      </>
    ),
  },
  'skin-pixel': {
    body: '#4cc9f0',
    back: '#3a0ca3',
    ink: DARK,
    pattern: pixels(),
  },
  'skin-dragon': {
    headroom: 24,
    body: '#2fbf71',
    back: '#1b7f4a',
    ink: DARK,
    behind: (
      <g stroke={DARK} strokeWidth="2" strokeLinejoin="round">
        <path d="M30 60Q6 40 10 22Q20 34 28 32Q24 46 34 52z" fill="#1b7f4a" />
        <path d="M44 18Q40 4 46 -2Q50 8 54 16z" fill="#fff3d6" />
        <path d="M84 18Q88 4 82 -2Q78 8 74 16z" fill="#fff3d6" />
      </g>
    ),
    pattern: (
      <>
        <path d="M44 100V82q20-12 40 0v18z" fill="#bff3d3" />
        <g fill="none" stroke="#7fd9a5" strokeWidth="2">
          <path d="M48 88q4 4 8 0q4 4 8 0q4 4 8 0q4 4 8 0" />
          <path d="M48 95q4 4 8 0q4 4 8 0q4 4 8 0q4 4 8 0" />
        </g>
        <g fill="#24a35f">
          <circle cx="40" cy="30" r="3" />
          <circle cx="88" cy="34" r="2.5" />
          <circle cx="90" cy="80" r="3" />
          <circle cx="38" cy="86" r="2.5" />
        </g>
      </>
    ),
  },
  'skin-galaxy': {
    body: '#1b1f4b',
    back: '#6c5cff',
    ink: DARK,
    mouth: '#f5f5f7',
    pattern: (
      <>
        <g fill="#fff">
          {STARS.map(([x, y, r]) => (
            <circle key={`${x}${y}`} cx={x} cy={y} r={r} />
          ))}
        </g>
        <path d="M86 84l1.5 3.5 3.5 1.5-3.5 1.5-1.5 3.5-1.5-3.5-3.5-1.5 3.5-1.5z" fill="#ffd23f" />
        <circle cx="44" cy="90" r="6" fill="#ff9a3c" />
        <ellipse cx="44" cy="90" rx="11" ry="3" fill="none" stroke="#ffd6a8" strokeWidth="1.5" transform="rotate(-18 44 90)" />
      </>
    ),
  },
  'skin-crystal': {
    body: '#a5e8ff',
    back: '#4aa8d8',
    ink: '#13324a',
    pattern: (
      <g stroke="#e8fbff" strokeWidth="1.5" strokeLinejoin="round">
        <path d="M32 16h30L44 46z" fill="#c9f3ff" />
        <path d="M62 16h34v26z" fill="#7fd6f5" />
        <path d="M32 46l12 0 -12 30z" fill="#7fd6f5" />
        <path d="M96 42v40L80 66z" fill="#c9f3ff" />
        <path d="M32 76l24 24H32z" fill="#c9f3ff" />
        <path d="M56 100l16-14 24 14z" fill="#7fd6f5" />
      </g>
    ),
  },
  'skin-gold': {
    body: '#f5c542',
    back: '#b8860b',
    ink: '#3a2a05',
    bolt: '#fff8dc',
    pattern: (
      <g fill="#fff3c4">
        <path d="M32 46 62 16h10L32 56z" />
        <path d="M32 64 80 16h4L32 68z" />
        <path d="M70 100 96 74v8L78 100z" />
      </g>
    ),
    front: (
      <g fill="#fff3c4" stroke="#3a2a05" strokeWidth="1.2" strokeLinejoin="round">
        <path d="M100 22l1.6 4 4 1.6-4 1.6-1.6 4-1.6-4-4-1.6 4-1.6z" />
        <path d="M28 88l1.2 3 3 1.2-3 1.2-1.2 3-1.2-3-3-1.2 3-1.2z" />
      </g>
    ),
  },
};
