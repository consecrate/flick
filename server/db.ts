// Single-user JSON file store. Everything lives in one file that is rewritten
// atomically after each change, which is plenty for a personal flashcard app.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { levelInfo } from '../shared/game.ts';
import type { Card, Deck, Folder, Material, Profile, ReviewEntry, Settings } from '../shared/types.ts';

export interface Data {
  version: 1;
  decks: Deck[];
  folders: Folder[];
  cards: Card[];
  materials: Material[];
  reviews: ReviewEntry[];
  profile: Profile;
  settings: Settings;
}

export const DATA_DIR = process.env.FLICK_DATA_DIR ?? path.join(os.homedir(), '.flick');
const FILE = path.join(DATA_DIR, 'data.json');

export function defaultProfile(): Profile {
  return {
    name: 'Learner',
    avatar: '⚡',
    theme: 'theme-midnight',
    hat: null,
    xp: 0,
    levelPaid: 1,
    coins: 50,
    hints: 5,
    streak: { current: 0, best: 0, lastDay: null, freezes: 1 },
    dailyXp: {},
    owned: [],
    achievements: {},
    quests: { day: '', list: [] },
    chestDays: [],
    doubleXpUntil: null,
    stats: {
      answers: 0,
      correct: 0,
      bestCombo: 0,
      sessions: 0,
      perfectSessions: 0,
      bossesDefeated: 0,
      timeAttackBest: 0,
      matchBestMs: null,
      cardsCreated: 0,
      decksCreated: 0,
      aiGenerations: 0,
      newLearned: 0,
      flashcardsRated: 0,
      chestsOpened: 0,
      appeals: 0,
      purchases: 0,
      questsClaimed: 0,
    },
  };
}

export function defaultSettings(): Settings {
  return {
    model: 'sonnet',
    gradingModel: 'haiku',
    desiredRetention: 0.9,
    newPerDay: 20,
    sessionSize: 12,
    dailyGoalXp: 150,
    sound: true,
    soundVolume: 0.7,
    maxIntervalDays: 365,
    thinking: false,
  };
}

function emptyData(): Data {
  return {
    version: 1,
    decks: [],
    folders: [],
    cards: [],
    materials: [],
    reviews: [],
    profile: defaultProfile(),
    settings: defaultSettings(),
  };
}

/** Fill in fields added in later versions, so old data files and backups keep working. */
function normalize(raw: Partial<Data>): Data {
  const base = emptyData();
  const profile: Profile = {
    ...base.profile,
    ...raw.profile,
    stats: { ...base.profile.stats, ...raw.profile?.stats },
    streak: { ...base.profile.streak, ...raw.profile?.streak },
  };
  // Players from before level rewards existed keep their coins as they are:
  // rewards start with their next level.
  if (typeof raw.profile?.levelPaid !== 'number') profile.levelPaid = levelInfo(profile.xp).level;
  return { ...base, ...raw, profile, settings: { ...base.settings, ...raw.settings } } as Data;
}

function load(): Data {
  try {
    return normalize(JSON.parse(fs.readFileSync(FILE, 'utf8')) as Partial<Data>);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      const backup = `${FILE}.corrupt-${Date.now()}`;
      try {
        fs.copyFileSync(FILE, backup);
      } catch {
        /* nothing to back up */
      }
      console.error(`[flick] could not read ${FILE}; starting fresh (backup at ${backup})`, err);
    }
    return emptyData();
  }
}

export const db: Data = load();

let timer: NodeJS.Timeout | null = null;

function writeNow() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, FILE);
}

/** Schedule a save. Writes are coalesced within 200ms. */
export function save() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    writeNow();
  }, 200);
}

export function flush() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  writeNow();
}

/** Replace all data (used by backup restore). */
export function replaceAll(next: Data) {
  Object.assign(db, normalize(next));
  flush();
}

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    try {
      flush();
    } finally {
      process.exit(0);
    }
  });
}

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
