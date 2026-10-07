import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import { navigate, useApp, useAppState } from '../app-context.tsx';
import { DeckBrowser, FolderCrumbs, MoveModal, folderItem } from '../components/DeckBrowser.tsx';
import { EditableTitle, EmojiPicker, ModeButton, ModeGrid, StatLine } from '../components/DeckHero.tsx';
import { Page, ProgressBar } from '../components/shared.tsx';
import { Button } from '@/components/ui/button';
import { folderScope, playPath } from '../scope.ts';

const EMOJIS = ['📁', '📚', '🎓', '🧬', '🧪', '🧮', '🌍', '🏛️', '💻', '🎨', '🎵', '⚖️', '🩺', '📈', '🗣️', '🧠'];

export function FolderPage({ id }: { id: string }) {
  const s = useAppState();
  const { refresh, showError, ask } = useApp();
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
    const ok = await ask({
      title: `Delete the folder “${f.title}”?`,
      description: inside ? 'Its decks and folders move up one level. Nothing else is deleted.' : undefined,
      actions: [{ label: 'Delete folder', value: 'ok', destructive: true }],
    });
    if (!ok) return;
    try {
      await api.deleteFolder(f.id);
      await refresh();
      navigate(f.parentId ? `/folder/${f.parentId}` : '/');
    } catch (e) {
      showError(e);
    }
  };

  return (
    <Page>
      <div className="-mb-4 flex items-center justify-between gap-3">
        <FolderCrumbs folderId={f.parentId} current={`${f.emoji} ${f.title}`} />
        <Button size="sm" variant="ghost" onClick={() => setMoving(true)}>
          📁 Move
        </Button>
      </div>
      <section className="flex flex-col gap-6">
        <div className="flex items-start gap-4">
          <EmojiPicker value={f.emoji} choices={EMOJIS} onPick={(emoji) => void update({ emoji })} />
          <div className="min-w-0 flex-1">
            <EditableTitle value={f.title} onRename={(title) => void update({ title })} />
            <StatLine
              items={[
                { value: f.deckCount, label: f.deckCount === 1 ? 'deck' : 'decks' },
                { value: f.cardCount, label: 'cards' },
                { value: f.dueCount, label: 'due', tone: 'due' },
                { value: f.newCount, label: 'new' },
                { value: `${Math.round(f.mastery * 100)}%`, label: 'mastered' },
              ]}
            />
            <ProgressBar value={f.mastery} className="h-1.5" />
          </div>
        </div>

        <ModeGrid>
          <ModeButton
            primary
            icon="🎯"
            name="Study folder"
            desc={!enough ? 'Add decks first' : f.dueCount + f.newCount > 0 ? `${f.dueCount} due · ${f.newCount} new` : 'Practice ahead'}
            disabled={!enough}
            onClick={() => navigate(playPath('quiz', scope))}
          />
          <ModeButton icon="🃏" name="Flashcards" desc="Flip & self-rate" disabled={!enough} onClick={() => navigate(playPath('flashcards', scope))} />
          <ModeButton icon="🧩" name="Match" desc="Beat the clock" disabled={f.cardCount < 3} onClick={() => navigate(playPath('match', scope))} />
          <ModeButton icon="⏱️" name="Time Attack" desc="60-second blitz" disabled={f.cardCount < 4} onClick={() => navigate(playPath('timeattack', scope))} />
          <ModeButton
            icon="⚔️"
            name="Boss Fight"
            desc={f.bossReady ? 'Your hardest cards' : 'Study a few cards'}
            locked={!f.bossReady}
            disabled={!f.bossReady}
            onClick={() => navigate(playPath('boss', scope))}
          />
        </ModeGrid>
      </section>

      <DeckBrowser folderId={f.id} />

      <div className="text-center text-sm">
        <Button variant="link" className="text-destructive" onClick={() => void remove()}>
          Delete folder
        </Button>
      </div>

      {moving && <MoveModal item={folderItem(f, s.folders)} onClose={() => setMoving(false)} />}
    </Page>
  );
}
