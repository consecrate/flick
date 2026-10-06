import { useEffect, useRef, useState } from 'react';
import type { Reward } from '../../shared/types.ts';
import { api, type CardView } from '../api.ts';
import { navigate, useApp, useAppState } from '../app-context.tsx';
import { Spinner } from '../components/ui.tsx';
import { floatText, shake } from '../fx.ts';
import { sfx } from '../sound.ts';
import { PlayHeader, Results, useSession } from './common.tsx';

interface Tile {
  key: string;
  cardId: string;
  text: string;
  side: 'front' | 'back';
}

const PENALTY_MS = 2000;

function fmt(ms: number) {
  return `${(ms / 1000).toFixed(1)}s`;
}

export function Match({ deckId }: { deckId: string | null }) {
  const [run, setRun] = useState(0);
  return <MatchRun key={run} deckId={deckId} onRestart={() => setRun((r) => r + 1)} />;
}

function MatchRun({ deckId, onRestart }: { deckId: string | null; onRestart: () => void }) {
  const s = useAppState();
  const { showError } = useApp();
  const session = useSession('match', deckId, false);
  const [cards, setCards] = useState<CardView[] | null>(null);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [selected, setSelected] = useState<Tile | null>(null);
  const [cleared, setCleared] = useState<Set<string>>(new Set());
  const [wrongPair, setWrongPair] = useState<string[]>([]);
  const [start, setStart] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [penalty, setPenalty] = useState(0);
  const [finalMs, setFinalMs] = useState<number | null>(null);
  const [reward, setReward] = useState<Reward | null>(null);
  const pending = useRef<Promise<unknown>[]>([]);
  const boardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .study('match', deckId)
      .then((d) => {
        setCards(d.cards);
        const t: Tile[] = d.cards.flatMap((c) => [
          { key: `${c.id}:f`, cardId: c.id, text: c.front, side: 'front' as const },
          { key: `${c.id}:b`, cardId: c.id, text: c.back, side: 'back' as const },
        ]);
        for (let i = t.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [t[i], t[j]] = [t[j], t[i]];
        }
        setTiles(t);
        setStart(performance.now());
      })
      .catch(showError);
  }, [deckId, showError]);

  useEffect(() => {
    if (start === null || finalMs !== null) return;
    const id = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(id);
  }, [start, finalMs]);

  const elapsed = start === null ? 0 : (finalMs ?? Math.max(0, now - start)) + penalty;

  const click = (t: Tile, el: HTMLElement) => {
    if (cleared.has(t.key) || finalMs !== null) return;
    if (!selected) {
      sfx.click();
      setSelected(t);
      return;
    }
    if (selected.key === t.key) {
      setSelected(null);
      return;
    }
    const card = cards!.find((c) => c.id === t.cardId)!;
    if (selected.cardId === t.cardId && selected.side !== t.side) {
      const next = new Set(cleared);
      next.add(t.key);
      next.add(selected.key);
      setCleared(next);
      setSelected(null);
      sfx.correct(session.combo + 1);
      floatText('✓', el, 'var(--good)');
      pending.current.push(session.record(card, { correct: true, ms: 0, type: 'mcq' }));
      if (next.size === tiles.length) {
        const total = performance.now() - start! + penalty;
        setFinalMs(total);
        void (async () => {
          await Promise.all(pending.current);
          setReward(await session.finish({ matchMs: Math.round(total) }));
        })();
      }
    } else {
      sfx.wrong();
      shake(boardRef.current);
      floatText(`+${PENALTY_MS / 1000}s`, el, 'var(--bad)');
      setPenalty((p) => p + PENALTY_MS);
      setWrongPair([selected.key, t.key]);
      setTimeout(() => setWrongPair([]), 450);
      setSelected(null);
      session.setCombo(0);
    }
  };

  if (!cards) {
    return (
      <div className="play center">
        <Spinner />
      </div>
    );
  }

  if (finalMs !== null && reward) {
    const best = s.profile.stats.matchBestMs;
    return (
      <div className="play">
        <Results
          reward={reward}
          title={`Cleared in ${fmt(finalMs)}`}
          subtitle={best !== null && !reward.newRecord ? `Personal best: ${fmt(best)}` : undefined}
          deckId={deckId}
          stats={[
            { label: 'Time', value: fmt(finalMs) },
            { label: 'Pairs', value: cards.length },
            { label: 'Penalties', value: `${penalty / 1000}s` },
          ]}
          onAgain={onRestart}
        />
      </div>
    );
  }

  return (
    <div className="play wide">
      <PlayHeader onQuit={() => navigate(deckId ? `/deck/${deckId}` : '/')}>
        <div className="grow">
          <b>Match</b> <span className="muted small">Tap a question, then its answer. Wrong pairs add {PENALTY_MS / 1000}s.</span>
        </div>
        <span className="timer">{fmt(elapsed)}</span>
      </PlayHeader>
      <div className="match-grid" ref={boardRef}>
        {tiles.map((t) => (
          <button
            key={t.key}
            className={`match-tile ${t.side} ${selected?.key === t.key ? 'selected' : ''} ${cleared.has(t.key) ? 'cleared' : ''} ${
              wrongPair.includes(t.key) ? 'wrong' : ''
            }`}
            onClick={(e) => click(t, e.currentTarget)}
            disabled={cleared.has(t.key)}
          >
            {t.text}
          </button>
        ))}
      </div>
    </div>
  );
}
