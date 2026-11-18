import { awardPiece } from './board.js';
import { sceneIndex } from './scenes.js';
import { DEFAULT_SETTINGS, HISTORY_LIMIT, PROFILES, PROFILE_ORDER } from './config.js';
import { dayKey, MINUTE } from './time.js';
import type { AppData, Outcome, ProfileId, SessionRecord, Settings, State } from './types.js';

/**
 * Pure state machine. Every function takes the current data and "now",
 * and returns new data. Nothing here touches the browser.
 */

function record(
  data: AppData,
  now: number,
  outcome: Outcome,
  profile: ProfileId,
  focusedMinutes: number,
): SessionRecord[] {
  const entry: SessionRecord = { at: now, day: dayKey(now), outcome, profile, focusedMinutes };
  return [...data.history, entry].slice(-HISTORY_LIMIT);
}

export function start(data: AppData, now: number): AppData {
  if (data.state.kind !== 'idle') return data;
  const profile = PROFILES[data.settings.profile];
  return {
    ...data,
    state: {
      kind: 'focus',
      startedAt: now,
      endsAt: now + profile.focusMinutes * MINUTE,
      profile: profile.id,
    },
  };
}

function elapsedMinutes(state: { startedAt: number }, now: number): number {
  return Math.max(0, Math.floor((now - state.startedAt) / MINUTE));
}

export function cancel(data: AppData, now: number): AppData {
  const { state, settings } = data;
  if (state.kind === 'break') return endBreak(data);
  if (state.kind !== 'focus') return data;
  const history = record(data, now, 'cancelled', state.profile, elapsedMinutes(state, now));
  const next: State = settings.strictMode
    ? { kind: 'waiting', startedAt: now, endsAt: now + settings.strictWaitMinutes * MINUTE }
    : { kind: 'idle' };
  return { ...data, history, state: next };
}

export function postpone(data: AppData, now: number, minutes: number): AppData {
  const { state } = data;
  if (state.kind !== 'focus') return data;
  const safeMinutes = clamp(Math.round(minutes), 1, 240);
  const history = record(data, now, 'postponed', state.profile, elapsedMinutes(state, now));
  return { ...data, history, state: { kind: 'idle', remindAt: now + safeMinutes * MINUTE } };
}

export function endBreak(data: AppData): AppData {
  if (data.state.kind !== 'break') return data;
  return { ...data, state: { kind: 'idle' } };
}

/**
 * Development helper: completes a focus session right now (starting one if idle,
 * closing a break first). Same rules as a real completion, so it earns a piece.
 */
export function completeNow(data: AppData, now: number): AppData {
  let d = data;
  if (d.state.kind === 'break') d = endBreak(d);
  if (d.state.kind === 'idle') d = start(d, now);
  if (d.state.kind !== 'focus') return data;
  return advance({ ...d, state: { ...d.state, endsAt: now } }, now);
}

/** Applies every transition whose time has come. Safe to call at any moment. */
export function advance(data: AppData, now: number): AppData {
  let current = data;
  for (let i = 0; i < 4; i++) {
    const next = step(current, now);
    if (next === current) return current;
    current = next;
  }
  return current;
}

function step(data: AppData, now: number): AppData {
  const { state } = data;
  switch (state.kind) {
    case 'focus': {
      if (now < state.endsAt) return data;
      const profile = PROFILES[state.profile];
      const history = record(data, state.endsAt, 'completed', state.profile, profile.focusMinutes);
      return {
        ...data,
        history,
        pieces: awardPiece(data.pieces, state.endsAt, sceneIndex(data.settings.scene)),
        state: {
          kind: 'break',
          startedAt: state.endsAt,
          endsAt: state.endsAt + profile.breakMinutes * MINUTE,
        },
      };
    }
    case 'break':
    case 'waiting':
      return now >= state.endsAt ? { ...data, state: { kind: 'idle' } } : data;
    case 'idle':
      return state.remindAt !== undefined && now >= state.remindAt
        ? { ...data, state: { kind: 'idle' } }
        : data;
  }
}

export function saveSettings(data: AppData, patch: Partial<Settings>): AppData {
  const merged: Settings = { ...data.settings, ...patch };
  const settings: Settings = {
    dailyMinutes: clamp(Math.round(merged.dailyMinutes), 0, 16 * 60),
    profile: merged.profile in PROFILES ? merged.profile : 'gentle',
    blockedSites: [...new Set(merged.blockedSites)],
    strictMode: Boolean(merged.strictMode),
    strictWaitMinutes: clamp(Math.round(merged.strictWaitMinutes), 1, 120),
    syncEnabled: merged.syncEnabled !== false,
    scene: sceneIndex(merged.scene) >= 0 ? merged.scene : DEFAULT_SETTINGS.scene,
  };
  // Never trapped: turning strict mode off releases any pending wait.
  const state: State =
    !settings.strictMode && data.state.kind === 'waiting' ? { kind: 'idle' } : data.state;
  return { ...data, settings, state };
}

export function isBlocking(state: State): boolean {
  return state.kind === 'focus' || state.kind === 'waiting';
}

export function focusedMinutesOn(history: SessionRecord[], day: string): number {
  return history.filter((r) => r.day === day).reduce((sum, r) => sum + r.focusedMinutes, 0);
}

export type Suggestion = { direction: 'lower' | 'higher'; profile: ProfileId } | null;

/**
 * Gentle adjustment: suggest (never force) a shorter profile after repeated cancels,
 * or a longer one after a run of completed sessions.
 */
export function suggestProfile(history: SessionRecord[], current: ProfileId): Suggestion {
  const decided = history.filter((r) => r.outcome !== 'postponed');
  const idx = PROFILE_ORDER.indexOf(current);
  const last3 = decided.slice(-3);
  const cancels = last3.filter((r) => r.outcome === 'cancelled').length;
  if (last3.length === 3 && cancels >= 2 && idx > 0) {
    return { direction: 'lower', profile: PROFILE_ORDER[idx - 1]! };
  }
  const last4 = decided.slice(-4);
  const steady =
    last4.length === 4 && last4.every((r) => r.outcome === 'completed' && r.profile === current);
  if (steady && idx < PROFILE_ORDER.length - 1) {
    return { direction: 'higher', profile: PROFILE_ORDER[idx + 1]! };
  }
  return null;
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}
