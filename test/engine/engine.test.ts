import { describe, expect, it } from 'vitest';
import { Vault, compileCustomPattern, createEngine, mask } from '../../src/engine';
import { URLSAFE, engineDefault, fake, settings } from './helpers';

const sample = () => {
  const openai = 'sk-proj-' + fake(80, URLSAFE);
  const gh = 'ghp_' + fake(36);
  return {
    openai,
    gh,
    text: [
      `OPENAI_API_KEY=${openai}`,
      `DATABASE_URL=postgres://admin:Pr0dPa55word@db.acme.io:5432/app`,
      `GITHUB_TOKEN=${gh}`,
      `again: ${openai}`,
      'contact jane@acme.io',
    ].join('\n'),
  };
};

describe('redact / restore', () => {
  const engine = engineDefault();

  it('produces typed, numbered placeholders and keeps keys readable', () => {
    const { text } = sample();
    const r = engine.redact(text, new Vault());
    expect(r.text).toBe([
      'OPENAI_API_KEY=[OPENAI_API_KEY_1]',
      'DATABASE_URL=postgres://admin:[DB_PASSWORD_1]@db.acme.io:5432/app',
      'GITHUB_TOKEN=[GITHUB_TOKEN_1]',
      'again: [OPENAI_API_KEY_1]',
      'contact [EMAIL_1]',
    ].join('\n'));
  });

  it('rescanning redacted text finds nothing (idempotent)', () => {
    for (const style of ['bracket', 'mustache', 'angle'] as const) {
      const vault = new Vault(style);
      const once = engine.redact(sample().text, vault).text;
      expect(engine.scan(once, { vault })).toEqual([]);
      expect(engine.redact(once, vault).text).toBe(once);
    }
  });

  it('restore round-trips to the original', () => {
    const { text } = sample();
    const vault = new Vault();
    expect(vault.restore(engine.redact(text, vault).text)).toBe(text);
  });

  it('numbers per label, same value same placeholder', () => {
    const a = 'ghp_' + fake(36);
    const b = 'ghp_' + fake(36);
    const r = engine.redact(`${a} ${b} ${a}`, new Vault());
    expect(r.text).toBe('[GITHUB_TOKEN_1] [GITHUB_TOKEN_2] [GITHUB_TOKEN_1]');
  });

  it('placeholder styles', () => {
    const v = 'ghp_' + fake(36);
    expect(engine.redact(v, new Vault('mustache')).text).toBe('{{GITHUB_TOKEN_1}}');
    expect(engine.redact(v, new Vault('angle')).text).toBe('<GITHUB_TOKEN_1>');
  });

  it('vault values are caught later with no context', () => {
    const vault = new Vault();
    engine.redact('DB_PASSWORD=Xy9!plainish', vault);
    expect(engine.redact('it was Xy9!plainish all along', vault).text).toBe('it was [DB_PASSWORD_1] all along');
  });

  it('propagation respects word boundaries and the minimum length', () => {
    const vault = new Vault();
    const r = engine.redact('mongodb://u:pass@h.io/db and the tests pass; DB_PASSWORD=Sunsh1ne then Sunsh1ne2 and Sunsh1ne', vault);
    expect(r.text).toBe('mongodb://u:[DB_PASSWORD_1]@h.io/db and the tests pass; DB_PASSWORD=[DB_PASSWORD_2] then Sunsh1ne2 and [DB_PASSWORD_2]');
  });

  it('skips placeholder numbers already present in the text', () => {
    const v = 'ghp_' + fake(36);
    expect(engine.redact(`[GITHUB_TOKEN_1] ${v}`, new Vault()).text).toBe('[GITHUB_TOKEN_1] [GITHUB_TOKEN_2]');
  });

  it('redact a selected subset only', () => {
    const { text, gh } = sample();
    const vault = new Vault();
    const subset = engine.scan(text).filter((f) => f.value === gh);
    const r = engine.redact(text, vault, {}, subset);
    expect(r.text).toContain('[GITHUB_TOKEN_1]');
    expect(r.text).toContain('Pr0dPa55word');
  });

  it('session-allowed values are skipped', () => {
    const { text, gh } = sample();
    expect(engine.scan(text, { allowed: new Set([gh]) }).some((f) => f.value === gh)).toBe(false);
  });

  it('vault survives serialization', () => {
    const vault = new Vault();
    engine.redact(sample().text, vault);
    const copy = new Vault('bracket', JSON.parse(JSON.stringify(vault.entries())));
    expect(copy.placeholderFor('new-value', 'DB_PASSWORD')).toBe('[DB_PASSWORD_2]');
  });
});

describe('settings', () => {
  it('allowlist: exact and /regex/', () => {
    const gh = 'ghp_' + fake(36);
    const e = createEngine(settings({ allowlist: [gh, '/@acme\\.io$/'] }));
    expect(e.scan(`${gh} jane@acme.io bob@other.io`).map((f) => f.value)).toEqual(['bob@other.io']);
  });

  it('per-detector toggles', () => {
    const e = createEngine(settings({ detectors: { email: false, private_ipv4: true } }));
    expect(e.scan('jane@acme.io 10.0.0.5').map((f) => f.detectorId)).toEqual(['private_ipv4']);
  });

  it('minimum confidence drops weaker detectors', () => {
    const e = createEngine(settings({ minConfidence: 'high' }));
    expect(e.scan('DB_PASSWORD=hunter2Secret!')).toEqual([]);
    expect(e.scan('ghp_' + fake(36))).toHaveLength(1);
  });

  it('custom patterns: valid, with capture group, invalid, empty-matching', () => {
    const e = createEngine(settings({
      customPatterns: [{ id: '1', name: 'Employee ID', label: 'emp id', pattern: 'EMP-(\\d{6})', enabled: true }],
    }));
    expect(e.scan('badge EMP-123456')).toMatchObject([{ detectorId: 'custom:1', value: '123456', label: 'EMP_ID' }]);
    expect(compileCustomPattern({ id: 'x', name: '', label: 'X', pattern: '(', enabled: true }).ok).toBe(false);
    expect(compileCustomPattern({ id: 'x', name: '', label: 'X', pattern: 'a*', enabled: true }).ok).toBe(false);
    expect(compileCustomPattern({ id: 'x', name: '', label: 'X', pattern: '\\b', enabled: true }).ok).toBe(false);
    expect(compileCustomPattern({ id: 'x', name: '', label: 'X', pattern: 'x', flags: 'y', enabled: true }).ok).toBe(false);
  });
});

describe('mask', () => {
  it('never shows the full value', () => {
    const v = 'sk-proj-' + 'x'.repeat(39) + '3Q2a';
    expect(mask(v)).toBe('sk-p…3Q2a (51)');
    expect(mask('hunter2')).toBe('•••• (7)');
  });
});
