import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialData } from '../src/core/config.js';
import {
  advance,
  cancel,
  endBreak,
  focusedMinutesOn,
  isBlocking,
  postpone,
  saveSettings,
  start,
  suggestProfile,
} from '../src/core/machine.js';
import { adviceForLeaving } from '../src/core/advice.js';
import { normalizeSite, parseSiteList } from '../src/core/sites.js';
import { dayKey, formatClock, MINUTE } from '../src/core/time.js';
import type { AppData, SessionRecord } from '../src/core/types.js';

const T0 = new Date(2026, 10, 17, 10, 0, 0).getTime();

function fresh(): AppData {
  return saveSettings(createInitialData(), { dailyMinutes: 120 });
}

test('start goes from idle to focus with the profile length', () => {
  const d = start(fresh(), T0);
  assert.equal(d.state.kind, 'focus');
  if (d.state.kind === 'focus') assert.equal(d.state.endsAt - T0, 25 * MINUTE);
  assert.ok(isBlocking(d.state));
});

test('start does nothing when not idle', () => {
  const d = start(fresh(), T0);
  assert.equal(start(d, T0 + 1000), d);
});

test('completing focus earns a break, then returns to idle', () => {
  let d = start(fresh(), T0);
  d = advance(d, T0 + 25 * MINUTE);
  assert.equal(d.state.kind, 'break');
  assert.equal(isBlocking(d.state), false);
  assert.equal(d.history.at(-1)?.outcome, 'completed');
  d = advance(d, T0 + 30 * MINUTE);
  assert.equal(d.state.kind, 'idle');
});

test('advance skips straight to idle if the worker slept through the break', () => {
  const d = advance(start(fresh(), T0), T0 + 3 * 60 * MINUTE);
  assert.equal(d.state.kind, 'idle');
  assert.equal(d.history.length, 1);
});

test('cancel without strict mode goes idle and records partial focus', () => {
  const d = cancel(start(fresh(), T0), T0 + 10 * MINUTE);
  assert.equal(d.state.kind, 'idle');
  assert.equal(d.history.at(-1)?.outcome, 'cancelled');
  assert.equal(d.history.at(-1)?.focusedMinutes, 10);
});

test('cancel with strict mode waits, keeps blocking, then releases', () => {
  let d = saveSettings(fresh(), { strictMode: true, strictWaitMinutes: 20 });
  d = cancel(start(d, T0), T0 + 5 * MINUTE);
  assert.equal(d.state.kind, 'waiting');
  assert.ok(isBlocking(d.state));
  d = advance(d, T0 + 25 * MINUTE);
  assert.equal(d.state.kind, 'idle');
});

test('turning strict mode off releases the wait immediately (never trapped)', () => {
  let d = saveSettings(fresh(), { strictMode: true });
  d = cancel(start(d, T0), T0 + MINUTE);
  d = saveSettings(d, { strictMode: false });
  assert.equal(d.state.kind, 'idle');
});

test('postpone goes idle with a reminder and is not a cancel', () => {
  const d = postpone(start(fresh(), T0), T0 + 2 * MINUTE, 10);
  assert.deepEqual(d.state, { kind: 'idle', remindAt: T0 + 12 * MINUTE });
  assert.equal(d.history.at(-1)?.outcome, 'postponed');
  assert.deepEqual(advance(d, T0 + 13 * MINUTE).state, { kind: 'idle' });
});

test('endBreak returns to idle early', () => {
  const d = advance(start(fresh(), T0), T0 + 25 * MINUTE);
  assert.equal(endBreak(d).state.kind, 'idle');
});

test('settings are sanitized', () => {
  const d = saveSettings(fresh(), {
    dailyMinutes: -5,
    strictWaitMinutes: 9999,
    // @ts-expect-error invalid on purpose
    profile: 'nope',
  });
  assert.equal(d.settings.dailyMinutes, 0);
  assert.equal(d.settings.strictWaitMinutes, 120);
  assert.equal(d.settings.profile, 'gentle');
});

test('today progress sums focused minutes of the day', () => {
  let d = start(fresh(), T0);
  d = advance(d, T0 + 30 * MINUTE);
  d = cancel(start(d, T0 + 40 * MINUTE), T0 + 50 * MINUTE);
  assert.equal(focusedMinutesOn(d.history, dayKey(T0)), 35);
});

