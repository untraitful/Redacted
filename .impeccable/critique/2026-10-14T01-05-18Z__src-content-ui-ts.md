---
target: in-page UI (review panel, dialogs, toast, pill)
total_score: 22
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
target_identity: "file:/home/j/Projects/Extensions/StartUp/src/content/ui.ts"
target_fingerprint: "sha256:d9a4300b66fddf5dab8b6f5a0c03509d0750bef26f5cc9623320996165cd12a4"
target_path: /home/j/Projects/Extensions/StartUp/src/content/ui.ts
timestamp: 2026-10-14T01-05-18Z
slug: src-content-ui-ts
---
Method: dual-agent (A: design review · B: detector + browser evidence)

Target: src/content/ui.ts (review panel, blocked review, failure dialog, upload dialog, Undo toast, live pill), rendered from the real createUi() over a mock dark chat page at 1280x800 and 390x844, light and dark.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Pill has no live region; toast vanishes after 8s; no location for each finding |
| 2 | Match System / Real World | 3 | Good dev vocabulary; "items/secrets/findings" used interchangeably; "1 item that look like" |
| 3 | User Control and Freedom | 2 | Undo only in an 8s toast; "Always allow" persists forever in one click |
| 4 | Consistency and Standards | 2 | "Send blocked" title with "Send as-is" at equal weight; red only on the pill; safe default differs per dialog |
| 5 | Error Prevention | 2 | Risky "Send as-is"/"Send anyway" styled like Cancel; Always-allow silently unchecks its row |
| 6 | Recognition Rather Than Recall | 2 | Masked preview has no line/context; inserted placeholder not shown |
| 7 | Flexibility and Efficiency | 3 | Enter→Enter is fast; no key for Send as-is, select none, or Undo |
| 8 | Aesthetic and Minimalist Design | 3 | Lean, but rows are 4 equal-weight elements plus a button |
| 9 | Error Recovery | 2 | Failure copy is honest, but copy result is grey 14px text and "Copy failed." has no next step |
| 10 | Help and Documentation | 1 | No "why flagged", no link to settings/allowlist, no note that Always allow persists |
| **Total** | | **22/40** | **Acceptable** |

## Design Specificity Verdict

LLM assessment: The information architecture is product-specific (typed labels, masked previews with length, "originals stay in this browser"), but the visual layer is generic extension boilerplate: system font, white/#1e1e1e card, #1f6feb primary, grey buttons, black toast. The review dialog never names Redactor and has no mark or signature color, so inside someone else's chat the user can't tell who is intervening, and a page could imitate it. Only the red pill has a point of view, and its red appears nowhere else.

Deterministic scan: 0 findings everywhere (file scan of ui.ts, URL scans of four states at 1280 and 390, in-page overlay). These are false negatives: the CSS lives in a TS template string the file scan doesn't parse, and the in-page detector scans light DOM only (proven with a low-contrast probe inside the shadow root that it missed and the same probe outside that it caught). Browser measurement instead confirmed the defects below.

## Priority Issues

[P0] "Always allow" pressed state is unreadable in dark mode. #eee on #e7f0ff = 1.01:1. button[aria-pressed=true] sets only background; the dark button color wins. Fix: own colors for the pressed state in both schemes plus a visible text/icon change ("Allowed ✓"), and raise the button to ≥24px tall (it is 22.8px, under WCAG 2.5.8). Command: /impeccable harden.

[P1] Undo lives only in a fragile toast. 8s auto-dismiss with no pause on hover/focus (WCAG 2.2.1), appended at end of body so keyboard users can't reach Undo, covers the composer and send button, and #1a1a1a blends into dark hosts. Fix: pause on hover/focus, ≥15s when it carries Undo, a keyboard shortcut or focus handoff, position above the composer, border/shadow. Command: /impeccable harden.

[P1] Review rows overflow at 390px and at 200% zoom. Panel scrollWidth 410 vs clientWidth 358; rows 390px wide; Always allow ends at x≈415 (nowrap preview in a flex row). Footer scrolls away with many findings. Fix: stack rows, ellipsize preview, sticky footer. Command: /impeccable adapt.

[P1] The host page controls the UI's existence and the UI has no identity. Page CSS `redactor-ui{display:none !important}` hides the dialog entirely (send stays blocked with no explanation); page !important letter-spacing/text-transform leak into the heading. No "Redactor" name or mark on the review, and no visual danger hierarchy: Block mode looks like Review and "Send as-is" sits at Cancel's weight. Fix: set host display/position/all via inline !important styles, add a branded header and one signature color shared with the pill, and demote risky sends to a separated danger-styled text button. Command: /impeccable bolder (plus harden).

[P2] Review lacks context for large pastes and has thin accessible names. No line/context per finding, placeholder not shown, no select all/none, every "Always allow" button has the same accessible name, dialogs lack aria-describedby, the pill has no live region, and "1 item that look like" is ungrammatical. Fix: masked context line and placeholder per row, group by type past 4, row-specific names, describedby on intro, aria-live pill, pluralized copy. Command: /impeccable clarify.

## Persona Red Flags

Alex (keyboard power user): Enter→Enter works; toast Undo unreachable by keyboard; no key for Send as-is (tabs past 2N row controls); pill not focusable; held Enter may trigger Redact selected at once.

Sam (screen reader, 200% zoom): all "Always allow" buttons share one name; checkbox name runs label+name+masked preview together; pill changes never announced; toast leaves in 8s; dialog reason text not announced on open; 200% zoom hits the 390px overflow.

Developer pasting a 200-line trace with 6 secrets: six near-identical rows without line context; occurrences collapsed to ×2 but not shown; footer scrolls out of view; "Always allow" beside every value invites one-click permanent allowlisting under pressure; 8s to catch a wrong redaction.

## Minor Observations

Pill position only updates on input (not scroll/resize) and clamps to top:4px; pill z-index one below max; UI follows OS scheme not the host's; px font sizes ignore user scaling; empty role=status paragraph adds a gap; upload dialog says "Remove the file" without a way to; failure title "Redactor blocked this" is vague; type label and description are 12px, small for the most important text; heading is only 2px larger than body.

## Questions to Consider

If it says "Send blocked", why is "Send as-is" one click away and styled like Cancel? Should "Always allow" live in the interception moment at all? Would an inline in-editor diff beat a modal list for a 200-line paste? What proves the dialog is Redactor and not the page?
