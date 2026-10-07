import { useEffect, useMemo, useState } from 'react';
import { MASTERY_TIERS, addDays, localDay } from '../../shared/game.ts';
import { api, type StatsData } from '../api.ts';
import { useApp, useAppState } from '../app-context.tsx';
import { MasteryBar, Spinner } from '../components/ui.tsx';

export function Stats() {
  const s = useAppState();
  const { showError } = useApp();
  const [data, setData] = useState<StatsData | null>(null);

  useEffect(() => {
    api.stats().then(setData).catch(showError);
  }, [showError]);

  if (!data) {
    return (
      <div className="page center">
        <Spinner />
      </div>
    );
  }

  const st = data.stats;
  const accuracy = st.answers ? Math.round((st.correct / st.answers) * 100) : 0;
  const weekDelta = data.thisWeekXp - data.lastWeekXp;

  return (
    <div className="page">
      <h1>Your stats 📊</h1>
      <div className="stat-grid">
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

      <div className="panel">
        <div className="panel-head">
          <h3>Activity</h3>
          <span className="muted small">XP per day, last 26 weeks</span>
        </div>
        <Heatmap dailyXp={data.dailyXp} goal={s.settings.dailyGoalXp} />
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-head">
            <h3>Upcoming reviews</h3>
            <span className="muted small">Next 14 days (FSRS)</span>
          </div>
          <Forecast data={data.forecast} />
        </div>
        <div className="panel">
          <div className="panel-head">
            <h3>Mastery</h3>
            <span className="muted small">Based on memory stability</span>
          </div>
          <MasteryBar tiers={data.tiers} height={8} />
          <ul className="legend">
            {MASTERY_TIERS.map((t, i) => (
              <li key={t.id}>
                <span className="dot" style={{ background: t.color }} /> {t.name}
                <span className="num"> {data.tiers[i]}</span>
                <span className="muted small"> · {['not studied yet', 'stable < 3 days', 'stable < 2 weeks', 'stable < 2 months', 'stable 2+ months'][i]}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Tile({ icon, value, label, sub }: { icon: string; value: string | number; label: string; sub?: string }) {
  return (
    <div className="stat-tile big">
      <div className="stat-icon">{icon}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="muted small">{sub}</div>}
    </div>
  );
}

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
    <div className="heatmap" style={{ gridTemplateColumns: `repeat(${weeks}, 12px)` }}>
      {cells.map((d) => {
        const xp = dailyXp[d] ?? 0;
        const future = d > today;
        return <div key={d} className={`heat l${future ? 'x' : level(xp)}`} title={future ? '' : `${d}: ${xp} XP`} />;
      })}
    </div>
  );
}

function Forecast({ data }: { data: { day: string; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="forecast">
      {data.map((d, i) => (
        <div key={d.day} className="fc-col" title={`${d.day}: ${d.count} due`}>
          <div className="fc-count small">{d.count || ''}</div>
          <div className="fc-bar" style={{ height: `${(d.count / max) * 100}%` }} />
          <div className="fc-label small muted">{i === 0 ? 'Today' : new Date(`${d.day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'narrow' })}</div>
        </div>
      ))}
    </div>
  );
}
