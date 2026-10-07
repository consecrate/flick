// Flicky, the flashcard mascot. Drawn in the theme accent so it matches every theme.

import { useEffect, useRef, useState } from 'react';
import { useEquippedHat } from '../app-context.tsx';
import { sfx } from '../sound.ts';
import { Hat } from './Hats.tsx';

export type Mood = 'happy' | 'sleepy' | 'sad' | 'wow';

/** `hat` overrides the hat Flicky is wearing (null for none); by default it's the player's equipped hat. */
export function Mascot({ mood = 'happy', size = 120, className = '', hat }: { mood?: Mood; size?: number; className?: string; hat?: string | null }) {
  const ink = 'var(--mascot-ink, #191f33)';
  const equipped = useEquippedHat();
  const wearing = hat === undefined ? equipped : hat;
  // A hat needs headroom, so the drawing gets taller and keeps its width.
  const top = wearing ? 28 : 0;
  return (
    <svg
      className={`mascot ${className}`}
      width={size}
      height={(size * (120 + top)) / 120}
      viewBox={`0 ${-top} 120 ${120 + top}`}
      role="img"
      aria-label="Flicky the flashcard"
    >
      <ellipse cx="60" cy="112" rx="30" ry="4" fill="var(--ink)" opacity="0.08" />
      {/* the card behind */}
      <rect x="22" y="18" width="62" height="80" rx="14" fill="var(--accent-soft-strong)" transform="rotate(-10 53 58)" />
      {/* Flicky */}
      <g transform="rotate(6 64 60)">
        <rect x="32" y="16" width="64" height="84" rx="16" fill="var(--accent)" />
        <rect x="32" y="16" width="64" height="84" rx="16" fill="none" stroke={ink} strokeOpacity="0.12" strokeWidth="2" />
        {/* bolt on the forehead */}
        <path d="M66 22 57 36h7l-3 9 10-14h-7l2-9z" fill="#ffd23f" stroke={ink} strokeWidth="1.5" strokeLinejoin="round" />
        {mood === 'sleepy' ? (
          <>
            <path d="M44 56q5 4 10 0" stroke={ink} strokeWidth="3" fill="none" strokeLinecap="round" />
            <path d="M74 56q5 4 10 0" stroke={ink} strokeWidth="3" fill="none" strokeLinecap="round" />
          </>
        ) : (
          <>
            <ellipse cx="49" cy="55" rx="7" ry={mood === 'wow' ? 9 : 8} fill="#fff" />
            <ellipse cx="79" cy="55" rx="7" ry={mood === 'wow' ? 9 : 8} fill="#fff" />
            <circle cx={mood === 'sad' ? 49 : 50} cy={mood === 'sad' ? 58 : 56} r="3.6" fill={ink} />
            <circle cx={mood === 'sad' ? 79 : 80} cy={mood === 'sad' ? 58 : 56} r="3.6" fill={ink} />
            <circle cx="51.3" cy="54.2" r="1.2" fill="#fff" />
            <circle cx="81.3" cy="54.2" r="1.2" fill="#fff" />
          </>
        )}
        <circle cx="41" cy="68" r="4.5" fill="#ff7aa8" opacity="0.6" />
        <circle cx="87" cy="68" r="4.5" fill="#ff7aa8" opacity="0.6" />
        {mood === 'happy' && <path d="M56 70q8 8 16 0" stroke={ink} strokeWidth="3" fill="none" strokeLinecap="round" />}
        {mood === 'sleepy' && <path d="M59 72q5 3 10 0" stroke={ink} strokeWidth="3" fill="none" strokeLinecap="round" />}
        {mood === 'sad' && <path d="M57 75q7-6 14 0" stroke={ink} strokeWidth="3" fill="none" strokeLinecap="round" />}
        {mood === 'wow' && <ellipse cx="64" cy="73" rx="5" ry="6" fill={ink} />}
        {wearing && <Hat id={wearing} />}
      </g>
      {mood === 'sleepy' && (
        <text x="96" y="22" fontFamily="var(--display)" fontWeight="700" fontSize="16" fill="var(--muted)">
          z<tspan dy="-6" fontSize="12">z</tspan>
        </text>
      )}
      {mood === 'wow' && (
        <g fill="#ffd23f" stroke={ink} strokeWidth="1.5" strokeLinejoin="round">
          <path d="M14 30l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" />
          <path d="M104 78l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" />
        </g>
      )}
    </svg>
  );
}

/** Flicky as a button: hops in on mount, and jumps with a boing when poked. */
export function PokeableMascot({ mood = 'happy', size = 120 }: { mood?: Mood; size?: number }) {
  const [jumps, setJumps] = useState(0);
  const [excited, setExcited] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const onPoke = () => {
    sfx.boing();
    setJumps((n) => n + 1);
    setExcited(true);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setExcited(false), 900);
  };
  return (
    <button type="button" className="mascot-btn" onClick={onPoke} aria-label="Poke Flicky">
      <Mascot key={jumps} mood={excited ? 'wow' : mood} size={size} className={jumps ? 'jump' : 'hop-in'} />
    </button>
  );
}
