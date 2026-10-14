import { mask } from '../engine/vault';
import { vaultKey, type TabMessage, type VaultState } from '../shared/messages';
import { SETTINGS_KEY, sanitizeSettings } from '../shared/settings';

export async function init(doc: Document): Promise<void> {
  const $ = <T extends HTMLElement>(id: string) => doc.getElementById(id) as T;
  let settings = sanitizeSettings((await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY]);
  const save = (next: Partial<typeof settings>) => {
    settings = sanitizeSettings({ ...settings, ...next });
    return chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  };

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  // Without the "tabs" permission the URL is only visible on sites we have host access to,
  // which are exactly the sites Redactor runs on.
  const host = tab?.url && /^https?:/.test(tab.url) ? new URL(tab.url).host : '';
  const key = tab?.id !== undefined && host ? vaultKey(tab.id, host) : '';

  $('host-line').textContent = host || 'this tab';
  $('version').textContent = chrome.runtime.getManifest?.().version ?? '';
  const enabled = $<HTMLInputElement>('enabled');
  enabled.checked = settings.enabled;
  enabled.addEventListener('change', () => void save({ enabled: enabled.checked }));

  const site = $('site');
  if (!host) {
    site.textContent = 'Redactor is not active on this page.';
  } else {
    const box = Object.assign(doc.createElement('input'), { type: 'checkbox', checked: !settings.disabledSites.includes(host) });
    box.addEventListener('change', () => {
      const rest = settings.disabledSites.filter((h) => h !== host);
      void save({ disabledSites: box.checked ? rest : [...rest, host] });
    });
    const label = Object.assign(doc.createElement('label'), { className: 'check' });
    label.append(box, `Active on ${host}`);
    site.replaceChildren(label);
  }

  async function render(): Promise<void> {
    const state: VaultState = { entries: [], allowed: [], count: 0, ...(key ? ((await chrome.storage.session.get(key))[key] as VaultState | undefined) : {}) };
    $('count').textContent = String(state.count);
    $('vault-size').textContent = String(state.entries.length);
    $('vault-empty').hidden = state.entries.length > 0;
    $('clear').hidden = state.entries.length === 0;
    $('vault').replaceChildren(...state.entries.map((e) => {
      const li = doc.createElement('li');
      li.append(Object.assign(doc.createElement('code'), { textContent: e.placeholder }), Object.assign(doc.createElement('code'), { textContent: mask(e.value) }));
      return li;
    }));
  }

  $('clear').addEventListener('click', async () => {
    if (!key || tab?.id === undefined) return;
    await chrome.storage.session.remove(key);
    await chrome.tabs.sendMessage(tab.id, { type: 'vault:cleared' } satisfies TabMessage).catch(() => {});
    await chrome.action.setBadgeText({ tabId: tab.id, text: '' });
    await render();
  });
  $('options').addEventListener('click', () => void chrome.runtime.openOptionsPage());
  await render();
}
