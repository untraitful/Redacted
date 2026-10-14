import { describe, expect, it } from 'vitest';
import { createStore, type SessionStore } from '../../src/background/store';
import { vaultKey } from '../../src/shared/messages';

function fakeSession(): SessionStore & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return {
    data,
    async get(key) {
      if (key === null) return Object.fromEntries(data);
      return data.has(key) ? { [key]: structuredClone(data.get(key)) } : {};
    },
    async set(items) { for (const [k, v] of Object.entries(items)) data.set(k, structuredClone(v)); },
    async remove(keys) { for (const k of [keys].flat()) data.delete(k); },
  };
}

const entry = (n: number) => ({ placeholder: `[X_${n}]`, value: `value-${n}`, label: 'X' });

describe('background store', () => {
  it('keys by tab + host and merges entries by value', async () => {
    const session = fakeSession();
    const store = createStore(session);
    const k = vaultKey(1, 'claude.ai');
    await Promise.all([store.handle({ type: 'vault:put', entries: [entry(1)] }, k), store.handle({ type: 'vault:put', entries: [entry(2)] }, k)]);
    await store.handle({ type: 'vault:put', entries: [entry(1)] }, k);
    expect((await store.read(k)).entries).toEqual([entry(1), entry(2)]);
    expect((await store.read(vaultKey(1, 'chatgpt.com'))).entries).toEqual([]);
  });

  it('allowed values and counts accumulate', async () => {
    const store = createStore(fakeSession());
    const k = vaultKey(2, 'x.com');
    await store.handle({ type: 'vault:allow', values: ['a', 'b'] }, k);
    await store.handle({ type: 'vault:allow', values: ['b', 'c'] }, k);
    expect(await store.handle({ type: 'stats:add', n: 2 }, k)).toBe(2);
    expect(await store.handle({ type: 'stats:add', n: 3 }, k)).toBe(5);
    expect(await store.read(k)).toMatchObject({ allowed: ['a', 'b', 'c'], count: 5 });
  });

  it('rejects malformed messages', async () => {
    const session = fakeSession();
    const store = createStore(session);
    const k = vaultKey(3, 'a.io');
    expect(await store.handle({ type: 'vault:put', entries: [{ value: 1 }] } as never, k)).toBe(false);
    expect(await store.handle({ type: 'stats:add', n: -1 }, k)).toBe(false);
    expect(await store.handle({ type: 'nope' } as never, k)).toBe(false);
    expect(session.data.size).toBe(0);
  });

  it('closing a tab drops all of its vaults, and only those', async () => {
    const session = fakeSession();
    const store = createStore(session);
    for (const k of [vaultKey(4, 'a.io'), vaultKey(4, 'b.io'), vaultKey(40, 'a.io')]) await store.handle({ type: 'vault:put', entries: [entry(1)] }, k);
    await store.dropTab(4);
    expect([...session.data.keys()]).toEqual([vaultKey(40, 'a.io')]);
  });
});
