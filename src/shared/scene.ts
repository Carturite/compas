import { apply, invert, squareToQuad, type Homography, type Point } from '../core/perspective.js';
import { sceneData, type SceneData } from '../core/scenes.js';

/**
 * How a scene is laid over its picture: one perspective per floor, from the four corners marked
 * in img/escenas/<id>/escena.json. Every page lives one folder deep, so the art is at ../escenas/<id>/.
 */

export interface FloorView {
  /** Floor cell coordinates (fractions allowed) to picture pixels. */
  toPicture(x: number, y: number): Point;
  /** Picture pixels to the cell of this floor under them, or null outside it. */
  cellAt(px: number, py: number): { x: number; y: number } | null;
}

export interface Projection {
  scene: SceneData;
  /** Folder of the scene's art, relative to any page. */
  art: string;
  floors: readonly FloorView[];
  /** The floor cell under a picture point; raised floors win over the ground below them. */
  cellAt(px: number, py: number): { floor: number; x: number; y: number } | null;
}

function floorView(ground: SceneData['floors'][number]['ground'], cols: number, rows: number): FloorView {
  const m: Homography = squareToQuad(ground);
  const back = invert(m);
  return {
    toPicture: (x, y) => apply(m, x / cols, y / rows),
    cellAt(px, py) {
      const [u, v] = apply(back, px, py);
      const x = Math.floor(u * cols);
      const y = Math.floor(v * rows);
      if (x < 0 || y < 0 || x >= cols || y >= rows) return null;
      return { x, y };
    },
  };
}

const cache = new Map<number, Projection>();

export function projection(index: number): Projection {
  const cached = cache.get(index);
  if (cached) return cached;
  const scene = sceneData(index);
  const floors = scene.floors.map((f) => floorView(f.ground, f.cols, f.rows));
  const view: Projection = {
    scene,
    art: `../escenas/${scene.id}/`,
    floors,
    cellAt(px, py) {
      for (let f = floors.length - 1; f >= 0; f--) {
        const cell = floors[f]!.cellAt(px, py);
        if (cell) return { floor: f, ...cell };
      }
      return null;
    },
  };
  cache.set(index, view);
  return view;
}
