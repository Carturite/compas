import { backgroundScene, floorOf, floorsOf, sceneAt, shapeSize } from '../core/board.js';
import type { Point } from '../core/perspective.js';
import { homeOf, lookSize } from '../core/scenes.js';
import type { AppData, Piece, PieceKind, Placement } from '../core/types.js';
import { isDevBuild } from '../platform/env.js';
import { projection, type Projection } from './scene.js';

/**
 * Scene drawing shared by every page: the scene's picture, and the characters placed in it standing on
 * its floors in perspective. Each is as big as its drawing says (in cell widths at that depth); closer ones
 * are bigger and are drawn later, so they cover the ones behind. Scenery props sort among them the same way.
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

/**
 * Drawing order: the picture row of the feet. A character on a raised floor goes right after the prop
 * that holds it (bench, platform), so it sits on top of it instead of behind.
 */
function depth(view: Projection, kind: PieceKind, at: Placement): number {
  const [[, ly], [, ry]] = feet(view, kind, at);
  const y = (ly + ry) / 2;
  const over = view.scene.floors[floorOf(at)]!.over;
  return over === undefined ? y : view.scene.props[over]!.base + 0.5 + y / 10000;
}

/** A character standing near the front edge of its cells, centered on them, at its drawing's size. */
function sprite(view: Projection, kind: PieceKind, at: Placement, cls: string, attrs = ''): string {
  const { w } = shapeSize(kind);
  const look = lookSize(kind);
  const [[lx, ly], [rx, ry]] = feet(view, kind, at);
  const cell = Math.hypot(rx - lx, ry - ly) / w;
  const width = look.w * cell;
  const height = look.h * cell;
  const left = (lx + rx) / 2 - width / 2;
  const top = (ly + ry) / 2 - height;
  const mirror = at.flip ? ` transform="matrix(-1 0 0 1 ${n(2 * left + width)} 0)"` : '';
  return `<image class="${cls}" href="${artUrl(kind)}" x="${n(left)}" y="${n(top)}" width="${n(width)}" height="${n(height)}" preserveAspectRatio="xMidYMax meet"${mirror}${attrs}></image>`;
}

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

export function boardSvg(pieces: readonly Piece[], extras: BoardExtras = {}): string {
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
  if (g) {
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
  const items: Item[] = scene.props.map((p) => ({
    depth: p.base,
    svg: `<image class="prop" href="${art}objeto-${p.name}.webp" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}"></image>`,
  }));
  for (const p of pieces) {
    if (!p.placed || sceneAt(p.placed) !== index) continue;
    const lifted = p.id === extras.liftedId ? ' lifted' : '';
    items.push({
      depth: depth(view, p.kind, p.placed),
      svg: sprite(view, p.kind, p.placed, `piece${lifted}`, ` data-piece="${p.id}"`),
    });
  }
  if (g) {
    items.push({
      depth: depth(view, g.kind, g.placement) + 0.01,
      svg: sprite(view, g.kind, g.placement, `ghost${g.ok ? '' : ' no-fit'}`),
    });
  }
  items.sort((a, b) => a.depth - b.depth);
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
  mountBackground(data.pieces, { scene: sceneToShow(data) });
}

/** Draws a scene behind the page (or, while editing, with the editor extras). Cheap to call often. */
export function mountBackground(pieces: readonly Piece[], extras: BoardExtras = {}): void {
  const host = document.querySelector<HTMLElement>('.board-bg');
  if (!host) return;
  const key = JSON.stringify([pieces, extras]);
  if (key === lastKey) return;
  lastKey = key;
  host.innerHTML = boardSvg(pieces, extras);
}
