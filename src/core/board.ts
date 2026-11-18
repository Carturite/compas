import { castOf, footprint, isCastId, sceneData, sceneIndex, SCENES, topOf, type FloorData } from './scenes.js';
import type { AppData, Piece, PieceKind, Placement, SessionRecord } from './types.js';

/**
 * The reward board: scenes (a garden, a circus…) where each completed focus session adds a character.
 * Characters are one collection and can be placed in any scene, on any of its floors: the main ground plus
 * raised surfaces (stage, benches, trapezes, pegs). Each takes 1 or 2 cells, one row deep. A few (a table,
 * a drum, a hat) have room on top for one more character, who then moves with them.
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

/** Which scene a placement is in (index, -1 if unknown); absent means the garden. Not for pieces on top of others. */
export const sceneAt = (p: Placement): number => (p.scene === undefined ? GARDEN : sceneIndex(p.scene));

/** The piece at the bottom of a stack (itself when it stands on a floor). Null when the chain is broken. */
export function rootOf(pieces: readonly Piece[], piece: Piece): Piece | null {
  let current: Piece | undefined = piece;
  for (let hops = 0; current?.placed?.on !== undefined; hops++) {
    if (hops > pieces.length) return null;
    const below: string = current.placed.on;
    current = pieces.find((p) => p.id === below);
  }
  return current?.placed ? current : null;
}

/** Scene where a placed piece is shown, following stacks down to the floor; -1 if not placed. */
export function sceneOfPiece(pieces: readonly Piece[], piece: Piece): number {
  const root = rootOf(pieces, piece);
  return root?.placed ? sceneAt(root.placed) : -1;
}

/** Whether another character can stand on this one. */
export const holds = (kind: PieceKind): boolean => topOf(kind) !== undefined;

const key = (scene: number, floor: number, x: number, y: number) => `${scene}/${floor}:${x},${y}`;

const SCENERY = new Set(
  SCENES.flatMap((_, s) => floorsOf(s).flatMap((f, i) => f.blocked.map(([x, y]) => key(s, i, x, y)))),
);

function occupied(pieces: readonly Piece[], exceptId?: string): Set<string> {
  const set = new Set(SCENERY);
  for (const p of pieces) {
    if (!p.placed || p.placed.on !== undefined || p.id === exceptId) continue;
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
export function nextZ(pieces: readonly Piece[]): number {
  return pieces.reduce((top, p) => Math.max(top, p.placed?.z ?? 0), 0) + 1;
}

/**
 * Whether `kind` can stand on the piece `on`: it is placed, has room on top, nobody else is there,
 * and it is not the moving piece itself or something standing on it (no loops).
 */
function fitsOnTop(pieces: readonly Piece[], placement: Placement, exceptId?: string): boolean {
  const base = pieces.find((p) => p.id === placement.on);
  if (!base?.placed || base.id === exceptId || !holds(base.kind) || typeof placement.flip !== 'boolean') return false;
  if (pieces.some((p) => p.id !== exceptId && p.placed?.on === base.id)) return false;
  for (let below: Piece | undefined = base, hops = 0; below?.placed; hops++) {
    if (below.id === exceptId || hops > pieces.length) return false;
    if (below.placed.on === undefined) return true;
    const next: string = below.placed.on;
    below = pieces.find((p) => p.id === next);
  }
  return false;
}

/** True when the piece stays inside its floor and does not overlap scenery or other pieces of that scene. */
export function fits(
  pieces: readonly Piece[],
  kind: PieceKind,
  placement: Placement,
  exceptId?: string,
): boolean {
  if (placement.on !== undefined) return fitsOnTop(pieces, placement, exceptId);
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
  const used = new Set(pieces.flatMap((p) => (p.placed && p.placed.on === undefined ? [sceneAt(p.placed)] : [])));
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
  if (placed) placed.z = nextZ(pieces);
  return [...pieces, { id: `p${at.toString(36)}-${n.toString(36)}`, kind, earnedAt: at, placed }];
}

/** Moves a piece (from the tray or the board) to a new spot. Unchanged if it does not fit. */
export function placePiece(pieces: Piece[], id: string, placement: Placement): Piece[] {
  const piece = pieces.find((p) => p.id === id);
  if (!piece || !fits(pieces, piece.kind, placement, id)) return pieces;
  // The piece just placed goes in front of everything at its depth.
  const placed = { ...copy(placement), z: nextZ(pieces) };
  return pieces.map((p) => (p.id === id ? { ...p, placed } : p));
}

/** Sends a piece back to the tray, with whoever stands on it. */
export function unplacePiece(pieces: Piece[], id: string): Piece[] {
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
  return keepStacks(out, raw);
}

/** Pieces that stood on another piece: kept when that piece still holds them, otherwise they wait in the tray. */
function keepStacks(out: Piece[], raw: readonly unknown[]): Piece[] {
  const wanted = new Map<string, Placement>();
  for (const item of raw) {
    const p = item as Partial<Piece> | null;
    if (p && typeof p.id === 'string' && p.placed && typeof p.placed.on === 'string') wanted.set(p.id, p.placed);
  }
  for (let grew = true; grew; ) {
    grew = false;
    for (let i = 0; i < out.length; i++) {
      const want = wanted.get(out[i]!.id);
      if (!want || out[i]!.placed) continue;
      const placed = copy(want);
      if (fitsOnTop(out, placed, out[i]!.id)) {
        out[i] = { ...out[i]!, placed };
        grew = true;
      }
    }
  }
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
    const at = p.placed && p.placed.on === undefined ? p.placed : null;
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
  // Floors first, then pieces on top of others (their base must already be checked).
  const checked: Piece[] = [];
  for (const p of next) {
    if (p.placed?.on !== undefined) continue;
    if (p.placed && !fits(checked, p.kind, p.placed)) return pieces;
    checked.push(p);
  }
  let stacked = next.filter((p) => p.placed?.on !== undefined);
  while (stacked.length) {
    const ready = stacked.filter((p) => fitsOnTop(checked, p.placed!, p.id));
    if (!ready.length) return pieces;
    checked.push(...ready);
    stacked = stacked.filter((p) => !ready.includes(p));
  }
  return next.map((p) => (p.placed ? { ...p, placed: copy(p.placed) } : p));
}

/** The layout of a board, as the editor sends it. */
export function layoutOf(pieces: readonly Piece[]): Layout {
  return Object.fromEntries(pieces.map((p) => [p.id, p.placed]));
}
