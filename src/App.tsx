import { useEffect } from 'react';
import { AppProvider, navigate, useApp, useRoute } from './app-context.tsx';
import { TopBar } from './components/ui.tsx';
import { sfx } from './sound.ts';
import { Achievements } from './pages/Achievements.tsx';
import { DeckPage } from './pages/Deck.tsx';
import { Home } from './pages/Home.tsx';
import { Settings } from './pages/Settings.tsx';
import { Shop } from './pages/Shop.tsx';
import { Stats } from './pages/Stats.tsx';
import { Boss } from './play/Boss.tsx';
import { Flashcards } from './play/Flashcards.tsx';
import { Match } from './play/Match.tsx';
import { Quiz } from './play/Quiz.tsx';
import { TimeAttack } from './play/TimeAttack.tsx';

// Controls that play their own sound (answers, ratings, tiles) are left out.
const QUIET = '.option, .rate-btn, .match-tile, .flip-card, .mascot-btn, [data-quiet]';

/** One listener gives every button, link and switch a soft sound. */
function useUiSounds() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('button, a[href], [role="button"]');
      if (!el || el.closest(QUIET) || (el as HTMLButtonElement).disabled) return;
      if (el.closest('.nav')) sfx.nav();
      else sfx.tap();
    };
    const onChange = (e: Event) => {
      const el = e.target as HTMLInputElement;
      if (el.type === 'checkbox') sfx.toggle(el.checked);
      else if (el.tagName === 'SELECT') sfx.tap();
    };
    document.addEventListener('click', onClick);
    document.addEventListener('change', onChange);
    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('change', onChange);
    };
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
    const deckId = parts[2] && parts[2] !== 'all' ? parts[2] : null;
    const key = `${mode}:${deckId}`;
    if (mode === 'quiz') return <Quiz key={key} deckId={deckId} />;
    if (mode === 'flashcards') return <Flashcards key={key} deckId={deckId} />;
    if (mode === 'match') return <Match key={key} deckId={deckId} />;
    if (mode === 'timeattack') return <TimeAttack key={key} deckId={deckId} />;
    if (mode === 'boss') return <Boss key={key} deckId={deckId} />;
  }

  let page;
  if (parts[0] === 'deck' && parts[1]) page = <DeckPage key={parts[1]} id={parts[1]} />;
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
      <main>
        <div key={parts.slice(0, 2).join('/')} className="route">
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
