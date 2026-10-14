import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../../src/shared/settings';

describe('sanitizeSettings', () => {
  it('falls back to defaults for garbage', () => {
    for (const raw of [null, undefined, 42, 'x', [], { pasteMode: 'nope', enabled: 'yes' }]) expect(sanitizeSettings(raw)).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid values and drops unknown fields', () => {
    const s = sanitizeSettings({ sendMode: 'block', placeholderStyle: 'angle', autoResend: true, vault: [{ value: 'x' }], evil: 1 });
    expect(s).toMatchObject({ sendMode: 'block', placeholderStyle: 'angle', autoResend: true });
    expect(s).not.toHaveProperty('vault');
    expect(s).not.toHaveProperty('evil');
  });

  it('validates hosts, patterns and detector keys from an imported file', () => {
    const s = sanitizeSettings(JSON.parse(`{
      "customSites": [{"host": "chat.example.com", "input": "textarea"}, {"host": "javascript:alert(1)"}, {"host": 5}],
      "disabledSites": ["claude.ai", "not a host", 7],
      "customPatterns": [{"id": "1", "label": "X", "pattern": "a+b", "enabled": true}, {"id": "2"}],
      "detectors": {"email": false, "__proto__": true, "bad key!": true, "jwt": "no"},
      "allowlist": ["ok", 3]
    }`));
    expect(s.customSites).toEqual([{ host: 'chat.example.com', input: 'textarea' }]);
    expect(s.disabledSites).toEqual(['claude.ai']);
    expect(s.customPatterns).toEqual([{ id: '1', name: '', label: 'X', pattern: 'a+b', enabled: true }]);
    expect(s.detectors).toEqual({ email: false });
    expect(Object.getPrototypeOf(s.detectors)).toBe(Object.prototype);
    expect(s.allowlist).toEqual(['ok']);
  });
});