function rec(outcome: SessionRecord['outcome'], profile: SessionRecord['profile'] = 'medium'): SessionRecord {
  return { at: T0, day: dayKey(T0), outcome, profile, focusedMinutes: 10 };
}

test('suggests a shorter profile after repeated cancels', () => {
  const h = [rec('completed'), rec('cancelled'), rec('cancelled')];
  assert.deepEqual(suggestProfile(h, 'medium'), { direction: 'lower', profile: 'gentle' });
  assert.equal(suggestProfile(h, 'gentle'), null);
});

test('suggests a longer profile after a steady run', () => {
  const h = [rec('completed'), rec('completed'), rec('postponed'), rec('completed'), rec('completed')];
  assert.deepEqual(suggestProfile(h, 'medium'), { direction: 'higher', profile: 'deep' });
});

test('advice adapts to the moment', () => {
  assert.equal(adviceForLeaving(0.05, [], T0), 'leaving.early');
  assert.equal(adviceForLeaving(0.9, [], T0), 'leaving.late');
  assert.equal(adviceForLeaving(0.5, [], T0), 'leaving.default');
  assert.equal(adviceForLeaving(0.5, [rec('cancelled'), rec('postponed')], T0), 'leaving.tired');
});

test('sites are normalized', () => {
  assert.equal(normalizeSite('https://www.YouTube.com/watch?v=1'), 'youtube.com');
  assert.equal(normalizeSite('m.twitch.tv:443'), 'm.twitch.tv');
  assert.equal(normalizeSite('hola'), null);
  assert.deepEqual(parseSiteList('tiktok.com\nwww.tiktok.com, x.com\n\nbad'), ['tiktok.com', 'x.com']);
});

test('clock formatting', () => {
  assert.equal(formatClock(25 * MINUTE), '25:00');
  assert.equal(formatClock(61_000), '1:01');
  assert.equal(formatClock(90 * MINUTE), '1:30:00');
  assert.equal(formatClock(-5), '0:00');
});

// ---- Toolbar badge ----

import { badgeText } from '../src/core/time.js';

test('badge shows whole minutes left with an m', () => {
  assert.equal(badgeText(12 * MINUTE), '12m');
  assert.equal(badgeText(11 * MINUTE + 1), '12m');
  assert.equal(badgeText(0), '0m');
});

// ---- Reward board ----

import {
  awardPiece,
  cellsAt,
  firstFit,
  fits,
  normalizePieces,
  piecesFromHistory,
  placePiece,
  PIECE_KINDS,
  shapeSize,
  unplacePiece,
} from '../src/core/board.js';
import { completeNow } from '../src/core/machine.js';
import { lookSize } from '../src/core/scenes.js';
import { sceneAt } from '../src/core/board.js';

// The garden's lawn.
const BOARD_COLS = 10;
const BOARD_ROWS = 5;
import type { Piece } from '../src/core/types.js';

/** Every taken cell, as scene/floor:x,y, to check for overlaps. */
const cellKeys = (pieces: readonly Piece[]) =>
  pieces.flatMap((p) =>
    p.placed ? cellsAt(p.kind, p.placed).map((c) => `${sceneAt(p.placed!)}/${p.placed!.floor ?? 0}:${c}`) : [],
  );

const piece = (id: string, kind: Piece['kind'], placed: Piece['placed']): Piece => ({
  id,
  kind,
  earnedAt: T0,
  placed,
});

test('every character takes 1 or 2 cells, one row deep, and keeps its drawing proportions', () => {
  assert.ok(PIECE_KINDS.length >= 50);
  assert.ok(PIECE_KINDS.every((k) => [1, 2].includes(shapeSize(k).w) && shapeSize(k).h === 1));
  assert.deepEqual(shapeSize('1-06'), { w: 1, h: 1 }, 'stretching up takes one cell…');
  assert.ok(lookSize('1-06').h > 1.4 * lookSize('1-06').w, '…but looks tall');
  assert.deepEqual(shapeSize('1-16'), { w: 2, h: 1 }, 'sleeping is long');
  assert.deepEqual(cellsAt('1-00', { x: 3, y: 1, flip: true }), [[3, 1], [4, 1]]);
});

