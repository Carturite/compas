import type { AppData, Profile, ProfileId, Settings } from './types.js';

export const PROFILES: Record<ProfileId, Profile> = {
  gentle: { id: 'gentle', focusMinutes: 25, breakMinutes: 5 },
  medium: { id: 'medium', focusMinutes: 50, breakMinutes: 10 },
  deep: { id: 'deep', focusMinutes: 90, breakMinutes: 20 },
};

export const PROFILE_ORDER: ProfileId[] = ['gentle', 'medium', 'deep'];

export const DEFAULT_SITES = ['tiktok.com', 'instagram.com', 'youtube.com', 'twitch.tv'];

export const DEFAULT_SETTINGS: Settings = {
  dailyMinutes: 0,
  profile: 'gentle',
  blockedSites: [...DEFAULT_SITES],
  strictMode: false,
  strictWaitMinutes: 20,
  syncEnabled: true,
  scene: 'jardin',
};

export const HISTORY_LIMIT = 200;

export function createInitialData(): AppData {
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS, blockedSites: [...DEFAULT_SITES] },
    state: { kind: 'idle' },
    history: [],
    pieces: [],
    stamps: { settings: 0, board: 0 },
  };
}
