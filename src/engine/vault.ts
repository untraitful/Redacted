import type { PlaceholderStyle } from './types';

export interface VaultEntry {
  placeholder: string;
  value: string;
  label: string;
}

/** Matches placeholders in every style, so scanning skips them whatever the current style is. */
export const PLACEHOLDER_RE = /\[[A-Z][A-Z0-9_]*_\d+\]|\{\{[A-Z][A-Z0-9_]*_\d+\}\}|<[A-Z][A-Z0-9_]*_\d+>/g;

export function formatPlaceholder(style: PlaceholderStyle, name: string): string {
  return style === 'mustache' ? `{{${name}}}` : style === 'angle' ? `<${name}>` : `[${name}]`;
}

/** Value <-> placeholder map for one tab + site. Same value always gets the same placeholder. */
export class Vault {
  private byValue = new Map<string, VaultEntry>();
  private byPlaceholder = new Map<string, VaultEntry>();
  private next = new Map<string, number>();

  constructor(public style: PlaceholderStyle = 'bracket', entries: VaultEntry[] = []) {
    for (const e of entries) this.add(e);
  }

  private add(e: VaultEntry): void {
    this.byValue.set(e.value, e);
    this.byPlaceholder.set(e.placeholder, e);
    const n = Number(/_(\d+)\W*$/.exec(e.placeholder)?.[1] ?? 0);
    if (n >= (this.next.get(e.label) ?? 1)) this.next.set(e.label, n + 1);
  }

  /** `avoid` is the text being redacted: numbers already written there as placeholders are skipped. */
  placeholderFor(value: string, label: string, avoid = ''): string {
    const hit = this.byValue.get(value);
    if (hit) return hit.placeholder;
    let n = this.next.get(label) ?? 1;
    let placeholder: string;
    do placeholder = formatPlaceholder(this.style, `${label}_${n++}`);
    while (this.byPlaceholder.has(placeholder) || avoid.includes(placeholder));
    this.add({ placeholder, value, label });
    return placeholder;
  }

  get(value: string): VaultEntry | undefined {
    return this.byValue.get(value);
  }

  entries(): VaultEntry[] {
    return [...this.byValue.values()];
  }

  delete(value: string): void {
    const e = this.byValue.get(value);
    if (!e) return;
    this.byValue.delete(value);
    this.byPlaceholder.delete(e.placeholder);
  }

  restore(text: string): string {
    return text.replace(PLACEHOLDER_RE, (p) => this.byPlaceholder.get(p)?.value ?? p);
  }
}

/** Preview safe to show in UI: `sk-p…3Q2a (51)`. Short values reveal nothing but their length. */
export function mask(value: string): string {
  const n = value.length;
  if (n >= 20) return `${value.slice(0, 4)}…${value.slice(-4)} (${n})`;
  if (n >= 12) return `${value.slice(0, 2)}…${value.slice(-2)} (${n})`;
  return `•••• (${n})`;
}