test('fits respects the board edges and other pieces', () => {
  assert.ok(fits([], '1-16', { x: BOARD_COLS - 2, y: 0, flip: false }));
  assert.ok(!fits([], '1-16', { x: BOARD_COLS - 1, y: 0, flip: false }));
  assert.ok(fits([], '1-06', { x: 3, y: BOARD_ROWS - 1, flip: false }));
  assert.ok(!fits([], '1-06', { x: 3, y: BOARD_ROWS, flip: false }));
  assert.ok(!fits([], '1-00', { x: -1, y: 0, flip: false }));
  const board = [piece('a', '1-00', { x: 0, y: 0, flip: false })];
  assert.ok(!fits(board, '1-00', { x: 1, y: 0, flip: false }));
  assert.ok(fits(board, '1-00', { x: 2, y: 0, flip: false }));
  // A piece never collides with itself while being moved.
  assert.ok(fits(board, '1-00', { x: 1, y: 0, flip: false }, 'a'));
});

test('first fit fills from the left edge and the front backwards', () => {
  // The front-left lawn cells hold a bench, so the first spot is one row back.
  assert.deepEqual(firstFit([], '1-00'), { x: 0, y: BOARD_ROWS - 2, flip: false });
});

test('earned pieces land on the boards, and go to the tray when everything is full', () => {
  let pieces: Piece[] = [];
  for (let i = 0; i < 200; i++) pieces = awardPiece(pieces, T0 + i * MINUTE);
  assert.equal(pieces.length, 200);
  assert.ok(pieces[0]!.placed);
  assert.equal(new Set(cellKeys(pieces)).size, cellKeys(pieces).length, 'no overlaps');
  assert.ok(pieces.some((p) => p.placed === null), 'the rest wait in the tray, never lost');
});

test('placing moves a piece only when it fits', () => {
  const pieces = [piece('a', '1-00', { x: 0, y: 0, flip: false }), piece('b', '1-12', null)];
  assert.equal(placePiece(pieces, 'b', { x: 1, y: 0, flip: false }), pieces);
  const moved = placePiece(pieces, 'b', { x: 5, y: 2, flip: true });
  assert.deepEqual(moved[1]!.placed, { x: 5, y: 2, flip: true });
  assert.equal(placePiece(pieces, 'zzz', { x: 5, y: 2, flip: false }), pieces);
  assert.equal(unplacePiece(moved, 'b')[1]!.placed, null);
});

test('completing a session earns exactly one piece; cancelling earns none and takes none', () => {
  let d = start(fresh(), T0);
  d = advance(d, T0 + 25 * MINUTE);
  assert.equal(d.pieces.length, 1);
  d = advance(d, T0 + 40 * MINUTE);
  d = start(d, T0 + 41 * MINUTE);
  d = cancel(d, T0 + 45 * MINUTE);
  assert.equal(d.pieces.length, 1);
});

test('completeNow finishes a session at once, from idle or from a break', () => {
  let d = completeNow(fresh(), T0);
  assert.equal(d.state.kind, 'break');
  assert.equal(d.pieces.length, 1);
  d = completeNow(d, T0 + 1000);
  assert.equal(d.state.kind, 'break');
  assert.equal(d.pieces.length, 2);
  assert.equal(d.history.filter((r) => r.outcome === 'completed').length, 2);
});

test('old data gets one piece per completed session; bad stored pieces are cleaned', () => {
  const history: SessionRecord[] = [
    { at: T0, day: dayKey(T0), outcome: 'completed', profile: 'gentle', focusedMinutes: 25 },
    { at: T0 + 1, day: dayKey(T0), outcome: 'cancelled', profile: 'gentle', focusedMinutes: 3 },
    { at: T0 + 2, day: dayKey(T0), outcome: 'completed', profile: 'gentle', focusedMinutes: 25 },
  ];
  assert.equal(piecesFromHistory(history).length, 2);
  const cleaned = normalizePieces([
    piece('a', '1-00', { x: 0, y: 0, flip: false }),
    piece('b', '1-00', { x: 1, y: 0, flip: false }), // overlaps a
    { id: 'c', kind: 'X' },
    null,
  ]);
  assert.equal(cleaned.length, 2);
  // The overlapping piece finds a free spot instead of being lost.
  assert.deepEqual(cleaned[0]!.placed, { x: 0, y: 0, flip: false });
  assert.ok(cleaned[1]!.placed && fits([cleaned[0]!], '1-00', cleaned[1]!.placed));
});

