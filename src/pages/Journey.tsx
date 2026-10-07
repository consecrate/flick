import { useMemo } from 'react';
import { MEDALS, RANKS, SHOP, levelCoins, localDay, medalFor, rankFor, studyDaysByMonth, xpForLevel, type ShopItem } from '../../shared/game.ts';
import { useAppState } from '../app-context.tsx';
import { Mascot } from '../components/Mascot.tsx';
import { ProgressBar } from '../components/ui.tsx';

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
    <div className="page">
      <h1>Your journey 🗺️</h1>

      <section className="journey-hero panel">
        <Mascot mood="happy" size={110} />
        <div className="journey-hero-main">
          <div className="eyebrow">
            {rank.icon} {rank.title}
          </div>
          <h2>Level {level}</h2>
          <ProgressBar value={s.level.into} max={s.level.needed} height={14} />
          <p className="muted small num">
            {s.level.into.toLocaleString()} / {s.level.needed.toLocaleString()} XP to level {level + 1} · reward 🪙 {levelCoins(level + 1)}
          </p>
          <p className="muted small">
            {p.xp.toLocaleString()} XP earned in total.
            {nextRank && (
              <>
                {' '}
                Next rank: {nextRank.icon} <b>{nextRank.title}</b> at level {nextRank.level} ({(xpForLevel(nextRank.level) - p.xp).toLocaleString()} XP to go).
              </>
            )}
          </p>
        </div>
      </section>

      <div className="grid-2">
        <section className="panel">
          <div className="panel-head">
            <h3>This month</h3>
            <span className="muted small">{daysThisMonth} study day{daysThisMonth === 1 ? '' : 's'}</span>
          </div>
          <div className="medal-now">
            <span className={`medal-big ${medalNow ? '' : 'empty'}`}>{medalNow ? medalNow.icon : '🏅'}</span>
            <div>
              <div className="medal-title">{medalNow ? `${medalNow.name} medal earned` : 'No medal yet'}</div>
              {medalNext ? (
                <>
                  <ProgressBar value={daysThisMonth} max={medalNext.days} height={8} />
                  <p className="muted small">
                    {medalNext.days - daysThisMonth} more day{medalNext.days - daysThisMonth === 1 ? '' : 's'} for {medalNext.icon} {medalNext.name}
                  </p>
                </>
              ) : (
                <p className="muted small">The best medal there is. See you next month!</p>
              )}
            </div>
          </div>
          <p className="muted small">Study on 10 days in a month for bronze, 20 for silver and 28 for gold. Any XP counts as a study day.</p>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h3>Next reward</h3>
            <span className="muted small">Every level pays 10 coins × the level</span>
          </div>
          {nextStop ? (
            <div className="next-reward">
              <span className="road-level">{nextStop.level}</span>
              <div>
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
                <p className="muted small">{(xpForLevel(nextStop.level) - p.xp).toLocaleString()} XP to go</p>
              </div>
            </div>
          ) : (
            <p>You reached the end of the road. Flick Immortal! ♾️</p>
          )}
        </section>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h3>Medal cabinet</h3>
          <span className="muted small">
            🥇 {medalCount('gold')} · 🥈 {medalCount('silver')} · 🥉 {medalCount('bronze')}
          </span>
        </div>
        <div className="cabinet">
          {years.map((y) => (
            <div key={y} className="cabinet-year">
              <div className="cabinet-label">{y}</div>
              {MONTHS.map((name, i) => {
                const key = `${y}-${String(i + 1).padStart(2, '0')}`;
                const days = byMonth[key] ?? 0;
                const medal = medalFor(days);
                const future = key > month;
                return (
                  <div
                    key={key}
                    className={`cabinet-cell ${medal ? `has ${medal.id}` : ''} ${future ? 'future' : ''} ${key === month ? 'current' : ''}`}
                    title={future ? '' : `${name} ${y}: ${days} study day${days === 1 ? '' : 's'}${medal ? ` · ${medal.name}` : ''}`}
                  >
                    <span className="cabinet-medal">{medal ? medal.icon : future ? '' : days || '·'}</span>
                    <span className="cabinet-month">{name}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="section-head">
          <h2>The road to 100</h2>
          <span className="muted small">Free rewards and ranks. Each one stays yours.</span>
        </div>
        <ol className="road">
          {stops.map((st) => {
            const state = st.level <= level ? 'reached' : st === nextStop ? 'next' : 'locked';
            return (
              <li key={st.level} className={`road-stop ${state}`}>
                <span className="road-level">{state === 'reached' ? '✓' : st.level}</span>
                <div className="road-body">
                  <div className="road-title">
                    Level {st.level}
                    <span className="muted small"> · 🪙 {levelCoins(st.level)}</span>
                  </div>
                  <div className="road-rewards">
                    {st.rank && (
                      <span className="road-reward rank">
                        {st.rank.icon} {st.rank.title}
                      </span>
                    )}
                    {st.items.map((i) => (
                      <span key={i.id} className="road-reward" title={i.desc}>
                        {i.icon} {i.name}
                        <span className="muted"> · {kindLabel[i.kind]}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
