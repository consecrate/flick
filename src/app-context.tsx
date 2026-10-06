import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ACHIEVEMENTS, SHOP } from '../shared/game.ts';
import { ApiError, api, type AppState } from './api.ts';
import { setSoundEnabled, sfx } from './sound.ts';

// ---------- routing (hash based, so the server needs no rewrites) ----------

function currentPath() {
  return window.location.hash.replace(/^#/, '') || '/';
}

export function useRoute(): string {
  const [path, setPath] = useState(currentPath);
  useEffect(() => {
    const on = () => setPath(currentPath());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return path;
}

export function navigate(path: string) {
  window.location.hash = path;
  window.scrollTo(0, 0);
}

// ---------- toasts ----------

export interface Toast {
  id: number;
  icon: string;
  title: string;
  body?: string;
  kind?: 'info' | 'error' | 'success' | 'achievement';
}

interface Ctx {
  state: AppState | null;
  refresh: () => Promise<void>;
  toast: (t: Omit<Toast, 'id'>) => void;
  showError: (e: unknown) => void;
  announceAchievements: (ids: string[]) => void;
}

const AppContext = createContext<Ctx | null>(null);

export function useApp(): Ctx {
  const c = useContext(AppContext);
  if (!c) throw new Error('useApp outside provider');
  return c;
}

/** Shorthand for components that only render after state has loaded. */
export function useAppState(): AppState {
  const { state } = useApp();
  if (!state) throw new Error('state not loaded');
  return state;
}

function applyTheme(themeId: string) {
  const item = SHOP.find((i) => i.id === themeId) ?? SHOP.find((i) => i.id === 'theme-midnight')!;
  const [bg, surface, accent, accent2] = item.value as string[];
  const root = document.documentElement.style;
  root.setProperty('--bg', bg);
  root.setProperty('--surface', surface);
  root.setProperty('--accent', accent);
  root.setProperty('--accent2', accent2);
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const refresh = useCallback(async () => {
    try {
      const s = await api.state();
      setState(s);
      setLoadError(null);
      applyTheme(s.profile.theme);
      setSoundEnabled(s.settings.sound);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = nextId.current++;
    setToasts((ts) => [...ts, { ...t, id }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), t.kind === 'error' ? 7000 : 4200);
  }, []);

  const showError = useCallback(
    (e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ icon: '⚠️', title: msg, body: e instanceof ApiError ? e.hint : undefined, kind: 'error' });
    },
    [toast],
  );

  const announceAchievements = useCallback(
    (ids: string[]) => {
      ids.forEach((id, i) => {
        const a = ACHIEVEMENTS.find((x) => x.id === id);
        if (!a) return;
        setTimeout(() => {
          sfx.unlock();
          toast({ icon: a.icon, title: `Achievement unlocked: ${a.name}`, body: a.desc, kind: 'achievement' });
        }, i * 700);
      });
    },
    [toast],
  );

  const value = useMemo(() => ({ state, refresh, toast, showError, announceAchievements }), [state, refresh, toast, showError, announceAchievements]);

  if (!state) {
    return (
      <div className="boot">
        <div className="boot-logo">⚡</div>
        {loadError ? (
          <>
            <p>Could not reach the Flick server.</p>
            <p className="muted small">{loadError}</p>
            <p className="muted small">
              Start it with <code>npm run dev</code> (or <code>npm start</code>) and reload.
            </p>
            <button className="btn" onClick={() => void refresh()}>
              Retry
            </button>
          </>
        ) : (
          <p className="muted">Loading…</p>
        )}
      </div>
    );
  }

  return (
    <AppContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind ?? 'info'}`}>
            <span className="toast-icon">{t.icon}</span>
            <div>
              <div className="toast-title">{t.title}</div>
              {t.body && <div className="toast-body">{t.body}</div>}
            </div>
          </div>
        ))}
      </div>
    </AppContext.Provider>
  );
}
