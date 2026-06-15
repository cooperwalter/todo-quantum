# Baseline inspection ledger — Ink Garden re-skin (2026-06-12)

Per the Pixel Law (CLAUDE.md): every regenerated desktop baseline was rendered and
looked at against DESIGN-SYSTEM.md §6/§8 before blessing. Frozen clock: Wednesday,
June 10, 2026 (`e2e/fixtures.ts` `FIXED_NOW`). One line per inspected desktop PNG.

- `__screenshots__/verification/visual.spec.ts/--desktop.png` — PASS. Today empty (light): 六月十日 kanji display + English dateline muted, hanko seal outline top-right, ink rule, command-bar card with ink-bar prompt, crimson TODAY underline, ◯ enso empty state. Matches §2/§6/§8.
- `__screenshots__/verification/visual.spec.ts/--desktop-dark.png` — PASS. Same layout on night-ink canvas (#171613); moonlit kanji, soft-crimson seal, indigo focus ring, muted enso. Dark tokens correct.
- `__screenshots__/e2e/states-tasklist.spec.ts/tasklist-selected-desktop.png` — PASS. Flat hairline rows, 17px circle checkbox, Mincho titles, 一 crimson priority, muted "— SINCE TUE", wide-tracked caps section labels/metadata, 6px indigo tick on the selected row (§6).
- `__screenshots__/e2e/states-tasklist.spec.ts/tasklist-empty-desktop.png` — PASS. ◯ enso glyph over muted copy, no italic; masthead/chrome consistent.
- `__screenshots__/e2e/states-commandbar.spec.ts/commandbar-chips-desktop.png` — PASS. Canonical string renders exactly three indigo underlined chips (no box); ink-bar prompt (§8 command bar).
- `__screenshots__/e2e/states-commandmode.spec.ts/commandmode-open-desktop.png` — PASS. Command mode doubles the ink-bar prompt; mono command listbox on a surface card with wash shadow, active row indigo.
- `__screenshots__/e2e/states-edit.spec.ts/edit-open-desktop.png` — PASS. In-row editor keeps Mincho title typography; metadata round-trips to inline indigo underlined chips; selected tick present.
- `__screenshots__/e2e/states-focus.spec.ts/focus-selected-row-desktop.png` — PASS. Keyboard-selected row shows the thickened indigo tick + surface warm; accent focus ring visible.
- `__screenshots__/e2e/states-snooze.spec.ts/snooze-post-keyboard-desktop.png` — PASS. Post-snooze list renders flat rows + consistent chrome; no Morning Edition residue.
- `__screenshots__/e2e/states-banner.spec.ts/banner-visible-desktop.png` — PASS. Storage banner on surface + hairline + wash shadow, crimson warning copy, × close; ink toast bottom-left with UNDO keycap pill.
- `__screenshots__/e2e/states-toast.spec.ts/toast-visible-desktop.png` — PASS. Undo toast bottom-left: inverted ink bg, body-font label, mono "Undo ⌘Z" keycap pill, wash shadow (§6).
- `__screenshots__/e2e/states-cheatsheet.spec.ts/cheatsheet-open-desktop.png` — PASS. Washi sheet (radius-lg, wash shadow) over 80% scrim; ink-rule gradient header; two-column mono keycap-pill table; body-font labels.
- `__screenshots__/e2e/upcoming.spec.ts/upcoming-grouped-desktop.png` — PASS. UPCOMING active (crimson underline); day-group + week-group headers in wide-tracked caps over hairline rules (§8 upcoming).
- `__screenshots__/e2e/all-done.spec.ts/all-filtered-desktop.png` — PASS. All view while filtering: flat rows, filter hint, consistent chrome.
- `__screenshots__/e2e/all-done.spec.ts/done-desktop.png` — PASS. Done view: settled sumi brushstroke through the completed title (tapered, muted) replacing line-through; filled ink checkbox; DONE crimson underline (§8 done).

## Gate run (US-208 T-005)

Blocking gates — all green:
- typecheck (`pnpm run build`): PASS
- lint (`eslint .`): PASS
- unit + coverage: 3509 tests pass, 96.35% lines (≥80)
- e2e (`playwright e2e/`): 77 passed
- visual.regression (3 breakpoints × 2 themes): 6 passed
- visual.a11y (axe, both themes): 8 passed, 0 violations

Lighthouse (non-blocking gate, `lhci autorun || true`):
- accessibility 1.0 ✓, best-practices ≥0.95 ✓, **performance 0.69 ✗ (threshold 0.9)**.
- Root cause: FCP/LCP ≈5.0s under Lighthouse's simulated-throttled network, driven by
  the CJK **Japanese subset of Shippori Mincho** required for the kanji masthead date and
  the 今日 seal (TBT 0ms, CLS 0 — not a JS/layout problem). Morning Edition used all-Latin
  fonts, so this is a font-weight regression, anticipated by PRD non-goal #6.
- Threshold NOT lowered (per AC). The gate command is non-blocking by design.
- **Follow-up (non-goal #6):** self-host a subsetted Shippori Mincho woff2 containing only
  Latin + the date/seal glyphs (一二三四五六七八九十月日今) and preload it; this removes the
  ~260 KiB Japanese subset from the critical path and should restore performance ≥0.9.
