---
name: Redactor
description: Every surface set as a standards document; placeholders are citation keys.
colors:
  paper: "#f6f5ef"
  paper-2: "#ecebe3"
  ink: "#17171b"
  ink-2: "#45454d"
  muted: "#66666d"
  rule: "#cbc9bf"
  cite: "#1f4fb8"
  rubric: "#b3261e"
  paper-dark: "#18181c"
  paper-2-dark: "#222228"
  ink-dark: "#ecebe4"
  ink-2-dark: "#c6c5bd"
  muted-dark: "#a2a2a9"
  rule-dark: "#3b3b43"
  cite-dark: "#94b3ff"
  rubric-dark: "#ff8f80"
typography:
  title:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "14px"
    fontWeight: 700
    lineHeight: 1.4
  subtitle:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  mono:
    fontFamily: "ui-monospace, SF Mono, Cascadia Mono, Menlo, Consolas, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.55
  mono-small:
    fontFamily: "ui-monospace, SF Mono, Cascadia Mono, Menlo, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 400
rounded:
  control: "3px"
  sheet: "4px"
spacing:
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  inset: "28px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.subtitle}"
    rounded: "{rounded.control}"
    padding: "6px 16px"
    height: "34px"
  button-primary-hover:
    backgroundColor: "{colors.ink-2}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "6px 16px"
    height: "34px"
  button-secondary-hover:
    backgroundColor: "{colors.paper-2}"
  button-risk:
    backgroundColor: "transparent"
    textColor: "{colors.rubric}"
    typography: "{typography.body}"
    padding: "6px 2px"
  button-small:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.control}"
    padding: "2px 10px"
  input-field:
    backgroundColor: "{colors.paper-2}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "7px 9px"
    height: "36px"
  citation-key:
    textColor: "{colors.cite}"
    typography: "{typography.mono}"
  dialog:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sheet}"
    width: "640px"
  pill:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.mono}"
    rounded: "{rounded.control}"
    padding: "3px 12px"
    height: "28px"
---

# Design System: Redactor

## Overview

**Creative North Star: "Request for Comments"**

Every Redactor surface is set as a standards document. Redactor's placeholders already are citation keys, so the in-chat review is a References section, the settings page is a spec with a contents page, and the popup is a short memo with the same header block. Paper and ink, hairline rules, one text size, and a monospace voice reserved for the parts a document would set in mono: keys, masked values, header blocks, positions.

The layer sits on top of third-party AI chat apps, so it has to be recognisably Redactor while staying calm beside the host. It does that by refusing the rounded-card, blue-filled-button, soft-shadow vocabulary every extension ships, and by ranking text with weight and position instead of size. Density is a document's density: rows on rules, no boxes around groups, aligned columns.

Light mode is paper ground with ink text; dark mode inverts to an ink ground with paper-toned text. Both modes follow `prefers-color-scheme` and carry the same roles.

**Key Characteristics:**
- Paper and ink ground; one accent for keys, one for the risky action, nothing else coloured.
- A single 14px text size; rank comes from weight (700, 600, 400) and position.
- Mono only for keys, masked values, header blocks, positions and leader values.
- Hairline rules separate rows; an ink rule closes the header block and opens the footer.
- Square-ish corners (3px controls, 4px sheets).
- Sized in px throughout (host pages shrink the root font; browser zoom still scales px).

## Colors

A paper-and-ink neutral set with two narrow-purpose accents, each defined for light and dark.

### Primary
- **Citation Blue** (`cite`, dark `cite-dark`): placeholder keys in the References list, popup vault keys, the pill count, checkbox accent, link colour, text selection, and the 2px focus ring. Never a button fill.

### Secondary
- **Rubric Red** (`rubric`, dark `rubric-dark`): the risky action only ("Send as-is", "Send anyway"), the blocked-mode header rule and category line, and error text on the settings page.

