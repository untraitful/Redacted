import { DETECTORS } from '../engine/detectors';
import { compileAllowlist, compileCustomPattern, createEngine } from '../engine/engine';
import type { Category, CustomPattern } from '../engine/types';
import { Vault, mask } from '../engine/vault';
import { HOST_RE, SETTINGS_KEY, sanitizeSettings, type Settings } from '../shared/settings';
import { OPTIONAL_SITES, originFor, registerSite, removeSite, requestSite } from '../shared/sites-registry';
import { BUILTIN_SITES } from '../sites';

const CATEGORY_NAMES: Record<Category, string> = { secret: 'Secrets & credentials', pii: 'Personal data', network: 'Network' };

export async function init(doc: Document): Promise<void> {
  const $ = <T extends HTMLElement>(id: string) => doc.getElementById(id) as T;
  let settings: Settings = sanitizeSettings((await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY]);

  let statusTimer: ReturnType<typeof setTimeout> | undefined;
  async function save(next: Partial<Settings>): Promise<void> {
    settings = sanitizeSettings({ ...settings, ...next });
    await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
    const s = $('status');
    s.textContent = 'Saved';
    s.classList.add('show');
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => s.classList.remove('show'), 1200);
    renderTest();
    renderSummary();
  }

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...kids: (Node | string)[]) => {
    const e: HTMLElementTagNameMap[K] = Object.assign(doc.createElement(tag), props);
    e.append(...kids);
    return e;
  };
  const button = (text: string, onClick: () => void, primary = false) => {
    const b = el('button', { type: 'button', textContent: text, className: primary ? 'primary' : '' });
    b.addEventListener('click', onClick);
    return b;
  };
  const checkbox = (checked: boolean, label: string | Node, onChange: (v: boolean) => void) => {
    const box = el('input', { type: 'checkbox', checked });
    box.addEventListener('change', () => onChange(box.checked));
    return el('label', { className: 'check' }, box, label);
  };

  // --- Simple fields: [data-setting] ------------------------------------------------
  function renderFields(): void {
    for (const input of doc.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-setting]')) {
      const key = input.dataset.setting as keyof Settings;
      if (input instanceof HTMLInputElement && input.type === 'checkbox') input.checked = settings[key] as boolean;
      else input.value = String(settings[key]);
    }
  }
  for (const input of doc.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-setting]')) {
    input.addEventListener('change', () => {
      const key = input.dataset.setting as keyof Settings;
      void save({ [key]: input instanceof HTMLInputElement && input.type === 'checkbox' ? input.checked : input.value });
    });
  }

  // --- Test the detector ----------------------------------------------------------------
  let testTimer: ReturnType<typeof setTimeout> | undefined;
  function renderTest(): void {
    const text = $<HTMLTextAreaElement>('test-input').value;
    const r = createEngine(settings).redact(text, new Vault(settings.placeholderStyle));
    $('test-output').textContent = text ? r.text : '';
    $('test-findings').replaceChildren(...r.findings.map((f, i) =>
      el('li', {}, el('code', { textContent: r.placeholders[i] }), el('span', { className: 'muted', textContent: f.name }),
        el('code', { textContent: mask(f.value) }))));
  }
  $('test-input').addEventListener('input', () => {
    clearTimeout(testTimer);
    testTimer = setTimeout(renderTest, 150);
  });

  // --- Detectors ----------------------------------------------------------------------
  function renderDetectors(): void {
    const groups = (['secret', 'pii', 'network'] as Category[]).map((cat) => {
      const items = DETECTORS.filter((d) => d.category === cat).map((d) => {
        const on = settings.detectors[d.id] ?? d.defaultOn;
        return checkbox(on, el('span', {}, d.name, ' ', el('small', { textContent: `${d.confidence} · ${d.label}` })),
          (v) => void save({ detectors: { ...settings.detectors, [d.id]: v } }));
      });
      return el('div', {}, el('h3', { textContent: CATEGORY_NAMES[cat] }), el('div', { className: 'grid' }, ...items));
    });
    $('detectors').replaceChildren(...groups);
  }

  // --- Allowlist ----------------------------------------------------------------------
  const allow = $<HTMLTextAreaElement>('allowlist');
  allow.addEventListener('change', () => {
    const entries = allow.value.split('\n').map((s) => s.trim()).filter(Boolean);
    const { errors } = compileAllowlist(entries);
    $('allowlist-errors').textContent = errors.join('\n');
    if (!errors.length) void save({ allowlist: entries });
  });

  // --- Custom patterns ------------------------------------------------------------------
  function draft(): CustomPattern {
    return {
      id: Date.now().toString(36), name: $<HTMLInputElement>('p-name').value.trim(), label: $<HTMLInputElement>('p-label').value.trim() || 'CUSTOM',
      pattern: $<HTMLInputElement>('p-pattern').value, flags: $<HTMLInputElement>('p-flags').value.trim(), enabled: true,
    };
  }
  function renderPatternTest(): void {
    const p = draft();
    const out = $('p-result');
    if (!p.pattern) return void (out.textContent = '');
    const c = compileCustomPattern(p);
    if (!c.ok) {
      out.className = 'error';
      out.textContent = c.error;
      return;
    }
    out.className = '';
    const r = createEngine({ ...settings, detectors: Object.fromEntries(DETECTORS.map((d) => [d.id, false])), customPatterns: [p], allowlist: [] })
      .redact($<HTMLTextAreaElement>('p-test').value, new Vault(settings.placeholderStyle));
    out.textContent = r.findings.length ? `${r.findings.length} match(es):\n${r.text}` : 'No matches in the sample.';
  }
  for (const id of ['p-pattern', 'p-flags', 'p-test', 'p-label']) $(id).addEventListener('input', renderPatternTest);
  $('p-add').addEventListener('click', () => {
    const p = draft();
    const c = compileCustomPattern(p);
    if (!c.ok) return renderPatternTest();
    void save({ customPatterns: [...settings.customPatterns, p] }).then(renderPatterns);
    for (const id of ['p-name', 'p-label', 'p-pattern', 'p-flags']) $<HTMLInputElement>(id).value = '';
    $('p-result').textContent = '';
  });
  function renderPatterns(): void {
    $('patterns').replaceChildren(...settings.customPatterns.map((p) => el('li', {},
      checkbox(p.enabled, el('span', {}, p.name || p.label, ' ', el('code', { textContent: `/${p.pattern}/${p.flags ?? ''} → ${p.label}` })),
        (v) => void save({ customPatterns: settings.customPatterns.map((x) => (x.id === p.id ? { ...x, enabled: v } : x)) })),
      button('Delete', () => void save({ customPatterns: settings.customPatterns.filter((x) => x.id !== p.id) }).then(renderPatterns)))));
  }

  // --- Sites -----------------------------------------------------------------------------
  function renderBuiltin(): void {
    $('sites-builtin').replaceChildren(...BUILTIN_SITES.map((s) => {
      const on = !s.hosts.every((h) => settings.disabledSites.includes(h));
      return el('li', {}, checkbox(on, el('span', {}, s.name, ' ', el('small', { textContent: s.hosts.join(', ') })), (v) => {
        const rest = settings.disabledSites.filter((h) => !s.hosts.includes(h));
        void save({ disabledSites: v ? rest : [...rest, ...s.hosts] });
      }), el('small', { textContent: s.verified ? 'selectors verified' : 'selectors unverified' }));
    }));
  }

  async function siteRow(host: string, label: string, note: string, onRemove: () => Promise<void>): Promise<HTMLElement> {
    const granted = await chrome.permissions.contains({ origins: [originFor(host)] });
    const row = el('li', {}, el('span', {}, label, ' ', el('small', { textContent: note })));
    if (granted) row.append(button('Remove access', () => void onRemove().then(renderSites)));
    else row.append(button('Grant access', () => {
      // permissions.request must run first in the click handler to keep the user gesture.
      void requestSite(host).then(async (ok) => {
        if (ok) await registerSite(host);
        await renderSites();
      });
    }, true));
    return row;
  }

  async function renderSites(): Promise<void> {
    renderBuiltin();
    $('sites-optional').replaceChildren(...(await Promise.all(OPTIONAL_SITES.map((s) => siteRow(s.host, s.name, s.why, () => removeSite(s.host))))));
    $('sites-custom').replaceChildren(...(await Promise.all(settings.customSites.map((s) =>
      siteRow(s.host, s.host, [s.input, s.send].filter(Boolean).join(' · ') || 'generic selectors', async () => {
        await removeSite(s.host);
        await save({ customSites: settings.customSites.filter((x) => x.host !== s.host) });
      })))));
  }

  const validSelector = (s: string) => {
    if (!s) return true;
    try {
      doc.createDocumentFragment().querySelector(s);
      return true;
    } catch {
      return false;
    }
  };

  $('s-add').addEventListener('click', () => {
    const raw = $<HTMLInputElement>('s-host').value.trim().toLowerCase();
    const host = raw.replace(/^https?:\/\//, '').replace(/[/?#].*$/, '');
    const input = $<HTMLInputElement>('s-input').value.trim();
    const send = $<HTMLInputElement>('s-send').value.trim();
    const err = $('s-error');
    err.textContent = !HOST_RE.test(host) ? 'Enter a hostname like chat.example.com.'
      : !validSelector(input) || !validSelector(send) ? 'One of the selectors is not valid CSS.'
      : BUILTIN_SITES.some((s) => s.hosts.includes(host)) ? 'That site is already built in.' : '';
    if (err.textContent) return;
    // Synchronous up to here: permissions.request must be called inside the user gesture.
    void requestSite(host).then(async (ok) => {
      if (!ok) return void (err.textContent = 'Access was not granted.');
      await registerSite(host);
      const rest = settings.customSites.filter((s) => s.host !== host);
      await save({ customSites: [...rest, { host, ...(input ? { input } : {}), ...(send ? { send } : {}) }] });
      for (const id of ['s-host', 's-input', 's-send']) $<HTMLInputElement>(id).value = '';
      await renderSites();
    });
  });

  // --- Import / export ------------------------------------------------------------------
  $('export').addEventListener('click', () => {
    // Settings only: the vault lives in storage.session and is never part of this object.
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    el('a', { href: url, download: 'redactor-settings.json' }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $<HTMLInputElement>('import').addEventListener('change', async (e) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const status = $('io-status');
    try {
      const parsed: unknown = JSON.parse(await file.text());
      settings = sanitizeSettings(parsed);
      await save({});
      renderAll();
      status.textContent = 'Imported. Custom sites need “Grant access” before they work.';
    } catch {
      status.textContent = 'That file is not valid settings JSON.';
    }
    input.value = '';
  });

  /** Contents page: each entry's right column states that section's current setting. */
  function renderSummary(): void {
    const set = (id: string, text: string) => {
      const e = doc.getElementById(id);
      if (e) e.textContent = text;
    };
    const on = DETECTORS.filter((d) => settings.detectors[d.id] ?? d.defaultOn).length;
    const offSites = BUILTIN_SITES.filter((s) => s.hosts.every((h) => settings.disabledSites.includes(h))).length;
    set('sum-behavior', settings.enabled ? `paste: ${settings.pasteMode} · send: ${settings.sendMode}` : 'off');
    set('sum-detectors', `${on} of ${DETECTORS.length} on`);
    set('sum-allow', `${settings.allowlist.length} ${settings.allowlist.length === 1 ? 'entry' : 'entries'}`);
    set('sum-patterns', String(settings.customPatterns.length));
    set('sum-sites', `${BUILTIN_SITES.length - offSites} built in · ${settings.customSites.length} custom`);
  }

  function renderAll(): void {
    const v = doc.getElementById('version');
    if (v) v.textContent = chrome.runtime.getManifest?.().version ?? '';
    renderSummary();
    renderFields();
    allow.value = settings.allowlist.join('\n');
    renderDetectors();
    renderPatterns();
    void renderSites();
    renderTest();
  }
  renderAll();
}
