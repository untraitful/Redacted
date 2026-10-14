export type Category = 'secret' | 'pii' | 'network';
export type Confidence = 'high' | 'medium' | 'low';
export type PlaceholderStyle = 'bracket' | 'mustache' | 'angle';

export interface Detector {
  id: string;
  /** Placeholder label, e.g. OPENAI_API_KEY. */
  label: string;
  /** Human-readable name for the UI. */
  name: string;
  category: Category;
  confidence: Confidence;
  priority: number;
  /** Must carry the `g` and `d` flags. */
  regex: RegExp;
  /** Capture group holding the value to redact (default 0, the whole match); with a list, the first that matched. */
  group?: number | number[];
  validate?: (value: string, match: RegExpExecArray, text: string) => boolean;
  labelFor?: (value: string, match: RegExpExecArray) => string;
  defaultOn: boolean;
}

export interface Finding {
  detectorId: string;
  name: string;
  label: string;
  category: Category;
  confidence: Confidence;
  priority: number;
  start: number;
  end: number;
  value: string;
  /** Found as a repeat of another detection or a vault value, not by its own pattern. */
  propagated?: boolean;
}

export interface CustomPattern {
  id: string;
  name: string;
  label: string;
  pattern: string;
  flags?: string;
  enabled: boolean;
}

export interface EngineSettings {
  minConfidence: Confidence;
  /** Per-detector overrides of `defaultOn`. */
  detectors: Record<string, boolean>;
  /** Exact strings, or `/regex/flags`. */
  allowlist: string[];
  customPatterns: CustomPattern[];
  placeholderStyle: PlaceholderStyle;
}

export const DEFAULT_ENGINE_SETTINGS: EngineSettings = {
  minConfidence: 'low',
  detectors: {},
  allowlist: [],
  customPatterns: [],
  placeholderStyle: 'bracket',
};
