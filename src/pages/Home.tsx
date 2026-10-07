import { useState } from 'react';
import { MEDALS, SHOP, localDay, medalFor, studyDaysByMonth } from '../../shared/game.ts';
import { api } from '../api.ts';
import { navigate, useApp, useAppState } from '../app-context.tsx';
import { ImportModal } from '../components/ImportModal.tsx';
import { Icon } from '../components/icons.tsx';
import { PokeableMascot } from '../components/Mascot.tsx';
import { CountUp, EmptyState, Modal, ProgressBar, Ring } from '../components/ui.tsx';
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
    <div className="page">
      <section className="hero">
        <div className="hero-text">
          <PokeableMascot mood={s.dueTotal + s.newTotal > 0 ? 'happy' : 'sleepy'} size={150} />
          <div className="hero-copy">
            <div className="eyebrow">
              {greeting()}, {p.name} {p.avatar}
            </div>
            <h1>{s.dueTotal + s.newTotal > 0 ? 'What shall we study?' : 'All caught up!'}</h1>
            <p className="muted">
              {s.dueTotal > 0
                ? `${s.dueTotal} card${s.dueTotal === 1 ? '' : 's'} due for review. `
                : s.newTotal > 0
                  ? `${s.newTotal} new card${s.newTotal === 1 ? '' : 's'} ready to learn. `
                  : 'Nothing due right now. '}
              {s.level.needed - s.level.into} XP to level {s.level.level + 1} ({s.level.title}).
            </p>
            {s.streakAtRisk && <p className="warn">🔥 Your {p.streak.current}-day streak ends at midnight. One quick session keeps it alive!</p>}
            <div className="hero-actions">
              <button className="btn primary big" disabled={s.dueTotal + s.newTotal === 0} onClick={() => navigate('/play/quiz/all')}>
                {s.dueTotal + s.newTotal > 0 && <Icon name="play" filled size={14} />}
                {s.dueTotal > 0 ? `Review ${s.dueTotal} due` : s.newTotal > 0 ? 'Learn new cards' : 'All caught up'}
              </button>
              <button className="btn big" onClick={() => setImporting(true)}>
                <Icon name="plus" /> New deck
              </button>
            </div>
          </div>
        </div>
        <div className="goal-card">
          <Ring value={goalPct} size={124} stroke={14} color={goalPct >= 1 ? 'var(--good)' : 'var(--accent)'}>
            <div className="goal-num">
              <CountUp value={s.todayXp} />
            </div>
            <div className="muted small num">/ {goal} XP</div>
          </Ring>
          <div>
            <div className="goal-title">Daily goal</div>
            {s.chestAvailable ? (
              <button className="btn chest-btn" onClick={() => void openChest()}>
                🎁 Open chest
              </button>
            ) : s.chestOpenedToday ? (
              <p className="muted small">Chest opened. See you tomorrow! 👋</p>
            ) : (
              <p className="muted small">{Math.max(0, goal - s.todayXp)} more XP to unlock today’s treasure chest 🎁</p>
            )}
          </div>
        </div>
      </section>

      <JourneyStrip />

      <section className="grid-2">
        <div className="panel">
          <div className="panel-head">
            <h3>Daily quests</h3>
            <span className="muted small">Reset at midnight</span>
          </div>
          {p.quests.list.map((q) => {
            const done = q.progress >= q.target;
            return (
              <div key={q.id} className={`quest ${q.claimed ? 'claimed' : ''}`}>
                <div className="quest-main">
                  <div className="quest-label">
                    {q.label}
                    <span className="num">
                      {Math.min(q.progress, q.target)}/{q.target}
                    </span>
                  </div>
                  <ProgressBar value={q.progress} max={q.target} height={4} />
                </div>
                {q.claimed ? (
                  <span className="chip">✓ Claimed</span>
                ) : (
                  <button className={`btn small ${done ? 'primary' : 'ghost'}`} disabled={!done} onClick={() => void claim(q.id)} title="Coin reward">
                    🪙 {q.reward}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <div className="panel">
          <div className="panel-head">
            <h3>Arcade</h3>
            <span className="muted small">Practice for XP. Doesn’t affect scheduling.</span>
          </div>
          <div className="arcade-grid">
            <ArcadeTile icon="🧩" name="Match" desc="Pair terms against the clock" disabled={!s.decks.some((d) => d.cardCount >= 3)} onClick={() => navigate('/play/match/all')} />
            <ArcadeTile icon="⏱️" name="Time Attack" desc="60 seconds. Go!" disabled={!s.decks.some((d) => d.cardCount >= 4)} onClick={() => navigate('/play/timeattack/all')} />
            <ArcadeTile icon="⚔️" name="Boss Fight" desc="Battle your hardest cards" disabled={!s.decks.some((d) => d.bossReady)} onClick={() => navigate('/play/boss/all')} />
          </div>
        </div>
      </section>

      <section>
        <div className="section-head">
          <h2>Your decks</h2>
          <button className="btn ghost" onClick={() => setImporting(true)}>
            <Icon name="plus" /> New deck
          </button>
        </div>
        {s.decks.length === 0 ? (
          <EmptyState mood="wow" title="No decks yet">
            <p className="muted">Upload a PDF, paste notes, drop a link, or just name a topic. Claude writes the cards.</p>
            <button className="btn primary big" onClick={() => setImporting(true)}>
              ✨ Create your first deck
            </button>
          </EmptyState>
        ) : (
          <div className="deck-grid">
            {s.decks.map((d) => (
              <button key={d.id} className="deck-card" onClick={() => navigate(`/deck/${d.id}`)}>
                <div className="deck-top">
                  <span className="deck-emoji">{d.emoji}</span>
                  <div className="deck-meta">
                    {d.dueCount > 0 && <span className="badge due">{d.dueCount} due</span>}
                    {d.newCount > 0 && <span className="badge new">{d.newCount} new</span>}
                  </div>
                </div>
                <div>
                  <div className="deck-title">{d.title}</div>
                  <div className="deck-meta">
                    {d.cardCount === 0 ? 'No cards yet' : `${d.cardCount} card${d.cardCount === 1 ? '' : 's'}`}
                  </div>
                </div>
                <div className="deck-progress" title="Mastered">
                  <ProgressBar value={d.mastery} height={3} />
                  <span>{Math.round(d.mastery * 100)}%</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {importing && <ImportModal onClose={() => setImporting(false)} onDone={(r) => navigate(`/deck/${r.deck.id}`)} />}
      {chestLoot && (
        <Modal onClose={() => setChestLoot(null)}>
          <div className="center">
            <div className="chest-open">🎁</div>
            <h2>Treasure!</h2>
            <p className="loot">🪙 +{chestLoot.coins} coins</p>
            {chestLoot.hints > 0 && <p className="loot">💡 +{chestLoot.hints} hints</p>}
            {chestLoot.freeze && <p className="loot">🧊 +1 streak freeze</p>}
            <button className="btn primary big" onClick={() => setChestLoot(null)}>
              Sweet!
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ArcadeTile({ icon, name, desc, onClick, disabled }: { icon: string; name: string; desc: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button className="arcade-tile" onClick={onClick} disabled={disabled} title={disabled ? 'Study a few cards first to unlock' : undefined}>
      <span className="arcade-icon">{icon}</span>
      <span className="arcade-name">{name}</span>
      <span className="muted small">{disabled ? '🔒 Study a deck first' : desc}</span>
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
    <a className="journey-strip" href="#/journey">
      {next && (
        <span>
          <span className="journey-strip-icon">{next.icon}</span> <b>{next.name}</b> unlocks at level {next.unlockLevel}
        </span>
      )}
      <span>
        <span className="journey-strip-icon">{medal ? medal.icon : '🏅'}</span>{' '}
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
      <span className="journey-strip-go">Journey →</span>
    </a>
  );
}
