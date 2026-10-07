import { useEffect, useMemo, useRef, useState } from 'react';
import { BOSS_HEARTS, bossFor, localDay } from '../../shared/game.ts';
import type { Reward } from '../../shared/types.ts';
import { api, type CardView, type StudyData } from '../api.ts';
import { navigate, useApp } from '../app-context.tsx';
import { ExplainModal } from '../components/ExplainModal.tsx';
import { EmptyState, Spinner } from '../components/ui.tsx';
import { confetti, floatText, shake } from '../fx.ts';
import { sfx } from '../sound.ts';
import { ComboMeter, Feedback, Hearts, PlayHeader, QuestionView, Results, buildQuestion, useSession, type AnswerOutcome } from './common.tsx';

const HIT = 100;

export function Boss({ deckId }: { deckId: string | null }) {
  const [run, setRun] = useState(0);
  return <BossRun key={run} deckId={deckId} onRestart={() => setRun((r) => r + 1)} />;
}

function BossRun({ deckId, onRestart }: { deckId: string | null; onRestart: () => void }) {
  const { showError } = useApp();
  const session = useSession('boss', deckId, false);
  const [data, setData] = useState<StudyData | null>(null);
  const [queue, setQueue] = useState<CardView[]>([]);
  const [pos, setPos] = useState(0);
  const [hp, setHp] = useState(0);
  const [maxHp, setMaxHp] = useState(1);
  const [hearts, setHearts] = useState(BOSS_HEARTS);
  const [outcome, setOutcome] = useState<AnswerOutcome | null>(null);
  const [lastHit, setLastHit] = useState<{ dmg: number; crit: boolean } | null>(null);
  const [result, setResult] = useState<'won' | 'lost' | null>(null);
  const [reward, setReward] = useState<Reward | null>(null);
  const [explain, setExplain] = useState(false);
  const [intro, setIntro] = useState(true);
  const bossRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const pending = useRef<Promise<unknown>[]>([]);
  const boss = useMemo(() => bossFor(deckId ?? 'all', localDay()), [deckId]);

  useEffect(() => {
    api
      .study('boss', deckId)
      .then((d) => {
        setData(d);
        setQueue(d.cards);
        setHp(d.cards.length * HIT);
        setMaxHp(d.cards.length * HIT);
      })
      .catch(showError);
  }, [deckId, showError]);

  const card = queue[pos];
  const question = useMemo(() => (card && data ? buildQuestion(card, data.pool) : null), [card, data, pos]);

  const end = async (won: boolean) => {
    setResult(won ? 'won' : 'lost');
    if (won) {
      sfx.victory();
      confetti(250);
    } else sfx.gameOver();
    await Promise.all(pending.current);
    setReward(await session.finish({ bossDefeated: won }));
  };

  const onAnswer = (o: AnswerOutcome) => {
    setOutcome(o);
    if (o.correct) {
      const nextCombo = session.combo + 1;
      const crit = nextCombo >= 3 && Math.random() < 0.35;
      const dmg = Math.round(HIT * (1 + Math.min(nextCombo, 10) * 0.05) * (crit ? 1.5 : 1));
      setLastHit({ dmg, crit });
      sfx.hit();
      shake(bossRef.current);
      floatText(crit ? `CRIT −${dmg}` : `−${dmg}`, bossRef.current, crit ? 'var(--warn)' : 'var(--bad)');
      setHp((h) => Math.max(0, h - dmg));
    } else {
      setLastHit(null);
      sfx.hurt();
      shake(playerRef.current);
      floatText('−❤️', playerRef.current, 'var(--bad)');
      setHearts((h) => Math.max(0, h - 1));
    }
  };

  const next = () => {
    if (!outcome) return;
    pending.current.push(session.record(card, { correct: outcome.correct, ms: outcome.ms, usedHint: outcome.usedHint, type: outcome.type }));
    let q = queue;
    if (!outcome.correct) {
      q = [...queue, card];
      setQueue(q);
    }
    setOutcome(null);
    if (hp <= 0) return void end(true);
    if (hearts <= 0) return void end(false);
    if (pos + 1 >= q.length) return void end(hp <= 0);
    setPos(pos + 1);
  };

  if (!data) {
    return (
      <div className="play center">
        <Spinner />
      </div>
    );
  }

  if (data.cards.length === 0) {
    return (
      <div className="play center">
        <EmptyState mood="sleepy" title="No cards to fight yet">
          <p className="muted">Add some cards and study them first, then come back.</p>
          <button className="btn primary" onClick={() => navigate(deckId ? `/deck/${deckId}` : '/')}>
            {deckId ? 'Back to deck' : 'Home'}
          </button>
        </EmptyState>
      </div>
    );
  }

  if (result) {
    return (
      <div className="play">
        {reward ? (
          <Results
            reward={reward}
            title={result === 'won' ? `⚔️ ${boss.name} defeated!` : `${boss.emoji} ${boss.name} wins this round`}
            subtitle={result === 'won' ? 'Your hardest cards just got a little easier.' : 'Review these cards and come back stronger.'}
            deckId={deckId}
            stats={[
              { label: 'Damage dealt', value: maxHp - hp },
              { label: 'Accuracy', value: session.tally.current.answers ? `${Math.round((session.tally.current.correct / session.tally.current.answers) * 100)}%` : '–' },
              { label: 'Best combo', value: `${session.tally.current.maxCombo}×` },
            ]}
            onAgain={onRestart}
            againLabel={result === 'won' ? 'Fight again' : 'Rematch'}
          />
        ) : (
          <div className="center">
            <Spinner />
          </div>
        )}
      </div>
    );
  }

  if (intro) {
    return (
      <div className="play">
        <div className="results">
          <div className="boss-intro">{boss.emoji}</div>
          <h1>{boss.name}</h1>
          <p className="muted">
            A boss built from your {queue.length} hardest cards. Each correct answer hits for {HIT}+ damage (combos hit harder, with a chance of
            critical hits). You have {BOSS_HEARTS} hearts.
          </p>
          <div className="results-actions">
            <button className="btn big" onClick={() => navigate(deckId ? `/deck/${deckId}` : '/')}>
              Flee
            </button>
            <button className="btn primary big" onClick={() => setIntro(false)}>
              ⚔️ Fight!
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="play">
      <PlayHeader onQuit={() => navigate(deckId ? `/deck/${deckId}` : '/')}>
        <div className="grow" />
        <div ref={playerRef}>
          <Hearts n={hearts} max={BOSS_HEARTS} />
        </div>
      </PlayHeader>
      <div className="boss-arena">
        <div className={`boss ${hp <= 0 ? 'defeated' : ''}`} ref={bossRef}>
          <div className="boss-emoji">{boss.emoji}</div>
          <div className="boss-name">{boss.name}</div>
          <div className="boss-hp">
            <div className="boss-hp-fill" style={{ width: `${(hp / maxHp) * 100}%` }} />
            <span className="boss-hp-text">
              {hp} / {maxHp}
            </span>
          </div>
          {lastHit?.crit && <div className="crit">CRITICAL!</div>}
        </div>
        <ComboMeter combo={session.combo} />
      </div>
      <div className="stage">
        {card && question && <QuestionView key={`${card.id}:${pos}`} card={card} question={question} onAnswer={onAnswer} locked={outcome !== null} />}
      </div>
      {outcome && <Feedback card={card} outcome={outcome} xp={0} onContinue={next} onExplain={() => setExplain(true)} />}
      {explain && <ExplainModal card={card} onClose={() => setExplain(false)} />}
    </div>
  );
}
