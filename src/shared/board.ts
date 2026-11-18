import { backgroundScene, floorOf, floorsOf, sceneOfPiece, shapeSize, viewOf } from '../core/board.js';
import type { Point } from '../core/perspective.js';
import { blinkOf, hangs, homeOf, layerOf, lookSize, topOf } from '../core/scenes.js';
import type { AppData, PieceKind, Placed, Placement } from '../core/types.js';
import { isDevBuild } from '../platform/env.js';
import { projection, type Projection } from './scene.js';

/**
 * Scene drawing shared by every page: the scene's picture, and the characters placed in it standing on
 * its floors in perspective. Each is as big as its drawing says (in cell widths at that depth); closer ones
 * are bigger and are drawn later, so they cover the ones behind. Scenery props sort among them the same way.
 * Pieces that take no room (a rug, an arch) go behind whoever shares their row; a flower box goes in front.
 * Characters that blink get their closed-eyes piece on top, shown for a moment by CSS alone (base.css):
 * each one at its own pace, so nothing runs in JavaScript.
 */

/** Characters stand a little inside the front edge of their cells, not on the line itself. */
const FEET = 0.15;

export const artUrl = (kind: PieceKind) => `${projection(homeOf(kind)).art}${kind}.webp`;

/** The floor cell of a scene under a point of its drawing (for the editor). */
export function cellAtPicture(scene: number, px: number, py: number): { floor: number; x: number; y: number } | null {
  return projection(scene).cellAt(px, py);
}

const n = (v: number) => Math.round(v * 10) / 10;
const poly = (pts: readonly Point[]) => pts.map(([x, y]) => `${n(x)},${n(y)}`).join(' ');

/** The area of a rectangle of cells of one floor, as a polygon in the picture. */
function area(view: Projection, f: number, x: number, y: number, w: number, h: number): string {
  const t = view.floors[f]!.toPicture;
  return poly([t(x, y), t(x + w, y), t(x + w, y + h), t(x, y + h)]);
}

/** Where a character's feet touch its floor, in picture pixels: left and right ends of its cells. */
function feet(view: Projection, kind: PieceKind, at: Placement): [Point, Point] {
  const { w, h } = shapeSize(kind);
  const t = view.floors[floorOf(at)]!.toPicture;
  return [t(at.x, at.y + h - FEET), t(at.x + w, at.y + h - FEET)];
}

/** Where a character is drawn, and its drawing order. */
interface Spot {
  left: number;
  top: number;
  width: number;
  height: number;
  /** Width of one cell where it stands, for whoever stands on top of it. */
  cell: number;
  depth: number;
}

/** A drawing of `kind` whose feet are at (x, y), `cell` px per cell; hanging ones hang below that point. */
function spotAt(kind: PieceKind, x: number, y: number, cell: number, hanging: boolean, depth: number): Spot {
  const look = lookSize(kind);
  const width = look.w * cell;
  const height = look.h * cell;
  return { left: x - width / 2, top: hanging ? y : y - height, width, height, cell, depth };
}

/**
 * Where a placed character goes. On a floor: near the front edge of its cells, at its drawing's size, ordered by
 * the picture row of its feet (right after the prop that holds the floor, if any). On top of another character:
 * standing at that one's `top` height, at its scale, drawn just after it.
 */
function spotOf(
  view: Projection,
  pieces: readonly Placed[],
  kind: PieceKind,
  at: Placement,
  seen = 0,
): Spot | null {
  if (at.on !== undefined) {
    const base = pieces.find((p) => p.id === at.on);
    const top = base ? topOf(base.kind) : undefined;
    if (!base?.placed || top === undefined || seen > pieces.length) return null;
    const below = spotOf(view, pieces, base.kind, base.placed, seen + 1);
    if (!below) return null;
    return spotAt(kind, below.left + below.width / 2, below.top + below.height * top, below.cell, false, below.depth + 0.001);
  }
  const floor = view.scene.floors[floorOf(at)];
  if (!floor) return null;
  const { w } = shapeSize(kind);
  const [[lx, ly], [rx, ry]] = feet(view, kind, at);
  const y = (ly + ry) / 2;
  const ground = floor.depth ?? y;
  const depth = floor.over === undefined ? ground : view.scene.props[floor.over]!.base + 0.5 + y / 10000;
  const hanging = floor.hang === true && hangs(kind);
  return spotAt(kind, (lx + rx) / 2, y, Math.hypot(rx - lx, ry - ly) / w, hanging, depth);
}

