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
  review(opts: { title: string; intro: string; items: ReviewItem[]; sendLabel: string }): Promise<ReviewResult>;
  /** Blocking notice. `redacted` adds a "Copy redacted text" button; `allowSend` adds an explicit "Send anyway". */
  failure(opts: { title?: string; message: string; redacted?: string; allowSend: boolean }): Promise<'send' | 'cancel'>;
  toast(message: string, actions?: ToastAction[]): void;
  pill(anchor: HTMLElement | null, count: number, onRedact: () => void): void;
}

const CSS = `
:host { all: initial; }
* { box-sizing: border-box; font: 14px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; }
.backdrop { position: fixed; inset: 0; background: rgb(0 0 0 / .45); display: grid; place-items: center; z-index: 2147483647; }
.panel { width: min(560px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow: auto; background: #fff; color: #1a1a1a;
  border-radius: 12px; padding: 20px; box-shadow: 0 12px 40px rgb(0 0 0 / .3); }
h2 { font-size: 16px; font-weight: 600; margin: 0 0 6px; }
p { margin: 0 0 12px; color: #444; }
ul { list-style: none; margin: 0 0 16px; padding: 0; display: grid; gap: 6px; }
li { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid #ddd; border-radius: 8px; }
li label { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; cursor: pointer; }
.lbl { font-weight: 600; font-family: ui-monospace, monospace; font-size: 12px; }
.name { color: #555; font-size: 12px; }
code { font-family: ui-monospace, monospace; font-size: 12px; color: #333; margin-left: auto; white-space: nowrap; }
.row { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }
button { border: 1px solid #bbb; background: #f4f4f4; color: #1a1a1a; border-radius: 8px; padding: 6px 12px; cursor: pointer; }
button.primary { background: #1f6feb; border-color: #1f6feb; color: #fff; }
button.small { padding: 2px 8px; font-size: 12px; }
button[aria-pressed="true"] { background: #e7f0ff; border-color: #1f6feb; }
button:focus-visible, input:focus-visible { outline: 2px solid #1f6feb; outline-offset: 2px; }
.toast { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; background: #1a1a1a; color: #fff; border-radius: 10px;
  padding: 10px 14px; display: flex; gap: 12px; align-items: center; max-width: calc(100vw - 32px); }
.toast button { background: transparent; color: #8ab4ff; border-color: #555; }
.pill { position: fixed; z-index: 2147483646; background: #b42318; color: #fff; border: 0; border-radius: 999px; padding: 4px 10px; font-size: 12px; }
@media (prefers-color-scheme: dark) {
  .panel { background: #1e1e1e; color: #eee; } p, .name, code { color: #bbb; } li { border-color: #444; }
  button { background: #2b2b2b; color: #eee; border-color: #555; }
}
`;

const FOCUSABLE = 'button, input, [tabindex]:not([tabindex="-1"])';

