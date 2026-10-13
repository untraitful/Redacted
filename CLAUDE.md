# Redactor

A browser extension (MV3) that replaces secrets and PII with typed placeholders (`[OPENAI_API_KEY_1]`)
in AI chat inputs before the text reaches the site. It is a seatbelt for accidental pastes, not DLP.

## Workflow
- Work in phases (1 engine, 2 content script, 3 uploads + restore, 4 background/popup/options, 5 e2e + docs).
  At the end of each phase, run the tests, show the output, and **stop for the user's go-ahead**.
- Plan each phase first: the file list, the interfaces, and how it will be verified. Write tests alongside the code.
- Git: this directory is its own repo (nested inside ~/Projects). Make small commits, one per meaningful step.
- Never commit real secrets. Test values are synthetic: vendor doc examples (`AKIAIOSFODNN7EXAMPLE`) or
  strings built at runtime from repeated patterns, so the repo itself doesn't trip secret scanners.

## Commands (pnpm; npm is not installed)
- `pnpm install`
- `pnpm test` runs the Vitest unit tests (engine and anything DOM-free; DOM pieces use happy-dom/jsdom)
- `pnpm e2e` runs Playwright on **Chromium only** against the local fixture pages in `e2e/fixtures/`
- `pnpm build` produces `dist/chrome/`, `dist/firefox/`, `dist/redactor-chrome.zip` and `dist/redactor-firefox.zip`
- `pnpm typecheck` runs `tsc --noEmit` (strict)
- Firefox is verified with `web-ext lint` on the Firefox build plus the manual QA checklist. It has no automated e2e.

## Hard rules
- 100% local: no network requests, telemetry or remote code. **Zero runtime dependencies.** Dev deps are fine.
- Originals (secret values) live only in memory and `chrome.storage.session`. They never go in
  `storage.local`/`sync`, logs, console output, error messages, or exported settings.
  The UI shows only masked previews (`sk-p…3Q2a (51)`).
- Logging: `console.warn('[Redactor] ...')` with no values in it, ever.
- Fail closed: if something is detected but the input can't be rewritten and verified, block the send,
  say why, and offer "Send anyway" and "Copy redacted text". Letting a secret through silently is the worst bug.
- Settings live in `storage.local`.
- TypeScript strict mode. Minimum browsers: Chrome 121+ (tolerates `background.scripts`) and Firefox 128 ESR+.

## Architecture
- `src/engine/` is pure and DOM-free (it runs in Node). It holds detectors, overlap resolution, propagation,
  allowlist, custom patterns, placeholders and restore.
- `src/sites/` holds config-driven adapters: ordered fallback selectors for input/send/messages, a write
  strategy, and `verified: boolean`, plus a generic fallback adapter. **Selectors are unverified until checked
  on the live site. Never present a guessed selector as verified.**
- `src/content/` covers interception (capture phase on `document`), editor read/write and verification,
  and the UI in a closed shadow root.
- `src/background/` is the service worker. It owns the vault in `storage.session` (keyed by tab + host),
  the badge, cleanup on tab close, and the commands.
- `src/options/` and `src/popup/`.

### Key decisions
- **The engine runs synchronously in the content script.** `paste`/`keydown` must call `preventDefault`
  synchronously, so detection can't round-trip to the background.
- **The background owns the vault.** Content scripts can't rely on `storage.session` (Firefox denies it to
  content scripts, and Chrome needs `setAccessLevel`). The content script holds an in-memory mirror
  that it fetches on load and pushes new entries to over `runtime` messaging.
- Bundling uses esbuild. Content scripts are IIFE bundles (classic scripts, no ESM). One manifest source,
  with per-browser tweaks applied at build time. The manifest includes both `background.service_worker` and
  `background.scripts`, plus `browser_specific_settings.gecko`.
- Write strategies: for textarea/input, use the native prototype `value` setter or `setRangeText`, then
  dispatch a bubbling `input` event. For contenteditable, select all and dispatch a synthetic `paste` with
  a `DataTransfer`, falling back to `execCommand('insertText')`. Our own synthetic events are marked so we
  ignore them. Read back and verify (normalizing whitespace) after every write.

### Permissions
- `storage` and `scripting` only.
- Default `host_permissions` cover dedicated chat hosts only: chatgpt.com, chat.openai.com, claude.ai,
  gemini.google.com, copilot.microsoft.com, www.perplexity.ai, chat.deepseek.com, chat.mistral.ai,
  grok.com and poe.com.
- `optional_host_permissions` hold x.com (Grok on X), github.com (Copilot chat), and `https://*/*`,
  which is needed to request user-added custom sites at runtime. Each gets a justification in the README.

## Detector shape
`{ id, label, name, category: 'secret'|'pii'|'network', confidence: 'high'|'medium'|'low', priority,
regex, group?, validate?, labelFor?, defaultOn }`. Overlaps resolve by priority, then confidence, then
length. Every regex must be ReDoS-safe: use bounded quantifiers, avoid nested unbounded repeats, and add a
ReDoS test for anything non-trivial.
