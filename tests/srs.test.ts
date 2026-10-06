import { describe, expect, it } from 'vitest';
import { isDue, newSrs, preview, retrievability, review } from '../server/srs.ts';
import type { Settings } from '../shared/types.ts';

const settings: Settings = {
  model: 'sonnet',
  gradingModel: 'haiku',
  desiredRetention: 0.9,
  newPerDay: 20,
  sessionSize: 12,
  dailyGoalXp: 150,
  sound: false,
  maxIntervalDays: 365,
  thinking: false,
};

describe('FSRS wrapper', () => {
  it('creates new cards that are not counted as due reviews', () => {
    const s = newSrs();
    expect(s.state).toBe(0);
    expect(isDue(s)).toBe(false);
    expect(retrievability(s, settings)).toBe(0);
  });

  it('schedules Good further out than Again, and Easy further than Good', () => {
    const now = new Date('2026-10-06T10:00:00Z');
    const s = newSrs(now);
    const again = new Date(review(s, 1, settings, now).due).getTime();
    const good = new Date(review(s, 3, settings, now).due).getTime();
    const easy = new Date(review(s, 4, settings, now).due).getTime();
    expect(again).toBeLessThan(good);
    expect(good).toBeLessThan(easy);
  });

  it('grows intervals with successive successful reviews', () => {
    let now = new Date('2026-10-06T10:00:00Z');
    let s = review(newSrs(now), 3, settings, now);
    const gaps: number[] = [];
    for (let i = 0; i < 5; i++) {
      now = new Date(s.due);
      const next = review(s, 3, settings, now);
      gaps.push(new Date(next.due).getTime() - now.getTime());
      s = next;
    }
    expect(s.state).toBe(2);
    for (let i = 1; i < gaps.length; i++) expect(gaps[i]).toBeGreaterThan(gaps[i - 1]);
  });

  it('survives a JSON round trip', () => {
    const now = new Date('2026-10-06T10:00:00Z');
    const s = JSON.parse(JSON.stringify(review(newSrs(now), 3, settings, now)));
    const later = new Date(s.due);
    expect(() => review(s, 3, settings, later)).not.toThrow();
    expect(Object.keys(preview(s, settings, later))).toEqual(['1', '2', '3', '4']);
  });

  it('counts lapses when a review card is forgotten', () => {
    let now = new Date('2026-10-06T10:00:00Z');
    let s = review(newSrs(now), 4, settings, now);
    now = new Date(s.due);
    s = review(s, 1, settings, now);
    expect(s.lapses).toBe(1);
    expect(s.state).toBe(3);
  });
});
