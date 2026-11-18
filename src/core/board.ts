import {
  blinkOf,
  castOf,
  footprint,
  isCastId,
  isObject,
  layerOf,
  sceneData,
  sceneIndex,
  SCENES,
  topOf,
  type FloorData,
} from './scenes.js';
import type { AppData, Piece, PieceKind, Placed, Placement, SessionRecord } from './types.js';

/**
 * The reward board: scenes (a garden, a circus, a theatre…) where each completed focus session adds a piece.
 * Pieces are one collection, and each one can stand once in every scene, on any of its floors: the main ground
 * plus raised surfaces (stage, benches, trapezes, pegs). Each takes 1 to 3 cells, one row deep. A few (a table,
 * a drum, a hat) have room on top for one more, who then moves with them. A few take no room at all (a rug,
 * an arch, a flower box): others share their cells, and they are drawn behind or in front of them.
 * Most functions work on one scene at a time: `viewOf` shows the pieces as they are in that scene, and
 * `withView` stores a changed view back.
 * Scenes open as pieces are earned (each says how many); development builds open them all.
 * Pieces are never lost: nothing is cleared and nothing is taken away for cancelling.
 * Pure: no browser APIs, no clock. Scene data comes from core/scenes.gen.ts.
 */

export type Cell = readonly [x: number, y: number];

export const PIECE_KINDS: readonly PieceKind[] = SCENES.flatMap((_, i) => castOf(i));
/** Safety cap for storage; far beyond what fits on the boards. */
export const PIECES_LIMIT = 400;
/** Ids of the pieces development builds add so every kind is at hand; they never travel to other devices. */
export const DEV_PREFIX = 'dev-';
/** The four-block shapes used before the characters; old pieces become garden kittens. */
const LEGACY_KINDS = new Set(['I', 'O', 'T', 'S', 'Z', 'J', 'L']);
/** Where everything lived before scenes existed: placements without `scene` are here. */
const GARDEN = Math.max(
  0,
  SCENES.findIndex((s) => s.id === 'jardin'),
);

export function floorsOf(scene: number): readonly FloorData[] {
  return sceneData(scene).floors;
}

export function shapeSize(kind: PieceKind): { w: number; h: number } {
  return footprint(kind);
}

export function cellsAt(kind: PieceKind, placement: Placement): Cell[] {
  const { w, h } = footprint(kind);
  const cells: Cell[] = [];
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) cells.push([placement.x + dx, placement.y + dy]);
  }
  return cells;
}

/** Which floor a placement is on; absent means the scene's main ground. */
export const floorOf = (p: Placement): number => p.floor ?? 0;

/** Which scene a placement is in (index, -1 if unknown); absent means the garden. */
export const sceneAt = (p: Placement): number => (p.scene === undefined ? GARDEN : sceneIndex(p.scene));

// ---- One scene at a time ----

/** A stored spot as the scene shows it: pieces on top of others carry no scene there. */
function shownSpot(spot: Placement): Placement {
  if (spot.on === undefined) return copy(spot);
  const out: Placement = { x: 0, y: 0, flip: spot.flip, on: spot.on };
  if (Number.isInteger(spot.z) && spot.z! > 0) out.z = spot.z;
  return out;
}

/** The pieces as they are in one scene: their spot there, or null (waiting in that scene's tray). */
export function viewOf(pieces: readonly Piece[], scene: number): Placed[] {
  return pieces.map((p) => {
    const spot = p.spots.find((s) => sceneAt(s) === scene);
    return { id: p.id, kind: p.kind, earnedAt: p.earnedAt, placed: spot ? shownSpot(spot) : null };
  });
}

/** Stores a scene's view back into the pieces; the other scenes keep their spots. */
export function withView(pieces: readonly Piece[], scene: number, view: readonly Placed[]): Piece[] {
  const byId = new Map(view.map((v) => [v.id, v.placed]));
  const id = sceneData(scene).id;
  return pieces.map((p) => {
    if (!byId.has(p.id)) return p;
    const placed = byId.get(p.id) ?? null;
    const spots = p.spots.filter((s) => sceneAt(s) !== scene);
    if (placed) {
      const spot = copy(placed);
      if (scene !== GARDEN) spot.scene = id;
      else delete spot.scene;
      spots.push(spot);
    }
    return { ...p, spots };
  });
}

