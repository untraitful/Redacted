import { DEFAULT_ENGINE_SETTINGS, type EngineSettings } from '../engine/types';

export type PasteMode = 'auto' | 'review' | 'off';
export type SendMode = 'review' | 'auto' | 'block' | 'off';

export interface Settings extends EngineSettings {
  enabled: boolean;
  pasteMode: PasteMode;
  sendMode: SendMode;
  /** After an auto redaction on send, send immediately instead of waiting for the user's next Enter. */
  autoResend: boolean;
  livePill: boolean;
  /** Hosts where the user switched Redactor off. */
  disabledSites: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  ...DEFAULT_ENGINE_SETTINGS,
  enabled: true,
  pasteMode: 'auto',
  sendMode: 'review',
  autoResend: false,
  livePill: true,
  disabledSites: [],
};

/** Settings live in storage.local under one key; unknown or missing fields fall back to defaults. */
export const SETTINGS_KEY = 'settings';

export function mergeSettings(raw: unknown): Settings {
  return { ...DEFAULT_SETTINGS, ...(raw && typeof raw === 'object' ? (raw as Partial<Settings>) : {}) };
}
