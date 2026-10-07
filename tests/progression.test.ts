import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS,
  SHOP,
  checkAchievements,
  levelInfo,
  levelUpRewards,
  medalFor,
  medalMonths,
  ownsItem,
  rankFor,
  studyDaysByMonth,
  xpForLevel,
} from '../shared/game.ts';
import { defaultProfile } from '../server/db.ts';

// Trophy ids from before tiers existed. Players who earned them must keep them.
const ORIGINAL_TROPHIES =
  'first-steps deck-builder librarian ai-alchemist century kilo combo-10 combo-25 flawless perfectionist streak-3 streak-7 streak-30 streak-100 boss-1 boss-10 speed-15 speed-30 matchmaker new-50 new-500 level-5 level-15 shopper chest-7 lawyer'.split(' ');

describe('trophies', () => {
  it('keeps every original trophy id and has no duplicates', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    for (const id of ORIGINAL_TROPHIES) expect(ids).toContain(id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('unlocks tiers in order and pays coins for each', () => {
    const p = defaultProfile();
    p.stats.correct = 1200;
    const coins = p.coins;
    const fresh = checkAchievements(p);
    expect(fresh).toEqual(expect.arrayContaining(['first-steps', 'century', 'kilo']));
    expect(fresh).not.toContain('correct-5k');
    expect(p.coins).toBe(coins + 10 + 25 + 50);
    expect(checkAchievements(p)).toEqual([]);
  });

  it('only checks mastery trophies when the card count is given', () => {
    const p = defaultProfile();
    expect(checkAchievements(p)).not.toContain('mastered-10');
    expect(checkAchievements(p, { mastered: 12 })).toContain('mastered-10');
  });

  it('treats Match times as lower-is-better', () => {
    const p = defaultProfile();
    p.stats.matchBestMs = 18_000;
    const fresh = checkAchievements(p);
    expect(fresh).toEqual(expect.arrayContaining(['matchmaker', 'match-20']));
    expect(fresh).not.toContain('match-12');
  });
});

describe('levels and ranks', () => {
  it('gives a new rank every five levels up to Flick Immortal at 100', () => {
    expect(rankFor(1).title).toBe('Fresh Recruit');
    expect(rankFor(4).title).toBe('Fresh Recruit');
    expect(rankFor(5).title).toBe('Card Flipper');
    expect(rankFor(100).title).toBe('Flick Immortal');
    expect(levelInfo(xpForLevel(50)).title).toBe('Recall Royalty');
  });

  it('takes years to reach the top', () => {
    // A steady 300 XP a day (a couple of sessions) should take over a decade to hit 100.
    expect(xpForLevel(100) / 300 / 365).toBeGreaterThan(10);
    expect(xpForLevel(30) / 300).toBeGreaterThan(200);
  });

  it('adds up coins, unlocks and rank across several levels', () => {
    const r = levelUpRewards(9, 12);
    expect(r.coins).toBe(100 + 110 + 120);
    expect(r.unlocks).toEqual(['hat-grad', 'avatar-lion']);
    expect(r.rank?.title).toBe('Quick Study');
    expect(levelUpRewards(11, 12).rank).toBeNull();
  });
});

describe('shop items', () => {
  it('has unique ids and level rewards within 2..100', () => {
    const ids = SHOP.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const i of SHOP) if (i.unlockLevel) expect(i.unlockLevel).toBeGreaterThanOrEqual(2);
    for (const i of SHOP) if (i.unlockLevel) expect(i.unlockLevel).toBeLessThanOrEqual(100);
  });

  it('owns free rewards by level and paid items by purchase', () => {
    const grad = SHOP.find((i) => i.id === 'hat-grad')!;
    const pirate = SHOP.find((i) => i.id === 'hat-pirate')!;
    expect(ownsItem({ owned: [] }, grad, 9)).toBe(false);
    expect(ownsItem({ owned: [] }, grad, 10)).toBe(true);
    expect(ownsItem({ owned: [] }, pirate, 40)).toBe(false);
    expect(ownsItem({ owned: ['hat-pirate'] }, pirate, 40)).toBe(true);
  });
});

describe('monthly medals', () => {
  const days = (month: string, n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`${month}-${String(i + 1).padStart(2, '0')}`, 50]));

  it('awards bronze at 10 days, silver at 20 and gold at 28', () => {
    expect(medalFor(9)).toBeNull();
    expect(medalFor(10)?.id).toBe('bronze');
    expect(medalFor(20)?.id).toBe('silver');
    expect(medalFor(28)?.id).toBe('gold');
  });

  it('counts study days per month and ignores zero-XP days', () => {
    const log = { ...days('2026-01', 28), ...days('2026-02', 12), '2026-03-01': 0 };
    expect(studyDaysByMonth(log)).toEqual({ '2026-01': 28, '2026-02': 12 });
    expect(medalMonths(log, 'bronze')).toBe(2);
    expect(medalMonths(log, 'gold')).toBe(1);
  });
});

describe('skins and premium themes', () => {
  it('has a drawing for every skin and a motif for every patterned theme', async () => {
    const { SKINS } = await import('../src/components/Skins.tsx');
    const { patternImage } = await import('../src/theme-patterns.ts');
    for (const i of SHOP.filter((x) => x.kind === 'skin')) expect(SKINS[i.id], i.id).toBeDefined();
    for (const i of SHOP.filter((x) => x.pattern)) expect(patternImage(i.pattern, '#000'), i.id).not.toBe('none');
  });
});
