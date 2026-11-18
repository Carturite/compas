import {
  cellsAt,
  firstFit,
  fits,
  floorOf,
  floorsOf,
  holds,
  layoutOf,
  openScenes,
  placementOf,
  placePiece,
  sceneOfPiece,
  shapeSize,
  unplacePiece,
} from '../core/board.js';
import { castName, sceneData } from '../core/scenes.js';
import { isDevBuild } from '../platform/env.js';
import type { Piece, Placement } from '../core/types.js';
import { send } from '../platform/messaging.js';
import { cellAtPicture, mountBackground, pieceThumb } from '../shared/board.js';
import type { Snapshot } from '../shared/snapshot.js';
import { S } from '../shared/strings.js';

/**
 * Edit mode for the scenes. Only reachable from settings: everywhere else the chosen scene
 * is a soft background. When more than one scene is open, tabs switch between them (the album).
 * The tray is shared: any character can be placed in any scene.
 * Moves are a local draft; only "Guardar" sends the whole board to the background,
 * which validates it, stores it and shares it with other devices.
 */

/** A cell of one floor of the scene being edited (0 = its main ground). */
type CellPos = { floor: number; x: number; y: number };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const host = document.querySelector<HTMLElement>('.board-bg')!;
const editor = $<HTMLDivElement>('editor');
const hint = $<HTMLParagraphElement>('editor-hint');
const tray = $<HTMLDivElement>('tray');
const tabs = $<HTMLDivElement>('scene-tabs');
const rotateBtn = $<HTMLButtonElement>('rotate');
const toTrayBtn = $<HTMLButtonElement>('to-tray');
const saveBtn = $<HTMLButtonElement>('save-board');
const cancelBtn = $<HTMLButtonElement>('cancel-board');

/** Working copy while editing. */
let pieces: Piece[] = [];
let dirty = false;
let editing = false;
let selectedId: string | null = null;
let flip = false;
/** Scene being edited. */
let scene = 0;
let cursor: CellPos = { floor: 0, x: 0, y: 0 };
let pointerInside = false;
/** A character with room on top, under the pointer while holding another one. */
let hoverBase: Piece | null = null;
let keyboard = false;
let message = '';
let onSnapshot: (s: Snapshot) => void = () => undefined;
let onClose: () => void = () => undefined;
let savedPieces: () => Piece[] = () => pieces;

const selected = () => pieces.find((p) => p.id === selectedId) ?? null;
const inScene = (p: Piece) => p.placed !== null && sceneOfPiece(pieces, p) === scene;

function centerOf(floor: number): CellPos {
  const { cols, rows } = floorsOf(scene)[floor]!;
  return { floor, x: Math.floor(cols / 2), y: Math.floor(rows / 2) };
}
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** The selected kitten, roughly centered on the cell under the pointer, kept inside its floor. */
function placementAt(cell: CellPos, piece: Piece): Placement {
  const { w, h } = shapeSize(piece.kind);
  const { cols, rows } = floorsOf(scene)[cell.floor]!;
  return placementOf(
    clamp(cell.x - Math.floor((w - 1) / 2), 0, cols - w),
    clamp(cell.y - Math.floor((h - 1) / 2), 0, rows - h),
    flip,
    cell.floor,
    scene,
  );
}

function pieceAt(cell: CellPos): Piece | null {
  return (
    pieces.find(
      (p) =>
        inScene(p) &&
        p.placed &&
        p.placed.on === undefined &&
        floorOf(p.placed) === cell.floor &&
        cellsAt(p.kind, p.placed).some(([x, y]) => x === cell.x && y === cell.y),
    ) ?? null
  );
}

/** The kitten drawn under the pointer: its head can stick out over cells further back. */
function pieceFromEvent(event: MouseEvent): Piece | null {
  const id = (event.target as Element).closest?.('[data-piece]')?.getAttribute('data-piece');
  return pieces.find((p) => p.id === id) ?? null;
}

function cellFromEvent(event: MouseEvent): CellPos | null {
  const svg = host.querySelector<SVGSVGElement>('svg.board');
  const ctm = svg?.getScreenCTM();
  if (!svg || !ctm) return null;
  // Screen → picture pixels (the CTM includes the fit), then picture → board cell through the perspective.
  const pt = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
  return cellAtPicture(scene, pt.x, pt.y);
}

