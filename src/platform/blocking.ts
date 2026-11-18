export const BLOCKED_PAGE = '/blocked/blocked.html';

/** Match patterns for a domain and all its subdomains. */
export function originsFor(site: string): string[] {
  return [`*://${site}/*`, `*://*.${site}/*`];
}

/** Replaces all dynamic rules with one redirect rule per blocked site. */
export async function applyBlocking(sites: string[]): Promise<void> {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const allowed: string[] = [];
  for (const site of sites) {
    // Redirects need host access; sites without it are skipped instead of failing all rules.
    if (await chrome.permissions.contains({ origins: originsFor(site) })) allowed.push(site);
  }
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map((r) => r.id),
    addRules: allowed.map((site, i) => ({
      id: i + 1,
      priority: 1,
      // Keep the original URL after "#" so the person can return to it once the session ends.
      action: {
        type: 'redirect',
        redirect: { regexSubstitution: `${chrome.runtime.getURL(BLOCKED_PAGE)}#\\0` },
      },
      condition: {
        regexFilter: `^https?://([^/]*\\.)?${escapeRegex(site)}([/:?#].*)?$`,
        requestDomains: [site],
        resourceTypes: ['main_frame'],
      },
    })),
  });
  await sendOpenTabsToBlockedPage(allowed);
}

export async function clearBlocking(): Promise<void> {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  if (existing.length === 0) return;
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: existing.map((r) => r.id) });
}

async function sendOpenTabsToBlockedPage(sites: string[]): Promise<void> {
  if (sites.length === 0) return;
  const tabs = await chrome.tabs.query({ url: sites.flatMap(originsFor) });
  const target = chrome.runtime.getURL(BLOCKED_PAGE);
  await Promise.all(
    tabs
      .filter((t) => t.id !== undefined)
      .map((t) => chrome.tabs.update(t.id!, { url: `${target}#${t.url ?? ''}` })),
  );
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