test('pieces whose spot no longer works move to free spots of their scene, or the tray', () => {
  const outside = Array.from({ length: 60 }, (_, i) => piece(`o${i}`, '1-00', { x: 12 + i, y: 7, flip: false }));
  const kept = piece('k', '1-00', { x: 0, y: 0, flip: false });
  const result = normalizePieces([...outside, kept]);
  assert.deepEqual(result.at(-1)!.placed, kept.placed, 'valid spots win over moved pieces');
  assert.equal(new Set(cellKeys(result)).size, cellKeys(result).length, 'no overlaps');
  assert.ok(result.every((p) => !p.placed || sceneAt(p.placed) === 0), 'they stay in the garden');
  assert.ok(result.some((p) => p.placed === null), 'extra pieces wait in the tray');
  assert.equal(result.length, 61);
});

// ---- Sync between devices ----

import { decode, encode, merge, restamp, toChunks, toSynced, touch } from '../src/core/sync.js';

function deviceWith(sessions: number[]): AppData {
  let d = fresh();
  for (const at of sessions) d = completeNow(d, at);
  return d;
}

test('synced data survives the compact text form', () => {
  let d = deviceWith([T0, T0 + MINUTE]);
  d = cancel(start(endBreak(d), T0 + 2 * MINUTE), T0 + 3 * MINUTE);
  const back = decode(encode(toSynced(d)))!;
  assert.deepEqual(back.history, d.history);
  assert.deepEqual(back.pieces, d.pieces);
  assert.equal(back.settings.dailyMinutes, 120);
  assert.equal('syncEnabled' in back.settings, false);
  assert.equal(decode('{"v":3}'), null);
  assert.equal(decode('no es json'), null);
});

test('four-block pieces from before become kittens, the same on every device, and keep their id', () => {
  const old = JSON.stringify({ v: 1, h: [], p: [['pa', 'T', T0, 0, 0, 1], ['pb', 'I', T0 + 1], ['pc', '?', T0]], ba: 5 });
  const a = decode(old)!;
  const b = decode(old)!;
  assert.deepEqual(a.pieces.map((p) => p.id), ['pa', 'pb']);
  assert.ok(a.pieces.every((p) => PIECE_KINDS.includes(p.kind)));
  assert.deepEqual(a.pieces, b.pieces);
  assert.ok(a.pieces[0]!.placed, 'a piece that was on the board finds a new spot');
  assert.equal(a.pieces[1]!.placed, null, 'a piece in the tray stays there');
});

test('new characters are ones not collected yet, from every cast', () => {
  let pieces: Piece[] = [];
  for (let i = 0; i < 40; i++) pieces = awardPiece(pieces, T0 + i * MINUTE);
  assert.equal(new Set(pieces.map((p) => p.kind)).size, pieces.length, 'no repeats while some are missing');
});

test('chunks stay under the per-item limit and join back exactly', () => {
  const text = encode(toSynced(deviceWith(Array.from({ length: 120 }, (_, i) => T0 + i * MINUTE)))) + '"\ñ😀'.repeat(500);
  const chunks = toChunks(text, 8000);
  assert.ok(chunks.length > 1);
  for (const c of chunks) assert.ok(new TextEncoder().encode(JSON.stringify(c)).length <= 8000);
  assert.equal(chunks.join(''), text);
});

test('touch stamps only what changed', () => {
  const d = fresh();
  assert.equal(touch(d, d, T0), d);
  const s = touch(d, saveSettings(d, { strictMode: true }), T0);
  assert.deepEqual(s.stamps, { settings: T0, board: 0 });
  const local = touch(d, saveSettings(d, { syncEnabled: false }), T0);
  assert.deepEqual(local.stamps, { settings: 0, board: 0 }, 'the sync switch is per device');
  const b = touch(d, completeNow(d, T0), T0);
  assert.equal(b.stamps.board, T0);
});

