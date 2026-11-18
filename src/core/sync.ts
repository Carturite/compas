import { firstFit, fits, normalizePieces, sceneAt } from './board.js';
import { HISTORY_LIMIT, PROFILES } from './config.js';
import { saveSettings } from './machine.js';
import { dayKey } from './time.js';
import type { AppData, Outcome, Piece, ProfileId, SessionRecord, Settings } from './types.js';

/**
 * What travels between devices through the browser's own sync: settings, history and pieces.
 * The running timer stays on each device. Pure: storage I/O lives in platform/sync.ts.
 */

export type SyncedSettings = Omit<Settings, 'syncEnabled'>;

export interface Synced {
  settings: SyncedSettings;
  settingsAt: number;
  history: SessionRecord[];
  pieces: Piece[];
  boardAt: number;
}

function syncedSettings(s: Settings): SyncedSettings {
  const { syncEnabled: _local, ...rest } = s;
  return rest;
}

export function toSynced(data: AppData): Synced {
  return {
    settings: syncedSettings(data.settings),
    settingsAt: data.stamps.settings,
    history: data.history,
    pieces: data.pieces,
    boardAt: data.stamps.board,
  };
}

/** Stamps the synced parts that this change touched, so the newest edit wins on other devices. */
export function touch(before: AppData, after: AppData, now: number): AppData {
  const settingsChanged =
    JSON.stringify(syncedSettings(before.settings)) !== JSON.stringify(syncedSettings(after.settings));
  const boardChanged = JSON.stringify(before.pieces) !== JSON.stringify(after.pieces);
  if (!settingsChanged && !boardChanged) return after;
  return {
    ...after,
    stamps: {
      settings: settingsChanged ? now : after.stamps.settings,
      board: boardChanged ? now : after.stamps.board,
    },
  };
}

/** Marks a merge result as a fresh edit, so the other devices adopt it instead of bouncing back. */
export function restamp(data: AppData, now: number): AppData {
  return { ...data, stamps: { settings: now, board: now } };
}

const recordKey = (r: SessionRecord) => `${r.at}|${r.outcome}`;

/**
 * Whether this device has something the shared copy lacks: a newer edit, or pieces or sessions
 * it never saw. Only then it writes. Differences in form alone (say, another device on an older
 * version that drops a setting it does not know) never trigger a write, so devices never ping-pong.
 */
export function hasNews(local: AppData, remote: Synced): boolean {
  if (local.stamps.board > remote.boardAt || local.stamps.settings > remote.settingsAt) return true;
  const pieceIds = new Set(remote.pieces.map((p) => p.id));
  if (local.pieces.some((p) => !pieceIds.has(p.id))) return true;
  const records = new Set(remote.history.map(recordKey));
  return local.history.some((r) => !records.has(recordKey(r)));
}

/**
 * Brings what another device shared into local data. Nothing earned is ever lost:
 * history and pieces are joined; settings and piece positions follow the newest edit.
 */
export function merge(local: AppData, remote: Synced): AppData {
  let data = local;

  if (remote.settingsAt > local.stamps.settings) {
    data = saveSettings(data, { ...remote.settings, syncEnabled: local.settings.syncEnabled });
  }

  const seen = new Map<string, SessionRecord>();
  for (const r of [...local.history, ...remote.history]) seen.set(recordKey(r), r);
  const history = [...seen.values()].sort((a, b) => a.at - b.at).slice(-HISTORY_LIMIT);

  const remoteNewer = remote.boardAt > local.stamps.board;
  const [primary, secondary] = remoteNewer ? [remote.pieces, local.pieces] : [local.pieces, remote.pieces];
  const pieces = normalizePieces(primary);
  const ids = new Set(pieces.map((p) => p.id));
  for (const p of secondary) {
    if (ids.has(p.id)) continue;
    ids.add(p.id);
    const placed =
      p.placed && fits(pieces, p.kind, p.placed) ? p.placed : firstFit(pieces, p.kind, p.placed ? Math.max(0, sceneAt(p.placed)) : 0);
    pieces.push({ ...p, placed });
  }
  pieces.sort((a, b) => a.earnedAt - b.earnedAt || a.id.localeCompare(b.id));

  return {
    ...data,
    history,
    pieces,
    stamps: {
      settings: Math.max(local.stamps.settings, remote.settingsAt),
      board: Math.max(local.stamps.board, remote.boardAt),
    },
  };
}

// ---- Compact text form (browser sync allows ~100 KB total, 8 KB per item) ----

const OUTCOME_CODE: Record<Outcome, string> = { completed: 'c', cancelled: 'x', postponed: 'p' };
const PROFILE_CODE: Record<ProfileId, string> = { gentle: 'g', medium: 'm', deep: 'd' };
const invert = <K extends string>(o: Record<K, string>) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [v, k])) as Record<string, K | undefined>;
const OUTCOME_OF = invert(OUTCOME_CODE);
const PROFILE_OF = invert(PROFILE_CODE);

