import { useRef, useState } from 'react';
import { api, type GenerateResult, type SourceInput } from '../api.ts';
import { useApp } from '../app-context.tsx';
import { sfx } from '../sound.ts';
import { ClaudeLoader, Modal } from './ui.tsx';

type Tab = 'files' | 'text' | 'url' | 'topic' | 'pairs';

const TABS: { id: Tab; label: string }[] = [
  { id: 'files', label: 'Files' },
  { id: 'text', label: 'Notes' },
  { id: 'url', label: 'Web link' },
  { id: 'topic', label: 'Topic' },
  { id: 'pairs', label: 'Import list' },
];

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
    (tab === 'pairs' && text.trim().length > 2);

  const submit = async () => {
    setBusy(true);
    try {
      let source: SourceInput;
      if (tab === 'files') source = { type: 'files', files: await Promise.all(files.map(async (f) => ({ name: f.name, data: await readBase64(f) }))) };
      else if (tab === 'text') source = { type: 'text', text };
      else if (tab === 'url') source = { type: 'url', url: url.trim() };
      else if (tab === 'topic') source = { type: 'topic', topic };
      else source = { type: 'pairs', text };
      const r = await api.generate({ deckId, source, count, focus: focus || undefined, level: level || undefined, title: title || undefined });
      sfx.unlock();
      toast({ title: `${r.added} cards added to ${r.deck.title}`, kind: 'success' });
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

  return (
    <Modal onClose={busy ? () => {} : onClose} wide>
      <h2>{deckId ? 'Add study material' : 'Create a deck'}</h2>
      <p className="muted">Drop in anything you are studying and Claude turns it into quiz-ready flashcards.</p>
      {busy ? (
        tab === 'pairs' ? (
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

          {tab !== 'pairs' && (
            <div className="gen-options">
              <label>
                <span>Cards: {count}</span>
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
            <button className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn primary big" disabled={!ready} onClick={() => void submit()}>
              {tab === 'pairs' ? 'Import cards' : '✨ Generate flashcards'}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
