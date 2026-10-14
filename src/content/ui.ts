export interface ReviewItem {
  /** Opaque key (the value itself); never rendered. */
  key: string;
  label: string;
  name: string;
  /** Masked preview, e.g. `sk-p…3Q2a (51)`. */
  preview: string;
  count: number;
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

// Sizes stay in px on purpose: host pages often shrink the root font (62.5% tricks), which would shrink rem-based UI.
// Browser zoom still scales px, which is what WCAG 1.4.4 needs.
const CSS = `
:host {
  all: initial;
  --surface: #fff; --surface-2: #f6f7f9; --line: #dcdfe4; --text: #1a1a1a; --muted: #4b5058;
  --brand: #1f6feb; --brand-ink: #0b3d91; --brand-tint: #e7f0ff; --danger: #b42318; --danger-fill: #b42318;
  --scrim: rgb(0 0 0 / .45); --shadow: 0 16px 48px rgb(0 0 0 / .28), 0 2px 6px rgb(0 0 0 / .12);
}
@media (prefers-color-scheme: dark) {
  :host {
    --surface: #1e1e1e; --surface-2: #262626; --line: #3a3a3a; --text: #eee; --muted: #b8bcc4;
    --brand-ink: #cfe0ff; --brand-tint: #1d3357; --danger: #ff8a80; --scrim: rgb(0 0 0 / .6);
  }
}
* { box-sizing: border-box; margin: 0; }
.surface, button, input, textarea { font: 14px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; letter-spacing: normal; text-transform: none; }
::selection { background: var(--brand); color: #fff; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

/* Mark: the toolbar icon's redaction bar. Blue = Redactor reviewing, red = a send is being held back. */
.mark { flex: none; width: 26px; height: 26px; color: var(--brand); display: block; }
.mark svg { display: block; width: 100%; height: 100%; }
.danger .mark { color: var(--danger-fill); }

.backdrop { position: fixed; inset: 0; background: var(--scrim); display: grid; place-items: center; padding: 16px; z-index: 2147483647;
  animation: fade 160ms ease-out; }
.panel { container-type: inline-size; width: min(560px, 100%); max-height: calc(100dvh - 32px); display: flex; flex-direction: column;
  background: var(--surface); color: var(--text); border-radius: 14px; box-shadow: var(--shadow); overflow: hidden;
  animation: rise 220ms cubic-bezier(.16, 1, .3, 1); }
.head { display: flex; gap: 12px; align-items: center; padding: 20px 20px 0; }
h2 { font-size: 17px; line-height: 1.3; font-weight: 650; text-wrap: balance; }
p { text-wrap: pretty; }
.intro { color: var(--muted); padding: 8px 20px 0 58px; }
.scroll { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 16px 20px 4px; scrollbar-color: var(--line) transparent; }
.assure { color: var(--muted); font-size: 13px; padding: 12px 20px 0; }
.foot { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding: 16px 20px 20px; margin-top: 12px; border-top: 1px solid var(--line); }
.actions { display: flex; gap: 8px; margin-left: auto; }

ul { list-style: none; padding: 0; display: grid; gap: 8px; }
.item { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 4px 12px; padding: 10px 12px;
  background: var(--surface-2); border: 1px solid var(--line); border-radius: 10px; }
.pick { display: grid; grid-template-columns: auto 1fr; gap: 12px; align-items: start; cursor: pointer; min-width: 0; }
.pick input { width: 18px; height: 18px; margin: 1px 0 0; accent-color: var(--brand); cursor: pointer; }
.text { display: grid; gap: 2px; min-width: 0; }
.lbl { font: 600 13px/1.35 ui-monospace, "SF Mono", Menlo, Consolas, monospace; overflow-wrap: anywhere; }
.meta { color: var(--muted); font-size: 13px; overflow-wrap: anywhere; }
.meta code { font: 13px ui-monospace, "SF Mono", Menlo, Consolas, monospace; color: var(--text); }
.note { grid-column: 1 / -1; color: var(--brand-ink); font-size: 13px; padding-left: 30px; }
.item:not([data-allowed]) .note { display: none; }
.item[data-allowed] .lbl, .item[data-allowed] .meta { opacity: .7; }

button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 36px; padding: 6px 14px;
  border: 1px solid var(--line); border-radius: 9px; background: var(--surface); color: var(--text); cursor: pointer; }
button:hover { border-color: var(--muted); }
button.primary { background: var(--brand); border-color: var(--brand); color: #fff; font-weight: 600; }
button.primary:hover { filter: brightness(1.08); }
button.allow { min-height: 28px; padding: 3px 10px; font-size: 13px; }
button.allow[aria-pressed="true"] { background: var(--brand-tint); border-color: var(--brand); color: var(--brand-ink); font-weight: 600; }
button.allow svg { width: 14px; height: 14px; }
/* The risky path: available, explicit, never styled like a safe choice. */
button.risk { border-color: transparent; background: transparent; color: var(--danger); padding-inline: 4px; text-decoration: underline;
  text-underline-offset: 3px; text-decoration-thickness: 1px; }
button.risk:hover { text-decoration-thickness: 2px; }
button:focus-visible, input:focus-visible, textarea:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }

.status:not(:empty) { margin: 12px 20px 0; padding: 8px 12px; border-radius: 8px; background: var(--brand-tint); color: var(--brand-ink); font-weight: 600; }
.manual { display: block; width: calc(100% - 40px); margin: 8px 20px 0; min-height: 96px; padding: 8px 10px; resize: vertical;
  font: 13px/1.4 ui-monospace, "SF Mono", Menlo, Consolas, monospace; color: var(--text); background: var(--surface-2);
  border: 1px solid var(--line); border-radius: 8px; }
.message { padding: 8px 20px 0 58px; }

@container (max-width: 420px) {
  .intro, .message { padding-left: 20px; }
  .item { grid-template-columns: 1fr; }
  .item button.allow { justify-self: start; margin-left: 30px; }
  .actions { width: 100%; }
  .actions button { flex: 1; }
}

.toast { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; display: flex; gap: 6px 12px; align-items: center; flex-wrap: wrap;
  max-width: min(440px, calc(100vw - 32px)); padding: 10px 10px 10px 12px; border-radius: 12px; background: #18191b; color: #fff;
  border: 1px solid rgb(255 255 255 / .16); box-shadow: 0 10px 30px rgb(0 0 0 / .35); animation: rise 200ms cubic-bezier(.16, 1, .3, 1); }
.toast .mark { width: 20px; height: 20px; }
.toast .msg { flex: 1 1 180px; }
.toast button { min-height: 32px; background: transparent; color: #8ab4ff; border-color: rgb(255 255 255 / .24); }
.toast button:hover { border-color: #8ab4ff; }
.toast kbd { font: 12px ui-monospace, "SF Mono", Menlo, Consolas, monospace; color: #c9d7f2; }

.pill { position: fixed; z-index: 2147483647; min-height: 28px; padding: 3px 12px 3px 6px; gap: 6px; border: 0; border-radius: 999px;
  background: var(--brand); color: #fff; font-size: 13px; font-weight: 600; box-shadow: 0 4px 14px rgb(0 0 0 / .25); }
.pill .mark { width: 18px; height: 18px; color: #fff; }
.pill .mark .bar { fill: var(--brand); }
.pill:hover { filter: brightness(1.08); }

@media (pointer: coarse) { button { min-height: 44px; } button.allow, .pill { min-height: 36px; } }
@media (forced-colors: active) { .item, .toast, .panel { border: 1px solid CanvasText; } }
@media (prefers-reduced-motion: reduce) { .backdrop, .panel, .toast { animation: none; } }
@keyframes fade { from { opacity: .4; } }
@keyframes rise { from { opacity: .5; transform: translateY(8px) scale(.985); } }
`;

const MARK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect width="24" height="24" rx="6" fill="currentColor"/>' +
  '<rect x="5" y="5.5" width="14" height="2.2" rx="1.1" fill="#fff"/><rect class="bar" x="4" y="10" width="16" height="4.2" rx="1" fill="#111"/>' +
  '<rect x="5" y="16.4" width="9" height="2.2" rx="1.1" fill="#fff"/></svg>';
const CHECK_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

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

  const h = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] => {
    const el: HTMLElementTagNameMap[K] = Object.assign(doc.createElement(tag), props);
    el.append(...kids);
    return el;
  };
  const mark = () => {
    const span = h('span', { className: 'mark' });
    span.innerHTML = MARK_SVG; // static markup
    return span;
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
  let announcer: HTMLElement | null = null;

  /** Modal dialog: focus-trapped, Esc cancels, focus returns to where it was. */
  function modal<T>(
    opts: { title: string; tone: 'review' | 'blocked'; describe: HTMLElement },
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
      const panel = h('div', { className: `panel surface${opts.tone === 'blocked' ? ' danger' : ''}` },
        h('div', { className: 'head' }, mark(), title), ...body, foot);
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
    const vw = win.innerWidth;
    const vh = win.innerHeight;
    // Prefer just above the editor's left edge (the send button usually sits at its right), else just below it.
    let top = r.top - hgt - 10;
    if (top < 8) top = r.bottom + 10;
    if (top + hgt > vh - 8) return; // no room either side: keep the corner placement
    el.style.top = `${top}px`;
    el.style.left = `${Math.min(Math.max(8, r.left), vw - w - 8)}px`;
    el.style.right = 'auto';
    el.style.bottom = 'auto';
  }

  // --- Pill ----------------------------------------------------------------------
  let pillEl: HTMLButtonElement | null = null;
  let pillText: HTMLElement | null = null;
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
      const introEl = h('p', { className: 'intro', textContent: intro });
      return modal<ReviewResult>({ title, tone, describe: introEl }, (close) => {
        const list = h('ul');
        items.forEach((item, n) => {
          const box = h('input', { type: 'checkbox', checked: true });
          box.addEventListener('change', () => (box.checked ? selected.add(item.key) : selected.delete(item.key)));
          const lblId = `redactor-item-${n}-${Math.random().toString(36).slice(2, 7)}`;
          const times = item.count > 1 ? ` · ${item.count} times` : '';
          const row = h('li', { className: 'item' });
          const allow = h('button', { type: 'button', className: 'allow', textContent: 'Always allow' });
          allow.setAttribute('aria-pressed', 'false');
          allow.setAttribute('aria-describedby', lblId);
          const note = h('p', { className: 'note', textContent: "Won't be flagged again. You can remove it in Settings → Allowlist." });
          allow.addEventListener('click', () => {
            const on = !alwaysAllow.has(item.key);
            if (on) alwaysAllow.add(item.key);
            else alwaysAllow.delete(item.key);
            allow.setAttribute('aria-pressed', String(on));
            row.toggleAttribute('data-allowed', on);
            allow.innerHTML = on ? CHECK_SVG : '';
            allow.append(on ? 'Allowed' : 'Always allow');
            box.checked = !on;
            box.dispatchEvent(new Event('change'));
          });
          row.append(
            h('label', { className: 'pick' }, box,
              h('span', { className: 'text' },
                h('span', { className: 'lbl', id: lblId, textContent: item.label }),
                h('span', { className: 'meta' }, `${item.name}${times} · `, h('code', { textContent: item.preview })))),
            allow, note);
          list.append(row);
        });
        const btn = (text: string, action: ReviewResult['action'], primary = false) => {
          const b = h('button', { type: 'button', textContent: text, className: primary ? 'primary' : '' });
          b.addEventListener('click', () => close({ action, selected, alwaysAllow }));
          return b;
        };
        return {
          body: [introEl, h('div', { className: 'scroll' }, list),
            h('p', { className: 'assure', textContent: 'Redactor swaps selected items for placeholders. The originals never leave this browser.' })],
          risk: btn(sendLabel, 'send'),
          buttons: [btn('Cancel', 'cancel'), btn('Redact selected', 'redact', true)],
        };
      }, { action: 'cancel', selected, alwaysAllow });
    },

    failure({ title = "Redactor couldn't redact this", message, redacted, allowSend }) {
      const messageEl = h('p', { className: 'message', textContent: message });
      return modal<'send' | 'cancel'>({ title, tone: 'blocked', describe: messageEl }, (close) => {
        const status = h('p', { className: 'status' });
        status.setAttribute('role', 'status');
        const body: Node[] = [messageEl, status];
        const cancel = h('button', { type: 'button', textContent: 'Cancel', className: redacted === undefined ? 'primary' : '' });
        cancel.addEventListener('click', () => close('cancel'));
        const buttons = [cancel];
        if (redacted !== undefined) {
          const copy = h('button', { type: 'button', className: 'primary', textContent: 'Copy redacted text' });
          copy.addEventListener('click', async () => {
            if (await copyText(doc, redacted)) {
              status.textContent = 'Copied. Paste it into the message box.';
              return;
            }
            // Clipboard blocked: show the (already redacted) text so it can be copied by hand.
            status.textContent = "Couldn't copy automatically. Select the text below and copy it.";
            if (!body.some((n) => n instanceof HTMLTextAreaElement)) {
              const manual = h('textarea', { className: 'manual', value: redacted, readOnly: true });
              manual.setAttribute('aria-label', 'Redacted text');
              status.after(manual);
              body.push(manual);
              manual.focus();
              manual.select();
            }
          });
          buttons.push(copy);
        }
        let risk: HTMLButtonElement | undefined;
        if (allowSend) {
          risk = h('button', { type: 'button', textContent: 'Send anyway' });
          risk.addEventListener('click', () => close('send'));
        }
        return { body, risk, buttons };
      }, 'cancel');
    },

    toast(message, actions = [], anchor) {
      toastCleanup();
      const el = h('div', { className: 'toast surface' }, mark(), h('span', { className: 'msg', textContent: message }));
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      const first = actions[0];
      for (const a of actions) {
        const b = h('button', { type: 'button', textContent: a.label });
        if (a === first) {
          b.setAttribute('aria-keyshortcuts', 'Alt+Z');
          b.append(' ', h('kbd', { textContent: isMac ? '⌥Z' : 'Alt+Z' }));
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
        pillText = h('span');
        pillEl = h('button', { type: 'button', className: 'pill surface' }, mark(), pillText);
        pillEl.addEventListener('mousedown', (e) => e.preventDefault()); // keep the editor's focus and selection
        pillEl.addEventListener('click', () => pillAction());
        win.addEventListener('scroll', schedulePill, { capture: true, passive: true });
        win.addEventListener('resize', schedulePill, { passive: true });
      }
      shadow().append(pillEl);
      const noun = `${count} ${count === 1 ? 'secret' : 'secrets'}`;
      pillText!.textContent = `${noun} detected · Redact`;
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
