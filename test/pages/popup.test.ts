// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import html from '../../src/popup/popup.html?raw';
import { init } from '../../src/popup/popup';
import { SETTINGS_KEY, type Settings } from '../../src/shared/settings';
import { vaultKey } from '../../src/shared/messages';
import { flush, installFakeChrome, loadPage } from './fake-chrome';

const KEY = 'ghp_' + 'aB3dE5gH7jK9mN1pQ3sT5vW7yZ9bC1dE3fG5';
const $ = (id: string) => document.getElementById(id)!;

describe('popup', () => {
  it('shows counts and the vault masked; clear wipes it and tells the tab', async () => {
    const key = vaultKey(7, 'claude.ai');
    const f = installFakeChrome({
      tab: { id: 7, url: 'https://claude.ai/chat/1' },
      session: { [key]: { entries: [{ placeholder: '[GITHUB_TOKEN_1]', value: KEY, label: 'GITHUB_TOKEN' }], allowed: [], count: 3 } },
    });
    loadPage(html);
    await init(document);
    expect($('count').textContent).toBe('3');
    expect($('vault').textContent).toContain('[GITHUB_TOKEN_1]');
    expect(document.body.textContent).not.toContain(KEY);
    $('clear').click();
    await flush();
    expect(f.session.has(key)).toBe(false);
    expect(f.chrome.tabs.sendMessage).toHaveBeenCalledWith(7, { type: 'vault:cleared' });
    expect($('vault').children).toHaveLength(0);
  });

  it('site toggle writes disabledSites', async () => {
    const f = installFakeChrome({ tab: { id: 1, url: 'https://chatgpt.com/' } });
    loadPage(html);
    await init(document);
    const box = $('site').querySelector('input')!;
    box.checked = false;
    box.dispatchEvent(new Event('change'));
    await flush();
    expect((f.local.get(SETTINGS_KEY) as Settings).disabledSites).toEqual(['chatgpt.com']);
  });

  it('says so when the page is not a supported site', async () => {
    installFakeChrome({ tab: { id: 1 } });
    loadPage(html);
    await init(document);
    expect($('site').textContent).toMatch(/not active/);
  });
});
