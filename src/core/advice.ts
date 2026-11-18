import { dayKey } from './time.js';
import type { SessionRecord } from './types.js';

export type AdviceKey =
  | 'leaving.early' // left in the first minutes
  | 'leaving.late' // left near the end
  | 'leaving.tired' // several exits today
  | 'leaving.default';

/**
 * Picks a kind word for the moment someone wants to leave a focus session.
 * Pure: depends only on progress and today's history.
 */
export function adviceForLeaving(
  elapsedRatio: number,
  history: SessionRecord[],
  now: number,
): AdviceKey {
  const today = dayKey(now);
  const exitsToday = history.filter(
    (r) => r.day === today && (r.outcome === 'cancelled' || r.outcome === 'postponed'),
  ).length;
  if (exitsToday >= 2) return 'leaving.tired';
  if (elapsedRatio >= 0.75) return 'leaving.late';
  if (elapsedRatio <= 0.15) return 'leaving.early';
  return 'leaving.default';
}
