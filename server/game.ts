// Applies answers and finished sessions to cards (FSRS) and the profile
// (XP, coins, streak, quests, achievements), and builds study queues.

import {
  SESSION_BONUS,
  bumpStreak,
  checkAchievements,
  effectiveStreak,
  levelCoins,
  levelInfo,
  levelUpRewards,
  masteryScore,
  masteryTier,
  questsForDay,
  ratingFromAnswer,
  xpForAnswer,
} from '../shared/game.ts';
import type {
  AnswerRequest,
  AnswerResult,
  Card,
  DeckSummary,
  Profile,
  QuestKind,
  Reward,
  SessionComplete,
} from '../shared/types.ts';
import { db, save } from './db.ts';
import { isDue, retrievability, review } from './srs.ts';

export function ensureQuests(day: string) {
  const p = db.profile;
  if (p.quests.day !== day) p.quests = { day, list: questsForDay(day) };
}

/** Advance quests of a kind. Returns ids of quests that just became complete. */
function progressQuests(kind: QuestKind, amount: number, how: 'add' | 'max' = 'add'): string[] {
  const done: string[] = [];
  for (const q of db.profile.quests.list) {
    if (q.kind !== kind) continue;
    const before = q.progress;
    q.progress = how === 'add' ? q.progress + amount : Math.max(q.progress, amount);
    q.progress = Math.min(q.progress, q.target);
    if (before < q.target && q.progress >= q.target) done.push(q.id);
  }
  return done;
}

function doubleXpActive(p: Profile): boolean {
  return !!p.doubleXpUntil && new Date(p.doubleXpUntil).getTime() > Date.now();
}

/** Add XP (with boosts) plus the coins it earns. Returns XP actually granted. */
function grantXp(raw: number, day: string): number {
  const p = db.profile;
  const xp = doubleXpActive(p) ? raw * 2 : raw;
  const before = p.xp;
  p.xp += xp;
  p.coins += Math.floor(p.xp / 10) - Math.floor(before / 10);
  p.dailyXp[day] = (p.dailyXp[day] ?? 0) + xp;
  if (xp > 0) bumpStreak(p.streak, day);
  const level = levelInfo(p.xp).level;
  while (p.levelPaid < level) p.coins += levelCoins(++p.levelPaid);
  return xp;
}

/** Facts for trophies that look past the profile, such as how many cards are mastered. */
export function achievementContext() {
  return { mastered: db.cards.filter((c) => !c.suspended && masteryTier(c.srs) === 4).length };
}

export function applyAnswer(req: AnswerRequest): AnswerResult {
  const { answer: a, day } = req;
  ensureQuests(day);
  const p = db.profile;
  const card = db.cards.find((c) => c.id === a.cardId) ?? null;
  const isNew = card ? card.srs.state === 0 : false;
  const questsCompleted: string[] = [];

  let rating = 0;
  if (card && req.scheduled) {
    rating =
      a.rating && a.rating >= 1 && a.rating <= 4
        ? a.rating
        : ratingFromAnswer({ correct: a.correct, usedHint: a.usedHint, ms: a.ms, questionType: a.questionType, isNew });
    card.srs = review(card.srs, rating as 1 | 2 | 3 | 4, db.settings);
    if (isNew) {
      p.stats.newLearned++;
      questsCompleted.push(...progressQuests('newCards', 1));
    }
  }

  const xp = grantXp(
    xpForAnswer({
      correct: a.correct,
      isNew: isNew && req.scheduled,
      combo: a.combo,
      ms: a.ms,
      usedHint: a.usedHint,
      questionType: a.questionType,
      practice: !req.scheduled,
    }),
    day,
  );

  p.stats.answers++;
  if (a.correct) p.stats.correct++;
  p.stats.bestCombo = Math.max(p.stats.bestCombo, a.combo);
  if (a.questionType === 'flip') {
    p.stats.flashcardsRated++;
    questsCompleted.push(...progressQuests('flashcards', 1));
  }
  if (a.correct) questsCompleted.push(...progressQuests('correct', 1));
  questsCompleted.push(...progressQuests('combo', a.combo, 'max'));
  questsCompleted.push(...progressQuests('xp', xp));

  if (card) {
    db.reviews.push({
      cardId: card.id,
      deckId: card.deckId,
      rating,
      correct: a.correct,
      ms: Math.round(a.ms),
      mode: req.mode,
      ts: new Date().toISOString(),
      day,
      wasNew: isNew && req.scheduled,
    });
  }

  const newAchievements = checkAchievements(p, achievementContext());
  save();
  return { xp, rating, card, newAchievements, questsCompleted, doubleXp: doubleXpActive(p) };
}