function draw(): void {
  if (!editing) return;
  const sel = selected();
  const onTop = sel && hoverBase ? { x: 0, y: 0, flip, on: hoverBase.id } : null;
  const showGhost = sel && (pointerInside || keyboard || onTop);
  const placement = sel ? (onTop ?? placementAt(cursor, sel)) : null;
  mountBackground(pieces, {
    scene,
    liftedId: sel?.placed ? sel.id : null,
    ghost:
      showGhost && placement
        ? { kind: sel.kind, placement, ok: fits(pieces, sel.kind, placement, sel.id) }
        : null,
    cursor: keyboard ? cursor : null,
    fit: 'contain',
  });
  hint.textContent =
    message || (sel ? S.pieces.hintSelected : dirty ? S.pieces.unsaved : S.pieces.hint);
  rotateBtn.disabled = !sel;
  toTrayBtn.disabled = !sel?.placed;
}

function drawTabs(): void {
  const open = openScenes(pieces, isDevBuild());
  tabs.hidden = open.length < 2;
  tabs.innerHTML = open
    .map(
      (s) =>
        `<button type="button" role="tab" class="chip" data-scene="${s}" aria-selected="${s === scene}">${sceneData(s).name}</button>`,
    )
    .join('');
}

function drawTray(): void {
  const waiting = pieces.filter((p) => !p.placed);
  $('tray-label').textContent = `${S.pieces.tray} · ${waiting.length}`;
  tray.innerHTML = waiting.length
    ? waiting
        .map(
          (p) =>
            `<button type="button" data-id="${p.id}" aria-pressed="${p.id === selectedId}" aria-label="${castName(p.kind)}" title="${castName(p.kind)}">${pieceThumb(p.kind)}</button>`,
        )
        .join('')
    : `<span class="small muted">${S.pieces.trayEmpty}</span>`;
}

function select(piece: Piece | null): void {
  selectedId = piece?.id ?? null;
  flip = piece?.placed?.flip ?? false;
  message = '';
  drawTray();
  draw();
}

async function act(cell: CellPos, drawn: Piece | null = null): Promise<void> {
  const sel = selected();
  const hit = (sel ? null : drawn) ?? pieceAt(cell);
  if (!sel || (hit && hit.id !== sel.id && !fits(pieces, sel.kind, placementAt(cell, sel), sel.id))) {
    // Nothing in hand, or tapping another kitten: pick that one up.
    if (hit) select(hit);
    return;
  }
  const placement = placementAt(cell, sel);
  if (!fits(pieces, sel.kind, placement, sel.id)) {
    message = S.pieces.noFit;
    draw();
    return;
  }
  pieces = placePiece(pieces, sel.id, placement);
  selectedId = null;
  message = '';
  dirty = true;
  drawTray();
  draw();
}

/** Mirrors the kitten in hand so it faces the other way. */
function rotate(): void {
  if (!selected()) return;
  flip = !flip;
  message = '';
  draw();
}

function sendToTray(): void {
  const sel = selected();
  if (!sel?.placed) return;
  pieces = unplacePiece(pieces, sel.id);
  selectedId = null;
  dirty = true;
  drawTray();
  draw();
}

async function save(): Promise<void> {
  saveBtn.disabled = true;
  const snap = await send({ type: 'saveBoard', layout: layoutOf(pieces) });
  saveBtn.disabled = false;
  onSnapshot(snap);
  close();
}

host.addEventListener('pointermove', (event) => {
  if (!editing) return;
  const cell = cellFromEvent(event);
  pointerInside = cell !== null;
  keyboard = false;
  if (cell) cursor = cell;
  const sel = selected();
  const drawn = pieceFromEvent(event);
  hoverBase = sel && drawn && drawn.id !== sel.id && holds(drawn.kind) ? drawn : null;
  draw();
});

host.addEventListener('pointerleave', () => {
  pointerInside = false;
  hoverBase = null;
  draw();
});

host.addEventListener('click', (event) => {
  if (!editing) return;
  const drawn = pieceFromEvent(event);
  const cell = cellFromEvent(event);
  const sel = selected();
  if (sel && drawn && drawn.id !== sel.id && holds(drawn.kind)) putOnTop(sel, drawn);
  else if (!sel && drawn) select(drawn);
  else if (cell) void act(cell);
});

/** Puts the piece in hand on top of a character with room for it (a table, a drum, a hat). */
function putOnTop(sel: Piece, base: Piece): void {
  const placement: Placement = { x: 0, y: 0, flip, on: base.id };
  if (!fits(pieces, sel.kind, placement, sel.id)) {
    message = S.pieces.noFit;
    draw();
    return;
  }
  pieces = placePiece(pieces, sel.id, placement);
  selectedId = null;
  hoverBase = null;
  message = '';
  dirty = true;
  drawTray();
  draw();
}

