import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ACHIEVEMENTS, SHOP, letterHint, matchAnswer, xpForAnswer } from '../../shared/game.ts';
import type { Reward, StudyMode } from '../../shared/types.ts';
import { api, type CardView } from '../api.ts';
import { navigate, useApp, useAppState } from '../app-context.tsx';
import { Mascot } from '../components/Mascot.tsx';
import { CodeBlock } from '../components/Code.tsx';
import { Markdown } from '../components/Markdown.tsx';
import { CountUp, Spinner } from '../components/shared.tsx';
import { XIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { Tip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { confetti, floatText } from '../fx.ts';
import { sfx } from '../sound.ts';
import { type Scope, scopeBackLabel, scopeDeckId, scopeHome } from '../scope.ts';

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
  // Exam-style questions always show every option the author wrote.
  if (card.mcq) return { type: 'mcq', options: shuffle([card.back, ...card.distractors.filter((d) => d && d !== card.back)]) };
  let wrong = card.distractors.filter((d) => d && d !== card.back);
  if (wrong.length < 3) {
    const extra = shuffle(pool.filter((b) => b !== card.back && !wrong.includes(b)));
    wrong = [...wrong, ...extra].slice(0, 3);
  }
  const canMcq = wrong.length >= 2;
  const stable = card.srs.state === 2 && card.srs.stability >= 3;
  // Math and code are hard to type, so those answers stay multiple choice.
  const typable = card.back.length <= 80 && !/[$`\\]/.test(card.back);
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
  const [cardHint, setCardHint] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const usedHint = removed.length > 0 || hint !== null || cardHint;

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
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      // Keys 1-9 pick the first nine options and 0 picks the tenth.
      const n = e.key === '0' ? 10 : Number(e.key);
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
  // Long or numerous options read better as a left-aligned list than as centered pills.
  const listOptions = question.type === 'mcq' && (question.options.length > 4 || question.options.some((o) => o.length > 48 || /[`$\n]/.test(o)));
  const rich = !!(card.mcq || card.code || card.title);

  return (
    <div className="flex animate-fade flex-col gap-6">
      <div className="animate-card-in rounded-lg border-[3px] border-primary bg-card px-8 pt-6 pb-8 shadow-[0_4px_0_var(--accent-soft-strong)] max-[560px]:px-5">
        <div className="mb-2 flex flex-wrap items-center gap-3 font-display text-sm font-semibold text-brand-ink">
          {question.type === 'mcq' ? '🎯 Choose the answer' : '⌨️ Type the answer'}
          {card.title && (
            <Badge variant="brand" className="text-sm">
              {card.title}
            </Badge>
          )}
        </div>
        <Markdown
          className={cn(
            'font-display font-semibold',
            rich ? (compact ? 'text-md leading-snug' : 'text-lg leading-snug') : compact ? 'text-lg leading-tight' : 'text-[30px] leading-tight',
          )}
          text={card.front}
        />
        {card.code && <CodeBlock code={card.code} lang={card.codeLang} />}
        {card.hint && !answered && (
          <button
            className={cn(
              'mt-4 inline-flex items-baseline gap-2 rounded-full bg-warning-soft px-3 py-1 text-left text-sm font-semibold text-warning-ink',
              cardHint && 'cursor-default rounded-md font-medium',
            )}
            onClick={() => setCardHint(true)}
            disabled={cardHint}
          >
            💡 {cardHint ? <Markdown inline text={card.hint} /> : 'Show hint'}
          </button>
        )}
      </div>
      {question.type === 'mcq' ? (
        <div className="grid grid-cols-1 gap-3">
          {question.options.map((o, i) => {
            const isRemoved = removed.includes(o);
            const right = answered && o === card.back;
            const wrong = answered && !right && o === chosen;
            return (
              <button
                key={o + i}
                data-quiet
                style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
                className={cn(
                  'relative flex min-h-[60px] animate-[rise-in_0.35s_var(--bounce)_backwards] items-center justify-center rounded-full border-2 border-input bg-card px-12 py-3 text-center text-md font-semibold text-foreground shadow-ledge transition-[transform,border-color,background-color,opacity] duration-150 ease-bounce hover:not-disabled:-translate-y-0.5 hover:not-disabled:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none active:not-disabled:translate-y-0.5 active:not-disabled:shadow-none disabled:cursor-default',
                  listOptions && 'min-h-[52px] justify-start rounded-md pr-4 pl-14 text-left font-sans text-base font-medium',
                  isRemoved && 'opacity-20',
                  right && 'md-tinted animate-pop border-success bg-success-soft text-success-ink',
                  wrong && 'md-tinted animate-shake border-transparent bg-destructive-soft text-destructive',
                )}
                disabled={answered || locked || isRemoved}
                onClick={() => pick(o)}
              >
                <span className="absolute left-4 grid size-[26px] place-items-center rounded-full bg-muted font-display text-sm font-semibold text-muted-foreground">{i === 9 ? 0 : i + 1}</span>
                <Markdown inline text={o} />
              </button>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {hint && <div className="font-mono text-lg tracking-[0.12em] text-warning-ink">💡 {hint}</div>}
          <Input
            ref={inputRef}
            className="h-15 rounded-full px-6 text-lg"
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
            <div className="flex items-center justify-between">
              <Button
                variant="link"
                onClick={() => {
                  setChosen('');
                  onAnswer({ correct: false, ms: performance.now() - started.current, usedHint, given: '', type: 'typed' });
                }}
              >
                I don’t know
              </Button>
              <Button variant="default" disabled={!typed.trim()} onClick={submitTyped}>
                Check
              </Button>
            </div>
          )}
        </div>
      )}
      {allowHints && !answered && !usedHint && (
        <Tip label={s.profile.hints <= 0 ? 'Out of hints. Buy more in the shop.' : undefined}>
          <span className="self-start">
            <Button size="sm" variant="ghost" disabled={s.profile.hints <= 0} onClick={() => void useHint()}>
              💡 {question.type === 'mcq' ? '50/50' : 'Reveal letters'} ({s.profile.hints})
            </Button>
          </span>
        </Tip>
      )}
    </div>
  );
}

// ---------- session bookkeeping ----------

export function useSession(mode: StudyMode, scope: Scope, scheduled: boolean) {
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
      const reward = await api.complete({ mode, deckId: scopeDeckId(scope), answers: t.answers, correct: t.correct, maxCombo: t.maxCombo, sessionXp: t.xp, ...extra });
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
    <span className="inline-flex gap-[3px] text-[20px]" aria-label={`${n} of ${max} hearts`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={cn(i >= n && 'opacity-25 grayscale')}>
          ❤️
        </span>
      ))}
    </span>
  );
}

