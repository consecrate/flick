// Pure game rules shared by server and client: XP, levels, streaks, quests,
// achievements, shop items, mastery tiers and answer matching.

import type { Profile, Quest, QuestKind, SrsState } from './types.ts';

// ---------- dates ----------

export function localDay(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Whole days from day a to day b (YYYY-MM-DD). */
export function dayDiff(a: string, b: string): number {
  const ta = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  const tb = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10));
  return Math.round((tb - ta) / 86_400_000);
}

export function addDays(day: string, n: number): string {
  const t = Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)) + n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

// ---------- levels ----------

/** Total XP required to reach `level` (level 1 needs 0). */
export function xpForLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < level; l++) total += Math.round(80 * Math.pow(l, 1.35));
  return total;
}

export function levelInfo(xp: number) {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  const base = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { level, into: xp - base, needed: next - base, title: levelTitle(level) };
}

/** A rank every 5 levels. Level 100 takes years of daily study. */
export const RANKS: { level: number; title: string; icon: string }[] = [
  { level: 1, title: 'Fresh Recruit', icon: '🐣' },
  { level: 5, title: 'Card Flipper', icon: '🃏' },
  { level: 10, title: 'Quick Study', icon: '📘' },
  { level: 15, title: 'Note Ninja', icon: '🥷' },
  { level: 20, title: 'Recall Ranger', icon: '🏹' },
  { level: 25, title: 'Memory Mage', icon: '🪄' },
  { level: 30, title: 'Synapse Smith', icon: '⚒️' },
  { level: 35, title: 'Neuron Knight', icon: '🛡️' },
  { level: 40, title: 'Cortex Captain', icon: '⚓' },
  { level: 45, title: 'Brain Baron', icon: '🎩' },
  { level: 50, title: 'Recall Royalty', icon: '👑' },
  { level: 55, title: 'Grand Mnemonist', icon: '🧠' },
  { level: 60, title: 'Lore Keeper', icon: '📜' },
  { level: 65, title: 'Sage of Cards', icon: '🦉' },
  { level: 70, title: 'Archmage of Recall', icon: '🔮' },
  { level: 75, title: 'Mind Palace Architect', icon: '🏛️' },
  { level: 80, title: 'Living Library', icon: '📚' },
  { level: 85, title: 'Oracle', icon: '👁️' },
  { level: 90, title: 'Legend of Flick', icon: '🐉' },
  { level: 95, title: 'Eternal Scholar', icon: '🌌' },
  { level: 100, title: 'Flick Immortal', icon: '♾️' },
];

export function rankFor(level: number) {
  let r = RANKS[0];
  for (const x of RANKS) if (level >= x.level) r = x;
  return r;
}

export function levelTitle(level: number): string {
  return rankFor(level).title;
}

/** Coins paid when you reach `level`. */
export function levelCoins(level: number): number {
  return level * 10;
}

/** Shop items given free when you reach `level`. */
export function unlocksAtLevel(level: number): ShopItem[] {
  return SHOP.filter((i) => i.price === 0 && i.unlockLevel === level);
}

/** Everything gained by going from level `from` to level `to`. */
export function levelUpRewards(from: number, to: number) {
  let coins = 0;
  const unlocks: string[] = [];
  for (let l = from + 1; l <= to; l++) {
    coins += levelCoins(l);
    unlocks.push(...unlocksAtLevel(l).map((i) => i.id));
  }
  const rank = rankFor(to).level > from ? rankFor(to) : null;
  return { coins, unlocks, rank };
}

// ---------- XP ----------

export interface XpInput {
  correct: boolean;
  isNew: boolean;
  combo: number;
  ms: number;
  usedHint?: boolean;
  questionType?: 'mcq' | 'typed' | 'flip';
  /** Arcade answers (no scheduling) earn half XP so real reviews stay the best source. */
  practice?: boolean;
}

export function xpForAnswer(a: XpInput): number {
  if (!a.correct) return 1; // effort still counts
  let xp = a.questionType === 'typed' ? 14 : 10;
  if (a.isNew) xp += 4;
  xp += Math.min(a.combo, 10);
  if (a.ms > 0 && a.ms < 5000) xp += 4;
  if (a.usedHint) xp = Math.ceil(xp / 2);
  if (a.practice) xp = Math.ceil(xp / 2);
  return xp;
}

export const SESSION_BONUS = { perfect: 40, boss: 100, complete: 15 };

export function coinsForXp(xp: number): number {
  return Math.floor(xp / 10);
}

/**
 * Derive an FSRS rating (1 Again, 2 Hard, 3 Good, 4 Easy) from quiz behaviour.
 * Recognition (MCQ) caps at Good; fast, hint-free recall of a known card earns Easy.
 */
export function ratingFromAnswer(a: {
  correct: boolean;
  usedHint?: boolean;
  ms: number;
  questionType?: 'mcq' | 'typed' | 'flip';
  isNew: boolean;
}): 1 | 2 | 3 | 4 {
  if (!a.correct) return 1;
  if (a.usedHint) return 2;
  if (a.questionType === 'typed' && !a.isNew && a.ms < 6000) return 4;
  return 3;
}

