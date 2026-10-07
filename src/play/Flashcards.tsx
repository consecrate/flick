import { useCallback, useEffect, useRef, useState } from 'react';
import type { Reward } from '../../shared/types.ts';
import { api, type CardView } from '../api.ts';
import { navigate, useApp } from '../app-context.tsx';
import { ExplainModal } from '../components/ExplainModal.tsx';
import { CodeBlock } from '../components/Code.tsx';
import { Markdown } from '../components/Markdown.tsx';
import { EmptyState, ProgressBar, Spinner } from '../components/shared.tsx';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { floatText } from '../fx.ts';
import { sfx } from '../sound.ts';
import { ComboMeter, PlayHeader, PlayShell, PlaySub, Results, useSession } from './common.tsx';
import { type Scope, scopeHome } from '../scope.ts';

const RATINGS = [
  { r: 1, label: 'Again', key: '1', cls: 'bg-destructive-soft border-[color-mix(in_srgb,var(--bad)_30%,var(--surface))]' },
  { r: 2, label: 'Hard', key: '2', cls: 'bg-warning-soft border-[color-mix(in_srgb,var(--warn)_35%,var(--surface))]' },
  { r: 3, label: 'Good', key: '3', cls: 'bg-success-soft border-[color-mix(in_srgb,var(--good)_30%,var(--surface))]' },
  { r: 4, label: 'Easy', key: '4', cls: 'bg-accent border-[color-mix(in_srgb,var(--accent)_30%,var(--surface))]' },
] as const;

export function Flashcards({ scope }: { scope: Scope }) {
  const [run, setRun] = useState(0);
  return <FlashRun key={run} scope={scope} onRestart={() => setRun((r) => r + 1)} />;
}

function FlashRun({ scope, onRestart }: { scope: Scope; onRestart: () => void }) {
  const { showError } = useApp();
  const session = useSession('flashcards', scope, true);
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
        const d = await api.study('flashcards', scope, { ahead: practiceAhead });
        setQueue(d.cards);
        setAhead(d.ahead);
        shownAt.current = performance.now();
      } catch (e) {
        showError(e);
      }
    },
    [scope, showError],
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
      <PlayShell center>
        <Spinner className="size-6" />
      </PlayShell>
    );
  }

  if (done) {
    const t = session.tally.current;
    return (
      <PlayShell>
        <Results
          reward={reward}
          title="Deck flipped!"
          scope={scope}
          stats={[
            { label: 'Cards rated', value: t.answers },
            { label: 'Remembered', value: t.answers ? `${Math.round((t.correct / t.answers) * 100)}%` : '–' },
            { label: 'Best streak', value: `${t.maxCombo}×` },
          ]}
          onAgain={onRestart}
          againLabel="Keep going"
        />
      </PlayShell>
    );
  }

  if (!card) {
    return (
      <PlayShell>
        <EmptyState mood="sleepy" title="Nothing due right now">
          <Button onClick={() => navigate(scopeHome(scope))}>Back</Button>
          <Button variant="default" onClick={() => void load(true)}>
            Review ahead anyway
          </Button>
        </EmptyState>
      </PlayShell>
    );
  }

  const tall = !!(card.code || card.mcq);
  const face = cn(
    'flip-face absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl border-[3px] p-8 text-center max-[560px]:p-5',
    tall && 'items-stretch justify-start overflow-y-auto text-left',
  );
  const flip = () => {
    if (!flipped) {
      sfx.flip();
      setFlipped(true);
    }
  };

  return (
    <PlayShell>
      <PlayHeader onQuit={() => (session.tally.current.answers > 0 ? void finish() : navigate(scopeHome(scope)))}>
        <ProgressBar value={pos} max={queue.length} className="h-3.5 flex-1" />
        <span className="num text-sm text-muted-foreground">
          {pos + 1}/{queue.length}
        </span>
      </PlayHeader>
      <PlaySub>
        <ComboMeter combo={session.combo} />
        {ahead && <Badge>Reviewing ahead</Badge>}
        {card.srs.state === 0 && <Badge variant="warning">New card</Badge>}
      </PlaySub>
      <div data-quiet data-flipped={flipped} className={cn('flip-card mt-3 cursor-pointer', tall ? 'h-[480px]' : 'h-80')} onClick={flip}>
        <div className="flip-inner relative size-full">
          <div className={cn(face, 'border-border bg-card shadow-[0_5px_0_var(--border-strong)]')}>
            {card.title && (
              <Badge variant="brand" className={cn('text-sm', tall && 'self-start')}>
                {card.title}
              </Badge>
            )}
            <Markdown className={cn('font-display font-semibold', tall ? 'text-lg leading-snug' : 'text-[30px] leading-tight')} text={card.front} />
            {card.code && <CodeBlock code={card.code} lang={card.codeLang} compact />}
            <div className="text-sm text-muted-foreground">Click or press Space to flip</div>
          </div>
          <div className={cn(face, 'back border-primary bg-accent')}>
            <Markdown className="text-sm text-muted-foreground" text={card.title ?? card.front} />
            <Markdown className={cn('font-display font-bold', tall ? 'text-xl' : 'text-[32px] leading-tight')} text={card.back} />
            {card.explanation && <Markdown className="text-muted-foreground" text={card.explanation} />}
            <Button
              variant="ghost"
              size="sm"
              className={cn(tall && 'self-start')}
              onClick={(e) => {
                e.stopPropagation();
                setExplain(true);
              }}
            >
              💬 Ask Claude
            </Button>
          </div>
        </div>
      </div>
      <div className="mt-6 grid grid-cols-4 gap-2 max-[560px]:grid-cols-2" ref={ratingRef}>
        {flipped ? (
          RATINGS.map((x) => (
            <button
              key={x.r}
              data-quiet
              className={cn(
                'relative flex flex-col items-center gap-0.5 rounded-lg border-2 px-4 py-3 text-foreground shadow-ledge transition-transform duration-150 ease-bounce hover:-translate-y-0.5',
                x.cls,
              )}
              onClick={() => rate(x.r)}
            >
              <span className="font-display text-md font-semibold">{x.label}</span>
              <span className="text-xs text-muted-foreground">{card.previews?.[x.r] ?? ''}</span>
              <span className="absolute top-3 right-3 grid size-[18px] place-items-center rounded-full bg-card/70 font-display text-xs font-semibold text-muted-foreground">{x.key}</span>
            </button>
          ))
        ) : (
          <Button variant="default" size="lg" className="col-span-full justify-self-center" onClick={flip}>
            Show answer
          </Button>
        )}
      </div>
      {explain && <ExplainModal card={card} onClose={() => setExplain(false)} />}
    </PlayShell>
  );
}
