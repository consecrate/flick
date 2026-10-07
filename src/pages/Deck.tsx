import { useCallback, useEffect, useMemo, useState } from 'react';
import { MAX_OPTIONS } from '../../shared/mcq.ts';
import { api, type CardView, type DeckDetail } from '../api.ts';
import { navigate, useApp, useAppState } from '../app-context.tsx';
import { EditableTitle, EmojiPicker, ModeButton, ModeGrid, StatLine } from '../components/DeckHero.tsx';
import { FolderCrumbs, MoveModal, deckItem } from '../components/DeckBrowser.tsx';
import { ExplainModal } from '../components/ExplainModal.tsx';
import { ImportModal } from '../components/ImportModal.tsx';
import { Markdown } from '../components/Markdown.tsx';
import { ClaudeLoader, EmptyState, MasteryBar, Page, PageSpinner, TierChip } from '../components/shared.tsx';
import { CodeBlock } from '../components/Code.tsx';
import { EllipsisIcon, MessageCircleIcon, PlusIcon, SearchIcon, StarIcon, Trash2Icon } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Tip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

const EMOJIS = ['📘', '🧬', '🧪', '🧮', '🌍', '🏛️', '💻', '🎨', '🎵', '⚖️', '🩺', '📈', '🗣️', '🔭', '🧠', '📜'];

