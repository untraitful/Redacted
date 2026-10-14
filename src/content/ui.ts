export interface ReviewItem {
  /** Opaque key (the value itself); never rendered. */
  key: string;
  label: string;
  name: string;
  /** Masked preview, e.g. `sk-p…3Q2a (51)`. */
  preview: string;
  count: number;
  /** The placeholder it will become, e.g. `[OPENAI_API_KEY_1]`. */
  placeholder?: string;
  /** 1-based line of the first occurrence in the message. */
  line?: number;
}

export interface ReviewResult {
  action: 'redact' | 'send' | 'cancel';
  selected: Set<string>;
  alwaysAllow: Set<string>;
}

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface Ui {
  /** `tone: 'blocked'` marks the dialog as a hard stop (block mode). */
  review(opts: { title: string; intro: string; items: ReviewItem[]; sendLabel: string; tone?: 'review' | 'blocked' }): Promise<ReviewResult>;
  /** Blocking notice. `redacted` adds a "Copy redacted text" button; `allowSend` adds an explicit "Send anyway". */
  failure(opts: { title?: string; message: string; redacted?: string; allowSend: boolean }): Promise<'send' | 'cancel'>;
  /** `anchor` (the editor) places the toast just above it instead of over the page corner. */
  toast(message: string, actions?: ToastAction[], anchor?: HTMLElement | null): void;
  pill(anchor: HTMLElement | null, count: number, onRedact: () => void): void;
}

