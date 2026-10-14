import { vaultKey, type Request, type TabMessage } from '../shared/messages';
import { SETTINGS_KEY, sanitizeSettings } from '../shared/settings';
import { syncSites } from '../shared/sites-registry';
import { createStore } from './store';

// Vault per tab + host in storage.session (RAM-backed, cleared when the browser closes).
const store = createStore(chrome.storage.session);

function badge(tabId: number, count: number): void {
  void chrome.action.setBadgeText({ tabId, text: count ? String(count) : '' });
  void chrome.action.setBadgeBackgroundColor({ tabId, color: '#b42318' });
}

chrome.runtime.onMessage.addListener((req: Request, sender, sendResponse) => {
  // Only our own content scripts, and only from a tab.
  if (sender.id !== chrome.runtime.id || sender.tab?.id === undefined || !sender.url) return;
  const tabId = sender.tab.id;
  const key = vaultKey(tabId, new URL(sender.url).host);
  store.handle(req, key).then(
    (res) => {
      // Page (re)load or new redactions: show this host's count for the tab.
      if (req.type === 'stats:add' && typeof res === 'number') badge(tabId, res);
      if (req.type === 'vault:get' && res && typeof res === 'object' && 'count' in res) badge(tabId, res.count as number);
      sendResponse(res);
    },
    () => sendResponse(false),
  );
  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => void store.dropTab(tabId));

chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== 'redact-input') return;
  const send = (id?: number) => id !== undefined && chrome.tabs.sendMessage(id, { type: 'redact-current' } satisfies TabMessage).catch(() => {});
  if (tab?.id !== undefined) void send(tab.id);
  else void chrome.tabs.query({ active: true, currentWindow: true }).then(([t]) => send(t?.id));
});

const resync = () =>
  chrome.storage.local.get(SETTINGS_KEY).then((r) => syncSites(sanitizeSettings(r[SETTINGS_KEY]).customSites)).catch(() => {});
chrome.runtime.onStartup.addListener(() => void resync());
chrome.runtime.onInstalled.addListener(() => void resync());