// ---------- hearts ----------

export const QUIZ_HEARTS = 5;
export const BOSS_HEARTS = 3;
export const REVIVE_COST = 25;

// ---------- streak ----------

/** Streak value to display today, accounting for missed days and freezes. */
export function effectiveStreak(s: Profile['streak'], today: string): number {
  if (!s.lastDay) return 0;
  const gap = dayDiff(s.lastDay, today);
  if (gap <= 1) return s.current;
  return gap - 1 <= s.freezes ? s.current : 0;
}

/** Apply activity on `today` to the streak. Mutates and returns the streak. */
export function bumpStreak(s: Profile['streak'], today: string): Profile['streak'] {
  if (s.lastDay === today) return s;
  if (!s.lastDay) {
    s.current = 1;
  } else {
    const gap = dayDiff(s.lastDay, today);
    if (gap <= 0) return s; // clock went backwards; ignore
    const missed = gap - 1;
    if (missed === 0) s.current += 1;
    else if (missed <= s.freezes) {
      s.freezes -= missed;
      s.current += 1;
    } else s.current = 1;
  }
  s.lastDay = today;
  s.best = Math.max(s.best, s.current);
  return s;
}

// ---------- quests ----------

interface QuestTemplate {
  kind: QuestKind;
  targets: number[];
  label: (n: number) => string;
  reward: (n: number) => number;
}

const QUEST_POOL: QuestTemplate[] = [
  { kind: 'correct', targets: [15, 25, 40], label: (n) => `Answer ${n} questions correctly`, reward: (n) => 10 + n },
  { kind: 'combo', targets: [5, 8, 12], label: (n) => `Hit a ${n}x combo`, reward: (n) => 10 + n * 3 },
  { kind: 'xp', targets: [100, 200, 300], label: (n) => `Earn ${n} XP`, reward: (n) => 10 + n / 10 },
  { kind: 'newCards', targets: [5, 10], label: (n) => `Learn ${n} new cards`, reward: (n) => 15 + n * 2 },
  { kind: 'flashcards', targets: [10, 20], label: (n) => `Rate ${n} cards in Flashcards`, reward: (n) => 10 + n },
  { kind: 'sessions', targets: [2, 3], label: (n) => `Finish ${n} study sessions (Quiz or Flashcards)`, reward: (n) => 15 * n },
  { kind: 'practice', targets: [1, 2], label: (n) => `Play ${n} arcade game${n > 1 ? 's' : ''} (Match, Time Attack, Boss)`, reward: (n) => 20 * n },
  { kind: 'perfect', targets: [1], label: () => 'Finish a quiz with no mistakes', reward: () => 40 },
];

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function seededRandom(seed: string) {
  let x = hashString(seed) || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 1_000_000) / 1_000_000;
  };
}

/** Three deterministic quests for a given day. */
export function questsForDay(day: string): Quest[] {
  const rnd = seededRandom(`quests:${day}`);
  const pool = [...QUEST_POOL];
  const picked: Quest[] = [];
  while (picked.length < 3 && pool.length) {
    const t = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
    const n = t.targets[Math.floor(rnd() * t.targets.length)];
    picked.push({
      id: `${day}:${t.kind}`,
      kind: t.kind,
      label: t.label(n),
      target: n,
      progress: 0,
      reward: Math.round(t.reward(n)),
      claimed: false,
    });
  }
  return picked;
}

// ---------- monthly medals ----------

/** Days studied in a calendar month earn a medal. Gold needs 28 days, so February counts too. */
export const MEDALS = [
  { id: 'gold', icon: '🥇', name: 'Gold', days: 28 },
  { id: 'silver', icon: '🥈', name: 'Silver', days: 20 },
  { id: 'bronze', icon: '🥉', name: 'Bronze', days: 10 },
] as const;
export type MedalId = (typeof MEDALS)[number]['id'];

export function medalFor(days: number) {
  return MEDALS.find((m) => days >= m.days) ?? null;
}

/** Days studied per month (YYYY-MM) from the XP log. */
export function studyDaysByMonth(dailyXp: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [day, xp] of Object.entries(dailyXp)) {
    if (xp > 0) out[day.slice(0, 7)] = (out[day.slice(0, 7)] ?? 0) + 1;
  }
  return out;
}

export function daysStudied(dailyXp: Record<string, number>): number {
  return Object.values(dailyXp).filter((x) => x > 0).length;
}

/** Count of months that earned at least the given medal. */
export function medalMonths(dailyXp: Record<string, number>, atLeast: MedalId): number {
  const need = MEDALS.find((m) => m.id === atLeast)!.days;
  return Object.values(studyDaysByMonth(dailyXp)).filter((d) => d >= need).length;
}

// ---------- achievements ----------

/** Facts about the collection that live outside the profile. */
export interface AchievementContext {
  /** Cards at the Mastered tier right now. */
  mastered: number;
}

/**
 * Trophies come in families. Each family tracks one number and has tiers with
 * rising targets, so there is always a next tier to chase. Ids of the
 * original single trophies are kept so earned ones stay earned.
 */
