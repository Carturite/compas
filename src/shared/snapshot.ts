import { adviceForLeaving, type AdviceKey } from '../core/advice.js';
import { PROFILES } from '../core/config.js';
import { focusedMinutesOn, suggestProfile, type Suggestion } from '../core/machine.js';
import { dayKey } from '../core/time.js';
import type { AppData } from '../core/types.js';

/** Everything a page needs to render, computed once in the background. */
export interface Snapshot {
  data: AppData;
  now: number;
  todayMinutes: number;
  suggestion: Suggestion;
  leavingAdvice: AdviceKey;
}

export function buildSnapshot(data: AppData, now: number): Snapshot {
  const { state } = data;
  let ratio = 0;
  if (state.kind === 'focus') {
    const total = PROFILES[state.profile].focusMinutes * 60_000;
    ratio = Math.min(1, Math.max(0, (now - state.startedAt) / total));
  }
  return {
    data,
    now,
    todayMinutes: focusedMinutesOn(data.history, dayKey(now)),
    suggestion: suggestProfile(data.history, data.settings.profile),
    leavingAdvice: adviceForLeaving(ratio, data.history, now),
  };
}
