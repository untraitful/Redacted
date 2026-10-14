// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import html from '../../src/options/options.html?raw';
import { mask } from '../../src/engine/vault';
import { init } from '../../src/options/options';
import { SETTINGS_KEY, type Settings } from '../../src/shared/settings';
import { flush, installFakeChrome, loadPage } from './fake-chrome';

const KEY = 'ghp_' + 'aB3dE5gH7jK9mN1pQ3sT5vW7yZ9bC1dE3fG5';
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const saved = (f: ReturnType<typeof installFakeChrome>) => f.local.get(SETTINGS_KEY) as Settings;
const type = (id: string, value: string, ev = 'input') => {
  const e = $<HTMLInputElement>(id);
  e.value = value;
  e.dispatchEvent(new Event(ev, { bubbles: true }));
};

let f: ReturnType<typeof installFakeChrome>;
beforeEach(async () => {
  f = installFakeChrome();
  loadPage(html);
  await init(document);
  await flush();
});

describe('options page', () => {
  it('binds simple settings', async () => {
    const select = document.querySelector<HTMLSelectElement>('[data-setting="sendMode"]')!;
    expect(select.value).toBe('review');
    select.value = 'block';
    select.dispatchEvent(new Event('change'));
    await flush();
    expect(saved(f).sendMode).toBe('block');
  });

  it('shows the restore-mode warning next to the toggle', () => {
    expect(document.querySelector('[data-setting="restoreMode"]')!.closest('section')!.textContent).toMatch(/DOM tree/);
  });

  it('detector toggles are grouped by category and saved', async () => {
    expect([...$('detectors').querySelectorAll('h3')].map((h) => h.textContent)).toEqual(['Secrets & credentials', 'Personal data', 'Network']);
    const box = [...$('detectors').querySelectorAll('label')].find((l) => l.textContent!.startsWith('Email address'))!.querySelector('input')!;
    box.checked = false;
    box.dispatchEvent(new Event('change'));
    await flush();
    expect(saved(f).detectors.email).toBe(false);
  });

  it('test box shows redacted output and only masked values', async () => {
    vi.useFakeTimers();
    type('test-input', `token ${KEY}`);
    vi.advanceTimersByTime(200);
    vi.useRealTimers();
    expect($('test-output').textContent).toBe('token [GITHUB_TOKEN_1]');
    expect($('test-findings').textContent).toContain(mask(KEY));
    expect($('test-findings').textContent).not.toContain(KEY);
  });

  it('allowlist rejects invalid regex without saving', async () => {
    type('allowlist', 'ok\n/(/', 'change');
    await flush();
    expect($('allowlist-errors').textContent).toMatch(/\/\(\//);
    expect(saved(f)).toBeUndefined();
    type('allowlist', 'ok\n/^x$/i', 'change');
    await flush();
    expect(saved(f).allowlist).toEqual(['ok', '/^x$/i']);
  });

  it('custom pattern: live test, error for empty-matching regex, add', async () => {
    type('p-pattern', 'a*');
    expect($('p-result').textContent).toMatch(/empty string/);
    type('p-label', 'emp id');
    type('p-pattern', 'EMP-(\\d{6})');
    type('p-test', 'badge EMP-123456');
    expect($('p-result').textContent).toContain('badge EMP-[EMP_ID_1]');
    $('p-add').click();
    await flush();
    expect(saved(f).customPatterns).toMatchObject([{ pattern: 'EMP-(\\d{6})', label: 'emp id', enabled: true }]);
    expect($('patterns').children).toHaveLength(1);
  });

  it('adding a site requests permission synchronously in the click, then registers the script', async () => {
    type('s-host', 'https://chat.example.com/c/123');
    type('s-input', 'textarea#prompt');
    $('s-add').click();
    expect(f.chrome.permissions.request).toHaveBeenCalledWith({ origins: ['https://chat.example.com/*'] }); // no await before it
    await flush(10);
    expect(f.chrome.scripting.registerContentScripts).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'site:chat.example.com', matches: ['https://chat.example.com/*'], js: ['content.js'], runAt: 'document_start' }),
    ]);
    expect(saved(f).customSites).toEqual([{ host: 'chat.example.com', input: 'textarea#prompt' }]);
  });

  it('rejects bad hosts and selectors without asking for permission', () => {
    type('s-host', 'not a host');
    $('s-add').click();
    expect($('s-error').textContent).toMatch(/hostname/);
    type('s-host', 'ok.example.com');
    type('s-send', 'button[');
    $('s-add').click();
    expect($('s-error').textContent).toMatch(/selector/);
    expect(f.chrome.permissions.request).not.toHaveBeenCalled();
  });

  it('optional sites (x.com, github.com) need an explicit grant', async () => {
    const rows = [...$('sites-optional').children];
    expect(rows.map((r) => r.textContent)).toEqual([expect.stringContaining('Grok on X'), expect.stringContaining('GitHub Copilot')]);
    rows[0]!.querySelector('button')!.click();
    expect(f.chrome.permissions.request).toHaveBeenCalledWith({ origins: ['https://x.com/*'] });
  });

  it('import sanitizes the file; bad JSON is reported', async () => {
    const importFile = async (text: string) => {
      const input = $<HTMLInputElement>('import');
      const dt = new DataTransfer();
      dt.items.add(new File([text], 's.json'));
      input.files = dt.files;
      input.dispatchEvent(new Event('change'));
      await flush(10);
    };
    await importFile('{"sendMode":"auto","vault":[{"value":"x"}],"customSites":[{"host":"bad host"}]}');
    expect(saved(f).sendMode).toBe('auto');
    expect(saved(f)).not.toHaveProperty('vault');
    expect(saved(f).customSites).toEqual([]);
    await importFile('{nope');
    expect($('io-status').textContent).toMatch(/not valid/);
  });

  it('export contains settings only', async () => {
    let blob: Blob | undefined;
    URL.createObjectURL = (b: Blob) => ((blob = b), 'blob:x');
    $('export').click();
    const data = JSON.parse(await blob!.text());
    expect(Object.keys(data).sort()).toEqual(Object.keys(saved(f) ?? data).sort());
    expect(data).not.toHaveProperty('vault');
    expect(data).not.toHaveProperty('entries');
  });
});
