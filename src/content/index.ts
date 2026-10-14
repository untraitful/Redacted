import { createEngine } from '../engine/engine';
import type { Request, TabMessage } from '../shared/messages';
import { DEFAULT_SETTINGS, SETTINGS_KEY, sanitizeSettings, type Settings } from '../shared/settings';
import { adapterFor, withFallback, type SiteAdapter } from '../sites';
import { createController } from './controller';
import { createUi } from './ui';
import { VaultClient } from './vault-client';

// Runs at document_start so our capture listeners are registered before the page's own.
const host = location.host;
const send = (req: Request) => chrome.runtime.sendMessage(req);
let settings: Settings = DEFAULT_SETTINGS;
let engine = createEngine(settings);
let adapter: SiteAdapter = withFallback(adapterFor(host));
const vault = new VaultClient(send, settings.placeholderStyle);

function apply(raw: unknown): void {
  settings = sanitizeSettings(raw);
  engine = createEngine(settings);
  adapter = withFallback(adapterFor(host, settings.customSites));
  vault.setStyle(settings.placeholderStyle);
  controller.settingsChanged();
}

// apply() only runs from async storage callbacks, after this is assigned.
const controller = createController({
  win: window,
  doc: document,
  host,
  adapter: () => adapter,
  settings: () => settings,
  engine: () => engine,
  vault,
  ui: createUi(document),
  addToAllowlist: (entries) => {
    const allowlist = [...new Set([...settings.allowlist, ...entries])];
    apply({ ...settings, allowlist });
    void chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  },
  onRedacted: (n) => void send({ type: 'stats:add', n }).catch(() => {}),
  warn: (m) => console.warn(`[Redactor] ${m}`),
});
controller.install();

void chrome.storage.local.get(SETTINGS_KEY).then((r) => apply(r[SETTINGS_KEY]));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[SETTINGS_KEY]) apply(changes[SETTINGS_KEY].newValue);
});
chrome.runtime.onMessage.addListener((msg: TabMessage, sender) => {
  if (sender.id !== chrome.runtime.id) return;
  if (msg.type === 'redact-current') void controller.redactCurrent();
  if (msg.type === 'vault:cleared') vault.clear();
});
void vault.load();
