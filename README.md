# Redactor

A browser extension that replaces credentials, API keys, tokens, passwords and personal data with typed
placeholders like `[OPENAI_API_KEY_1]` or `[DB_PASSWORD_2]` **before** the text reaches an AI chat site.
The originals never leave your browser.

> **It's a seatbelt for accidental pastes, not DLP.** Read the [threat model](#threat-model) before relying on it.

Supported out of the box: ChatGPT, Claude, Gemini, Copilot, Perplexity, DeepSeek, Mistral, Grok and Poe.
You can add others from the settings page.

```
OPENAI_API_KEY=sk-proj-…            →  OPENAI_API_KEY=[OPENAI_API_KEY_1]
postgres://admin:hunter2@db/app     →  postgres://admin:[DB_PASSWORD_1]@db/app
password: "s3cret!"                 →  password: "[PASSWORD_1]"
```

## Install (load unpacked)

Requires Node 22+ and pnpm.

```sh
pnpm install
pnpm build          # dist/chrome, dist/firefox, dist/redactor-chrome.zip, dist/redactor-firefox.zip
```

- **Chrome / Edge / Brave** (121+): open `chrome://extensions`, enable *Developer mode*, click *Load unpacked*, and pick `dist/chrome`.
- **Firefox** (128+): open `about:debugging#/runtime/this-firefox`, click *Load Temporary Add-on…*, and pick `dist/firefox/manifest.json`.

## Development

| Command | What it does |
|---|---|
| `pnpm test` | Unit tests (Vitest): the engine, plus the content script, popup and options in happy-dom |
| `pnpm e2e` | Builds, then runs Playwright on Chromium with the real `dist/chrome` against local fixture pages |
| `pnpm typecheck` | `tsc --noEmit` (strict) |
| `pnpm build` | Production build and zips |
| `pnpm lint:firefox` | `web-ext lint` on the Firefox build |

`pnpm e2e` needs Playwright's Chromium once: `pnpm exec playwright install chromium`.

## How it works

1. **Detection** (`src/engine/`): about 70 detectors, from vendor-specific key formats (OpenAI, AWS, GitHub, Stripe…) to
   generic ones (private key blocks, JWTs, `Authorization:` headers, passwords in connection URIs, secret-named
   assignments in `.env`/YAML/JSON/code/CLI flags, and high-entropy strings next to a secret keyword) plus PII and IP addresses.
   - Overlaps are resolved by priority, then confidence, then length.
   - Once a value is found, every other copy of it in the text is redacted too, along with values already in this tab's vault.
   - Text inside existing placeholders is never touched, so redacting twice changes nothing.
2. **Interception** (`src/content/`): listeners run in the capture phase on `window` at `document_start`, ahead of
   the page's own listeners:
   - **Paste and drop:** the text is redacted before the editor sees it.
   - **Send** (Enter, Ctrl/Cmd+Enter, the send button, form submit): the whole input is scanned. If anything is found,
     the event is stopped and you get a review panel, depending on your settings.
   - **Uploads:** text-like files are scanned. By default the next send is blocked until you confirm.
3. **Writing back** is the fragile part, so every write is read back and verified:
   - `<textarea>`/`<input>` (including React-controlled ones): the native prototype `value` setter, then a bubbling `input` event.
   - contenteditable (ProseMirror, Quill, Lexical): select, then a synthetic `paste` carrying a `DataTransfer`, falling back to
     `execCommand('insertText')`.
   - If verification fails, the extension **fails closed**: nothing is sent, and you can copy the redacted text or explicitly send anyway.
4. **Vault** (`src/background/`): placeholder ↔ original for each tab + site, held in memory and in `chrome.storage.session`
   (RAM-backed and cleared when the browser closes). It is dropped when the tab closes, never written to
   `storage.local`/`sync`, never logged and never exported. The same value always gets the same placeholder in a tab.

The UI (review panel, toasts, the "secrets detected" pill) lives in a **closed** shadow root, and only masked previews
(`sk-p…3Q2a (51)`) are ever shown.

## Permissions

