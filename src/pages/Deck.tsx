import { useCallback, useEffect, useMemo, useState } from 'react';
import { MAX_OPTIONS } from '../../shared/mcq.ts';
import { api, type CardView, type DeckDetail } from '../api.ts';
import { navigate, useApp, useAppState } from '../app-context.tsx';
import { Inline } from '../components/Code.tsx';
import { FolderCrumbs, MoveModal, deckItem } from '../components/DeckBrowser.tsx';
import { ExplainModal } from '../components/ExplainModal.tsx';
import { ImportModal } from '../components/ImportModal.tsx';
import { Icon } from '../components/icons.tsx';
import { ClaudeLoader, EmptyState, MasteryBar, Modal, Spinner, TierChip } from '../components/ui.tsx';

const EMOJIS = ['📘', '🧬', '🧪', '🧮', '🌍', '🏛️', '💻', '🎨', '🎵', '⚖️', '🩺', '📈', '🗣️', '🔭', '🧠', '📜'];

export function DeckPage({ id }: { id: string }) {
  const { showError, refresh, toast } = useApp();
  const [data, setData] = useState<DeckDetail | null>(null);
  const [tab, setTab] = useState<'cards' | 'materials'>('cards');
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState<CardView | 'new' | null>(null);
  const [explaining, setExplaining] = useState<CardView | null>(null);
  const [query, setQuery] = useState('');
  const [enhancing, setEnhancing] = useState(false);
  const [editTitle, setEditTitle] = useState(false);
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

  if (!data) {
    return (
      <div className="page center">
        <Spinner />
      </div>
    );
  }
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
    if (!confirm(`Delete ${what}? This cannot be undone.`)) return;
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
        if (!confirm('Delete this card?')) return;
        await api.deleteCard(c.id);
      }
      await load();
      void refresh();
    } catch (e) {
      showError(e);
    }
  };

  const enough = d.cardCount > 0;

  return (
    <div className="page">
      <div className="page-top">
        <FolderCrumbs folderId={s.folders.some((f) => f.id === d.folderId) ? d.folderId! : null} />
        <button className="btn small ghost" onClick={() => setMoving(true)}>
          📁 Move to folder
        </button>
      </div>
      <section className="deck-hero">
        <div className="deck-hero-main">
          <details className="emoji-picker">
            <summary className="deck-hero-emoji">{d.emoji}</summary>
            <div className="emoji-grid">
              {EMOJIS.map((e) => (
                <button key={e} onClick={() => void update({ emoji: e })}>
                  {e}
                </button>
              ))}
            </div>
          </details>
          <div className="grow">
            {editTitle ? (
              <input
                className="input title-input"
                autoFocus
                defaultValue={d.title}
                onBlur={(e) => {
                  setEditTitle(false);
                  if (e.target.value.trim() && e.target.value !== d.title) void update({ title: e.target.value });
                }}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              />
            ) : (
              <h1 onClick={() => setEditTitle(true)} title="Click to rename" className="editable">
                {d.title}
              </h1>
            )}
            {d.description && <p className="muted">{d.description}</p>}
            <div className="deck-stats">
              <span>
                <b>{d.cardCount}</b> cards
              </span>
              <span>
                <b className="due-text">{d.dueCount}</b> due
              </span>
              <span>
                <b className="new-text">{d.newCount}</b> new
              </span>
              <span>
                <b>{Math.round(d.mastery * 100)}%</b> mastered
              </span>
            </div>
            <MasteryBar tiers={tiers} height={6} />
          </div>
        </div>

        <div className="modes">
          <button className="mode-btn primary" disabled={!enough} onClick={() => navigate(`/play/quiz/${d.id}`)}>
            <span className="mode-icon">🎯</span>
            <span className="mode-name">Quiz</span>
            <span className="mode-desc">{!enough ? 'Add cards first' : d.dueCount + d.newCount > 0 ? `${d.dueCount} due · ${d.newCount} new` : 'Practice ahead'}</span>
          </button>
          <button className="mode-btn" disabled={!enough} onClick={() => navigate(`/play/flashcards/${d.id}`)}>
            <span className="mode-icon">🃏</span>
            <span className="mode-name">Flashcards</span>
            <span className="mode-desc">Flip & self-rate</span>
          </button>
          <button className="mode-btn" disabled={d.cardCount < 3} onClick={() => navigate(`/play/match/${d.id}`)}>
            <span className="mode-icon">🧩</span>
            <span className="mode-name">Match</span>
            <span className="mode-desc">Beat the clock</span>
          </button>
          <button className="mode-btn" disabled={d.cardCount < 4} onClick={() => navigate(`/play/timeattack/${d.id}`)}>
            <span className="mode-icon">⏱️</span>
            <span className="mode-name">Time Attack</span>
            <span className="mode-desc">60-second blitz</span>
          </button>
          <button className="mode-btn boss" disabled={!d.bossReady} onClick={() => navigate(`/play/boss/${d.id}`)}>
            <span className="mode-icon">⚔️</span>
            <span className="mode-name">Boss Fight</span>
            <span className="mode-desc">
              {d.bossReady ? (
                'Your hardest cards'
              ) : (
                <>
                  <Icon name="lock" size={12} /> Study {data.bossMinCards}+ cards
                </>
              )}
            </span>
          </button>
        </div>
      </section>

      <div className="tabs">
        <button className={`tab ${tab === 'cards' ? 'active' : ''}`} onClick={() => setTab('cards')}>
          🃏 Cards <span className="num">{data.cards.length}</span>
        </button>
        <button className={`tab ${tab === 'materials' ? 'active' : ''}`} onClick={() => setTab('materials')}>
          📚 Materials <span className="num">{data.materials.length}</span>
        </button>
        <div className="grow" />
        <button className="btn ghost" onClick={() => setEditing('new')}>
          <Icon name="plus" /> Card
        </button>
        <button className="btn" onClick={() => setImporting(true)}>
          <Icon name="plus" /> Add material
        </button>
      </div>

      {tab === 'cards' && (
        <>
          {missingOptions > 0 && (
            <div className="notice">
              {enhancing ? (
                <ClaudeLoader lines={['Claude is writing multiple-choice options…', 'Making the wrong answers tempting…']} />
              ) : (
                <>
                  <span>
                    {missingOptions} card{missingOptions === 1 ? '' : 's'} have no multiple-choice options yet.
                  </span>
                  <button className="btn small primary" onClick={() => void enhance()}>
                    🧠 Write quiz options with Claude
                  </button>
                </>
              )}
            </div>
          )}
          {data.cards.length > 6 && <input className="input search" placeholder="Search cards…" value={query} onChange={(e) => setQuery(e.target.value)} />}
          {data.cards.length === 0 ? (
            <EmptyState mood="wow" title="No cards yet">
              <p className="muted">Write cards yourself, or add notes, a PDF, a link or a topic and Claude writes them.</p>
              <div className="row center-row">
                <button className="btn" onClick={() => setEditing('new')}>
                  <Icon name="plus" /> Write a card
                </button>
                <button className="btn primary" onClick={() => setImporting(true)}>
                  ✨ Add material
                </button>
              </div>
            </EmptyState>
          ) : (
            <div className="card-list">
              {filtered.map((c) => (
                <div key={c.id} className={`card-row ${c.suspended ? 'suspended' : ''}`}>
                  <div className="card-row-main" onClick={() => setEditing(c)}>
                    <div className="card-front">
                      {c.mcq && <span className="chip">🎯 {c.distractors.length + 1} options</span>}
                      {c.code && <span className="chip">{'</>'} {c.codeLang ?? 'code'}</span>}
                      <span>
                        {c.title ? `${c.title}: ` : ''}
                        {c.front}
                      </span>
                    </div>
                    <div className="card-back">
                      <Inline text={c.back} />
                    </div>
                  </div>
                  <div className="card-row-meta">
                    <TierChip tier={c.tier} />
                    {c.srs.state !== 0 && <span className="muted small" title="Predicted chance you remember it right now">{Math.round(c.recall * 100)}% recall</span>}
                    {c.suspended && <span className="muted small">paused</span>}
                  </div>
                  <div className="card-row-actions">
                    <button className="icon-btn" title="Ask Claude about this card" onClick={() => setExplaining(c)}>
                      <Icon name="chat" />
                    </button>
                    <button className={`icon-btn ${c.starred ? 'on' : ''}`} title={c.starred ? 'Unstar' : 'Star'} onClick={() => void cardAction(c, 'star')}>
                      <Icon name="star" filled={c.starred} />
                    </button>
                    <details className="menu">
                      <summary className="icon-btn" title="More">
                        <Icon name="more" />
                      </summary>
                      <div className="menu-items">
                        <button onClick={() => setEditing(c)}>Edit</button>
                        <button onClick={() => void cardAction(c, 'suspend')}>{c.suspended ? 'Resume' : 'Pause'}</button>
                        <button onClick={() => void cardAction(c, 'reset')}>Reset progress</button>
                        <button className="danger" onClick={() => void cardAction(c, 'delete')}>
                          Delete
                        </button>
                      </div>
                    </details>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'materials' && (
        <div className="card-list">
          {data.materials.length === 0 && (
            <EmptyState mood="sleepy" title="No materials yet">
              <p className="muted">Add PDFs, notes, links or topics. Each one adds new cards to this deck.</p>
            </EmptyState>
          )}
          {data.materials.map((m) => (
            <div key={m.id} className="card-row">
              <div className="card-row-main">
                <div className="card-front">
                  <span className="chip">{{ text: '📝 Notes', file: '📄 File', url: '🔗 Link', topic: '💭 Topic', import: '📥 List', mcq: '📋 Pasted' }[m.kind]}</span>
                  {m.title}
                </div>
                <div className="card-back muted">{m.preview}</div>
              </div>
              <div className="card-row-meta">
                <span className="muted small">{m.cardCount} cards</span>
                <span className="muted small">{new Date(m.addedAt).toLocaleDateString()}</span>
              </div>
              <div className="card-row-actions">
                <button
                  className="icon-btn"
                  title="Remove material"
                  onClick={async () => {
                    const withCards = confirm(`Also delete the ${m.cardCount} cards made from “${m.title}”?\nOK = delete cards too, Cancel = keep cards.`);
                    try {
                      await api.deleteMaterial(m.id, withCards);
                      await load();
                      void refresh();
                    } catch (e) {
                      showError(e);
                    }
                  }}
                >
                  <Icon name="trash" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="danger-zone">
        <button className="link danger" onClick={() => void remove()}>
          Delete deck
        </button>
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
    </div>
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
    <Modal onClose={onClose}>
      <h2>{card ? 'Edit card' : 'New card'}</h2>
      <label className="field">
        <span>Question</span>
        <textarea className="input" rows={2} value={front} onChange={(e) => setFront(e.target.value)} autoFocus />
      </label>
      <label className="field">
        <span>Answer</span>
        <input className="input" value={back} onChange={(e) => setBack(e.target.value)} />
      </label>
      <label className="check">
        <input type="checkbox" checked={mcq} onChange={(e) => setMcq(e.target.checked)} />
        <span>Always ask as multiple choice, with every option below</span>
      </label>
      <div className="field">
        <span>Wrong options for multiple choice{mcq ? '' : ' (optional)'}</span>
        {d.slice(0, Math.max(3, mcq ? d.length : 3)).map((x, i) => (
          <input key={i} className="input" value={x} placeholder={`Wrong option ${i + 1}`} onChange={(e) => setD(d.map((y, j) => (j === i ? e.target.value : y)))} />
        ))}
        {mcq && d.length < maxWrong && (
          <button className="link" onClick={() => setD([...d, ''])}>
            + Add an option
          </button>
        )}
      </div>
      <label className="field">
        <span>Explanation (optional)</span>
        <textarea className="input" rows={2} value={explanation} onChange={(e) => setExplanation(e.target.value)} />
      </label>
      <details className="field more-fields" open={!!(card?.code || card?.title || card?.hint)}>
        <summary>Title, code and hint</summary>
        <label className="field">
          <span>Title (optional)</span>
          <input className="input" value={title} placeholder="e.g. Calling a subclass method" onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="field">
          <span>Code (optional)</span>
          <textarea className="input mono" rows={5} value={code} onChange={(e) => setCode(e.target.value)} />
        </label>
        <label className="field">
          <span>Code language</span>
          <input className="input" value={codeLang} placeholder="java, cpp, python, rust…" onChange={(e) => setCodeLang(e.target.value)} />
        </label>
        <label className="field">
          <span>Hint (optional)</span>
          <input className="input" value={hint} onChange={(e) => setHint(e.target.value)} />
        </label>
      </details>
      <div className="modal-actions">
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn primary" disabled={busy || !front.trim() || !back.trim() || (mcq && !d.some((x) => x.trim()))} onClick={() => void save()}>
          Save
        </button>
      </div>
    </Modal>
  );
}
