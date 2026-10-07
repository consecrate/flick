import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { MASTERY_TIERS } from '../../shared/game.ts';
import { navigate, useAppState, useRoute } from '../app-context.tsx';
import { Icon } from './icons.tsx';
import { Mascot, type Mood } from './Mascot.tsx';
import { sfx } from '../sound.ts';

export function ProgressBar({ value, max = 1, color, height = 10, className = '' }: { value: number; max?: number; color?: string; height?: number; className?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={`bar ${className}`} style={{ height }} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className="bar-fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function Ring({ value, size = 64, stroke = 7, color = 'var(--accent)', children }: { value: number; size?: number; stroke?: number; color?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="ring" style={{ width: size, height: size, '--ring-c': c } as CSSProperties}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--track)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset .6s ease' }}
        />
      </svg>
      <div className="ring-label">{children}</div>
    </div>
  );
}

export function Modal({ onClose, children, wide }: { onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    sfx.open();
    return () => sfx.close();
  }, []);
  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true">
        <button className="icon-btn modal-close" onClick={onClose} aria-label="Close">
          <Icon name="x" />
        </button>
        {children}
      </div>
    </div>
  );
}

// Last value each HUD counter showed, kept across remounts so coins earned in
// a study session still pop when the top bar comes back.
const seen = new Map<string, number | string>();

/** A HUD number that pops when it changes (not on first load). */
function Bump({ name, value }: { name: string; value: number | string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const before = seen.get(name);
    seen.set(name, value);
    if (before !== undefined && before !== value) setN((k) => k + 1);
  }, [name, value]);
  return (
    <b key={n} className={n ? 'bump' : undefined}>
      {value}
    </b>
  );
}

export function TopBar() {
  const s = useAppState();
  const p = s.profile;
  const path = useRoute();
  const link = (href: string, emoji: string, label: string) => {
    const active = href === '/' ? path === '/' || path.startsWith('/deck') : path.startsWith(href);
    return (
      <a href={`#${href}`} aria-current={active ? 'page' : undefined}>
        <span className="nav-emoji" aria-hidden="true">
          {emoji}
        </span>
        {label}
      </a>
    );
  };
  return (
    <header className="topbar">
      <button className="brand" onClick={() => navigate('/')}>
        <span className="brand-mark">
          <Icon name="bolt" size={20} filled />
        </span>
        Flick
      </button>
      <nav className="nav">
        {link('/', '🏠', 'Decks')}
        {link('/stats', '📊', 'Stats')}
        {link('/achievements', '🏆', 'Trophies')}
        {link('/shop', '🛍️', 'Shop')}
        {link('/settings', '⚙️', 'Settings')}
      </nav>
      <div className="hud">
        <span className={`hud-item ${s.streakAtRisk ? 'at-risk' : ''}`} title={s.streakAtRisk ? 'Study today to keep your streak!' : 'Day streak'}>
          <span className={p.streak.current > 0 ? 'flame' : 'flame off'}>🔥</span> <Bump name="streak" value={p.streak.current} />
        </span>
        <span className="hud-item" title="Coins">
          🪙 <Bump name="coins" value={p.coins} />
        </span>
        <span className="hud-item" title="Hints">
          💡 <Bump name="hints" value={p.hints} />
        </span>
        {p.streak.freezes > 0 && (
          <span className="hud-item" title="Streak freezes">
            🧊 <Bump name="freezes" value={p.streak.freezes} />
          </span>
        )}
        {s.doubleXpActive && (
          <span className="hud-item boost" title="Double XP active">
            🚀 <b>2× XP</b>
          </span>
        )}
        <button className="hud-avatar" onClick={() => navigate('/settings')} title={`${p.name} · Level ${s.level.level}`}>
          <span className="avatar">{p.avatar}</span>
          <span className="hud-level">
            <span>
              Lv <Bump name="level" value={s.level.level} />
            </span>
            <ProgressBar value={s.level.into} max={s.level.needed} height={6} />
          </span>
        </button>
      </div>
    </header>
  );
}

