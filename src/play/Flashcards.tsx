import { useCallback, useEffect, useRef, useState } from 'react';
import type { Reward } from '../../shared/types.ts';
import { api, type CardView } from '../api.ts';
import { navigate, useApp } from '../app-context.tsx';
import { ExplainModal } from '../components/ExplainModal.tsx';
import { EmptyState, ProgressBar, Spinner } from '../components/ui.tsx';
import { floatText } from '../fx.ts';
import { sfx } from '../sound.ts';
import { ComboMeter, PlayHeader, Results, useSession } from './common.tsx';

const RATINGS = [
  { r: 1, label: 'Again', key: '1', cls: 'again' },
  { r: 2, label: 'Hard', key: '2', cls: 'hard' },
  { r: 3, label: 'Good', key: '3', cls: 'goodr' },
  { r: 4, label: 'Easy', key: '4', cls: 'easy' },
] as const;

export function Flashcards({ deckId }: { deckId: string | null }) {
  const [run, setRun] = useState(0);
  return <FlashRun key={run} deckId={deckId} onRestart={() => setRun((r) => r + 1)} />;
}

function FlashRun({ deckId, onRestart }: { deckId: string | null; onRestart: () => void }) {
  const { showError } = useApp();
  const session = useSession('flashcards', deckId, true);
  const [queue, setQueue] = useState<CardView[] | null>(null);
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(false);
  const [reward, setReward] = useState<Reward | null>(null);
  const [explain, setExplain] = useState(false);
  const [ahead, setAhead] = useState(false);
  const shownAt = useRef(performance.now());
  const requeued = useRef(new Set<string>());
  const pending = useRef<Promise<unknown>[]>([]);
  const ratingRef = useRef<HTMLDivElement>(null);

  const load = useCallback(
    async (practiceAhead = false) => {
      try {
        const d = await api.study('flashcards', deckId, { ahead: practiceAhead });
        setQueue(d.cards);
        setAhead(d.ahead);
        shownAt.current = performance.now();
      } catch (e) {
        showError(e);
      }
    },
    [deckId, showError],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const card = queue?.[pos];

  const finish = async () => {
    await Promise.all(pending.current);
    setReward(await session.finish());
    setDone(true);
  };

  const rate = (r: 1 | 2 | 3 | 4) => {
    if (!card || !flipped || !queue) return;
    const ms = performance.now() - shownAt.current;
    const correct = r >= 2;
    const xp = session.predictXp(card, { correct, ms, type: 'flip' }, correct ? session.combo + 1 : 0);
    if (correct) {
      sfx.correct(session.combo + 1);
      floatText(`+${xp} XP`, ratingRef.current);
    } else sfx.wrong();
    pending.current.push(session.record(card, { correct, ms, type: 'flip', rating: r }));
    let q = queue;
    if (r === 1 && !requeued.current.has(card.id)) {
      requeued.current.add(card.id);
      q = [...queue, card];
      setQueue(q);
    }
    if (pos + 1 >= q.length) {
      void finish();
      return;
    }
    setPos(pos + 1);
    setFlipped(false);
    shownAt.current = performance.now();
  };

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (explain || e.repeat || e.target instanceof HTMLInputElement) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (!flipped) {
          sfx.flip();
          setFlipped(true);
        } else if (e.key === 'Enter') rate(3);
      }
      const n = Number(e.key);
      if (flipped && n >= 1 && n <= 4) rate(n as 1 | 2 | 3 | 4);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  });

  if (!queue) {
    return (
      <div className="play center">
        <Spinner />
      </div>
    );
  }

  if (done) {
    const t = session.tally.current;
    return (
      <div className="play">
        <Results
          reward={reward}
          title="Deck flipped!"
          deckId={deckId}
          stats={[
            { label: 'Cards rated', value: t.answers },
            { label: 'Remembered', value: t.answers ? `${Math.round((t.correct / t.answers) * 100)}%` : '–' },
            { label: 'Best streak', value: `${t.maxCombo}×` },
          ]}
          onAgain={onRestart}
          againLabel="Keep going"
        />
      </div>
    );
  }

  if (!card) {
    return (
      <div className="play">
        <EmptyState icon="🎉" title="Nothing due right now">
          <div className="row center-row">
            <button className="btn" onClick={() => navigate(deckId ? `/deck/${deckId}` : '/')}>
              Back
            </button>
            <button className="btn primary" onClick={() => void load(true)}>
              Review ahead anyway
            </button>
          </div>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="play">
      <PlayHeader onQuit={() => (session.tally.current.answers > 0 ? void finish() : navigate(deckId ? `/deck/${deckId}` : '/'))}>
        <ProgressBar value={pos} max={queue.length} height={14} className="grow" />
        <span className="muted small">
          {pos + 1}/{queue.length}
        </span>
      </PlayHeader>
      <div className="play-sub">
        <ComboMeter combo={session.combo} />
        {ahead && <span className="chip">Reviewing ahead</span>}
        {card.srs.state === 0 && <span className="chip new-chip">New card</span>}
      </div>
      <div
        className={`flip-card ${flipped ? 'flipped' : ''}`}
        onClick={() => {
          if (!flipped) {
            sfx.flip();
            setFlipped(true);
          }
        }}
      >
        <div className="flip-inner">
          <div className="flip-face front">
            <div className="q-front">{card.front}</div>
            <div className="muted small">Click or press Space to flip</div>
          </div>
          <div className="flip-face back">
            <div className="muted small">{card.front}</div>
            <div className="flip-answer">{card.back}</div>
            {card.explanation && <p className="feedback-expl">{card.explanation}</p>}
            <button
              className="btn ghost small"
              onClick={(e) => {
                e.stopPropagation();
                setExplain(true);
              }}
            >
              💬 Ask Claude
            </button>
          </div>
        </div>
      </div>
      <div className="rating-row" ref={ratingRef}>
        {flipped ? (
          RATINGS.map((x) => (
            <button key={x.r} className={`rate-btn ${x.cls}`} onClick={() => rate(x.r)}>
              <span className="rate-label">{x.label}</span>
              <span className="rate-ivl">{card.previews?.[x.r] ?? ''}</span>
              <span className="opt-key">{x.key}</span>
            </button>
          ))
        ) : (
          <button
            className="btn primary big"
            onClick={() => {
              sfx.flip();
              setFlipped(true);
            }}
          >
            Show answer
          </button>
        )}
      </div>
      {explain && <ExplainModal card={card} onClose={() => setExplain(false)} />}
    </div>
  );
}