export interface TrophyFamily {
  id: string;
  name: string;
  /** Describes a target, e.g. (100) => 'Answer 100 questions correctly'. */
  desc: (n: number) => string;
  metric: (p: Profile, level: number, ctx?: AchievementContext) => number | null;
  /** For records where lower is better (Match time in ms). */
  lowerIsBetter?: boolean;
  tiers: { id: string; target: number; name: string; icon: string }[];
}

const fmt = (x: number) => x.toLocaleString('en-US');

export const TROPHY_FAMILIES: TrophyFamily[] = [
  {
    id: 'correct', name: 'Right Answers', desc: (t) => `Answer ${fmt(t)} question${t === 1 ? '' : 's'} correctly`, metric: (p) => p.stats.correct,
    tiers: [
      { id: 'first-steps', target: 1, name: 'First Steps', icon: '👣' },
      { id: 'century', target: 100, name: 'Century', icon: '💯' },
      { id: 'kilo', target: 1000, name: 'Kilo-Recall', icon: '🏔️' },
      { id: 'correct-5k', target: 5000, name: 'Recall Machine', icon: '⚙️' },
      { id: 'correct-25k', target: 25_000, name: 'Answer Avalanche', icon: '🌨️' },
      { id: 'correct-100k', target: 100_000, name: 'Hundred Thousand', icon: '🏆' },
    ],
  },
  {
    id: 'streak', name: 'Streaks', desc: (t) => `Reach a ${fmt(t)}-day streak`, metric: (p) => p.streak.best,
    tiers: [
      { id: 'streak-3', target: 3, name: 'Kindling', icon: '🕯️' },
      { id: 'streak-7', target: 7, name: 'Week Warrior', icon: '🔥' },
      { id: 'streak-30', target: 30, name: 'Monthly Monk', icon: '🌋' },
      { id: 'streak-100', target: 100, name: 'Centurion', icon: '🌞' },
      { id: 'streak-365', target: 365, name: 'Year of Fire', icon: '☄️' },
      { id: 'streak-730', target: 730, name: 'Two Summers', icon: '🌠' },
      { id: 'streak-1000', target: 1000, name: 'The Thousand', icon: '🪐' },
    ],
  },
  {
    id: 'days', name: 'Study Days', desc: (t) => `Study on ${fmt(t)} different days`, metric: (p) => daysStudied(p.dailyXp),
    tiers: [
      { id: 'days-10', target: 10, name: 'Regular', icon: '📅' },
      { id: 'days-50', target: 50, name: 'Habit Formed', icon: '🗓️' },
      { id: 'days-100', target: 100, name: 'Hundred Days', icon: '💪' },
      { id: 'days-365', target: 365, name: 'A Year of Days', icon: '🎂' },
      { id: 'days-730', target: 730, name: 'Two Years In', icon: '🎓' },
      { id: 'days-1500', target: 1500, name: 'Lifelong Learner', icon: '🌳' },
    ],
  },
  {
    id: 'medals', name: 'Monthly Medals', desc: (t) => `Earn a monthly medal ${t === 1 ? 'once' : `in ${t} months`} (10+ study days)`, metric: (p) => medalMonths(p.dailyXp, 'bronze'),
    tiers: [
      { id: 'medal-1', target: 1, name: 'On the Podium', icon: '🥉' },
      { id: 'medal-6', target: 6, name: 'Half a Year', icon: '🏅' },
      { id: 'medal-12', target: 12, name: 'Full Calendar', icon: '📆' },
      { id: 'medal-24', target: 24, name: 'Medal Cabinet', icon: '🗄️' },
      { id: 'medal-48', target: 48, name: 'Hall of Fame', icon: '🏛️' },
    ],
  },
  {
    id: 'gold', name: 'Gold Months', desc: (t) => `Study 28+ days in ${t === 1 ? 'a month' : `${t} months`}`, metric: (p) => medalMonths(p.dailyXp, 'gold'),
    tiers: [
      { id: 'gold-1', target: 1, name: 'Golden Month', icon: '🥇' },
      { id: 'gold-6', target: 6, name: 'Gilded', icon: '✨' },
      { id: 'gold-12', target: 12, name: 'Golden Year', icon: '🌟' },
      { id: 'gold-36', target: 36, name: 'Midas', icon: '👑' },
    ],
  },
  {
    id: 'learned', name: 'Cards Learned', desc: (t) => `Learn ${fmt(t)} new cards`, metric: (p) => p.stats.newLearned,
    tiers: [
      { id: 'new-50', target: 50, name: 'Sprouting', icon: '🌱' },
      { id: 'new-500', target: 500, name: 'Forest of Facts', icon: '🌳' },
      { id: 'new-2000', target: 2000, name: 'Jungle of Knowledge', icon: '🌴' },
      { id: 'new-10000', target: 10_000, name: 'Ten Thousand Things', icon: '🗺️' },
    ],
  },
  {
    id: 'mastered', name: 'Mastery', desc: (t) => `Have ${fmt(t)} cards at Mastered at once`, metric: (_p, _l, ctx) => (ctx ? ctx.mastered : null),
    tiers: [
      { id: 'mastered-10', target: 10, name: 'Locked In', icon: '🔐' },
      { id: 'mastered-100', target: 100, name: 'Long-Term Memory', icon: '🧠' },
      { id: 'mastered-500', target: 500, name: 'Memory Vault', icon: '🏦' },
      { id: 'mastered-2000', target: 2000, name: 'Walking Encyclopedia', icon: '📖' },
      { id: 'mastered-5000', target: 5000, name: 'Total Recall', icon: '💠' },
    ],
  },
  {
    id: 'level', name: 'Levels', desc: (t) => `Reach level ${t}`, metric: (_p, l) => l,
    tiers: [
      { id: 'level-5', target: 5, name: 'Rising Star', icon: '⭐' },
      { id: 'level-15', target: 15, name: 'Supernova', icon: '🌟' },
      { id: 'level-25', target: 25, name: 'Constellation', icon: '✨' },
      { id: 'level-40', target: 40, name: 'Galaxy Brain', icon: '🌌' },
      { id: 'level-60', target: 60, name: 'Lore Keeper', icon: '📜' },
      { id: 'level-80', target: 80, name: 'Living Library', icon: '📚' },
      { id: 'level-100', target: 100, name: 'Flick Immortal', icon: '♾️' },
    ],
  },
  {
    id: 'sessions', name: 'Sessions', desc: (t) => `Finish ${fmt(t)} study sessions or games`, metric: (p) => p.stats.sessions,
    tiers: [
      { id: 'sessions-10', target: 10, name: 'Warming Up', icon: '🏃' },
      { id: 'sessions-100', target: 100, name: 'Regular Grinder', icon: '🔁' },
      { id: 'sessions-500', target: 500, name: 'Marathoner', icon: '🏅' },
      { id: 'sessions-2000', target: 2000, name: 'Iron Will', icon: '🦾' },
    ],
  },
  {
    id: 'combo', name: 'Combos', desc: (t) => `Reach a ${t}x combo`, metric: (p) => p.stats.bestCombo,
    tiers: [
      { id: 'combo-10', target: 10, name: 'On Fire', icon: '🔥' },
      { id: 'combo-25', target: 25, name: 'Unstoppable', icon: '☄️' },
      { id: 'combo-50', target: 50, name: 'Untouchable', icon: '🌪️' },
      { id: 'combo-100', target: 100, name: 'Perfect Storm', icon: '⛈️' },
    ],
  },
  {
    id: 'perfect', name: 'Perfect Quizzes', desc: (t) => (t === 1 ? 'Finish a quiz with no mistakes' : `Finish ${fmt(t)} perfect quizzes`), metric: (p) => p.stats.perfectSessions,
    tiers: [
      { id: 'flawless', target: 1, name: 'Flawless', icon: '💎' },
      { id: 'perfectionist', target: 10, name: 'Perfectionist', icon: '👑' },
      { id: 'perfect-50', target: 50, name: 'Immaculate', icon: '🪞' },
      { id: 'perfect-250', target: 250, name: 'Zero Defects', icon: '🎯' },
    ],
  },
  {
    id: 'boss', name: 'Boss Hunter', desc: (t) => (t === 1 ? 'Defeat a boss' : `Defeat ${fmt(t)} bosses`), metric: (p) => p.stats.bossesDefeated,
    tiers: [
      { id: 'boss-1', target: 1, name: 'Giant Slayer', icon: '⚔️' },
      { id: 'boss-10', target: 10, name: 'Dragon Tamer', icon: '🐉' },
      { id: 'boss-50', target: 50, name: 'Monster Hunter', icon: '🏹' },
      { id: 'boss-250', target: 250, name: 'Bane of Forgetting', icon: '🗡️' },
    ],
  },
  {
    id: 'speed', name: 'Time Attack', desc: (t) => `Score ${t}+ in Time Attack`, metric: (p) => p.stats.timeAttackBest,
    tiers: [
      { id: 'speed-15', target: 15, name: 'Speed Demon', icon: '⏱️' },
      { id: 'speed-30', target: 30, name: 'Lightning Mind', icon: '⚡' },
      { id: 'speed-45', target: 45, name: 'Warp Speed', icon: '🚀' },
    ],
  },
  {
    id: 'match', name: 'Match', desc: (t) => `Clear a Match board in under ${t / 1000}s`, metric: (p) => p.stats.matchBestMs, lowerIsBetter: true,
    tiers: [
      { id: 'matchmaker', target: 30_000, name: 'Matchmaker', icon: '🧩' },
      { id: 'match-20', target: 20_000, name: 'Quick Pairs', icon: '🎴' },
      { id: 'match-12', target: 12_000, name: 'Blur', icon: '💨' },
    ],
  },
  {
    id: 'decks', name: 'Deck Builder', desc: (t) => (t === 1 ? 'Create your first deck' : `Create ${t} decks`), metric: (p) => p.stats.decksCreated,
    tiers: [
      { id: 'deck-builder', target: 1, name: 'Deck Builder', icon: '🧱' },
      { id: 'librarian', target: 5, name: 'Librarian', icon: '📚' },
      { id: 'decks-20', target: 20, name: 'Curator', icon: '🗃️' },
      { id: 'decks-50', target: 50, name: 'Archivist', icon: '🏛️' },
    ],
  },
  {
    id: 'ai', name: 'AI Alchemy', desc: (t) => `Generate cards with Claude ${t} times`, metric: (p) => p.stats.aiGenerations,
    tiers: [
      { id: 'ai-alchemist', target: 5, name: 'AI Alchemist', icon: '🧪' },
      { id: 'ai-25', target: 25, name: 'Transmuter', icon: '⚗️' },
      { id: 'ai-100', target: 100, name: 'Philosopher’s Stone', icon: '💠' },
    ],
  },
  {
    id: 'quests', name: 'Quests', desc: (t) => `Claim ${fmt(t)} daily quests`, metric: (p) => p.stats.questsClaimed,
    tiers: [
      { id: 'quests-10', target: 10, name: 'Errand Runner', icon: '📜' },
      { id: 'quests-100', target: 100, name: 'Questing Knight', icon: '🛡️' },
      { id: 'quests-500', target: 500, name: 'Hero of the Realm', icon: '🗺️' },
      { id: 'quests-1500', target: 1500, name: 'Living Legend', icon: '🏰' },
    ],
  },
  {
    id: 'chests', name: 'Treasure', desc: (t) => `Open ${fmt(t)} daily chests`, metric: (p) => p.stats.chestsOpened,
    tiers: [
      { id: 'chest-7', target: 7, name: 'Treasure Hunter', icon: '🧰' },
      { id: 'chest-30', target: 30, name: 'Loot Goblin', icon: '💰' },
      { id: 'chest-100', target: 100, name: 'Dragon’s Hoard', icon: '🐲' },
      { id: 'chest-365', target: 365, name: 'Year of Plenty', icon: '🎁' },
      { id: 'chest-1000', target: 1000, name: 'Treasure Vault', icon: '🏴‍☠️' },
    ],
  },
  {
    id: 'shopper', name: 'Shopper', desc: (t) => (t === 1 ? 'Buy something from the shop' : `Make ${t} purchases`), metric: (p) => p.stats.purchases,
    tiers: [
      { id: 'shopper', target: 1, name: 'Retail Therapy', icon: '🛍️' },
      { id: 'shopper-10', target: 10, name: 'Regular Customer', icon: '🧾' },
      { id: 'shopper-50', target: 50, name: 'Big Spender', icon: '💳' },
    ],
  },
  {
    id: 'appeals', name: 'Appeals', desc: (t) => (t === 1 ? 'Win an appeal with Claude' : `Win ${t} appeals with Claude`), metric: (p) => p.stats.appeals,
    tiers: [
      { id: 'lawyer', target: 1, name: 'Objection!', icon: '⚖️' },
      { id: 'appeals-10', target: 10, name: 'Star Counsel', icon: '👨‍⚖️' },
    ],
  },
];