const comboPill = 'inline-flex h-7 items-center gap-1 rounded-full px-3 font-display text-sm font-semibold';

export function ComboMeter({ combo }: { combo: number }) {
  if (combo < 2) return <span className={cn(comboPill, 'bg-muted text-muted-foreground opacity-60')}>🔥 Combo</span>;
  return (
    <span key={combo} className={cn(comboPill, 'animate-pop bg-warning-soft text-warning-ink')}>
      🔥 {combo}× combo
    </span>
  );
}

/** The column every study mode plays in. */
export function PlayShell({ wide, center, children }: { wide?: boolean; center?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn('route-in mx-auto min-h-screen px-6 pt-4 pb-[180px] max-[560px]:px-4', wide ? 'max-w-[960px]' : 'max-w-[720px]', center && 'flex items-center justify-center')}>
      {children}
    </div>
  );
}

export function PlayHeader({ onQuit, children }: { onQuit: () => void; children: React.ReactNode }) {
  return (
    <div className="mb-2 flex h-10 items-center gap-4">
      <Tip label="Quit (progress is saved)">
        <Button variant="plain" size="icon" className="-ml-2" aria-label="Quit" onClick={onQuit}>
          <XIcon />
        </Button>
      </Tip>
      {children}
    </div>
  );
}

