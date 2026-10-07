import { useEffect, useRef, useState } from 'react';
import { SendIcon } from 'lucide-react';
import type { Card } from '../../shared/types.ts';
import { api } from '../api.ts';
import { useApp } from '../app-context.tsx';
import { CodeBlock } from './Code.tsx';
import { Markdown } from './Markdown.tsx';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';

interface Turn {
  q: string | null;
  a: string | null;
}

/** "Ask Claude" tutor for one card: an initial explanation, then follow-up questions. */
export function ExplainModal({ card, onClose }: { card: Pick<Card, 'id' | 'front' | 'back' | 'explanation' | 'code' | 'codeLang'>; onClose: () => void }) {
  const { showError } = useApp();
  const [turns, setTurns] = useState<Turn[]>([{ q: null, a: null }]);
  const [input, setInput] = useState('');
  const busy = turns.some((t) => t.a === null);
  const started = useRef(false);
  const end = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (turns.length > 1) end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [turns]);

  const send = () => {
    const q = input.trim();
    if (!q || busy) return;
    setInput('');
    const index = turns.length;
    setTurns((ts) => [...ts, { q, a: null }]);
    void ask(q, index);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[min(760px,calc(100%-2rem))]" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>💬 Ask Claude</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-1 rounded-md bg-muted px-4 py-3">
          <div className="text-sm text-muted-foreground">Question</div>
          <Markdown className="font-medium" text={card.front} />
          {card.code && <CodeBlock code={card.code} lang={card.codeLang} compact />}
          <div className="mt-1 text-sm text-muted-foreground">Answer</div>
          <Markdown className="font-semibold text-success-ink" text={card.back} />
        </div>
        <div className="flex flex-col gap-3">
          {turns.map((t, i) => (
            <div key={i} className="flex flex-col gap-2">
              {t.q && (
                <div className="ml-auto w-fit max-w-[92%] rounded-[18px] rounded-br-md bg-primary px-4 py-3 text-primary-foreground">
                  <Markdown text={t.q} />
                </div>
              )}
              <div className="max-w-[92%] rounded-[18px] rounded-bl-md bg-muted px-4 py-3">
                <span className="mb-1 block font-display text-sm font-semibold text-brand-ink">✨ Claude</span>
                {t.a === null ? <Spinner /> : <Markdown text={t.a} />}
              </div>
            </div>
          ))}
          <div ref={end} />
        </div>
        <div className="flex gap-2">
          <Input placeholder="Ask a follow-up… (e.g. give me a mnemonic)" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
          <Button variant="default" disabled={busy || !input.trim()} onClick={send}>
            <SendIcon /> Ask
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
