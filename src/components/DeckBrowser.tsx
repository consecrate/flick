// Decks and folders at one level of the folder tree, with drag and drop to
// move them, plus the dialogs for making folders and moving things.

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { canMoveFolder, folderPath } from '../../shared/folders.ts';
import type { DeckSummary, FolderSummary } from '../../shared/types.ts';
import { api } from '../api.ts';
import { navigate, useApp, useAppState } from '../app-context.tsx';
import { sfx } from '../sound.ts';
import { ImportModal } from './ImportModal.tsx';
import { Icon } from './icons.tsx';
import { EmptyState, Modal, ProgressBar } from './ui.tsx';

export interface MoveItem {
  kind: 'deck' | 'folder';
  id: string;
  emoji: string;
  title: string;
  /** Folder it is in now (null at the top level). */
  from: string | null;
}

/** Value of `data-drop-folder` on drop targets; ROOT stands for the top level. */
const ROOT = 'root';

/** Folder a deck or folder lives in, treating a missing folder as the top level. */
function parentOf(id: string | null | undefined, folders: FolderSummary[]): string | null {
  return id && folders.some((f) => f.id === id) ? id : null;
}

export const deckItem = (d: DeckSummary, folders: FolderSummary[]): MoveItem => ({
  kind: 'deck',
  id: d.id,
  emoji: d.emoji,
  title: d.title,
  from: parentOf(d.folderId, folders),
});

export const folderItem = (f: FolderSummary, folders: FolderSummary[]): MoveItem => ({
  kind: 'folder',
  id: f.id,
  emoji: f.emoji,
  title: f.title,
  from: parentOf(f.parentId, folders),
});

function canMove(item: MoveItem, target: string | null, folders: FolderSummary[]): boolean {
  if (target === item.from) return false;
  return item.kind === 'deck' || canMoveFolder(folders, item.id, target);
}

/** Move a deck or folder, then refresh and say where it went. */
export function useMove() {
  const s = useAppState();
  const { refresh, showError, toast } = useApp();
  return async (item: MoveItem, target: string | null) => {
    try {
      if (item.kind === 'deck') await api.updateDeck(item.id, { folderId: target });
      else await api.updateFolder(item.id, { parentId: target });
      const dest = target ? s.folders.find((f) => f.id === target) : null;
      toast({ icon: dest?.emoji ?? '🏠', title: `Moved “${item.title}”`, body: dest ? `Now in ${dest.title}` : 'Now at the top level', kind: 'success' });
      await refresh();
    } catch (e) {
      showError(e);
    }
  };
}

/**
 * Pointer-based drag and drop. Anything with `data-drop-folder` on the page
 * (folder tiles, breadcrumbs) accepts a drop. A short press still clicks.
 */