| Permission | Why |
|---|---|
| `storage` | Settings in `storage.local`, and this tab's vault in `storage.session` (memory only). |
| `scripting` | Registers the content script on sites *you* add, at runtime. |
| Host access: `chatgpt.com`, `chat.openai.com`, `claude.ai`, `gemini.google.com`, `copilot.microsoft.com`, `www.perplexity.ai`, `perplexity.ai`, `chat.deepseek.com`, `chat.mistral.ai`, `grok.com`, `poe.com` | The content script must run on these sites to see pastes and sends. Nothing else is accessed. |
| Optional: `x.com`, `github.com` | Grok on X and Copilot chat run inside these, but granting them means access to *all* of X or GitHub. That's why they're opt-in from settings. |
| Optional: `https://*/*` | Only so that *Add site* can ask for **one** host you type in. The browser prompts for that exact site; nothing broader is granted. |

No `tabs`, `clipboardRead`, `webRequest` or `<all_urls>` permission. No network requests, telemetry or remote code:
`pnpm e2e` aborts and fails on any request that leaves the fixture page.

## Threat model

**What it helps with:** pasting or typing a secret into a supported AI chat by accident. That covers a `.env` file, a stack trace
with a connection string, a `curl` command with a bearer token, or a config file you attach.

**What it does NOT protect against**, plainly:

- **Screenshots and images.** Text in an image isn't read.
- **Voice input.** Dictated text may bypass the paste and send paths.
- **Binary files.** PDF, DOCX, XLSX, archives and so on aren't scanned. Text files over 2 MB aren't scanned either (you get a notice).
- **Text sent while the extension is disabled,** paused for the site, or before the page finished loading the content script.
- **A site changing its editor or send mechanism** so that interception breaks. Generic fallbacks help, but a site can
  always send by a path we don't see (for example a custom keyboard handler on `window`, or sending on `pointerdown`).
- **Secrets that don't match any pattern.** Short or dictionary-word passwords outside an assignment, internal token formats
  (add a custom pattern), and anything obfuscated.
- **Anything that already happened:** text sent before you installed it, other tabs, other browsers, browser sync of history or form data.
- **A malicious extension or a compromised browser.**
- **Restore mode (experimental, off by default)** puts the originals back into the page's DOM tree, inside closed shadow roots.
  Page scripts reading `textContent` see the placeholder, but the originals are part of the page while it's on.

If you need guarantees, use real DLP and rotate any credential that might have leaked.

## Known limitations

- **Site selectors are unverified.** They are best guesses (`verified: false` in `src/sites/index.ts`). Every adapter falls back
  to generic selectors, and interception itself doesn't depend on them, but the send button and restore mode do. See
  [docs/QA.md](docs/QA.md) for the manual checks.
- **Redacting on send rewrites the whole editor as plain text,** so rich formatting such as code blocks and lists can be flattened.
- **Dropping text into a textarea** inserts at the caret, not at the drop point.
- **Unquoted single-word values** (`password: sunshine`) are treated as prose; quoted ones are caught. Repeats of a value are only
  propagated when the value has 6+ characters.
- **Warn-mode uploads can't tell when you remove the attachment,** so you'll be asked to confirm once.
- **Redact-mode uploads (experimental)** work in Chromium for file inputs, pastes and drops (covered by e2e). Firefox is unverified.
- **Custom regexes you add** run on every keystroke (debounced) and aren't protected against catastrophic backtracking.

## Adding a site

**Without code:** Settings → *Sites* → *Add site*. Enter the host, plus optional CSS selectors for the input and the send button.
The browser asks for access to that host only, and the content script is registered for it.

**As a built-in adapter:** add an entry to `SITES` in `src/sites/index.ts`:

```ts
{
  id: 'example', name: 'Example Chat', hosts: ['chat.example.com'],
  input: ['div.ProseMirror[contenteditable="true"]'],   // ordered fallbacks; generic ones are appended
  send: ['button[data-testid="send"]'],
  messages: ['[data-role="message"]'],                   // used by restore mode
  write: ['paste', 'insertText'],                        // contenteditable write strategy, in order
  verified: false,                                       // true only after checking on the live site
},
```

Then add `https://chat.example.com/*` to `host_permissions` in `src/manifest.json` (the content-script matches are
derived from it), add a row to the permissions table above, and run the QA checklist for it.
