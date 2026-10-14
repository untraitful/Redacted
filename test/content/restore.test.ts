// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KEY, use } from './harness';

// Closed shadow roots can't be read from outside, so capture them as they're attached.
const roots: ShadowRoot[] = [];
const attach = Element.prototype.attachShadow;
beforeEach(() => {
  roots.length = 0;
  Element.prototype.attachShadow = function (init) {
    const r = attach.call(this, init);
    if (this.tagName === 'REDACTOR-RESTORE') roots.push(r);
    return r;
  };
  vi.useFakeTimers();
});
afterEach(() => {
  Element.prototype.attachShadow = attach;
  vi.useRealTimers();
});

function message(t: ReturnType<typeof use>, text: string): HTMLElement {
  const m = Object.assign(document.createElement('div'), { className: 'msg', textContent: text });
  t.log.append(m);
  return m;
}

describe('restore mode', () => {
  it('is off by default', async () => {
    const t = use({ editor: 'textarea' });
    t.vault.vault.placeholderFor(KEY, 'GITHUB_TOKEN');
    const m = message(t, 'use [GITHUB_TOKEN_1] here');
    await vi.advanceTimersByTimeAsync(2000);
    expect(m.querySelector('redactor-restore')).toBeNull();
  });

  it('waits for streaming to stop, then shows the original in a closed shadow root', async () => {
    const t = use({ editor: 'textarea', settings: { restoreMode: true }, quietMs: 800 });
    t.vault.vault.placeholderFor(KEY, 'GITHUB_TOKEN');
    const m = message(t, 'use [GITHUB_TOKEN_1]');
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(500);
      m.append(document.createTextNode(` chunk${i}`)); // still streaming
    }
    expect(m.querySelector('redactor-restore')).toBeNull();
    await vi.advanceTimersByTimeAsync(900);
    expect(m.querySelector('redactor-restore')).not.toBeNull();
    expect(roots.map((r) => r.textContent)).toEqual([expect.stringContaining(KEY)]);
    // Page scripts reading the light DOM still see only the placeholder.
    expect(m.textContent).toBe('use [GITHUB_TOKEN_1] chunk0 chunk1 chunk2 chunk3 chunk4');
    expect(m.textContent).not.toContain(KEY);
    expect(t.calls.toasts.map((x) => x.msg)).toEqual([expect.stringMatching(/experimental.*DOM/)]);
  });

  it('leaves unknown placeholders and the editor alone', async () => {
    const t = use({ editor: 'prosemirror', settings: { restoreMode: true }, quietMs: 100 });
    t.vault.vault.placeholderFor(KEY, 'GITHUB_TOKEN');
    const m = message(t, '[API_KEY_9] stays');
    t.el.classList.add('msg');
    t.el.textContent = '[GITHUB_TOKEN_1]';
    await vi.advanceTimersByTimeAsync(300);
    expect(m.querySelector('redactor-restore')).toBeNull();
    expect(t.el.querySelector('redactor-restore')).toBeNull();
  });

  it('turning it off puts the placeholders back', async () => {
    const t = use({ editor: 'textarea', settings: { restoreMode: true }, quietMs: 100 });
    t.vault.vault.placeholderFor(KEY, 'GITHUB_TOKEN');
    const m = message(t, 'a [GITHUB_TOKEN_1] b');
    await vi.advanceTimersByTimeAsync(300);
    expect(m.querySelector('redactor-restore')).not.toBeNull();
    t.settings.restoreMode = false;
    t.ctrl.settingsChanged();
    expect(m.querySelector('redactor-restore')).toBeNull();
    expect(m.textContent).toBe('a [GITHUB_TOKEN_1] b');
  });
});
