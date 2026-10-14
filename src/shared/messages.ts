import type { VaultEntry } from '../engine/vault';

/** Content -> background. The background keys everything by sender tab + host. */
export type Request =
  | { type: 'vault:get' }
  | { type: 'vault:put'; entries: VaultEntry[] }
  | { type: 'vault:allow'; values: string[] }
  | { type: 'vault:clear' };

export interface VaultState {
  entries: VaultEntry[];
  allowed: string[];
}
