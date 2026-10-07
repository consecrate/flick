import { useMemo, useRef, useState, type ReactNode } from 'react';
import { buildImportPrompt, parseMcqs } from '../../shared/mcq.ts';
import { api, type GenerateResult, type SourceInput } from '../api.ts';
import { navigate, useApp } from '../app-context.tsx';
import { sfx } from '../sound.ts';
import { ClaudeLoader } from './shared.tsx';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

type Tab = 'files' | 'text' | 'url' | 'topic' | 'pairs' | 'mcq';

const TABS: { id: Tab; label: string }[] = [
  { id: 'files', label: 'Files' },
  { id: 'text', label: 'Notes' },
  { id: 'url', label: 'Web link' },
  { id: 'topic', label: 'Topic' },
  { id: 'pairs', label: 'Import list' },
  { id: 'mcq', label: 'Paste from AI' },
];

/** Put text on the clipboard, falling back to a hidden textarea where the async API is blocked. */
async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    if (!ok) throw new Error('Could not copy. Open “See the prompt” and copy it by hand.');
  }
}

/** Select items cannot have an empty value, so "Auto" has its own. */
const AUTO = 'auto';
const LEVELS = ['High school', 'Undergraduate', 'Graduate / professional', 'Beginner language learner'];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const ACCEPT = '.pdf,.png,.jpg,.jpeg,.gif,.webp,.txt,.md,.csv,.tsv,.html,.srt,.vtt,.json';
const MAX_BYTES = 30 * 1024 * 1024;

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function ImportModal({ deckId, folderId, onClose, onDone }: { deckId?: string; folderId?: string | null; onClose: () => void; onDone: (r: GenerateResult) => void }) {
  const { showError, refresh, announceAchievements, toast } = useApp();
  const [tab, setTab] = useState<Tab>('files');
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [topic, setTopic] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [focus, setFocus] = useState('');
  const [level, setLevel] = useState(AUTO);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [mcqText, setMcqText] = useState('');
  const [mcqTopic, setMcqTopic] = useState('');
  const [copied, setCopied] = useState(false);
  const [blank, setBlank] = useState(false);
  const prompt = useMemo(() => buildImportPrompt({ topic: mcqTopic, level: level === AUTO ? '' : level }), [mcqTopic, level]);
  const parsed = useMemo(() => (tab === 'mcq' && mcqText.trim() ? parseMcqs(mcqText) : null), [tab, mcqText]);

  const copyPrompt = async () => {
    try {
      await copyText(prompt);
      sfx.click();
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      showError(e);
    }
  };
  const fileInput = useRef<HTMLInputElement>(null);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const next = [...files, ...Array.from(list)];
    const total = next.reduce((s, f) => s + f.size, 0);
    if (total > MAX_BYTES) {
      showError(new Error('Files are too large together (30 MB max).'));
      return;
    }
    setFiles(next);
  };

  const ready =
    (tab === 'files' && files.length > 0) ||
    (tab === 'text' && text.trim().length > 20) ||
    (tab === 'url' && /^https?:\/\/\S+/.test(url.trim())) ||
    (tab === 'topic' && topic.trim().length > 1) ||
    (tab === 'pairs' && text.trim().length > 2) ||
    (tab === 'mcq' && !!parsed?.questions.length);

  const submit = async () => {
    setBusy(true);
    try {
      let source: SourceInput;
      if (tab === 'files') source = { type: 'files', files: await Promise.all(files.map(async (f) => ({ name: f.name, data: await readBase64(f) }))) };
      else if (tab === 'text') source = { type: 'text', text };
      else if (tab === 'url') source = { type: 'url', url: url.trim() };
      else if (tab === 'topic') source = { type: 'topic', topic };
      else if (tab === 'pairs') source = { type: 'pairs', text };
      else source = { type: 'mcq', text: mcqText };
      const r = await api.generate({ deckId, source, focus: focus || undefined, level: level === AUTO ? undefined : level, title: title || undefined });
      sfx.unlock();
      toast({ title: `${r.added} cards added to ${r.deck.title}`, kind: 'success' });
      if (r.skipped) toast({ title: `${r.skipped} card${r.skipped === 1 ? '' : 's'} skipped`, body: 'They were not in the expected format.' });
      if (r.needsDistractors) {
        toast({ title: 'Tip: use “Write quiz options” on the deck', body: 'Claude can write multiple-choice options for imported cards.' });
      }
      await refresh();
      announceAchievements(r.newAchievements);
      onDone(r);
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };

  const createEmpty = async () => {
    setBusy(true);
    try {
      const d = await api.createDeck({ title, folderId });
      sfx.unlock();
      await refresh();
      announceAchievements(d.newAchievements);
      onClose();
      navigate(`/deck/${d.id}`);
    } catch (e) {
      showError(e);
      setBusy(false);
    }
  };

  const close = () => !busy && onClose();

  if (blank) {
    return (
      <Dialog open onOpenChange={(open) => !open && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New empty deck</DialogTitle>
            <DialogDescription>Name it now and add cards whenever you are ready.</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="Deck title, e.g. Spanish verbs"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && title.trim() && !busy && void createEmpty()}
          />
          <DialogFooter>
            <Button variant="ghost" disabled={busy} onClick={() => setBlank(false)}>
              Back
            </Button>
            <Button variant="default" disabled={busy || !title.trim()} onClick={() => void createEmpty()}>
              Create deck
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  const deckTitle = !deckId && <Input placeholder="Deck title" value={title} onChange={(e) => setTitle(e.target.value)} />;

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="w-[min(760px,calc(100%-2rem))]" showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>{deckId ? 'Add study material' : 'Create a deck'}</DialogTitle>
          <DialogDescription>Drop in anything you are studying. Claude covers all of it with a mix of flashcards and multiple-choice questions.</DialogDescription>
        </DialogHeader>
        {busy ? (
          tab === 'pairs' || tab === 'mcq' ? <ClaudeLoader lines={['Importing your cards…']} /> : <ClaudeLoader />
        ) : (
          <>
            <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
              <TabsList>
                {TABS.map((t) => (
                  <TabsTrigger key={t.id} value={t.id}>
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value="files">
                <div
                  className={cn(
                    'cursor-pointer rounded-lg border-2 border-dashed border-input p-8 text-center transition-colors hover:border-primary hover:bg-accent',
                    drag && 'border-primary bg-accent',
                  )}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDrag(true);
                  }}
                  onDragLeave={() => setDrag(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDrag(false);
                    addFiles(e.dataTransfer.files);
                  }}
                  onClick={() => fileInput.current?.click()}
                >
                  <input ref={fileInput} type="file" multiple accept={ACCEPT} hidden onChange={(e) => addFiles(e.target.files)} />
                  <p>
                    <strong>Drop files here</strong> or click to browse
                  </p>
                  <p className="text-sm text-muted-foreground">PDFs, lecture slides saved as PDF, photos of notes, text and Markdown files, subtitles (.srt/.vtt)</p>
                  {files.length > 0 && (
                    <ul className="mt-3 text-left text-sm" onClick={(e) => e.stopPropagation()}>
                      {files.map((f, i) => (
                        <li key={i} className="flex items-center gap-2 py-1">
                          {f.name} <span className="text-sm text-muted-foreground">({Math.ceil(f.size / 1024)} KB)</span>
                          <Button variant="link" className="ml-auto" onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                            remove
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </TabsContent>
              <TabsContent value="text">
                <Textarea rows={10} placeholder="Paste lecture notes, a textbook passage, a transcript…" value={text} onChange={(e) => setText(e.target.value)} />
              </TabsContent>
              <TabsContent value="url">
                <Input placeholder="https://en.wikipedia.org/wiki/Krebs_cycle" value={url} onChange={(e) => setUrl(e.target.value)} />
                <p className="text-sm text-muted-foreground">Claude fetches the page and writes cards from its main content. Works best with articles and docs; paywalled pages will fail.</p>
              </TabsContent>
              <TabsContent value="topic">
                <Input placeholder="e.g. Organic chemistry functional groups, Spanish past tense, AWS networking" value={topic} onChange={(e) => setTopic(e.target.value)} />
                <p className="text-sm text-muted-foreground">No material? Claude writes cards from its own knowledge.</p>
              </TabsContent>
              <TabsContent value="pairs">
                <Textarea
                  className="font-mono text-sm"
                  rows={10}
                  placeholder={'One card per line: term, then definition.\nPhotosynthesis\tConverting light to chemical energy\nmitochondria - powerhouse of the cell\nBonjour: Hello'}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
                <p className="text-sm text-muted-foreground">
                  Paste a Quizlet export, an Anki “Notes in plain text” export, or a CSV. Separators: tab, “ - ”, “:”, “;”, or comma. Imports instantly without AI.
                </p>
                {deckTitle}
              </TabsContent>

              <TabsContent value="mcq" className="gap-4">
                <Step n={1} title="Copy the prompt into Claude or any AI chat">
                  Then attach or paste your notes, slides or past exam. The AI decides how many cards it takes to cover everything, and mixes flashcards with multiple-choice
                  questions (with code and math where they fit).
                </Step>
                <div className="grid grid-cols-[1fr_auto] gap-2 max-[640px]:grid-cols-1">
                  <Input placeholder="Topic (optional), e.g. Java inheritance, C++ move semantics" value={mcqTopic} onChange={(e) => setMcqTopic(e.target.value)} />
                  <Button variant={copied ? 'success' : 'default'} onClick={() => void copyPrompt()}>
                    {copied ? '✅ Copied' : '📋 Copy prompt'}
                  </Button>
                </div>
                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <Button variant="link" className="text-sm">
                      See the prompt
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <pre className="mt-2 max-h-[220px] overflow-auto rounded-sm bg-muted p-3 font-mono text-xs whitespace-pre-wrap">{prompt}</pre>
                  </CollapsibleContent>
                </Collapsible>
                <Step n={2} title="Paste the AI’s reply here" />
                <Textarea
                  className="font-mono text-sm"
                  rows={9}
                  placeholder={'## Where the Krebs cycle runs\nIn eukaryotic cells, where does the Krebs cycle take place?\nAnswer: The mitochondrial matrix\n\n## Calling a subclass method\nIn Java, what happens when you run this?\n```java\n...\n```\n- [x] Compilation error\n- [ ] Prints Woof, then Fetching'}
                  value={mcqText}
                  onChange={(e) => setMcqText(e.target.value)}
                />
                {parsed && (
                  <div className="flex flex-col gap-1 text-sm">
                    {parsed.questions.length > 0 && (
                      <div className="font-semibold text-success-ink">
                        ✅ {parsed.questions.length} card{parsed.questions.length === 1 ? '' : 's'} ready
                        <span className="font-normal text-muted-foreground">
                          {' · '}
                          {plural(parsed.questions.filter((q) => q.flashcard).length, 'flashcard')} · {parsed.questions.filter((q) => !q.flashcard).length} multiple choice
                          {parsed.questions.some((q) => q.code) && ` · ${parsed.questions.filter((q) => q.code).length} with code`}
                        </span>
                      </div>
                    )}
                    {parsed.questions.length === 0 && parsed.errors.length === 0 && <div className="text-destructive">No cards found. Each card must start with a line like “## Title”.</div>}
                    {parsed.errors.slice(0, 4).map((e) => (
                      <div key={e.index} className="text-destructive">
                        ⚠️ <b>{e.title}</b> {e.message}. It will be skipped.
                      </div>
                    ))}
                    {parsed.errors.length > 4 && <div className="text-destructive">…and {parsed.errors.length - 4} more that will be skipped.</div>}
                  </div>
                )}
                {deckTitle}
              </TabsContent>
            </Tabs>

            {tab !== 'pairs' && tab !== 'mcq' && (
              <div className="grid grid-cols-[1.4fr_1fr] gap-3 max-[860px]:grid-cols-1">
                <Field>
                  <FieldLabel htmlFor="gen-focus" className="font-medium">
                    Focus (optional)
                  </FieldLabel>
                  <Input id="gen-focus" placeholder="e.g. dates and key people" value={focus} onChange={(e) => setFocus(e.target.value)} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="gen-level" className="font-medium">
                    Level
                  </FieldLabel>
                  <Select value={level} onValueChange={setLevel}>
                    <SelectTrigger id="gen-level">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={AUTO}>Auto</SelectItem>
                      {LEVELS.map((l) => (
                        <SelectItem key={l} value={l}>
                          {l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            )}

            <DialogFooter>
              {!deckId && (
                <>
                  <Button variant="ghost" onClick={() => setBlank(true)}>
                    Start with an empty deck
                  </Button>
                  <div className="flex-1" />
                </>
              )}
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="default" size="lg" disabled={!ready} onClick={() => void submit()}>
                {tab === 'pairs' ? 'Import cards' : tab === 'mcq' ? `Import ${parsed?.questions.length || ''} cards` : '✨ Generate cards'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Step({ n, title, children }: { n: number; title: string; children?: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid size-7 flex-none place-items-center rounded-full bg-primary font-display font-bold text-primary-foreground">{n}</span>
      <div className="flex-1">
        <b>{title}</b>
        {children && <FieldDescription className="mt-0.5">{children}</FieldDescription>}
      </div>
    </div>
  );
}