// Request-for-Comments world: paper and ink, hairline rules, one text size ranked by weight, mono only for
// keys, masked values, header blocks and positions. Citation blue is for keys; rubric red only for the risky action.
// Sizes stay in px on purpose: host pages often shrink the root font, which would shrink rem-based UI;
// browser zoom still scales px, which is what WCAG 1.4.4 needs.
const CSS = `
:host {
  all: initial;
  --paper: #f6f5ef; --paper-2: #ecebe3; --ink: #17171b; --ink-2: #45454d; --muted: #66666d; --rule: #cbc9bf;
  --cite: #1f4fb8; --rubric: #b3261e; --scrim: rgb(10 10 12 / .55);
  --shadow: 0 18px 50px rgb(0 0 0 / .35), 0 2px 6px rgb(0 0 0 / .12);
  --sans: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --mono: ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace;
}
@media (prefers-color-scheme: dark) {
  :host {
    --paper: #18181c; --paper-2: #222228; --ink: #ecebe4; --ink-2: #c6c5bd; --muted: #a2a2a9; --rule: #3b3b43;
    --cite: #94b3ff; --rubric: #ff8f80; --scrim: rgb(0 0 0 / .62);
  }
}
* { box-sizing: border-box; margin: 0; }
.surface, button, input, textarea { font: 14px/1.5 var(--sans); letter-spacing: normal; text-transform: none; }
.surface { color: var(--ink); }
code, .key, .pos, .hdr { font-family: var(--mono); font-size: 13px; }
::selection { background: var(--cite); color: var(--paper); }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

.backdrop { position: fixed; inset: 0; background: var(--scrim); display: grid; place-items: center; padding: 16px; z-index: 2147483647;
  animation: fade 140ms ease-out; }
.doc { container-type: inline-size; width: min(640px, 100%); max-height: calc(100dvh - 32px); display: flex; flex-direction: column;
  background: var(--paper); border-radius: 4px; box-shadow: var(--shadow); overflow: hidden; animation: rise 200ms cubic-bezier(.16, 1, .3, 1); }

/* RFC header block: who is speaking and about what (left), where and when (right). */
.hdr { display: grid; grid-template-columns: 1fr auto; gap: 0 24px; padding: 16px 28px 12px; border-bottom: 1px solid var(--ink); line-height: 1.55; }
.hdr .r { text-align: right; }
.hdr .k { color: var(--muted); }
.blocked .hdr { border-bottom-color: var(--rubric); }
.blocked .hdr .cat { color: var(--rubric); }

h2 { font-size: 14px; font-weight: 700; padding: 18px 28px 0; text-wrap: balance; }
.lead { color: var(--ink-2); padding: 2px 28px 0; text-wrap: pretty; }
.body { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 16px 28px 0; scrollbar-color: var(--rule) transparent;
  /* Scroll shadows: paper covers fade in once the list scrolls, so a clipped list signals there is more below. */
  background: linear-gradient(var(--paper) 30%, transparent) top / 100% 32px no-repeat local,
    linear-gradient(transparent, var(--paper) 70%) bottom / 100% 32px no-repeat local,
    linear-gradient(rgb(0 0 0 / .16), transparent) top / 100% 10px no-repeat scroll,
    linear-gradient(transparent, rgb(0 0 0 / .16)) bottom / 100% 10px no-repeat scroll; }
.sec { font-weight: 700; padding-bottom: 6px; }
.note { color: var(--ink-2); padding: 14px 28px 0; text-wrap: pretty; }

/* References: hairline-ruled, keys hang in their own column. */
.refs { list-style: none; padding: 0; border-top: 1px solid var(--rule); }
.ref { display: grid; grid-template-columns: 18px minmax(0, 1fr) auto; gap: 2px 14px; align-items: start; padding: 11px 0;
  border-bottom: 1px solid var(--rule); }
.ref input { width: 16px; height: 16px; margin: 2px 0 0; accent-color: var(--cite); cursor: pointer; }
.pick { display: contents; cursor: pointer; }
.cite { display: grid; grid-template-columns: minmax(0, 220px) minmax(0, 1fr); gap: 0 14px; min-width: 0; }
.key { color: var(--cite); font-weight: 600; overflow-wrap: anywhere; }
.src { min-width: 0; }
.src b { font-weight: 600; }
.src .meta { color: var(--muted); }
.src code { color: var(--ink-2); overflow-wrap: anywhere; }
.side { display: grid; justify-items: end; gap: 6px; }
.pos { color: var(--muted); white-space: nowrap; }
/* State reads in line form as well as colour: struck when skipped, dashed when allowed. */
.ref[data-state="skip"] .key { color: var(--muted); text-decoration: line-through; }
.ref:not([data-state="skip"]) .skipped { display: none; }
.ref[data-state="allow"] .key { color: var(--muted); text-decoration: underline dashed; text-underline-offset: 4px; }
.allowed-note { grid-column: 2 / -1; color: var(--ink-2); }
.ref:not([data-state="allow"]) .allowed-note { display: none; }

.foot { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; padding: 16px 28px 20px; margin-top: 16px; border-top: 1px solid var(--ink); }
.actions { display: flex; gap: 8px; margin-left: auto; }
button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 34px; padding: 6px 16px;
  border: 1px solid var(--ink); border-radius: 3px; background: transparent; color: var(--ink); cursor: pointer; }
button:hover { background: var(--paper-2); }
button.primary { background: var(--ink); color: var(--paper); font-weight: 600; }
button.primary:hover { background: var(--ink-2); border-color: var(--ink-2); }
button.allow { min-height: 26px; padding: 2px 10px; font-size: 13px; border-color: var(--rule); color: var(--ink-2); }
button.allow[aria-pressed="true"] { border-color: var(--ink); background: var(--paper-2); color: var(--ink); font-weight: 600; }
/* The risky path: available, explicit, never styled like a safe choice. */
button.risk { border-color: transparent; color: var(--rubric); padding-inline: 2px; text-decoration: underline;
  text-underline-offset: 3px; text-decoration-thickness: 1px; }
button.risk:hover { background: transparent; text-decoration-thickness: 2px; }
button:focus-visible, input:focus-visible, textarea:focus-visible { outline: 2px solid var(--cite); outline-offset: 2px; }

.message { padding: 14px 28px 0; text-wrap: pretty; }
.status:not(:empty) { margin: 12px 28px 0; padding: 8px 12px; background: var(--paper-2); border-top: 1px solid var(--ink); font-weight: 600; }
.manual { display: block; width: calc(100% - 56px); margin: 8px 28px 0; min-height: 96px; padding: 8px 10px; resize: vertical;
  font: 13px/1.45 var(--mono); color: var(--ink); background: var(--paper-2); border: 1px solid var(--rule); border-radius: 3px; }

@container (max-width: 460px) {
  .hdr, h2, .lead, .note, .message, .foot, .body { padding-inline: 18px; }
  .manual { margin-inline: 18px; width: calc(100% - 36px); }
  .cite { grid-template-columns: 1fr; gap: 2px; }
  .ref { grid-template-columns: 18px minmax(0, 1fr); }
  .side { grid-column: 2; justify-items: start; grid-auto-flow: column; align-items: center; gap: 12px; }
  .actions { width: 100%; }
  .actions button { flex: 1; }
}

.toast { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; display: flex; gap: 6px 14px; align-items: center; flex-wrap: wrap;
  max-width: min(460px, calc(100vw - 32px)); padding: 8px 8px 8px 14px; border: 1px solid var(--ink); border-radius: 4px;
  background: var(--paper); box-shadow: 0 10px 30px rgb(0 0 0 / .3); animation: rise 180ms cubic-bezier(.16, 1, .3, 1); }
.toast .who { font: 600 13px var(--mono); color: var(--ink); }
.toast .msg { flex: 1 1 200px; }
.toast button { min-height: 30px; padding: 3px 12px; }
.toast kbd { font: 12px var(--mono); color: var(--muted); }

.pill { position: fixed; z-index: 2147483647; min-height: 28px; padding: 3px 12px; gap: 8px; border: 1px solid var(--ink); border-radius: 3px;
  background: var(--paper); color: var(--ink); font: 13px/1.4 var(--mono); box-shadow: 0 4px 14px rgb(0 0 0 / .25); }
.pill .n { color: var(--cite); font-weight: 700; }

@media (pointer: coarse) { button { min-height: 44px; } button.allow, .pill { min-height: 36px; } }
@media (forced-colors: active) { .doc, .toast { border: 1px solid CanvasText; } }
@media (prefers-reduced-motion: reduce) { .backdrop, .doc, .toast { animation: none; } }
@keyframes fade { from { opacity: .4; } }
@keyframes rise { from { opacity: .5; transform: translateY(6px); } }
`;

