import { useEffect, useMemo, useState } from 'react';
import { MASTERY_TIERS, addDays, localDay } from '../../shared/game.ts';
import { api, type StatsData } from '../api.ts';
import { useApp, useAppState } from '../app-context.tsx';
import { MasteryBar, Page, PageSpinner } from '../components/shared.tsx';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function Stats() {
  const s = useAppState();
  const { showError } = useApp();
  const [data, setData] = useState<StatsData | null>(null);

  useEffect(() => {
    api.stats().then(setData).catch(showError);
  }, [showError]);

  if (!data) return <PageSpinner />;

  const st = data.stats;
  const accuracy = st.answers ? Math.round((st.correct / st.answers) * 100) : 0;
  const weekDelta = data.thisWeekXp - data.lastWeekXp;

  return (
    <Page>
      <h1>Your stats 📊</h1>
      <div className="stagger grid grid-cols-4 gap-3 max-[860px]:grid-cols-2">
        <Tile icon="🔥" value={s.profile.streak.current} label="Day streak" sub={`Best ${s.profile.streak.best}`} />
        <Tile icon="⭐" value={s.level.level} label="Level" sub={`${s.profile.xp.toLocaleString()} XP total`} />
        <Tile icon="🎯" value={`${accuracy}%`} label="Accuracy" sub={`${st.correct.toLocaleString()} / ${st.answers.toLocaleString()}`} />
        <Tile
          icon="🧠"
          value={data.retention === null ? '–' : `${Math.round(data.retention * 100)}%`}
          label="True retention (30d)"
          sub={`Target ${Math.round(s.settings.desiredRetention * 100)}% · ${data.reviewedLast30} reviews`}
        />
        <Tile icon="🃏" value={data.totalCards} label="Cards" sub={`${st.newLearned} learned`} />
        <Tile icon="📈" value={data.thisWeekXp} label="XP this week" sub={`${weekDelta >= 0 ? '▲' : '▼'} ${Math.abs(weekDelta)} vs last week`} />
        <Tile icon="⚔️" value={st.bossesDefeated} label="Bosses defeated" />
        <Tile icon="⏱️" value={st.timeAttackBest} label="Time Attack best" sub={st.matchBestMs ? `Match best ${(st.matchBestMs / 1000).toFixed(1)}s` : undefined} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
          <CardDescription>XP per day, last 26 weeks</CardDescription>
        </CardHeader>
        <Heatmap dailyXp={data.dailyXp} goal={s.settings.dailyGoalXp} />
      </Card>

      <div className="grid grid-cols-2 gap-4 max-[860px]:grid-cols-1">
        <Card>
          <CardHeader>
            <CardTitle>Upcoming reviews</CardTitle>
            <CardDescription>Next 14 days (FSRS)</CardDescription>
          </CardHeader>
          <Forecast data={data.forecast} />
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Mastery</CardTitle>
            <CardDescription>Based on memory stability</CardDescription>
          </CardHeader>
          <MasteryBar tiers={data.tiers} className="h-2" />
          <ul className="flex flex-col gap-1 text-sm">
            {MASTERY_TIERS.map((t, i) => (
              <li key={t.id}>
                <span className="mr-1 inline-block size-2.5 rounded-full" style={{ background: t.color }} /> {t.name}
                <span className="num"> {data.tiers[i]}</span>
                <span className="text-muted-foreground"> · {['not studied yet', 'stable < 3 days', 'stable < 2 weeks', 'stable < 2 months', 'stable 2+ months'][i]}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </Page>
  );
}

function Tile({ icon, value, label, sub }: { icon: string; value: string | number; label: string; sub?: string }) {
  return (
    <Card className="min-w-0 gap-0 p-6">
      <div className="mb-1 text-[28px] leading-tight">{icon}</div>
      <div className="mb-1 font-display text-xl font-bold tabular-nums">{value}</div>
      <div className="font-semibold">{label}</div>
      {sub && <div className="text-sm text-muted-foreground">{sub}</div>}
    </Card>
  );
}

const HEAT = ['bg-track', 'bg-[color-mix(in_srgb,var(--accent)_30%,var(--track))]', 'bg-[color-mix(in_srgb,var(--accent)_55%,var(--track))]', 'bg-[color-mix(in_srgb,var(--accent)_78%,var(--track))]', 'bg-primary'];

function Heatmap({ dailyXp, goal }: { dailyXp: Record<string, number>; goal: number }) {
  const today = localDay();
  const weeks = 26;
  const cells = useMemo(() => {
    // Align to start on a Sunday so columns are weeks.
    const dow = new Date().getDay();
    const start = addDays(today, -(weeks - 1) * 7 - dow);
    return Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
  }, [today]);
  const level = (xp: number) => (xp <= 0 ? 0 : xp < goal * 0.34 ? 1 : xp < goal * 0.67 ? 2 : xp < goal ? 3 : 4);
  return (
    <div className="grid grid-flow-col grid-rows-[repeat(7,12px)] gap-[3px] overflow-x-auto pb-1" style={{ gridTemplateColumns: `repeat(${weeks}, 12px)` }}>
      {cells.map((d) => {
        const xp = dailyXp[d] ?? 0;
        const future = d > today;
        return <div key={d} className={cn('size-3 rounded-[3px]', future ? 'bg-transparent' : HEAT[level(xp)])} title={future ? '' : `${d}: ${xp} XP`} />;
      })}
    </div>
  );
}

function Forecast({ data }: { data: { day: string; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="flex h-40 items-end gap-1">
      {data.map((d, i) => (
        <div key={d.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1 font-display text-xs font-semibold text-muted-foreground" title={`${d.day}: ${d.count} due`}>
          <div className="text-sm">{d.count || ''}</div>
          <div className="min-h-[3px] w-full rounded-md bg-primary" style={{ height: `${(d.count / max) * 100}%` }} />
          <div className="text-sm">{i === 0 ? 'Today' : new Date(`${d.day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'narrow' })}</div>
        </div>
      ))}
    </div>
  );
}
