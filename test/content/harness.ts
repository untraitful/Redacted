// Shared DOM harness: a fake chat page with an editor, a send button, a file input and a transcript.
import { afterEach } from 'vitest';
import { createEngine } from '../../src/engine/engine';
import { createController } from '../../src/content/controller';
import { readEditor } from '../../src/content/editor';
import type { ReviewResult, Ui } from '../../src/content/ui';
import { VaultClient } from '../../src/content/vault-client';
import { DEFAULT_SETTINGS, type Settings } from '../../src/shared/settings';
import type { SiteAdapter } from '../../src/sites';

export const KEY = 'ghp_' + 'aB3dE5gH7jK9mN1pQ3sT5vW7yZ9bC1dE3fG5'.slice(0, 36);
export const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
export const until = async (pred: () => boolean, ms = 1000) => {
  const end = Date.now() + ms;
  while (!pred()) {
    if (Date.now() > end) throw new Error('timeout');
    await tick(5);
  }
};

const adapter: SiteAdapter = {
  id: 'test', name: 'Test', hosts: ['test.local'], input: ['#ed'], send: ['#send'], messages: ['.msg'],
  write: ['paste', 'insertText'], verified: true,
};

type ReviewFn = (items: string[]) => Partial<ReviewResult> & { action: ReviewResult['action'] };

export function setup(opts: { editor: 'textarea' | 'react' | 'prosemirror' | 'rejecting'; settings?: Partial<Settings>; review?: ReviewFn; failure?: 'send' | 'cancel'; quietMs?: number }) {
  document.body.innerHTML = '';
  const settings: Settings = { ...DEFAULT_SETTINGS, ...opts.settings };
  const sent: string[] = [];
  const calls = { review: [] as Array<{ title: string; previews: string[] }>, toasts: [] as Array<{ msg: string; undo?: () => void }>,
    failures: [] as string[], pills: [] as number[], allowlist: [] as string[], warns: [] as string[] };

  const form = document.createElement('form');
  let el: HTMLElement;
  let reactState = '';
  if (opts.editor === 'textarea' || opts.editor === 'react') {
    const ta = document.createElement('textarea');
    if (opts.editor === 'react') {
      // Mimic React's value tracker: an instance-level setter records the "known" value, and onChange
      // only fires when the DOM value differs from it. Plain `.value =` would be swallowed.
      const proto = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!;
      let tracked = '';
      Object.defineProperty(ta, 'value', {
        configurable: true,
        get() { return proto.get!.call(this); },
        set(v: string) { tracked = v; proto.set!.call(this, v); },
      });
      ta.addEventListener('input', () => {
        const now = proto.get!.call(ta) as string;
        if (now !== tracked) { tracked = now; reactState = now; }
      });
    }
    el = ta;
  } else {
    el = document.createElement('div');
    el.setAttribute('contenteditable', 'true');
    if (opts.editor === 'prosemirror') {
      // Handles paste itself, like ProseMirror/Quill/Lexical.
      el.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = (e as ClipboardEvent).clipboardData!.getData('text/plain');
        const r = document.getSelection()!.getRangeAt(0);
        r.deleteContents();
        r.insertNode(document.createTextNode(text));
      });
    }
    // execCommand doesn't exist in happy-dom; the rejecting editor accepts it but changes nothing.
    (document as unknown as { execCommand: () => boolean }).execCommand = () => true;
  }
  el.id = 'ed';
  const send = document.createElement('button');
  send.id = 'send';
  send.type = 'button';
  const file = Object.assign(document.createElement('input'), { type: 'file', id: 'file', multiple: true });
  const log = document.createElement('div');
  form.append(el, send, file);
  document.body.append(log, form);
  // What the page's own upload handlers receive.
  const uploads: string[][] = [];
  const pageFiles = (files: FileList | null | undefined) => Promise.all([...(files ?? [])].map((f) => f.text())).then((t) => uploads.push(t));
  file.addEventListener('change', () => void pageFiles(file.files));
  document.addEventListener('paste', (e) => { if (e.clipboardData?.files.length) void pageFiles(e.clipboardData.files); });
  // The "site": sends on Enter and on button click, unless something stopped the event first.
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.defaultPrevented) sent.push(readEditor(el));
  });
  send.addEventListener('click', () => sent.push(readEditor(el)));

  const ui: Ui = {
    review: async ({ title, items }) => {
      calls.review.push({ title, previews: items.map((i) => i.preview) });
      const r = (opts.review ?? (() => ({ action: 'redact' })))(items.map((i) => i.key));
      return { selected: new Set(items.map((i) => i.key)), alwaysAllow: new Set(), ...r };
    },
    failure: async ({ message }) => { calls.failures.push(message); return opts.failure ?? 'cancel'; },
    toast: (msg, actions) => calls.toasts.push({ msg, undo: actions?.[0]?.run }),
    pill: (_a, n) => calls.pills.push(n),
  };
  const vault = new VaultClient(async () => true, 'bracket');
  const engine = createEngine(settings);
  const ctrl = createController({
    win: window, doc: document, host: 'test.local', adapter: () => adapter, settings: () => settings, engine: () => engine, vault, ui,
    addToAllowlist: (e) => calls.allowlist.push(...e), warn: (m) => calls.warns.push(m), debounceMs: 0, restoreQuietMs: opts.quietMs,
  });
  ctrl.install();
  const setText = (t: string) => (el instanceof HTMLTextAreaElement ? (el.value = t) : (el.textContent = t));
  const enter = (init: KeyboardEventInit = {}) => {
    el.focus();
    const e = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...init });
    el.dispatchEvent(e);
    return e;
  };
  const paste = (data: Record<string, string>, file?: File) => {
    const dt = new DataTransfer();
    for (const [k, v] of Object.entries(data)) dt.setData(k, v);
    if (file) dt.items.add(file);
    el.focus();
    const e = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
    el.dispatchEvent(e);
    return e;
  };
  return { el, sent, calls, vault, ctrl, setText, enter, paste, send, file, log, uploads, react: () => reactState, settings };
}

let current: ReturnType<typeof setup> | undefined;
export const use = (o: Parameters<typeof setup>[0]) => (current = setup(o));
afterEach(() => current?.ctrl.uninstall());