export function createUi(doc: Document): Ui {
  let root: ShadowRoot | null = null;
  const shadow = (): ShadowRoot => {
    if (root) return root;
    const host = doc.createElement('redactor-ui');
    // Keep page-level hotkeys from reacting to typing inside our UI.
    for (const t of ['keydown', 'keyup', 'keypress']) host.addEventListener(t, (e) => e.stopPropagation());
    root = host.attachShadow({ mode: 'closed' });
    const style = doc.createElement('style');
    style.textContent = CSS;
    root.append(style);
    (doc.body ?? doc.documentElement).append(host);
    return root;
  };
  const h = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] => {
    const el: HTMLElementTagNameMap[K] = Object.assign(doc.createElement(tag), props);
    el.append(...kids);
    return el;
  };

  /** Modal dialog: focus-trapped, Esc cancels, focus returns to where it was. */
  function modal<T>(title: string, build: (close: (v: T) => void) => { body: Node[]; buttons: HTMLButtonElement[] }, onEsc: T): Promise<T> {
    return new Promise((resolve) => {
      const previous = doc.activeElement as HTMLElement | null;
      const id = `redactor-title-${Math.random().toString(36).slice(2)}`;
      const backdrop = h('div', { className: 'backdrop' });
      const close = (v: T) => {
        backdrop.remove();
        previous?.focus?.();
        resolve(v);
      };
      const { body, buttons } = build(close);
      const panel = h('div', { className: 'panel' }, h('h2', { id }, title), ...body, h('div', { className: 'row' }, ...buttons));
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      panel.setAttribute('aria-labelledby', id);
      panel.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          close(onEsc);
        } else if (e.key === 'Tab') {
          const f = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
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

  let toastEl: HTMLElement | null = null;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  let pillEl: HTMLButtonElement | null = null;
  let pillAction: () => void = () => {};

  return {
    review({ title, intro, items, sendLabel }) {
      const selected = new Set(items.map((i) => i.key));
      const alwaysAllow = new Set<string>();
      return modal<ReviewResult>(title, (close) => {
        const list = h('ul');
        for (const item of items) {
          const box = h('input', { type: 'checkbox', checked: true });
          box.addEventListener('change', () => (box.checked ? selected.add(item.key) : selected.delete(item.key)));
          const allow = h('button', { className: 'small', type: 'button', textContent: 'Always allow' });
          allow.setAttribute('aria-pressed', 'false');
          allow.addEventListener('click', () => {
            const on = !alwaysAllow.has(item.key);
            if (on) alwaysAllow.add(item.key);
            else alwaysAllow.delete(item.key);
            allow.setAttribute('aria-pressed', String(on));
            box.checked = !on;
            box.dispatchEvent(new Event('change'));
          });
          const times = item.count > 1 ? ` ×${item.count}` : '';
          list.append(h('li', {},
            h('label', {}, box, h('span', { className: 'lbl', textContent: item.label }),
              h('span', { className: 'name', textContent: item.name + times }), h('code', { textContent: item.preview })),
            allow));
        }
        const btn = (text: string, action: ReviewResult['action'], primary = false) => {
          const b = h('button', { type: 'button', textContent: text, className: primary ? 'primary' : '' });
          b.addEventListener('click', () => close({ action, selected, alwaysAllow }));
          return b;
        };
        return {
          body: [h('p', { textContent: intro }), list],
          buttons: [btn('Cancel', 'cancel'), btn(sendLabel, 'send'), btn('Redact selected', 'redact', true)],
        };
      }, { action: 'cancel', selected, alwaysAllow });
    },

    failure({ title = 'Redactor blocked this', message, redacted, allowSend }) {
      return modal<'send' | 'cancel'>(title, (close) => {
        const status = h('p');
        status.setAttribute('role', 'status');
        const cancel = h('button', { type: 'button', textContent: 'Cancel', className: redacted === undefined ? 'primary' : '' });
        cancel.addEventListener('click', () => close('cancel'));
        const buttons = [cancel];
        if (redacted !== undefined) {
          const copy = h('button', { type: 'button', className: 'primary', textContent: 'Copy redacted text' });
          copy.addEventListener('click', async () => {
            status.textContent = (await copyText(doc, redacted)) ? 'Redacted text copied. Paste it into the input.' : 'Copy failed.';
          });
          buttons.push(copy);
        }
        if (allowSend) {
          const send = h('button', { type: 'button', textContent: 'Send anyway' });
          send.addEventListener('click', () => close('send'));
          buttons.splice(1, 0, send);
        }
        return { body: [h('p', { textContent: message }), status], buttons };
      }, 'cancel');
    },

    toast(message, actions = []) {
      toastEl?.remove();
      clearTimeout(toastTimer);
      const el = h('div', { className: 'toast' }, h('span', { textContent: message }));
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      for (const a of actions) {
        const b = h('button', { type: 'button', textContent: a.label });
        b.addEventListener('click', () => {
          el.remove();
          a.run();
        });
        el.append(b);
      }
      shadow().append(el);
      toastEl = el;
      toastTimer = setTimeout(() => el.remove(), 8000);
    },

    pill(anchor, count, onRedact) {
      pillAction = onRedact;
      if (!anchor || count === 0) {
        pillEl?.remove();
        pillEl = null;
        return;
      }
      if (!pillEl) {
        pillEl = h('button', { type: 'button', className: 'pill' });
        pillEl.addEventListener('mousedown', (e) => e.preventDefault()); // keep the editor's focus and selection
        pillEl.addEventListener('click', () => pillAction());
        shadow().append(pillEl);
      }
      pillEl.textContent = `${count} ${count === 1 ? 'secret' : 'secrets'} detected · Redact`;
      const r = anchor.getBoundingClientRect();
      pillEl.style.top = `${Math.max(4, r.top - 28)}px`;
      pillEl.style.left = `${Math.max(4, r.right - pillEl.offsetWidth - 8)}px`;
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
