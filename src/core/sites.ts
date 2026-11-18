/**
 * Normalizes user input like "https://www.YouTube.com/watch?v=1" into "youtube.com".
 * Returns null when the input is not a plausible domain.
 */
export function normalizeSite(input: string): string | null {
  let s = input.trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^[a-z]+:\/\//, '');
  s = s.split(/[/?#]/)[0] ?? '';
  s = s.replace(/:\d+$/, '');
  s = s.replace(/^www\./, '');
  if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(s)) return null;
  return s;
}

/** Parses a free-text list (one per line or comma separated), dropping invalid and duplicates. */
export function parseSiteList(text: string): string[] {
  const out: string[] = [];
  for (const part of text.split(/[\n,]/)) {
    const site = normalizeSite(part);
    if (site && !out.includes(site)) out.push(site);
  }
  return out;
}
