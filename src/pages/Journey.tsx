import { useMemo, type ReactNode } from 'react';
import { MEDALS, RANKS, SHOP, levelCoins, localDay, medalFor, rankFor, studyDaysByMonth, xpForLevel, type ShopItem } from '../../shared/game.ts';
import { useAppState } from '../app-context.tsx';
import { Mascot } from '../components/Mascot.tsx';
import { Page, ProgressBar, SectionHead } from '../components/shared.tsx';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const MAX_LEVEL = 100;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface Stop {
  level: number;
  rank: (typeof RANKS)[number] | null;
  items: ShopItem[];
}

/** Levels worth a stop on the road: a new rank or a free reward. */
function roadStops(): Stop[] {
  const stops: Stop[] = [];
  for (let level = 2; level <= MAX_LEVEL; level++) {
    const rank = RANKS.find((r) => r.level === level) ?? null;
    const items = SHOP.filter((i) => i.price === 0 && i.unlockLevel === level);
    if (rank || items.length) stops.push({ level, rank, items });
  }
  return stops;
}

const kindLabel: Record<string, string> = { hat: 'Hat for Flicky', theme: 'Theme', avatar: 'Avatar' };

export function Journey() {
  const s = useAppState();
  const p = s.profile;
  const level = s.level.level;
  const rank = rankFor(level);
  const nextRank = RANKS.find((r) => r.level > level);
  const stops = useMemo(roadStops, []);
  const nextStop = stops.find((st) => st.level > level);

  const today = localDay();
  const month = today.slice(0, 7);
  const byMonth = useMemo(() => studyDaysByMonth(p.dailyXp), [p.dailyXp]);
  const daysThisMonth = byMonth[month] ?? 0;
  const medalNow = medalFor(daysThisMonth);
  const medalNext = [...MEDALS].reverse().find((m) => m.days > daysThisMonth);
  const firstYear = Math.min(+today.slice(0, 4), ...Object.keys(byMonth).map((m) => +m.slice(0, 4)));
  const years = Array.from({ length: +today.slice(0, 4) - firstYear + 1 }, (_, i) => +today.slice(0, 4) - i);
  const medalCount = (id: string) => Object.values(byMonth).filter((d) => medalFor(d)?.id === id).length;

  return (
    <Page>
      <h1>Your journey 🗺️</h1>

      <Card className="flex-row items-center gap-6 max-[640px]:flex-col max-[640px]:text-center">
        <Mascot mood="happy" size={110} />
        <div className="flex flex-1 flex-col gap-2">
          <div className="font-display text-sm font-semibold text-brand-ink">
            {rank.icon} {rank.title}
          </div>
          <h2>Level {level}</h2>
          <ProgressBar value={s.level.into} max={s.level.needed} className="h-3.5" />
          <p className="num text-sm text-muted-foreground">
            {s.level.into.toLocaleString()} / {s.level.needed.toLocaleString()} XP to level {level + 1} · reward 🪙 {levelCoins(level + 1)}
          </p>
          <p className="text-sm text-muted-foreground">
            {p.xp.toLocaleString()} XP earned in total.
            {nextRank && (
              <>
                {' '}
                Next rank: {nextRank.icon} <b>{nextRank.title}</b> at level {nextRank.level} ({(xpForLevel(nextRank.level) - p.xp).toLocaleString()} XP to go).
              </>
            )}
          </p>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4 max-[860px]:grid-cols-1">
        <Card>
          <CardHeader>
            <CardTitle>This month</CardTitle>
            <CardDescription>
              {daysThisMonth} study day{daysThisMonth === 1 ? '' : 's'}
            </CardDescription>
          </CardHeader>
          <div className="flex items-center gap-4">
            <span className={cn('text-[52px] leading-none', !medalNow && 'opacity-35 grayscale')}>{medalNow ? medalNow.icon : '🏅'}</span>
            <div className="flex flex-1 flex-col gap-1">
              <div className="font-display text-md font-semibold">{medalNow ? `${medalNow.name} medal earned` : 'No medal yet'}</div>
              {medalNext ? (
                <>
                  <ProgressBar value={daysThisMonth} max={medalNext.days} className="h-2" />
                  <p className="text-sm text-muted-foreground">
                    {medalNext.days - daysThisMonth} more day{medalNext.days - daysThisMonth === 1 ? '' : 's'} for {medalNext.icon} {medalNext.name}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">The best medal there is. See you next month!</p>
              )}
            </div>
          </div>
          <p className="text-sm text-muted-foreground">Study on 10 days in a month for bronze, 20 for silver and 28 for gold. Any XP counts as a study day.</p>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Next reward</CardTitle>
            <CardDescription>Every level pays 10 coins × the level</CardDescription>
          </CardHeader>
          {nextStop ? (
            <div className="flex items-center gap-4">
              <LevelDisc state="next">{nextStop.level}</LevelDisc>
              <div className="flex flex-1 flex-col gap-1">
                {nextStop.rank && (
                  <div>
                    {nextStop.rank.icon} New rank: <b>{nextStop.rank.title}</b>
                  </div>
                )}
                {nextStop.items.map((i) => (
                  <div key={i.id}>
                    {i.icon} {kindLabel[i.kind]}: <b>{i.name}</b>
                  </div>
                ))}
                <p className="text-sm text-muted-foreground">{(xpForLevel(nextStop.level) - p.xp).toLocaleString()} XP to go</p>
              </div>
            </div>
          ) : (
            <p>You reached the end of the road. Flick Immortal! ♾️</p>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Medal cabinet</CardTitle>
          <CardDescription>
            🥇 {medalCount('gold')} · 🥈 {medalCount('silver')} · 🥉 {medalCount('bronze')}
          </CardDescription>
        </CardHeader>
        <div className="flex flex-col gap-3">
          {years.map((y) => (
            <div key={y} className="grid grid-cols-[48px_repeat(12,minmax(0,1fr))] items-center gap-1.5 max-[640px]:grid-cols-6">
              <div className="font-display font-semibold text-muted-foreground max-[640px]:col-span-full">{y}</div>
              {MONTHS.map((name, i) => {
                const key = `${y}-${String(i + 1).padStart(2, '0')}`;
                const days = byMonth[key] ?? 0;
                const medal = medalFor(days);
                const future = key > month;
                return (
                  <div
                    key={key}
                    className={cn(
                      'flex flex-col items-center gap-0.5 rounded-sm border-2 border-transparent bg-muted py-1.5 text-xs',
                      key === month && 'border-brand-soft-strong',
                      future && 'opacity-40',
                      medal?.id === 'gold' && 'bg-warning-soft',
                    )}
                    title={future ? '' : `${name} ${y}: ${days} study day${days === 1 ? '' : 's'}${medal ? ` · ${medal.name}` : ''}`}
                  >
                    <span className={cn('h-6 leading-6 font-semibold text-faint', medal ? 'text-[20px]' : 'text-sm')}>{medal ? medal.icon : future ? '' : days || '·'}</span>
                    <span className="text-muted-foreground">{name}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </Card>

      <section>
        <SectionHead title="The road to 100">
          <span className="text-sm text-muted-foreground">Free rewards and ranks. Each one stays yours.</span>
        </SectionHead>
        <ol className="flex flex-col gap-2">
          {stops.map((st) => {
            const state = st.level <= level ? 'reached' : st === nextStop ? 'next' : 'locked';
            return (
              <li
                key={st.level}
                className={cn(
                  'flex items-center gap-4 rounded-lg border-2 border-border bg-card px-4 py-3',
                  state === 'next' && 'border-primary shadow-[0_3px_0_var(--accent-soft-strong)]',
                  state === 'locked' && 'text-muted-foreground',
                )}
              >
                <LevelDisc state={state}>{state === 'reached' ? '✓' : st.level}</LevelDisc>
                <div className="flex flex-col gap-1">
                  <div className="font-display font-semibold text-foreground">
                    Level {st.level}
                    <span className="text-sm text-muted-foreground"> · 🪙 {levelCoins(st.level)}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {st.rank && (
                      <Badge variant="brand" className="h-auto py-0.5 font-sans text-sm">
                        {st.rank.icon} {st.rank.title}
                      </Badge>
                    )}
                    {st.items.map((i) => (
                      <Badge key={i.id} className="h-auto py-0.5 font-sans text-sm font-normal text-foreground" title={i.desc}>
                        {i.icon} {i.name}
                        <span className="text-muted-foreground"> · {kindLabel[i.kind]}</span>
                      </Badge>
                    ))}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </Page>
  );
}

function LevelDisc({ state, children }: { state: 'reached' | 'next' | 'locked'; children: ReactNode }) {
  return (
    <span
      className={cn(
        'grid size-11 flex-none place-items-center rounded-full bg-muted font-display text-md font-bold text-muted-foreground',
        state === 'reached' && 'bg-success text-white',
        state === 'next' && 'bg-primary text-primary-foreground',
      )}
    >
      {children}
    </span>
  );
}
