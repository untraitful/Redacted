// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { isTextLike, MAX_SCAN_BYTES } from '../../src/content/files';
import { KEY, tick, until, use } from './harness';

const file = (name: string, body: string, type = '') => new File([body], name, { type });
function attach(input: HTMLInputElement, files: File[]): Event {
  const dt = new DataTransfer();
  for (const f of files) dt.items.add(f);
  input.files = dt.files;
  const e = new Event('change', { bubbles: true, cancelable: true });
  input.dispatchEvent(e);
  return e;
}

describe('isTextLike', () => {
  it.each(['.env', '.env.production', 'app.yaml', 'main.tf', 'prod.tfvars', 'id_rsa', 'server.pem', 'notes.md', 'dump.sql', 'x.properties'])('%s', (n) => {
    expect(isTextLike(file(n, ''))).toBe(true);
  });
  it('by MIME type', () => expect(isTextLike(file('blob', '', 'text/plain'))).toBe(true));
  it.each(['photo.png', 'report.pdf', 'deck.docx', 'archive.zip'])('not %s', (n) => expect(isTextLike(file(n, ''))).toBe(false));
});

describe('uploads: warn mode (default)', () => {
  it('lets the upload proceed, then blocks the next send with a dialog naming the file', async () => {
    const t = use({ editor: 'textarea', failure: 'cancel' });
    attach(t.file, [file('.env', `GITHUB_TOKEN=${KEY}\nDEBUG=true`)]);
    await until(() => t.uploads.length === 1);
    expect(t.uploads[0]).toEqual([`GITHUB_TOKEN=${KEY}\nDEBUG=true`]);
    await until(() => t.calls.toasts.length === 1);
    t.setText('please review this config');
    t.enter();
    await until(() => t.calls.failures.length === 1);
    expect(t.calls.failures[0]).toContain('.env (1 finding)');
    expect(t.sent).toEqual([]);
  });

  it('"Send anyway" sends and disarms', async () => {
    const t = use({ editor: 'textarea', failure: 'send' });
    attach(t.file, [file('.env', `TOKEN=${KEY}`)]);
    await until(() => t.calls.toasts.length === 1);
    t.setText('hi');
    t.enter();
    await until(() => t.sent.length === 1);
    t.enter();
    expect(t.sent).toEqual(['hi', 'hi']);
    expect(t.calls.failures).toHaveLength(1);
  });

  it('a send during a pending scan waits for it instead of racing past', async () => {
    const t = use({ editor: 'textarea', failure: 'cancel' });
    attach(t.file, [file('creds.json', `{"token": "${KEY}"}`)]);
    t.setText('hi');
    const e = t.enter(); // scan has not finished yet
    expect(e.defaultPrevented).toBe(true);
    await until(() => t.calls.failures.length === 1);
    expect(t.sent).toEqual([]);
  });

  it('clean and binary files do not arm anything', async () => {
    const t = use({ editor: 'textarea' });
    attach(t.file, [file('notes.txt', 'nothing here'), file('a.png', `TOKEN=${KEY}`, 'image/png')]);
    await tick(20);
    t.setText('hi');
    t.enter();
    expect(t.sent).toEqual(['hi']);
  });

  it('files over 2 MB are reported as not scanned', async () => {
    const t = use({ editor: 'textarea' });
    attach(t.file, [file('big.log', 'x'.repeat(MAX_SCAN_BYTES + 1))]);
    await until(() => t.calls.toasts.length === 1);
    expect(t.calls.toasts[0]!.msg).toMatch(/big\.log.*not scanned/);
  });

  it('file drops are scanned and arm the send block without stopping the drop', async () => {
    const t = use({ editor: 'textarea', failure: 'cancel' });
    const dt = new DataTransfer();
    dt.items.add(file('.env', `TOKEN=${KEY}`));
    const e = new DragEvent('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(e, 'dataTransfer', { value: dt });
    t.log.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
    t.setText('hi');
    t.enter();
    await until(() => t.calls.failures.length === 1);
  });
});

describe('uploads: redact mode (experimental)', () => {
  it('the page only ever sees a redacted copy via input.files + re-dispatched change', async () => {
    const t = use({ editor: 'textarea', settings: { fileMode: 'redact' } });
    const e = attach(t.file, [file('.env', `GITHUB_TOKEN=${KEY}\nDEBUG=true`), file('a.png', 'binary', 'image/png')]);
    expect(e.defaultPrevented).toBe(true);
    await until(() => t.uploads.length === 1);
    expect(t.uploads[0]).toEqual(['GITHUB_TOKEN=[GITHUB_TOKEN_1]\nDEBUG=true', 'binary']);
    expect(t.file.files![0]!.name).toBe('.env');
    // The placeholder maps back through this tab's vault.
    expect(t.vault.vault.lookup('[GITHUB_TOKEN_1]')).toBe(KEY);
  });

  it('pasted files are re-dispatched as a redacted paste', async () => {
    const t = use({ editor: 'textarea', settings: { fileMode: 'redact' } });
    const dt = new DataTransfer();
    dt.items.add(file('.env', `TOKEN=${KEY}`));
    const e = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
    t.el.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    await until(() => t.uploads.length === 1);
    expect(t.uploads[0]).toEqual(['TOKEN=[GITHUB_TOKEN_1]']);
  });

  it('fails closed when the engine cannot carry a DataTransfer on a synthetic drop', async () => {
    // happy-dom (like some engines) ignores `dataTransfer` in the DragEvent constructor.
    const t = use({ editor: 'textarea', settings: { fileMode: 'redact' } });
    const dt = new DataTransfer();
    dt.items.add(file('.env', `TOKEN=${KEY}`));
    const e = new DragEvent('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(e, 'dataTransfer', { value: dt });
    t.log.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    await until(() => t.calls.failures.length === 1);
    expect(t.calls.failures[0]).toMatch(/cancelled/);
  });
});