/** Placement order for drawing; someone standing on another piece is always right above it. */
function orderOf(pieces: readonly Placed[], piece: Placed, hops = 0): number {
  const on = piece.placed?.on;
  if (on === undefined || hops > pieces.length) return piece.placed?.z ?? 0;
  const base = pieces.find((p) => p.id === on);
  return base ? orderOf(pieces, base, hops + 1) + 0.001 : 0;
}

/** A small number from a piece id, the same on every page, to give each character its own blinking pace. */
function seedOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * The closed eyes of a character that blinks, over its drawing. It shows for a moment every 35 to 55 seconds
 * (sometimes twice in a row), starting at a different point for each one.
 */
function eyes(kind: PieceKind, id: string, spot: Spot): string {
  const at = blinkOf(kind);
  if (!at || !id) return '';
  const look = lookSize(kind);
  // The drawing keeps its proportions inside the spot, centred and standing on its bottom edge.
  const k = Math.min(spot.width / look.w, spot.height / look.h);
  const w = look.w * k;
  const h = look.h * k;
  const x0 = spot.left + (spot.width - w) / 2;
  const y0 = spot.top + spot.height - h;
  const seed = seedOf(id);
  const every = 35 + (seed % 21);
  const delay = -((seed >>> 8) % (every * 10)) / 10;
  const twice = (seed >>> 16) % 3 === 0 ? ' twice' : '';
  const [bx = 0, by = 0, bw = 1, bh = 1] = at;
  return `<image class="blink${twice}" href="${artUrl(kind).replace(/\.webp$/, '-ojos.webp')}" x="${n(x0 + bx * w)}" y="${n(y0 + by * h)}" width="${n(bw * w)}" height="${n(bh * h)}" preserveAspectRatio="none" style="animation-duration:${every}s;animation-delay:${delay}s"></image>`;
}

function sprite(kind: PieceKind, flip: boolean, spot: Spot, cls: string, attrs = '', id = ''): string {
  const { left, top, width, height } = spot;
  const mirror = flip ? ` transform="matrix(-1 0 0 1 ${n(2 * left + width)} 0)"` : '';
  const image = `<image class="${cls}" href="${artUrl(kind)}" x="${n(left)}" y="${n(top)}" width="${n(width)}" height="${n(height)}" preserveAspectRatio="xMidYMax meet"${attrs}></image>`;
  const closed = eyes(kind, id, spot);
  return closed ? `<g${mirror}>${image}${closed}</g>` : image.replace('<image ', `<image${mirror} `);
}

/** At the same depth: rugs and arches first, then everyone else by placement order, then flower boxes. */
const LAYER_ORDER = { back: -1e9, room: 0, front: 1e9 } as const;

export interface BoardExtras {
  /** Which scene to draw (index); by default the first. */
  scene?: number;
  /** Piece being moved: drawn faded in its old spot. */
  liftedId?: string | null;
  /** Where the moving piece would land. */
  ghost?: { kind: PieceKind; placement: Placement; ok: boolean } | null;
  /** Keyboard cursor, shown only while editing. */
  cursor?: { floor: number; x: number; y: number } | null;
  /** 'cover' fills the screen as a backdrop; 'contain' shows the whole scene (editing). */
  fit?: 'cover' | 'contain';
}