function useDrag(onDrop: (item: MoveItem, target: string | null) => void, folders: FolderSummary[]) {
  const [dragging, setDragging] = useState<MoveItem | null>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const cleanup = useRef<(() => void) | null>(null);
  const latest = useRef({ onDrop, folders });
  latest.current = { onDrop, folders };

  useEffect(() => () => cleanup.current?.(), []);

  const start = (e: ReactPointerEvent, item: MoveItem) => {
    // Touch keeps its normal scrolling; the Move menu covers it.
    if (e.button !== 0 || e.pointerType === 'touch') return;
    const origin = { x: e.clientX, y: e.clientY };
    let active = false;
    let target: HTMLElement | null = null;

    const targetValue = (el: HTMLElement) => (el.dataset.dropFolder === ROOT ? null : el.dataset.dropFolder!);
    const setTarget = (el: HTMLElement | null) => {
      if (el === target) return;
      target?.classList.remove('drop-target');
      el?.classList.add('drop-target');
      target = el;
    };
    const move = (ev: PointerEvent) => {
      if (!active) {
        if (Math.hypot(ev.clientX - origin.x, ev.clientY - origin.y) < 6) return;
        active = true;
        setDragging(item);
        document.body.classList.add('is-dragging');
        sfx.select();
      }
      setPos({ x: ev.clientX, y: ev.clientY });
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('[data-drop-folder]') ?? null;
      setTarget(el && canMove(item, targetValue(el), latest.current.folders) ? el : null);
    };
    const end = (drop: boolean) => {
      const dropOn = target;
      cleanup.current?.();
      if (!active) return;
      // The click that follows a drag must not open the tile.
      const swallow = (ce: MouseEvent) => {
        ce.stopPropagation();
        ce.preventDefault();
      };
      window.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
      if (drop && dropOn) {
        sfx.toggle(true);
        latest.current.onDrop(item, targetValue(dropOn));
      }
    };
    const up = () => end(true);
    const cancel = () => end(false);
    const key = (ev: KeyboardEvent) => ev.key === 'Escape' && cancel();

    cleanup.current = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', key);
      setTarget(null);
      document.body.classList.remove('is-dragging');
      setDragging(null);
      cleanup.current = null;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', key);
  };

  const ghost = dragging && (
    <div className="drag-ghost" style={{ left: pos.x, top: pos.y }}>
      <span>{dragging.emoji}</span>
      {dragging.title}
    </div>
  );

  return { start, dragging, ghost };
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** Folders and decks directly inside `folderId` (null for the top level). */
export function DeckBrowser({ folderId }: { folderId: string | null }) {
  const s = useAppState();
  const move = useMove();
  const [importing, setImporting] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const { start, dragging, ghost } = useDrag((item, target) => void move(item, target), s.folders);

  const folders = s.folders.filter((f) => parentOf(f.parentId, s.folders) === folderId).sort((a, b) => a.title.localeCompare(b.title));
  const decks = s.decks.filter((d) => parentOf(d.folderId, s.folders) === folderId);
  const empty = folders.length === 0 && decks.length === 0;
  const isDragged = (kind: MoveItem['kind'], id: string) => dragging?.kind === kind && dragging.id === id;

  return (
    <section>
      <div className="section-head">
        <h2>{folderId ? 'Inside' : 'Your decks'}</h2>
        <div className="row">
          {folders.length > 0 && <span className="muted small drag-hint">Drag a deck onto a folder to move it</span>}
          <button className="btn ghost" onClick={() => setCreatingFolder(true)}>
            📁 New folder
          </button>
          <button className="btn ghost" onClick={() => setImporting(true)}>
            <Icon name="plus" /> New deck
          </button>
        </div>
      </div>
      {empty ? (
        folderId ? (
          <EmptyState icon="📂" title="This folder is empty">
            <p className="muted">Make a deck here, or drag decks in from another folder.</p>
            <div className="row center-row">
              <button className="btn" onClick={() => setCreatingFolder(true)}>
                📁 New folder
              </button>
              <button className="btn primary" onClick={() => setImporting(true)}>
                ✨ New deck
              </button>
            </div>
          </EmptyState>
        ) : (
          <EmptyState mood="wow" title="No decks yet">
            <p className="muted">Upload a PDF, paste notes, drop a link, or just name a topic. Claude writes the cards.</p>
            <button className="btn primary big" onClick={() => setImporting(true)}>
              ✨ Create your first deck
            </button>
          </EmptyState>
        )
      ) : (
        <div className="deck-grid">
          {folders.map((f) => (
            <button
              key={f.id}
              className={`deck-card folder-card ${isDragged('folder', f.id) ? 'dragging' : ''}`}
              data-drop-folder={f.id}
              onPointerDown={(e) => start(e, folderItem(f, s.folders))}
              onClick={() => navigate(`/folder/${f.id}`)}
            >
              <div className="deck-top">
                <span className="deck-emoji">{f.emoji}</span>
                <div className="deck-meta">
                  {f.dueCount > 0 && <span className="badge due">{f.dueCount} due</span>}
                  {f.newCount > 0 && <span className="badge new">{f.newCount} new</span>}
                </div>
              </div>
              <div>
                <div className="deck-title">{f.title}</div>
                <div className="deck-meta">
                  {f.deckCount === 0 && f.folderCount === 0
                    ? 'Empty folder'
                    : [f.folderCount > 0 && plural(f.folderCount, 'folder'), plural(f.deckCount, 'deck'), plural(f.cardCount, 'card')].filter(Boolean).join(' · ')}
                </div>
              </div>
              <div className="deck-progress" title="Mastered">
                <ProgressBar value={f.mastery} height={3} />
                <span>{Math.round(f.mastery * 100)}%</span>
              </div>
            </button>
          ))}
          {decks.map((d) => (
            <button
              key={d.id}
              className={`deck-card ${isDragged('deck', d.id) ? 'dragging' : ''}`}
              onPointerDown={(e) => start(e, deckItem(d, s.folders))}
              onClick={() => navigate(`/deck/${d.id}`)}
            >
              <div className="deck-top">
                <span className="deck-emoji">{d.emoji}</span>
                <div className="deck-meta">
                  {d.dueCount > 0 && <span className="badge due">{d.dueCount} due</span>}
                  {d.newCount > 0 && <span className="badge new">{d.newCount} new</span>}
                </div>
              </div>
              <div>
                <div className="deck-title">{d.title}</div>
                <div className="deck-meta">{d.cardCount === 0 ? 'No cards yet' : plural(d.cardCount, 'card')}</div>
              </div>
              <div className="deck-progress" title="Mastered">
                <ProgressBar value={d.mastery} height={3} />
                <span>{Math.round(d.mastery * 100)}%</span>
              </div>
            </button>
          ))}
        </div>
      )}
      {ghost}

      {importing && (
        <ImportModal
          folderId={folderId}
          onClose={() => setImporting(false)}
          onDone={(r) => {
            // Decks Claude writes start at the top level; file them here.
            if (folderId) void api.updateDeck(r.deck.id, { folderId }).finally(() => navigate(`/deck/${r.deck.id}`));
            else navigate(`/deck/${r.deck.id}`);
          }}
        />
      )}
      {creatingFolder && <NewFolderModal parentId={folderId} onClose={() => setCreatingFolder(false)} />}
    </section>
  );
}

/** Breadcrumb from the top level to a folder. Every crumb except the last accepts drops. */
export function FolderCrumbs({ folderId, current }: { folderId: string | null; current?: string }) {
  const s = useAppState();
  const path = folderPath(s.folders, folderId);
  return (
    <nav className="crumbs" aria-label="Folders">
      <button className="crumb" data-drop-folder={ROOT} onClick={() => navigate('/')}>
        <Icon name="back" size={14} /> All decks
      </button>
      {path.map((f) => (
        <span key={f.id} className="crumb-wrap">
          <span className="crumb-sep">/</span>
          <button className="crumb" data-drop-folder={f.id} onClick={() => navigate(`/folder/${f.id}`)}>
            {f.emoji} {f.title}
          </button>
        </span>
      ))}
      {current && (
        <span className="crumb-wrap">
          <span className="crumb-sep">/</span>
          <span className="crumb current">{current}</span>
        </span>
      )}
    </nav>
  );
}

function NewFolderModal({ parentId, onClose }: { parentId: string | null; onClose: () => void }) {
  const { refresh, showError } = useApp();
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      await api.createFolder({ title, parentId });
      sfx.unlock();
      await refresh();
      onClose();
    } catch (e) {
      showError(e);
      setBusy(false);
    }
  };

  return (
    <Modal onClose={busy ? () => {} : onClose}>
      <h2>New folder</h2>
      <p className="muted">Group decks by class, exam or topic. You can study a whole folder at once.</p>
      <input
        className="input"
        autoFocus
        placeholder="Folder name, e.g. Biology 101"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && void create()}
      />
      <div className="modal-actions">
        <button className="btn ghost" disabled={busy} onClick={onClose}>
          Cancel
        </button>
        <button className="btn primary" disabled={busy || !title.trim()} onClick={() => void create()}>
          Create folder
        </button>
      </div>
    </Modal>
  );
}

