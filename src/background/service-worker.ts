import { applyBoard } from '../core/board.js';
import {
  advance,
  cancel,
  completeNow,
  endBreak,
  isBlocking,
  postpone,
  saveSettings,
  start,
} from '../core/machine.js';
import { decode, encode, hasNews, merge, restamp, toSynced, touch } from '../core/sync.js';
import { badgeText } from '../core/time.js';
import type { AppData, Command, StateKind } from '../core/types.js';
import { applyBlocking, clearBlocking } from '../platform/blocking.js';
import { isDevBuild } from '../platform/env.js';
import { isMessage } from '../platform/messaging.js';
import { loadData, saveData } from '../platform/storage.js';
import { readSynced, writeSynced } from '../platform/sync.js';
import { buildSnapshot, type Snapshot } from '../shared/snapshot.js';
import { S } from '../shared/strings.js';

const ALARM_TRANSITION = 'transition';
const ALARM_TICK = 'tick';

const BADGE_COLORS: Record<StateKind, string> = {
  idle: '#8a8f98',
  focus: '#2f8f83',
  break: '#d9a441',
  waiting: '#7b74c9',
};

// Serialize all work: events can arrive while a previous one is still writing storage.
let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

function applyCommand(data: AppData, cmd: Command, now: number): AppData {
  switch (cmd.type) {
    case 'start':
      return start(data, now);
    case 'cancel':
      return cancel(data, now);
    case 'postpone':
      return postpone(data, now, cmd.minutes);
    case 'endBreak':
      return endBreak(data);
    case 'saveSettings':
      return saveSettings(data, cmd.settings);
    case 'saveBoard':
      return { ...data, pieces: applyBoard(data.pieces, cmd.layout) };
    case 'devComplete':
      // Never available in a store build, even if a page asks for it.
      return isDevBuild() ? completeNow(data, now) : data;
    case 'getSnapshot':
      return data;
  }
}

/** Loads, advances time, applies an optional command, persists and syncs the browser. */
async function process(cmd?: Command, forceBlockingSync = false): Promise<Snapshot> {
  const now = Date.now();
  const before = await loadData();
  const advanced = advance(before, now);
  const local = touch(before, cmd ? applyCommand(advanced, cmd, now) : advanced, now);
  const after = await syncWithOtherDevices(local, now);
  if (after !== before) await saveData(after);

  const kindChanged = before.state.kind !== after.state.kind;
  const sitesChanged = before.settings.blockedSites.join() !== after.settings.blockedSites.join();
  await syncBrowser(after, now, kindChanged || sitesChanged || forceBlockingSync);
  await notifyTransitions(before, advanced, now);
  return buildSnapshot(after, now);
}

/**
 * Shares rewards, times and the saved board through the browser's own sync, and brings in
 * what other devices shared. Writes only when the shared part really changed: a saved board,
 * saved settings, or a session that ended. Never breaks a session if sync fails.
 */
async function syncWithOtherDevices(data: AppData, now: number): Promise<AppData> {
  if (!data.settings.syncEnabled) return data;
  try {
    const remoteText = await readSynced();
    if (remoteText === encode(toSynced(data))) return data;
    const remote = remoteText === null ? null : decode(remoteText);
    if (!remote) {
      // Nothing usable shared yet: this device starts the shared copy.
      await writeSynced(encode(toSynced(data)));
      return data;
    }
    let next = merge(data, remote);
    // Write only when this device brings something new; otherwise just adopt what was shared.
    if (hasNews(data, remote)) {
      if (encode(toSynced(next)) !== remoteText) next = restamp(next, now);
      await writeSynced(encode(toSynced(next)));
    }
    return next;
  } catch (err) {
    console.warn('[compaz] sync', err);
    return data;
  }
}

async function syncBrowser(data: AppData, now: number, syncBlocking: boolean): Promise<void> {
  const { state } = data;
  if (syncBlocking) {
    if (isBlocking(state)) await applyBlocking(data.settings.blockedSites);
    else await clearBlocking();
  }

  await updateToolbar(data, now);

  if (state.kind === 'idle') {
    await chrome.alarms.clear(ALARM_TICK);
    if (state.remindAt) await chrome.alarms.create(ALARM_TRANSITION, { when: state.remindAt });
    else await chrome.alarms.clear(ALARM_TRANSITION);
    return;
  }
  await chrome.alarms.create(ALARM_TRANSITION, { when: state.endsAt });
  await chrome.alarms.create(ALARM_TICK, { periodInMinutes: 1 });
}

/** Icon, title and badge. Cosmetic: a failure here must never break a session. */
async function updateToolbar(data: AppData, now: number): Promise<void> {
  const { state } = data;
  const size = (n: number) => `/icons/${state.kind}-${n}.png`;
  try {
    await chrome.action.setIcon({ path: { 16: size(16), 32: size(32), 48: size(48), 128: size(128) } });
    await chrome.action.setTitle({ title: `${S.appName} · ${S.state[state.kind]}` });
    await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLORS[state.kind] });
    const text = 'endsAt' in state ? badgeText(state.endsAt - now) : '';
    await chrome.action.setBadgeText({ text });
  } catch (err) {
    console.warn('[compaz] toolbar', err);
  }
}

/** Notifies only transitions that happened because time passed, not because of a click. */
async function notifyTransitions(before: AppData, advanced: AppData, now: number): Promise<void> {
  const from = before.state;
  const to = advanced.state;
  let message: string | null = null;
  if (from.kind === 'focus' && to.kind === 'break') message = S.notify.focusDone;
  else if (from.kind === 'focus' && to.kind === 'idle') message = S.notify.breakDone;
  else if (from.kind === 'break' && to.kind === 'idle') message = S.notify.breakDone;
  else if (from.kind === 'idle' && from.remindAt && from.remindAt <= now) message = S.notify.reminder;
  if (!message) return;
  try {
    await chrome.notifications.create(`compaz-${now}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/focus-128.png'),
      title: S.appName,
      message,
    });
  } catch {
    // Notifications can be disabled by the system; the badge still tells the story.
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isMessage(message)) return;
  serialized(() => process(message.payload)).then(sendResponse, (err: unknown) => {
    console.error('[compaz]', err);
    sendResponse(null);
  });
  return true; // keep the channel open for the async response
});

/** Clicking any Compaz notification opens the popup, ready for another session. */
async function openPopupFromNotification(id: string): Promise<void> {
  void chrome.notifications.clear(id);
  try {
    const win = await chrome.windows.getLastFocused();
    if (win.id === undefined) throw new Error('no window');
    await chrome.windows.update(win.id, { focused: true });
    await chrome.action.openPopup({ windowId: win.id });
  } catch {
    // Older Chrome or no open window: show the same popup in a small window instead.
    await chrome.windows.create({
      url: chrome.runtime.getURL('popup/popup.html'),
      type: 'popup',
      width: 320,
      height: 460,
      focused: true,
    });
  }
}

chrome.notifications.onClicked.addListener((id) => {
  if (id.startsWith('compaz-')) void openPopupFromNotification(id);
});

// Another device shared something: bring it in. Our own writes land here too and change nothing.
chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === 'sync') void serialized(() => process());
});

chrome.alarms.onAlarm.addListener(() => {
  void serialized(() => process());
});

chrome.runtime.onInstalled.addListener(() => {
  void serialized(() => process(undefined, true));
});

chrome.runtime.onStartup.addListener(() => {
  void serialized(() => process(undefined, true));
});
