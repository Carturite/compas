import { send } from '../platform/messaging.js';
import { mountScene } from '../shared/board.js';
import type { Snapshot } from '../shared/snapshot.js';
import { S } from '../shared/strings.js';
import { bindActions, clockText, isTimed, leavingPanel, ring, startLoop, tickTimers } from '../shared/ui.js';

const app = document.getElementById('app')!;
let snap: Snapshot | null = null;
let leaving = false;
let viewKey = '';
const originalUrl = readOriginalUrl();

function readOriginalUrl(): string | null {
  const raw = location.hash.slice(1);
  return /^https?:\/\//.test(raw) ? raw : null;
}

function view(s: Snapshot): string {
  const { state } = s.data;
  if (state.kind !== 'focus' && state.kind !== 'waiting') {
    // Session is over: nothing to block. Go back to where the person came from.
    return `<section class="stack center fade"><p class="muted">${S.state[state.kind]}</p></section>`;
  }
  const body = state.kind === 'focus' ? S.blocked.focusBody : S.blocked.waitingBody;
  const extra =
    state.kind === 'focus'
      ? leaving
        ? leavingPanel(s)
        : `<button class="ghost" data-action="leave">${S.focus.leave}</button>`
      : `<p class="small muted">${S.waiting.escape}</p><button class="ghost small" data-action="options">${S.settings}</button>`;
  return `<section class="stack center fade">
    <h1>${S.blocked.title}</h1>
    <p class="muted">${body}</p>
    <div class="timer">
      ${isTimed(state) ? ring(state, 180) : ''}
      <p class="clock" data-clock>${isTimed(state) ? clockText(state) : ''}</p>
    </div>
    <p class="small muted">${S.blocked.remaining}</p>
    ${extra}
  </section>`;
}

function render(): void {
  if (!snap) return;
  mountScene(snap.data);
  const key = JSON.stringify([snap.data.state, snap.data.settings.strictMode, leaving]);
  if (key !== viewKey) {
    viewKey = key;
    document.body.dataset.state = snap.data.state.kind;
    app.innerHTML = view(snap) + `<span class="brand">${S.appName}</span>`;
  } else {
    tickTimers(app, snap.data.state);
  }
}

function accept(next: Snapshot | null): void {
  if (!next) return;
  snap = next;
  const kind = next.data.state.kind;
  if (kind !== 'focus') leaving = false;
  if (kind === 'idle' || kind === 'break') {
    // Unblocked: return to the page the person was trying to open, if any.
    if (originalUrl) {
      location.replace(originalUrl);
      return;
    }
  }
  render();
}

async function refresh(): Promise<void> {
  accept(await send({ type: 'getSnapshot' }));
}

bindActions(app, {
  onSnapshot: accept,
  onLocal: (action) => {
    if (action === 'leave') leaving = true;
    if (action === 'stay') leaving = false;
    render();
  },
});

startLoop(render, () => void refresh(), () => snap);
void refresh();