/** Pieces of one scene (`viewOf`), drawn in it. */
export function boardSvg(pieces: readonly Placed[], extras: BoardExtras = {}): string {
  const index = extras.scene ?? 0;
  const view = projection(index);
  const { scene, art } = view;
  const out: string[] = [
    `<image class="scene" href="${art}fondo.webp" x="0" y="0" width="${scene.width}" height="${scene.height}"></image>`,
  ];
  floorsOf(index).forEach(({ cols, rows, blocked }, f) => {
    const taken = new Set(blocked.map((c) => c.join()));
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (!taken.has(`${x},${y}`)) out.push(`<polygon class="cell" points="${area(view, f, x, y, 1, 1)}"></polygon>`);
      }
    }
  });
  const g = extras.ghost;
  if (g && g.placement.on === undefined) {
    const { w, h } = shapeSize(g.kind);
    const { x, y } = g.placement;
    out.push(
      `<polygon class="spot${g.ok ? '' : ' no-fit'}" points="${area(view, floorOf(g.placement), x, y, w, h)}"></polygon>`,
    );
  }
  const c = extras.cursor;
  if (c) out.push(`<polygon class="cursor" points="${area(view, c.floor, c.x, c.y, 1, 1)}"></polygon>`);

  // Back to front: whoever stands closer is drawn later and covers the rest.
  type Item = { depth: number; svg: string };
  type Ordered = Item & { z?: number };
  const items: Ordered[] = scene.props.map((p) => ({
    depth: p.base,
    svg: `<image class="prop" href="${art}objeto-${p.name}.webp" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}"></image>`,
  }));
  for (const p of pieces) {
    if (!p.placed || sceneOfPiece(pieces, p) !== index) continue;
    const spot = spotOf(view, pieces, p.kind, p.placed);
    if (!spot) continue;
    const lifted = p.id === extras.liftedId ? ' lifted' : '';
    items.push({
      depth: spot.depth,
      z: orderOf(pieces, p) + LAYER_ORDER[layerOf(p.kind) ?? 'room'],
      svg: sprite(p.kind, p.placed.flip, spot, `piece${lifted}`, ` data-piece="${p.id}"`, lifted ? '' : p.id),
    });
  }
  const ghostSpot = g ? spotOf(view, pieces, g.kind, g.placement) : null;
  if (g && ghostSpot) {
    items.push({
      depth: ghostSpot.depth + 0.0005,
      z: Number.MAX_SAFE_INTEGER / 2 + LAYER_ORDER[layerOf(g.kind) ?? 'room'],
      svg: sprite(g.kind, g.placement.flip, ghostSpot, `ghost${g.ok ? '' : ' no-fit'}`),
    });
  }
  // Back to front by depth; at the same depth (same row, same tree or rope) the last one placed goes in front.
  // Pieces standing on another one keep their small offset above it, so they stay on top of their base.
  const band = (d: number) => Math.round(d);
  items.sort((a, b) => band(a.depth) - band(b.depth) || (a.z ?? -1) - (b.z ?? -1) || a.depth - b.depth);
  out.push(...items.map((i) => i.svg));

  const fit = extras.fit === 'contain' ? 'xMidYMid meet' : 'xMidYMid slice';
  return `<svg class="board" viewBox="0 0 ${scene.width} ${scene.height}" preserveAspectRatio="${fit}">${out.join('')}</svg>`;
}

/** Small picture of a character, for the tray. */
export function pieceThumb(kind: PieceKind): string {
  const { w, h } = shapeSize(kind);
  const unit = 40 / Math.max(w, h);
  return `<img class="mini" src="${artUrl(kind)}" alt="" width="${Math.round(w * unit)}" height="${Math.round(h * unit)}" draggable="false">`;
}

let lastKey = '';

/** The scene chosen in settings (every scene is available in development builds). */
export function sceneToShow(data: Pick<AppData, 'pieces' | 'settings'>): number {
  return backgroundScene(data, isDevBuild());
}

/** Draws the chosen scene behind the page. */
export function mountScene(data: Pick<AppData, 'pieces' | 'settings'>): void {
  const scene = sceneToShow(data);
  mountBackground(viewOf(data.pieces, scene), { scene });
}

/** Draws a scene behind the page (or, while editing, with the editor extras). Cheap to call often. */
export function mountBackground(pieces: readonly Placed[], extras: BoardExtras = {}): void {
  const host = document.querySelector<HTMLElement>('.board-bg');
  if (!host) return;
  const key = JSON.stringify([pieces, extras]);
  if (key === lastKey) return;
  lastKey = key;
  host.innerHTML = boardSvg(pieces, extras);
}
