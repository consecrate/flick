import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import { navigate, useApp, useAppState } from '../app-context.tsx';
import { DeckBrowser, FolderCrumbs, MoveModal, folderItem } from '../components/DeckBrowser.tsx';
import { Icon } from '../components/icons.tsx';
import { ProgressBar } from '../components/ui.tsx';
import { folderScope, playPath } from '../scope.ts';

const EMOJIS = ['📁', '📚', '🎓', '🧬', '🧪', '🧮', '🌍', '🏛️', '💻', '🎨', '🎵', '⚖️', '🩺', '📈', '🗣️', '🧠'];

export function FolderPage({ id }: { id: string }) {
  const s = useAppState();
  const { refresh, showError } = useApp();
  const [editTitle, setEditTitle] = useState(false);
  const [moving, setMoving] = useState(false);
  const f = s.folders.find((x) => x.id === id);

  useEffect(() => {
    if (!f) navigate('/');
  }, [f]);
  if (!f) return null;

  const scope = folderScope(f.id);
  const enough = f.cardCount > 0;

  const update = async (patch: { title?: string; emoji?: string }) => {
    try {
      await api.updateFolder(f.id, patch);
      await refresh();
    } catch (e) {
      showError(e);
    }
  };

  const remove = async () => {
    const inside = f.deckCount + f.folderCount > 0;
    if (!confirm(inside ? `Delete the folder “${f.title}”? Its decks and folders move up one level, nothing else is deleted.` : `Delete the folder “${f.title}”?`)) return;
    try {
      await api.deleteFolder(f.id);
      await refresh();
      navigate(f.parentId ? `/folder/${f.parentId}` : '/');
    } catch (e) {
      showError(e);
    }
  };

  return (
    <div className="page">
      <div className="page-top">
        <FolderCrumbs folderId={f.parentId} current={`${f.emoji} ${f.title}`} />
        <button className="btn small ghost" onClick={() => setMoving(true)}>
          📁 Move
        </button>
      </div>
      <section className="deck-hero">
        <div className="deck-hero-main">
          <details className="emoji-picker">
            <summary className="deck-hero-emoji">{f.emoji}</summary>
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
                defaultValue={f.title}
                onBlur={(e) => {
                  setEditTitle(false);
                  if (e.target.value.trim() && e.target.value !== f.title) void update({ title: e.target.value });
                }}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              />
            ) : (
              <h1 onClick={() => setEditTitle(true)} title="Click to rename" className="editable">
                {f.title}
              </h1>
            )}
            <div className="deck-stats">
              <span>
                <b>{f.deckCount}</b> deck{f.deckCount === 1 ? '' : 's'}
              </span>
              <span>
                <b>{f.cardCount}</b> cards
              </span>
              <span>
                <b className="due-text">{f.dueCount}</b> due
              </span>
              <span>
                <b className="new-text">{f.newCount}</b> new
              </span>
              <span>
                <b>{Math.round(f.mastery * 100)}%</b> mastered
              </span>
            </div>
            <ProgressBar value={f.mastery} height={6} />
          </div>
        </div>

        <div className="modes">
          <button className="mode-btn primary" disabled={!enough} onClick={() => navigate(playPath('quiz', scope))}>
            <span className="mode-icon">🎯</span>
            <span className="mode-name">Study folder</span>
            <span className="mode-desc">{!enough ? 'Add decks first' : f.dueCount + f.newCount > 0 ? `${f.dueCount} due · ${f.newCount} new` : 'Practice ahead'}</span>
          </button>
          <button className="mode-btn" disabled={!enough} onClick={() => navigate(playPath('flashcards', scope))}>
            <span className="mode-icon">🃏</span>
            <span className="mode-name">Flashcards</span>
            <span className="mode-desc">Flip & self-rate</span>
          </button>
          <button className="mode-btn" disabled={f.cardCount < 3} onClick={() => navigate(playPath('match', scope))}>
            <span className="mode-icon">🧩</span>
            <span className="mode-name">Match</span>
            <span className="mode-desc">Beat the clock</span>
          </button>
          <button className="mode-btn" disabled={f.cardCount < 4} onClick={() => navigate(playPath('timeattack', scope))}>
            <span className="mode-icon">⏱️</span>
            <span className="mode-name">Time Attack</span>
            <span className="mode-desc">60-second blitz</span>
          </button>
          <button className="mode-btn boss" disabled={!f.bossReady} onClick={() => navigate(playPath('boss', scope))}>
            <span className="mode-icon">⚔️</span>
            <span className="mode-name">Boss Fight</span>
            <span className="mode-desc">
              {f.bossReady ? (
                'Your hardest cards'
              ) : (
                <>
                  <Icon name="lock" size={12} /> Study a few cards
                </>
              )}
            </span>
          </button>
        </div>
      </section>

      <DeckBrowser folderId={f.id} />

      <div className="danger-zone">
        <button className="link danger" onClick={() => void remove()}>
          Delete folder
        </button>
      </div>

      {moving && <MoveModal item={folderItem(f, s.folders)} onClose={() => setMoving(false)} />}
    </div>
  );
}
