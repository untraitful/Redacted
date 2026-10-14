import type { VaultEntry } from '../engine/vault';
import type { Request, VaultState } from '../shared/messages';

// Vault per tab + host in storage.session (RAM-backed, cleared when the browser closes).
const keyFor = (tabId: number, host: string) => `vault:${tabId}:${host}`;
const empty = (): VaultState => ({ entries: [], allowed: [] });

// Serialize read-modify-write so concurrent messages don't drop entries.
let queue: Promise<unknown> = Promise.resolve();
const serial = <T>(fn: () => Promise<T>): Promise<T> => {
  const next = queue.then(fn, fn);
  queue = next.catch(() => {});
  return next;
};

async function read(key: string): Promise<VaultState> {
  const r = await chrome.storage.session.get(key);
  return (r[key] as VaultState | undefined) ?? empty();
}

const isEntry = (e: unknown): e is VaultEntry =>
  !!e && typeof e === 'object' && ['placeholder', 'value', 'label'].every((k) => typeof (e as Record<string, unknown>)[k] === 'string');

async function handle(req: Request, key: string): Promise<unknown> {
  switch (req.type) {
    case 'vault:get':
      return read(key);
    case 'vault:put': {
      if (!Array.isArray(req.entries) || !req.entries.every(isEntry)) return false;
      const state = await read(key);
      const byValue = new Map(state.entries.map((e) => [e.value, e]));
      for (const e of req.entries) byValue.set(e.value, e);
      await chrome.storage.session.set({ [key]: { ...state, entries: [...byValue.values()] } });
      return true;
    }
    case 'vault:allow': {
      if (!Array.isArray(req.values) || !req.values.every((v) => typeof v === 'string')) return false;
      const state = await read(key);
      await chrome.storage.session.set({ [key]: { ...state, allowed: [...new Set([...state.allowed, ...req.values])] } });
      return true;
    }
    case 'vault:clear':
      await chrome.storage.session.remove(key);
      return true;
    default:
      return false;
  }
}

chrome.runtime.onMessage.addListener((req: Request, sender, sendResponse) => {
  // Only our own content scripts, and only from a tab.
  if (sender.id !== chrome.runtime.id || sender.tab?.id === undefined || !sender.url) return;
  const key = keyFor(sender.tab.id, new URL(sender.url).host);
  serial(() => handle(req, key)).then(sendResponse, () => sendResponse(false));
  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void serial(async () => {
    const all = await chrome.storage.session.get(null);
    const stale = Object.keys(all).filter((k) => k.startsWith(`vault:${tabId}:`));
    if (stale.length) await chrome.storage.session.remove(stale);
  });
});
