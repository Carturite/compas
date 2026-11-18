import { footprint, isCastId, sceneData, sceneIndex, SCENES, castOf, type FloorData } from './scenes.js';
import type { AppData, Piece, PieceKind, Placement, SessionRecord } from './types.js';

/**
 * The reward board: scenes (a garden, a circus…) where each completed focus session adds a character.
 * Characters are one collection and can be placed in any scene, on any of its floors: the main ground plus
 * raised surfaces (stage, benches, trapezes). Each takes 1 or 2 cells, one row deep.
 * Scenes open as characters are earned (each says how many); development builds open them all.
 * Pieces are never lost: nothing is cleared and nothing is taken away for cancelling.
 * Pure: no browser APIs, no clock. Scene data comes from core/scenes.gen.ts.
 */

export type Cell = readonly [x: number, y: number];

export const PIECE_KINDS: readonly PieceKind[] = SCENES.flatMap((_, i) => castOf(i));
/** Safety cap for storage; far beyond what fits on the boards. */
export const PIECES_LIMIT = 400;
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

const key = (scene: number, floor: number, x: number, y: number) => `${scene}/${floor}:${x},${y}`;

const SCENERY = new Set(
  SCENES.flatMap((_, s) => floorsOf(s).flatMap((f, i) => f.blocked.map(([x, y]) => key(s, i, x, y)))),
);

function occupied(pieces: readonly Piece[], exceptId?: string): Set<string> {
  const set = new Set(SCENERY);
  for (const p of pieces) {
    if (!p.placed || p.id === exceptId) continue;
    const s = sceneAt(p.placed);
    const f = floorOf(p.placed);
    for (const [x, y] of cellsAt(p.kind, p.placed)) set.add(key(s, f, x, y));
  }
  return set;
}

