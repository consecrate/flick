import { ACHIEVEMENTS, TIER_COINS, TROPHY_FAMILIES, type TrophyFamily } from '../../shared/game.ts';
import { useAppState } from '../app-context.tsx';
import { ProgressBar } from '../components/ui.tsx';

export function Achievements() {
  const s = useAppState();
  const unlocked = s.profile.achievements;
  const count = ACHIEVEMENTS.filter((a) => unlocked[a.id]).length;
  return (
    <div className="page">
      <h1>Trophies 🏆</h1>
      <p className="muted">
        {count} of {ACHIEVEMENTS.length} unlocked. Every trophy has tiers, and each tier pays more coins than the last.
      </p>
      <ProgressBar value={count} max={ACHIEVEMENTS.length} height={14} />
      <div className="trophy-grid">
        {TROPHY_FAMILIES.map((f) => (
          <Family key={f.id} family={f} />
        ))}
      </div>
    </div>
  );
}

function Family({ family: f }: { family: TrophyFamily }) {
  const s = useAppState();
  const unlocked = s.profile.achievements;
  const value = f.metric(s.profile, s.level.level, { mastered: s.masteredCards });
  const doneCount = f.tiers.filter((t) => unlocked[t.id]).length;
  const best = doneCount > 0 ? f.tiers[doneCount - 1] : null;
  const next = f.tiers.find((t) => !unlocked[t.id]);
  const nextIndex = next ? f.tiers.indexOf(next) : -1;
  const show = (v: number) => (f.lowerIsBetter ? `${(v / 1000).toFixed(1)}s` : v.toLocaleString());

  return (
    <div className={`trophy ${best ? 'unlocked' : 'locked'} ${next ? '' : 'complete'}`}>
      <div className="trophy-icon">{best ? best.icon : next!.icon}</div>
      <div className="trophy-name">{best ? best.name : f.name}</div>
      <div className="tier-pips" aria-label={`${doneCount} of ${f.tiers.length} tiers`}>
        {f.tiers.map((t) => (
          <span key={t.id} className={`tier-pip ${unlocked[t.id] ? 'on' : ''}`} title={`${t.icon} ${t.name}: ${f.desc(t.target)}${unlocked[t.id] ? ` · ${new Date(unlocked[t.id]).toLocaleDateString()}` : ''}`} />
        ))}
      </div>
      {next ? (
        <>
          <div className="muted small">
            Next: {next.icon} <b>{next.name}</b>
          </div>
          <div className="muted small">{f.desc(next.target)}</div>
          {value !== null && !f.lowerIsBetter && (
            <div className="trophy-progress">
              <ProgressBar value={value} max={next.target} height={6} />
              <span className="muted small num">
                {show(Math.min(value, next.target))} / {show(next.target)}
              </span>
            </div>
          )}
          {value !== null && f.lowerIsBetter && <div className="muted small num">Best: {show(value)}</div>}
          <div className="muted small">🪙 {TIER_COINS[Math.min(nextIndex, TIER_COINS.length - 1)]}</div>
        </>
      ) : (
        <div className="muted small">All {f.tiers.length} tiers complete ✨</div>
      )}
    </div>
  );
}
