---
version: 1
slug: "src-content-ui-ts"
primary_target: "src/content/ui.ts"
related_targets: ["src/popup/popup.html","src/options/options.html","src/options/page.css"]
---

# Surface brief: Redactor UI (in-chat layer, popup, settings)

Scope: the in-chat review/failure dialogs, toast and pill (`src/content/ui.ts`), the toolbar popup (`src/popup/`), and the settings page (`src/options/`). Mode: Operate.

Audience and task: developers mid-task in an AI chat who were about to send a secret; decide in seconds what to redact, then keep working. Settings and popup are occasional, scan-and-adjust tasks.

Constraints: standard controls and keyboard behaviour stay (focus trap, Esc, Enter on primary, Alt+Z undo); WCAG 2.2 AA; closed shadow root; host page untrusted; px sizing in the in-chat layer; zero runtime dependencies; no hosted fonts.

User answers: redesign all three surfaces; the current look reads as a template with no personality; presence "in between" (recognizably Redactor, calm beside the chat app). Chosen direction: Request for Comments (the assigned roll), sketch `.impeccable/mocks/decision/assigned.html`.

## Direction contract

THESIS: Redactor's placeholders already are citation keys, so every surface is set as a standards document: the review is a References section, settings is a spec with a contents page. Refuses the rounded-card, blue-button, soft-shadow prompt every extension ships.

OWN-WORLD: Paper #f6f5ef with ink #17171b (dark: ink ground, paper text); citation blue for keys only, rubric red only for the risky action. Hairline rules, 3-4px corners, one text size ranked by weight; mono only for keys, masked values, header blocks, positions.

STORY: The user sees Redactor's header block, reads each finding as a reference ([KEY] beside its source, masked value and line), sees the original stays local, and redacts with Enter.

FIRST VIEWPORT: Dialog centred over the dimmed chat, 640px. Two-column mono header block (Redactor / category | host / date) over an ink rule; bold title, one lead line; References list on hairlines; reassurance line; footer: red "Send as-is" left, Cancel and ink-filled primary right.

FORM: Request for Comments, candidate 6 of 7; the roll ran (API catalog source) but this CLI printed no SEED REFERENCE, so seed: none (not printed).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Raises carried from declined challengers
- Japanese high-density web: findings on hairline rules, not soft cards.
- Acetate tab manual: one text size; rank by weight and case.
- Convention circle catalog: each finding carries its line position.
- Terminal yellow wayfinding: one message per line; the decision stated once.
- Emission-line rail: state in line form too: redacted keys solid, skipped struck, allowed dashed.

## Signature moves
- In-chat: placeholders as citation keys in a References list.
- Popup and settings: RFC contents page with dot leaders (popup stats, settings table of contents as working anchor links).

## Unresolved
- Category line replaced by real metadata (reference count, send status, version) per finish review.
- Placeholder numbers in the review assume every earlier same-label item is redacted; unticking one can shift later numbers by one at redaction time.
