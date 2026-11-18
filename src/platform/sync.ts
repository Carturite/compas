import { toChunks } from '../core/sync.js';

/**
 * Browser sync (chrome.storage.sync): free, travels with the person's Chrome account,
 * never through Compaz servers. Limits: ~100 KB total, 8 KB per item, so the text goes in chunks.
 */

const META = 'compaz:meta';
const chunkKey = (i: number) => `compaz:${i}`;

/** The shared text, or null when nothing was shared yet (or it is incomplete). */
export async function readSynced(): Promise<string | null> {
  const all = await chrome.storage.sync.get(null);
  const meta = all[META] as { v?: number; n?: number } | undefined;
  if (!meta || meta.v !== 1 || typeof meta.n !== 'number') return null;
  const parts: string[] = [];
  for (let i = 0; i < meta.n; i++) {
    const part = all[chunkKey(i)];
    if (typeof part !== 'string') return null;
    parts.push(part);
  }
  return parts.join('');
}

export async function writeSynced(text: string): Promise<void> {
  const chunks = toChunks(text);
  const items: Record<string, unknown> = { [META]: { v: 1, n: chunks.length } };
  chunks.forEach((c, i) => (items[chunkKey(i)] = c));
  await chrome.storage.sync.set(items);
  // Drop chunks left over from a longer previous version.
  const all = await chrome.storage.sync.get(null);
  const stale = Object.keys(all).filter((k) => /^compaz:\d+$/.test(k) && Number(k.slice(7)) >= chunks.length);
  if (stale.length) await chrome.storage.sync.remove(stale);
}