function fitsIn(taken: Set<string>, kind: PieceKind, placement: Placement): boolean {
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

const copy = (p: Placement): Placement => placementOf(p.x, p.y, p.flip, floorOf(p), sceneAt(p));

/** True when the piece stays inside its floor and does not overlap scenery or other pieces of that scene. */
export function fits(
  pieces: readonly Piece[],
  kind: PieceKind,
  placement: Placement,
  exceptId?: string,
): boolean {
  return fitsIn(occupied(pieces, exceptId), kind, placement);
}

function firstFitIn(taken: Set<string>, kind: PieceKind, scene: number): Placement | null {
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
 * First free spot in a scene: the main ground first, from the left edge and the front backwards,
 * then the raised floors. Null when there is no room anywhere.
 */
export function firstFit(pieces: readonly Piece[], kind: PieceKind, scene = GARDEN): Placement | null {
  return firstFitIn(occupied(pieces), kind, scene);
}

/**
 * Scenes available as background: each opens once enough characters were earned (pieces are never
 * lost, so a scene never closes again), or if something already stands in it. `all` opens every scene
 * (development builds).
 */
export function openScenes(pieces: readonly Piece[], all = false): number[] {
  const used = new Set(pieces.flatMap((p) => (p.placed ? [sceneAt(p.placed)] : [])));
  return SCENES.flatMap((s, i) => (all || i === 0 || pieces.length >= s.unlock || used.has(i) ? [i] : []));
}

/** The next scene to open and how many characters are still missing for it, or null when all are open. */
export function nextUnlock(pieces: readonly Piece[]): { scene: number; left: number } | null {
  const open = new Set(openScenes(pieces));
  let next: { scene: number; left: number } | null = null;
  SCENES.forEach((s, i) => {
    const left = s.unlock - pieces.length;
    if (!open.has(i) && (!next || left < next.left)) next = { scene: i, left };
  });
  return next;
}

/** The scene that the last earned character just opened, or -1. */
export function justOpened(pieces: readonly Piece[]): number {
  return SCENES.findIndex((s, i) => i > 0 && s.unlock > 0 && s.unlock === pieces.length);
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

/** Picks the next character from every cast: one not collected yet (or collected fewest times), by the seed. */
export function kindFor(pieces: readonly Piece[], seed: number): PieceKind {
  const count = new Map<PieceKind, number>(PIECE_KINDS.map((k) => [k, 0]));
  for (const p of pieces) {
    const c = count.get(p.kind);
    if (c !== undefined) count.set(p.kind, c + 1);
  }
  const least = Math.min(...count.values());
  const options = PIECE_KINDS.filter((k) => count.get(k) === least);
  return options[hash(seed) % options.length]!;
}

/**
 * Adds the character earned by a session completed at `at`. It goes to the first free spot of the chosen
 * scene; if that one is full, of the next open scene with room; otherwise it waits in the tray.
 */
export function awardPiece(pieces: readonly Piece[], at: number, scene = GARDEN): Piece[] {
  if (pieces.length >= PIECES_LIMIT) return [...pieces];
  const n = pieces.length;
  const kind = kindFor(pieces, at + n * 7919);
  const taken = occupied(pieces);
  const order = [scene, ...openScenes(pieces).filter((s) => s !== scene)].filter((s) => s >= 0);
  let placed: Placement | null = null;
  for (const s of order) {
    placed = firstFitIn(taken, kind, s);
    if (placed) break;
  }
  return [...pieces, { id: `p${at.toString(36)}-${n.toString(36)}`, kind, earnedAt: at, placed }];
}

/** Moves a piece (from the tray or the board) to a new spot. Unchanged if it does not fit. */
export function placePiece(pieces: Piece[], id: string, placement: Placement): Piece[] {
  const piece = pieces.find((p) => p.id === id);
  if (!piece || !fits(pieces, piece.kind, placement, id)) return pieces;
  const placed = copy(placement);
  return pieces.map((p) => (p.id === id ? { ...p, placed } : p));
}

/** Sends a piece back to the tray. */
export function unplacePiece(pieces: Piece[], id: string): Piece[] {
  if (!pieces.some((p) => p.id === id && p.placed)) return pieces;
  return pieces.map((p) => (p.id === id ? { ...p, placed: null } : p));
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

/**
 * Validates pieces read from storage. Invalid ones are dropped; four-block pieces from before become kittens.
 * A piece whose spot no longer works (overlap, or a floor or footprint that changed) looks for a free spot
 * in the same scene, and waits in the tray if none.
 */
export function normalizePieces(raw: readonly unknown[]): Piece[] {
  const kept = keepValid(raw);
  const out: Piece[] = kept.map(({ piece }) => piece);
  kept.forEach(({ piece, misplacedIn }, i) => {
    if (misplacedIn !== null) out[i] = { ...piece, placed: firstFit(out, piece.kind, misplacedIn) };
  });
  return out;
}

function keepValid(raw: readonly unknown[]): { piece: Piece; misplacedIn: number | null }[] {
  const out: { piece: Piece; misplacedIn: number | null }[] = [];
  const placed: Piece[] = [];
  for (const item of raw.slice(0, PIECES_LIMIT)) {
    if (typeof item !== 'object' || item === null) continue;
    const p = item as Partial<Piece>;
    if (typeof p.id !== 'string') continue;
    const kind = isCastId(p.kind) ? p.kind : LEGACY_KINDS.has(String(p.kind)) ? legacyKind(p.id) : null;
    if (!kind) continue;
    const base: Piece = {
      id: p.id,
      kind,
      earnedAt: typeof p.earnedAt === 'number' ? p.earnedAt : 0,
      placed: null,
    };
    const at = p.placed;
    const ok = at && fits(placed, base.kind, at) ? copy(at) : null;
    const piece = { ...base, placed: ok };
    if (ok) placed.push(piece);
    const scene = at && !ok ? sceneAt(at) : -1;
    out.push({ piece, misplacedIn: at && !ok ? (scene >= 0 ? scene : GARDEN) : null });
  }
  return out;
}

export type Layout = Record<string, Placement | null>;

/**
 * Applies a whole layout saved from the editor in one go. Pieces not mentioned keep their spot.
 * If any position is invalid or overlaps, nothing changes: the board is never left half-saved.
 */
export function applyBoard(pieces: Piece[], layout: Layout): Piece[] {
  const next = pieces.map((p) => (p.id in layout ? { ...p, placed: layout[p.id] ?? null } : p));
  const checked: Piece[] = [];
  for (const p of next) {
    if (p.placed && !fits(checked, p.kind, p.placed)) return pieces;
    checked.push(p);
  }
  return next.map((p) => (p.placed ? { ...p, placed: copy(p.placed) } : p));
}

/** The layout of a board, as the editor sends it. */
export function layoutOf(pieces: readonly Piece[]): Layout {
  return Object.fromEntries(pieces.map((p) => [p.id, p.placed]));
}
