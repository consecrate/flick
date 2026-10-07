// Decks and folders at one level of the folder tree, with drag and drop to
// move them, plus the dialogs for making folders and moving things.

import { useEffect, useRef, useState, type ComponentProps, type PointerEvent as ReactPointerEvent } from 'react';
import { canMoveFolder, folderPath } from '../../shared/folders.ts';
import type { DeckSummary, FolderSummary } from '../../shared/types.ts';
import { api } from '../api.ts';
import { navigate, useApp, useAppState } from '../app-context.tsx';
import { sfx } from '../sound.ts';
import { ImportModal } from './ImportModal.tsx';
import { EmptyState, ProgressBar, SectionHead } from './shared.tsx';
import { ArrowLeftIcon, PlusIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

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
    <div
      className="pointer-events-none fixed z-100 flex max-w-[260px] translate-x-2.5 translate-y-2.5 -rotate-3 items-center gap-2 overflow-hidden rounded-full border-2 border-primary bg-card py-2 pr-4 pl-2 font-display font-semibold text-ellipsis whitespace-nowrap shadow-overlay"
      style={{ left: pos.x, top: pos.y }}
    >
      <span className="grid size-[30px] flex-none place-items-center rounded-[10px] bg-accent text-lg">{dragging.emoji}</span>
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
      <SectionHead title={folderId ? 'Inside' : 'Your decks'}>
        <div className="flex flex-wrap items-center gap-2">
          {folders.length > 0 && <span className="self-center text-sm text-muted-foreground max-[860px]:hidden">Drag a deck onto a folder to move it</span>}
          <Button variant="ghost" onClick={() => setCreatingFolder(true)}>
            📁 New folder
          </Button>
          <Button variant="ghost" onClick={() => setImporting(true)}>
            <PlusIcon /> New deck
          </Button>
        </div>
      </SectionHead>
      {empty ? (
        folderId ? (
          <EmptyState icon="📂" title="This folder is empty" description="Make a deck here, or drag decks in from another folder.">
            <Button onClick={() => setCreatingFolder(true)}>📁 New folder</Button>
            <Button variant="default" onClick={() => setImporting(true)}>
              ✨ New deck
            </Button>
          </EmptyState>
        ) : (
          <EmptyState mood="wow" title="No decks yet" description="Upload a PDF, paste notes, drop a link, or just name a topic. Claude writes the cards.">
            <Button variant="default" size="lg" onClick={() => setImporting(true)}>
              ✨ Create your first deck
            </Button>
          </EmptyState>
        )
      ) : (
        <div className="stagger grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
          {folders.map((f) => (
            <DeckTile
              key={f.id}
              folder
              emoji={f.emoji}
              title={f.title}
              meta={
                f.deckCount === 0 && f.folderCount === 0
                  ? 'Empty folder'
                  : [f.folderCount > 0 && plural(f.folderCount, 'folder'), plural(f.deckCount, 'deck'), plural(f.cardCount, 'card')].filter(Boolean).join(' · ')
              }
              due={f.dueCount}
              fresh={f.newCount}
              mastery={f.mastery}
              dragged={isDragged('folder', f.id)}
              data-drop-folder={f.id}
              onPointerDown={(e) => start(e, folderItem(f, s.folders))}
              onClick={() => navigate(`/folder/${f.id}`)}
            />
          ))}
          {decks.map((d) => (
            <DeckTile
              key={d.id}
              emoji={d.emoji}
              title={d.title}
              meta={d.cardCount === 0 ? 'No cards yet' : plural(d.cardCount, 'card')}
              due={d.dueCount}
              fresh={d.newCount}
              mastery={d.mastery}
              dragged={isDragged('deck', d.id)}
              onPointerDown={(e) => start(e, deckItem(d, s.folders))}
              onClick={() => navigate(`/deck/${d.id}`)}
            />
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

/** A deck or folder card. Folders get a tab on top and accept drops. */
function DeckTile({
  folder,
  emoji,
  title,
  meta,
  due,
  fresh,
  mastery,
  dragged,
  ...props
}: {
  folder?: boolean;
  emoji: string;
  title: string;
  meta: string;
  due: number;
  fresh: number;
  mastery: number;
  dragged: boolean;
} & ComponentProps<'button'> & { 'data-drop-folder'?: string }) {
  return (
    <button
      className={cn(
        'deck-tile group relative flex flex-col gap-3 rounded-lg border-2 border-border bg-card px-6 pt-4 pb-6 text-left text-foreground shadow-ledge transition-[transform,border-color,box-shadow] duration-150 ease-bounce hover:-translate-y-1 hover:border-primary hover:shadow-ledge-lg',
        folder && 'folder-tab mt-2.5 rounded-tl-sm',
        dragged && 'opacity-35',
      )}
      {...props}
    >
      <div className="flex items-center justify-between">
        <span className="grid size-[52px] place-items-center rounded-2xl bg-accent text-[30px] transition-transform duration-300 ease-bounce group-hover:scale-110 group-hover:-rotate-8">{emoji}</span>
        <div className="flex flex-wrap items-center gap-2">
          {due > 0 && <Badge variant="brand">{due} due</Badge>}
          {fresh > 0 && <Badge variant="warning">{fresh} new</Badge>}
        </div>
      </div>
      <div>
        <div className="font-display text-lg font-semibold">{title}</div>
        <div className="text-sm text-muted-foreground">{meta}</div>
      </div>
      <div className="flex items-center gap-3 font-display text-sm font-semibold text-muted-foreground" title="Mastered">
        <ProgressBar value={mastery} className="h-[3px]" />
        <span>{Math.round(mastery * 100)}%</span>
      </div>
    </button>
  );
}

/** Breadcrumb from the top level to a folder. Every crumb except the last accepts drops. */
export function FolderCrumbs({ folderId, current }: { folderId: string | null; current?: string }) {
  const s = useAppState();
  const path = folderPath(s.folders, folderId);
  const drop = 'crumb-drop cursor-pointer';
  return (
    <Breadcrumb aria-label="Folders">
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild className={drop}>
            <button data-drop-folder={ROOT} onClick={() => navigate('/')}>
              <ArrowLeftIcon className="size-3.5" /> All decks
            </button>
          </BreadcrumbLink>
        </BreadcrumbItem>
        {path.map((f) => (
          <BreadcrumbItem key={f.id}>
            <BreadcrumbSeparator />
            <BreadcrumbLink asChild className={drop}>
              <button data-drop-folder={f.id} onClick={() => navigate(`/folder/${f.id}`)}>
                {f.emoji} {f.title}
              </button>
            </BreadcrumbLink>
          </BreadcrumbItem>
        ))}
        {current && (
          <BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbPage>{current}</BreadcrumbPage>
          </BreadcrumbItem>
        )}
      </BreadcrumbList>
    </Breadcrumb>
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
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New folder</DialogTitle>
          <DialogDescription>Group decks by class, exam or topic. You can study a whole folder at once.</DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          placeholder="Folder name, e.g. Biology 101"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void create()}
        />
        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="default" disabled={busy || !title.trim()} onClick={() => void create()}>
            Create folder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

  const row =
    'flex items-center gap-3 rounded-md border-2 border-transparent px-3 py-2 text-left font-semibold text-foreground hover:not-disabled:border-primary hover:not-disabled:bg-accent disabled:cursor-default disabled:text-muted-foreground';
  const here = <span className="ml-auto text-sm font-medium text-muted-foreground">Here now</span>;

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>
            Move {item.emoji} {item.title}
          </DialogTitle>
        </DialogHeader>
        <div className="flex max-h-[50vh] flex-col gap-0.5 overflow-y-auto">
          <button className={row} disabled={busy || item.from === null} onClick={() => void pick(null)}>
            <span className="grid size-8 flex-none place-items-center rounded-[10px] bg-muted text-lg">🏠</span>
            Top level
            {item.from === null && here}
          </button>
          {rows.map(({ folder, depth }) => (
            <button key={folder.id} className={row} style={{ paddingLeft: 12 + depth * 22 }} disabled={busy || folder.id === item.from} onClick={() => void pick(folder.id)}>
              <span className="grid size-8 flex-none place-items-center rounded-[10px] bg-muted text-lg">{folder.emoji}</span>
              {folder.title}
              {folder.id === item.from && here}
            </button>
          ))}
        </div>
        {rows.length === 0 && <p className="text-sm text-muted-foreground">No folders yet. Make one with “New folder” on the home screen.</p>}
      </DialogContent>
    </Dialog>
  );
}
