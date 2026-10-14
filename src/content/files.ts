import type { Finding } from '../engine/types';

export const MAX_SCAN_BYTES = 2 * 1024 * 1024;

const TEXT_EXT =
  /\.(?:env|txt|json|ya?ml|toml|ini|conf|cfg|pem|key|log|csv|py|js|mjs|cjs|ts|tsx|jsx|sh|bash|zsh|tf|tfvars|sql|properties|xml|md|npmrc|pypirc|netrc|htpasswd|kubeconfig|rb|go|java|kt|cs|php|rs)$/i;
// Common secret-bearing files that have no telling extension.
const TEXT_NAME = /^(?:\.env(?:\..+)?|id_(?:rsa|dsa|ecdsa|ed25519)|\.git-credentials|credentials|\.netrc|\.npmrc|\.pypirc|config|dockerfile|makefile)$/i;

export function isTextLike(file: File): boolean {
  return TEXT_EXT.test(file.name) || TEXT_NAME.test(file.name) || file.type.startsWith('text/') ||
    /^application\/(?:json|xml|x-yaml|yaml|toml|x-sh|sql)$/.test(file.type);
}

export interface FileScan {
  file: File;
  text: string;
  findings: Finding[];
}

export type ScanOutcome = { scans: FileScan[]; tooLarge: File[] };

/** Read and scan the text-like files; binary files are ignored (documented limitation). */
export async function scanFiles(files: Iterable<File>, scan: (text: string) => Finding[]): Promise<ScanOutcome> {
  const scans: FileScan[] = [];
  const tooLarge: File[] = [];
  for (const file of files) {
    if (!isTextLike(file)) continue;
    if (file.size > MAX_SCAN_BYTES) {
      tooLarge.push(file);
      continue;
    }
    const text = await file.text();
    scans.push({ file, text, findings: scan(text) });
  }
  return { scans, tooLarge };
}

export function redactedFile(file: File, text: string): File {
  return new File([text], file.name, { type: file.type || 'text/plain', lastModified: file.lastModified });
}
