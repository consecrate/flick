// FSRS scheduling via ts-fsrs.

import { createEmptyCard, fsrs, generatorParameters, type Card as FsrsCard, type Grade } from 'ts-fsrs';
import type { Settings, SrsState } from '../shared/types.ts';

function scheduler(settings: Settings) {
  return fsrs(
    generatorParameters({
      request_retention: settings.desiredRetention,
      maximum_interval: settings.maxIntervalDays,
      enable_fuzz: true,
      enable_short_term: true,
    }),
  );
}

function toJson(c: FsrsCard): SrsState {
  return {
    due: c.due.toISOString(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    last_review: c.last_review ? c.last_review.toISOString() : null,
  };
}

export function newSrs(now = new Date()): SrsState {
  return toJson(createEmptyCard(now));
}

export function review(srs: SrsState, rating: Grade, settings: Settings, now = new Date()): SrsState {
  return toJson(scheduler(settings).next(srs, now, rating).card);
}

/** Interval previews for each rating, used by flashcard mode buttons. */
export function preview(srs: SrsState, settings: Settings, now = new Date()): Record<1 | 2 | 3 | 4, string> {
  const p = scheduler(settings).repeat(srs, now);
  const out = {} as Record<1 | 2 | 3 | 4, string>;
  for (const g of [1, 2, 3, 4] as const) out[g] = formatInterval(p[g].card.due.getTime() - now.getTime());
  return out;
}

export function retrievability(srs: SrsState, settings: Settings, now = new Date()): number {
  if (srs.state === 0) return 0;
  return scheduler(settings).get_retrievability(srs, now, false);
}

export function formatInterval(ms: number): string {
  const m = Math.max(1, Math.round(ms / 60_000));
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 31) return `${d}d`;
  const mo = d / 30.4;
  if (mo < 12) return `${mo.toFixed(mo < 3 ? 1 : 0)}mo`;
  return `${(d / 365).toFixed(1)}y`;
}

export function isDue(srs: SrsState, now = new Date()): boolean {
  return srs.state !== 0 && new Date(srs.due).getTime() <= now.getTime();
}