test('merging joins history and pieces from both devices without losing any', () => {
  const a = deviceWith([T0, T0 + MINUTE]);
  const b = deviceWith([T0 + 10 * MINUTE]);
  const merged = merge(a, toSynced(b));
  assert.equal(merged.history.length, 3);
  assert.equal(merged.pieces.length, 3);
  assert.equal(new Set(cellKeys(merged.pieces)).size, cellKeys(merged.pieces).length, 'no overlaps');
  // Merging again changes nothing.
  assert.deepEqual(merge(merged, toSynced(merged)).pieces, merged.pieces);
});

test('the newest settings edit wins, but the sync switch stays local', () => {
  const a = touch(fresh(), saveSettings(fresh(), { dailyMinutes: 60 }), T0);
  const b0 = saveSettings(fresh(), { syncEnabled: false });
  const b = touch(b0, saveSettings(b0, { dailyMinutes: 240 }), T0 + 1);
  const intoA = merge(a, toSynced(b));
  assert.equal(intoA.settings.dailyMinutes, 240);
  assert.equal(intoA.settings.syncEnabled, true);
  assert.equal(merge(b, toSynced(a)).settings.dailyMinutes, 240);
});

test('two devices converge after one round trip', () => {
  const a = deviceWith([T0]);
  const b = deviceWith([T0 + 5 * MINUTE]);
  // A merges B, sees a difference, and shares it as a fresh edit.
  const a2 = restamp(merge(a, toSynced(b)), T0 + 20 * MINUTE);
  // B adopts it and has nothing new to add.
  const b2 = merge(b, toSynced(a2));
  assert.equal(encode(toSynced(b2)), encode(toSynced(a2)));
});

import { applyBoard, layoutOf } from '../src/core/board.js';

test('saving the board applies every position at once, or none', () => {
  const pieces = [piece('a', '1-00', { x: 0, y: 0, flip: false }), piece('b', '1-12', null)];
  const ok = applyBoard(pieces, { a: { x: 4, y: 3, flip: false }, b: { x: 0, y: 0, flip: false } });
  assert.deepEqual(layoutOf(ok), { a: { x: 4, y: 3, flip: false }, b: { x: 0, y: 0, flip: false } });
  const clash = applyBoard(pieces, { b: { x: 0, y: 0, flip: false } }); // a is still there
  assert.equal(clash, pieces);
  assert.equal(applyBoard(pieces, { a: null })[0]!.placed, null);
});

// ---- Perspective ----

import { apply, invert, squareToQuad } from '../src/core/perspective.js';

test('perspective sends the board corners to the ground corners and comes back', () => {
  const quad = [[250, 318], [1030, 318], [1250, 700], [30, 700]] as const;
  const m = squareToQuad(quad);
  const corners = [[0, 0], [1, 0], [1, 1], [0, 1]] as const;
  corners.forEach(([u, v], i) => {
    const [x, y] = apply(m, u, v);
    assert.ok(Math.abs(x - quad[i]![0]) < 1e-6 && Math.abs(y - quad[i]![1]) < 1e-6);
  });
  const [u, v] = apply(invert(m), ...apply(m, 0.3, 0.7));
  assert.ok(Math.abs(u - 0.3) < 1e-9 && Math.abs(v - 0.7) < 1e-9);
  // Rows near the front look deeper than rows at the back (foreshortening).
  const rowH = (v0: number, v1: number) => apply(m, 0.5, v1)[1] - apply(m, 0.5, v0)[1];
  assert.ok(rowH(0.8, 1) > rowH(0, 0.2));
});

test('a parallelogram needs no foreshortening', () => {
  const m = squareToQuad([[0, 0], [10, 0], [12, 5], [2, 5]]);
  assert.deepEqual(apply(m, 0.5, 0.5), [6, 2.5]);
});

// ---- Floors ----

import { backgroundScene, floorsOf, justOpened, nextUnlock, openScenes } from '../src/core/board.js';

const FLOORS = floorsOf(0);

test('raised floors hold characters that fit them, and scenery cells hold none', () => {
  const tarima = FLOORS.findIndex((f) => f.id === 'tarima');
  assert.ok(fits([], '1-16', { x: 1, y: 0, flip: false, floor: tarima }), 'a sleeping kitten fits the platform');
  assert.ok(!fits([], '1-16', { x: 2, y: 0, flip: false, floor: tarima }), 'but not past its edge');
  assert.ok(!fits([], '1-02', { x: 0, y: 4, flip: false }), 'the bench stands on that lawn cell');
  assert.ok(!fits([], '1-02', { x: 0, y: 0, flip: false, floor: 99 }));
  const a = piece('a', '1-16', { x: 0, y: 0, flip: false, floor: tarima });
  assert.ok(fits([a], '1-16', { x: 0, y: 0, flip: false }), 'same cell numbers on another floor are free');
  assert.ok(!fits([a], '1-02', { x: 1, y: 0, flip: false, floor: tarima }));
});

