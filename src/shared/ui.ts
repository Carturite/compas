import { PROFILES } from '../core/config.js';
import { formatClock } from '../core/time.js';
import type { State } from '../core/types.js';
import { isDevBuild } from '../platform/env.js';
import { send } from '../platform/messaging.js';
import type { Snapshot } from './snapshot.js';
import { S } from './strings.js';

export const POSTPONE_MINUTES = 10;
/** Leave empty until there is a real donation page; the link hides itself. */
export const DONATE_URL = '';

export type Timed = Extract<State, { endsAt: number }>;

export function isTimed(state: State): state is Timed {
  return 'endsAt' in state;
}

export function remaining(state: Timed): number {
  return state.endsAt - Date.now();
}

export function clockText(state: Timed): string {
  return formatClock(remaining(state));
}

/** Circular progress (the "relojito"). */
export function ring(state: Timed, size = 132): string {
  const r = size / 2 - 6;
  const c = 2 * Math.PI * r;
  const total = state.endsAt - state.startedAt;
  const done = Math.min(1, Math.max(0, 1 - remaining(state) / total));
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
    <circle class="track" cx="${size / 2}" cy="${size / 2}" r="${r}"></circle>
    <circle class="fill" cx="${size / 2}" cy="${size / 2}" r="${r}"
      stroke-dasharray="${c}" stroke-dashoffset="${c * done}"
      transform="rotate(-90 ${size / 2} ${size / 2})"></circle>
  </svg>`;
}

/** The kind panel shown when someone wants to leave a focus session. */
export function leavingPanel(snap: Snapshot): string {
  const { settings } = snap.data;
  const strict = settings.strictMode
    ? `<p class="small muted">${S.leaving.strictNote(settings.strictWaitMinutes)}</p>`
    : '';
  return `<div class="card stack fade" role="dialog" aria-label="${S.leaving.title}">
    <h2 style="font-size:15px">${S.leaving.title}</h2>
    <p>${S.advice[snap.leavingAdvice]}</p>
    ${strict}
    <button class="primary" data-action="stay">${S.leaving.stay}</button>
    <div class="row">
      <button class="ghost" data-action="postpone">${S.leaving.postpone(POSTPONE_MINUTES)}</button>
      <button class="ghost" data-action="cancel">${S.leaving.cancel}</button>
    </div>
  </div>`;
}

export function focusMinutes(snap: Snapshot): number {
  return PROFILES[snap.data.settings.profile].focusMinutes;
}

/**
 * Wires the shared actions. Returns the snapshot after each action
 * through `onSnapshot` so the page can re-render.
 */
export function bindActions(
  root: HTMLElement,
  handlers: { onSnapshot: (s: Snapshot) => void; onLocal: (action: string, el: HTMLElement) => void },
): void {
  root.addEventListener('click', async (event) => {
    const el = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!el) return;
    const action = el.dataset.action!;
    let snap: Snapshot | null = null;
    switch (action) {
      case 'start':
        snap = await send({ type: 'start' });
        break;
      case 'cancel':
        snap = await send({ type: 'cancel' });
        break;
      case 'postpone':
        snap = await send({ type: 'postpone', minutes: POSTPONE_MINUTES });
        break;
      case 'refocus':
        await send({ type: 'endBreak' });
        snap = await send({ type: 'start' });
        break;
      case 'goal':
        snap = await send({ type: 'saveSettings', settings: { dailyMinutes: Number(el.dataset.value) } });
        break;
      case 'profile':
        snap = await send({
          type: 'saveSettings',
          settings: { profile: el.dataset.value as Snapshot['data']['settings']['profile'] },
        });
        break;
      case 'devComplete':
        snap = await send({ type: 'devComplete' });
        break;
      case 'options':
        await chrome.runtime.openOptionsPage();
        break;
      default:
        handlers.onLocal(action, el);
    }
    if (snap) handlers.onSnapshot(snap);
  });
}

/** Updates only the clocks and ring in place, so buttons keep focus between seconds. */
export function tickTimers(root: HTMLElement, state: State): void {
  if (!isTimed(state)) return;
  root.querySelectorAll<HTMLElement>('[data-clock]').forEach((el) => (el.textContent = clockText(state)));
  const fill = root.querySelector<SVGCircleElement>('.ring .fill');
  if (fill) {
    const c = Number(fill.getAttribute('stroke-dasharray'));
    const done = Math.min(1, Math.max(0, 1 - remaining(state) / (state.endsAt - state.startedAt)));
    fill.setAttribute('stroke-dashoffset', String(c * done));
  }
}

/** Development builds only: a quiet button to finish a session without waiting. */
export function devButton(): string {
  return isDevBuild()
    ? `<button class="ghost small dev" data-action="devComplete">${S.dev.complete}</button>`
    : '';
}

/** Ticks every second and refetches when a timer runs out or storage changes. */
export function startLoop(render: () => void, refresh: () => void, current: () => Snapshot | null): void {
  setInterval(() => {
    const snap = current();
    if (snap && isTimed(snap.data.state) && remaining(snap.data.state) <= 0) refresh();
    else render();
  }, 1000);
  chrome.storage.onChanged.addListener(() => refresh());
}