export function completeSession(s: SessionComplete): Reward {
  ensureQuests(s.day);
  const p = db.profile;
  const xpBefore = p.xp - s.sessionXp;
  const goalBefore = (p.dailyXp[s.day] ?? 0) - s.sessionXp;
  // Answers already bumped the streak; if this session was today's first XP, it grew by one.
  const streakNow = effectiveStreak(p.streak, s.day);
  const streakBefore = goalBefore <= 0 && s.sessionXp > 0 ? Math.max(0, streakNow - 1) : streakNow;
  const questsCompleted: string[] = [];
  const bonusReasons: string[] = [];
  let bonus = 0;
  let newRecord = false;

  if (s.answers > 0) {
    p.stats.sessions++;
    bonus += SESSION_BONUS.complete;
    bonusReasons.push(`Session complete +${SESSION_BONUS.complete}`);
  }

  const perfect = s.answers >= 5 && s.correct === s.answers;
  if (s.mode === 'quiz' || s.mode === 'flashcards') {
    if (s.answers > 0) questsCompleted.push(...progressQuests('sessions', 1));
    if (perfect && s.mode === 'quiz') {
      p.stats.perfectSessions++;
      bonus += SESSION_BONUS.perfect;
      bonusReasons.push(`Perfect run +${SESSION_BONUS.perfect}`);
      questsCompleted.push(...progressQuests('perfect', 1));
    }
  } else {
    if (s.answers > 0) questsCompleted.push(...progressQuests('practice', 1));
  }
  if (s.mode === 'boss' && s.bossDefeated) {
    p.stats.bossesDefeated++;
    bonus += SESSION_BONUS.boss;
    bonusReasons.push(`Boss defeated +${SESSION_BONUS.boss}`);
  }
  if (s.mode === 'timeattack' && s.timeAttackScore !== undefined && s.timeAttackScore > p.stats.timeAttackBest) {
    p.stats.timeAttackBest = s.timeAttackScore;
    newRecord = s.timeAttackScore > 0;
    if (newRecord) {
      bonus += 25;
      bonusReasons.push('New Time Attack record +25');
    }
  }
  if (s.mode === 'match' && s.matchMs !== undefined && (p.stats.matchBestMs === null || s.matchMs < p.stats.matchBestMs)) {
    p.stats.matchBestMs = s.matchMs;
    newRecord = true;
    bonus += 25;
    bonusReasons.push('New Match record +25');
  }

  const bonusXp = bonus > 0 ? grantXp(bonus, s.day) : 0;
  questsCompleted.push(...progressQuests('xp', bonusXp));
  const newAchievements = checkAchievements(p, achievementContext());
  const goal = db.settings.dailyGoalXp;
  const levelBefore = levelInfo(xpBefore).level;
  const levelAfter = levelInfo(p.xp).level;
  const gained = levelUpRewards(levelBefore, levelAfter);
  save();
  return {
    bonusXp,
    bonusReasons,
    totalXp: s.sessionXp + bonusXp,
    coins: Math.floor(p.xp / 10) - Math.floor(xpBefore / 10),
    levelBefore,
    levelAfter,
    levelCoins: gained.coins,
    unlocks: gained.unlocks,
    rank: gained.rank && { title: gained.rank.title, icon: gained.rank.icon },
    streakBefore,
    streakAfter: effectiveStreak(p.streak, s.day),
    newAchievements,
    questsCompleted,
    goalReached: goalBefore < goal && (p.dailyXp[s.day] ?? 0) >= goal,
    newRecord,
  };
}

// ---------- queues ----------

function newIntroducedToday(day: string): number {
  return db.reviews.filter((r) => r.day === day && r.wasNew).length;
}

export function deckCards(deckId: string | null): Card[] {
  return db.cards.filter((c) => !c.suspended && (deckId === null || c.deckId === deckId));
}

/** Cards for a scheduled quiz/flashcard session: due reviews first, then new cards. */
export function studyQueue(deckId: string | null, day: string, size: number): Card[] {
  const now = new Date();
  const cards = deckCards(deckId);
  const due = cards
    .filter((c) => isDue(c.srs, now))
    .sort((a, b) => retrievability(a.srs, db.settings, now) - retrievability(b.srs, db.settings, now));
  const queue = due.slice(0, size);
  const newBudget = Math.max(0, db.settings.newPerDay - newIntroducedToday(day));
  if (queue.length < size && newBudget > 0) {
    const fresh = cards
      .filter((c) => c.srs.state === 0)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    queue.push(...fresh.slice(0, Math.min(newBudget, size - queue.length)));
  }
  return queue;
}

/** Cards that are not due yet, soonest first. Used for optional extra practice. */
export function aheadQueue(deckId: string | null, size: number): Card[] {
  const now = new Date();
  return deckCards(deckId)
    .filter((c) => c.srs.state !== 0 && !isDue(c.srs, now))
    .sort((a, b) => retrievability(a.srs, db.settings, now) - retrievability(b.srs, db.settings, now))
    .slice(0, size);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Hardest cards for a boss fight: most lapses, highest difficulty, lowest recall. */
export function bossQueue(deckId: string | null, size = 10): Card[] {
  const now = new Date();
  const seen = deckCards(deckId).filter((c) => c.srs.state !== 0);
  const score = (c: Card) => c.srs.lapses * 3 + c.srs.difficulty - retrievability(c.srs, db.settings, now) * 5;
  return shuffle(seen.sort((a, b) => score(b) - score(a)).slice(0, size));
}

export function practiceQueue(deckId: string | null, size: number, keep: (c: Card) => boolean = () => true): Card[] {
  return shuffle(deckCards(deckId).filter(keep)).slice(0, size);
}

export const BOSS_MIN_CARDS = 4;

export function summarizeDeck(deckId: string): DeckSummary | null {
  const deck = db.decks.find((d) => d.id === deckId);
  if (!deck) return null;
  const now = new Date();
  const cards = db.cards.filter((c) => c.deckId === deckId);
  const active = cards.filter((c) => !c.suspended);
  const mastery = active.length ? active.reduce((s, c) => s + masteryScore(c.srs), 0) / active.length : 0;
  return {
    ...deck,
    cardCount: cards.length,
    dueCount: active.filter((c) => isDue(c.srs, now)).length,
    newCount: active.filter((c) => c.srs.state === 0).length,
    mastery,
    materials: db.materials.filter((m) => m.deckId === deckId).length,
    bossReady: active.filter((c) => c.srs.state !== 0).length >= BOSS_MIN_CARDS,
  };
}
