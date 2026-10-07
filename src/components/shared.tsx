// App-wide building blocks on top of the shadcn primitives in ./ui: the top
// bar, progress bars and rings, mastery bars, loaders and empty states.

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { MASTERY_TIERS } from '../../shared/game.ts';
import { navigate, useAppState, useRoute } from '../app-context.tsx';
import { BrandMark } from './BrandMark.tsx';
import { Mascot, type Mood } from './Mascot.tsx';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import { Tip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { sfx } from '../sound.ts';

/** A pill progress bar for `value` out of `max`. */
export function ProgressBar({ value, max = 1, color, className }: { value: number; max?: number; color?: string; className?: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return <Progress value={pct} className={className} indicatorStyle={color ? { background: color } : undefined} />;
}

export function Ring({ value, size = 64, stroke = 7, color = 'var(--accent)', children }: { value: number; size?: number; stroke?: number; color?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size, '--ring-c': c } as CSSProperties}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--track)" strokeWidth={stroke} fill="none" />
        <circle
          className="ring-fill"
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
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
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
    <b key={n} className={cn('font-semibold', n && 'bump')}>
      {value}
    </b>
  );
}

const hudItem = 'inline-flex h-10 items-center gap-1.5 rounded-full border-2 border-border bg-card pr-4 pl-3 font-display text-md font-semibold whitespace-nowrap tabular-nums';

export function TopBar() {
  const s = useAppState();
  const p = s.profile;
  const path = useRoute();
  const link = (href: string, emoji: string, label: string) => {
    const active = href === '/' ? path === '/' || path.startsWith('/deck') || path.startsWith('/folder') : path.startsWith(href);
    return (
      <a
        href={`#${href}`}
        aria-current={active ? 'page' : undefined}
        className="group flex h-10 shrink-0 items-center gap-2 rounded-full pr-4 pl-3 font-display text-md font-semibold text-muted-foreground no-underline transition-colors hover:bg-muted hover:text-foreground aria-[current=page]:bg-accent aria-[current=page]:text-foreground"
      >
        <span className="inline-block text-[20px] leading-none group-hover:animate-wiggle" aria-hidden="true">
          {emoji}
        </span>
        {label}
      </a>
    );
  };
  return (
    <header className="sticky top-0 z-20 flex h-[68px] items-center gap-6 border-b-2 border-border bg-card/90 px-6 backdrop-blur-[10px] backdrop-saturate-[1.4] max-[860px]:h-auto max-[860px]:flex-wrap max-[860px]:gap-y-0 max-[860px]:pt-2 max-[560px]:gap-3 max-[560px]:px-4">
      <button className="flex items-center gap-2 font-display text-[26px] font-bold tracking-tight text-foreground" onClick={() => navigate('/')}>
        <BrandMark />
        Flick
      </button>
      <nav data-nav className="flex gap-1 max-[860px]:order-3 max-[860px]:-ml-3 max-[860px]:h-12 max-[860px]:w-full max-[860px]:overflow-x-auto">
        {link('/', '🏠', 'Decks')}
        {link('/journey', '🗺️', 'Journey')}
        {link('/stats', '📊', 'Stats')}
        {link('/achievements', '🏆', 'Trophies')}
        {link('/shop', '🛍️', 'Shop')}
        {link('/settings', '⚙️', 'Settings')}
      </nav>
      <div className="ml-auto flex items-center gap-2 max-[560px]:gap-3">
        <Tip label={s.streakAtRisk ? 'Study today to keep your streak!' : 'Day streak'} side="bottom">
          <span className={cn(hudItem, s.streakAtRisk && 'border-warning bg-warning-soft')}>
            <span className={cn(p.streak.current === 0 && 'opacity-45 grayscale')}>🔥</span> <Bump name="streak" value={p.streak.current} />
          </span>
        </Tip>
        <Tip label="Coins" side="bottom">
          <span className={hudItem}>
            🪙 <Bump name="coins" value={p.coins} />
          </span>
        </Tip>
        <Tip label="Hints" side="bottom">
          <span className={cn(hudItem, 'max-[560px]:hidden')}>
            💡 <Bump name="hints" value={p.hints} />
          </span>
        </Tip>
        {p.streak.freezes > 0 && (
          <Tip label="Streak freezes" side="bottom">
            <span className={cn(hudItem, 'max-[560px]:hidden')}>
              🧊 <Bump name="freezes" value={p.streak.freezes} />
            </span>
          </Tip>
        )}
        {s.doubleXpActive && (
          <Tip label="Double XP active" side="bottom">
            <span className={cn(hudItem, 'border-primary bg-accent text-accent-foreground max-[560px]:hidden')}>
              🚀 <b className="font-semibold">2× XP</b>
            </span>
          </Tip>
        )}
        <Tip label={`${p.name} · Level ${s.level.level} · Your journey`} side="bottom">
          <button
            className="flex h-11 items-center gap-2 rounded-full border-2 border-border bg-card pr-4 pl-[3px] text-foreground transition-colors hover:border-input"
            onClick={() => navigate('/journey')}
          >
            <Avatar>
              <AvatarFallback>{p.avatar}</AvatarFallback>
            </Avatar>
            <span className="flex w-[60px] flex-col gap-[3px] text-left font-display text-sm font-semibold">
              <span>
                Lv <Bump name="level" value={s.level.level} />
              </span>
              <ProgressBar value={s.level.into} max={s.level.needed} className="h-1.5" />
            </span>
          </button>
        </Tip>
      </div>
    </header>
  );
}

