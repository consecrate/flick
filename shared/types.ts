// Types shared by the server and the web client.

/**
 * Model passed to `claude --model`. Either a Claude Code alias ('haiku',
 * 'sonnet', 'opus'), a full model ID (e.g. 'claude-sonnet-5-5'), or 'default'
 * to use whatever model Claude Code itself is configured with.
 */
export type ModelChoice = string;

export const MODEL_PRESETS: { value: ModelChoice; label: string }[] = [
  { value: 'haiku', label: 'Haiku: fastest, lightest on usage limits' },
  { value: 'sonnet', label: 'Sonnet: balanced (recommended)' },
  { value: 'opus', label: 'Opus: best quality, uses the most of your limits' },
  { value: 'default', label: "Claude Code's default (whatever `/model` is set to)" },
];

/** Aliases and model IDs only: letters, digits, dots, dashes, underscores and a [1m]-style suffix. */
export function isValidModel(m: unknown): m is ModelChoice {
  return typeof m === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}(\[[A-Za-z0-9]+\])?$/.test(m);
}

/** FSRS card state as stored on disk (dates are ISO strings). */
export interface SrsState {
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  /** 0 New, 1 Learning, 2 Review, 3 Relearning */
  state: number;
  last_review?: string | null;
}

export interface Card {
  id: string;
  deckId: string;
  front: string;
  back: string;
  /** Wrong options used for multiple-choice questions. */
  distractors: string[];
  /** Optional extra context shown after answering. */
  explanation?: string;
  /**
   * Exam-style multiple-choice question (bulk MCQ import, or Claude's MCQ
   * style). Always asked as multiple choice with every one of its options,
   * never as typed recall.
   */
  mcq?: boolean;
  /** Short label shown above the question, e.g. "Calling a subclass method". */
  title?: string;
  /** Code snippet the question is about, shown under the question. */
  code?: string;
  /** Language of `code` for syntax highlighting, e.g. "java", "cpp", "python". */
  codeLang?: string;
  /** Optional nudge the student can open before answering. */
  hint?: string;
  materialId?: string;
  createdAt: string;
  starred?: boolean;
  suspended?: boolean;
  srs: SrsState;
}

export interface Deck {
  id: string;
  title: string;
  emoji: string;
  color: string;
  description: string;
  createdAt: string;
  /** Folder the deck sits in. Missing or null means the top level. */
  folderId?: string | null;
}

/** A folder of decks. Folders nest through `parentId` (null at the top level). */
export interface Folder {
  id: string;
  title: string;
  emoji: string;
  parentId: string | null;
  createdAt: string;
}

export type MaterialKind = 'text' | 'file' | 'url' | 'topic' | 'import' | 'mcq';

export interface Material {
  id: string;
  deckId: string;
  kind: MaterialKind;
  title: string;
  /** Short preview of the content. */
  preview: string;
  addedAt: string;
  cardCount: number;
}

export type StudyMode = 'quiz' | 'flashcards' | 'match' | 'timeattack' | 'boss';

export interface ReviewEntry {
  cardId: string;
  deckId: string;
  /** FSRS rating 1-4, or 0 when the answer did not touch scheduling (practice modes). */
  rating: number;
  correct: boolean;
  ms: number;
  mode: StudyMode;
  ts: string;
  day: string;
  /** True when this was the card's first ever review. */
  wasNew?: boolean;
}

export type QuestKind =
  | 'correct'
  | 'combo'
  | 'xp'
  | 'newCards'
  | 'flashcards'
  | 'sessions'
  | 'practice'
  | 'perfect';

export interface Quest {
  id: string;
  kind: QuestKind;
  label: string;
  target: number;
  progress: number;
  reward: number;
  claimed: boolean;
}

export interface Profile {
  name: string;
  avatar: string;
  theme: string;
  xp: number;
  coins: number;
  hints: number;
  streak: { current: number; best: number; lastDay: string | null; freezes: number };
  /** XP earned per local day (YYYY-MM-DD). */
  dailyXp: Record<string, number>;
  owned: string[];
  achievements: Record<string, string>;
  quests: { day: string; list: Quest[] };
  chestDays: string[];
  /** ISO time until which double XP is active. */
  doubleXpUntil: string | null;
  stats: {
    answers: number;
    correct: number;
    bestCombo: number;
    sessions: number;
    perfectSessions: number;
    bossesDefeated: number;
    timeAttackBest: number;
    matchBestMs: number | null;
    cardsCreated: number;
    decksCreated: number;
    aiGenerations: number;
    newLearned: number;
    flashcardsRated: number;
    chestsOpened: number;
    appeals: number;
    purchases: number;
  };
}

export interface Settings {
  /** Model for writing cards, distractors and explanations. */
  model: ModelChoice;
  /** Model for judging typed answers and appeals. Should be fast. */
  gradingModel: ModelChoice;
  desiredRetention: number;
  newPerDay: number;
  sessionSize: number;
  dailyGoalXp: number;
  sound: boolean;
  /** Sound effect volume, 0 to 1. */
  soundVolume: number;
  maxIntervalDays: number;
  /** Let Claude think before writing cards (slower, sometimes better). */
  thinking: boolean;
}

export interface DeckSummary extends Deck {
  cardCount: number;
  dueCount: number;
  newCount: number;
  /** 0-1 mastery across all cards. */
  mastery: number;
  materials: number;
  bossReady: boolean;
}

export interface FolderSummary extends Folder {
  /** Decks inside the folder and all its subfolders. */
  deckCount: number;
  folderCount: number;
  cardCount: number;
  dueCount: number;
  newCount: number;
  /** 0-1 mastery across every card inside. */
  mastery: number;
  bossReady: boolean;
}

/** Answer submitted by the client after each question. */
export interface AnswerInput {
  cardId: string;
  correct: boolean;
  /** Explicit rating (flashcard mode). If absent the server derives one. */
  rating?: number;
  ms: number;
  usedHint?: boolean;
  questionType?: 'mcq' | 'typed' | 'flip';
  combo: number;
}

export interface AnswerRequest {
  answer: AnswerInput;
  mode: StudyMode;
  day: string;
  /** Whether this answer should update FSRS scheduling (false for arcade modes). */
  scheduled: boolean;
}

export interface AnswerResult {
  xp: number;
  rating: number;
  card: Card | null;
  newAchievements: string[];
  questsCompleted: string[];
  doubleXp: boolean;
}

export interface SessionComplete {
  mode: StudyMode;
  deckId: string | null;
  day: string;
  answers: number;
  correct: number;
  maxCombo: number;
  /** XP already awarded per answer during the session. */
  sessionXp: number;
  bossDefeated?: boolean;
  timeAttackScore?: number;
  matchMs?: number;
}

export interface Reward {
  bonusXp: number;
  bonusReasons: string[];
  totalXp: number;
  coins: number;
  levelBefore: number;
  levelAfter: number;
  streakBefore: number;
  streakAfter: number;
  newAchievements: string[];
  questsCompleted: string[];
  goalReached: boolean;
  newRecord: boolean;
}
