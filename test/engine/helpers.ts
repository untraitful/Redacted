import { DEFAULT_ENGINE_SETTINGS, DETECTORS, createEngine, type EngineSettings } from '../../src/engine';

export const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
export const URLSAFE = ALNUM + '_-';
export const B64 = ALNUM + '+/';
export const HEX = '0123456789abcdef';
export const UPNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

let seed = 1;
/** Deterministic pseudo-random string, built at runtime so no secret-shaped literal lives in the repo. */
export function fake(len: number, alphabet = ALNUM): string {
  let x = (seed++ * 2654435761) >>> 0;
  let s = '';
  for (let i = 0; i < len; i++) {
    x = (Math.imul(x, 1103515245) + 12345) >>> 0;
    s += alphabet[(x >>> 16) % alphabet.length];
  }
  return s;
}

export const settings = (over: Partial<EngineSettings> = {}): EngineSettings => ({ ...DEFAULT_ENGINE_SETTINGS, ...over });
export const allOn = () => settings({ detectors: Object.fromEntries(DETECTORS.map((d) => [d.id, true])) });
export const engineAll = () => createEngine(allOn());
export const engineDefault = () => createEngine(settings());