### Neutral
- **Paper** (`paper`): every sheet's ground: dialog, toast, pill, settings page, popup.
- **Paper Two** (`paper-2`): field fills, `pre` blocks, button hover, the pressed "Always allow" state, the status line in the failure dialog.
- **Ink** (`ink`): body text, button borders, the primary button fill, the header-block and footer rules.
- **Ink Two** (`ink-2`): lead and note lines, the abstract, masked values, leader values, primary hover fill.
- **Muted** (`muted`): header-block secondary lines, line positions, meta text, dot leaders, skipped and allowed keys.
- **Rule** (`rule`): hairlines between rows and sections, field borders, quiet small-button borders.

### Named Rules
**The Keys-Only Rule.** Citation blue marks keys and focus, never decoration and never a filled surface.

**The Rubric Rule.** Red appears only on the risky or blocking path. If an element is red, choosing it sends something unredacted or explains why that was stopped.

## Typography

**Body Font:** system-ui (with -apple-system, Segoe UI, Roboto, sans-serif)
**Label/Mono Font:** ui-monospace (with SF Mono, Cascadia Mono, Menlo, Consolas, monospace)

**Character:** The platform sans carries all prose at one size; the platform mono is the document's typewriter voice. No hosted fonts.

### Hierarchy
- **Title** (700, 14px, 1.4): dialog titles, page title, section headings, the "References" section label.
- **Subtitle** (600, 14px, 1.4): sub-headings, spec-table terms, finding names, the primary button label.
- **Body** (400, 14px, 1.5 in-chat / 1.55 on pages): all prose and controls. Abstract capped at 64ch, warnings at 70ch.
- **Mono** (400, 13px; 600 for keys): citation keys, masked values, header blocks, line positions, leader values, textareas, toast sender, pill.
- **Mono small** (400, 12px): popup and narrow-viewport header blocks, keyboard hints, checkbox sub-notes.

### Named Rules
**The One Size Rule.** Prose and headings share 14px. Rank by weight and placement; do not add a larger display size.

**The Typewriter Rule.** Mono is reserved for what a standards document sets in mono: keys, masked values, header blocks, positions, numbers in leaders. Never for prose or headings.

## Layout

The in-chat dialog is a 640px sheet centred over a scrim with 28px side insets; it is a size container and drops to 18px insets under 460px, where the citation column stacks under the key and footer actions fill the row. The settings page is a single 760px column (32px/24px padding, 20px/16px under 520px). The popup is 340px wide with 16px padding.

Recurring structures: the two-column header block (who and what left, where and when right, 24px column gap); the spec table (200px term column, 24px gap, collapsing to one column under 520px); the References row (18px checkbox column, key column up to 220px, source, right-aligned position and action). Spacing steps are 8, 12, 16, 24 and 28px. Coarse pointers raise buttons to 44px and small controls to 36px.

## Elevation & Depth

Pages are flat: depth on the settings page and popup comes from rules and the paper-2 tone only. The in-chat layer is the exception because it floats over a foreign page: the dialog, toast and pill each carry a soft drop shadow so they separate from whatever the host renders, and the dialog sits on a dark scrim. Scrolling References lists show paper-cover scroll shadows top and bottom.

### Shadow Vocabulary
- **Dialog lift** (`box-shadow: 0 18px 50px rgb(0 0 0 / .35), 0 2px 6px rgb(0 0 0 / .12)`): the review and failure dialogs.
- **Toast lift** (`box-shadow: 0 10px 30px rgb(0 0 0 / .3)`): the in-chat toast.
- **Pill lift** (`box-shadow: 0 4px 14px rgb(0 0 0 / .25)`): the "secrets detected" pill.

### Named Rules
**The Overlay-Only Lift Rule.** Shadows exist only on layers that float above a third-party page. Anything inside a sheet, and anything on Redactor's own pages, is flat.

## Shapes