/** Pick a destination folder for a deck or folder. */
export function MoveModal({ item, onClose, onMoved }: { item: MoveItem; onClose: () => void; onMoved?: () => void }) {
  const s = useAppState();
  const move = useMove();
  const [busy, setBusy] = useState(false);

  // Depth-first so each folder sits under its parent.
  const rows: { folder: FolderSummary; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const f of s.folders.filter((x) => parentOf(x.parentId, s.folders) === parent).sort((a, b) => a.title.localeCompare(b.title))) {
      if (item.kind === 'folder' && f.id === item.id) continue; // skip the folder itself and everything inside it
      rows.push({ folder: f, depth });
      walk(f.id, depth + 1);
    }
  };
  walk(null, 0);

  const pick = async (target: string | null) => {
    setBusy(true);
    await move(item, target);
    onClose();
    onMoved?.();
  };

  return (
    <Modal onClose={busy ? () => {} : onClose}>
      <h2>
        Move {item.emoji} {item.title}
      </h2>
      <div className="move-list">
        <button className="move-row" disabled={busy || item.from === null} onClick={() => void pick(null)}>
          <span className="move-emoji">🏠</span>
          Top level
          {item.from === null && <span className="muted small">Here now</span>}
        </button>
        {rows.map(({ folder, depth }) => (
          <button
            key={folder.id}
            className="move-row"
            style={{ paddingLeft: `calc(var(--s3) + ${depth * 22}px)` }}
            disabled={busy || folder.id === item.from}
            onClick={() => void pick(folder.id)}
          >
            <span className="move-emoji">{folder.emoji}</span>
            {folder.title}
            {folder.id === item.from && <span className="muted small">Here now</span>}
          </button>
        ))}
      </div>
      {rows.length === 0 && <p className="muted small">No folders yet. Make one with “New folder” on the home screen.</p>}
    </Modal>
  );
}
