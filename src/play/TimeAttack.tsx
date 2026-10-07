import { useEffect, useMemo, useRef, useState } from 'react';
import type { Reward } from '../../shared/types.ts';
import { api, type StudyData } from '../api.ts';
import { navigate, useApp, useAppState } from '../app-context.tsx';
import { EmptyState, Spinner } from '../components/shared.tsx';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { floatText, shake } from '../fx.ts';
import { sfx } from '../sound.ts';
import { ComboMeter, PlayHeader, PlayShell, PlaySub, QuestionView, Results, ResultsActions, ResultsColumn, buildQuestion, useSession, type AnswerOutcome } from './common.tsx';
import { type Scope, scopeBackLabel, scopeHome } from '../scope.ts';

const DURATION = 60_000;
const WRONG_PENALTY = 3_000;
const CORRECT_BONUS = 1_000;

export function TimeAttack({ scope }: { scope: Scope }) {
  const [run, setRun] = useState(0);
  return <TimeAttackRun key={run} scope={scope} onRestart={() => setRun((r) => r + 1)} />;
}

function TimeAttackRun({ scope, onRestart }: { scope: Scope; onRestart: () => void }) {
  const s = useAppState();
  const { showError } = useApp();
  const session = useSession('timeattack', scope, false);
  const [data, setData] = useState<StudyData | null>(null);
  const [started, setStarted] = useState(false);
  const [pos, setPos] = useState(0);
  const [score, setScore] = useState(0);
  const [deadline, setDeadline] = useState(0);
  const [now, setNow] = useState(performance.now());
  const [locked, setLocked] = useState(false);
  const [over, setOver] = useState(false);
  const [reward, setReward] = useState<Reward | null>(null);
  const pending = useRef<Promise<unknown>[]>([]);
  const stageRef = useRef<HTMLDivElement>(null);
  const lastTick = useRef(0);

  useEffect(() => {
    api.study('timeattack', scope).then(setData).catch(showError);
  }, [scope, showError]);

  const remaining = Math.max(0, deadline - now);

  useEffect(() => {
    if (!started || over) return;
    const id = setInterval(() => {
      const t = performance.now();
      setNow(t);
      const left = deadline - t;
      if (left <= 10_000 && Math.ceil(left / 1000) !== lastTick.current) {
        lastTick.current = Math.ceil(left / 1000);
        sfx.tick();
      }
      if (left <= 0) setOver(true);
    }, 100);
    return () => clearInterval(id);
  }, [started, over, deadline]);

  useEffect(() => {
    if (!over) return;
    void (async () => {
      await Promise.all(pending.current);
      setReward(await session.finish({ timeAttackScore: score }));
    })();
    // Only once when the clock runs out.
  }, [over]);

  const card = data?.cards.length ? data.cards[pos % data.cards.length] : null;
  const question = useMemo(() => (card && data ? buildQuestion(card, data.pool, { mcqOnly: true }) : null), [card, data, pos]);

  const onAnswer = (o: AnswerOutcome) => {
    if (!card || over) return;
    setLocked(true);
    pending.current.push(session.record(card, { correct: o.correct, ms: o.ms, type: 'mcq' }));
    if (o.correct) {
      sfx.correct(session.combo + 1);
      setScore((x) => x + 1);
      setDeadline((d) => d + CORRECT_BONUS);
      floatText('+1s', stageRef.current, 'var(--good)');
    } else {
      sfx.wrong();
      shake(stageRef.current);
      setDeadline((d) => d - WRONG_PENALTY);
      floatText('−3s', stageRef.current, 'var(--bad)');
    }
    setTimeout(
      () => {
        setPos((p) => p + 1);
        setLocked(false);
      },
      o.correct ? 250 : 700,
    );
  };

  if (!data) {
    return (
      <PlayShell center>
        <Spinner className="size-6" />
      </PlayShell>
    );
  }

  if (data.cards.length === 0) {
    return (
      <PlayShell center>
        <EmptyState mood="sleepy" title="No cards to play yet" description="Add some cards and study them first, then come back.">
          <Button variant="default" onClick={() => navigate(scopeHome(scope))}>
            {scopeBackLabel(scope)}
          </Button>
        </EmptyState>
      </PlayShell>
    );
  }

  if (over) {
    return (
      <PlayShell center={!reward}>
        {reward ? (
          <Results
            reward={reward}
            title={`⏱️ Score: ${score}`}
            subtitle={reward.newRecord ? undefined : `Personal best: ${s.profile.stats.timeAttackBest}`}
            scope={scope}
            stats={[
              { label: 'Correct', value: score },
              { label: 'Answered', value: session.tally.current.answers },
              { label: 'Best combo', value: `${session.tally.current.maxCombo}×` },
            ]}
            onAgain={onRestart}
          />
        ) : (
          <Spinner className="size-6" />
        )}
      </PlayShell>
    );
  }

  if (!started) {
    return (
      <PlayShell>
        <ResultsColumn>
          <div className="animate-bob text-[110px] leading-none">⏱️</div>
          <h1>Time Attack</h1>
          <p className="text-muted-foreground">60 seconds on the clock. Correct answers add 1s, wrong ones cost 3s. Keys 1–4 answer fast.</p>
          <p>
            Personal best: <b>{s.profile.stats.timeAttackBest}</b>
          </p>
          <ResultsActions>
            <Button size="lg" onClick={() => navigate(scopeHome(scope))}>
              Back
            </Button>
            <Button
              variant="default"
              size="lg"
              onClick={() => {
                const t = performance.now();
                setNow(t);
                setDeadline(t + DURATION);
                setStarted(true);
              }}
            >
              Start!
            </Button>
          </ResultsActions>
        </ResultsColumn>
      </PlayShell>
    );
  }

  const pct = remaining / DURATION;
  const low = remaining < 10_000;
  return (
    <PlayShell>
      <PlayHeader onQuit={() => setOver(true)}>
        <div className="h-3.5 flex-1 overflow-hidden rounded-full bg-track">
          <div className={cn('h-full rounded-full transition-[width] duration-100 ease-linear', low ? 'bg-destructive' : 'bg-success')} style={{ width: `${Math.min(100, pct * 100)}%` }} />
        </div>
        <span className={cn('min-w-[70px] text-right font-display text-xl font-bold tabular-nums', low && 'text-destructive')}>{(remaining / 1000).toFixed(1)}s</span>
      </PlayHeader>
      <PlaySub>
        <span className="font-display text-xl font-bold text-foreground">Score {score}</span>
        <ComboMeter combo={session.combo} />
      </PlaySub>
      <div className="mt-6" ref={stageRef}>
        {card && question && <QuestionView key={pos} card={card} question={question} onAnswer={onAnswer} locked={locked} allowHints={false} compact />}
      </div>
    </PlayShell>
  );
}
