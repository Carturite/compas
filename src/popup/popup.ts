import { send } from '../platform/messaging.js';
import type { Snapshot } from '../shared/snapshot.js';
import { S } from '../shared/strings.js';
import { justOpened, nextUnlock } from '../core/board.js';
import { sceneData } from '../core/scenes.js';
import { mountScene } from '../shared/board.js';
import {
  bindActions,
  clockText,
  devButton,
  DONATE_URL,
  focusMinutes,
  leavingPanel,
  ring,
  startLoop,
  tickTimers,
} from '../shared/ui.js';

const app = document.getElementById('app')!;
let snap: Snapshot | null = null;
let leaving = false;
let viewKey = '';

const GOALS = [60, 120, 180, 240];

function viewFor(s: Snapshot): string {
  const { state, settings } = s.data;

  if (settings.dailyMinutes === 0 && state.kind === 'idle') {
    return `<section class="stack center fade">
      <h1 style="font-size:17px;font-weight:600">${S.setup.question}</h1>
      <div class="row">${GOALS.map(
        (g) => `<button class="chip" data-action="goal" data-value="${g}">${g / 60} h</button>`,
      ).join('')}</div>
      <p class="small muted">${S.setup.hint}</p>
    </section>`;
  }

  switch (state.kind) {
    case 'idle': {
      const goal = settings.dailyMinutes;
      const pct = Math.min(100, Math.round((s.todayMinutes / goal) * 100));
      const reached = s.todayMinutes >= goal;
      const suggestion = s.suggestion
        ? `<div class="card stack small fade">
            <p>${S.suggestion[s.suggestion.direction](S.profiles[s.suggestion.profile].adjective)}</p>
            <button class="chip" data-action="profile" data-value="${s.suggestion.profile}">${S.suggestion.accept}</button>
          </div>`
        : '';
      const reminder = state.remindAt ? `<p class="small muted">${S.idle.reminder}</p>` : '';
      return `<section class="stack fade">
        <div class="stack" style="gap:6px">
          <p class="small muted">${reached ? S.idle.goalReached : S.idle.progress(s.todayMinutes, goal)}</p>
          <div class="bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>
        </div>
        ${suggestion}
        <button class="primary start" data-action="start">${S.idle.start(focusMinutes(s))}</button>
        ${reminder}
      </section>`;
    }
    case 'focus':
      return `<section class="stack center fade">
        <div><p class="clock" data-clock>${clockText(state)}</p><p class="small muted">${S.focus.left}</p></div>
        ${leaving ? leavingPanel(s) : `<button class="ghost" data-action="leave">${S.focus.leave}</button>`}
      </section>`;
    case 'break':
      return `<section class="stack center fade">
        <div class="stack" style="gap:2px"><p style="font-weight:600">${S.break.title}</p><p class="small muted">${S.break.piece}</p>${openedNote(s)}</div>
        <div><p class="clock" data-clock>${clockText(state)}</p><p class="small muted">${S.break.left}</p></div>
        <button class="primary" data-action="refocus">${S.break.back}</button>
      </section>`;
    case 'waiting':
      return `<section class="stack center fade">
        <p style="font-weight:600">${S.waiting.title}</p>
        <div style="position:relative">
          ${ring(state)}
          <p class="clock" data-clock style="position:absolute;inset:0;display:grid;place-items:center;font-size:26px">${clockText(state)}</p>
        </div>
        <p class="small">${S.waiting.body}</p>
        <p class="small muted">${S.waiting.escape}</p>
        <button class="ghost small" data-action="options">${S.settings}</button>
      </section>`;
  }
}

/** Right after the character that opened a new background: say so, once, in the break. */
function openedNote(s: Snapshot): string {
  const scene = justOpened(s.data.pieces);
  return scene >= 0 ? `<p class="small opened">${S.pieces.opened(sceneData(scene).name)}</p>` : '';
}

/** Corner note: how many characters until the next background opens. */
function unlockNote(s: Snapshot): string {
  const next = nextUnlock(s.data.pieces);
  return next ? `<span class="unlock" title="${S.pieces.next(next.left)}">${S.pieces.nextShort(next.left)}</span>` : '';
}

function shell(s: Snapshot): string {
  const { state } = s.data;
  const donate = DONATE_URL
    ? `<a class="ghost small" href="${DONATE_URL}" target="_blank" rel="noopener">♥ ${S.donate}</a>`
    : '';
  return `<header><span class="status"><span class="dot"></span>${S.state[state.kind]}</span>${unlockNote(s)}</header>
    <main>${viewFor(s)}</main>
    ${devButton()}
    <footer>
      <span class="brand">${S.appName}</span>
      <span>${donate}<button class="ghost small" data-action="options" aria-label="${S.settings}">⚙</button></span>
    </footer>`;
}

function keyFor(s: Snapshot): string {
  const { state, settings } = s.data;
  return JSON.stringify([state, settings, s.todayMinutes, s.suggestion, leaving, s.data.pieces.length]);
}

function render(force = false): void {
  if (!snap) return;
  mountScene(snap.data);
  const key = keyFor(snap);
  if (force || key !== viewKey) {
    viewKey = key;
    document.body.dataset.state = snap.data.state.kind;
    app.innerHTML = shell(snap);
    app.querySelector<HTMLElement>('.primary')?.focus();
  } else {
    tickTimers(app, snap.data.state);
  }
}

function accept(next: Snapshot | null): void {
  if (!next) return;
  if (next.data.state.kind !== 'focus') leaving = false;
  snap = next;
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

startLoop(() => render(), () => void refresh(), () => snap);
void refresh();