const FOCUSABLE = 'button, input, textarea, [tabindex]:not([tabindex="-1"])';
// The host is a zero-size fixed layer. Inline !important beats page stylesheets (even their !important rules),
// so a page can't hide the UI (display:none) or leak styles into it through inheritance.
const HOST_LOCK: Array<[string, string]> = [
  ['all', 'initial'], ['display', 'block'], ['position', 'fixed'], ['top', '0'], ['left', '0'], ['width', '0'], ['height', '0'],
  ['overflow', 'visible'], ['z-index', '2147483647'], ['visibility', 'visible'], ['opacity', '1'], ['transform', 'none'],
  ['filter', 'none'], ['clip-path', 'none'], ['pointer-events', 'auto'],
];
const TOAST_MS = 6000;
const TOAST_UNDO_MS = 15000;

export function createUi(doc: Document): Ui {
  const win = doc.defaultView ?? window;
  const isMac = /Mac|iPhone|iPad/.test(win.navigator.platform);
  let host: HTMLElement | null = null;
  let root: ShadowRoot | null = null;
  let announcer: HTMLElement | null = null;

  const h = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] => {
    const el: HTMLElementTagNameMap[K] = Object.assign(doc.createElement(tag), props);
    el.append(...kids);
    return el;
  };

  const shadow = (): ShadowRoot => {
    if (!host) {
      host = doc.createElement('redactor-ui');
      for (const [p, v] of HOST_LOCK) host.style.setProperty(p, v, 'important');
      // Keep page-level hotkeys from reacting to typing inside our UI.
      for (const t of ['keydown', 'keyup', 'keypress']) host.addEventListener(t, (e) => e.stopPropagation());
      root = host.attachShadow({ mode: 'closed' });
      const style = doc.createElement('style');
      style.textContent = CSS;
      announcer = h('div', { className: 'sr-only' });
      announcer.setAttribute('role', 'status');
      root.append(style, announcer);
    }
    // A page that removes our layer gets it back the next time we need to show something.
    if (!host.isConnected) (doc.body ?? doc.documentElement).append(host);
    return root!;
  };

  /** RFC-style header block: who is speaking and about what (left), where and when (right). */
  /** `category` is metadata the title doesn't already say: the reference count, or the send status. */
  const headerBlock = (category: string) => {
    const date = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
    return h('div', { className: 'hdr' },
      h('div', {}, 'Redactor', h('br'), h('span', { className: 'k cat', textContent: category })),
      h('div', { className: 'r' }, doc.location?.host || 'this page', h('br'), h('span', { className: 'k', textContent: date })));
  };

  /** Modal dialog: focus-trapped, Esc cancels, focus returns to where it was. */
  function modal<T>(
    opts: { title: string; category: string; tone: 'review' | 'blocked'; describe: HTMLElement },
    build: (close: (v: T) => void) => { body: Node[]; risk?: HTMLButtonElement; buttons: HTMLButtonElement[] },
    onEsc: T,
  ): Promise<T> {
    return new Promise((resolve) => {
      const previous = doc.activeElement as HTMLElement | null;
      const uid = Math.random().toString(36).slice(2);
      const backdrop = h('div', { className: 'backdrop' });
      const close = (v: T) => {
        backdrop.remove();
        previous?.focus?.();
        resolve(v);
      };
      const { body, risk, buttons } = build(close);
      const title = h('h2', { id: `redactor-title-${uid}`, textContent: opts.title });
      opts.describe.id = `redactor-desc-${uid}`;
      const foot = h('div', { className: 'foot' });
      if (risk) {
        risk.classList.add('risk');
        foot.append(risk);
      }
      foot.append(h('div', { className: 'actions' }, ...buttons));
      const panel = h('div', { className: `doc surface${opts.tone === 'blocked' ? ' blocked' : ''}` },
        headerBlock(opts.category), title, ...body, foot);
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      panel.setAttribute('aria-labelledby', title.id);
      panel.setAttribute('aria-describedby', opts.describe.id);
      panel.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          close(onEsc);
        } else if (e.key === 'Tab') {
          const f = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);
          const i = f.indexOf(shadow().activeElement as HTMLElement);
          const next = e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : i === f.length - 1 ? 0 : i + 1;
          e.preventDefault();
          f[next]?.focus();
        }
      });
      backdrop.append(panel);
      shadow().append(backdrop);
      buttons.find((b) => b.classList.contains('primary'))?.focus();
    });
  }

  // --- Toast ---------------------------------------------------------------------
  let toastCleanup: () => void = () => {};

  function placeNear(el: HTMLElement, anchor: HTMLElement | null | undefined): void {
    if (!anchor?.isConnected) return;
    const r = anchor.getBoundingClientRect();
    const w = el.offsetWidth;
    const hgt = el.offsetHeight;
    // Prefer just above the editor's left edge (the send button usually sits at its right), else just below it.
    let top = r.top - hgt - 10;
    if (top < 8) top = r.bottom + 10;
    if (top + hgt > win.innerHeight - 8) return; // no room either side: keep the corner placement
    el.style.top = `${top}px`;
    el.style.left = `${Math.min(Math.max(8, r.left), win.innerWidth - w - 8)}px`;
    el.style.right = 'auto';
    el.style.bottom = 'auto';
  }

  // --- Pill ----------------------------------------------------------------------
  let pillEl: HTMLButtonElement | null = null;
  let pillCountEl: HTMLElement | null = null;
  let pillWord: HTMLElement | null = null;
  let pillAnchor: HTMLElement | null = null;
  let pillCount = 0;
  let pillAction: () => void = () => {};
  let pillFrame = 0;
  const placePill = () => {
    pillFrame = 0;
    if (!pillEl || !pillAnchor?.isConnected) return;
    const r = pillAnchor.getBoundingClientRect();
    const top = r.top - pillEl.offsetHeight - 6;
    pillEl.style.top = `${top >= 4 ? top : r.top + 6}px`;
    pillEl.style.left = `${Math.max(4, Math.min(r.right - pillEl.offsetWidth - 8, win.innerWidth - pillEl.offsetWidth - 4))}px`;
  };
  const schedulePill = () => {
    if (!pillFrame) pillFrame = win.requestAnimationFrame(placePill);
  };

  return {
    review({ title, intro, items, sendLabel, tone = 'review' }) {
      const selected = new Set(items.map((i) => i.key));
      const alwaysAllow = new Set<string>();
      const introEl = h('p', { className: 'lead', textContent: intro });
      return modal<ReviewResult>({ title, tone, describe: introEl, category: `References: ${items.length}${tone === 'blocked' ? ' · held' : ''}` }, (close) => {
        const list = h('ol', { className: 'refs' });
        items.forEach((item, n) => {
          const row = h('li', { className: 'ref' });
          row.dataset.state = 'redact';
          const box = h('input', { type: 'checkbox', checked: true });
          const keyId = `redactor-key-${n}-${Math.random().toString(36).slice(2, 7)}`;
          const sync = () => {
            row.dataset.state = alwaysAllow.has(item.key) ? 'allow' : box.checked ? 'redact' : 'skip';
          };
          box.addEventListener('change', () => {
            if (box.checked) selected.add(item.key);
            else selected.delete(item.key);
            sync();
          });
          const allow = h('button', { type: 'button', className: 'allow', textContent: 'Always allow' });
          allow.setAttribute('aria-pressed', 'false');
          allow.setAttribute('aria-describedby', keyId);
          allow.addEventListener('click', () => {
            const on = !alwaysAllow.has(item.key);
            if (on) alwaysAllow.add(item.key);
            else alwaysAllow.delete(item.key);
            allow.setAttribute('aria-pressed', String(on));
            allow.textContent = on ? 'Allowed' : 'Always allow';
            box.checked = !on;
            box.dispatchEvent(new Event('change'));
          });
          const times = item.count > 1 ? `, ${item.count}×` : '';
          row.append(
            h('label', { className: 'pick' }, box,
              h('span', { className: 'cite' },
                h('span', { className: 'key', id: keyId, textContent: item.placeholder ?? `[${item.label}]` }),
                h('span', { className: 'src' }, h('b', { textContent: item.name }), h('span', { className: 'meta', textContent: times }),
                  h('span', { className: 'meta skipped', textContent: ', sent as-is' }),
                  h('br'), h('code', { textContent: item.preview })))),
            h('span', { className: 'side' }, item.line ? h('span', { className: 'pos', textContent: `line ${item.line}` }) : '', allow),
            h('p', { className: 'allowed-note', textContent: "Won't be flagged again. Remove it in Settings → Allowlist." }));
          list.append(row);
        });
        const btn = (text: string, action: ReviewResult['action'], primary = false) => {
          const b = h('button', { type: 'button', textContent: text, className: primary ? 'primary' : '' });
          b.addEventListener('click', () => close({ action, selected, alwaysAllow }));
          return b;
        };
        return {
          body: [introEl, h('div', { className: 'body' }, h('p', { className: 'sec', textContent: 'References' }), list),
            h('p', { className: 'note', textContent: 'Checked items are sent as keys; the originals stay in this browser.' })],
          risk: btn(sendLabel, 'send'),
          buttons: [btn('Cancel', 'cancel'), btn('Redact selected', 'redact', true)],
        };
      }, { action: 'cancel', selected, alwaysAllow });
    },

    failure({ title = "Redactor couldn't redact this", message, redacted, allowSend }) {
      const messageEl = h('p', { className: 'message', textContent: message });
      return modal<'send' | 'cancel'>({ title, tone: 'blocked', describe: messageEl, category: 'Status: nothing sent' }, (close) => {
        const status = h('p', { className: 'status' });
        status.setAttribute('role', 'status');
        const cancel = h('button', { type: 'button', textContent: 'Cancel', className: redacted === undefined ? 'primary' : '' });
        cancel.addEventListener('click', () => close('cancel'));
        const buttons = [cancel];
        if (redacted !== undefined) {
          const copy = h('button', { type: 'button', className: 'primary', textContent: 'Copy redacted text' });
          let manual: HTMLTextAreaElement | null = null;
          copy.addEventListener('click', async () => {
            if (await copyText(doc, redacted)) {
              status.textContent = 'Copied. Paste it into the message box.';
              return;
            }
            // Clipboard blocked: show the (already redacted) text so it can be copied by hand.
            status.textContent = "Couldn't copy automatically. Select the text below and copy it.";
            if (!manual) {
              manual = h('textarea', { className: 'manual', value: redacted, readOnly: true });
              manual.setAttribute('aria-label', 'Redacted text');
              status.after(manual);
            }
            manual.focus();
            manual.select();
          });
          buttons.push(copy);
        }
        let risk: HTMLButtonElement | undefined;
        if (allowSend) {
          risk = h('button', { type: 'button', textContent: 'Send anyway' });
          risk.addEventListener('click', () => close('send'));
        }
        return { body: [messageEl, status], risk, buttons };
      }, 'cancel');
    },

    toast(message, actions = [], anchor) {
      toastCleanup();
      const el = h('div', { className: 'toast surface' }, h('span', { className: 'who', textContent: 'Redactor' }),
        h('span', { className: 'msg', textContent: message }));
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      const first = actions[0];
      for (const a of actions) {
        const b = h('button', { type: 'button', textContent: a.label });
        if (a === first) {
          b.setAttribute('aria-keyshortcuts', 'Alt+Z');
          b.append(h('kbd', { textContent: isMac ? '⌥Z' : 'Alt+Z' }));
        }
        b.addEventListener('click', () => {
          toastCleanup();
          a.run();
        });
        el.append(b);
      }
      shadow().append(el);
      placeNear(el, anchor);

      // Timer pauses while the pointer or focus is on the toast (WCAG 2.2.1), and runs longer when it carries Undo.
      let remaining = first ? TOAST_UNDO_MS : TOAST_MS;
      let started = Date.now();
      let timer: ReturnType<typeof setTimeout> | undefined = setTimeout(() => toastCleanup(), remaining);
      const pause = () => {
        if (timer === undefined) return;
        clearTimeout(timer);
        timer = undefined;
        remaining -= Date.now() - started;
      };
      const resume = () => {
        if (timer !== undefined || el.matches(':hover') || el.contains(shadow().activeElement)) return;
        started = Date.now();
        timer = setTimeout(() => toastCleanup(), Math.max(remaining, 2000));
      };
      el.addEventListener('pointerenter', pause);
      el.addEventListener('pointerleave', resume);
      el.addEventListener('focusin', pause);
      el.addEventListener('focusout', () => setTimeout(resume, 0));
      // Alt+Z runs the toast's first action (Undo) from anywhere, so keyboard users never have to hunt for it.
      const onKey = (e: KeyboardEvent) => {
        if (!first || e.code !== 'KeyZ' || !e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        toastCleanup();
        first.run();
      };
      win.addEventListener('keydown', onKey, true);
      toastCleanup = () => {
        clearTimeout(timer);
        win.removeEventListener('keydown', onKey, true);
        el.remove();
        toastCleanup = () => {};
      };
    },

    pill(anchor, count, onRedact) {
      pillAction = onRedact;
      if (!anchor || count === 0) {
        if (pillEl) {
          pillEl.remove();
          pillEl = null;
          win.removeEventListener('scroll', schedulePill, true);
          win.removeEventListener('resize', schedulePill);
        }
        pillCount = 0;
        return;
      }
      if (!pillEl) {
        pillCountEl = h('span', { className: 'n' });
        pillWord = h('span');
        pillEl = h('button', { type: 'button', className: 'pill surface' }, pillCountEl, pillWord, h('span', { textContent: '· Redact' }));
        pillEl.addEventListener('mousedown', (e) => e.preventDefault()); // keep the editor's focus and selection
        pillEl.addEventListener('click', () => pillAction());
        win.addEventListener('scroll', schedulePill, { capture: true, passive: true });
        win.addEventListener('resize', schedulePill, { passive: true });
      }
      shadow().append(pillEl);
      const noun = `${count} ${count === 1 ? 'secret' : 'secrets'}`;
      pillCountEl!.textContent = `[${count}]`;
      pillWord!.textContent = count === 1 ? 'secret' : 'secrets';
      pillEl.setAttribute('aria-label', `Redact ${noun} detected in your message`);
      if (count !== pillCount && announcer) announcer.textContent = `Redactor: ${noun} detected in your message.`;
      pillCount = count;
      pillAnchor = anchor;
      placePill();
    },
  };
}

async function copyText(doc: Document, text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = Object.assign(doc.createElement('textarea'), { value: text });
    doc.body.append(ta);
    ta.select();
    const ok = doc.execCommand('copy');
    ta.remove();
    return ok;
  }
}