/** The piece at the bottom of a stack (itself when it stands on a floor). Null when the chain is broken. */
export function rootOf(pieces: readonly Placed[], piece: Placed): Placed | null {
  let current: Placed | undefined = piece;
  for (let hops = 0; current?.placed?.on !== undefined; hops++) {
    if (hops > pieces.length) return null;
    const below: string = current.placed.on;
    current = pieces.find((p) => p.id === below);
  }
  return current?.placed ? current : null;
}

/** Scene where a placed piece is shown, following stacks down to the floor; -1 if not placed. */
export function sceneOfPiece(pieces: readonly Placed[], piece: Placed): number {
  const root = rootOf(pieces, piece);
  return root?.placed ? sceneAt(root.placed) : -1;
}

/** Whether another piece can stand on this one. */
export const holds = (kind: PieceKind): boolean => topOf(kind) !== undefined;

/** Pieces that take no room (a rug, an arch, a flower box) only bump into others like them on the same layer. */
const layerKey = (kind: PieceKind) => layerOf(kind) ?? 'room';

const key = (scene: number, floor: number, x: number, y: number) => `${scene}/${floor}:${x},${y}`;

const SCENERY = new Set(
  SCENES.flatMap((_, s) => floorsOf(s).flatMap((f, i) => f.blocked.map(([x, y]) => key(s, i, x, y)))),
);

/** Cells taken on one layer: 'room' (everything that takes room, plus scenery), 'back' or 'front'. */
function occupied(pieces: readonly Placed[], layer: string, exceptId?: string): Set<string> {
  const set = new Set(layer === 'room' ? SCENERY : []);
  for (const p of pieces) {
    if (!p.placed || p.placed.on !== undefined || p.id === exceptId || layerKey(p.kind) !== layer) continue;
    const s = sceneAt(p.placed);
    const f = floorOf(p.placed);
    for (const [x, y] of cellsAt(p.kind, p.placed)) set.add(key(s, f, x, y));
  }
  return set;
}

function fitsIn(taken: Set<string>, kind: PieceKind, placement: Placement): boolean {
  if (placement.on !== undefined) return false;
  const scene = sceneAt(placement);
  const f = placement.floor ?? 0;
  const floor = scene >= 0 && Number.isInteger(f) ? floorsOf(scene)[f] : undefined;
  if (
    !floor ||
    !Number.isInteger(placement.x) ||
    !Number.isInteger(placement.y) ||
    typeof placement.flip !== 'boolean'
  ) {
    return false;
  }
  return cellsAt(kind, placement).every(
    ([x, y]) => x >= 0 && y >= 0 && x < floor.cols && y < floor.rows && !taken.has(key(scene, f, x, y)),
  );
}

/** A placement in the stored shape: `floor` only off the main ground, `scene` only outside the garden. */
export function placementOf(x: number, y: number, flip: boolean, floor = 0, scene = GARDEN): Placement {
  const p: Placement = { x, y, flip };
  if (floor) p.floor = floor;
  if (scene !== GARDEN) p.scene = sceneData(scene).id;
  return p;
}

const copy = (p: Placement): Placement => {
  const out: Placement =
    p.on !== undefined ? { x: 0, y: 0, flip: p.flip, on: p.on } : placementOf(p.x, p.y, p.flip, floorOf(p), sceneAt(p));
  if (Number.isInteger(p.z) && p.z! > 0) out.z = p.z;
  return out;
};

/** The next placement order: whatever is placed now goes in front of everything at its depth. */
export function nextZ(pieces: readonly Placed[]): number {
  return pieces.reduce((top, p) => Math.max(top, p.placed?.z ?? 0), 0) + 1;
}

/**
 * Whether `kind` can stand on the piece `on`: it is placed, has room on top, nobody else is there,
 * and it is not the moving piece itself or something standing on it (no loops).
 */
function fitsOnTop(pieces: readonly Placed[], placement: Placement, exceptId?: string): boolean {
  const base = pieces.find((p) => p.id === placement.on);
  if (!base?.placed || base.id === exceptId || !holds(base.kind) || typeof placement.flip !== 'boolean') return false;
  if (pieces.some((p) => p.id !== exceptId && p.placed?.on === base.id)) return false;
  for (let below: Placed | undefined = base, hops = 0; below?.placed; hops++) {
    if (below.id === exceptId || hops > pieces.length) return false;
    if (below.placed.on === undefined) return true;
    const next: string = below.placed.on;
    below = pieces.find((p) => p.id === next);
  }
  return false;
}