type HistoryRow = [at: number, outcome: string, profile: string, minutes: number];
type PieceRow =
  | [id: string, kind: string, earnedAt: number]
  | [id: string, kind: string, earnedAt: number, on: string, flip: 0 | 1]
  | [id: string, kind: string, earnedAt: number, x: number, y: number, flip: 0 | 1]
  | [id: string, kind: string, earnedAt: number, x: number, y: number, flip: 0 | 1, floor: number]
  | [id: string, kind: string, earnedAt: number, x: number, y: number, flip: 0 | 1, floor: number, scene: string];

/** A piece as a short row: position fields only when placed, floor and scene only when not the defaults. */
function pieceRow(p: Piece): PieceRow {
  if (!p.placed) return [p.id, p.kind, p.earnedAt];
  if (p.placed.on !== undefined) return [p.id, p.kind, p.earnedAt, p.placed.on, p.placed.flip ? 1 : 0];
  const { x, y, flip, floor = 0, scene } = p.placed;
  const f = flip ? 1 : 0;
  if (scene !== undefined) return [p.id, p.kind, p.earnedAt, x, y, f, floor, scene];
  if (floor) return [p.id, p.kind, p.earnedAt, x, y, f, floor];
  return [p.id, p.kind, p.earnedAt, x, y, f];
}

export function encode(s: Synced): string {
  return JSON.stringify({
    v: 2,
    s: s.settings,
    sa: s.settingsAt,
    h: s.history.map(
      (r): HistoryRow => [r.at, OUTCOME_CODE[r.outcome], PROFILE_CODE[r.profile], r.focusedMinutes],
    ),
    p: s.pieces.map(pieceRow),
    // Placement order (who is in front at the same depth), only for pieces that have one.
    z: Object.fromEntries(s.pieces.flatMap((p) => (p.placed?.z ? [[p.id, p.placed.z]] : []))),
    ba: s.boardAt,
  });
}

/** Parses what another device wrote. Anything malformed is dropped rather than trusted. */
export function decode(text: string): Synced | null {
  let raw: { v?: unknown; s?: unknown; sa?: unknown; h?: unknown; p?: unknown; ba?: unknown; z?: unknown };
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null || (raw.v !== 1 && raw.v !== 2)) return null;
  // v1 carried four-block pieces with a rotation: they become kittens and find a spot again.
  const kittens = raw.v === 2;

  const history: SessionRecord[] = [];
  for (const row of Array.isArray(raw.h) ? (raw.h as unknown[]) : []) {
    if (!Array.isArray(row)) continue;
    const [at, o, p, m] = row as HistoryRow;
    const outcome = OUTCOME_OF[o];
    const profile = PROFILE_OF[p];
    if (typeof at !== 'number' || !outcome || !profile || typeof m !== 'number') continue;
    history.push({ at, day: dayKey(at), outcome, profile, focusedMinutes: m });
  }

  const pieceObjects = (Array.isArray(raw.p) ? (raw.p as unknown[]) : []).map((row) => {
    if (!Array.isArray(row)) return null;
    const [id, kind, earnedAt, x, y, flip, floor, scene] = row as unknown[];
    if (typeof x === 'string') return { id, kind, earnedAt, placed: { x: 0, y: 0, flip: y === 1, on: x } };
    const placed: Record<string, unknown> | null =
      row.length >= 6 ? { x, y, flip: kittens ? flip === 1 : undefined } : null;
    if (placed && row.length >= 7) placed.floor = floor;
    if (placed && row.length >= 8) placed.scene = scene;
    return { id, kind, earnedAt, placed };
  });
  const order = typeof raw.z === 'object' && raw.z !== null ? (raw.z as Record<string, unknown>) : {};
  for (const piece of pieceObjects) {
    const z = piece && typeof piece.id === 'string' ? order[piece.id] : undefined;
    if (piece?.placed && typeof z === 'number') (piece.placed as Record<string, unknown>).z = z;
  }

  const settings: Partial<SyncedSettings> =
    typeof raw.s === 'object' && raw.s !== null ? { ...(raw.s as Partial<SyncedSettings>) } : {};
  if (settings.profile && !(settings.profile in PROFILES)) delete settings.profile;

  return {
    settings: settings as SyncedSettings,
    settingsAt: typeof raw.sa === 'number' ? raw.sa : 0,
    history,
    pieces: normalizePieces(pieceObjects),
    boardAt: typeof raw.ba === 'number' ? raw.ba : 0,
  };
}

/** Bytes a character adds to the JSON form of a string (UTF-8, rounded up). */
function jsonCharCost(code: number): number {
  if (code === 0x22 || code === 0x5c) return 2; // " and \ get escaped
  if (code < 0x20) return 6;
  return code < 0x80 ? 1 : 3;
}

/** Splits text into pieces whose JSON form stays under `budget` bytes each. */
export function toChunks(text: string, budget = 8000): string[] {
  const chunks: string[] = [];
  let start = 0;
  let size = 2; // the surrounding quotes
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const cost = jsonCharCost(code);
    const lowSurrogate = code >= 0xdc00 && code <= 0xdfff; // never split an emoji in half
    if (size + cost > budget && !lowSurrogate) {
      chunks.push(text.slice(start, i));
      start = i;
      size = 2;
    }
    size += cost;
  }
  chunks.push(text.slice(start));
  return chunks;
}