export function MasteryBar({ tiers, height = 10 }: { tiers: number[]; height?: number }) {
  const total = tiers.reduce((a, b) => a + b, 0) || 1;
  return (
    <div className="mastery-bar" style={{ height }}>
      {tiers.map((n, i) =>
        n ? <div key={i} style={{ width: `${(n / total) * 100}%`, background: MASTERY_TIERS[i].color }} title={`${MASTERY_TIERS[i].name}: ${n}`} /> : null,
      )}
    </div>
  );
}

export function TierChip({ tier }: { tier: number }) {
  const t = MASTERY_TIERS[tier];
  return (
    <span className="chip">
      <span className="chip-dot" style={{ background: t.color }} />
      {t.name}
    </span>
  );
}

const LOADING_LINES = [
  'Claude is reading your material…',
  'Picking the ideas worth remembering…',
  'Writing questions you can answer in one breath…',
  'Inventing sneaky wrong answers…',
  'Polishing explanations…',
  'Almost there. Good cards take a moment…',
];

export function ClaudeLoader({ lines = LOADING_LINES }: { lines?: string[] }) {
  const [i, setI] = useState(0);
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const a = setInterval(() => setI((x) => (x + 1) % lines.length), 3200);
    const b = setInterval(() => setSecs((x) => x + 1), 1000);
    return () => {
      clearInterval(a);
      clearInterval(b);
    };
  }, [lines.length]);
  return (
    <div className="loader">
      <Mascot mood="wow" size={96} className="bob" />
      <div className="loader-orb" />
      <p className="loader-line">{lines[i]}</p>
      <p className="muted small">
        <span className="num">{secs}s</span> · running on your Claude Code subscription
      </p>
    </div>
  );
}

export function Spinner() {
  return <span className="spinner" aria-label="Loading" />;
}

/** Animated number that counts up to `value`. */
export function CountUp({ value, duration = 900, delay = 0, sound = false }: { value: number; duration?: number; delay?: number; sound?: boolean }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const start = performance.now() + delay;
    let raf = 0;
    let shown = 0;
    let ticks = 0;
    const step = (t: number) => {
      const k = Math.max(0, Math.min(1, (t - start) / duration));
      const next = Math.round(value * (1 - Math.pow(1 - k, 3)));
      if (sound && next !== shown) sfx.count(ticks++);
      shown = next;
      setN(next);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, delay, sound]);
  return <>{n}</>;
}

/** Minimal, safe Markdown: paragraphs, headings, bullet lists, bold, italics, inline code. */
export function Markdown({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let para: string[] = [];
  let list: string[] = [];
  const flushPara = () => {
    if (para.length) out.push(<p key={out.length}>{para.map((l, j) => <span key={j}>{inline(l)}{j < para.length - 1 && <br />}</span>)}</p>);
    para = [];
  };
  const flushList = () => {
    if (list.length) out.push(<ul key={out.length}>{list.map((l, j) => <li key={j}>{inline(l)}</li>)}</ul>);
    list = [];
  };
  for (const raw of text.trim().split('\n')) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)$/);
    if (bullet) {
      flushPara();
      list.push(bullet[1]);
    } else if (!line.trim()) {
      flushPara();
      flushList();
    } else if (/^#{1,6}\s/.test(line)) {
      flushPara();
      flushList();
      out.push(<h4 key={out.length}>{inline(line.replace(/^#{1,6}\s/, ''))}</h4>);
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return <div className="md">{out}</div>;
}

function inline(s: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    const t = m[0];
    if (t.startsWith('**')) out.push(<strong key={k++}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith('`')) out.push(<code key={k++}>{t.slice(1, -1)}</code>);
    else out.push(<em key={k++}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

export function EmptyState({ icon, mood, title, children }: { icon?: string; mood?: Mood; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      {mood && <Mascot mood={mood} size={110} />}
      {icon && <div className="empty-icon">{icon}</div>}
      <h3>{title}</h3>
      {children}
    </div>
  );
}
