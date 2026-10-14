import { DETECTORS } from './detectors';
import type { Confidence, CustomPattern, Detector, EngineSettings, Finding } from './types';
import { PLACEHOLDER_RE, Vault } from './vault';

const RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };
/** Repeats shorter than this aren't propagated, so a password like `pass` doesn't eat the word "pass" in prose. */
const MIN_PROPAGATE = 6;

export interface ScanContext {
  /** Known values for this tab; they're caught anywhere in the text, even with no context. */
  vault?: Vault;
  /** Values the user allowed this session. */
  allowed?: ReadonlySet<string>;
}

export interface RedactResult {
  text: string;
  findings: Finding[];
  /** Placeholder for each finding, same order. */
  placeholders: string[];
}

/** Sorted, non-overlapping [start, end) intervals. */
class Spans {
  private starts: number[] = [];
  private ends: number[] = [];
  private firstEndingAfter(s: number): number {
    let lo = 0;
    let hi = this.ends.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.ends[mid]! > s) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  }
  overlaps(s: number, e: number): boolean {
    const i = this.firstEndingAfter(s);
    return i < this.starts.length && this.starts[i]! < e;
  }
  add(s: number, e: number): void {
    const i = this.firstEndingAfter(s);
    this.starts.splice(i, 0, s);
    this.ends.splice(i, 0, e);
  }
}

export type CompileResult = { ok: true; detector: Detector } | { ok: false; error: string };

export function compileCustomPattern(p: CustomPattern): CompileResult {
  if (/[^imsu]/.test(p.flags ?? '')) return { ok: false, error: 'Only the i, m, s and u flags are allowed.' };
  let regex: RegExp;
  try {
    regex = new RegExp(p.pattern, 'gd' + (p.flags ?? ''));
  } catch (e) {
    return { ok: false, error: `Invalid regex: ${(e as Error).message}` };
  }
  regex.lastIndex = 0;
  const onEmpty = regex.exec('');
  regex.lastIndex = 0;
  const onSample = regex.exec('a1 -_');
  regex.lastIndex = 0;
  if (onEmpty || (onSample && onSample[0] === '')) return { ok: false, error: 'Pattern matches the empty string.' };
  const label = p.label.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^[^A-Z]+|_+$/g, '') || 'CUSTOM';
  return {
    ok: true,
    detector: {
      id: `custom:${p.id}`, name: p.name || label, label, category: 'secret', confidence: 'high',
      // User intent beats built-ins; a pattern with a capture group redacts only group 1.
      priority: 95, regex, group: new RegExp(`${p.pattern}|`, p.flags).exec('')!.length > 1 ? 1 : 0, defaultOn: true,
    },
  };
}

type AllowTest = (value: string) => boolean;

export function compileAllowlist(entries: string[]): { test: AllowTest; errors: string[] } {
  const exact = new Set<string>();
  const res: RegExp[] = [];
  const errors: string[] = [];
  for (const raw of entries) {
    const entry = raw.trim();
    if (!entry) continue;
    const m = /^\/(.+)\/([imsu]*)$/s.exec(entry);
    if (!m) {
      exact.add(entry);
      continue;
    }
    try {
      res.push(new RegExp(m[1]!, m[2]));
    } catch (e) {
      errors.push(`${entry}: ${(e as Error).message}`);
    }
  }
  return { test: (v) => exact.has(v) || res.some((r) => r.test(v)), errors };
}

export function activeDetectors(settings: EngineSettings): Detector[] {
  const min = RANK[settings.minConfidence];
  const builtins = DETECTORS.filter((d) => (settings.detectors[d.id] ?? d.defaultOn) && RANK[d.confidence] >= min);
  const custom = settings.customPatterns.filter((p) => p.enabled).map(compileCustomPattern)
    .flatMap((r) => (r.ok ? [r.detector] : []));
  return [...custom, ...builtins];
}

