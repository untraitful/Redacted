import type { CustomSite } from './settings';

/** Optional sites that are too broad for default host permissions; enabled like custom sites. */
export const OPTIONAL_SITES: Array<{ host: string; name: string; why: string }> = [
  { host: 'x.com', name: 'Grok on X', why: 'Grok runs inside x.com, so this grants access to all of X.' },
  { host: 'github.com', name: 'GitHub Copilot chat', why: 'Copilot chat runs inside github.com, so this grants access to all of GitHub.' },
];

export const originFor = (host: string) => `https://${host}/*`;
const scriptId = (host: string) => `site:${host}`;

/**
 * Ask for the host permission. Must be the first await in a click handler: browsers only show the
 * prompt during a user gesture.
 */
export function requestSite(host: string): Promise<boolean> {
  return chrome.permissions.request({ origins: [originFor(host)] });
}

export async function registerSite(host: string): Promise<void> {
  const id = scriptId(host);
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [id] });
  if (existing.length) return;
  await chrome.scripting.registerContentScripts([
    { id, matches: [originFor(host)], js: ['content.js'], runAt: 'document_start', persistAcrossSessions: true },
  ]);
}

export async function removeSite(host: string): Promise<void> {
  const id = scriptId(host);
  if ((await chrome.scripting.getRegisteredContentScripts({ ids: [id] })).length)
    await chrome.scripting.unregisterContentScripts({ ids: [id] });
  await chrome.permissions.remove({ origins: [originFor(host)] }).catch(() => false);
}

/** Re-register scripts for sites we still hold permission for (persistence varies by browser). */
export async function syncSites(sites: CustomSite[]): Promise<void> {
  const hosts = [...new Set([...sites.map((s) => s.host), ...OPTIONAL_SITES.map((s) => s.host)])];
  for (const host of hosts) {
    if (await chrome.permissions.contains({ origins: [originFor(host)] })) await registerSite(host).catch(() => {});
  }
}
