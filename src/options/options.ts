import { PROFILE_ORDER } from '../core/config.js';
import { nextUnlock, openScenes, PIECE_KINDS } from '../core/board.js';
import { sceneData, SCENES } from '../core/scenes.js';
import { isDevBuild } from '../platform/env.js';
import { parseSiteList } from '../core/sites.js';
import type { ProfileId } from '../core/types.js';
import { originsFor } from '../platform/blocking.js';
import { send } from '../platform/messaging.js';
import { mountScene, sceneToShow } from '../shared/board.js';
import type { Snapshot } from '../shared/snapshot.js';
import { S } from '../shared/strings.js';
import { devButton } from '../shared/ui.js';
import { isEditing, open as openEditor, setupEditor, updateEditor } from './editor.js';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const form = $<HTMLFormElement>('form');
const daily = $<HTMLInputElement>('daily');
const sites = $<HTMLTextAreaElement>('sites');
const strict = $<HTMLInputElement>('strict');
const wait = $<HTMLInputElement>('wait');
const waitRow = $<HTMLDivElement>('wait-row');
const sync = $<HTMLInputElement>('sync');
const status = $<HTMLSpanElement>('status');
const editBoard = $<HTMLButtonElement>('edit-board');

let pieces: Snapshot['data']['pieces'] = [];
let latest: Snapshot | null = null;

/** Board, pieces card and editor: refreshed on every change, without touching the form. */
function showPieces(snap: Snapshot): void {
  latest = snap;
  pieces = snap.data.pieces;
  const distinct = new Set(pieces.map((p) => p.kind)).size;
  const inTray = pieces.filter((p) => !p.placed).length;
  const open = openScenes(pieces, isDevBuild());
  const lines = pieces.length ? [S.pieces.summary(distinct, PIECE_KINDS.length, inTray)] : [S.pieces.none];
  const next = nextUnlock(pieces);
  if (next) lines.push(S.pieces.next(next.left));
  $('pieces-summary').innerHTML = lines.map((l) => `<span class="block">${l}</span>`).join('');
  // Background picker: one chip per open scene.
  const shown = sceneToShow(snap.data);
  const pick = $('scene-pick');
  pick.hidden = open.length < 2;
  pick.innerHTML =
    `<span id="scene-pick-label" class="small muted">${S.pieces.background}</span>` +
    open
      .map(
        (s) =>
          `<button type="button" class="chip" role="radio" data-scene="${sceneData(s).id}" aria-checked="${s === shown}">${sceneData(s).name}</button>`,
      )
      .join('');
  updateEditor(pieces);
  if (!isEditing()) mountScene(snap.data);
}

function setText(): void {
  const o = S.options;
  $('title').textContent = o.title;
  $('daily-label').textContent = o.daily;
  $('minutes').textContent = o.minutes;
  $('profile-label').textContent = o.profile;
  $('sites-label').textContent = o.sites;
  $('sites-hint').textContent = o.sitesHint;
  $('strict-label').textContent = o.strict;
  $('strict-hint').textContent = o.strictHint;
  $('wait-label').textContent = o.wait;
  $('sync-label').textContent = o.sync;
  $('sync-hint').textContent = o.syncHint;
  $('save').textContent = o.save;
  $('pieces-title').textContent = S.pieces.title;
  editBoard.textContent = S.pieces.edit;
  document.querySelectorAll('.dev-slot').forEach((el) => (el.innerHTML = devButton()));
  $('profiles').innerHTML = PROFILE_ORDER.map(
    (id) => `<label class="radio"><input type="radio" name="profile" value="${id}" />
      <span><strong>${S.profiles[id].name}</strong> <span class="muted">· ${S.profiles[id].detail}</span></span></label>`,
  ).join('');
}

function fill(snap: Snapshot): void {
  const s = snap.data.settings;
  daily.value = String(s.dailyMinutes);
  sites.value = s.blockedSites.join('\n');
  strict.checked = s.strictMode;
  wait.value = String(s.strictWaitMinutes);
  waitRow.hidden = !s.strictMode;
  sync.checked = s.syncEnabled;
  form.querySelector<HTMLInputElement>(`input[name="profile"][value="${s.profile}"]`)!.checked = true;
}

strict.addEventListener('change', async () => {
  waitRow.hidden = !strict.checked;
  // Applied immediately so turning it off always releases a pending wait.
  await send({ type: 'saveSettings', settings: { strictMode: strict.checked } });
});

sync.addEventListener('change', async () => {
  // Applied at once; turning it on brings in what other devices already shared.
  showPieces(await send({ type: 'saveSettings', settings: { syncEnabled: sync.checked } }));
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const list = parseSiteList(sites.value);
  // Must be requested inside the click, before any other await.
  let granted = true;
  try {
    granted = await chrome.permissions.request({ origins: list.flatMap(originsFor) });
  } catch {
    granted = false;
  }
  const profile = (form.querySelector<HTMLInputElement>('input[name="profile"]:checked')?.value ??
    'gentle') as ProfileId;
  const snap = await send({
    type: 'saveSettings',
    settings: {
      dailyMinutes: Number(daily.value),
      profile,
      blockedSites: list,
      strictMode: strict.checked,
      strictWaitMinutes: Number(wait.value),
      syncEnabled: sync.checked,
    },
  });
  fill(snap);
  showPieces(snap);
  status.textContent = granted ? S.options.saved : S.options.permissionDenied;
  setTimeout(() => (status.textContent = ''), 3000);
});

editBoard.addEventListener('click', () => openEditor(pieces, latest ? sceneToShow(latest.data) : 0));

$('scene-pick').addEventListener('click', async (event) => {
  const chip = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-scene]');
  if (chip) showPieces(await send({ type: 'saveSettings', settings: { scene: chip.dataset.scene! } }));
});

document.addEventListener('click', async (event) => {
  const dev = (event.target as HTMLElement).closest('[data-action="devComplete"]');
  if (dev) showPieces(await send({ type: 'devComplete' }));
});

setupEditor({
  onSnapshot: showPieces,
  onClose: () => {
    if (latest) mountScene(latest.data);
    editBoard.focus();
  },
  saved: () => pieces,
});

// Another page (popup, background) changed something: keep the board in sync.
chrome.storage.onChanged.addListener(async () => showPieces(await send({ type: 'getSnapshot' })));

setText();
void send({ type: 'getSnapshot' }).then((snap) => {
  fill(snap);
  showPieces(snap);
});
