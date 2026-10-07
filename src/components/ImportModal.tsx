import { useMemo, useRef, useState } from 'react';
import { buildMcqPrompt, parseMcqs } from '../../shared/mcq.ts';
import { api, type GenerateResult, type SourceInput } from '../api.ts';
import { navigate, useApp } from '../app-context.tsx';
import { sfx } from '../sound.ts';
import { ClaudeLoader, Modal } from './ui.tsx';

type Tab = 'files' | 'text' | 'url' | 'topic' | 'pairs' | 'mcq';

const TABS: { id: Tab; label: string }[] = [
  { id: 'files', label: 'Files' },
  { id: 'text', label: 'Notes' },
  { id: 'url', label: 'Web link' },
  { id: 'topic', label: 'Topic' },
  { id: 'pairs', label: 'Import list' },
  { id: 'mcq', label: 'Paste MCQs' },
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

export function ImportModal({ deckId, onClose, onDone }: { deckId?: string; onClose: () => void; onDone: (r: GenerateResult) => void }) {
  const { showError, refresh, announceAchievements, toast } = useApp();
  const [tab, setTab] = useState<Tab>('files');
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [topic, setTopic] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [count, setCount] = useState(15);
  const [focus, setFocus] = useState('');
  const [level, setLevel] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [style, setStyle] = useState<'cards' | 'mcq'>('cards');
  const [mcqText, setMcqText] = useState('');
  const [mcqTopic, setMcqTopic] = useState('');
  const [copied, setCopied] = useState(false);
  const [blank, setBlank] = useState(false);
  const prompt = useMemo(() => buildMcqPrompt({ topic: mcqTopic, count, level }), [mcqTopic, count, level]);
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
      const r = await api.generate({ deckId, source, count, focus: focus || undefined, level: level || undefined, title: title || undefined, style });
      sfx.unlock();
      toast({ title: `${r.added} ${tab === 'mcq' || style === 'mcq' ? 'questions' : 'cards'} added to ${r.deck.title}`, kind: 'success' });
      if (r.skipped) toast({ title: `${r.skipped} question${r.skipped === 1 ? '' : 's'} skipped`, body: 'They were not in the expected format.' });
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
      const d = await api.createDeck({ title });
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

  if (blank) {
    return (
      <Modal onClose={busy ? () => {} : onClose}>
        <h2>New empty deck</h2>
        <p className="muted">Name it now and add cards whenever you are ready.</p>
        <input
          className="input"
          autoFocus
          placeholder="Deck title, e.g. Spanish verbs"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && title.trim() && !busy && void createEmpty()}
        />
        <div className="modal-actions">
          <button className="btn ghost" disabled={busy} onClick={() => setBlank(false)}>
            Back
          </button>
          <button className="btn primary" disabled={busy || !title.trim()} onClick={() => void createEmpty()}>
            Create deck
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal onClose={busy ? () => {} : onClose} wide>
      <h2>{deckId ? 'Add study material' : 'Create a deck'}</h2>
      <p className="muted">Drop in anything you are studying and Claude turns it into quiz-ready flashcards.</p>
      {busy ? (
        tab === 'pairs' || tab === 'mcq' ? (
          <ClaudeLoader lines={['Importing your cards…']} />
        ) : (
          <ClaudeLoader />
        )
      ) : (
        <>
          <div className="tabs">
            {TABS.map((t) => (
              <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'files' && (
            <div
              className={`dropzone ${drag ? 'drag' : ''}`}
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
              <p className="muted small">PDFs, lecture slides saved as PDF, photos of notes, text and Markdown files, subtitles (.srt/.vtt)</p>
              {files.length > 0 && (
                <ul className="file-list" onClick={(e) => e.stopPropagation()}>
                  {files.map((f, i) => (
                    <li key={i}>
                      {f.name} <span className="muted small">({Math.ceil(f.size / 1024)} KB)</span>
                      <button className="link" onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                        remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {tab === 'text' && <textarea className="input" rows={10} placeholder="Paste lecture notes, a textbook passage, a transcript…" value={text} onChange={(e) => setText(e.target.value)} />}
          {tab === 'url' && (
            <>
              <input className="input" placeholder="https://en.wikipedia.org/wiki/Krebs_cycle" value={url} onChange={(e) => setUrl(e.target.value)} />
              <p className="muted small">Claude fetches the page and writes cards from its main content. Works best with articles and docs; paywalled pages will fail.</p>
            </>
          )}
          {tab === 'topic' && (
            <>
              <input className="input" placeholder="e.g. Organic chemistry functional groups, Spanish past tense, AWS networking" value={topic} onChange={(e) => setTopic(e.target.value)} />
              <p className="muted small">No material? Claude writes cards from its own knowledge.</p>
            </>
          )}
          {tab === 'pairs' && (
            <>
              <textarea
                className="input mono"
                rows={10}
                placeholder={'One card per line: term, then definition.\nPhotosynthesis\tConverting light to chemical energy\nmitochondria - powerhouse of the cell\nBonjour: Hello'}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <p className="muted small">Paste a Quizlet export, an Anki “Notes in plain text” export, or a CSV. Separators: tab, “ - ”, “:”, “;”, or comma. Imports instantly without AI.</p>
              {!deckId && <input className="input" placeholder="Deck title" value={title} onChange={(e) => setTitle(e.target.value)} />}
            </>
          )}

          {tab === 'mcq' && (
            <div className="mcq-import">
              <div className="mcq-step">
                <div className="mcq-step-head">
                  <span className="step-num">1</span>
                  <div className="grow">
                    <b>Copy the prompt into Claude or any AI chat</b>
                    <p className="muted small">Then attach or paste your notes, slides or past exam. The prompt asks for hard, fair questions with code where it fits.</p>
                  </div>
                </div>
                <div className="mcq-prompt-opts">
                  <input className="input" placeholder="Topic (optional), e.g. Java inheritance, C++ move semantics" value={mcqTopic} onChange={(e) => setMcqTopic(e.target.value)} />
                  <select className="input" value={count} onChange={(e) => setCount(+e.target.value)} aria-label="Number of questions">
                    {[5, 10, 15, 20, 25, 30, 35, 40, 45, 50].map((n) => (
                      <option key={n} value={n}>
                        {n} questions
                      </option>
                    ))}
                  </select>
                  <button className={`btn ${copied ? 'good' : 'primary'}`} onClick={() => void copyPrompt()}>
                    {copied ? '✅ Copied' : '📋 Copy prompt'}
                  </button>
                </div>
                <details className="mcq-prompt-preview">
                  <summary>See the prompt</summary>
                  <pre>{prompt}</pre>
                </details>
              </div>
              <div className="mcq-step">
                <div className="mcq-step-head">
                  <span className="step-num">2</span>
                  <div className="grow">
                    <b>Paste the AI’s reply here</b>
                  </div>
                </div>
                <textarea
                  className="input mono"
                  rows={9}
                  placeholder={'## Calling a subclass method\nIn Java, what happens when you run this?\n\n```java\n...\n```\n\n- [x] Compilation error\n- [ ] Prints Woof, then Fetching\n\nHint: ...\nExplanation: ...'}
                  value={mcqText}
                  onChange={(e) => setMcqText(e.target.value)}
                />
                {parsed && (
                  <div className="mcq-check">
                    {parsed.questions.length > 0 && (
                      <div className="mcq-ok">
                        ✅ {parsed.questions.length} question{parsed.questions.length === 1 ? '' : 's'} ready
                        {parsed.questions.some((q) => q.code) && <span className="muted"> · {parsed.questions.filter((q) => q.code).length} with code</span>}
                        <span className="muted"> · up to {Math.max(...parsed.questions.map((q) => q.distractors.length + 1))} options</span>
                      </div>
                    )}
                    {parsed.questions.length === 0 && parsed.errors.length === 0 && <div className="mcq-bad">No questions found. Each question must start with a line like “## Title”.</div>}
                    {parsed.errors.slice(0, 4).map((e) => (
                      <div key={e.index} className="mcq-bad">
                        ⚠️ <b>{e.title}</b> {e.message}. It will be skipped.
                      </div>
                    ))}
                    {parsed.errors.length > 4 && <div className="mcq-bad">…and {parsed.errors.length - 4} more that will be skipped.</div>}
                  </div>
                )}
              </div>
              {!deckId && <input className="input" placeholder="Deck title" value={title} onChange={(e) => setTitle(e.target.value)} />}
            </div>
          )}

          {tab !== 'pairs' && tab !== 'mcq' && (
            <div className="segmented" role="radiogroup" aria-label="Card style">
              <button role="radio" aria-checked={style === 'cards'} className={style === 'cards' ? 'active' : ''} onClick={() => setStyle('cards')}>
                🃏 Flashcards <span className="muted small">short answers you recall</span>
              </button>
              <button role="radio" aria-checked={style === 'mcq'} className={style === 'mcq' ? 'active' : ''} onClick={() => setStyle('mcq')}>
                🎯 Multiple choice <span className="muted small">exam-style, with code when it fits</span>
              </button>
            </div>
          )}

          {tab !== 'pairs' && tab !== 'mcq' && (
            <div className="gen-options">
              <label>
                <span>
                  {style === 'mcq' ? 'Questions' : 'Cards'}: {count}
                </span>
                <input type="range" min={5} max={50} step={5} value={count} onChange={(e) => setCount(+e.target.value)} />
              </label>
              <label>
                <span>Focus (optional)</span>
                <input className="input" placeholder="e.g. dates and key people" value={focus} onChange={(e) => setFocus(e.target.value)} />
              </label>
              <label>
                <span>Level</span>
                <select className="input" value={level} onChange={(e) => setLevel(e.target.value)}>
                  <option value="">Auto</option>
                  <option>High school</option>
                  <option>Undergraduate</option>
                  <option>Graduate / professional</option>
                  <option>Beginner language learner</option>
                </select>
              </label>
            </div>
          )}

          <div className="modal-actions">
            {!deckId && (
              <>
                <button className="btn ghost" onClick={() => setBlank(true)}>
                  Start with an empty deck
                </button>
                <div className="grow" />
              </>
            )}
            <button className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn primary big" disabled={!ready} onClick={() => void submit()}>
              {tab === 'pairs' ? 'Import cards' : tab === 'mcq' ? `Import ${parsed?.questions.length || ''} questions` : style === 'mcq' ? '✨ Generate questions' : '✨ Generate flashcards'}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
