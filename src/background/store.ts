import type { VaultEntry } from '../engine/vault';
import type { Request, VaultState } from '../shared/messages';

/** The slice of chrome.storage.session we use; a Map-backed fake stands in for tests. */
export interface SessionStore {
  get(key: string | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

export const emptyState = (): VaultState => ({ entries: [], allowed: [], count: 0 });

const isEntry = (e: unknown): e is VaultEntry =>
  !!e && typeof e === 'object' && ['placeholder', 'value', 'label'].every((k) => typeof (e as Record<string, unknown>)[k] === 'string');

export function createStore(session: SessionStore) {
  // Serialize read-modify-write so concurrent messages don't drop entries.
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = queue.then(fn, fn);
    queue = next.catch(() => {});
    return next;
  };

  async function read(key: string): Promise<VaultState> {
    const r = await session.get(key);
    return { ...emptyState(), ...(r[key] as Partial<VaultState> | undefined) };
  }

  async function update(key: string, fn: (s: VaultState) => VaultState): Promise<VaultState> {
    const next = fn(await read(key));
    await session.set({ [key]: next });
    return next;
  }

  /** Returns the response for the content script, plus the new state when it changed. */
  async function handle(req: Request, key: string): Promise<unknown> {
    switch (req?.type) {
      case 'vault:get':
        return read(key);
      case 'vault:put':
        if (!Array.isArray(req.entries) || !req.entries.every(isEntry)) return false;
        await update(key, (s) => {
          const byValue = new Map(s.entries.map((e) => [e.value, e]));
          for (const e of req.entries) byValue.set(e.value, e);
          return { ...s, entries: [...byValue.values()] };
        });
        return true;
      case 'vault:allow':
        if (!Array.isArray(req.values) || !req.values.every((v) => typeof v === 'string')) return false;
        await update(key, (s) => ({ ...s, allowed: [...new Set([...s.allowed, ...req.values])] }));
        return true;
      case 'stats:add':
        if (!Number.isInteger(req.n) || req.n < 0 || req.n > 1e6) return false;
        return (await update(key, (s) => ({ ...s, count: s.count + req.n }))).count;
      case 'vault:clear':
        await session.remove(key);
        return true;
      default:
        return false;
    }
  }

  return {
    handle: (req: Request, key: string) => serial(() => handle(req, key)),
    read: (key: string) => serial(() => read(key)),
    /** Drop every vault for a closed tab. */
    dropTab: (tabId: number) => serial(async () => {
      const stale = Object.keys(await session.get(null)).filter((k) => k.startsWith(`vault:${tabId}:`));
      if (stale.length) await session.remove(stale);
    }),
  };
}
