import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ACHIEVEMENTS, letterHint, matchAnswer, xpForAnswer } from '../../shared/game.ts';
import type { Reward, StudyMode } from '../../shared/types.ts';
import { api, type CardView } from '../api.ts';
import { navigate, useApp, useAppState } from '../app-context.tsx';
import { CountUp, Spinner } from '../components/ui.tsx';
import { confetti, floatText } from '../fx.ts';
import { sfx } from '../sound.ts';

// ---------- questions ----------

export interface Question {
  type: 'mcq' | 'typed';
  options: string[];
}

function shuffle<T>(a: T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

/**
 * New and shaky cards are asked as multiple choice (recognition). Once FSRS says a
 * card is reasonably stable, it switches to typed recall, which is harder and
 * strengthens memory more.
 */
export function buildQuestion(card: CardView, pool: string[], opts: { mcqOnly?: boolean } = {}): Question {
  let wrong = card.distractors.filter((d) => d && d !== card.back);
  if (wrong.length < 3) {
    const extra = shuffle(pool.filter((b) => b !== card.back && !wrong.includes(b)));
    wrong = [...wrong, ...extra].slice(0, 3);
  }
  const canMcq = wrong.length >= 2;
  const stable = card.srs.state === 2 && card.srs.stability >= 3;
  const typable = card.back.length <= 80;
  if (!opts.mcqOnly && ((stable && typable) || !canMcq)) return { type: 'typed', options: [] };
  return { type: 'mcq', options: shuffle([card.back, ...wrong.slice(0, 3)]) };
}

export interface AnswerOutcome {
  correct: boolean;
  ms: number;
  usedHint: boolean;
  given: string;
  type: 'mcq' | 'typed';
  /** Typed answer was close but not exact; worth asking Claude. */
  close?: boolean;
}

export function QuestionView({
  card,
  question,
  onAnswer,
  locked,
  allowHints = true,
  compact,
}: {
  card: CardView;
  question: Question;
  onAnswer: (o: AnswerOutcome) => void;
  locked: boolean;
  allowHints?: boolean;
  compact?: boolean;
}) {
  const s = useAppState();
  const { refresh, showError } = useApp();
  const started = useRef(performance.now());
  const [chosen, setChosen] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [removed, setRemoved] = useState<string[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const usedHint = removed.length > 0 || hint !== null;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const pick = useCallback(
    (opt: string) => {
      if (locked || chosen || removed.includes(opt)) return;
      setChosen(opt);
      onAnswer({ correct: opt === card.back, ms: performance.now() - started.current, usedHint, given: opt, type: 'mcq' });
    },
    [locked, chosen, removed, card.back, onAnswer, usedHint],
  );

  const submitTyped = () => {
    if (locked || chosen !== null || !typed.trim()) return;
    const verdict = matchAnswer(typed, card.back);
    setChosen(typed);
    onAnswer({
      correct: verdict === 'correct',
      close: verdict === 'close',
      ms: performance.now() - started.current,
      usedHint,
      given: typed,
      type: 'typed',
    });
  };

  useEffect(() => {
    if (question.type !== 'mcq') return;
    const on = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= question.options.length) pick(question.options[n - 1]);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [question, pick]);

  const useHint = async () => {
    try {
      await api.spend('hint');
      void refresh();
      sfx.click();
      if (question.type === 'mcq') {
        const wrong = question.options.filter((o) => o !== card.back);
        setRemoved(shuffle(wrong).slice(0, Math.max(1, wrong.length - 1)));
      } else setHint(letterHint(card.back));
    } catch (e) {
      showError(e);
    }
  };

  const answered = chosen !== null;

  return (
    <div className={`question ${compact ? 'compact' : ''}`}>
      <div className="q-type">{question.type === 'mcq' ? 'Choose the answer' : 'Type the answer'}</div>
      <div className="q-front">{card.front}</div>
      {question.type === 'mcq' ? (
        <div className="options">
          {question.options.map((o, i) => {
            let cls = 'option';
            if (removed.includes(o)) cls += ' removed';
            if (answered && o === card.back) cls += ' right';
            else if (answered && o === chosen) cls += ' wrong';
            return (
              <button key={o + i} className={cls} disabled={answered || locked || removed.includes(o)} onClick={() => pick(o)}>
                <span className="opt-key">{i + 1}</span>
                <span>{o}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="typed">
          {hint && <div className="hint-text">💡 {hint}</div>}
          <input
            ref={inputRef}
            className={`input typed-input ${answered ? 'answered' : ''}`}
            placeholder="Your answer…"
            value={typed}
            disabled={answered || locked}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                submitTyped();
              }
            }}
          />
          {!answered && (
            <div className="typed-actions">
              <button
                className="link"
                onClick={() => {
                  setChosen('');
                  onAnswer({ correct: false, ms: performance.now() - started.current, usedHint, given: '', type: 'typed' });
                }}
              >
                I don’t know
              </button>
              <button className="btn primary" disabled={!typed.trim()} onClick={submitTyped}>
                Check
              </button>
            </div>
          )}
        </div>
      )}
      {allowHints && !answered && !usedHint && (
        <button className="btn small ghost hint-btn" disabled={s.profile.hints <= 0} onClick={() => void useHint()} title={s.profile.hints <= 0 ? 'Out of hints. Buy more in the shop.' : undefined}>
          💡 {question.type === 'mcq' ? '50/50' : 'Reveal letters'} ({s.profile.hints})
        </button>
      )}
    </div>
  );
}

// ---------- session bookkeeping ----------

export function useSession(mode: StudyMode, deckId: string | null, scheduled: boolean) {
  const s = useAppState();
  const { announceAchievements, toast, showError } = useApp();
  const [combo, setCombo] = useState(0);
  const tally = useRef({ answers: 0, correct: 0, maxCombo: 0, xp: 0 });
  const [xp, setXp] = useState(0);

  /** Predict XP immediately (shared formula) so feedback feels instant. */
  const predictXp = (card: CardView, o: { correct: boolean; ms: number; usedHint?: boolean; type: 'mcq' | 'typed' | 'flip' }, nextCombo: number) => {
    const raw = xpForAnswer({ correct: o.correct, isNew: scheduled && card.srs.state === 0, combo: nextCombo, ms: o.ms, usedHint: o.usedHint, questionType: o.type, practice: !scheduled });
    return s.doubleXpActive ? raw * 2 : raw;
  };

  const record = async (card: CardView, o: { correct: boolean; ms: number; usedHint?: boolean; type: 'mcq' | 'typed' | 'flip'; rating?: number }) => {
    const nextCombo = o.correct ? combo + 1 : 0;
    setCombo(nextCombo);
    const t = tally.current;
    t.answers++;
    if (o.correct) t.correct++;
    t.maxCombo = Math.max(t.maxCombo, nextCombo);
    try {
      const r = await api.answer(
        { cardId: card.id, correct: o.correct, ms: o.ms, usedHint: o.usedHint, questionType: o.type, rating: o.rating, combo: nextCombo },
        mode,
        scheduled,
      );
      t.xp += r.xp;
      setXp(t.xp);
      announceAchievements(r.newAchievements);
      for (const id of r.questsCompleted) {
        const q = s.profile.quests.list.find((x) => x.id === id);
        toast({ icon: '📜', title: 'Quest complete!', body: q ? `${q.label}. Claim your reward on the home screen.` : undefined, kind: 'success' });
      }
      return r;
    } catch (e) {
      showError(e);
      return null;
    }
  };

  const finish = async (extra: { bossDefeated?: boolean; timeAttackScore?: number; matchMs?: number } = {}): Promise<Reward | null> => {
    const t = tally.current;
    try {
      const reward = await api.complete({ mode, deckId, answers: t.answers, correct: t.correct, maxCombo: t.maxCombo, sessionXp: t.xp, ...extra });
      announceAchievements(reward.newAchievements);
      return reward;
    } catch (e) {
      showError(e);
      return null;
    }
  };

  return { combo, setCombo, xp, tally, record, finish, predictXp };
}

// ---------- HUD bits ----------

export function Hearts({ n, max }: { n: number; max: number }) {
  return (
    <span className="hearts" aria-label={`${n} of ${max} hearts`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < n ? 'heart' : 'heart lost'}>
          ❤️
        </span>
      ))}
    </span>
  );
}

