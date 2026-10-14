import { DEFAULT_ENGINE_SETTINGS, type CustomPattern, type EngineSettings } from '../engine/types';

export type PasteMode = 'auto' | 'review' | 'off';
export type SendMode = 'review' | 'auto' | 'block' | 'off';
/** warn: upload proceeds, next send is blocked. redact (experimental): upload is replaced by a redacted copy. */
export type FileMode = 'warn' | 'redact' | 'off';

export interface CustomSite {
  host: string;
  /** Optional CSS selectors; the generic ones are tried after these. */
  input?: string;
  send?: string;
}

export interface Settings extends EngineSettings {
  enabled: boolean;
  pasteMode: PasteMode;
  sendMode: SendMode;
  /** After an auto redaction on send, send immediately instead of waiting for the user's next Enter. */
  autoResend: boolean;
  livePill: boolean;
  /** Hosts where the user switched Redactor off. */
  disabledSites: string[];
  fileMode: FileMode;
  /** Experimental: show originals in place of placeholders in the transcript (closed shadow roots). */
  restoreMode: boolean;
  /** User-added sites (runtime host permission + dynamically registered content script). */
  customSites: CustomSite[];
}

export const DEFAULT_SETTINGS: Settings = {
  ...DEFAULT_ENGINE_SETTINGS,
  enabled: true,
  pasteMode: 'auto',
  sendMode: 'review',
  autoResend: false,
  livePill: true,
  disabledSites: [],
  fileMode: 'warn',
  restoreMode: false,
  customSites: [],
};

/** Settings live in storage.local under one key. */
export const SETTINGS_KEY = 'settings';

export const HOST_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, max = 2000): v is string => typeof v === 'string' && v.length <= max;
const oneOf = <T extends string>(v: unknown, opts: readonly T[], d: T): T => (opts.includes(v as T) ? (v as T) : d);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const strings = (v: unknown, max = 500): string[] => (Array.isArray(v) ? v.filter((x) => str(x)).slice(0, max) : []);

/**
 * Settings from storage or an imported file are untrusted: keep only known fields with the right
 * types and values, and fall back to defaults for everything else.
 */
export function sanitizeSettings(raw: unknown): Settings {
  const r: Obj = isObj(raw) ? raw : {};
  const d = DEFAULT_SETTINGS;
  const detectors: Record<string, boolean> = {};
  if (isObj(r.detectors)) for (const [k, v] of Object.entries(r.detectors)) if (typeof v === 'boolean' && /^[\w:-]{1,100}$/.test(k) && k !== '__proto__') detectors[k] = v;
  const customPatterns: CustomPattern[] = (Array.isArray(r.customPatterns) ? r.customPatterns : []).filter(isObj)
    .filter((p) => str(p.id, 100) && str(p.pattern) && str(p.label, 100))
    .map((p) => ({
      id: p.id as string, name: str(p.name, 200) ? p.name : '', label: p.label as string, pattern: p.pattern as string,
      ...(str(p.flags, 10) ? { flags: p.flags } : {}), enabled: bool(p.enabled, true),
    }))
    .slice(0, 200);
  const customSites: CustomSite[] = (Array.isArray(r.customSites) ? r.customSites : []).filter(isObj)
    .filter((s) => str(s.host, 253) && HOST_RE.test(s.host))
    .map((s) => ({
      host: s.host as string,
      ...(str(s.input, 500) && s.input ? { input: s.input } : {}),
      ...(str(s.send, 500) && s.send ? { send: s.send } : {}),
    }))
    .slice(0, 100);
  return {
    enabled: bool(r.enabled, d.enabled),
    pasteMode: oneOf(r.pasteMode, ['auto', 'review', 'off'], d.pasteMode),
    sendMode: oneOf(r.sendMode, ['review', 'auto', 'block', 'off'], d.sendMode),
    autoResend: bool(r.autoResend, d.autoResend),
    livePill: bool(r.livePill, d.livePill),
    disabledSites: strings(r.disabledSites).filter((h) => HOST_RE.test(h)),
    fileMode: oneOf(r.fileMode, ['warn', 'redact', 'off'], d.fileMode),
    restoreMode: bool(r.restoreMode, d.restoreMode),
    customSites,
    minConfidence: oneOf(r.minConfidence, ['low', 'medium', 'high'], d.minConfidence),
    detectors,
    allowlist: strings(r.allowlist, 5000),
    customPatterns,
    placeholderStyle: oneOf(r.placeholderStyle, ['bracket', 'mustache', 'angle'], d.placeholderStyle),
  };
}
