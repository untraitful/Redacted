export function luhn(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

export function ibanValid(raw: string): boolean {
  const s = raw.replace(/ /g, '').toUpperCase();
  if (s.length < 15 || s.length > 34) return false;
  let rem = 0;
  for (const ch of s.slice(4) + s.slice(0, 4)) {
    const v = ch >= 'A' ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of v) rem = (rem * 10 + d.charCodeAt(0) - 48) % 97;
  }
  return rem === 1;
}

/** Shannon entropy in bits per character. */
export function entropy(s: string): number {
  const counts = new Map<string, number>();
  for (const c of s) counts.set(c, (counts.get(c) ?? 0) + 1);
  let h = 0;
  for (const n of counts.values()) {
    const p = n / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

/** How many of lower / upper / digit / other appear. */
export function charClasses(s: string): number {
  return +/[a-z]/.test(s) + +/[A-Z]/.test(s) + +/\d/.test(s) + +/[^A-Za-z0-9]/.test(s);
}

/** Random tokens split into short case/digit runs; identifiers and words split into long ones. */
export function looksRandom(s: string): boolean {
  const parts = s.match(/[A-Z]?[a-z]+|[A-Z]+(?![a-z])|\d+|[^A-Za-z\d]+/g) ?? [];
  return parts.length > 0 && s.length / parts.length < 3;
}

export function b64decode(s: string): string | null {
  try {
    const t = s.replace(/-/g, '+').replace(/_/g, '/');
    return atob(t + '='.repeat((4 - (t.length % 4)) % 4));
  } catch {
    return null;
  }
}

const PLACEHOLDER_SYNTAX =
  /^(?:\$\{[^}]*\}|\$\(?[A-Za-z_]\w*\)?|%[A-Za-z_]\w*%|\{\{.*\}\}|\{[A-Za-z_]\w*\}|<[^<>]+>|\[[^\]]*\]|\(?(?:redacted|hidden|masked|removed)\)?|\.{3}|…)$/is;
const TYPE_WORD =
  /^(?:str|string|int|integer|number|float|bool|boolean|bytes|any|unknown|object|secretstr|secretbytes|none|null|nil|undefined|void|true|false|yes|no|on|off|required|optional|empty|n\/a|tbd|todo)$|^(?:optional|list|dict|array|union|readonly)\[|\[\]$/i;
const DUMMY_PREFIX = /^(?:your|my|example|sample|dummy|fake|placeholder|insert|enter|replace|put)[\w -]*$/i;
const DUMMY_EXACT = /^(?:password|passwd|pass|pwd|secret|token|apikey|api_key|key|value)$/i;
const CODE_REF = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+(?:[[(]|$)/;

/** Placeholder syntax like `${X}`, `<your-key>`, `****`: never a real value. */
export function isPlaceholderSyntax(v: string): boolean {
  return /^(.)\1*$/s.test(v) || PLACEHOLDER_SYNTAX.test(v);
}

/** Rejects values in a key=value assignment that are obviously not secrets. */
export function isNonSecretValue(v: string, quoted: boolean): boolean {
  if (v.length < 4 || isPlaceholderSyntax(v)) return true;
  if (TYPE_WORD.test(v) || DUMMY_PREFIX.test(v) || DUMMY_EXACT.test(v)) return true;
  if (!quoted) {
    // Bare values can't contain `}`, so `${VAR}` and `{{ var }}` arrive cut short.
    if (CODE_REF.test(v) || v.includes('(') || /^(?:\$\{|\{\{)/.test(v)) return true;
    // shortcut: unquoted single-class words under 16 chars (e.g. `password: sunshine`) are treated as prose; quoting them still redacts.
    if (charClasses(v) < 2 && v.length < 16) return true;
  }
  return false;
}

const SECRET_SEG =
  /^(?:password|passwd|pwd|pass|passphrase|passcode|secret|secrets|token|apikey|credential|credentials|privatekey|secretkey|accesskey|authtoken|dsn)$/;
const KEY_QUALIFIER =
  /^(?:api|access|secret|private|auth|signing|encryption|enc|master|client|app|license|account|service|shared|subscription|admin|deploy|ssh|gpg|pgp|consumer|session|storage|webhook|hmac|jwt|crypt)$/;
const NON_SECRET_SUFFIX = new Set(
  'url uri endpoint path file dir directory type length len size ttl expiry expires expiration exp timeout name names policy hint label field header count limit prefix suffix regex pattern enabled enable disabled required rotation version mode format kind strength location env var ref arn'.split(' '),
);
const COUNTER_SEG = new Set(['max', 'min', 'num', 'count']);
const NOISE_SEG = new Set(['self', 'this', 'config', 'cfg', 'settings', 'process', 'env', 'os', 'environ']);

export function keySegments(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((s) => s.replace(/\d+$/, ''))
    .filter(Boolean);
}

/** Does this assignment key name imply its value is a secret? */
export function isSecretKey(key: string): boolean {
  const segs = keySegments(key);
  const last = segs[segs.length - 1];
  if (!last || NON_SECRET_SUFFIX.has(last) || segs.some((s) => COUNTER_SEG.has(s))) return false;
  return segs.some(
    (s, i) =>
      SECRET_SEG.test(s) ||
      ((s === 'key' || s === 'keys') && i > 0 && KEY_QUALIFIER.test(segs[i - 1]!)) ||
      (s === 'string' && segs[i - 1] === 'connection'),
  );
}

/** DB_PASSWORD from `spring.datasource.db-password`: last three meaningful segments, upper snake. */
export function labelFromKey(key: string): string {
  const segs = keySegments(key).filter((s) => !NOISE_SEG.has(s));
  return segs.slice(-3).join('_').toUpperCase().slice(0, 40) || 'SECRET';
}
