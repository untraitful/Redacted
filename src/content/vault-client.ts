import { Vault } from '../engine/vault';
import type { PlaceholderStyle } from '../engine/types';
import type { Request, VaultState } from '../shared/messages';

export type SendFn = (req: Request) => Promise<unknown>;

/**
 * In-memory mirror of this tab's vault. Detection runs synchronously in event handlers, so it reads
 * this mirror; the background (storage.session) is the durable copy for reloads in the same tab.
 */
export class VaultClient {
  vault: Vault;
  readonly allowed = new Set<string>();

  constructor(private send: SendFn, style: PlaceholderStyle) {
    this.vault = new Vault(style);
  }

  async load(): Promise<void> {
    const state = (await this.send({ type: 'vault:get' }).catch(() => null)) as VaultState | null;
    if (!state) return;
    // shortcut: values redacted before load() resolves (first few ms of page life) are kept but may share numbers with
    // restored ones; upgrade to a renumbering merge if that ever shows up in practice.
    const local = this.vault.entries();
    this.vault = new Vault(this.vault.style, [...state.entries, ...local.filter((e) => !state.entries.some((r) => r.value === e.value))]);
    for (const v of state.allowed) this.allowed.add(v);
  }

  persist(): void {
    void this.send({ type: 'vault:put', entries: this.vault.entries() }).catch(() => {});
  }

  allow(values: Iterable<string>): void {
    const list = [...values];
    if (!list.length) return;
    for (const v of list) this.allowed.add(v);
    void this.send({ type: 'vault:allow', values: list }).catch(() => {});
  }

  /** The popup cleared this tab's vault. */
  clear(): void {
    this.vault = new Vault(this.vault.style);
    this.allowed.clear();
  }

  setStyle(style: PlaceholderStyle): void {
    this.vault.style = style;
  }
}
