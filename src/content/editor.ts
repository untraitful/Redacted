import type { WriteStep } from '../sites';

/**
 * Editor read/write. Per editor type:
 * - <textarea>/<input> (incl. React-controlled): native prototype `value` setter (bypasses React's instance-level
 *   value tracker), caret restored for inserts, then a bubbling `input` event so the framework sees the change.
 * - contenteditable (ProseMirror, Quill, Lexical): select the target range, dispatch a synthetic `paste`
 *   carrying a DataTransfer with text/plain. These editors handle paste themselves and call
 *   preventDefault, so their model stays in sync. If nobody handles it, fall back to
 *   `execCommand('insertText')`.
 * Every write is read back and verified (whitespace-normalized); callers fail closed on `false`.
 */

export type TextField = HTMLTextAreaElement | HTMLInputElement;
export type SavedSelection = { start: number; end: number } | Range | null;

const ours = new WeakSet<Event>();
/** Events we dispatched ourselves; our own listeners must ignore them. */
export const isOurs = (e: Event) => ours.has(e);
export function mark<E extends Event>(e: E): E {
  ours.add(e);
  return e;
}

const TEXT_INPUT_TYPES = /^(?:text|search|email|url|)$/;
const CE_SELECTOR = '[contenteditable]:not([contenteditable="false"])';

export function isTextField(el: Element): el is TextField {
  return el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && TEXT_INPUT_TYPES.test(el.type));
}

/** The editable element an event target belongs to: the field itself, or the outermost contenteditable. */
export function editableRoot(target: EventTarget | null): HTMLElement | null {
  const start = target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
  if (!start) return null;
  if (isTextField(start)) return start;
  let root = start.closest<HTMLElement>(CE_SELECTOR);
  if (!root) return null;
  for (let up = root.parentElement?.closest<HTMLElement>(CE_SELECTOR); up; up = up.parentElement?.closest<HTMLElement>(CE_SELECTOR))
    root = up;
  return root;
}

export function readEditor(el: HTMLElement): string {
  return isTextField(el) ? el.value : (el.innerText ?? el.textContent ?? '');
}

export const normalize = (s: string) => s.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

export function saveSelection(el: HTMLElement): SavedSelection {
  if (isTextField(el)) return { start: el.selectionStart ?? el.value.length, end: el.selectionEnd ?? el.value.length };
  const sel = el.ownerDocument.getSelection();
  const r = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
  return r && el.contains(r.commonAncestorContainer) ? r.cloneRange() : null;
}

/** Caret range at a drop point (Chrome: caretRangeFromPoint, Firefox: caretPositionFromPoint). */
export function rangeFromPoint(doc: Document, x: number, y: number): Range | null {
  const d = doc as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  if (d.caretRangeFromPoint) return d.caretRangeFromPoint(x, y);
  const p = d.caretPositionFromPoint?.(x, y);
  if (!p) return null;
  const r = doc.createRange();
  r.setStart(p.offsetNode, p.offset);
  return r;
}

function setNativeValue(el: TextField, text: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, text);
  else el.setRangeText(text, 0, el.value.length, 'end');
}

function fireInput(el: HTMLElement, inputType: string, data: string): void {
  el.dispatchEvent(mark(new InputEvent('input', { bubbles: true, inputType, data })));
}

function select(el: HTMLElement, range: Range | null): void {
  const doc = el.ownerDocument;
  const sel = doc.getSelection();
  if (!sel) return;
  let r = range;
  if (!r) {
    r = doc.createRange();
    r.selectNodeContents(el);
  }
  sel.removeAllRanges();
  sel.addRange(r);
}

function syntheticPaste(el: HTMLElement, text: string): boolean {
  const dt = new DataTransfer();
  dt.setData('text/plain', text);
  const ev = mark(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  el.dispatchEvent(ev);
  return ev.defaultPrevented; // the editor took it
}

/** Poll briefly: some editors (Lexical) commit their DOM a tick after the event. */
async function settle(check: () => boolean, ms = 300): Promise<boolean> {
  const until = Date.now() + ms;
  for (;;) {
    if (check()) return true;
    if (Date.now() >= until) return false;
    await new Promise((r) => setTimeout(r, 20));
  }
}

/** Replace the editor's whole content and verify it. */
export async function replaceAll(el: HTMLElement, text: string, steps: WriteStep[]): Promise<boolean> {
  const ok = () => normalize(readEditor(el)) === normalize(text);
  el.focus();
  if (isTextField(el)) {
    setNativeValue(el, text);
    fireInput(el, 'insertReplacementText', text);
    return settle(ok);
  }
  for (const step of steps) {
    select(el, null);
    if (step === 'paste' ? !syntheticPaste(el, text) : !el.ownerDocument.execCommand('insertText', false, text)) continue;
    if (await settle(ok)) return true;
  }
  return false;
}

/** Insert at a saved caret/selection (paste or drop) and verify. */
export async function insertAt(el: HTMLElement, text: string, at: SavedSelection, steps: WriteStep[]): Promise<boolean> {
  el.focus();
  if (isTextField(el)) {
    const before = el.value;
    const { start, end } = at && !(at instanceof Range) ? at : { start: before.length, end: before.length };
    const expected = before.slice(0, start) + text + before.slice(end);
    setNativeValue(el, expected);
    el.setSelectionRange(start + text.length, start + text.length);
    fireInput(el, 'insertFromPaste', text);
    return settle(() => el.value === expected);
  }
  const before = readEditor(el);
  const want = normalize(text);
  for (const step of steps) {
    // Only fall through to the next step if this one left the editor untouched, so we never double-insert.
    if (readEditor(el) !== before) break;
    select(el, at instanceof Range ? at : collapsedAtEnd(el));
    if (step === 'paste' ? !syntheticPaste(el, text) : !el.ownerDocument.execCommand('insertText', false, text)) continue;
    if (await settle(() => normalize(readEditor(el)).includes(want))) return true;
  }
  return false;
}

function collapsedAtEnd(el: HTMLElement): Range {
  const r = el.ownerDocument.createRange();
  r.selectNodeContents(el);
  r.collapse(false);
  return r;
}