export function createEngine(settings: EngineSettings) {
  const detectors = activeDetectors(settings);
  const allowlist = compileAllowlist(settings.allowlist).test;

  function scan(text: string, ctx: ScanContext = {}): Finding[] {
    const isAllowed = (v: string) => allowlist(v) || (ctx.allowed?.has(v) ?? false);
    const placeholders = new Spans();
    for (const m of text.matchAll(PLACEHOLDER_RE)) placeholders.add(m.index, m.index + m[0].length);

    const candidates: Finding[] = [];
    for (const d of detectors) {
      const re = d.regex;
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text))) {
        if (m[0] === '') {
          re.lastIndex++;
          continue;
        }
        const g = typeof d.group === 'object' ? (d.group.find((i) => m![i] !== undefined) ?? 0) : (d.group ?? 0);
        const value = m[g];
        const span = m.indices?.[g];
        if (!value || !span || placeholders.overlaps(span[0], span[1]) || isAllowed(value) || (d.validate && !d.validate(value, m, text))) {
          // Retry from the next char so a rejected wide match can't hide a real one inside it.
          re.lastIndex = m.index + 1;
          continue;
        }
        candidates.push({
          detectorId: d.id, name: d.name, label: d.labelFor?.(value, m) ?? d.label, category: d.category,
          confidence: d.confidence, priority: d.priority, start: span[0], end: span[1], value,
        });
      }
    }

    // Overlaps: priority, then confidence, then length wins.
    candidates.sort((a, b) => b.priority - a.priority || RANK[b.confidence] - RANK[a.confidence] ||
      b.end - b.start - (a.end - a.start) || a.start - b.start);
    const taken = new Spans();
    const found: Finding[] = [];
    for (const c of candidates) {
      if (taken.overlaps(c.start, c.end)) continue;
      taken.add(c.start, c.end);
      found.push(c);
    }

    // Propagation: every other exact occurrence of a detected or vaulted value.
    const known = new Map<string, Finding>();
    for (const f of found) if (!known.has(f.value)) known.set(f.value, f);
    for (const e of ctx.vault?.entries() ?? []) {
      if (known.has(e.value) || isAllowed(e.value)) continue;
      known.set(e.value, {
        detectorId: 'vault', name: 'Previously redacted value', label: e.label, category: 'secret',
        confidence: 'high', priority: 0, start: 0, end: 0, value: e.value,
      });
    }
    for (const [value, f] of known) {
      if (value.length < MIN_PROPAGATE) continue;
      const wordStart = /^\w/.test(value);
      const wordEnd = /\w$/.test(value);
      for (let i = text.indexOf(value); i !== -1; i = text.indexOf(value, i + 1)) {
        const end = i + value.length;
        if ((wordStart && /\w/.test(text[i - 1] ?? '')) || (wordEnd && /\w/.test(text[end] ?? ''))) continue;
        if (taken.overlaps(i, end) || placeholders.overlaps(i, end)) continue;
        taken.add(i, end);
        found.push({ ...f, start: i, end, propagated: true });
      }
    }

    return found.sort((a, b) => a.start - b.start);
  }

  /** Replace findings with placeholders; `findings` defaults to a fresh scan (pass a subset for "redact selected"). */
  function redact(text: string, vault: Vault, ctx: ScanContext = {}, findings = scan(text, { ...ctx, vault })): RedactResult {
    const sorted = [...findings].sort((a, b) => a.start - b.start);
    const placeholders: string[] = [];
    let out = '';
    let pos = 0;
    for (const f of sorted) {
      const p = vault.placeholderFor(f.value, f.label, text);
      placeholders.push(p);
      out += text.slice(pos, f.start) + p;
      pos = f.end;
    }
    return { text: out + text.slice(pos), findings: sorted, placeholders };
  }

  return { detectors, scan, redact };
}

export type Engine = ReturnType<typeof createEngine>;