Near-square corners: 3px on buttons, fields, `pre`, the pill and the settings status toast; 4px on floating sheets (dialog, in-chat toast). Borders are 1px. Rows are separated by 1px rules in `rule`; the header block's bottom rule and the dialog footer's top rule are 1px `ink`. Dot leaders are a 1px dotted `muted` border. Groups are never boxed.

## Components

### Buttons
Bordered text, not pills.
- **Shape:** near-square (3px), 1px `ink` border, 34px minimum height, 6px 16px padding.
- **Primary:** `ink` fill with `paper` text at 600; hover shifts fill and border to `ink-2`.
- **Secondary:** transparent with `ink` text and border; hover fills `paper-2`.
- **Small:** 26-30px high, 13px. In-chat "Always allow" uses a `rule` border and `ink-2` text; pressed (`aria-pressed`) takes an `ink` border, `paper-2` fill and 600 weight.
- **Risk:** borderless underlined `rubric` text with 2px inline padding, placed at the far left of the footer; hover thickens the underline to 2px.
- **Focus:** 2px `cite` outline at 2px offset on every control.

### Inputs / Fields
- **Style:** `paper-2` fill, 1px `rule` border, 3px corners, 36px minimum height; textareas use 13px mono.
- **Hover:** border darkens to `muted`.
- **Focus:** the shared 2px `cite` outline.
- **Checkboxes:** native, 16px, `cite` accent.

### RFC Header Block (signature)
Two mono columns over an ink rule: "Redactor" and a muted metadata line (reference count, send status, or version) on the left; host or storage location and a muted date or note on the right, right-aligned. In blocked mode the rule and category line turn `rubric`. Used on the dialog, settings page and popup.

### References List (signature)
An ordered list on hairlines. Each row: checkbox, the placeholder as a mono 600 `cite` key, the finding name (600) with muted count, the masked value in mono `ink-2`, and a right column with the muted mono line position and the "Always allow" toggle. State reads in line form as well as colour: a skipped key is `muted` and struck through, an allowed key is `muted` with a dashed underline.

### Contents with Dot Leaders (signature)
Settings table of contents and popup statistics: a term, a dotted `muted` leader filling the gap, and the current value in 13px mono `ink-2` with tabular numerals. Contents entries are working anchor links in `ink`, turning `cite` and underlined on hover.

### Spec Table
Settings as a definition list: term (600) in a 200px column, control and consequence beside it, each row closed by a `rule` hairline.

### Toast
In-chat: `paper` sheet, 1px `ink` border, 4px corners, toast lift, a mono 600 sender name, message, compact buttons and a 12px mono key hint. On the settings page, the save status is a smaller `ink`-filled mono chip bottom-right that fades and rises 4px.

### Pill
A fixed 28px mono chip near the chat input: `paper` ground, `ink` border, 3px corners, pill lift, the count in 700 `cite`.

## Do's and Don'ts

### Do:
- **Do** keep every text size at 14px for prose and headings, 13px for mono, 12px only for compact mono.
- **Do** set placeholder keys in mono 600 `cite`, and show skipped and allowed states with line-through and dashed underline as well as colour.
- **Do** separate rows with 1px `rule` hairlines and close header blocks with a 1px `ink` rule.
- **Do** give the risky action `rubric` underlined text, apart from the safe actions.
- **Do** size in px and keep the 2px `cite` focus outline on every control.
- **Do** honour `prefers-color-scheme`, `prefers-reduced-motion` and `forced-colors` as the built layers do.

### Don't:
- **Don't** fill a button with `cite` or use blue for anything but keys, links, selection and focus.
- **Don't** use `rubric` for emphasis, headings or anything not on the risky or error path.
- **Don't** box groups in rounded cards; use rules and alignment.
- **Don't** add display sizes or set prose in mono.
- **Don't** put shadows on Redactor's own pages or on elements inside a sheet.
- **Don't** load hosted fonts.
