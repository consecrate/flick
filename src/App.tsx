import { useEffect } from 'react';
import { AppProvider, navigate, useApp, useRoute } from './app-context.tsx';
import { TopBar } from './components/shared.tsx';
import { folderScope } from './scope.ts';
import { sfx } from './sound.ts';
import { Achievements } from './pages/Achievements.tsx';
import { DeckPage } from './pages/Deck.tsx';
import { FolderPage } from './pages/Folder.tsx';
import { Home } from './pages/Home.tsx';
import { Journey } from './pages/Journey.tsx';
import { Settings } from './pages/Settings.tsx';
import { Shop } from './pages/Shop.tsx';
import { Stats } from './pages/Stats.tsx';
import { Boss } from './play/Boss.tsx';
import { Flashcards } from './play/Flashcards.tsx';
import { Match } from './play/Match.tsx';
import { Quiz } from './play/Quiz.tsx';
import { TimeAttack } from './play/TimeAttack.tsx';

// Controls that play their own sound (answers, ratings, tiles, Flicky) carry data-quiet.
const QUIET = '[data-quiet]';

/** One listener gives every button, link, tab and switch a soft sound. */
function useUiSounds() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('button, a[href], [role="button"], [role="option"], [role="menuitem"], [role="tab"]');
      if (!el || el.closest(QUIET) || (el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') return;
      if (el.closest('[data-nav]')) sfx.nav();
      // Switches announce their new state: the click fires before Radix flips aria-checked.
      else if (el.getAttribute('role') === 'switch') sfx.toggle(el.getAttribute('aria-checked') !== 'true');
      else sfx.tap();
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);
}

function Routes() {
  useUiSounds();
  const path = useRoute();
  const { refresh } = useApp();
  const parts = path.split('/').filter(Boolean);

  // Keep the HUD fresh when navigating between pages.
  useEffect(() => {
    void refresh();
  }, [path, refresh]);

  if (parts[0] === 'play') {
    const mode = parts[1];
    const scope = parts[2] === 'folder' && parts[3] ? folderScope(parts[3]) : parts[2] && parts[2] !== 'all' ? parts[2] : null;
    const key = `${mode}:${scope}`;
    if (mode === 'quiz') return <Quiz key={key} scope={scope} />;
    if (mode === 'flashcards') return <Flashcards key={key} scope={scope} />;
    if (mode === 'match') return <Match key={key} scope={scope} />;
    if (mode === 'timeattack') return <TimeAttack key={key} scope={scope} />;
    if (mode === 'boss') return <Boss key={key} scope={scope} />;
  }

  let page;
  if (parts[0] === 'deck' && parts[1]) page = <DeckPage key={parts[1]} id={parts[1]} />;
  else if (parts[0] === 'journey') page = <Journey />;
  else if (parts[0] === 'folder' && parts[1]) page = <FolderPage key={parts[1]} id={parts[1]} />;
  else if (parts[0] === 'stats') page = <Stats />;
  else if (parts[0] === 'achievements') page = <Achievements />;
  else if (parts[0] === 'shop') page = <Shop />;
  else if (parts[0] === 'settings') page = <Settings />;
  else if (parts.length === 0) page = <Home />;
  else {
    navigate('/');
    return null;
  }

  return (
    <>
      <TopBar />
      <main className="px-6 pb-12 max-[560px]:px-4">
        <div key={parts.slice(0, 2).join('/')} className="route-in">
          {page}
        </div>
      </main>
    </>
  );
}

export function App() {
  return (
    <AppProvider>
      <Routes />
    </AppProvider>
  );
}
