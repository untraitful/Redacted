# Manual QA checklist

The automated tests use local fixtures. Real sites change their editors often, so run this per site before
trusting an adapter, and flip `verified: true` in `src/sites/index.ts` only after every check passes.

Use **fake** secrets only. For example, generate a key-shaped string in the settings page's "Test the detector" box and copy it from there:
`ghp_` followed by 36 letters and digits, `AKIAIOSFODNN7EXAMPLE`, or `postgres://admin:Fake-Pa55word@db.example.net/app`.
Keep DevTools open on the **Console** (look for `[Redactor]` warnings) and the **Network** tab.

## Setup (once per browser)

- [ ] Load `dist/chrome` (or `dist/firefox`) unpacked; the toolbar icon appears.
- [ ] Settings page opens from the popup and shows no console errors.
- [ ] The Firefox build passes `pnpm lint:firefox` with 0 errors.

## Per site

Run each block on: ChatGPT · Claude · Gemini · Copilot · Perplexity · DeepSeek · Mistral · Grok · Poe
(and x.com / github.com after granting them in settings).

**Paste**
- [ ] Paste `token ghp_…` → the editor shows `token [GITHUB_TOKEN_1]` and an Undo toast appears.
- [ ] Undo → the original is back. Enter → it sends without a dialog (allowed for this session).
- [ ] Paste multi-line text with a secret on line 3 → line breaks are kept and only the secret is replaced.
- [ ] Paste rich text (copy from a web page) whose *link* contains `?access_token=…` → plain text is inserted, with no hidden link.
- [ ] Paste an image → it goes through untouched.

**Send**
- [ ] Type a secret, press Enter → the review panel opens and nothing is sent (check the Network tab and the transcript).
- [ ] The panel shows a masked preview only (`ghp_…xxxx (40)`), never the full value.
- [ ] *Redact selected* → the editor shows the placeholder and nothing is sent. Enter again → sends the placeholder.
- [ ] Click the site's **send button** with a secret → the same review panel opens (this checks the `send` selectors).
- [ ] *Send as-is* → sends the original once and doesn't loop.
- [ ] Esc → the panel closes, the input is unchanged, nothing is sent.
- [ ] Shift+Enter → newline, no panel.
- [ ] Ctrl/Cmd+Enter (if the site sends with it) → intercepted.
- [ ] IME (e.g. Japanese input): pressing Enter to confirm a composition does not open the panel.
- [ ] Live pill: typing a secret shows "1 secret detected · Redact" near the input; clicking it redacts.

**Editor integration**
- [ ] After a redaction, the site's own state agrees: the send button is enabled, character counters update, and the
      sent message contains the placeholder (not the original) in the transcript **and** in the request payload (Network tab).
- [ ] Draft persistence: reload the page → no original reappears from the site's draft storage.
- [ ] SPA navigation (new chat, switch conversation) → interception still works without a reload.
- [ ] Console shows no `[Redactor]` warning. If you see "adapter selectors not found", the adapter needs updating.

**Uploads**
- [ ] Attach a `.env` with a secret → toast. Enter → the "Upload contains secrets" dialog names the file and count.
- [ ] *Send anyway* sends; Cancel doesn't.
- [ ] (Experimental, `fileMode: redact`) attach the same file → the site receives a copy with placeholders (check the request payload).
- [ ] Drag-and-drop the file onto the chat → same behavior as above.

**Popup and badge**
- [ ] The badge counts redactions for this tab. The popup lists placeholder + masked value. *Clear vault* empties both.
- [ ] Per-site toggle off → no interception on that site. Toggle back on → it works again without a reload.
- [ ] Alt+Shift+R redacts the current input.

**Restore mode (experimental, off by default)**
- [ ] Enable it → after a reply finishes streaming, placeholders in the transcript show the original (highlighted).
- [ ] The site doesn't break or flicker. Streaming replies are untouched until they finish.
- [ ] Copying a message via the site's copy button gives the placeholder.
- [ ] Disable it → placeholders come back.

## Firefox specifics

- [ ] The content script runs at `document_start` on each supported site.
- [ ] contenteditable writes: the synthetic paste is accepted by ProseMirror/Quill/Lexical. If not, the fallback or fail-closed dialog appears.
- [ ] The popup shows this tab's vault (reads `storage.session`).
- [ ] Settings → Add site → the permission prompt appears, and the site works after a browser restart.

## Privacy checks (any site)

- [ ] With DevTools → Application: `storage.local` holds settings only (allowlist entries from "Always allow" are `sha256:` hashes).
- [ ] Export settings → the JSON contains no vault values.
- [ ] Close the tab → its vault is gone (popup in a new tab shows nothing). Restart the browser → nothing persisted.
- [ ] Network tab during all of the above: no request from the extension.
