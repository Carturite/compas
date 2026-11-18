import { SCENES } from './scenes.gen.js';

/**
 * Scenes (backgrounds with floors) and the characters drawn for them. The data comes from
 * img/escenas/<id>/escena.json through scripts/escenas.py. Characters form one collection:
 * any of them can be placed in any scene. Pure data and lookups; shared/board.ts draws them.
 */

type XY = readonly [number, number];

export interface FloorData {
  id: string;
  cols: number;
  rows: number;
  /** Cells taken by scenery. */
  blocked: readonly XY[];
  /** Picture corners: back-left, back-right, front-right, front-left. */
  ground: readonly [XY, XY, XY, XY];
  /** Index of the prop this floor sits on (bench, platform). */
  over?: number;
}

export interface SceneData {
  id: string;
  name: string;
  /** Characters earned in total that open this scene as a background (0 = open from the start). */
  unlock: number;
  width: number;
  height: number;
  floors: readonly FloorData[];
  props: readonly { name: string; x: number; y: number; w: number; h: number; base: number }[];
  /** w: floor cells it takes (1 or 2, one row deep). sw, sh: how big it looks, in cell widths. */
  cast: readonly { id: string; w: number; sw: number; sh: number; name: string }[];
}

export { SCENES };

export type CastId = (typeof SCENES)[number]['cast'][number]['id'];

const ALL: readonly SceneData[] = SCENES;
const INFO = new Map<string, { scene: number; w: number; sw: number; sh: number; name: string }>();
ALL.forEach((s, scene) => s.cast.forEach((c) => INFO.set(c.id, { scene, ...c })));

export const sceneData = (scene: number): SceneData => ALL[scene]!;

/** Index of a scene by its id, or -1. */
export const sceneIndex = (id: unknown): number => ALL.findIndex((s) => s.id === id);

export function isCastId(id: unknown): id is CastId {
  return typeof id === 'string' && INFO.has(id);
}

/** The scene whose sheets this character was drawn for. */
export function homeOf(kind: CastId): number {
  return INFO.get(kind)!.scene;
}

/** Floor cells a character takes: 1 or 2 wide, always one row deep. */
export function footprint(kind: CastId): { w: number; h: number } {
  return { w: INFO.get(kind)!.w, h: 1 };
}

/** How big a character looks, in cell widths (its drawing keeps its proportions). */
export function lookSize(kind: CastId): { w: number; h: number } {
  const c = INFO.get(kind)!;
  return { w: c.sw, h: c.sh };
}

export function castName(kind: CastId): string {
  return INFO.get(kind)!.name;
}

export function castOf(scene: number): readonly CastId[] {
  return ALL[scene]!.cast.map((c) => c.id as CastId);
}