test('when the lawn is full, characters go up to the raised floors', () => {
  let pieces: Piece[] = [];
  for (let i = 0; i < 60; i++) pieces = awardPiece(pieces, T0 + i * MINUTE);
  assert.ok(pieces.some((p) => (p.placed?.floor ?? 0) > 0));
});

test('floor and scene travel between devices', () => {
  const d = {
    ...deviceWith([T0]),
    pieces: [
      piece('a', '1-16', { x: 0, y: 0, flip: true, floor: 3 }),
      piece('b', '1-09', { x: 1, y: 0, flip: false, floor: 4, scene: 'circo' }),
    ],
  };
  const back = decode(encode(toSynced(d)))!.pieces;
  assert.deepEqual(back[0]!.placed, { x: 0, y: 0, flip: true, floor: 3 });
  assert.deepEqual(back[1]!.placed, { x: 1, y: 0, flip: false, floor: 4, scene: 'circo' });
});

// ---- Scenes ----

test('backgrounds open with characters earned; development opens them all', () => {
  assert.deepEqual(openScenes([]), [0]);
  assert.deepEqual(openScenes([], true), [0, 1]);
  let pieces: Piece[] = [];
  for (let i = 0; i < 14; i++) pieces = awardPiece(pieces, T0 + i * MINUTE);
  assert.deepEqual(openScenes(pieces), [0]);
  assert.deepEqual(nextUnlock(pieces), { scene: 1, left: 1 });
  assert.equal(justOpened(pieces), -1);
  pieces = awardPiece(pieces, T0 + 20 * MINUTE);
  assert.deepEqual(openScenes(pieces), [0, 1], 'the 15th character opens the circus');
  assert.equal(justOpened(pieces), 1, 'and says so once');
  assert.equal(nextUnlock(pieces), null);
  pieces = awardPiece(pieces, T0 + 21 * MINUTE);
  assert.equal(justOpened(pieces), -1);
});

test('any character can stand in any scene', () => {
  assert.ok(fits([], 'circo-ninfa', { x: 0, y: 0, flip: false }), 'a bird in the garden');
  assert.ok(fits([], '1-06', { x: 0, y: 0, flip: false, floor: 4, scene: 'circo' }), 'a kitten on a trapeze');
  assert.ok(!fits([], '1-06', { x: 0, y: 0, flip: false, scene: 'luna' }), 'not in a scene that does not exist');
  const kitten = piece('k', '1-00', { x: 0, y: 0, flip: false });
  assert.ok(fits([kitten], 'circo-tucan', { x: 0, y: 0, flip: false, scene: 'circo' }), 'garden cells do not block the circus');
});

test('new characters arrive in the chosen scene, and the background follows settings when it is open', () => {
  const [p] = awardPiece([], T0, 1);
  assert.equal(p!.placed?.scene, 'circo');
  const data = { pieces: [], settings: { ...fresh().settings, scene: 'circo' } };
  assert.equal(backgroundScene(data), 0, 'the circus is still closed');
  assert.equal(backgroundScene(data, true), 1, 'development shows it');
});

import { hasNews } from '../src/core/sync.js';

test('a device writes only when it brings something new, so versions never ping-pong', () => {
  const a = deviceWith([T0]);
  const shared = toSynced(a);
  assert.equal(hasNews(a, shared), false, 'nothing new: no write');
  // Another device on an older version shares the same data without a setting it does not know.
  const older = { ...shared, settings: { ...shared.settings, scene: undefined as unknown as string }, settingsAt: shared.settingsAt + 5 };
  assert.equal(hasNews(merge(a, older), older), false, 'a difference in form alone is not news');
  const b = completeNow(a, T0 + 30 * MINUTE);
  assert.equal(hasNews(b, shared), true, 'a new piece and session are news');
});
