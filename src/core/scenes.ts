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
  /** A peg, rope or bar: characters that hang (`hang` in the cast) hang below it instead of standing on it. */
  hang?: boolean;
  /** Picture row where the object holding this spot stands (a tree, a rope): its drawing order, whatever its height. */
  depth?: number;
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
  cast: readonly {
    id: string;
    w: number;
    sw: number;
    sh: number;
    name: string;
    /** Another character can stand on it, at this height of its drawing (0 = top edge, 1 = feet). */
    top?: number;
    /** Hangs from its feet on hanging floors. */
    hang?: boolean;
  }[];
}

export { SCENES };

export type CastId = (typeof SCENES)[number]['cast'][number]['id'];

const ALL: readonly SceneData[] = SCENES;
const INFO = new Map<string, { scene: number; w: number; sw: number; sh: number; name: string; top?: number; hang?: boolean }>();
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

/** Height on its drawing where another character can stand (0 = top), or undefined if nothing fits on it. */
export function topOf(kind: CastId): number | undefined {
  return INFO.get(kind)!.top;
}

export function hangs(kind: CastId): boolean {
  return INFO.get(kind)!.hang === true;
}

export function castName(kind: CastId): string {
  return INFO.get(kind)!.name;
}

export function castOf(scene: number): readonly CastId[] {
  return ALL[scene]!.cast.map((c) => c.id as CastId);
}
