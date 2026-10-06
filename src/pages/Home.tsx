import { useState } from 'react';
import { api } from '../api.ts';
import { navigate, useApp, useAppState } from '../app-context.tsx';
import { ImportModal } from '../components/ImportModal.tsx';
import { Icon } from '../components/icons.tsx';
import { EmptyState, Modal, ProgressBar, Ring } from '../components/ui.tsx';
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
      sfx.victory();
      confetti(180);
      setChestLoot(loot);
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
      await refresh();
    } catch (e) {
      showError(e);
    }
  };

  return (
    <div className="page">
      <section className="hero">
        <div className="hero-text">
          <div className="eyebrow">
            Level {s.level.level} · {s.level.title}
          </div>
          <h1>
            {greeting()}, {p.name}
          </h1>
          <p className="muted">
            {s.dueTotal > 0
              ? `${s.dueTotal} card${s.dueTotal === 1 ? '' : 's'} due for review. `
              : s.newTotal > 0
                ? `${s.newTotal} new card${s.newTotal === 1 ? '' : 's'} ready to learn. `
                : 'Nothing due right now. '}
            {s.level.needed - s.level.into} XP to level {s.level.level + 1}.
          </p>
          {s.streakAtRisk && <p className="warn">Your {p.streak.current}-day streak ends at midnight. One quick session keeps it alive.</p>}
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
        <div className="goal-card">
          <Ring value={goalPct} size={96} stroke={6} color={goalPct >= 1 ? 'var(--good)' : 'var(--accent)'}>
            <div className="goal-num">{s.todayXp}</div>
            <div className="muted small num">/ {goal}</div>
          </Ring>
          <div>
            <div className="goal-title">Daily goal</div>
            {s.chestAvailable ? (
              <button className="btn chest-btn" onClick={() => void openChest()}>
                <Icon name="gift" /> Open chest
              </button>
            ) : s.chestOpenedToday ? (
              <p className="muted small">Chest opened. See you tomorrow.</p>
            ) : (
              <p className="muted small">Earn {Math.max(0, goal - s.todayXp)} more XP today to unlock a chest of coins and hints.</p>
            )}
          </div>
        </div>
      </section>

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
                  <span className="muted small">
                    <Icon name="check" /> Claimed
                  </span>
                ) : (
                  <button className={`btn small ${done ? 'primary' : 'ghost'}`} disabled={!done} onClick={() => void claim(q.id)} title="Coin reward">
                    <Icon name="coin" /> {q.reward}
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
            <ArcadeTile name="Match" desc="Pair terms against the clock" disabled={!s.decks.some((d) => d.cardCount >= 3)} onClick={() => navigate('/play/match/all')} />
            <ArcadeTile name="Time Attack" desc="As many answers as you can in 60 seconds" disabled={!s.decks.some((d) => d.cardCount >= 4)} onClick={() => navigate('/play/timeattack/all')} />
            <ArcadeTile name="Boss Fight" desc="Battle your hardest cards" disabled={!s.decks.some((d) => d.bossReady)} onClick={() => navigate('/play/boss/all')} />
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
          <EmptyState title="No decks yet">
            <p className="muted">Upload a PDF, paste notes, drop a link, or just name a topic. Claude writes the cards.</p>
            <button className="btn primary big" onClick={() => setImporting(true)}>
              Create your first deck
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
                    {d.cardCount} card{d.cardCount === 1 ? '' : 's'}
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
            <div className="chest-open">
              <Icon name="gift" size={28} />
            </div>
            <h2>Chest opened</h2>
            <p className="loot">
              <Icon name="coin" /> +{chestLoot.coins} coins
            </p>
            {chestLoot.hints > 0 && (
              <p className="loot">
                <Icon name="hint" /> +{chestLoot.hints} hints
              </p>
            )}
            {chestLoot.freeze && (
              <p className="loot">
                <Icon name="freeze" /> +1 streak freeze
              </p>
            )}
            <button className="btn primary big" onClick={() => setChestLoot(null)}>
              Done
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ArcadeTile({ name, desc, onClick, disabled }: { name: string; desc: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button className="arcade-tile" onClick={onClick} disabled={disabled} title={disabled ? 'Study a few cards first to unlock' : undefined}>
      <span className="arcade-name">{name}</span>
      <Icon name={disabled ? 'lock' : 'play'} filled={!disabled} size={12} />
      <span className="muted small">{disabled ? 'Study a deck first' : desc}</span>
    </button>
  );
}