host.addEventListener('contextmenu', (event) => {
  if (!editing) return;
  event.preventDefault();
  rotate();
});

host.addEventListener('keydown', (event) => {
  if (!editing) return;
  const moves: Record<string, { x: number; y: number }> = {
    ArrowLeft: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
    ArrowUp: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 },
  };
  const move = moves[event.key];
  if (move) {
    keyboard = true;
    const { cols, rows } = floorsOf(scene)[cursor.floor]!;
    cursor = {
      floor: cursor.floor,
      x: clamp(cursor.x + move.x, 0, cols - 1),
      y: clamp(cursor.y + move.y, 0, rows - 1),
    };
    draw();
  } else if (event.key === 'f' || event.key === 'F') {
    // Next floor: ground, stage, platform, benches…
    keyboard = true;
    cursor = centerOf((cursor.floor + 1) % floorsOf(scene).length);
    draw();
  } else if (event.key === 'Enter' || event.key === ' ') {
    keyboard = true;
    void act(cursor);
  } else if (event.key === 'r' || event.key === 'R') {
    rotate();
  } else if (event.key === 'Delete' || event.key === 'Backspace') {
    sendToTray();
  } else if (event.key === 'Escape') {
    if (selectedId) select(null);
  } else {
    return;
  }
  event.preventDefault();
});

tabs.addEventListener('click', (event) => {
  const btn = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-scene]');
  if (!btn) return;
  showScene(Number(btn.dataset.scene));
});

/** Switches the album to another scene. Moves made in the draft are kept. */
function showScene(next: number): void {
  scene = next;
  selectedId = null;
  message = '';
  cursor = centerOf(0);
  drawTabs();
  drawTray();
  draw();
}

tray.addEventListener('click', (event) => {
  const btn = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-id]');
  if (!btn) return;
  const piece = pieces.find((p) => p.id === btn.dataset.id) ?? null;
  select(piece && piece.id !== selectedId ? piece : null);
});

document.addEventListener('keydown', (event) => {
  // R flips from anywhere in edit mode, e.g. right after picking from the tray.
  if (editing && (event.key === 'r' || event.key === 'R') && event.target !== host) rotate();
});

rotateBtn.addEventListener('click', rotate);
toTrayBtn.addEventListener('click', sendToTray);
saveBtn.addEventListener('click', () => void save());
cancelBtn.addEventListener('click', () => close());

export function isEditing(): boolean {
  return editing;
}

export function setupEditor(handlers: {
  onSnapshot: (s: Snapshot) => void;
  onClose: () => void;
  saved: () => Piece[];
}): void {
  onSnapshot = handlers.onSnapshot;
  onClose = handlers.onClose;
  savedPieces = handlers.saved;
  rotateBtn.textContent = `${S.pieces.rotate} (R)`;
  toTrayBtn.textContent = S.pieces.toTray;
  saveBtn.textContent = S.pieces.save;
  cancelBtn.textContent = S.pieces.cancel;
}

export function updateEditor(next: Piece[]): void {
  if (!editing) {
    pieces = next;
    return;
  }
  // A piece earned meanwhile (another tab or device) joins the draft without undoing its moves.
  const known = new Set(pieces.map((p) => p.id));
  for (const p of next) {
    if (known.has(p.id)) continue;
    const placed =
      p.placed && fits(pieces, p.kind, p.placed) ? p.placed : firstFit(pieces, p.kind, scene);
    pieces = [...pieces, { ...p, placed }];
  }
  if (selectedId && !selected()) selectedId = null;
  drawTabs();
  drawTray();
  draw();
}

/** Opens edit mode on a scene (the one in the background). */
export function open(current: Piece[], startScene: number): void {
  editing = true;
  pieces = current;
  selectedId = null;
  message = '';
  dirty = false;
  document.body.classList.add('editing');
  editor.hidden = false;
  host.removeAttribute('aria-hidden');
  host.tabIndex = 0;
  host.setAttribute('role', 'application');
  host.setAttribute('aria-label', S.pieces.boardLabel);
  showScene(startScene);
  host.focus();
}

/** Leaves edit mode. Unsaved moves are dropped; the page draws its background scene again (onClose). */
export function close(saved: Piece[] = savedPieces()): void {
  editing = false;
  dirty = false;
  pieces = saved;
  selectedId = null;
  keyboard = false;
  document.body.classList.remove('editing');
  editor.hidden = true;
  host.setAttribute('aria-hidden', 'true');
  host.removeAttribute('tabindex');
  host.removeAttribute('role');
  host.removeAttribute('aria-label');
  onClose();
}
