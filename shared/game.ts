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

const TITLES = [
  'Fresh Recruit', 'Card Flipper', 'Quick Study', 'Note Ninja', 'Recall Ranger',
  'Memory Mage', 'Synapse Smith', 'Neuron Knight', 'Cortex Captain', 'Brain Baron',
  'Recall Royalty', 'Grand Mnemonist',
];
export function levelTitle(level: number): string {
  return TITLES[Math.min(TITLES.length - 1, Math.floor((level - 1) / 3))];
}

// ---------- XP ----------

export interface XpInput {
  correct: boolean;
  isNew: boolean;
  combo: number;
  ms: number;
  usedHint?: boolean;
  questionType?: 'mcq' | 'typed' | 'flip';
}

export function xpForAnswer(a: XpInput): number {
  if (!a.correct) return 1; // effort still counts
  let xp = a.questionType === 'typed' ? 14 : 10;
  if (a.isNew) xp += 4;
  xp += Math.min(a.combo, 10);
  if (a.ms > 0 && a.ms < 5000) xp += 4;
  if (a.usedHint) xp = Math.ceil(xp / 2);
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
  { kind: 'sessions', targets: [2, 3], label: (n) => `Finish ${n} quiz sessions`, reward: (n) => 15 * n },
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

// ---------- achievements ----------

export interface AchievementDef {
  id: string;
  icon: string;
  name: string;
  desc: string;
  test: (p: Profile, level: number) => boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first-steps', icon: '👣', name: 'First Steps', desc: 'Answer your first question', test: (p) => p.stats.answers >= 1 },
  { id: 'deck-builder', icon: '🧱', name: 'Deck Builder', desc: 'Create your first deck', test: (p) => p.stats.decksCreated >= 1 },
  { id: 'librarian', icon: '📚', name: 'Librarian', desc: 'Create 5 decks', test: (p) => p.stats.decksCreated >= 5 },
  { id: 'ai-alchemist', icon: '🧪', name: 'AI Alchemist', desc: 'Generate cards with Claude 5 times', test: (p) => p.stats.aiGenerations >= 5 },
  { id: 'century', icon: '💯', name: 'Century', desc: 'Answer 100 questions correctly', test: (p) => p.stats.correct >= 100 },
  { id: 'kilo', icon: '🏔️', name: 'Kilo-Recall', desc: 'Answer 1,000 questions correctly', test: (p) => p.stats.correct >= 1000 },
  { id: 'combo-10', icon: '🔥', name: 'On Fire', desc: 'Reach a 10x combo', test: (p) => p.stats.bestCombo >= 10 },
  { id: 'combo-25', icon: '☄️', name: 'Unstoppable', desc: 'Reach a 25x combo', test: (p) => p.stats.bestCombo >= 25 },
  { id: 'flawless', icon: '💎', name: 'Flawless', desc: 'Finish a quiz with no mistakes', test: (p) => p.stats.perfectSessions >= 1 },
  { id: 'perfectionist', icon: '👑', name: 'Perfectionist', desc: 'Finish 10 perfect quizzes', test: (p) => p.stats.perfectSessions >= 10 },
  { id: 'streak-3', icon: '🕯️', name: 'Kindling', desc: 'Reach a 3-day streak', test: (p) => p.streak.best >= 3 },
  { id: 'streak-7', icon: '🔥', name: 'Week Warrior', desc: 'Reach a 7-day streak', test: (p) => p.streak.best >= 7 },
  { id: 'streak-30', icon: '🌋', name: 'Monthly Monk', desc: 'Reach a 30-day streak', test: (p) => p.streak.best >= 30 },
  { id: 'streak-100', icon: '🌞', name: 'Centurion', desc: 'Reach a 100-day streak', test: (p) => p.streak.best >= 100 },
  { id: 'boss-1', icon: '⚔️', name: 'Giant Slayer', desc: 'Defeat a boss', test: (p) => p.stats.bossesDefeated >= 1 },
  { id: 'boss-10', icon: '🐉', name: 'Dragon Tamer', desc: 'Defeat 10 bosses', test: (p) => p.stats.bossesDefeated >= 10 },
  { id: 'speed-15', icon: '⏱️', name: 'Speed Demon', desc: 'Score 15+ in Time Attack', test: (p) => p.stats.timeAttackBest >= 15 },
  { id: 'speed-30', icon: '⚡', name: 'Lightning Mind', desc: 'Score 30+ in Time Attack', test: (p) => p.stats.timeAttackBest >= 30 },
  { id: 'matchmaker', icon: '🧩', name: 'Matchmaker', desc: 'Clear a Match board in under 30s', test: (p) => p.stats.matchBestMs !== null && p.stats.matchBestMs < 30_000 },
  { id: 'new-50', icon: '🌱', name: 'Sprouting', desc: 'Learn 50 new cards', test: (p) => p.stats.newLearned >= 50 },
  { id: 'new-500', icon: '🌳', name: 'Forest of Facts', desc: 'Learn 500 new cards', test: (p) => p.stats.newLearned >= 500 },
  { id: 'level-5', icon: '⭐', name: 'Rising Star', desc: 'Reach level 5', test: (_p, l) => l >= 5 },
  { id: 'level-15', icon: '🌟', name: 'Supernova', desc: 'Reach level 15', test: (_p, l) => l >= 15 },
  { id: 'shopper', icon: '🛍️', name: 'Retail Therapy', desc: 'Buy something from the shop', test: (p) => p.stats.purchases > 0 },
  { id: 'chest-7', icon: '🧰', name: 'Treasure Hunter', desc: 'Open 7 daily chests', test: (p) => p.stats.chestsOpened >= 7 },
  { id: 'lawyer', icon: '⚖️', name: 'Objection!', desc: 'Win an appeal with Claude', test: (p) => p.stats.appeals >= 1 },
];

export function checkAchievements(p: Profile): string[] {
  const level = levelInfo(p.xp).level;
  const fresh: string[] = [];
  for (const a of ACHIEVEMENTS) {
    if (!p.achievements[a.id] && a.test(p, level)) {
      p.achievements[a.id] = new Date().toISOString();
      fresh.push(a.id);
    }
  }
  return fresh;
}

// ---------- shop ----------

export type ShopKind = 'consumable' | 'theme' | 'avatar' | 'boost';

export interface ShopItem {
  id: string;
  kind: ShopKind;
  name: string;
  desc: string;
  icon: string;
  price: number;
  /** For themes: [background, surface, accent, accent2]. For avatars: the emoji. */
  value?: string | string[];
  max?: number;
}

export const SHOP: ShopItem[] = [
  { id: 'freeze', kind: 'consumable', name: 'Streak Freeze', desc: 'Protects your streak for one missed day. Hold up to 3.', icon: '🧊', price: 60, max: 3 },
  { id: 'hints5', kind: 'consumable', name: 'Hint Pack', desc: '+5 hints. Use them for 50/50 or letter reveals.', icon: '💡', price: 30 },
  { id: 'double-xp', kind: 'boost', name: 'Double XP (15 min)', desc: 'Every XP you earn is doubled for 15 minutes.', icon: '🚀', price: 80 },
  { id: 'theme-midnight', kind: 'theme', name: 'Midnight', desc: 'The default dark theme.', icon: '🌌', price: 0, value: ['#0f1020', '#1a1b33', '#7c5cff', '#22d3ee'] },
  { id: 'theme-sunset', kind: 'theme', name: 'Sunset', desc: 'Warm oranges and pinks.', icon: '🌅', price: 120, value: ['#1d0f1a', '#2c1726', '#ff6b6b', '#ffb347'] },
  { id: 'theme-forest', kind: 'theme', name: 'Forest', desc: 'Calm greens.', icon: '🌲', price: 120, value: ['#0c1a12', '#14271c', '#34d399', '#a3e635'] },
  { id: 'theme-ocean', kind: 'theme', name: 'Ocean', desc: 'Deep blues.', icon: '🌊', price: 120, value: ['#07141f', '#0e2233', '#38bdf8', '#2dd4bf'] },
  { id: 'theme-candy', kind: 'theme', name: 'Candy', desc: 'Sweet pastels on a dark base.', icon: '🍬', price: 200, value: ['#1a1022', '#281933', '#f472b6', '#c084fc'] },
  { id: 'theme-gold', kind: 'theme', name: 'Gold Rush', desc: 'For the high rollers.', icon: '🏆', price: 400, value: ['#14110a', '#221d10', '#fbbf24', '#f59e0b'] },
  { id: 'avatar-fox', kind: 'avatar', name: 'Fox', desc: 'Clever and quick.', icon: '🦊', price: 50, value: '🦊' },
  { id: 'avatar-owl', kind: 'avatar', name: 'Owl', desc: 'Wise night studier.', icon: '🦉', price: 50, value: '🦉' },
  { id: 'avatar-octopus', kind: 'avatar', name: 'Octopus', desc: 'Eight arms, eight cards at once.', icon: '🐙', price: 80, value: '🐙' },
  { id: 'avatar-robot', kind: 'avatar', name: 'Robot', desc: 'Beep boop, recall complete.', icon: '🤖', price: 80, value: '🤖' },
  { id: 'avatar-alien', kind: 'avatar', name: 'Alien', desc: 'Out of this world memory.', icon: '👽', price: 120, value: '👽' },
  { id: 'avatar-dragon', kind: 'avatar', name: 'Dragon', desc: 'Hoards knowledge like gold.', icon: '🐉', price: 250, value: '🐉' },
  { id: 'avatar-unicorn', kind: 'avatar', name: 'Unicorn', desc: 'A rare learner.', icon: '🦄', price: 300, value: '🦄' },
  { id: 'avatar-crown', kind: 'avatar', name: 'Royalty', desc: 'Only for the devoted.', icon: '👑', price: 600, value: '👑' },
];

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
  { id: 0, name: 'New', color: '#64748b' },
  { id: 1, name: 'Learning', color: '#f97316' },
  { id: 2, name: 'Familiar', color: '#eab308' },
  { id: 3, name: 'Proficient', color: '#22c55e' },
  { id: 4, name: 'Mastered', color: '#a855f7' },
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
