import { describe, expect, it } from 'vitest';
import {
  addDays,
  bumpStreak,
  dayDiff,
  effectiveStreak,
  letterHint,
  levelInfo,
  masteryTier,
  matchAnswer,
  questsForDay,
  ratingFromAnswer,
  xpForAnswer,
  xpForLevel,
} from '../shared/game.ts';
import type { SrsState } from '../shared/types.ts';

describe('dates', () => {
  it('diffs and adds days across month boundaries', () => {
    expect(dayDiff('2026-01-31', '2026-02-01')).toBe(1);
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('levels', () => {
  it('starts at level 1 and grows monotonically', () => {
    expect(levelInfo(0).level).toBe(1);
    expect(levelInfo(xpForLevel(2)).level).toBe(2);
    expect(levelInfo(xpForLevel(2) - 1).level).toBe(1);
    for (let l = 2; l < 30; l++) expect(xpForLevel(l + 1) - xpForLevel(l)).toBeGreaterThan(xpForLevel(l) - xpForLevel(l - 1));
  });
});

describe('streak', () => {
  const fresh = () => ({ current: 0, best: 0, lastDay: null as string | null, freezes: 0 });

  it('counts consecutive days and ignores repeats on the same day', () => {
    const s = fresh();
    bumpStreak(s, '2026-10-01');
    bumpStreak(s, '2026-10-01');
    bumpStreak(s, '2026-10-02');
    expect(s.current).toBe(2);
    expect(s.best).toBe(2);
  });

  it('resets after a missed day without freezes', () => {
    const s = fresh();
    bumpStreak(s, '2026-10-01');
    bumpStreak(s, '2026-10-03');
    expect(s.current).toBe(1);
    expect(s.best).toBe(1);
  });

  it('spends freezes to bridge missed days', () => {
    const s = { ...fresh(), freezes: 2 };
    bumpStreak(s, '2026-10-01');
    bumpStreak(s, '2026-10-04');
    expect(s.current).toBe(2);
    expect(s.freezes).toBe(0);
  });

  it('shows the streak as broken only when freezes cannot cover the gap', () => {
    const s = { current: 5, best: 5, lastDay: '2026-10-01', freezes: 1 };
    expect(effectiveStreak(s, '2026-10-02')).toBe(5);
    expect(effectiveStreak(s, '2026-10-03')).toBe(5);
    expect(effectiveStreak(s, '2026-10-04')).toBe(0);
  });
});

describe('xp and ratings', () => {
  it('rewards typed recall, combos and speed', () => {
    const base = xpForAnswer({ correct: true, isNew: false, combo: 0, ms: 9000, questionType: 'mcq' });
    expect(xpForAnswer({ correct: true, isNew: false, combo: 0, ms: 9000, questionType: 'typed' })).toBeGreaterThan(base);
    expect(xpForAnswer({ correct: true, isNew: false, combo: 5, ms: 9000, questionType: 'mcq' })).toBeGreaterThan(base);
    expect(xpForAnswer({ correct: true, isNew: false, combo: 0, ms: 2000, questionType: 'mcq' })).toBeGreaterThan(base);
    expect(xpForAnswer({ correct: true, isNew: false, combo: 0, ms: 9000, questionType: 'mcq', practice: true })).toBeLessThan(base);
    expect(xpForAnswer({ correct: false, isNew: false, combo: 0, ms: 1000 })).toBe(1);
  });

  it('maps quiz behaviour to FSRS ratings', () => {
    expect(ratingFromAnswer({ correct: false, ms: 1000, isNew: false })).toBe(1);
    expect(ratingFromAnswer({ correct: true, usedHint: true, ms: 1000, isNew: false })).toBe(2);
    expect(ratingFromAnswer({ correct: true, ms: 1000, questionType: 'mcq', isNew: false })).toBe(3);
    expect(ratingFromAnswer({ correct: true, ms: 3000, questionType: 'typed', isNew: false })).toBe(4);
    expect(ratingFromAnswer({ correct: true, ms: 3000, questionType: 'typed', isNew: true })).toBe(3);
    expect(ratingFromAnswer({ correct: true, ms: 12000, questionType: 'typed', isNew: false })).toBe(3);
  });
});

describe('answer matching', () => {
  it('accepts exact, case-insensitive and article-free answers', () => {
    expect(matchAnswer('paris', 'Paris')).toBe('correct');
    expect(matchAnswer('the mitochondria', 'Mitochondria')).toBe('correct');
  });
  it('accepts small typos and listed alternatives', () => {
    expect(matchAnswer('photosynthsis', 'Photosynthesis')).toBe('correct');
    expect(matchAnswer('ATP', 'ATP; adenosine triphosphate')).toBe('correct');
  });
  it('flags near misses and rejects wrong answers', () => {
    expect(matchAnswer('Rome', 'Paris')).toBe('wrong');
    expect(matchAnswer('', 'Paris')).toBe('wrong');
    expect(matchAnswer('cellular respiraton process', 'cellular respiration')).toBe('close');
  });
  it('builds letter hints', () => {
    expect(letterHint('New York')).toBe('N__ Y___');
  });
});

describe('quests', () => {
  it('are deterministic per day and distinct', () => {
    const a = questsForDay('2026-10-06');
    expect(a).toEqual(questsForDay('2026-10-06'));
    expect(a).toHaveLength(3);
    expect(new Set(a.map((q) => q.kind)).size).toBe(3);
  });
});

describe('mastery', () => {
  const srs = (state: number, stability: number): SrsState => ({
    due: new Date().toISOString(),
    stability,
    difficulty: 5,
    elapsed_days: 0,
    scheduled_days: 0,
    learning_steps: 0,
    reps: 1,
    lapses: 0,
    state,
  });
  it('tiers by FSRS state and stability', () => {
    expect(masteryTier(srs(0, 0))).toBe(0);
    expect(masteryTier(srs(1, 0.5))).toBe(1);
    expect(masteryTier(srs(2, 5))).toBe(2);
    expect(masteryTier(srs(2, 30))).toBe(3);
    expect(masteryTier(srs(2, 120))).toBe(4);
  });
});