/** True when the piece stays inside its floor and does not overlap scenery or other pieces of that scene. */
export function fits(
  pieces: readonly Placed[],
  kind: PieceKind,
  placement: Placement,
  exceptId?: string,
): boolean {
  if (placement.on !== undefined) return layerOf(kind) === undefined && fitsOnTop(pieces, placement, exceptId);
  return fitsIn(occupied(pieces, layerKey(kind), exceptId), kind, placement);
}

/**
 * First free spot in a scene: the main ground first, from the left edge and the front backwards,
 * then the raised floors. Null when there is no room anywhere.
 */
export function firstFit(pieces: readonly Placed[], kind: PieceKind, scene = GARDEN): Placement | null {
  const taken = occupied(pieces, layerKey(kind));
  const { h } = footprint(kind);
  const floors = floorsOf(scene);
  for (let f = 0; f < floors.length; f++) {
    const { cols, rows } = floors[f]!;
    for (let x = 0; x < cols; x++) {
      for (let y = rows - h; y >= 0; y--) {
        const placement = placementOf(x, y, false, f, scene);
        if (fitsIn(taken, kind, placement)) return placement;
      }
    }
  }
  return null;
}

/**
 * Scenes available as background: each opens once enough pieces were earned (pieces are never
 * lost, so a scene never closes again), or if something already stands in it. `all` opens every scene
 * (development builds).
 */
export function openScenes(pieces: readonly Piece[], all = false): number[] {
  const used = new Set(pieces.flatMap((p) => p.spots.filter((s) => s.on === undefined).map(sceneAt)));
  return SCENES.flatMap((s, i) => (all || i === 0 || earned(pieces) >= s.unlock || used.has(i) ? [i] : []));
}

/** Pieces really earned (not the ones development builds add). */
const earned = (pieces: readonly Piece[]) => pieces.filter((p) => !p.id.startsWith(DEV_PREFIX)).length;

/** The next scene to open and how many pieces are still missing for it, or null when all are open. */
export function nextUnlock(pieces: readonly Piece[]): { scene: number; left: number } | null {
  const open = new Set(openScenes(pieces));
  let next: { scene: number; left: number } | null = null;
  SCENES.forEach((s, i) => {
    const left = s.unlock - earned(pieces);
    if (!open.has(i) && (!next || left < next.left)) next = { scene: i, left };
  });
  return next;
}

/** The scene that the last earned piece just opened, or -1. */
export function justOpened(pieces: readonly Piece[]): number {
  return SCENES.findIndex((s, i) => i > 0 && s.unlock > 0 && s.unlock === earned(pieces));
}

/** The scene drawn behind the pages: the one chosen in settings if it is open; otherwise the first. */
export function backgroundScene(data: Pick<AppData, 'pieces' | 'settings'>, all = false): number {
  const chosen = sceneIndex(data.settings.scene);
  return openScenes(data.pieces, all).includes(chosen) ? chosen : 0;
}

