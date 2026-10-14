import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createEngine, hashedAllowEntry } from '../../src/engine/engine';
import { sha256Hex } from '../../src/engine/sha256';
import { fake, settings } from './helpers';

describe('sha256', () => {
  it.each(['', 'abc', 'x'.repeat(55), 'x'.repeat(64), 'ünïcødé 🔑', fake(1000)])('matches node:crypto (%#)', (s) => {
    expect(sha256Hex(s)).toBe(createHash('sha256').update(s).digest('hex'));
  });

  it('hashed allowlist entries suppress the exact value', () => {
    const gh = 'ghp_' + fake(36);
    const e = createEngine(settings({ allowlist: [hashedAllowEntry(gh)] }));
    expect(e.scan(gh)).toEqual([]);
    expect(e.scan('ghp_' + fake(36))).toHaveLength(1);
  });
});
