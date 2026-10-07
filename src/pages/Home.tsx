import { useState } from 'react';
import { PlayIcon, PlusIcon } from 'lucide-react';
import { MEDALS, SHOP, localDay, medalFor, studyDaysByMonth } from '../../shared/game.ts';
import { api } from '../api.ts';
import { navigate, useApp, useAppState } from '../app-context.tsx';
import { DeckBrowser } from '../components/DeckBrowser.tsx';
import { ImportModal } from '../components/ImportModal.tsx';
import { PokeableMascot } from '../components/Mascot.tsx';
import { CountUp, Page, ProgressBar, Ring } from '../components/shared.tsx';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { confetti } from '../fx.ts';
import { sfx } from '../sound.ts';

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Burning the midnight oil';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export function Home() {
  const s = useAppState();
  const { refresh, showError, toast, announceAchievements } = useApp();
  const [importing, setImporting] = useState(false);
  const [chestLoot, setChestLoot] = useState<{ coins: number; hints: number; freeze: boolean } | null>(null);
  const p = s.profile;
  const goal = s.settings.dailyGoalXp;
  const goalPct = Math.min(1, s.todayXp / goal);
  const toStudy = s.dueTotal + s.newTotal;

  const openChest = async () => {
    try {
      const loot = await api.openChest();
      sfx.chest();
      setChestLoot(loot);
      setTimeout(() => confetti(180), 380);
      announceAchievements(loot.newAchievements);
      await refresh();
    } catch (e) {
      showError(e);
    }
  };

  const claim = async (id: string) => {
    try {
      const r = await api.claimQuest(id);
      sfx.coin();
      toast({ title: `+${r.coins} coins`, kind: 'success' });
      announceAchievements(r.newAchievements);
      await refresh();
    } catch (e) {
      showError(e);
    }
  };

  return (
    <Page>
      <section className="grid grid-cols-[1fr_320px] items-stretch gap-4 max-[860px]:grid-cols-1">
        <div className="relative flex items-center gap-6 overflow-hidden rounded-lg border-2 border-brand-soft-strong bg-accent py-6 pr-8 pl-6 max-[560px]:flex-col max-[560px]:items-start max-[560px]:gap-2 max-[560px]:p-4 max-[560px]:[&_.mascot]:size-24">
          <PokeableMascot mood={toStudy > 0 ? 'happy' : 'sleepy'} size={150} />
          <div className="min-w-0 flex-1">
            <div className="font-display text-sm font-semibold text-brand-ink">
              {greeting()}, {p.name} {p.avatar}
            </div>
            <h1 className="mt-0.5 mb-2 text-3xl max-[560px]:text-2xl">{toStudy > 0 ? 'What shall we study?' : 'All caught up!'}</h1>
            <p className="text-muted-foreground">
              {s.dueTotal > 0
                ? `${s.dueTotal} card${s.dueTotal === 1 ? '' : 's'} due for review. `
                : s.newTotal > 0
                  ? `${s.newTotal} new card${s.newTotal === 1 ? '' : 's'} ready to learn. `
                  : 'Nothing due right now. '}
              {s.level.needed - s.level.into} XP to level {s.level.level + 1} ({s.level.title}).
            </p>
            {s.streakAtRisk && (
              <p className="mt-2 font-semibold text-warning-ink">🔥 Your {p.streak.current}-day streak ends at midnight. One quick session keeps it alive!</p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="default" size="lg" disabled={toStudy === 0} onClick={() => navigate('/play/quiz/all')}>
                {toStudy > 0 && <PlayIcon className="size-3.5" fill="currentColor" />}
                {s.dueTotal > 0 ? `Review ${s.dueTotal} due` : s.newTotal > 0 ? 'Learn new cards' : 'All caught up'}
              </Button>
              <Button size="lg" onClick={() => setImporting(true)}>
                <PlusIcon /> New deck
              </Button>
            </div>
          </div>
        </div>
        <Card className="items-center justify-center text-center">
          <Ring value={goalPct} size={124} stroke={14} color={goalPct >= 1 ? 'var(--good)' : 'var(--accent)'}>
            <div className="font-display text-2xl leading-none font-bold">
              <CountUp value={s.todayXp} />
            </div>
            <div className="num text-sm text-muted-foreground">/ {goal} XP</div>
          </Ring>
          <div className="flex flex-col items-center gap-1">
            <div className="font-display text-lg font-semibold">Daily goal</div>
            {s.chestAvailable ? (
              <Button variant="warning" className="animate-[wiggle_0.6s_var(--ease)_0.8s]" onClick={() => void openChest()}>
                🎁 Open chest
              </Button>
            ) : s.chestOpenedToday ? (
              <p className="text-sm text-muted-foreground">Chest opened. See you tomorrow! 👋</p>
            ) : (
              <p className="text-sm text-muted-foreground">{Math.max(0, goal - s.todayXp)} more XP to unlock today’s treasure chest 🎁</p>
            )}
          </div>
        </Card>
      </section>

      <JourneyStrip />

      <section className="grid grid-cols-2 gap-4 max-[860px]:grid-cols-1">
        <Card>
          <CardHeader>
            <CardTitle>Daily quests</CardTitle>
            <CardDescription>Reset at midnight</CardDescription>
          </CardHeader>
          <div className="stagger flex flex-col">
            {p.quests.list.map((q) => {
              const done = q.progress >= q.target;
              return (
                <div key={q.id} className={cn('flex items-center gap-4 border-t border-border py-3 first:border-t-0 first:pt-0', q.claimed && 'opacity-45')}>
                  <div className="flex flex-1 flex-col gap-1.5">
                    <div className="flex justify-between gap-2 font-semibold">
                      {q.label}
                      <span className="num text-sm text-muted-foreground">
                        {Math.min(q.progress, q.target)}/{q.target}
                      </span>
                    </div>
                    <ProgressBar value={q.progress} max={q.target} className="h-1" />
                  </div>
                  {q.claimed ? (
                    <Badge>✓ Claimed</Badge>
                  ) : (
                    <Button size="sm" variant={done ? 'default' : 'ghost'} disabled={!done} onClick={() => void claim(q.id)} title="Coin reward">
                      🪙 {q.reward}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Arcade</CardTitle>
            <CardDescription>Practice for XP. Doesn’t affect scheduling.</CardDescription>
          </CardHeader>
          <div className="stagger grid grid-cols-3 gap-3 max-[560px]:grid-cols-1">
            <ArcadeTile icon="🧩" name="Match" desc="Pair terms against the clock" disabled={!s.decks.some((d) => d.cardCount >= 3)} onClick={() => navigate('/play/match/all')} />
            <ArcadeTile icon="⏱️" name="Time Attack" desc="60 seconds. Go!" disabled={!s.decks.some((d) => d.cardCount >= 4)} onClick={() => navigate('/play/timeattack/all')} />
            <ArcadeTile icon="⚔️" name="Boss Fight" desc="Battle your hardest cards" disabled={!s.decks.some((d) => d.bossReady)} onClick={() => navigate('/play/boss/all')} />
          </div>
        </Card>
      </section>

      <DeckBrowser folderId={null} />

      {importing && <ImportModal onClose={() => setImporting(false)} onDone={(r) => navigate(`/deck/${r.deck.id}`)} />}
      <Dialog open={!!chestLoot} onOpenChange={(open) => !open && setChestLoot(null)}>
        {chestLoot && (
          <DialogContent className="items-center text-center" aria-describedby={undefined}>
            <div className="inline-block animate-chest-open text-[72px] leading-none">🎁</div>
            <DialogTitle className="text-xl">Treasure!</DialogTitle>
            <div className="flex flex-col items-center gap-1 font-display text-lg font-semibold *:animate-pop-in *:[animation-delay:450ms] [&>:nth-child(2)]:[animation-delay:600ms] [&>:nth-child(3)]:[animation-delay:750ms]">
              <p>🪙 +{chestLoot.coins} coins</p>
              {chestLoot.hints > 0 && <p>💡 +{chestLoot.hints} hints</p>}
              {chestLoot.freeze && <p>🧊 +1 streak freeze</p>}
            </div>
            <Button variant="default" size="lg" className="mt-2" onClick={() => setChestLoot(null)}>
              Sweet!
            </Button>
          </DialogContent>
        )}
      </Dialog>
    </Page>
  );
}

function ArcadeTile({ icon, name, desc, onClick, disabled }: { icon: string; name: string; desc: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      className="group flex flex-col items-center gap-0.5 rounded-md border-2 border-border bg-card px-2 py-4 text-center text-foreground shadow-ledge transition-[transform,border-color] duration-150 ease-bounce hover:not-disabled:-translate-y-[3px] hover:not-disabled:-rotate-1 hover:not-disabled:border-primary disabled:cursor-not-allowed disabled:text-muted-foreground disabled:opacity-60"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? 'Study a few cards first to unlock' : undefined}
    >
      <span className="inline-block text-[34px] leading-tight group-hover:group-enabled:animate-wiggle">{icon}</span>
      <span className="font-display text-md font-semibold group-hover:group-enabled:text-brand-ink">{name}</span>
      <span className="text-sm text-muted-foreground">{disabled ? '🔒 Study a deck first' : desc}</span>
    </button>
  );
}

/** One line on what is coming next: the next level reward and this month's medal. */
function JourneyStrip() {
  const s = useAppState();
  const level = s.level.level;
  const next = SHOP.filter((i) => i.price === 0 && i.unlockLevel && i.unlockLevel > level).sort((a, b) => a.unlockLevel! - b.unlockLevel!)[0];
  const days = studyDaysByMonth(s.profile.dailyXp)[localDay().slice(0, 7)] ?? 0;
  const medal = medalFor(days);
  const nextMedal = [...MEDALS].reverse().find((m) => m.days > days);
  return (
    <a
      className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-full border-2 border-border bg-card px-6 py-3 text-sm text-foreground no-underline shadow-ledge transition-colors hover:border-brand-soft-strong max-[560px]:rounded-lg"
      href="#/journey"
    >
      {next && (
        <span>
          <span className="text-md">{next.icon}</span> <b>{next.name}</b> unlocks at level {next.unlockLevel}
        </span>
      )}
      <span>
        <span className="text-md">{medal ? medal.icon : '🏅'}</span>{' '}
        {nextMedal ? (
          <>
            <b className="num">
              {days}/{nextMedal.days}
            </b>{' '}
            study days for {nextMedal.name.toLowerCase()} this month
          </>
        ) : (
          <b>Gold medal this month!</b>
        )}
      </span>
      <span className="ml-auto font-display font-semibold text-brand-ink">Journey →</span>
    </a>
  );
}