/** The row under the play header: combo, chips and session XP. */
export function PlaySub({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 flex min-h-7 flex-wrap items-center gap-4 text-sm text-muted-foreground">{children}</div>;
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

  const good = outcome.correct;
  return (
    <div
      className={cn(
        'fixed inset-x-0 bottom-0 z-30 max-h-[60vh] animate-slideup overflow-auto border-t-[3px] px-[max(24px,calc((100vw-720px)/2+24px))] py-6',
        good ? 'border-success bg-success-soft' : 'border-destructive bg-destructive-soft',
      )}
    >
      <div className="flex items-baseline justify-between">
        <span className={cn('font-display text-xl font-bold', good ? 'text-success' : 'text-destructive')}>{good ? pickPraise() : outcome.given ? 'Not quite' : 'Here’s the answer'}</span>
        {xp > 0 && <span className="rounded-full bg-card px-3 py-0.5 font-display text-md font-bold text-success">+{xp} XP</span>}
      </div>
      {!good && (
        <div className="my-3 text-md font-semibold">
          <span className="block text-xs font-normal text-muted-foreground">Correct answer</span>
          <Markdown text={card.back} />
        </div>
      )}
      {outcome.type === 'typed' && good && outcome.given.trim().toLowerCase() !== card.back.trim().toLowerCase() && (
        <div className="my-3 text-md font-semibold">
          <span className="block text-xs font-normal text-muted-foreground">Exact answer</span>
          <Markdown text={card.back} />
        </div>
      )}
      {card.explanation && <Markdown className="my-2 text-muted-foreground" text={card.explanation} />}
      {appealNote && (
        <div className="my-2 flex gap-2 text-muted-foreground">
          <span aria-hidden="true">⚖️</span>
          <Markdown className="flex-1" text={appealNote} />
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onExplain}>
          💬 Ask Claude
        </Button>
        {onAppeal && !good && outcome.type === 'typed' && outcome.given.trim() && (
          <Button variant="ghost" size="sm" disabled={appealing} onClick={onAppeal}>
            {appealing ? (
              <>
                <Spinner /> Claude is judging…
              </>
            ) : (
              '⚖️ I was right: ask Claude'
            )}
          </Button>
        )}
        <div className="flex-1" />
        <Button size="lg" variant={good ? 'success' : 'default'} onClick={onContinue}>
          Continue <Kbd>Enter</Kbd>
        </Button>
      </div>
    </div>
  );
}

const PRAISE = ['Nice! 🎉', 'Correct! ✨', 'Nailed it! 🙌', 'Brilliant! 🌟', 'You got it! 💪', 'Spot on! 🎯', 'Sharp! ⚡', 'Yes! 🥳'];
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
  scope,
}: {
  reward: Reward | null;
  title: string;
  subtitle?: string;
  stats: { label: string; value: string | number }[];
  onAgain?: () => void;
  againLabel?: string;
  scope: Scope;
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
    <ResultsColumn>
      <Mascot mood={reward && reward.totalXp > 0 ? 'wow' : 'happy'} size={130} />
      <h1>{title}</h1>
      {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
      {reward && (
        <div className="flex items-baseline gap-4 font-display font-bold">
          <span className="text-[56px] text-primary">
            +<CountUp value={reward.totalXp} delay={450} duration={1100} sound /> XP
          </span>
          {reward.coins > 0 && <span className="inline-flex items-center gap-1.5 text-xl text-warning-ink">🪙 +{reward.coins}</span>}
        </div>
      )}
      <div className="flex flex-wrap justify-center gap-3 max-[560px]:w-full max-[560px]:flex-col">
        {stats.map((st, i) => (
          <div key={st.label} className="min-w-[130px] animate-pop-in rounded-lg border-2 border-border bg-card px-6 py-3 shadow-ledge" style={{ animationDelay: `${i * 80}ms` }}>
            <div className="font-display text-xl font-bold tabular-nums">{st.value}</div>
            <div className="text-sm text-muted-foreground">{st.label}</div>
          </div>
        ))}
      </div>
      {reward && reward.bonusReasons.length > 0 && (
        <ul className="font-semibold text-brand-ink">
          {reward.bonusReasons.map((b) => (
            <li key={b}>✨ {b}</li>
          ))}
        </ul>
      )}
      {levelUp && (
        <Banner>
          ⭐ Level up! You reached <b>level {reward!.levelAfter}</b>
          {reward!.levelCoins > 0 && <> · 🪙 +{reward!.levelCoins}</>}
        </Banner>
      )}
      {reward?.rank && (
        <Banner>
          {reward.rank.icon} New rank: <b>{reward.rank.title}</b>
        </Banner>
      )}
      {reward?.unlocks.map((id) => {
        const item = SHOP.find((i) => i.id === id);
        return item ? (
          <Banner key={id} tone="success" href="#/shop">
            {item.icon} Unlocked {item.kind === 'hat' ? 'a hat for Flicky' : `a new ${item.kind}`}: <b>{item.name}</b>
          </Banner>
        ) : null;
      })}
      {streakUp && (
        <Banner tone="warning">
          🔥 Streak extended to <b>{reward!.streakAfter} day{reward!.streakAfter === 1 ? '' : 's'}</b>
        </Banner>
      )}
      {reward?.goalReached && <Banner tone="success">🎯 Daily goal reached! Your chest is waiting on the home screen.</Banner>}
      {reward?.newRecord && <Banner tone="warning">🏆 New personal record!</Banner>}
      {achievements.slice(0, achievements.length > 4 ? 3 : 4).map((a) => (
        <Banner key={a!.id} tone="warning">
          {a!.icon} Achievement unlocked: <b>{a!.name}</b> · 🪙 +{a!.coins}
        </Banner>
      ))}
      {achievements.length > 4 && (
        <Banner tone="warning" href="#/achievements">
          🏆 And {achievements.length - 3} more trophies
        </Banner>
      )}
      <ResultsActions>
        <Button size="lg" onClick={() => navigate(scopeHome(scope))}>
          {scopeBackLabel(scope)}
        </Button>
        {onAgain && (
          <Button variant="default" size="lg" onClick={onAgain}>
            {againLabel}
          </Button>
        )}
      </ResultsActions>
      <p className="text-sm text-muted-foreground">
        Today{' '}
        <span className="num">
          {s.todayXp} / {s.settings.dailyGoalXp}
        </span>{' '}
        XP
      </p>
    </ResultsColumn>
  );
}

/** A centered column whose lines arrive one after another: results, intros, game over. */
export function ResultsColumn({ children }: { children: React.ReactNode }) {
  return <div className="stagger flex flex-col items-center gap-4 py-8 text-center">{children}</div>;
}

export function ResultsActions({ children }: { children: React.ReactNode }) {
  return <div className="mt-2 flex flex-wrap justify-center gap-2">{children}</div>;
}

const BANNER_TONE = {
  brand: 'border-brand-soft-strong bg-accent',
  warning: 'border-[color-mix(in_srgb,var(--warn)_40%,var(--surface))] bg-warning-soft',
  success: 'border-[color-mix(in_srgb,var(--good)_35%,var(--surface))] bg-success-soft',
};

function Banner({ tone = 'brand', href, children }: { tone?: keyof typeof BANNER_TONE; href?: string; children: React.ReactNode }) {
  const cls = cn('block w-[min(520px,100%)] rounded-full border-2 px-6 py-3 text-center font-semibold text-foreground no-underline', BANNER_TONE[tone]);
  return href ? (
    <a className={cls} href={href}>
      {children}
    </a>
  ) : (
    <div className={cls}>{children}</div>
  );
}
