export const MINUTE = 60_000;

/** Local calendar day as YYYY-MM-DD. */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Formats remaining milliseconds as m:ss (or h:mm:ss). */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Whole minutes left, rounded up, for the toolbar badge. */
export function minutesLeft(ms: number): number {
  return Math.max(0, Math.ceil(ms / MINUTE));
}

/** Toolbar badge: minutes left with an "m", e.g. "12m". */
export function badgeText(ms: number): string {
  return `${minutesLeft(ms)}m`;
}
