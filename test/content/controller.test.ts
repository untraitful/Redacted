// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mask } from '../../src/engine/vault';
import { insertAt, readEditor } from '../../src/content/editor';
import type { ReviewResult } from '../../src/content/ui';
import { KEY, tick, until, use } from './harness';



describe('paste', () => {
  it('auto-redacts text/plain and offers Undo', async () => {
    const t = use({ editor: 'textarea' });
    const e = t.paste({ 'text/plain': `token ${KEY}` });
    expect(e.defaultPrevented).toBe(true);
    await until(() => t.calls.toasts.length > 0);
    expect(readEditor(t.el)).toBe('token [GITHUB_TOKEN_1]');
    t.calls.toasts[0]!.undo!();
    await until(() => readEditor(t.el).includes(KEY));
    expect(t.vault.allowed.has(KEY)).toBe(true);
  });

  it('inserts at the caret, not over the whole field', async () => {
    const t = use({ editor: 'textarea' });
    const ta = t.el as HTMLTextAreaElement;
    ta.value = 'before  after';
    ta.setSelectionRange(7, 7);
    t.paste({ 'text/plain': KEY });
    await until(() => t.calls.toasts.length > 0);
    expect(ta.value).toBe('before [GITHUB_TOKEN_1] after');
  });

  it('leaves clean pastes alone', () => {
    const t = use({ editor: 'textarea' });
    expect(t.paste({ 'text/plain': 'hello world' }).defaultPrevented).toBe(false);
  });

  it('forces the plain-text path when only text/html contains a secret', async () => {
    const t = use({ editor: 'textarea' });
    const e = t.paste({ 'text/plain': 'see link', 'text/html': `<a href="https://x.io/?access_token=${KEY}">see link</a>` });
    expect(e.defaultPrevented).toBe(true);
    await until(() => readEditor(t.el) === 'see link');
  });

  it('lets file pastes through untouched', () => {
    const t = use({ editor: 'textarea' });
    expect(t.paste({ 'text/plain': KEY }, new File(['x'], 'a.png', { type: 'image/png' })).defaultPrevented).toBe(false);
  });

  it('review mode: cancel inserts nothing; paste as-is inserts the original', async () => {
    let action: ReviewResult['action'] = 'cancel';
    const t = use({ editor: 'textarea', settings: { pasteMode: 'review' }, review: () => ({ action }) });
    t.paste({ 'text/plain': KEY });
    await until(() => t.calls.review.length === 1);
    await tick(10);
    expect(readEditor(t.el)).toBe('');
    action = 'send';
    t.paste({ 'text/plain': KEY });
    await until(() => readEditor(t.el) === KEY);
  });

  it('React-controlled textarea sees the change', async () => {
    const t = use({ editor: 'react' });
    t.paste({ 'text/plain': KEY });
    await until(() => t.calls.toasts.length > 0);
    expect(t.react()).toBe('[GITHUB_TOKEN_1]');
  });

  it('ProseMirror-style editor via synthetic paste, which our own listener ignores', async () => {
    const t = use({ editor: 'prosemirror' });
    t.paste({ 'text/plain': `x ${KEY}` });
    await until(() => t.calls.toasts.length > 0);
    expect(readEditor(t.el)).toBe('x [GITHUB_TOKEN_1]');
  });

  it('fails closed when the editor rejects the write', async () => {
    const t = use({ editor: 'rejecting' });
    const e = t.paste({ 'text/plain': KEY });
    expect(e.defaultPrevented).toBe(true);
    await until(() => t.calls.failures.length === 1);
    expect(readEditor(t.el)).not.toContain(KEY);
  });

  it('drop with text is handled like paste', async () => {
    const t = use({ editor: 'textarea' });
    const dt = new DataTransfer();
    dt.setData('text/plain', KEY);
    const e = new DragEvent('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(e, 'dataTransfer', { value: dt }); // happy-dom ignores it in the constructor
    t.el.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    await until(() => readEditor(t.el) === '[GITHUB_TOKEN_1]');
  });
});

describe('send', () => {
  it('Enter with a secret is stopped before the site sees it; review → redact, no auto resend', async () => {
    const t = use({ editor: 'textarea' });
    t.setText(`deploy with ${KEY}`);
    t.enter();
    expect(t.sent).toEqual([]);
    await until(() => t.calls.toasts.length > 0);
    expect(readEditor(t.el)).toBe('deploy with [GITHUB_TOKEN_1]');
    expect(t.calls.review[0]!.previews).toEqual([mask(KEY)]);
    expect(mask(KEY)).not.toContain(KEY.slice(4, 30));
    expect(t.sent).toEqual([]);
    t.enter();
    expect(t.sent).toEqual(['deploy with [GITHUB_TOKEN_1]']);
  });

  it('review rows carry the placeholder they will become and their line', async () => {
    const t = use({ editor: 'textarea', review: () => ({ action: 'cancel' }) });
    t.setText(`first line\nsecond ${KEY}\nthird ${KEY}`);
    t.enter();
    await until(() => t.calls.review.length === 1);
    expect(t.calls.review[0]!.items).toMatchObject([{ placeholder: '[GITHUB_TOKEN_1]', line: 2, count: 2 }]);
    expect(t.vault.vault.entries()).toEqual([]); // previewing numbers stores nothing
  });

  it('Shift+Enter and IME composition pass through', () => {
    const t = use({ editor: 'textarea' });
    t.setText(KEY);
    expect(t.enter({ shiftKey: true }).defaultPrevented).toBe(false);
    expect(t.enter({ isComposing: true }).defaultPrevented).toBe(false);
    expect(t.calls.review).toEqual([]);
  });

  it('Ctrl/Cmd+Enter is intercepted', () => {
    const t = use({ editor: 'textarea' });
    t.setText(KEY);
    expect(t.enter({ ctrlKey: true }).defaultPrevented).toBe(true);
    expect(t.enter({ metaKey: true }).defaultPrevented).toBe(true);
  });

  it('send-button click is intercepted; "Send as-is" resends once with the original', async () => {
    const t = use({ editor: 'textarea', review: () => ({ action: 'send' }) });
    t.setText(KEY);
    t.send.click();
    expect(t.sent).toEqual([]);
    await until(() => t.sent.length === 1);
    expect(t.sent).toEqual([KEY]);
  });

  it('form submit is intercepted', () => {
    const t = use({ editor: 'textarea', review: () => ({ action: 'cancel' }) });
    t.setText(KEY);
    const e = new SubmitEvent('submit', { bubbles: true, cancelable: true });
    t.el.closest('form')!.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });

  it('cancel leaves the input unchanged and nothing is sent', async () => {
    const t = use({ editor: 'textarea', review: () => ({ action: 'cancel' }) });
    t.setText(KEY);
    t.enter();
    await until(() => t.calls.review.length === 1);
    await tick(10);
    expect(readEditor(t.el)).toBe(KEY);
    expect(t.sent).toEqual([]);
  });

  it('unselected items are allowed for the session so the next send does not loop', async () => {
    const other = 'sk_live_' + 'Zx9Yw8Vu7Ts6Rq5Po4Nm3Lk2Ji1Hg0Fe';
    const t = use({ editor: 'textarea', review: (keys) => ({ action: 'redact', selected: new Set(keys.filter((k) => k === KEY)) }) });
    t.setText(`${KEY} ${other}`);
    t.enter();
    await until(() => t.calls.toasts.length > 0);
    expect(readEditor(t.el)).toBe(`[GITHUB_TOKEN_1] ${other}`);
    t.enter();
    expect(t.sent).toEqual([`[GITHUB_TOKEN_1] ${other}`]);
  });

  it('"Always allow" stores a hash, never the value', async () => {
    const t = use({ editor: 'textarea', review: (keys) => ({ action: 'send', alwaysAllow: new Set(keys) }) });
    t.setText(KEY);
    t.enter();
    await until(() => t.calls.allowlist.length === 1);
    expect(t.calls.allowlist[0]).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(t.calls.allowlist.join()).not.toContain(KEY);
  });

  it('undo after a send redaction restores originals and the next Enter passes', async () => {
    const t = use({ editor: 'textarea' });
    t.setText(KEY);
    t.enter();
    await until(() => t.calls.toasts.length > 0);
    t.calls.toasts[0]!.undo!();
    await until(() => readEditor(t.el) === KEY);
    t.enter();
    expect(t.sent).toEqual([KEY]);
  });

  it('auto mode + autoResend redacts then sends', async () => {
    const t = use({ editor: 'textarea', settings: { sendMode: 'auto', autoResend: true } });
    t.setText(KEY);
    t.enter();
    await until(() => t.sent.length === 1);
    expect(t.sent).toEqual(['[GITHUB_TOKEN_1]']);
    expect(t.calls.review).toEqual([]);
  });

  it('block mode uses the blocking title', async () => {
    const t = use({ editor: 'textarea', settings: { sendMode: 'block' }, review: () => ({ action: 'cancel' }) });
    t.setText(KEY);
    t.enter();
    await until(() => t.calls.review.length === 1);
    expect(t.calls.review[0]!.title).toMatch(/blocked/i);
  });

  it('fails closed on send when the editor rejects the write; "Send anyway" is explicit', async () => {
    const t = use({ editor: 'rejecting', settings: { sendMode: 'auto' }, failure: 'send' });
    t.setText(KEY);
    t.enter();
    expect(t.sent).toEqual([]);
    await until(() => t.sent.length === 1);
    expect(t.calls.failures).toHaveLength(1);
  });

  it('off mode and disabled sites do nothing', () => {
    const t = use({ editor: 'textarea', settings: { sendMode: 'off' } });
    t.setText(KEY);
    t.enter();
    expect(t.sent).toEqual([KEY]);
    const u = use({ editor: 'textarea', settings: { disabledSites: ['test.local'] } });
    u.setText(KEY);
    u.enter();
    expect(u.sent).toEqual([KEY]);
  });
});

describe('live scan', () => {
  it('shows a pill with the count', async () => {
    const t = use({ editor: 'textarea' });
    t.setText(`a ${KEY} b ${KEY}`);
    t.el.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await until(() => t.calls.pills.length > 0);
    expect(t.calls.pills.at(-1)).toBe(1);
  });
});

describe('SPA fallback warning', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it('warns once, without values, when adapter selectors stop matching', async () => {
    const t = use({ editor: 'textarea' });
    t.el.id = 'renamed';
    t.setText(KEY);
    document.body.append(document.createElement('div'));
    await vi.advanceTimersByTimeAsync(1100);
    expect(t.calls.warns).toEqual(['Test adapter selectors not found; using the generic fallback.']);
  });
});

describe('editor.insertAt', () => {
  it('replaces the selected range in a textarea', async () => {
    const ta = document.createElement('textarea');
    document.body.append(ta);
    ta.value = 'hello world';
    expect(await insertAt(ta, 'there', { start: 6, end: 11 }, [])).toBe(true);
    expect(ta.value).toBe('hello there');
  });
});
