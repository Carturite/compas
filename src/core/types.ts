import type { CastId } from './scenes.js';

export type ProfileId = 'gentle' | 'medium' | 'deep';

export interface Profile {
  id: ProfileId;
  focusMinutes: number;
  breakMinutes: number;
}

export interface Settings {
  /** Minutes the person wants to dedicate per day. 0 = not configured yet. */
  dailyMinutes: number;
  profile: ProfileId;
  blockedSites: string[];
  strictMode: boolean;
  strictWaitMinutes: number;
  /** Share history, pieces and settings through the browser's own sync. Per device, never synced itself. */
  syncEnabled: boolean;
  /** Scene id shown behind the pages, where new characters arrive. */
  scene: string;
}

export type State =
  | { kind: 'idle'; remindAt?: number }
  | { kind: 'focus'; startedAt: number; endsAt: number; profile: ProfileId }
  | { kind: 'break'; startedAt: number; endsAt: number }
  | { kind: 'waiting'; startedAt: number; endsAt: number };

export type StateKind = State['kind'];

export type Outcome = 'completed' | 'cancelled' | 'postponed';

export interface SessionRecord {
  at: number;
  /** ISO local date, YYYY-MM-DD */
  day: string;
  outcome: Outcome;
  profile: ProfileId;
  focusedMinutes: number;
}

/** Which character a piece is; it also tells its scene. See core/scenes.ts. */
export type PieceKind = CastId;

/**
 * Top-left cell of the piece on a floor of a scene; `flip` mirrors the drawing to face the other way.
 * `floor` is an index into its scene's floors (core/scenes.ts); absent means the main ground.
 */
export interface Placement {
  x: number;
  y: number;
  flip: boolean;
  floor?: number;
  /** Scene id (core/scenes.ts); absent means the garden, where everything lived before scenes. */
  scene?: string;
  /** Standing on top of another piece (its id) that has room on top: then x, y and floor follow that piece. */
  on?: string;
  /** Placement order: higher = placed later. Among pieces at the same depth, the last one placed is drawn in front. */
  z?: number;
}

/**
 * One piece earned by completing a focus session. It can stand once in every scene: `spots` holds at most one
 * placement per scene (each says its scene). A scene without a spot for it shows it in that scene's tray.
 */
export interface Piece {
  id: string;
  kind: PieceKind;
  earnedAt: number;
  spots: Placement[];
}

/** A piece as seen in one scene: where it stands there, or null while it waits in that scene's tray. */
export interface Placed {
  id: string;
  kind: PieceKind;
  earnedAt: number;
  placed: Placement | null;
}

export interface AppData {
  version: 1;
  settings: Settings;
  state: State;
  history: SessionRecord[];
  pieces: Piece[];
  /** When synced parts last changed on this device, for "last edit wins" when merging. */
  stamps: Stamps;
}

export interface Stamps {
  settings: number;
  board: number;
}

/** Versioned message protocol shared by extension pages, background and (stage 2) native host. */
export type Command =
  | { type: 'start' }
  | { type: 'cancel' }
  | { type: 'postpone'; minutes: number }
  | { type: 'endBreak' }
  | { type: 'getSnapshot' }
  | { type: 'saveSettings'; settings: Partial<Settings> }
  /** The editor's "Guardar": every piece position at once, per scene id. */
  | { type: 'saveBoard'; layouts: Record<string, Record<string, Placement | null>> };

export interface Message<T = Command> {
  v: 1;
  payload: T;
}
