import { PLACEHOLDER_RE, type Vault } from '../engine/vault';

/**
 * Restore mode (experimental, off by default): shows originals in place of placeholders in the transcript.
 * Each placeholder becomes <redactor-restore>: its light DOM keeps the placeholder text (what page scripts
 * reading textContent see), and a closed shadow root without a slot renders the original instead.
 * Messages are only touched once they've been quiet for `quietMs`, so streaming isn't disturbed.
 */
export interface RestorerDeps {
  doc: Document;
  selectors: string[];
  vault(): Vault;
  quietMs?: number;
  /** Called once, the first time an original is put back into the page. */
  onFirstRestore?(): void;
}

const TAG = 'redactor-restore';
const HAS_PLACEHOLDER = new RegExp(PLACEHOLDER_RE.source);
const CSS = `span { background: #fff4c2; color: #5c3b00; border-radius: 3px; padding: 0 2px; font: inherit; }
@media (prefers-color-scheme: dark) { span { background: #4a3b00; color: #ffe9a8; } }`;

export function createRestorer({ doc, selectors, vault, quietMs = 800, onFirstRestore }: RestorerDeps) {
  const timers = new Map<Element, ReturnType<typeof setTimeout>>();
  const hosts = new Set<HTMLElement>();
  const selector = selectors.join(',');
  let notified = false;
  let observer: MutationObserver | undefined;

  function schedule(msg: Element): void {
    clearTimeout(timers.get(msg));
    timers.set(msg, setTimeout(() => {
      timers.delete(msg);
      process(msg);
    }, quietMs));
  }

  function messagesFor(node: Node): Element[] {
    const el = node instanceof Element ? node : node.parentElement;
    if (!el || el.closest(TAG)) return [];
    const own = el.closest(selector);
    return own ? [own] : [...el.querySelectorAll(selector)];
  }

  function makeHost(placeholder: string, original: string): HTMLElement {
    const host = doc.createElement(TAG);
    host.textContent = placeholder;
    const root = host.attachShadow({ mode: 'closed' });
    const style = doc.createElement('style');
    style.textContent = CSS;
    const span = doc.createElement('span');
    span.title = `Restored locally by Redactor (sent as ${placeholder})`;
    span.textContent = original;
    root.append(style, span);
    hosts.add(host);
    return host;
  }

  function process(msg: Element): void {
    if (!msg.isConnected) return;
    const v = vault();
    const walker = doc.createTreeWalker(msg, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const p = n.parentElement;
      if (p && !p.closest(`${TAG}, [contenteditable]:not([contenteditable="false"]), textarea`) && HAS_PLACEHOLDER.test(n.nodeValue ?? ''))
        nodes.push(n as Text);
    }
    for (const node of nodes) {
      const text = node.nodeValue ?? '';
      const parts: Node[] = [];
      let pos = 0;
      for (const m of text.matchAll(PLACEHOLDER_RE)) {
        const original = v.lookup(m[0]);
        if (original === undefined) continue;
        if (m.index > pos) parts.push(doc.createTextNode(text.slice(pos, m.index)));
        parts.push(makeHost(m[0], original));
        pos = m.index + m[0].length;
      }
      if (pos === 0) continue;
      if (pos < text.length) parts.push(doc.createTextNode(text.slice(pos)));
      node.replaceWith(...parts);
      if (!notified) {
        notified = true;
        onFirstRestore?.();
      }
    }
  }

  return {
    start(): void {
      if (observer || !selector) return;
      observer = new MutationObserver((records) => {
        for (const r of records) {
          for (const m of messagesFor(r.target)) schedule(m);
          for (const n of r.addedNodes) for (const m of messagesFor(n)) schedule(m);
        }
      });
      observer.observe(doc.documentElement, { childList: true, characterData: true, subtree: true });
      for (const m of doc.querySelectorAll(selector)) schedule(m);
    },
    /** Stop and put the placeholders back. */
    stop(): void {
      observer?.disconnect();
      observer = undefined;
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
      for (const h of hosts) if (h.isConnected) h.replaceWith(doc.createTextNode(h.textContent ?? ''));
      hosts.clear();
    },
  };
}
