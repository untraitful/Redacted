import { createEngine } from '../engine/engine';
import { DEFAULT_SETTINGS, SETTINGS_KEY, mergeSettings, type Settings } from '../shared/settings';
import { adapterFor, withFallback } from '../sites';
import { createController } from './controller';
import { createUi } from './ui';
import { VaultClient } from './vault-client';

// Runs at document_start so our capture listeners are registered before the page's own.
let settings: Settings = DEFAULT_SETTINGS;
let engine = createEngine(settings);
const vault = new VaultClient((req) => chrome.runtime.sendMessage(req), settings.placeholderStyle);

function apply(raw: unknown): void {
  settings = mergeSettings(raw);
  engine = createEngine(settings);
  vault.setStyle(settings.placeholderStyle);
  controller.settingsChanged();
}

// apply() only runs from async storage callbacks, after this is assigned.
const controller = createController({
  win: window,
  doc: document,
  host: location.host,
  adapter: withFallback(adapterFor(location.host)),
  settings: () => settings,
  engine: () => engine,
  vault,
  ui: createUi(document),
  addToAllowlist: (entries) => {
    const allowlist = [...new Set([...settings.allowlist, ...entries])];
    apply({ ...settings, allowlist });
    void chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  },
  warn: (m) => console.warn(`[Redactor] ${m}`),
});
controller.install();

void chrome.storage.local.get(SETTINGS_KEY).then((r) => apply(r[SETTINGS_KEY]));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[SETTINGS_KEY]) apply(changes[SETTINGS_KEY].newValue);
});
void vault.load();