export function DeckPage({ id }: { id: string }) {
  const { showError, refresh, toast, ask } = useApp();
  const [data, setData] = useState<DeckDetail | null>(null);
  const [tab, setTab] = useState<'cards' | 'materials'>('cards');
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState<CardView | 'new' | null>(null);
  const [explaining, setExplaining] = useState<CardView | null>(null);
  const [query, setQuery] = useState('');
  const [enhancing, setEnhancing] = useState(false);
  const [moving, setMoving] = useState(false);
  const s = useAppState();

  const load = useCallback(async () => {
    try {
      setData(await api.deck(id));
    } catch (e) {
      showError(e);
      navigate('/');
    }
  }, [id, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  const tiers = useMemo(() => {
    const t = [0, 0, 0, 0, 0];
    data?.cards.filter((c) => !c.suspended).forEach((c) => t[c.tier]++);
    return t;
  }, [data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = data?.cards ?? [];
    return q ? list.filter((c) => [c.title, c.front, c.back, c.code].some((x) => x?.toLowerCase().includes(q))) : list;
  }, [data, query]);

  if (!data) return <PageSpinner />;
  const d = data.deck;
  const missingOptions = data.cards.filter((c) => !c.mcq && c.distractors.length < 3).length;

  const enhance = async () => {
    setEnhancing(true);
    try {
      const r = await api.enhance(d.id);
      toast({ title: `Claude wrote quiz options for ${r.updated} cards`, kind: 'success' });
      await load();
    } catch (e) {
      showError(e);
    } finally {
      setEnhancing(false);
    }
  };

  const update = async (patch: { title?: string; emoji?: string }) => {
    try {
      await api.updateDeck(d.id, patch);
      await load();
      await refresh();
    } catch (e) {
      showError(e);
    }
  };

  const remove = async () => {
    const what = d.cardCount ? `“${d.title}” and all ${d.cardCount} cards` : `“${d.title}”`;
    if (!(await ask({ title: `Delete ${what}?`, description: 'This cannot be undone.', actions: [{ label: 'Delete deck', value: 'ok', destructive: true }] }))) return;
    try {
      await api.deleteDeck(d.id);
      await refresh();
      navigate(s.folders.some((f) => f.id === d.folderId) ? `/folder/${d.folderId}` : '/');
    } catch (e) {
      showError(e);
    }
  };

  const cardAction = async (c: CardView, action: 'star' | 'suspend' | 'reset' | 'delete') => {
    try {
      if (action === 'star') await api.updateCard(c.id, { starred: !c.starred });
      if (action === 'suspend') await api.updateCard(c.id, { suspended: !c.suspended });
      if (action === 'reset') await api.resetCard(c.id);
      if (action === 'delete') {
        if (!(await ask({ title: 'Delete this card?', description: 'Its review history goes with it.', actions: [{ label: 'Delete card', value: 'ok', destructive: true }] }))) return;
        await api.deleteCard(c.id);
      }
      await load();
      void refresh();
    } catch (e) {
      showError(e);
    }
  };

  const removeMaterial = async (m: DeckDetail['materials'][number]) => {
    const choice = await ask({
      title: `Remove “${m.title}”?`,
      description: m.cardCount ? `It made ${m.cardCount} card${m.cardCount === 1 ? '' : 's'}. You can keep them or delete them too.` : undefined,
      actions: m.cardCount
        ? [
            { label: 'Keep the cards', value: 'keep' },
            { label: 'Delete the cards too', value: 'cards', destructive: true },
          ]
        : [{ label: 'Remove', value: 'keep', destructive: true }],
    });
    if (!choice) return;
    try {
      await api.deleteMaterial(m.id, choice === 'cards');
      await load();
      void refresh();
    } catch (e) {
      showError(e);
    }
  };

  const enough = d.cardCount > 0;
  const row = 'flex items-center gap-4 border-t-2 border-border px-6 py-3 first:border-t-0 max-[560px]:flex-wrap max-[560px]:px-4';

  return (
    <Page>
      <div className="-mb-4 flex items-center justify-between gap-3">
        <FolderCrumbs folderId={s.folders.some((f) => f.id === d.folderId) ? d.folderId! : null} />
        <Button size="sm" variant="ghost" onClick={() => setMoving(true)}>
          📁 Move to folder
        </Button>
      </div>
      <section className="flex flex-col gap-6">
        <div className="flex items-start gap-4">
          <EmojiPicker value={d.emoji} choices={EMOJIS} onPick={(emoji) => void update({ emoji })} />
          <div className="min-w-0 flex-1">
            <EditableTitle value={d.title} onRename={(title) => void update({ title })} />
            {d.description && <p className="mt-1 text-muted-foreground">{d.description}</p>}
            <StatLine
              items={[
                { value: d.cardCount, label: 'cards' },
                { value: d.dueCount, label: 'due', tone: 'due' },
                { value: d.newCount, label: 'new' },
                { value: `${Math.round(d.mastery * 100)}%`, label: 'mastered' },
              ]}
            />
            <MasteryBar tiers={tiers} className="h-1.5" />
          </div>
        </div>

        <ModeGrid>
          <ModeButton
            primary
            icon="🎯"
            name="Quiz"
            desc={!enough ? 'Add cards first' : d.dueCount + d.newCount > 0 ? `${d.dueCount} due · ${d.newCount} new` : 'Practice ahead'}
            disabled={!enough}
            onClick={() => navigate(`/play/quiz/${d.id}`)}
          />
          <ModeButton icon="🃏" name="Flashcards" desc="Flip & self-rate" disabled={!enough} onClick={() => navigate(`/play/flashcards/${d.id}`)} />
          <ModeButton icon="🧩" name="Match" desc="Beat the clock" disabled={d.cardCount < 3} onClick={() => navigate(`/play/match/${d.id}`)} />
          <ModeButton icon="⏱️" name="Time Attack" desc="60-second blitz" disabled={d.cardCount < 4} onClick={() => navigate(`/play/timeattack/${d.id}`)} />
          <ModeButton
            icon="⚔️"
            name="Boss Fight"
            desc={d.bossReady ? 'Your hardest cards' : `Study ${data.bossMinCards}+ cards`}
            locked={!d.bossReady}
            disabled={!d.bossReady}
            onClick={() => navigate(`/play/boss/${d.id}`)}
          />
        </ModeGrid>
      </section>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <div className="flex flex-wrap items-center gap-2">
          <TabsList>
            <TabsTrigger value="cards">
              🃏 Cards <span className="num text-muted-foreground">{data.cards.length}</span>
            </TabsTrigger>
            <TabsTrigger value="materials">
              📚 Materials <span className="num text-muted-foreground">{data.materials.length}</span>
            </TabsTrigger>
          </TabsList>
          <div className="flex-1" />
          <Button variant="ghost" onClick={() => setEditing('new')}>
            <PlusIcon /> Card
          </Button>
          <Button onClick={() => setImporting(true)}>
            <PlusIcon /> Add material
          </Button>
        </div>

        <TabsContent value="cards">
          {missingOptions > 0 && (
            <Alert variant="brand" className="justify-between">
              {enhancing ? (
                <ClaudeLoader lines={['Claude is writing multiple-choice options…', 'Making the wrong answers tempting…']} />
              ) : (
                <>
                  <AlertDescription>
                    {missingOptions} card{missingOptions === 1 ? '' : 's'} have no multiple-choice options yet.
                  </AlertDescription>
                  <Button size="sm" variant="default" onClick={() => void enhance()}>
                    🧠 Write quiz options with Claude
                  </Button>
                </>
              )}
            </Alert>
          )}
          {data.cards.length > 6 && (
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-10" placeholder="Search cards…" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
          )}
          {data.cards.length === 0 ? (
            <EmptyState mood="wow" title="No cards yet" description="Write cards yourself, or add notes, a PDF, a link or a topic and Claude writes them.">
              <Button onClick={() => setEditing('new')}>
                <PlusIcon /> Write a card
              </Button>
              <Button variant="default" onClick={() => setImporting(true)}>
                ✨ Add material
              </Button>
            </EmptyState>
          ) : (
            filtered.length > 0 && (
              <div className="flex flex-col rounded-lg border-2 border-border bg-card shadow-ledge">
                {filtered.map((c) => (
                  <div key={c.id} className={cn(row, c.suspended && 'opacity-50')}>
                    <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setEditing(c)}>
                      <div className="flex items-center gap-2 font-semibold">
                        {c.mcq && <Badge>🎯 {c.distractors.length + 1} options</Badge>}
                        {c.code && <Badge>{'</>'} {c.codeLang ?? 'code'}</Badge>}
                        <span className="line-clamp-2 min-w-0">
                          {c.title ? `${c.title}: ` : ''}
                          <Markdown inline text={c.front} />
                        </span>
                      </div>
                      <div className="line-clamp-2 text-sm text-muted-foreground">
                        <Markdown inline text={c.back} />
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-0.5 whitespace-nowrap">
                      <TierChip tier={c.tier} />
                      {c.srs.state !== 0 && (
                        <span className="text-xs text-muted-foreground" title="Predicted chance you remember it right now">
                          {Math.round(c.recall * 100)}% recall
                        </span>
                      )}
                      {c.suspended && <span className="text-xs text-muted-foreground">paused</span>}
                    </div>
                    <div className="flex items-center gap-0.5">
                      <Tip label="Ask Claude about this card">
                        <Button variant="plain" size="icon" aria-label="Ask Claude about this card" onClick={() => setExplaining(c)}>
                          <MessageCircleIcon />
                        </Button>
                      </Tip>
                      <Tip label={c.starred ? 'Unstar' : 'Star'}>
                        <Button
                          variant="plain"
                          size="icon"
                          aria-label={c.starred ? 'Unstar' : 'Star'}
                          className={cn(c.starred && 'text-warning hover:not-disabled:text-warning')}
                          onClick={() => void cardAction(c, 'star')}
                        >
                          <StarIcon fill={c.starred ? 'currentColor' : 'none'} />
                        </Button>
                      </Tip>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="plain" size="icon" aria-label="More">
                            <EllipsisIcon />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setEditing(c)}>Edit</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => void cardAction(c, 'suspend')}>{c.suspended ? 'Resume' : 'Pause'}</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => void cardAction(c, 'reset')}>Reset progress</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onSelect={() => void cardAction(c, 'delete')}>
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </TabsContent>

        <TabsContent value="materials">
          {data.materials.length === 0 ? (
            <EmptyState mood="sleepy" title="No materials yet" description="Add PDFs, notes, links or topics. Each one adds new cards to this deck." />
          ) : (
            <div className="flex flex-col rounded-lg border-2 border-border bg-card shadow-ledge">
              {data.materials.map((m) => (
                <div key={m.id} className={row}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 font-semibold">
                      <Badge>{{ text: '📝 Notes', file: '📄 File', url: '🔗 Link', topic: '💭 Topic', import: '📥 List', mcq: '📋 Pasted' }[m.kind]}</Badge>
                      {m.title}
                    </div>
                    <div className="line-clamp-2 text-sm text-muted-foreground">{m.preview}</div>
                  </div>
                  <div className="flex flex-col items-end gap-0.5 text-xs whitespace-nowrap text-muted-foreground">
                    <span>{m.cardCount} cards</span>
                    <span>{new Date(m.addedAt).toLocaleDateString()}</span>
                  </div>
                  <Tip label="Remove material">
                    <Button variant="plain" size="icon" aria-label="Remove material" onClick={() => void removeMaterial(m)}>
                      <Trash2Icon />
                    </Button>
                  </Tip>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <div className="text-center text-sm">
        <Button variant="link" className="text-destructive" onClick={() => void remove()}>
          Delete deck
        </Button>
      </div>

      {importing && (
        <ImportModal
          deckId={d.id}
          onClose={() => setImporting(false)}
          onDone={() => {
            setImporting(false);
            void load();
          }}
        />
      )}
      {editing && (
        <CardEditor
          deckId={d.id}
          card={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
            void refresh();
          }}
        />
      )}
      {explaining && <ExplainModal card={explaining} onClose={() => setExplaining(null)} />}
      {moving && <MoveModal item={deckItem(d, s.folders)} onClose={() => setMoving(false)} onMoved={() => void load()} />}
    </Page>
  );
}

function CardEditor({ deckId, card, onClose, onSaved }: { deckId: string; card: CardView | null; onClose: () => void; onSaved: () => void }) {
  const { showError } = useApp();
  const [front, setFront] = useState(card?.front ?? '');
  const [back, setBack] = useState(card?.back ?? '');
  const [mcq, setMcq] = useState(card?.mcq ?? false);
  const [d, setD] = useState<string[]>(() => {
    const list = [...(card?.distractors ?? [])];
    while (list.length < 3) list.push('');
    return list;
  });
  const [explanation, setExplanation] = useState(card?.explanation ?? '');
  const [title, setTitle] = useState(card?.title ?? '');
  const [code, setCode] = useState(card?.code ?? '');
  const [codeLang, setCodeLang] = useState(card?.codeLang ?? '');
  const [hint, setHint] = useState(card?.hint ?? '');
  const [busy, setBusy] = useState(false);
  const maxWrong = mcq ? MAX_OPTIONS - 1 : 3;
  const wrong = d.slice(0, Math.max(3, mcq ? d.length : 3));

  const save = async () => {
    setBusy(true);
    try {
      const body = { front, back, mcq, distractors: d.filter((x) => x.trim()).slice(0, maxWrong), explanation, title, code, codeLang, hint };
      if (card) await api.updateCard(card.id, body);
      else await api.addCard(deckId, body);
      onSaved();
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[min(640px,calc(100%-2rem))]" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{card ? 'Edit card' : 'New card'}</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="edit">
          <TabsList>
            <TabsTrigger value="edit">✏️ Write</TabsTrigger>
            <TabsTrigger value="preview" disabled={!front.trim()}>
              👀 Preview
            </TabsTrigger>
          </TabsList>
          <TabsContent value="edit">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="card-front">Question</FieldLabel>
                <Textarea id="card-front" rows={2} value={front} onChange={(e) => setFront(e.target.value)} autoFocus />
                <FieldDescription>
                  Markdown works everywhere on a card: **bold**, `code`, lists. Write math as <code className="font-mono">$x^2$</code> inline or{' '}
                  <code className="font-mono">$$…$$</code> on its own line.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="card-back">Answer</FieldLabel>
                <Input id="card-back" value={back} onChange={(e) => setBack(e.target.value)} />
              </Field>
              <Field orientation="horizontal">
                <Switch id="card-mcq" checked={mcq} onCheckedChange={setMcq} />
                <FieldLabel htmlFor="card-mcq" className="font-normal">
                  Always ask as multiple choice, with every option below
                </FieldLabel>
              </Field>
              <Field>
                <FieldLabel>Wrong options for multiple choice{mcq ? '' : ' (optional)'}</FieldLabel>
                {wrong.map((x, i) => (
                  <Input key={i} value={x} placeholder={`Wrong option ${i + 1}`} onChange={(e) => setD(d.map((y, j) => (j === i ? e.target.value : y)))} />
                ))}
                {mcq && d.length < maxWrong && (
                  <Button variant="link" className="self-start" onClick={() => setD([...d, ''])}>
                    + Add an option
                  </Button>
                )}
              </Field>
              <Field>
                <FieldLabel htmlFor="card-expl">Explanation (optional)</FieldLabel>
                <Textarea id="card-expl" rows={2} value={explanation} onChange={(e) => setExplanation(e.target.value)} />
              </Field>
              <Collapsible defaultOpen={!!(card?.code || card?.title || card?.hint)} className="flex flex-col gap-4">
                <CollapsibleTrigger asChild>
                  <Button variant="link" className="self-start text-sm">
                    Title, code and hint
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="flex flex-col gap-4">
                  <Field>
                    <FieldLabel htmlFor="card-title">Title (optional)</FieldLabel>
                    <Input id="card-title" value={title} placeholder="e.g. Calling a subclass method" onChange={(e) => setTitle(e.target.value)} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="card-code">Code (optional)</FieldLabel>
                    <Textarea id="card-code" className="font-mono text-sm" rows={5} value={code} onChange={(e) => setCode(e.target.value)} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="card-lang">Code language</FieldLabel>
                    <Input id="card-lang" value={codeLang} placeholder="java, cpp, python, rust…" onChange={(e) => setCodeLang(e.target.value)} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="card-hint">Hint (optional)</FieldLabel>
                    <Input id="card-hint" value={hint} onChange={(e) => setHint(e.target.value)} />
                  </Field>
                </CollapsibleContent>
              </Collapsible>
            </FieldGroup>
          </TabsContent>
          <TabsContent value="preview">
            <div className="rounded-lg border-[3px] border-primary bg-card px-6 pt-5 pb-6 shadow-[0_4px_0_var(--accent-soft-strong)]">
              {title.trim() && <Badge variant="brand" className="mb-2">{title}</Badge>}
              <Markdown className="font-display text-lg leading-snug font-semibold" text={front} />
              {code.trim() && <CodeBlock code={code} lang={codeLang.trim().toLowerCase() || undefined} />}
            </div>
            <div className="flex flex-col gap-2 rounded-md bg-success-soft px-4 py-3">
              <span className="text-xs text-muted-foreground">Answer</span>
              <Markdown className="font-semibold text-success-ink" text={back || '…'} />
              {d.some((x) => x.trim()) && (
                <>
                  <span className="text-xs text-muted-foreground">Wrong options</span>
                  <ul className="flex flex-col gap-1">
                    {d
                      .filter((x) => x.trim())
                      .map((x, i) => (
                        <li key={i}>
                          <Markdown inline text={x} />
                        </li>
                      ))}
                  </ul>
                </>
              )}
              {hint.trim() && (
                <p className="text-sm text-warning-ink">
                  💡 <Markdown inline text={hint} />
                </p>
              )}
              {explanation.trim() && <Markdown className="text-muted-foreground" text={explanation} />}
            </div>
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="default" disabled={busy || !front.trim() || !back.trim() || (mcq && !d.some((x) => x.trim()))} onClick={() => void save()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
