import { useEffect, useRef, useState } from 'react';
import type { Reward } from '../../shared/types.ts';
import { api, type CardView } from '../api.ts';
import { navigate, useApp, useAppState } from '../app-context.tsx';
import { Markdown } from '../components/Markdown.tsx';
import { EmptyState, Spinner } from '../components/shared.tsx';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { floatText, shake } from '../fx.ts';
import { sfx } from '../sound.ts';
import { PlayHeader, PlayShell, Results, useSession } from './common.tsx';
import { type Scope, scopeBackLabel, scopeHome } from '../scope.ts';

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

export function Match({ scope }: { scope: Scope }) {
  const [run, setRun] = useState(0);
  return <MatchRun key={run} scope={scope} onRestart={() => setRun((r) => r + 1)} />;
}

function MatchRun({ scope, onRestart }: { scope: Scope; onRestart: () => void }) {
  const s = useAppState();
  const { showError } = useApp();
  const session = useSession('match', scope, false);
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
      .study('match', scope)
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
  }, [scope, showError]);

  useEffect(() => {
    if (start === null || finalMs !== null) return;
    const id = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(id);
  }, [start, finalMs]);

  const elapsed = start === null ? 0 : (finalMs ?? Math.max(0, now - start)) + penalty;

  const click = (t: Tile, el: HTMLElement) => {
    if (cleared.has(t.key) || finalMs !== null) return;
    if (!selected) {
      sfx.select();
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
      <PlayShell center>
        <Spinner className="size-6" />
      </PlayShell>
    );
  }

  if (cards.length < 2) {
    return (
      <PlayShell center>
        <EmptyState mood="sleepy" title="Not enough pairs to match" description="Match uses short question-and-answer cards. Code and multiple-choice questions sit this game out.">
          <Button variant="default" onClick={() => navigate(scopeHome(scope))}>
            {scopeBackLabel(scope)}
          </Button>
        </EmptyState>
      </PlayShell>
    );
  }

  if (finalMs !== null && reward) {
    const best = s.profile.stats.matchBestMs;
    return (
      <PlayShell>
        <Results
          reward={reward}
          title={`🧩 Cleared in ${fmt(finalMs)}!`}
          subtitle={best !== null && !reward.newRecord ? `Personal best: ${fmt(best)}` : undefined}
          scope={scope}
          stats={[
            { label: 'Time', value: fmt(finalMs) },
            { label: 'Pairs', value: cards.length },
            { label: 'Penalties', value: `${penalty / 1000}s` },
          ]}
          onAgain={onRestart}
        />
      </PlayShell>
    );
  }

  return (
    <PlayShell wide>
      <PlayHeader onQuit={() => navigate(scopeHome(scope))}>
        <div className="flex-1">
          <b className="font-display">Match</b> <span className="text-sm text-muted-foreground">Tap a question, then its answer. Wrong pairs add {PENALTY_MS / 1000}s.</span>
        </div>
        <span className="min-w-[70px] text-right font-display text-xl font-bold tabular-nums">{fmt(elapsed)}</span>
      </PlayHeader>
      <div className="mt-4 grid grid-cols-4 gap-2 max-[860px]:grid-cols-3 max-[560px]:grid-cols-2" ref={boardRef}>
        {tiles.map((t) => {
          const isCleared = cleared.has(t.key);
          return (
            <button
              key={t.key}
              data-quiet
              className={cn(
                'min-h-[100px] rounded-lg border-2 border-border bg-card p-3 text-sm font-medium text-foreground shadow-ledge transition-[opacity,transform,border-color,background-color] duration-250 ease-bounce hover:not-disabled:-translate-y-0.5 hover:not-disabled:border-primary',
                t.side === 'front' && 'font-display text-md font-semibold',
                selected?.key === t.key && 'border-primary bg-accent',
                wrongPair.includes(t.key) && 'border-destructive bg-[color-mix(in_srgb,var(--bad)_12%,var(--surface))]',
                isCleared && 'pointer-events-none scale-85 opacity-0',
              )}
              onClick={(e) => click(t, e.currentTarget)}
              disabled={isCleared}
            >
              <Markdown inline text={t.text} />
            </button>
          );
        })}
      </div>
    </PlayShell>
  );
}