/** Deterministic hash, so the core stays testable without randomness. */
function hash(seed: number): number {
  let h = (seed % 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** The three kinds of reward, drawn with the same chance: things, characters, and characters that blink. */
const REWARD_GROUPS: readonly (readonly PieceKind[])[] = [
  PIECE_KINDS.filter((k) => isObject(k)),
  PIECE_KINDS.filter((k) => !isObject(k) && !blinkOf(k)),
  PIECE_KINDS.filter((k) => !isObject(k) && blinkOf(k) !== undefined),
].filter((g) => g.length > 0);

/** Picks the next reward by the seed: first the kind of reward, then one of them. Repeats can happen. */
export function kindFor(seed: number): PieceKind {
  const h = hash(seed);
  const group = REWARD_GROUPS[h % REWARD_GROUPS.length]!;
  return group[hash(h ^ 0x9e3779b9) % group.length]!;
}

/**
 * Adds the piece earned by a session completed at `at`. It goes to the first free spot of the chosen
 * scene; if there is no room it waits in that scene's tray.
 */
export function awardPiece(pieces: readonly Piece[], at: number, scene = GARDEN): Piece[] {
  if (pieces.length >= PIECES_LIMIT) return [...pieces];
  const n = pieces.length;
  const kind = kindFor(at + n * 7919);
  const view = viewOf(pieces, scene);
  const placed = firstFit(view, kind, scene);
  if (placed) placed.z = nextZ(view);
  const piece: Placed = { id: `p${at.toString(36)}-${n.toString(36)}`, kind, earnedAt: at, placed };
  return withView([...pieces, { id: piece.id, kind, earnedAt: at, spots: [] }], scene, [piece]);
}

/** Development builds: one piece of every kind that is still missing, so the whole catalogue is at hand. */
export function withCatalog(pieces: readonly Piece[]): Piece[] {
  const have = new Set(pieces.map((p) => p.kind));
  const missing = PIECE_KINDS.filter((k) => !have.has(k));
  return [...pieces, ...missing.map((kind) => ({ id: `${DEV_PREFIX}${kind}`, kind, earnedAt: 0, spots: [] }))];
}

/** Moves a piece (from the tray or the board) to a new spot in this scene. Unchanged if it does not fit. */
export function placePiece(pieces: Placed[], id: string, placement: Placement): Placed[] {
  const piece = pieces.find((p) => p.id === id);
  if (!piece || !fits(pieces, piece.kind, placement, id)) return pieces;
  // The piece just placed goes in front of everything at its depth.
  const placed = { ...copy(placement), z: nextZ(pieces) };
  return pieces.map((p) => (p.id === id ? { ...p, placed } : p));
}

/** Sends a piece back to this scene's tray, with whoever stands on it. */
export function unplacePiece(pieces: Placed[], id: string): Placed[] {
  if (!pieces.some((p) => p.id === id && p.placed)) return pieces;
  const gone = new Set([id]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const p of pieces) {
      if (p.placed?.on !== undefined && gone.has(p.placed.on) && !gone.has(p.id)) {
        gone.add(p.id);
        grew = true;
      }
    }
  }
  return pieces.map((p) => (gone.has(p.id) ? { ...p, placed: null } : p));
}

/** A legacy four-block piece becomes a garden kitten, the same one on every device (chosen from its id). */
function legacyKind(id: string): PieceKind {
  let n = 0;
  for (let i = 0; i < id.length; i++) n = (Math.imul(n, 31) + id.charCodeAt(i)) | 0;
  const cast = castOf(GARDEN);
  return cast[hash(n) % cast.length]!;
}

/** For data saved before pieces existed: one piece per completed session, in order. */
export function piecesFromHistory(history: readonly SessionRecord[]): Piece[] {
  return history
    .filter((r) => r.outcome === 'completed')
    .reduce<Piece[]>((acc, r) => awardPiece(acc, r.at), []);
}

type RawSpot = Partial<Placement> & Record<string, unknown>;

/**
 * Validates pieces read from storage. Invalid ones are dropped; four-block pieces from before become kittens.
 * Data from before scenes kept their own spots has `placed` (one spot) instead of `spots`.
 * In every scene, a piece whose spot no longer works (overlap, or a floor or footprint that changed) looks for
 * a free spot in that scene, and waits in its tray if none.
 */
export function normalizePieces(raw: readonly unknown[]): Piece[] {
  const parsed: { piece: Piece; spots: RawSpot[] }[] = [];
  for (const item of raw.slice(0, PIECES_LIMIT)) {
    if (typeof item !== 'object' || item === null) continue;
    const p = item as Partial<Piece> & { placed?: unknown };
    if (typeof p.id !== 'string' || parsed.some((q) => q.piece.id === p.id)) continue;
    const kind = isCastId(p.kind) ? p.kind : LEGACY_KINDS.has(String(p.kind)) ? legacyKind(p.id) : null;
    if (!kind) continue;
    const list = Array.isArray(p.spots) ? (p.spots as unknown[]) : p.placed ? [p.placed] : [];
    const spots = list.filter((s): s is RawSpot => typeof s === 'object' && s !== null);
    parsed.push({ piece: { id: p.id, kind, earnedAt: typeof p.earnedAt === 'number' ? p.earnedAt : 0, spots: [] }, spots });
  }
  // A spot on top of another piece, saved before spots carried their scene, is in the scene of that piece.
  const sceneOfRaw = (spot: RawSpot, hops = 0): number => {
    if (spot.on === undefined || spot.scene !== undefined) return sceneAt(spot as Placement);
    const base = parsed.find((q) => q.piece.id === spot.on);
    const below = base?.spots.length === 1 ? base.spots[0]! : undefined;
    return below && hops < parsed.length ? sceneOfRaw(below, hops + 1) : -1;
  };
  let out = parsed.map((q) => q.piece);
  SCENES.forEach((_, scene) => {
    const rawView = parsed.map(({ piece, spots }) => ({
      ...piece,
      placed: (spots.find((s) => sceneOfRaw(s) === scene) ?? null) as Placement | null,
    }));
    out = withView(out, scene, normalizeView(rawView));
  });
  return out;
}

/** One scene's pieces as read: valid spots stay, others look for room in that scene; stacks are rebuilt. */
function normalizeView(raw: readonly Placed[]): Placed[] {
  const out: Placed[] = [];
  const misplaced: { index: number; scene: number }[] = [];
  for (const p of raw) {
    const at = p.placed && p.placed.on === undefined ? p.placed : null;
    const ok = at && fits(out, p.kind, at) ? copy(at) : null;
    if (at && !ok) {
      const scene = sceneAt(at);
      misplaced.push({ index: out.length, scene: scene >= 0 ? scene : GARDEN });
    }
    out.push({ id: p.id, kind: p.kind, earnedAt: p.earnedAt, placed: ok });
  }
  for (const { index, scene } of misplaced) out[index] = { ...out[index]!, placed: firstFit(out, out[index]!.kind, scene) };
  // Pieces that stood on another piece: kept when that piece still holds them, otherwise they wait in the tray.
  const wanted = new Map(raw.flatMap((p) => (p.placed?.on !== undefined ? [[p.id, p.placed] as const] : [])));
  for (let grew = true; grew; ) {
    grew = false;
    for (let i = 0; i < out.length; i++) {
      const want = wanted.get(out[i]!.id);
      if (!want || out[i]!.placed) continue;
      const placed = copy(want);
      if (fits(out, out[i]!.kind, placed, out[i]!.id)) {
        out[i] = { ...out[i]!, placed };
        grew = true;
      }
    }
  }
  return out;
}

export type Layout = Record<string, Placement | null>;

/**
 * Applies a whole layout of one scene saved from the editor in one go. Pieces not mentioned keep their spot.
 * If any position is invalid or overlaps, nothing changes: the board is never left half-saved.
 */
export function applyBoard(pieces: Placed[], layout: Layout): Placed[] {
  const next = pieces.map((p) => (p.id in layout ? { ...p, placed: layout[p.id] ?? null } : p));
  // Floors first, then pieces on top of others (their base must already be checked).
  const checked: Placed[] = [];
  for (const p of next) {
    if (p.placed?.on !== undefined) continue;
    if (p.placed && !fits(checked, p.kind, p.placed)) return pieces;
    checked.push(p);
  }
  let stacked = next.filter((p) => p.placed?.on !== undefined);
  while (stacked.length) {
    const ready = stacked.filter((p) => fits(checked, p.kind, p.placed!, p.id));
    if (!ready.length) return pieces;
    checked.push(...ready);
    stacked = stacked.filter((p) => !ready.includes(p));
  }
  return next.map((p) => (p.placed ? { ...p, placed: copy(p.placed) } : p));
}

/**
 * The editor's "Guardar": the layouts of every scene it touched (by scene id). All or nothing: if one scene's
 * layout is invalid, no scene changes. A placement whose scene is not the one it is listed under is invalid.
 */
export function applyBoards(pieces: Piece[], layouts: Record<string, Layout>): Piece[] {
  let next = pieces;
  for (const [id, layout] of Object.entries(layouts)) {
    const scene = sceneIndex(id);
    if (scene < 0) return pieces;
    const wrong = Object.values(layout).some((p) => p && p.on === undefined && sceneAt(p) !== scene);
    if (wrong) return pieces;
    const view = viewOf(next, scene);
    const applied = applyBoard(view, layout);
    if (applied === view && Object.keys(layout).length) return pieces;
    next = withView(next, scene, applied);
  }
  return next;
}

/** The layout of one scene's board, as the editor sends it. */
export function layoutOf(pieces: readonly Placed[]): Layout {
  return Object.fromEntries(pieces.map((p) => [p.id, p.placed]));
}
