import { localDay } from '../shared/game.ts';
import { scopeQuery, type Scope } from './scope.ts';
import type {
  AnswerInput,
  AnswerResult,
  Card,
  DeckSummary,
  FolderSummary,
  Material,
  Profile,
  Reward,
  SessionComplete,
  Settings,
  StudyMode,
} from '../shared/types.ts';

export class ApiError extends Error {
  constructor(
    message: string,
    public hint?: string,
  ) {
    super(message);
  }
}

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const sep = url.includes('?') ? '&' : '?';
  const res = await fetch(`${url}${sep}day=${localDay()}`, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? `Request failed (${res.status})`, data.hint);
  return data as T;
}

export interface CardView extends Card {
  tier: number;
  recall: number;
  due: boolean;
  previews?: Record<1 | 2 | 3 | 4, string>;
}

export interface AppState {
  profile: Profile;
  level: { level: number; into: number; needed: number; title: string };
  settings: Settings;
  decks: DeckSummary[];
  folders: FolderSummary[];
  dueTotal: number;
  newTotal: number;
  todayXp: number;
  chestAvailable: boolean;
  chestOpenedToday: boolean;
  streakAtRisk: boolean;
  doubleXpActive: boolean;
}

export interface DeckDetail {
  deck: DeckSummary;
  cards: CardView[];
  materials: Material[];
  bossMinCards: number;
}

export interface StudyData {
  cards: CardView[];
  pool: string[];
  ahead: boolean;
  deck: DeckSummary | null;
  folder: FolderSummary | null;
}

export interface StatsData {
  forecast: { day: string; count: number }[];
  retention: number | null;
  reviewedLast30: number;
  tiers: number[];
  dailyXp: Record<string, number>;
  reviewsPerDay: Record<string, number>;
  thisWeekXp: number;
  lastWeekXp: number;
  totalReviews: number;
  totalCards: number;
  stats: Profile['stats'];
  achievements: { id: string; icon: string; name: string; desc: string; unlockedAt: string | null }[];
}

export type SourceInput =
  | { type: 'text'; text: string }
  | { type: 'topic'; topic: string }
  | { type: 'url'; url: string }
  | { type: 'files'; files: { name: string; data: string }[] }
  | { type: 'pairs'; text: string }
  | { type: 'mcq'; text: string };

/** Card fields the client may set when adding or editing a card. */
export type CardFields = Pick<Card, 'front' | 'back'> & Partial<Pick<Card, 'distractors' | 'explanation' | 'mcq' | 'title' | 'code' | 'codeLang' | 'hint'>>;

export interface GenerateResult {
  deck: DeckSummary;
  added: number;
  material: Material;
  needsDistractors?: boolean;
  /** Questions in a bulk MCQ import that could not be read. */
  skipped?: number;
  newAchievements: string[];
}

export const api = {
  health: () => req<{ ok: boolean; claude: string | null; dataDir: string }>('GET', '/api/health'),
  testClaude: () => req<{ message: string; durationMs: number; models: string[] }>('POST', '/api/claude/test'),
  state: () => req<AppState>('GET', '/api/state'),
  createDeck: (d: { title: string; emoji?: string; description?: string; folderId?: string | null }) => req<DeckSummary & { newAchievements: string[] }>('POST', '/api/decks', d),
  deck: (id: string) => req<DeckDetail>('GET', `/api/decks/${id}`),
  updateDeck: (id: string, d: Partial<{ title: string; emoji: string; description: string; folderId: string | null }>) => req<DeckSummary>('PATCH', `/api/decks/${id}`, d),
  createFolder: (f: { title: string; emoji?: string; parentId?: string | null }) => req<FolderSummary>('POST', '/api/folders', f),
  updateFolder: (id: string, f: Partial<{ title: string; emoji: string; parentId: string | null }>) => req<FolderSummary>('PATCH', `/api/folders/${id}`, f),
  deleteFolder: (id: string) => req('DELETE', `/api/folders/${id}`),
  deleteDeck: (id: string) => req('DELETE', `/api/decks/${id}`),
  addCard: (deckId: string, c: CardFields) =>
    req<CardView>('POST', `/api/decks/${deckId}/cards`, c),
  updateCard: (id: string, c: Partial<CardFields> & Partial<Pick<Card, 'starred' | 'suspended'>>) =>
    req<CardView>('PATCH', `/api/cards/${id}`, c),
  resetCard: (id: string) => req<CardView>('POST', `/api/cards/${id}/reset`),
  deleteCard: (id: string) => req('DELETE', `/api/cards/${id}`),
  deleteMaterial: (id: string, withCards: boolean) => req('DELETE', `/api/materials/${id}${withCards ? '?cards=1' : ''}`),
  generate: (b: { deckId?: string; source: SourceInput; count: number; focus?: string; level?: string; title?: string; style?: 'cards' | 'mcq' }) =>
    req<GenerateResult>('POST', '/api/generate', b),
  enhance: (deckId: string) => req<{ updated: number }>('POST', `/api/decks/${deckId}/enhance`),
  explain: (cardId: string, question?: string) => req<{ text: string }>('POST', '/api/explain', { cardId, question }),
  grade: (cardId: string, given: string) => req<{ correct: boolean; feedback: string }>('POST', '/api/grade', { cardId, given }),
  study: (mode: StudyMode, scope: Scope, opts: { ahead?: boolean } = {}) =>
    req<StudyData>('GET', `/api/study?mode=${mode}${scopeQuery(scope)}${opts.ahead ? '&ahead=1' : ''}`),
  answer: (answer: AnswerInput, mode: StudyMode, scheduled: boolean) =>
    req<AnswerResult & { card: CardView | null }>('POST', '/api/answer', { answer, mode, scheduled }),
  complete: (s: Omit<SessionComplete, 'day'>) => req<Reward>('POST', '/api/session/complete', s),
  claimQuest: (id: string) => req<{ coins: number }>('POST', `/api/quests/${encodeURIComponent(id)}/claim`),
  openChest: () => req<{ coins: number; hints: number; freeze: boolean; newAchievements: string[] }>('POST', '/api/chest/open'),
  buy: (itemId: string) => req<{ ok: boolean; newAchievements: string[] }>('POST', '/api/shop/buy', { itemId }),
  spend: (what: 'hint' | 'revive') => req<{ hints: number; coins: number }>('POST', '/api/spend', { what }),
  updateProfile: (p: { name?: string; theme?: string; avatar?: string }) => req('POST', '/api/profile', p),
  updateSettings: (s: Partial<Settings>) => req<Settings>('PATCH', '/api/settings', s),
  stats: () => req<StatsData>('GET', '/api/stats'),
  importBackup: (data: unknown) => req('POST', '/api/import', data),
};
