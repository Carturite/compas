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
  /** w: floor cells it takes (1 to 3, one row deep). sw, sh: how big it looks, in cell widths. */
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
    /** Height of its drawing that rests on its cell (0 = top, 1 = bottom, the default): a rug lies on its middle. */
    foot?: number;
    /** A thing (a drum, a rug), not a character: rewards are drawn by kind. */
    object?: boolean;
    /**
     * Takes no room: others can share its cells. 'back' (a rug, an arch) is drawn behind whoever shares its row,
     * 'front' (a flower box) in front of them.
     */
    layer?: 'front' | 'back';
    /** Blinks now and then: where its closed-eyes piece goes (x, y, w, h as fractions of its drawing). */
    blink?: readonly number[];
  }[];
}

export { SCENES };

export type CastId = (typeof SCENES)[number]['cast'][number]['id'];

const ALL: readonly SceneData[] = SCENES;
type CastInfo = SceneData['cast'][number] & { scene: number };
const INFO = new Map<string, CastInfo>();
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

/** Floor cells a character takes: 1 to 3 wide, always one row deep. */
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

/** Height of its drawing that rests on its cell: 1 (its bottom edge) except for things lying flat, like rugs. */
export function footOf(kind: CastId): number {
  return INFO.get(kind)!.foot ?? 1;
}

/** A thing (a drum, a rug) rather than a character. */
export function isObject(kind: CastId): boolean {
  return INFO.get(kind)!.object === true;
}

/** Whether it shares its cells, drawn behind ('back') or in front ('front') of whoever stands there. */
export function layerOf(kind: CastId): 'front' | 'back' | undefined {
  return INFO.get(kind)!.layer;
}

/** Where its closed-eyes piece goes on its drawing (fractions), for characters that blink. */
export function blinkOf(kind: CastId): readonly number[] | undefined {
  return INFO.get(kind)!.blink;
}

export function castName(kind: CastId): string {
  return INFO.get(kind)!.name;
}

export function castOf(scene: number): readonly CastId[] {
  return ALL[scene]!.cast.map((c) => c.id as CastId);
}
