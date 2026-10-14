import { vi } from 'vitest';

/** Just enough of the chrome.* API for the options page and popup. */
export function installFakeChrome(opts: { local?: Record<string, unknown>; session?: Record<string, unknown>; tab?: { id: number; url?: string }; granted?: string[] } = {}) {
  const local = new Map(Object.entries(opts.local ?? {}));
  const session = new Map(Object.entries(opts.session ?? {}));
  const granted = new Set(opts.granted ?? []);
  const scripts = new Map<string, unknown>();
  const area = (m: Map<string, unknown>) => ({
    get: vi.fn(async (k: string | null) => (k === null ? Object.fromEntries(m) : m.has(k) ? { [k]: structuredClone(m.get(k)) } : {})),
    set: vi.fn(async (items: Record<string, unknown>) => { for (const [k, v] of Object.entries(items)) m.set(k, structuredClone(v)); }),
    remove: vi.fn(async (keys: string | string[]) => { for (const k of [keys].flat()) m.delete(k); }),
  });
  const chrome = {
    runtime: { id: 'ext', openOptionsPage: vi.fn() },
    storage: { local: area(local), session: area(session), onChanged: { addListener: vi.fn() } },
    permissions: {
      request: vi.fn(async ({ origins }: { origins: string[] }) => { origins.forEach((o) => granted.add(o)); return true; }),
      contains: vi.fn(async ({ origins }: { origins: string[] }) => origins.every((o) => granted.has(o))),
      remove: vi.fn(async ({ origins }: { origins: string[] }) => { origins.forEach((o) => granted.delete(o)); return true; }),
    },
    scripting: {
      getRegisteredContentScripts: vi.fn(async ({ ids }: { ids: string[] }) => ids.filter((i) => scripts.has(i)).map((id) => scripts.get(id))),
      registerContentScripts: vi.fn(async (list: Array<{ id: string }>) => { for (const s of list) scripts.set(s.id, s); }),
      unregisterContentScripts: vi.fn(async ({ ids }: { ids: string[] }) => { ids.forEach((i) => scripts.delete(i)); }),
    },
    tabs: { query: vi.fn(async () => (opts.tab ? [opts.tab] : [])), sendMessage: vi.fn(async () => undefined) },
    action: { setBadgeText: vi.fn(async () => undefined) },
  };
  (globalThis as unknown as { chrome: typeof chrome }).chrome = chrome;
  return { chrome, local, session, granted, scripts };
}

export const flush = async (n = 5) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0)); };

export function loadPage(html: string): void {
  // Body only, minus scripts: happy-dom would try to fetch the stylesheet and script.
  document.body.innerHTML = /<body[^>]*>([\s\S]*)<\/body>/.exec(html)![1]!.replace(/<script[\s\S]*?<\/script>/g, '');
}