/** Coins paid for unlocking a trophy, by its tier position in its family. */
export const TIER_COINS = [10, 25, 50, 100, 200, 400, 800];

export interface AchievementDef {
  id: string;
  icon: string;
  name: string;
  desc: string;
  family: string;
  tier: number;
  coins: number;
  test: (p: Profile, level: number, ctx?: AchievementContext) => boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = TROPHY_FAMILIES.flatMap((f) =>
  f.tiers.map((t, i) => ({
    id: t.id,
    icon: t.icon,
    name: t.name,
    desc: f.desc(t.target),
    family: f.id,
    tier: i,
    coins: TIER_COINS[Math.min(i, TIER_COINS.length - 1)],
    test: (p: Profile, level: number, ctx?: AchievementContext) => {
      const v = f.metric(p, level, ctx);
      if (v === null) return false;
      return f.lowerIsBetter ? v < t.target : v >= t.target;
    },
  })),
);

/**
 * Unlock every trophy the profile now qualifies for and pay its coins.
 * Trophies that need `ctx` are only checked when it is given.
 */
export function checkAchievements(p: Profile, ctx?: AchievementContext): string[] {
  const level = levelInfo(p.xp).level;
  const fresh: string[] = [];
  for (const a of ACHIEVEMENTS) {
    if (!p.achievements[a.id] && a.test(p, level, ctx)) {
      p.achievements[a.id] = new Date().toISOString();
      p.coins += a.coins;
      fresh.push(a.id);
    }
  }
  return fresh;
}

// ---------- shop ----------

export type ShopKind = 'consumable' | 'theme' | 'avatar' | 'hat' | 'boost';

export interface ShopItem {
  id: string;
  kind: ShopKind;
  name: string;
  desc: string;
  icon: string;
  price: number;
  /** For themes: [background, surface, accent, ink (text)]. For avatars: the emoji. */
  value?: string | string[];
  max?: number;
  /**
   * Level gate. With price 0 the item is a free level reward; with a price it
   * can be bought only from this level on.
   */
  unlockLevel?: number;
}

export const SHOP: ShopItem[] = [
  { id: 'freeze', kind: 'consumable', name: 'Streak Freeze', desc: 'Protects your streak for one missed day. Hold up to 3.', icon: '🧊', price: 60, max: 3 },
  { id: 'hints5', kind: 'consumable', name: 'Hint Pack', desc: '+5 hints. Use them for 50/50 or letter reveals.', icon: '💡', price: 30 },
  { id: 'double-xp', kind: 'boost', name: 'Double XP (15 min)', desc: 'Every XP you earn is doubled for 15 minutes.', icon: '🚀', price: 80 },
  // 'theme-midnight' keeps its id because it is every existing profile's default theme; it is the light default now.
  { id: 'theme-midnight', kind: 'theme', name: 'Daylight', desc: 'Bright and friendly, with a violet pop. The default.', icon: '☀️', price: 0, value: ['#f4f5fb', '#ffffff', '#6c5cff', '#191f33'] },
  { id: 'theme-night', kind: 'theme', name: 'Midnight', desc: 'The same look after dark.', icon: '🌙', price: 0, value: ['#121320', '#1c1e2d', '#8f82ff', '#eef0fa'] },
  { id: 'theme-ocean', kind: 'theme', name: 'Lagoon', desc: 'Fresh teal, like a summer pool.', icon: '🌊', price: 120, value: ['#edf9f8', '#ffffff', '#12b8a6', '#10272a'] },
  { id: 'theme-sunset', kind: 'theme', name: 'Sunset', desc: 'Warm peach with a tangerine pop.', icon: '🌅', price: 120, value: ['#fff5f0', '#ffffff', '#ff6a3d', '#2b1a14'] },
  { id: 'theme-forest', kind: 'theme', name: 'Forest', desc: 'Leafy greens for calm focus.', icon: '🌲', price: 120, value: ['#f1f8f2', '#ffffff', '#1fae62', '#14261c'] },
  { id: 'theme-candy', kind: 'theme', name: 'Candy', desc: 'Bubblegum pink, no sugar crash.', icon: '🍬', price: 200, value: ['#fdf2f8', '#ffffff', '#ec4899', '#2b1424'] },
  { id: 'theme-gold', kind: 'theme', name: 'Gold Rush', desc: 'For the high rollers.', icon: '🏆', price: 400, value: ['#fffaea', '#ffffff', '#e9a100', '#2a2108'] },
  { id: 'avatar-fox', kind: 'avatar', name: 'Fox', desc: 'Clever and quick.', icon: '🦊', price: 50, value: '🦊' },
  { id: 'avatar-owl', kind: 'avatar', name: 'Owl', desc: 'Wise night studier.', icon: '🦉', price: 50, value: '🦉' },
  { id: 'avatar-octopus', kind: 'avatar', name: 'Octopus', desc: 'Eight arms, eight cards at once.', icon: '🐙', price: 80, value: '🐙' },
  { id: 'avatar-robot', kind: 'avatar', name: 'Robot', desc: 'Beep boop, recall complete.', icon: '🤖', price: 80, value: '🤖' },
  { id: 'avatar-alien', kind: 'avatar', name: 'Alien', desc: 'Out of this world memory.', icon: '👽', price: 120, value: '👽' },
  { id: 'avatar-dragon', kind: 'avatar', name: 'Dragon', desc: 'Hoards knowledge like gold.', icon: '🐉', price: 250, value: '🐉' },
  { id: 'avatar-unicorn', kind: 'avatar', name: 'Unicorn', desc: 'A rare learner.', icon: '🦄', price: 300, value: '🦄' },
  { id: 'avatar-crown', kind: 'avatar', name: 'Royalty', desc: 'Only for the devoted.', icon: '👑', price: 600, value: '👑' },

  // Level rewards: free once you reach the level.
  { id: 'avatar-chick', kind: 'avatar', name: 'Chick', desc: 'Freshly hatched.', icon: '🐣', price: 0, value: '🐣', unlockLevel: 2 },
  { id: 'hat-party', kind: 'hat', name: 'Party Hat', desc: 'Flicky is ready to celebrate.', icon: '🎉', price: 0, unlockLevel: 3 },
  { id: 'theme-mint', kind: 'theme', name: 'Mint', desc: 'Cool and crisp.', icon: '🌿', price: 0, value: ['#effaf5', '#ffffff', '#10b981', '#11261d'], unlockLevel: 4 },
  { id: 'avatar-panda', kind: 'avatar', name: 'Panda', desc: 'Chill, but never misses a review.', icon: '🐼', price: 0, value: '🐼', unlockLevel: 5 },
  { id: 'hat-beanie', kind: 'hat', name: 'Beanie', desc: 'Cozy late-night studying.', icon: '🧶', price: 0, unlockLevel: 6 },
  { id: 'theme-lavender', kind: 'theme', name: 'Lavender', desc: 'Soft purple, easy on the eyes.', icon: '💜', price: 0, value: ['#f6f3ff', '#ffffff', '#8b5cf6', '#221a36'], unlockLevel: 8 },
  { id: 'hat-grad', kind: 'hat', name: 'Grad Cap', desc: 'Ten levels. Flicky graduates.', icon: '🎓', price: 0, unlockLevel: 10 },
  { id: 'avatar-lion', kind: 'avatar', name: 'Lion', desc: 'King of the study jungle.', icon: '🦁', price: 0, value: '🦁', unlockLevel: 12 },
  { id: 'hat-headphones', kind: 'hat', name: 'Headphones', desc: 'Focus mode on.', icon: '🎧', price: 0, unlockLevel: 15 },
  { id: 'theme-deep', kind: 'theme', name: 'Deep Sea', desc: 'Dark navy with aqua lights.', icon: '🐋', price: 0, value: ['#0d1824', '#152433', '#2dd4bf', '#e6f4f2'], unlockLevel: 18 },
  { id: 'hat-wizard', kind: 'hat', name: 'Wizard Hat', desc: 'For a Recall Ranger with spells.', icon: '🧙', price: 0, unlockLevel: 20 },
  { id: 'avatar-wolf', kind: 'avatar', name: 'Wolf', desc: 'Hunts down due cards.', icon: '🐺', price: 0, value: '🐺', unlockLevel: 25 },
  { id: 'hat-tophat', kind: 'hat', name: 'Top Hat', desc: 'Distinguished, at level 30.', icon: '🎩', price: 0, unlockLevel: 30 },
  { id: 'theme-ember', kind: 'theme', name: 'Ember', desc: 'Dark charcoal with glowing orange coals.', icon: '🔥', price: 0, value: ['#1a1412', '#261d1a', '#ff7a3d', '#f7ebe4'], unlockLevel: 35 },
  { id: 'hat-viking', kind: 'hat', name: 'Viking Helmet', desc: 'Forty levels of conquest.', icon: '🪖', price: 0, unlockLevel: 40 },
  { id: 'avatar-mage', kind: 'avatar', name: 'Mage', desc: 'Master of the arcane arts of recall.', icon: '🧙', price: 0, value: '🧙', unlockLevel: 45 },
  { id: 'hat-crown', kind: 'hat', name: 'Crown', desc: 'Recall Royalty, at level 50.', icon: '👑', price: 0, unlockLevel: 50 },
  { id: 'theme-royal', kind: 'theme', name: 'Royal', desc: 'Deep purple and gold, for level 60.', icon: '⚜️', price: 0, value: ['#17112a', '#21193a', '#f5c542', '#f3eefe'], unlockLevel: 60 },
  { id: 'avatar-orb', kind: 'avatar', name: 'Crystal Ball', desc: 'You can see the answers coming.', icon: '🔮', price: 0, value: '🔮', unlockLevel: 70 },
  { id: 'hat-halo', kind: 'hat', name: 'Halo', desc: 'Seventy-five levels of devotion.', icon: '😇', price: 0, unlockLevel: 75 },
  { id: 'theme-paper', kind: 'theme', name: 'Old Paper', desc: 'Ink on parchment, for a Living Library.', icon: '📜', price: 0, value: ['#f6f0e1', '#fffaf0', '#8c5a2b', '#2a2117'], unlockLevel: 80 },
  { id: 'avatar-galaxy', kind: 'avatar', name: 'Galaxy', desc: 'A whole universe of facts.', icon: '🌌', price: 0, value: '🌌', unlockLevel: 90 },
  { id: 'hat-laurel', kind: 'hat', name: 'Laurel Wreath', desc: 'Level 100. Flick Immortal.', icon: '🌿', price: 0, unlockLevel: 100 },
  { id: 'avatar-infinity', kind: 'avatar', name: 'Infinity', desc: 'There is no level 101 badge. This is it.', icon: '♾️', price: 0, value: '♾️', unlockLevel: 100 },

  // Bought with coins. Some only appear from a certain level.
  { id: 'hat-cap', kind: 'hat', name: 'Ball Cap', desc: 'Sporty and casual.', icon: '🧢', price: 150 },
  { id: 'hat-bow', kind: 'hat', name: 'Bow', desc: 'A little flair.', icon: '🎀', price: 150 },
  { id: 'hat-flowers', kind: 'hat', name: 'Flower Crown', desc: 'Spring in every season.', icon: '🌸', price: 300, unlockLevel: 8 },
  { id: 'hat-chef', kind: 'hat', name: 'Chef Hat', desc: 'Cooking up fresh cards.', icon: '🧑‍🍳', price: 450, unlockLevel: 12 },
  { id: 'hat-cowboy', kind: 'hat', name: 'Cowboy Hat', desc: 'Wrangles wild facts.', icon: '🤠', price: 700, unlockLevel: 20 },
  { id: 'hat-pirate', kind: 'hat', name: 'Pirate Hat', desc: 'Plunders knowledge on the high seas.', icon: '🏴‍☠️', price: 1200, unlockLevel: 30 },
  { id: 'theme-cherry', kind: 'theme', name: 'Cherry', desc: 'Bright red, full of energy.', icon: '🍒', price: 350, value: ['#fff2f2', '#ffffff', '#e5383b', '#2b1213'], unlockLevel: 10 },
  { id: 'theme-slate', kind: 'theme', name: 'Slate', desc: 'Calm dark grey with a sky-blue pop.', icon: '🪨', price: 600, value: ['#16191d', '#1f2329', '#4ea8ff', '#e8edf3'], unlockLevel: 15 },
  { id: 'theme-citrus', kind: 'theme', name: 'Citrus', desc: 'Lemon-lime and wide awake.', icon: '🍋', price: 900, value: ['#fbfde9', '#ffffff', '#84b500', '#1f2608'], unlockLevel: 25 },
  { id: 'theme-obsidian', kind: 'theme', name: 'Obsidian', desc: 'Pure black with a hot pink edge.', icon: '🖤', price: 2000, value: ['#0b0b0e', '#16161b', '#ff4f9a', '#f2f2f5'], unlockLevel: 40 },
  { id: 'avatar-penguin', kind: 'avatar', name: 'Penguin', desc: 'Dressed for the exam.', icon: '🐧', price: 200, value: '🐧' },
  { id: 'avatar-trex', kind: 'avatar', name: 'T. rex', desc: 'Tiny arms, huge memory.', icon: '🦖', price: 450, value: '🦖', unlockLevel: 10 },
  { id: 'avatar-flamingo', kind: 'avatar', name: 'Flamingo', desc: 'Balanced on one leg, and one deck.', icon: '🦩', price: 700, value: '🦩', unlockLevel: 20 },
  { id: 'avatar-whale', kind: 'avatar', name: 'Whale', desc: 'A big brain for a big ocean.', icon: '🐳', price: 1200, value: '🐳', unlockLevel: 30 },
  { id: 'avatar-peacock', kind: 'avatar', name: 'Peacock', desc: 'Show off a little. You earned it.', icon: '🦚', price: 2500, value: '🦚', unlockLevel: 50 },
];

/** Whether the player can use a theme, avatar or hat at their current level. */
export function ownsItem(p: Pick<Profile, 'owned'>, item: ShopItem, level: number): boolean {
  if (item.price === 0) return !item.unlockLevel || level >= item.unlockLevel;
  return p.owned.includes(item.id);
}

// ---------- chests ----------

export function rollChest(seed: string): { coins: number; hints: number; freeze: boolean } {
  const r = seededRandom(`chest:${seed}`);
  const coins = 20 + Math.floor(r() * 41);
  const hints = r() < 0.35 ? 2 : 0;
  const freeze = r() < 0.12;
  return { coins, hints, freeze };
}

// ---------- mastery ----------

export interface MasteryTier {
  id: number;
  name: string;
  color: string;
}

export const MASTERY_TIERS: MasteryTier[] = [
  { id: 0, name: 'New', color: 'var(--tier-0)' },
  { id: 1, name: 'Learning', color: 'var(--tier-1)' },
  { id: 2, name: 'Familiar', color: 'var(--tier-2)' },
  { id: 3, name: 'Proficient', color: 'var(--tier-3)' },
  { id: 4, name: 'Mastered', color: 'var(--tier-4)' },
];

/** Mastery tier from FSRS stability (days until recall drops to ~90%). */
export function masteryTier(srs: SrsState): number {
  if (srs.state === 0) return 0;
  if (srs.state === 1 || srs.state === 3 || srs.stability < 3) return 1;
  if (srs.stability < 14) return 2;
  if (srs.stability < 60) return 3;
  return 4;
}

/** 0..1 mastery score for a card. */
export function masteryScore(srs: SrsState): number {
  return masteryTier(srs) / 4;
}

// ---------- answer matching ----------

export function normalizeAnswer(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\b(the|a|an)\b/g, ' ')
    .replace(/[^\p{L}\p{N}\s.]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Local typed-answer check. Accepts close spellings and answers that match one
 * of several comma/semicolon/slash-separated alternatives. Long answers that
 * fail here can be appealed to Claude for a semantic judgement.
 */
export function matchAnswer(given: string, expected: string): 'correct' | 'close' | 'wrong' {
  const g = normalizeAnswer(given);
  if (!g) return 'wrong';
  const options = [expected, ...expected.split(/[;,/]| or /i)].map(normalizeAnswer).filter(Boolean);
  let best = 0;
  for (const o of options) {
    if (o === g) return 'correct';
    const sim = 1 - levenshtein(g, o) / Math.max(g.length, o.length);
    best = Math.max(best, sim);
  }
  if (best >= 0.85) return 'correct';
  if (best >= 0.6) return 'close';
  return 'wrong';
}

/** Letter-reveal hint: shows the first letter of each word. */
export function letterHint(answer: string): string {
  return answer
    .split(/(\s+)/)
    .map((w) => (/\s/.test(w) || !w ? w : w[0] + w.slice(1).replace(/[\p{L}\p{N}]/gu, '_')))
    .join('');
}

// ---------- bosses ----------

export const BOSSES = [
  { name: 'The Forgetful Golem', emoji: '🗿' },
  { name: 'Hydra of Half-Truths', emoji: '🐉' },
  { name: 'Lich of Lapses', emoji: '💀' },
  { name: 'The Fog Kraken', emoji: '🦑' },
  { name: 'Procrastination Imp', emoji: '👹' },
  { name: 'Cram Goblin', emoji: '👺' },
  { name: 'Ghost of Exams Past', emoji: '👻' },
  { name: 'The Blank Stare', emoji: '🫥' },
];

export function bossFor(deckId: string, day: string) {
  const r = seededRandom(`boss:${deckId}:${day}`);
  return BOSSES[Math.floor(r() * BOSSES.length)];
}
