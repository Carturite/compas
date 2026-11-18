import { normalizePieces, piecesFromHistory } from '../core/board.js';
import { createInitialData, DEFAULT_SETTINGS } from '../core/config.js';
import type { AppData } from '../core/types.js';

const KEY = 'compaz';

export async function loadData(): Promise<AppData> {
  const raw = (await chrome.storage.local.get(KEY))[KEY] as Partial<AppData> | undefined;
  if (!raw || raw.version !== 1) return createInitialData();
  const history = Array.isArray(raw.history) ? raw.history : [];
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS, ...raw.settings },
    state: raw.state ?? { kind: 'idle' },
    history,
    // Data from before the board existed gets one piece per session already completed.
    pieces: Array.isArray(raw.pieces) ? normalizePieces(raw.pieces) : piecesFromHistory(history),
    stamps: {
      settings: Number(raw.stamps?.settings) || 0,
      board: Number(raw.stamps?.board) || 0,
    },
  };
}

export async function saveData(data: AppData): Promise<void> {
  await chrome.storage.local.set({ [KEY]: data });
}

export function onDataChanged(cb: (data: AppData) => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    const change = changes[KEY];
    if (area === 'local' && change?.newValue) cb(change.newValue as AppData);
  });
}