export function ComboMeter({ combo }: { combo: number }) {
  if (combo < 2) return <span className="combo-meter idle">Combo</span>;
  const hot = combo >= 10 ? 'blazing' : combo >= 5 ? 'hot' : '';
  return (
    <span key={combo} className={`combo-meter pop ${hot}`}>
      🔥 {combo}× combo
    </span>
  );
}

export function PlayHeader({ onQuit, children }: { onQuit: () => void; children: React.ReactNode }) {
  return (
    <div className="play-header">
      <button className="icon-btn quit" onClick={onQuit} title="Quit (progress is saved)">
        ✕
      </button>
      {children}
    </div>
  );
}

// ---------- feedback ----------

export function Feedback({
  card,
  outcome,
  xp,
  onContinue,
  onAppeal,
  onExplain,
  appealing,
  appealNote,
}: {
  card: CardView;
  outcome: AnswerOutcome;
  xp: number;
  onContinue: () => void;
  onAppeal?: () => void;
  onExplain: () => void;
  appealing?: boolean;
  appealNote?: string | null;
}) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.key === 'Enter' || e.key === ' ') && !e.repeat && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLButtonElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        onContinue();
      }
    };
    const t = setTimeout(() => window.addEventListener('keydown', on), 50);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', on);
    };
  }, [onContinue]);

  return (
    <div className={`feedback ${outcome.correct ? 'good' : 'bad'}`}>
      <div className="feedback-head">
        <span className="feedback-title">{outcome.correct ? pickPraise() : outcome.given ? 'Not quite' : 'Here’s the answer'}</span>
        {xp > 0 && <span className="feedback-xp">+{xp} XP</span>}
      </div>
      {!outcome.correct && (
        <div className="feedback-answer">
          <span className="muted small">Correct answer</span>
          <div>{card.back}</div>
        </div>
      )}
      {outcome.type === 'typed' && outcome.correct && outcome.given.trim().toLowerCase() !== card.back.trim().toLowerCase() && (
        <div className="feedback-answer">
          <span className="muted small">Exact answer</span>
          <div>{card.back}</div>
        </div>
      )}
      {card.explanation && <p className="feedback-expl">{card.explanation}</p>}
      {appealNote && <p className="feedback-expl">⚖️ {appealNote}</p>}
      <div className="feedback-actions">
        <button className="btn ghost small" onClick={onExplain}>
          💬 Ask Claude
        </button>
        {onAppeal && !outcome.correct && outcome.type === 'typed' && outcome.given.trim() && (
          <button className="btn ghost small" disabled={appealing} onClick={onAppeal}>
            {appealing ? (
              <>
                <Spinner /> Claude is judging…
              </>
            ) : (
              '⚖️ I was right: ask Claude'
            )}
          </button>
        )}
        <div className="grow" />
        <button className={`btn big ${outcome.correct ? 'good' : 'primary'}`} onClick={onContinue}>
          Continue ↵
        </button>
      </div>
    </div>
  );
}

