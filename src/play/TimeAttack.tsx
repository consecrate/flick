import { useEffect, useMemo, useRef, useState } from 'react';
import type { Reward } from '../../shared/types.ts';
import { api, type StudyData } from '../api.ts';
import { navigate, useApp, useAppState } from '../app-context.tsx';
import { Spinner } from '../components/ui.tsx';
import { floatText, shake } from '../fx.ts';
import { sfx } from '../sound.ts';
import { ComboMeter, PlayHeader, QuestionView, Results, buildQuestion, useSession, type AnswerOutcome } from './common.tsx';

const DURATION = 60_000;
const WRONG_PENALTY = 3_000;
const CORRECT_BONUS = 1_000;

export function TimeAttack({ deckId }: { deckId: string | null }) {
  const [run, setRun] = useState(0);
  return <TimeAttackRun key={run} deckId={deckId} onRestart={() => setRun((r) => r + 1)} />;
}

function TimeAttackRun({ deckId, onRestart }: { deckId: string | null; onRestart: () => void }) {
  const s = useAppState();
  const { showError } = useApp();
  const session = useSession('timeattack', deckId, false);
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
    api.study('timeattack', deckId).then(setData).catch(showError);
  }, [deckId, showError]);

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
      <div className="play center">
        <Spinner />
      </div>
    );
  }

  if (over) {
    return (
      <div className="play">
        {reward ? (
          <Results
            reward={reward}
            title={`Score: ${score}`}
            subtitle={reward.newRecord ? undefined : `Personal best: ${s.profile.stats.timeAttackBest}`}
            deckId={deckId}
            stats={[
              { label: 'Correct', value: score },
              { label: 'Answered', value: session.tally.current.answers },
              { label: 'Best combo', value: `${session.tally.current.maxCombo}×` },
            ]}
            onAgain={onRestart}
          />
        ) : (
          <div className="center">
            <Spinner />
          </div>
        )}
      </div>
    );
  }

  if (!started) {
    return (
      <div className="play">
        <div className="results">
          <h1>Time Attack</h1>
          <p className="muted">
            60 seconds on the clock. Correct answers add 1s, wrong ones cost 3s. Keys 1–4 answer fast.
          </p>
          <p>
            Personal best: <b>{s.profile.stats.timeAttackBest}</b>
          </p>
          <div className="results-actions">
            <button className="btn big" onClick={() => navigate(deckId ? `/deck/${deckId}` : '/')}>
              Back
            </button>
            <button
              className="btn primary big"
              onClick={() => {
                const t = performance.now();
                setNow(t);
                setDeadline(t + DURATION);
                setStarted(true);
              }}
            >
              Start
            </button>
          </div>
        </div>
      </div>
    );
  }

  const pct = remaining / DURATION;
  return (
    <div className="play">
      <PlayHeader onQuit={() => setOver(true)}>
        <div className="timebar grow">
          <div className={`timebar-fill ${remaining < 10_000 ? 'low' : ''}`} style={{ width: `${Math.min(100, pct * 100)}%` }} />
        </div>
        <span className={`timer ${remaining < 10_000 ? 'low' : ''}`}>{(remaining / 1000).toFixed(1)}s</span>
      </PlayHeader>
      <div className="play-sub">
        <span className="score">Score {score}</span>
        <ComboMeter combo={session.combo} />
      </div>
      <div className="stage" ref={stageRef}>
        {card && question && <QuestionView key={pos} card={card} question={question} onAnswer={onAnswer} locked={locked} allowHints={false} compact />}
      </div>
    </div>
  );
}
