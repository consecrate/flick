import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QUIZ_HEARTS, REVIVE_COST } from '../../shared/game.ts';
import type { Reward } from '../../shared/types.ts';
import { api, type CardView, type StudyData } from '../api.ts';
import { navigate, useApp, useAppState } from '../app-context.tsx';
import { ExplainModal } from '../components/ExplainModal.tsx';
import { Mascot } from '../components/Mascot.tsx';
import { EmptyState, ProgressBar, Spinner } from '../components/ui.tsx';
import { shake } from '../fx.ts';
import { sfx } from '../sound.ts';
import {
  ComboMeter,
  Feedback,
  Hearts,
  PlayHeader,
  QuestionView,
  Results,
  buildQuestion,
  celebrateCorrect,
  useSession,
  type AnswerOutcome,
} from './common.tsx';

type Phase = 'loading' | 'empty' | 'question' | 'feedback' | 'gameover' | 'done';

export function Quiz({ deckId }: { deckId: string | null }) {
  const [run, setRun] = useState(0);
  return <QuizRun key={run} deckId={deckId} onRestart={() => setRun((r) => r + 1)} />;
}

function QuizRun({ deckId, onRestart }: { deckId: string | null; onRestart: () => void }) {
  const s = useAppState();
  const { showError, refresh } = useApp();
  const session = useSession('quiz', deckId, true);
  const [data, setData] = useState<StudyData | null>(null);
  const [queue, setQueue] = useState<CardView[]>([]);
  const [pos, setPos] = useState(0);
  const [phase, setPhase] = useState<Phase>('loading');
  const [hearts, setHearts] = useState(QUIZ_HEARTS);
  const [outcome, setOutcome] = useState<AnswerOutcome | null>(null);
  const [predicted, setPredicted] = useState(0);
  const [appealing, setAppealing] = useState(false);
  const [appealNote, setAppealNote] = useState<string | null>(null);
  const [explain, setExplain] = useState(false);
  const [reward, setReward] = useState<Reward | null>(null);
  const requeued = useRef(new Set<string>());
  const pending = useRef<Promise<unknown>[]>([]);
  const stageRef = useRef<HTMLDivElement>(null);
  const [ahead, setAhead] = useState(false);

  const load = useCallback(
    async (practiceAhead = false) => {
      setPhase('loading');
      try {
        const d = await api.study('quiz', deckId, { ahead: practiceAhead });
        setData(d);
        setQueue(d.cards);
        setAhead(d.ahead);
        setPhase(d.cards.length ? 'question' : 'empty');
      } catch (e) {
        showError(e);
        navigate(deckId ? `/deck/${deckId}` : '/');
      }
    },
    [deckId, showError],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const card = queue[pos];
  const question = useMemo(() => (card && data ? buildQuestion(card, data.pool) : null), [card, data, pos]);

  const finish = async () => {
    await Promise.all(pending.current);
    setReward(await session.finish());
    setPhase('done');
  };

  const onAnswer = async (o: AnswerOutcome) => {
    setOutcome(o);
    setAppealNote(null);
    setPhase('feedback');
    if (o.correct) {
      const xp = session.predictXp(card, o, session.combo + 1);
      setPredicted(xp);
      celebrateCorrect(session.combo + 1, xp, stageRef.current);
    } else if (o.close) {
      // Near miss: let Claude decide before taking a heart.
      setPredicted(0);
      await appeal(o);
    } else {
      setPredicted(session.predictXp(card, o, 0));
      loseHeart();
    }
  };

  const loseHeart = () => {
    sfx.wrong();
    shake(stageRef.current);
    setHearts((h) => Math.max(0, h - 1));
  };

  const appeal = async (o: AnswerOutcome) => {
    setAppealing(true);
    try {
      const v = await api.grade(card.id, o.given);
      setAppealNote(v.feedback);
      if (v.correct) {
        const fixed = { ...o, correct: true };
        setOutcome(fixed);
        const xp = session.predictXp(card, fixed, session.combo + 1);
        setPredicted(xp);
        celebrateCorrect(session.combo + 1, xp, stageRef.current);
        // Give back the heart if one was taken for this answer.
        if (!o.close) setHearts((h) => Math.min(QUIZ_HEARTS, h + 1));
      } else if (o.close) {
        setPredicted(session.predictXp(card, o, 0));
        loseHeart();
      }
    } catch (e) {
      showError(e);
      if (o.close) loseHeart();
    } finally {
      setAppealing(false);
    }
  };

  const next = () => {
    if (!outcome || appealing) return;
    pending.current.push(session.record(card, { correct: outcome.correct, ms: outcome.ms, usedHint: outcome.usedHint, type: outcome.type }));
    let nextQueue = queue;
    if (!outcome.correct && !requeued.current.has(card.id)) {
      // Missed cards come back once at the end of the session.
      requeued.current.add(card.id);
      nextQueue = [...queue, card];
      setQueue(nextQueue);
    }
    setOutcome(null);
    if (hearts <= 0) {
      sfx.gameOver();
      setPhase('gameover');
      return;
    }
    if (pos + 1 >= nextQueue.length) {
      void finish();
      return;
    }
    setPos(pos + 1);
    setPhase('question');
  };

  const revive = async () => {
    try {
      await api.spend('revive');
      sfx.unlock();
      void refresh();
      setHearts(QUIZ_HEARTS);
      if (pos + 1 >= queue.length) void finish();
      else {
        setPos(pos + 1);
        setPhase('question');
      }
    } catch (e) {
      showError(e);
    }
  };

  const quit = async () => {
    if (session.tally.current.answers > 0) await finish();
    else navigate(deckId ? `/deck/${deckId}` : '/');
  };

  if (phase === 'loading') {
    return (
      <div className="play center">
        <Spinner />
      </div>
    );
  }

  if (phase === 'empty') {
    return (
      <div className="play">
        <EmptyState mood="sleepy" title="All caught up!">
          <p className="muted">FSRS says nothing is due right now. Coming back later is the most efficient way to remember.</p>
          <div className="row center-row">
            <button className="btn" onClick={() => navigate(deckId ? `/deck/${deckId}` : '/')}>
              Back
            </button>
            <button className="btn primary" onClick={() => void load(true)}>
              Practice ahead anyway
            </button>
          </div>
          <p className="muted small">Or play an arcade game for XP without touching your schedule.</p>
        </EmptyState>
      </div>
    );
  }

  if (phase === 'done') {
    const t = session.tally.current;
    return (
      <div className="play">
        <Results
          reward={reward}
          title={t.correct === t.answers && t.answers >= 5 ? '💎 Flawless!' : 'Session complete!'}
          subtitle={ahead ? 'Practiced ahead of schedule.' : undefined}
          deckId={deckId}
          stats={[
            { label: 'Accuracy', value: t.answers ? `${Math.round((t.correct / t.answers) * 100)}%` : '–' },
            { label: 'Answered', value: t.answers },
            { label: 'Best combo', value: `${t.maxCombo}×` },
          ]}
          onAgain={onRestart}
          againLabel="Keep going"
        />
      </div>
    );
  }

  if (phase === 'gameover') {
    return (
      <div className="play">
        <div className="results">
          <Mascot mood="sad" size={130} />
          <h1>Out of hearts</h1>
          <p className="muted">Your progress so far is saved. Revive to finish the set, or wrap up here.</p>
          <div className="results-actions">
            <button className="btn big" onClick={() => void finish()}>
              End session
            </button>
            <button className="btn primary big" disabled={s.profile.coins < REVIVE_COST} onClick={() => void revive()}>
              ❤️ Revive for 🪙 {REVIVE_COST}
            </button>
          </div>
          {s.profile.coins < REVIVE_COST && <p className="muted small">You need {REVIVE_COST} coins to revive.</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="play">
      <PlayHeader onQuit={() => void quit()}>
        <ProgressBar value={pos} max={queue.length} height={14} className="grow" />
        <Hearts n={hearts} max={QUIZ_HEARTS} />
      </PlayHeader>
      <div className="play-sub">
        <ComboMeter combo={session.combo} />
        {ahead && <span className="chip">Practicing ahead</span>}
        {card.srs.state === 0 && <span className="chip new-chip">New card</span>}
        <span className="muted small">+{session.xp} XP</span>
      </div>
      <div className="stage" ref={stageRef}>
        {card && question && (
          <QuestionView key={`${card.id}:${pos}`} card={card} question={question} onAnswer={(o) => void onAnswer(o)} locked={phase !== 'question'} />
        )}
      </div>
      {phase === 'feedback' && outcome && (
        <Feedback
          card={card}
          outcome={outcome}
          xp={outcome.correct ? predicted : 0}
          onContinue={next}
          onAppeal={() => void appeal(outcome)}
          onExplain={() => setExplain(true)}
          appealing={appealing}
          appealNote={appealNote}
        />
      )}
      {explain && <ExplainModal card={card} onClose={() => setExplain(false)} />}
    </div>
  );
}