const PRAISE = ['Nice!', 'Correct!', 'Nailed it!', 'Brilliant!', 'You got it!', 'Spot on!', 'Sharp!', 'Yes!'];
function pickPraise() {
  return PRAISE[Math.floor(Math.random() * PRAISE.length)];
}

export function celebrateCorrect(combo: number, xp: number, anchor: HTMLElement | null) {
  sfx.correct(combo);
  if (xp > 0) floatText(`+${xp} XP`, anchor);
  if (combo > 0 && combo % 5 === 0) {
    floatText(`🔥 ${combo}× combo!`, anchor ? { x: anchor.getBoundingClientRect().left + 80, y: anchor.getBoundingClientRect().top - 30 } : null, 'var(--warn)');
    confetti(60);
  }
}

// ---------- results ----------

export function Results({
  reward,
  title,
  subtitle,
  stats,
  onAgain,
  againLabel = 'Play again',
  deckId,
}: {
  reward: Reward | null;
  title: string;
  subtitle?: string;
  stats: { label: string; value: string | number }[];
  onAgain?: () => void;
  againLabel?: string;
  deckId: string | null;
}) {
  const { refresh } = useApp();
  const s = useAppState();
  const levelUp = reward && reward.levelAfter > reward.levelBefore;
  const streakUp = reward && reward.streakAfter > reward.streakBefore;

  useEffect(() => {
    void refresh();
    if (levelUp) {
      sfx.levelUp();
      confetti(220);
    } else if (reward && reward.totalXp > 0) {
      sfx.victory();
      confetti(90);
    }
  }, []);

  const achievements = useMemo(() => (reward?.newAchievements ?? []).map((id) => ACHIEVEMENTS.find((a) => a.id === id)).filter(Boolean), [reward]);

  return (
    <div className="results">
      <h1>{title}</h1>
      {subtitle && <p className="muted">{subtitle}</p>}
      {reward && (
        <div className="results-xp">
          <span className="results-xp-num">
            +<CountUp value={reward.totalXp} /> XP
          </span>
          {reward.coins > 0 && <span className="results-coins">🪙 +{reward.coins}</span>}
        </div>
      )}
      <div className="results-stats">
        {stats.map((st) => (
          <div key={st.label} className="stat-tile">
            <div className="stat-value">{st.value}</div>
            <div className="muted small">{st.label}</div>
          </div>
        ))}
      </div>
      {reward && reward.bonusReasons.length > 0 && (
        <ul className="bonus-list">
          {reward.bonusReasons.map((b) => (
            <li key={b}>✨ {b}</li>
          ))}
        </ul>
      )}
      {levelUp && (
        <div className="banner levelup">
          ⭐ Level up! You reached <b>level {reward!.levelAfter}</b>
        </div>
      )}
      {streakUp && (
        <div className="banner streak">
          🔥 Streak extended to <b>{reward!.streakAfter} day{reward!.streakAfter === 1 ? '' : 's'}</b>
        </div>
      )}
      {reward?.goalReached && <div className="banner goal">🎯 Daily goal reached! Your chest is waiting on the home screen.</div>}
      {reward?.newRecord && <div className="banner record">🏆 New personal record!</div>}
      {achievements.map((a) => (
        <div key={a!.id} className="banner achievement">
          {a!.icon} Achievement unlocked: <b>{a!.name}</b>
        </div>
      ))}
      <div className="results-actions">
        <button className="btn big" onClick={() => navigate(deckId ? `/deck/${deckId}` : '/')}>
          {deckId ? 'Back to deck' : 'Home'}
        </button>
        {onAgain && (
          <button className="btn primary big" onClick={onAgain}>
            {againLabel}
          </button>
        )}
      </div>
      <p className="muted small">Today: {s.todayXp} / {s.settings.dailyGoalXp} XP</p>
    </div>
  );
}
