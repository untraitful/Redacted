import type { VaultEntry } from '../engine/vault';

/** Content -> background. The background keys everything by sender tab + host. */
export type Request =
  | { type: 'vault:get' }
  | { type: 'vault:put'; entries: VaultEntry[] }
  | { type: 'vault:allow'; values: string[] }
  | { type: 'vault:clear' }
  | { type: 'stats:add'; n: number };

/** Background/popup -> content. */
export type TabMessage = { type: 'redact-current' } | { type: 'vault:cleared' };

export interface VaultState {
  entries: VaultEntry[];
  allowed: string[];
  /** Redactions made in this tab on this host (badge). */
  count: number;
}

/** storage.session key for one tab + host. */
export const vaultKey = (tabId: number, host: string) => `vault:${tabId}:${host}`;
