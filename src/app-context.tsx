import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ACHIEVEMENTS, SHOP } from '../shared/game.ts';
import { ApiError, api, type AppState } from './api.ts';
import { toast as sonner } from 'sonner';
import { BrandMark } from './components/BrandMark.tsx';
import { ConfirmDialog, type ConfirmRequest } from './components/ConfirmDialog.tsx';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { patternImage } from './theme-patterns.ts';
import { setSoundEnabled, setSoundVolume, sfx } from './sound.ts';

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
  /** Shown only for achievements, where the icon is the achievement's own. */
  icon?: string;
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
  /** Ask before something that cannot be undone. Resolves to the chosen action's value, or null when cancelled. */
  ask: (req: Omit<ConfirmRequest, 'resolve'>) => Promise<string | null>;
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

/** The hat Flicky wears, safe to call before state has loaded. */
export function useEquippedHat(): string | null {
  return useContext(AppContext)?.state?.profile.hat ?? null;
}

/** The skin Flicky wears, safe to call before state has loaded. */
export function useEquippedSkin(): string | null {
  return useContext(AppContext)?.state?.profile.skin ?? null;
}

function applyTheme(themeId: string) {
  const item = SHOP.find((i) => i.id === themeId) ?? SHOP.find((i) => i.id === 'theme-midnight')!;
  const [bg, surface, accent, ink] = item.value as string[];
  const root = document.documentElement.style;
  root.setProperty('--bg', bg);
  root.setProperty('--surface', surface);
  root.setProperty('--accent', accent);
  root.setProperty('--ink', ink);
  root.setProperty('--bg-pattern', patternImage(item.pattern, accent));
  // Light text means a dark theme; native controls and scrollbars follow.
  root.setProperty('color-scheme', parseInt(ink.slice(1, 3), 16) > 128 ? 'dark' : 'light');
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [asking, setAsking] = useState<ConfirmRequest | null>(null);
  const nextId = useRef(1);

  const refresh = useCallback(async () => {
    try {
      const s = await api.state();
      setState(s);
      setLoadError(null);
      applyTheme(s.profile.theme);
      setSoundEnabled(s.settings.sound);
      setSoundVolume(s.settings.soundVolume);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = nextId.current++;
    sonner.custom(() => <ToastCard toast={{ ...t, id }} />, { id, duration: t.kind === 'error' ? 7000 : 4200 });
  }, []);

  const ask = useCallback((req: Omit<ConfirmRequest, 'resolve'>) => new Promise<string | null>((resolve) => setAsking({ ...req, resolve })), []);

  const showError = useCallback(
    (e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: msg, body: e instanceof ApiError ? e.hint : undefined, kind: 'error' });
    },
    [toast],
  );

  const announceAchievements = useCallback(
    (ids: string[]) => {
      const list = ids.map((id) => ACHIEVEMENTS.find((x) => x.id === id)).filter((a) => !!a);
      // A big batch (say, after an update adds new tiers) gets one summary toast instead of a long queue.
      const shown = list.length > 3 ? list.slice(0, 2) : list;
      shown.forEach((a, i) => {
        setTimeout(() => {
          sfx.unlock();
          toast({ icon: a.icon, title: `Achievement unlocked: ${a.name}`, body: `${a.desc} · 🪙 +${a.coins}`, kind: 'achievement' });
        }, i * 700);
      });
      const rest = list.slice(shown.length);
      if (rest.length) {
        setTimeout(() => {
          sfx.unlock();
          toast({
            icon: '🏆',
            title: `${rest.length} more trophies unlocked`,
            body: `🪙 +${rest.reduce((sum, a) => sum + a.coins, 0)}. See them all on the Trophies page.`,
            kind: 'achievement',
          });
        }, shown.length * 700);
      }
    },
    [toast],
  );

  const value = useMemo(() => ({ state, refresh, toast, showError, announceAchievements, ask }), [state, refresh, toast, showError, announceAchievements, ask]);

  if (!state) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 p-6 text-center">
        <BrandMark className="mb-2" />
        {loadError ? (
          <>
            <p>Could not reach the Flick server.</p>
            <p className="text-sm text-muted-foreground">{loadError}</p>
            <p className="text-sm text-muted-foreground">
              Start it with <code className="font-mono">npm run dev</code> (or <code className="font-mono">npm start</code>) and reload.
            </p>
            <Button onClick={() => void refresh()}>Retry</Button>
          </>
        ) : (
          <p className="text-muted-foreground">Loading…</p>
        )}
      </div>
    );
  }

  return (
    <AppContext.Provider value={value}>
      <TooltipProvider>
        {children}
        <Toaster />
        {asking && (
          <ConfirmDialog
            request={asking}
            onDone={(v) => {
              asking.resolve(v);
              setAsking(null);
            }}
          />
        )}
      </TooltipProvider>
    </AppContext.Provider>
  );
}

const TOAST_KIND: Record<NonNullable<Toast['kind']>, string> = {
  info: 'border-border bg-card',
  error: 'border-destructive bg-card',
  success: 'border-success bg-card',
  achievement: 'border-warning bg-warning-soft',
};

function ToastCard({ toast: t }: { toast: Toast }) {
  return (
    <div
      role={t.kind === 'error' ? 'alert' : 'status'}
      className={cn('flex w-[356px] max-w-[calc(100vw-2rem)] items-center gap-3 rounded-md border-2 px-4 py-3 text-sm text-foreground shadow-overlay', TOAST_KIND[t.kind ?? 'info'])}
    >
      {t.icon && <span className="text-[26px] leading-none">{t.icon}</span>}
      <div className="min-w-0">
        <div className="font-display text-base font-semibold">{t.title}</div>
        {t.body && <div className="text-xs text-muted-foreground">{t.body}</div>}
      </div>
    </div>
  );
}
