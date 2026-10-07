import { ACHIEVEMENTS, TIER_COINS, TROPHY_FAMILIES, type TrophyFamily } from '../../shared/game.ts';
import { useAppState } from '../app-context.tsx';
import { Page, ProgressBar } from '../components/shared.tsx';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function Achievements() {
  const s = useAppState();
  const unlocked = s.profile.achievements;
  const count = ACHIEVEMENTS.filter((a) => unlocked[a.id]).length;
  return (
    <Page>
      <div className="flex flex-col gap-3">
        <h1>Trophies 🏆</h1>
        <p className="text-muted-foreground">
          {count} of {ACHIEVEMENTS.length} unlocked. Every trophy has tiers, and each tier pays more coins than the last.
        </p>
        <ProgressBar value={count} max={ACHIEVEMENTS.length} className="h-3.5" />
      </div>
      <div className="stagger grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
        {TROPHY_FAMILIES.map((f) => (
          <Family key={f.id} family={f} />
        ))}
      </div>
    </Page>
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
    <Card
      className={cn(
        'items-center gap-1 px-4 pt-6 pb-4 text-center text-sm',
        best ? 'border-[color-mix(in_srgb,var(--warn)_45%,var(--surface))] bg-warning-soft' : 'text-muted-foreground',
        !next && 'border-warning',
      )}
    >
      <div className={cn('mb-2 grid size-16 place-items-center rounded-full bg-muted text-[34px]', !best && 'opacity-40 grayscale')}>{best ? best.icon : next!.icon}</div>
      <div className={cn('font-display text-md font-semibold', best ? 'text-foreground' : 'text-muted-foreground')}>{best ? best.name : f.name}</div>
      <div className="mt-0.5 mb-1 flex gap-1" aria-label={`${doneCount} of ${f.tiers.length} tiers`}>
        {f.tiers.map((t) => (
          <span
            key={t.id}
            className={cn(
              'size-2.5 rounded-full border-2',
              unlocked[t.id] ? 'border-[color-mix(in_srgb,var(--warn)_70%,var(--ink))] bg-warning' : 'border-input bg-track',
            )}
            title={`${t.icon} ${t.name}: ${f.desc(t.target)}${unlocked[t.id] ? ` · ${new Date(unlocked[t.id]).toLocaleDateString()}` : ''}`}
          />
        ))}
      </div>
      {next ? (
        <>
          <div className="text-muted-foreground">
            Next: {next.icon} <b>{next.name}</b>
          </div>
          <div className="text-muted-foreground">{f.desc(next.target)}</div>
          {value !== null && !f.lowerIsBetter && (
            <div className="flex w-full items-center gap-2">
              <ProgressBar value={value} max={next.target} className="h-1.5 flex-1" />
              <span className="num text-muted-foreground">
                {show(Math.min(value, next.target))} / {show(next.target)}
              </span>
            </div>
          )}
          {value !== null && f.lowerIsBetter && <div className="num text-muted-foreground">Best: {show(value)}</div>}
          <div className="text-muted-foreground">🪙 {TIER_COINS[Math.min(nextIndex, TIER_COINS.length - 1)]}</div>
        </>
      ) : (
        <div className="text-muted-foreground">All {f.tiers.length} tiers complete ✨</div>
      )}
    </Card>
  );
}