export function MasteryBar({ tiers, className }: { tiers: number[]; className?: string }) {
  const total = tiers.reduce((a, b) => a + b, 0) || 1;
  return (
    <div className={cn('flex h-2.5 w-full gap-[3px] overflow-hidden rounded-full bg-track', className)}>
      {tiers.map((n, i) =>
        n ? (
          <div
            key={i}
            className="transition-[width] duration-500 ease-smooth"
            style={{ width: `${(n / total) * 100}%`, background: MASTERY_TIERS[i].color }}
            title={`${MASTERY_TIERS[i].name}: ${n}`}
          />
        ) : null,
      )}
    </div>
  );
}

export function TierChip({ tier }: { tier: number }) {
  const t = MASTERY_TIERS[tier];
  return (
    <Badge>
      <span className="size-1.5 rounded-full" style={{ background: t.color }} />
      {t.name}
    </Badge>
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
    <div className="flex w-full flex-col items-center gap-1 px-3 py-8 text-center">
      <Mascot mood="wow" size={96} className="animate-bob" />
      <div className="relative mb-4 h-2.5 w-40 overflow-hidden rounded-full bg-track">
        <div className="absolute inset-y-0 left-0 w-2/5 animate-loader rounded-full bg-primary" />
      </div>
      <p className="min-h-[1.5em] font-display text-md font-semibold">{lines[i]}</p>
      <p className="text-sm text-muted-foreground">
        <span className="num">{secs}s</span> · running on your Claude Code subscription
      </p>
    </div>
  );
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

/** An empty state with Flicky (`mood`) or an emoji (`icon`), a title, a line of text and actions. */
export function EmptyState({
  icon,
  mood,
  title,
  description,
  children,
  className,
}: {
  icon?: string;
  mood?: Mood;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Empty className={className}>
      <EmptyHeader>
        {mood && <Mascot mood={mood} size={110} />}
        {icon && <EmptyMedia>{icon}</EmptyMedia>}
        <EmptyTitle>{title}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      {children && <EmptyContent>{children}</EmptyContent>}
    </Empty>
  );
}

/** Centered spinner for a page that is still loading. */
export function PageSpinner() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Spinner className="size-6" />
    </div>
  );
}

export { Spinner };

/** A page's column. `narrow` for forms like Settings. */
export function Page({ narrow, className, children }: { narrow?: boolean; className?: string; children: ReactNode }) {
  return <div className={cn('mx-auto my-8 flex w-full flex-col gap-8 max-[560px]:mt-6', narrow ? 'max-w-[680px]' : 'max-w-[1080px]', className)}>{children}</div>;
}

/** A heading with a note or actions on the right. */
export function SectionHead({ title, as: H = 'h2', children, className }: { title: ReactNode; as?: 'h1' | 'h2'; children?: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-4 flex flex-wrap items-baseline justify-between gap-3', className)}>
      <H>{title}</H>
      {children}
    </div>
  );
}
