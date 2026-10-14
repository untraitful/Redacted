# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

(A Manifest V3 browser extension: Chrome 121+ first, Firefox 128+ compatible. Its UI surfaces are an in-page layer injected into third-party AI chat sites, a toolbar popup, and an options page.)

## Users

Developers and other technical people who use AI chat assistants (ChatGPT, Claude, Gemini, Copilot, Perplexity, DeepSeek, Mistral, Grok, Poe) while working: debugging, asking about configs, pasting stack traces, `.env` files, `curl` commands, logs and connection strings. They are usually mid-task and moving fast, and the moment Redactor matters is the moment they were about to leak a credential or personal data without noticing.

The intended audience is public: anyone installing it from the Chrome Web Store or Firefox Add-ons, not a known team.

## Product Purpose

Redactor catches secrets and personal data in text headed for an AI chat and replaces them with typed placeholders (`[OPENAI_API_KEY_1]`, `[DB_PASSWORD_2]`) before the site ever receives them. The originals never leave the browser.

Success means an accidental paste of a real credential reaches the chat as a readable placeholder, the user's conversation still makes sense, and the interruption costs seconds. It is a seatbelt for accidental pastes, not DLP.

## Positioning

- **100% local:** zero network requests, telemetry, accounts or remote code. Detection runs in the page; originals live only in memory and RAM-backed session storage, cleared when the tab or browser closes.
- **Intercepts at the moment of leaving**, not after: on paste, drop, send (Enter, button, form submit) and file attach, inside the site's own editor.
- **Keeps the text useful:** typed, numbered, deterministic placeholders preserve meaning (`postgres://admin:[DB_PASSWORD_1]@host` stays readable), and the same value always maps to the same placeholder in a tab.
- **Fails closed:** if it detects something but can't safely rewrite the input, it blocks the send and says why, with an explicit "send anyway" override. Letting a secret through silently is the worst possible bug.

## Operating Context

- Runs inside someone else's app: the in-page UI lives in a closed shadow root on third-party pages it doesn't control (light or dark, any layout, React/ProseMirror/Quill/Lexical editors). The host page is untrusted.
- Interruptions happen at high-stakes, time-pressured moments, often keyboard-driven.
- Input ranges from a single key to a 200-line stack trace with several secrets.
- Extra sites are added by the user at runtime with a per-host permission prompt.

## Capabilities and Constraints

- About 70 detectors (vendor key formats, private keys, JWTs, auth headers, URI passwords, secret-named assignments, high-entropy strings near keywords, PII, IP addresses), an allowlist, per-detector toggles, custom regex patterns, and a minimum-confidence setting.
- Modes: paste (auto / review / off), send (review / auto / block / off), uploads (warn / experimental redact / off), and an experimental restore mode that shows originals locally in the transcript.
- Minimal permissions (`storage`, `scripting`, specific chat hosts); settings in `storage.local`, never `sync`; vault values are never logged, exported, or shown in full (masked previews only, e.g. `sk-p…3Q2a (51)`). "Always allow" stores a hash, not the value.
- Zero runtime dependencies; TypeScript strict.
- Terminology in use: secrets, findings, placeholders, vault, allowlist, redact.
- Open: site-specific selectors are unverified against the live sites; Firefox runtime behavior is unverified beyond linting.

## Brand Commitments

- The product name is **Redactor** (the GitHub repository is named `Redacted`; that is incidental).
- Voice in shipped copy is plain and technical, and honest about limits ("a seatbelt, not DLP"; the README's threat model states plainly what it does not protect against).

## Evidence on Hand

- Working code with unit, DOM, and Playwright end-to-end tests; README with permissions rationale and threat model; manual QA checklist (`docs/QA.md`).
- Repository: https://github.com/untraitful/Redacted
- Not yet published to any store. There are no users, reviews, testimonials, install counts, or benchmarks; future work must not invent them.

## Product Principles

1. **Never let a secret through silently.** When unsure whether a write worked, stop and tell the user.
2. **Interrupt only when it matters, and briefly.** The user is mid-task; every extra second or click is a cost.
3. **Local and verifiable.** No network, no accounts, no telemetry; claims should be checkable in the code and the browser's network panel.
4. **Keep the conversation useful.** Redaction should preserve meaning, not destroy it.
5. **Honest about limits.** Say what it can't catch instead of implying full protection.

## Accessibility & Inclusion

WCAG 2.2 AA is a hard requirement for all surfaces (in-page UI, popup, options): contrast, keyboard-only operation, visible focus, screen reader announcements of state changes, target sizes, and no time limits on recovery actions without a way to extend them.
