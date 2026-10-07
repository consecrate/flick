import { useEffect, useRef, useState } from 'react';
import type { Card } from '../../shared/types.ts';
import { api } from '../api.ts';
import { useApp } from '../app-context.tsx';
import { Markdown, Modal, Spinner } from './ui.tsx';

interface Turn {
  q: string | null;
  a: string | null;
}

/** "Ask Claude" tutor for one card: an initial explanation, then follow-up questions. */
export function ExplainModal({ card, onClose }: { card: Pick<Card, 'id' | 'front' | 'back' | 'explanation'>; onClose: () => void }) {
  const { showError } = useApp();
  const [turns, setTurns] = useState<Turn[]>([{ q: null, a: null }]);
  const [input, setInput] = useState('');
  const busy = turns.some((t) => t.a === null);
  const started = useRef(false);

  const ask = async (q: string | null, index: number) => {
    try {
      const r = await api.explain(card.id, q ?? undefined);
      setTurns((ts) => ts.map((t, i) => (i === index ? { ...t, a: r.text } : t)));
    } catch (e) {
      showError(e);
      setTurns((ts) => ts.map((t, i) => (i === index ? { ...t, a: '_Claude could not answer right now._' } : t)));
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void ask(null, 0);
  }, []);

  const send = () => {
    const q = input.trim();
    if (!q || busy) return;
    setInput('');
    const index = turns.length;
    setTurns((ts) => [...ts, { q, a: null }]);
    void ask(q, index);
  };

  return (
    <Modal onClose={onClose} wide>
      <div className="explain-card">
        <div className="muted small">Question</div>
        <div className="explain-front">{card.front}</div>
        <div className="muted small">Answer</div>
        <div className="explain-back">{card.back}</div>
      </div>
      <div className="explain-thread">
        {turns.map((t, i) => (
          <div key={i}>
            {t.q && <div className="bubble me">{t.q}</div>}
            <div className="bubble claude">
              <span className="bubble-who">✨ Claude</span>
              {t.a === null ? <Spinner /> : <Markdown text={t.a} />}
            </div>
          </div>
        ))}
      </div>
      <div className="explain-input">
        <input
          className="input"
          placeholder="Ask a follow-up… (e.g. give me a mnemonic)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
        />
        <button className="btn primary" disabled={busy || !input.trim()} onClick={send}>
          Ask
        </button>
      </div>
    </Modal>
  );
}
