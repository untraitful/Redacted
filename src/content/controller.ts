import { hashedAllowEntry, type Engine } from '../engine/engine';
import type { Finding } from '../engine/types';
import { mask } from '../engine/vault';
import type { Settings } from '../shared/settings';
import { GENERIC, type SiteAdapter } from '../sites';
import {
  editableRoot,
  insertAt,
  isOurs,
  isTextField,
  mark,
  rangeFromPoint,
  readEditor,
  replaceAll,
  saveSelection,
  type SavedSelection,
} from './editor';
import { redactedFile, scanFiles, type FileScan } from './files';
import { createRestorer } from './restore';
import type { ReviewItem, Ui } from './ui';
import type { VaultClient } from './vault-client';

export interface ControllerDeps {
  win: Window;
  doc: Document;
  host: string;
  /** Resolved lazily: custom-site selectors arrive with settings, after install(). */
  adapter(): SiteAdapter;
  /** Number of values just replaced (badge). */
  onRedacted?(n: number): void;
  settings(): Settings;
  engine(): Engine;
  vault: VaultClient;
  ui: Ui;
  /** Persist "Always allow" (hashed) entries to settings. */
  addToAllowlist(entries: string[]): void;
  warn(message: string): void;
  /** Live-scan debounce; tests pass 0. */
  debounceMs?: number;
  /** Restore mode waits this long after a message's last change (streaming) before touching it. */
  restoreQuietMs?: number;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function stop(e: Event): void {
  e.preventDefault();
  e.stopImmediatePropagation();
}

function reviewItems(findings: Finding[]): ReviewItem[] {
  const byValue = new Map<string, ReviewItem>();
  for (const f of findings) {
    const item = byValue.get(f.value);
    if (item) item.count++;
    else byValue.set(f.value, { key: f.value, label: f.label, name: f.name, preview: mask(f.value), count: 1 });
  }
  return [...byValue.values()];
}

export function createController(deps: ControllerDeps) {
  const { win, doc, adapter, ui, vault } = deps;
  /** True while we resend ourselves, so our own send isn't intercepted again. */
  let bypass = false;
  /** A review/failure dialog is open; further sends are swallowed until it closes. */
  let busy = false;
  let lastEditor: HTMLElement | null = null;
  let warned = false;
  /** Uploads (warn mode) that contained findings: the next send is blocked until the user confirms. */
  let armed: Array<{ name: string; count: number }> = [];
  /** File scans still running; a send waits for them rather than racing past. */
  const pending = new Set<Promise<void>>();
  const track = (p: Promise<void>) => {
    const done = p.catch(() => {}).finally(() => pending.delete(done));
    pending.add(done);
  };

  const active = () => {
    const s = deps.settings();
    return s.enabled && !s.disabledSites.includes(deps.host);
  };
  const scan = (text: string) => deps.engine().scan(text, { vault: vault.vault, allowed: vault.allowed });

  function visible(el: Element): boolean {
    return !(el instanceof HTMLElement) || el.offsetParent !== null || el.getClientRects().length > 0 || !el.isConnected;
  }

  function query(selectors: string[], scope: ParentNode = doc): HTMLElement | null {
    for (const sel of selectors) {
      for (const el of scope.querySelectorAll<HTMLElement>(sel)) if (visible(el)) return el;
    }
    return null;
  }

  function currentEditor(): HTMLElement | null {
    if (lastEditor?.isConnected) return lastEditor;
    const el = query(adapter().input);
    return el ? editableRoot(el) : null;
  }

  function findSend(): HTMLButtonElement | null {
    const b = query(adapter().send);
    return b instanceof HTMLButtonElement || b?.getAttribute('role') === 'button' ? (b as HTMLButtonElement) : null;
  }

  async function resend(el: HTMLElement): Promise<void> {
    await new Promise((r) => setTimeout(r, 50)); // let the framework enable its send button after our write
    bypass = true;
    try {
      const btn = findSend();
      if (btn && !btn.disabled && btn.getAttribute('aria-disabled') !== 'true') btn.click();
      else if (isTextField(el) && el.form) el.form.requestSubmit();
      else el.dispatchEvent(mark(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true })));
    } finally {
      bypass = false;
    }
  }

  function rememberAlwaysAllow(values: Set<string>): void {
    if (!values.size) return;
    deps.addToAllowlist([...values].map(hashedAllowEntry));
    vault.allow(values);
  }

  /** Swap the given placeholders back to their originals and allow those values for this session. */
  async function undo(el: HTMLElement, pairs: Array<[placeholder: string, value: string]>): Promise<void> {
    vault.allow(pairs.map(([, v]) => v));
    let text = readEditor(el);
    for (const [p, v] of pairs) text = text.split(p).join(v);
    if (!(await replaceAll(el, text, adapter().write))) ui.toast('Undo failed: the editor rejected the change.');
  }

  /** Fail closed: nothing was sent; offer copy, and optionally an explicit override. */
  async function failClosed(el: HTMLElement, redacted: string, values: string[], canSend: boolean): Promise<void> {
    const choice = await ui.failure({
      message: "Redactor detected secrets but couldn't rewrite this input safely, so nothing was sent. " +
        'Copy the redacted text and paste it in, or cancel.',
      redacted,
      allowSend: canSend,
    });
    if (choice === 'send') {
      vault.allow(values);
      await resend(el);
    }
  }

  /** Redact the whole editor. Returns placeholder pairs for undo, or null if the write failed (already reported). */
  async function redactEditor(el: HTMLElement, text: string, findings: Finding[], canSend: boolean) {
    const r = deps.engine().redact(text, vault.vault, { allowed: vault.allowed }, findings);
    vault.persist();
    const values = [...new Set(findings.map((f) => f.value))];
    const ok = (await replaceAll(el, r.text, adapter().write)) && !values.some((v) => readEditor(el).includes(v));
    if (!ok) {
      await failClosed(el, r.text, values, canSend);
      return null;
    }
    deps.onRedacted?.(r.findings.length);
    return [...new Map(r.placeholders.map((p, i) => [p, r.findings[i]!.value])).entries()];
  }

  // --- Send ---------------------------------------------------------------------

  function interceptSend(e: Event, el: HTMLElement | null): void {
    if (bypass || !el || !active()) return;
    const s = deps.settings();
    if (s.sendMode === 'off') return;
    if (busy) return stop(e);
    if (pending.size || armed.length) {
      stop(e);
      busy = true;
      void uploadGate(el, s).finally(() => (busy = false));
      return;
    }
    const text = readEditor(el);
    const findings = scan(text);
    if (!findings.length) return;
    stop(e);
    busy = true;
    void handleSend(el, text, findings, s).finally(() => (busy = false));
  }

  async function uploadGate(el: HTMLElement, s: Settings): Promise<void> {
    while (pending.size) await Promise.all(pending);
    if (armed.length) {
      const list = armed.map((a) => `${a.name} (${plural(a.count, 'finding')})`).join(', ');
      const choice = await ui.failure({
        title: 'Upload contains secrets',
        message: `You attached ${list}. Remove the file before sending, or send anyway.`,
        allowSend: true,
      });
      if (choice === 'cancel') return el.focus();
      armed = [];
    }
    const text = readEditor(el);
    const findings = scan(text);
    return findings.length ? handleSend(el, text, findings, s) : resend(el);
  }

  async function handleSend(el: HTMLElement, text: string, findings: Finding[], s: Settings): Promise<void> {
    if (s.sendMode === 'auto') {
      const pairs = await redactEditor(el, text, findings, true);
      if (pairs) afterSendRedaction(el, pairs, s);
      return;
    }
    const items = reviewItems(findings);
    const r = await ui.review({
      title: s.sendMode === 'block' ? 'Send blocked: secrets detected' : 'Review before sending',
      intro: `Found ${plural(items.length, 'item')} that look like secrets or personal data. Selected items are replaced with placeholders; the originals stay in this browser.`,
      items,
      sendLabel: 'Send as-is',
    });
    rememberAlwaysAllow(r.alwaysAllow);
    if (r.action === 'cancel') return el.focus();
    if (r.action === 'send') {
      vault.allow(items.map((i) => i.key));
      return resend(el);
    }
    vault.allow(items.map((i) => i.key).filter((k) => !r.selected.has(k)));
    const chosen = findings.filter((f) => r.selected.has(f.value));
    if (!chosen.length) return resend(el);
    const pairs = await redactEditor(el, text, chosen, true);
    if (pairs) afterSendRedaction(el, pairs, s);
  }

  function afterSendRedaction(el: HTMLElement, pairs: Array<[string, string]>, s: Settings): void {
    if (s.autoResend) {
      void resend(el);
      ui.toast(`Redacted ${plural(pairs.length, 'item')} and sent.`);
      return;
    }
    ui.toast(`Redacted ${plural(pairs.length, 'item')}. Review, then press Enter to send.`, [
      { label: 'Undo', run: () => void undo(el, pairs) },
    ]);
  }

  function onKeydown(e: KeyboardEvent): void {
    if (isOurs(e) || e.key !== 'Enter' || e.shiftKey || e.altKey || e.isComposing || e.keyCode === 229) return;
    interceptSend(e, editableRoot(e.target));
  }

  function onClick(e: MouseEvent): void {
    if (isOurs(e) || !(e.target instanceof Element)) return;
    if (!e.target.closest(adapter().send.join(','))) return;
    interceptSend(e, currentEditor());
  }

  function onSubmit(e: SubmitEvent): void {
    const form = e.target instanceof HTMLFormElement ? e.target : null;
    const inForm = form && query(adapter().input, form);
    interceptSend(e, inForm ? editableRoot(inForm) : currentEditor());
  }

  // --- Paste / drop ---------------------------------------------------------------

  function onIncoming(e: ClipboardEvent | DragEvent, data: DataTransfer | null): void {
    if (isOurs(e) || !active() || !data) return;
    const s = deps.settings();
    // Files: handled by the upload logic. Any text that came along is caught by the send scan.
    if (data.files.length) return onFiles(e, [...data.files], s);
    if (s.pasteMode === 'off') return;
    const el = editableRoot(e.target);
    if (!el) return;
    const plain = data.getData('text/plain');
    const findings = scan(plain);
    // Hidden secrets in rich text (attributes, hidden spans): force the clean plain-text path.
    const htmlOnly = !findings.length && scan(data.getData('text/html')).length > 0;
    if (!findings.length && !htmlOnly) return;
    stop(e);
    const at: SavedSelection = e instanceof DragEvent
      ? (isTextField(el) ? saveSelection(el) : rangeFromPoint(doc, e.clientX, e.clientY))
      : saveSelection(el);
    busy = true;
    void handleIncoming(el, plain, findings, at, s).finally(() => (busy = false));
  }

  async function insert(el: HTMLElement, text: string, at: SavedSelection, values: string[]): Promise<boolean> {
    const ok = (await insertAt(el, text, at, adapter().write)) && !values.some((v) => readEditor(el).includes(v));
    if (!ok) await failClosed(el, text, values, false);
    return ok;
  }

  async function handleIncoming(el: HTMLElement, plain: string, findings: Finding[], at: SavedSelection, s: Settings) {
    if (!findings.length) {
      await insert(el, plain, at, []);
      return;
    }
    let chosen = findings;
    if (s.pasteMode === 'review') {
      const items = reviewItems(findings);
      const r = await ui.review({
        title: 'Review paste',
        intro: `This paste contains ${plural(items.length, 'item')} that look like secrets or personal data.`,
        items,
        sendLabel: 'Paste as-is',
      });
      rememberAlwaysAllow(r.alwaysAllow);
      if (r.action === 'cancel') return el.focus();
      if (r.action === 'send') {
        vault.allow(items.map((i) => i.key));
        await insert(el, plain, at, []);
        return;
      }
      vault.allow(items.map((i) => i.key).filter((k) => !r.selected.has(k)));
      chosen = findings.filter((f) => r.selected.has(f.value));
    }
    const r = deps.engine().redact(plain, vault.vault, { allowed: vault.allowed }, chosen);
    vault.persist();
    const values = [...new Set(chosen.map((f) => f.value))];
    if (!(await insert(el, r.text, at, values)) || !chosen.length) return;
    deps.onRedacted?.(r.findings.length);
    const pairs = [...new Map(r.placeholders.map((p, i) => [p, r.findings[i]!.value])).entries()];
    ui.toast(`Redacted ${plural(pairs.length, 'item')} from paste.`, [{ label: 'Undo', run: () => void undo(el, pairs) }]);
  }

  // --- File uploads -----------------------------------------------------------------

  const fileScan = (files: File[]) => scanFiles(files, scan);
  const hits = (scans: FileScan[]) => scans.filter((f) => f.findings.length);

  function reportTooLarge(files: File[]): void {
    if (files.length) ui.toast(`${files.map((f) => f.name).join(', ')}: over 2 MB, not scanned for secrets.`);
  }

  function onChange(e: Event): void {
    const input = e.target;
    if (isOurs(e) || !(input instanceof HTMLInputElement) || input.type !== 'file' || !active()) return;
    const files = [...(input.files ?? [])];
    onFiles(e, files, deps.settings(), input);
  }

  function onFiles(e: Event, files: File[], s: Settings, input?: HTMLInputElement): void {
    if (s.fileMode === 'off' || !files.length) return;
    if (s.fileMode === 'warn') return track(armFrom(files));
    stop(e); // redact: the page must not see the originals; we re-dispatch with redacted copies
    track(redactUpload(e, files, input).catch(async () => {
      if (input) input.value = '';
      await ui.failure({ message: "Redactor couldn't make a redacted copy of this upload, so it was cancelled.", allowSend: false });
    }));
  }

  async function armFrom(files: File[]): Promise<void> {
    const { scans, tooLarge } = await fileScan(files);
    reportTooLarge(tooLarge);
    const found = hits(scans);
    if (!found.length) return;
    armed.push(...found.map((f) => ({ name: f.file.name, count: f.findings.length })));
    ui.toast(`${found.map((f) => `${f.file.name}: ${plural(f.findings.length, 'secret')}`).join(', ')}. Remove it before sending, or you'll be asked to confirm.`);
  }

  async function redactUpload(e: Event, files: File[], input?: HTMLInputElement): Promise<void> {
    const { scans, tooLarge } = await fileScan(files);
    reportTooLarge(tooLarge);
    const byFile = new Map(hits(scans).map((f) => [f.file, f]));
    const dt = new DataTransfer();
    let count = 0;
    for (const file of files) {
      const hit = byFile.get(file);
      if (!hit) {
        dt.items.add(file);
        continue;
      }
      const r = deps.engine().redact(hit.text, vault.vault, { allowed: vault.allowed }, hit.findings);
      count += r.findings.length;
      dt.items.add(redactedFile(file, r.text));
    }
    vault.persist();
    if (input) {
      input.files = dt.files;
      input.dispatchEvent(mark(new Event('input', { bubbles: true })));
      input.dispatchEvent(mark(new Event('change', { bubbles: true })));
    } else {
      const init = { bubbles: true, cancelable: true };
      const ev = e instanceof ClipboardEvent
        ? new ClipboardEvent('paste', { ...init, clipboardData: dt })
        : new DragEvent(e.type, { ...init, clientX: (e as DragEvent).clientX, clientY: (e as DragEvent).clientY, dataTransfer: dt });
      const carried = ev instanceof ClipboardEvent ? ev.clipboardData : (ev as DragEvent).dataTransfer;
      // Some engines drop a constructed DataTransfer; then the page would get nothing, so treat it as a failure.
      if (carried?.files.length !== dt.files.length) throw new Error('DataTransfer not carried');
      (e.target as EventTarget).dispatchEvent(mark(ev));
    }
    if (count) deps.onRedacted?.(count);
    if (count) ui.toast(`Uploaded a redacted copy (${plural(count, 'item')} replaced).`);
  }

  // --- Restore mode ---------------------------------------------------------------

  const restorer = createRestorer({
    doc,
    selectors: adapter().messages,
    vault: () => vault.vault,
    quietMs: deps.restoreQuietMs,
    onFirstRestore: () => ui.toast('Restore mode (experimental) is on: originals are shown in this page\'s DOM tree, inside closed shadow roots.'),
  });
  function syncRestore(): void {
    if (deps.settings().restoreMode && active()) restorer.start();
    else restorer.stop();
  }

  // --- Live scan ------------------------------------------------------------------

  let liveTimer: ReturnType<typeof setTimeout> | undefined;
  function onInput(e: Event): void {
    const el = editableRoot(e.target);
    if (!el || !active() || !deps.settings().livePill) return;
    lastEditor = el;
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => {
      const findings = scan(readEditor(el));
      ui.pill(el, reviewItems(findings).length, () => {
        const text = readEditor(el);
        const now = scan(text);
        if (!now.length) return ui.pill(el, 0, () => {});
        void redactEditor(el, text, now, false).then((pairs) => {
          ui.pill(el, 0, () => {});
          if (pairs) ui.toast(`Redacted ${plural(pairs.length, 'item')}.`, [{ label: 'Undo', run: () => void undo(el, pairs) }]);
        });
      });
    }, deps.debounceMs ?? 300);
  }

  function onFocusIn(e: FocusEvent): void {
    const el = editableRoot(e.target);
    if (el) lastEditor = el;
  }

  /** SPA re-renders: warn once (no values) when the site adapter's selectors stop matching. */
  function checkAdapter(): void {
    if (warned || adapter().id === GENERIC.id || !doc.body) return;
    const specific = adapter().input.filter((s) => !GENERIC.input.includes(s));
    if (query(specific)) return;
    if (query(GENERIC.input)) {
      warned = true;
      deps.warn(`${adapter().name} adapter selectors not found; using the generic fallback.`);
    }
  }

  const listeners: Array<[string, (e: never) => void]> = [
    ['keydown', onKeydown], ['click', onClick], ['submit', onSubmit],
    ['paste', (e: ClipboardEvent) => onIncoming(e, e.clipboardData)],
    ['drop', (e: DragEvent) => onIncoming(e, e.dataTransfer)],
    ['input', onInput], ['focusin', onFocusIn], ['change', onChange],
  ];
  let observer: MutationObserver | undefined;

  return {
    install(): void {
      for (const [type, fn] of listeners) win.addEventListener(type, fn as EventListener, true);
      let pending: ReturnType<typeof setTimeout> | undefined;
      observer = new MutationObserver(() => {
        pending ??= setTimeout(() => {
          pending = undefined;
          checkAdapter();
        }, 1000);
      });
      observer.observe(doc.documentElement, { childList: true, subtree: true });
      syncRestore();
    },
    uninstall(): void {
      for (const [type, fn] of listeners) win.removeEventListener(type, fn as EventListener, true);
      observer?.disconnect();
      restorer.stop();
    },
    /** Call after settings change. */
    settingsChanged: syncRestore,
    /** For the "Redact current input" command (Phase 4). */
    async redactCurrent(): Promise<void> {
      const el = currentEditor();
      if (!el) return;
      const text = readEditor(el);
      const findings = scan(text);
      if (findings.length) await redactEditor(el, text, findings, false);
    },
  };
}
