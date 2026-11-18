import type { Command, Message } from '../core/types.js';
import type { Snapshot } from '../shared/snapshot.js';

export function wrap(payload: Command): Message {
  return { v: 1, payload };
}

export function isMessage(value: unknown): value is Message {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { v?: unknown }).v === 1 &&
    typeof (value as { payload?: { type?: unknown } }).payload?.type === 'string'
  );
}

/** Sends a command to the background and returns the fresh snapshot. */
export function send(payload: Command): Promise<Snapshot> {
  return chrome.runtime.sendMessage<Snapshot>(wrap(payload));
}
