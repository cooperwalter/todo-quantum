# PRD: Ink Garden Re-skin

> Rev 2 — incorporates all 15 findings of the 2026-06-12 advisory prd-review
> (1 blocker: no dark-theme gate axis; 7 major: ownership/coverage gaps, story sizing;
> 7 minor: ambiguities). Review summary in `.handoffs/prd-review-findings.json`.

## 1. Introduction / Overview

The design system was replaced on 2026-06-12 (`DESIGN-SYSTEM.md`, direction "Ink Garden" —
washi paper, sumi ink, aizome indigo, hanko crimson), and `src/styles/tokens.css` already
carries the new tokens. The components, however, still embody Morning Edition decisions
(print-shadow offsets, boxed task-row cards, `▸` prompt glyph, italic annotations). This
feature brings every rendered surface up to the new §6 component contract, adds the two
signature elements (sumi brushstroke completion, 今日 hanko seal), extends the visual gate
with the dark-theme axis it currently lacks, and re-blesses every baseline. It is a **pure
visual re-skin**: zero behavior changes.

## 2. Goals

- Every component matches DESIGN-SYSTEM.md §6 exactly (machine-checked via the visual gate).
- The visual + a11y gates gain a dark-theme axis (3 breakpoints × 2 themes) — today they only check light.
- The two signature moments exist: brushstroke task completion and the masthead hanko seal.
- Bilingual masthead (kanji display date + English subtitle) renders per §2.
- Grep audits return zero: `shadow-print` in src, `Fraunces|Newsreader|JetBrains` anywhere in src/index.html, literal hex in `src/components` + `src/App.css`.
- All gates pass fresh: typecheck, lint, unit (≥80%), e2e, screenshot diff ≤ 0.01, axe = 0, Lighthouse a11y 1.0 / perf ≥ 0.9 / best-practices ≥ 0.95.

## 3. User Stories

> Sizing note: stories sharing files are sequenced via `dependsOn` in quantum.json (noted
> inline); only file-disjoint stories may share a wave (§7 has the ownership map).

### US-200: Visual gate prep — dark-theme axis + font readiness
**Description:** As the maintainer, I want the visual and a11y gates to verify both themes and
wait for web fonts, so the re-skin's "both themes" criteria are machine-checkable and
screenshots don't flake on font swap.

**Acceptance Criteria:**
- [ ] `verification/visual.spec.ts` captures each configured breakpoint in BOTH color schemes (light + dark via `page.emulateMedia({ colorScheme })`); baseline filenames gain a `-dark` suffix for the dark axis
- [ ] `verification/a11y.spec.ts` runs axe at every breakpoint in both color schemes; violation budget stays 0
- [ ] Every screenshot in `verification/visual.spec.ts` and the e2e state specs is preceded by an `await page.evaluate(() => document.fonts.ready)` wait (added to the shared helper in `e2e/fixtures.ts`, not copy-pasted)
- [ ] `lens.config.json` gains `visual.themes: ["light", "dark"]` consumed by the specs (no hardcoded theme list in spec files)
- [ ] `pnpm exec playwright test verification/visual.spec.ts --update-snapshots` exits 0 and produces exactly breakpoints × themes baseline PNGs (these interim baselines are throwaway; US-208 blesses the finals)
- [ ] Typecheck/lint passes

### US-209: Kanji date formatter
**Description:** As a developer, I want a pure kanji date formatter so the masthead can render
六月十二日 from the same Date the English masthead uses.

**Acceptance Criteria:**
- [ ] `src/lib/kanji-date.ts` [NEW] exports `formatKanjiDate(d: Date): string` using kanji numerals, no external dependency
- [ ] `src/lib/kanji-date.test.ts` [NEW] covers at minimum: 六月十日 (June 10), 六月十二日 (June 12), 十二月三十一日 (Dec 31), 一月一日 (Jan 1), 十月二十日 (Oct 20)
- [ ] Function is timezone-naive (formats the local calendar date of the Date passed in — same convention as `src/lib/dates.ts`)
- [ ] Typecheck/lint passes

### US-201: Canvas, masthead, view tabs & empty states
**Description:** As a user, I want the page chrome — background, bilingual masthead with ink
rule, view tabs, and empty states — set in the Ink Garden language so the app's frame reads as
washi and ink. *(dependsOn: US-209)*

**Acceptance Criteria:**
- [ ] `body`/app background is `var(--color-bg)`; content column max-width 720 centered at 1280, 640 at 768, full-width single column at 375 (§7)
- [ ] Masthead renders the date bilingually: kanji date from `formatKanjiDate` (US-209) in `--type-display` 40/52 wght 600, English (e.g. "Wednesday, June 10" under the frozen test clock) beside/below it in `--type-h2` size `--color-muted` (§2); at 375 the display drops to 30/40 and the English moves to its own line; both derive from one `new Date()`
- [ ] The ink rule beneath the masthead is a 3px fg→transparent gradient bar that draws left→right at `--motion-slow` on load; with `prefers-reduced-motion` it renders fully drawn, no animation
- [ ] View tabs are wide-tracked caps (`letter-spacing: 0.18em–0.22em`, 12px, wght 500, `--type-body` family — NOT mono), muted; current view: `--color-fg` text + 2px `--color-danger` underline with 4px gap (§6)
- [ ] Keycap hints keep `radius-pill` hairline boxes in `--type-mono` 12; hidden below 768
- [ ] Empty states across all views (`.empty-state` style in `src/App.css`; markup in `src/components/TaskList.tsx` fallback and `src/views/AllView.tsx`, `src/views/UpcomingView.tsx`, `src/views/DoneView.tsx`): single muted ◯ enso glyph at 24px above one line of muted `--type-body` copy + keycap hint; copy text verbatim-unchanged
- [ ] All Morning Edition styles in `src/App.css` (double rule, print shadows, italic empty-state, serif font references) are removed
- [ ] Typecheck/lint passes
- [ ] Verify in browser (visual gate at 3 breakpoints × 2 themes)

### US-202: Hanko seal (今日) in the masthead
**Description:** As a user, I want a small rotated 今日 seal in the masthead that fills crimson
when everything due today is done, so finishing the day has a quiet ceremonial mark.
*(dependsOn: US-201 — shares `src/App.tsx`)*

**Acceptance Criteria:**
- [ ] New component `src/components/HankoSeal.tsx` [NEW] + `src/components/HankoSeal.css` [NEW] + `src/components/HankoSeal.test.tsx` [NEW]; mounted in the masthead (top-right) in `src/App.tsx`
- [ ] Day-task derivation composes EXISTING exports from `src/lib/selectors.ts` / `src/hooks/useToday.ts` only; if a new selector export proves necessary, `src/lib/selectors.ts` + `src/lib/selectors.test.ts` join this story's filePaths and the export is named `selectTodayProgress`
- [ ] Outline state: 40px square (32px at 375), `2.5px solid var(--color-danger)`, `radius-md`, rotated 4°, 今日 in `--type-display` wght 700 `--color-danger`
- [ ] Filled state: when every task due today (including rollovers) has `status === 'done'` AND at least one such task exists — danger bg; 今日 in `--color-surface` (light) / `--color-bg` (dark) per §6 (contrast 6.86 / 5.65, pre-verified)
- [ ] State is derived on every render — unit tests: fills when last today-task completes; un-fills when a today-task is added after fill; un-fills when a done task reopens; stays outline when today has zero tasks
- [ ] Fill/unfill transitions at `--motion-slow`; none under `prefers-reduced-motion`
- [ ] Not focusable, no click handler; `role="status"` with `aria-label` exactly `"{done} of {total} tasks done today"`; axe 0 violations
- [ ] Typecheck/lint passes
- [ ] Verify in browser (visual gate at 3 breakpoints × 2 themes)

### US-203: Command bar & chips re-skin
**Description:** As a user, I want the capture bar to read as a brush resting on paper — white
card, ink-bar prompt, indigo underlined chips — so capture feels like the calmest part of the page.

**Acceptance Criteria:**
- [ ] Bar is `--color-surface`, `1px solid var(--color-border)`, `radius-md`, `--shadow-wash`; at 375 it goes full-bleed with hairline bottom rule only (no card chrome) (§7)
- [ ] Prompt glyph: a 3×18px `radius-pill` bar in `--color-accent` (replaces `▸`); command mode (`>`) renders two such bars side by side and switches input to `--type-mono` wght 500 (§6)
- [ ] Chips render as `--color-accent` text with 2px accent underline, `--type-mono` 12px — no box, no fill; chip parse-in animates opacity + 2px rise at `--motion-fast`
- [ ] Error state (empty title on Enter): border flashes `--color-danger` at `--motion-fast`; message below in wide-tracked caps `--type-body` (not mono, not italic); no shake animation
- [ ] Focus-visible: 2px accent ring at 2px offset; border color deepens to accent
- [ ] All print-shadow and Morning Edition references removed from `src/components/CommandBar.css` and `src/components/ParsedInput.css`
- [ ] Existing CommandBar/ParsedInput unit tests pass with behavior assertions unmodified (selector-only edits permitted per FR-8)
- [ ] Typecheck/lint passes
- [ ] Verify in browser (visual gate; canonical chip string renders exactly three indigo-underlined chips)

### US-204: Task rows — static re-skin & section labels
**Description:** As a user, I want tasks to sit flat on the washi as inked lines — hairline
separators, circular checkboxes, Mincho titles, kanji priority marks — so the list reads as a
page, not a stack of cards.

**Acceptance Criteria:**
- [ ] Rows have no background card and no border box: flat on `--color-bg`, separated by 1px `--color-border` bottom hairlines, `--space-4` vertical padding (§4/§6); the 3px left-rule treatment is removed
- [ ] Checkbox is a 17px circle with 2px `--color-fg` outline; fills `--color-fg` when done
- [ ] Task titles render `--type-display` family 17/26 wght 600; metadata is wide-tracked caps 12px `--color-muted`; no italics anywhere
- [ ] Priority renders as a kanji glyph after the title: 一 in `--color-danger` for p1; 二 and 三 in `--color-muted` for p2/p3 (crimson is reserved for the priority-1 mark — §1/§3 discipline; unit test covers all three + none)
- [ ] Rollover rows: muted title + "— SINCE {DAY}" in wide-tracked caps muted (replaces italic annotation); never crimson
- [ ] Section/day-group headers (`.task-section-label`, used by Today groups and Upcoming day groups): wide-tracked caps 12px `--color-muted` over a hairline rule (§8 Upcoming)
- [ ] Existing TaskRow/TaskList unit tests pass with behavior assertions unmodified (selector-only edits permitted per FR-8)
- [ ] Typecheck/lint passes
- [ ] Verify in browser (visual gate at 3 breakpoints × 2 themes)

### US-210: Task rows — interaction states & motion
**Description:** As a user, I want row hover/selection rendered as ink ticks and the list to
settle in with a quiet stagger, so interaction feels like the same hand that set the page.
*(dependsOn: US-204 — shares TaskList/TaskRow files)*

**Acceptance Criteria:**
- [ ] Hover: 4px `--color-accent` tick appears in the left margin outside the text column; selected (keyboard): tick thickens to 6px + row bg becomes `--color-surface` (§6)
- [ ] On view load, rows fade up with 40ms stagger, delayed by `var(--motion-slow)` so the masthead rule (US-201) finishes first — the delay references the token, never a hardcoded ms value (no cross-story timing code dependency)
- [ ] No stagger/fade under `prefers-reduced-motion`
- [ ] Skeleton/loading rows are hairline underlines only — no shimmer, no boxes
- [ ] Typecheck/lint passes
- [ ] Verify in browser (visual gate at 3 breakpoints × 2 themes; keyboard-selected state screenshot in e2e states-tasklist spec)

### US-205: Sumi brushstroke completion
**Description:** As a user, I want completing a task to draw a real tapered ink stroke through
it — the signature interaction — so finishing something feels physically inked.
*(dependsOn: US-210 — shares TaskList.css/TaskRow.tsx; touches DoneView after US-201's empty-state edit)*

**Acceptance Criteria:**
- [ ] New component `src/components/BrushStroke.tsx` [NEW] + `src/components/BrushStroke.css` [NEW] + `src/components/BrushStroke.test.tsx` [NEW]: an inline SVG tapered stroke (organic path, varying thickness 4–8px, NOT a straight rect) spanning the title width
- [ ] On completion, the stroke draws left→right at `--motion-base` via stroke-dashoffset (or clip-path) using `--ease`; the row then settles to muted at `--motion-fast` (§5)
- [ ] Stroke color is `--color-fg` at 0.85 opacity during the open→done transition; settled rows show the static stroke in `--color-muted`
- [ ] `text-decoration: line-through` is removed from its single declaration at `src/components/TaskList.css:101` (DoneView's inline rows inherit that shared `.task-row--done` rule — DoneView.tsx itself contains no line-through); BOTH render paths (TaskRow component AND DoneView's inline rows) must mount BrushStroke
- [ ] Under `prefers-reduced-motion`, the stroke renders instantly with no draw animation
- [ ] Stroke SVG is `aria-hidden="true"`; completed state remains announced exactly as today (existing a11y assertions pass unmodified)
- [ ] Undo (toast / ⌘Z) restores the row with the stroke removed; e2e completion journey passes with behavior assertions unmodified
- [ ] Typecheck/lint passes
- [ ] Verify in browser (visual gate at 3 breakpoints × 2 themes)

### US-206: Toast, storage banner & error boundary
**Description:** As a user, I want the transient chrome — undo toast, storage banner, error
screen — re-inked so no surface still speaks Morning Edition.

**Acceptance Criteria:**
- [ ] Toast: `--color-fg` bg, `--color-bg` text, bottom-left, `--shadow-wash`, `radius-md`; action label in `--type-body`, "Undo ⌘Z" keycap in mono pill; slides at `--motion-base`; `aria-live="polite"` preserved (§6)
- [ ] Buttons in these components follow §6: primary = ink bg + bg-token text + wide-tracked caps 12 wght 500 + `radius-md`, hover opacity 0.88, active scale 0.98; secondary = transparent + 1px fg border; destructive = danger border/text, fills danger with bg-token text on hover
- [ ] StorageBanner and ErrorBoundary surfaces use `--color-surface` + hairline border + `--shadow-wash`; all print shadows removed from `src/components/Toast.css`, `src/components/StorageBanner.css`, `src/components/ErrorBoundary.css`
- [ ] No literal hex values remain in the three CSS files (grep check)
- [ ] Typecheck/lint passes
- [ ] Verify in browser (visual gate; toast state baseline re-blessed in US-208)

### US-207: Cheatsheet overlay re-skin
**Description:** As a user, I want the `?` cheatsheet to read as a washi sheet — soft corners,
ink rule header, two quiet columns — consistent with the new system.

**Acceptance Criteria:**
- [ ] Sheet: `--color-surface`, `radius-lg`, `--shadow-wash`, over `--color-bg` scrim at 80% opacity; header carries the masthead's ink-rule motif (3px fg→transparent gradient bar), replacing the double rule (§6)
- [ ] Key table: keys in `--type-mono` keycap pills, labels in `--type-body`; two columns at 1280, one below 768
- [ ] Focus trap and Esc-to-close behavior unchanged (existing tests pass unmodified)
- [ ] All Morning Edition references (double rule, print shadow, serif italics) removed from `src/components/Cheatsheet.css`
- [ ] Typecheck/lint passes
- [ ] Verify in browser (visual gate at 3 breakpoints × 2 themes)

### US-208: Deprecation cleanup & full baseline re-bless
**Description:** As the maintainer, I want the deprecated token removed and every visual
baseline — now breakpoints × themes — regenerated and human-verified, so the gate enforces Ink
Garden from now on. *(dependsOn: all other stories)*

**Acceptance Criteria:**
- [ ] `grep -rn "shadow-print" src/` returns 0 matches; the `--shadow-print` definition and its deprecation comment are deleted from `src/styles/tokens.css`
- [ ] `grep -rn "Fraunces\|Newsreader\|JetBrains" src/ index.html` returns 0 matches (stale font preloads/links in `index.html` removed too)
- [ ] `grep -rnE "#[0-9A-Fa-f]{3,8}" src/components src/App.css` returns 0 matches
- [ ] All baselines under `__screenshots__/` (verification + e2e state specs) regenerated via `--update-snapshots` with the frozen clock, including the new dark-axis files from US-200
- [ ] Per the Pixel Law, every regenerated desktop PNG (both themes) is rendered, looked at, and checked against DESIGN-SYSTEM.md §6/§8 before blessing; one line of inspection notes per PNG written to `verification/baseline-inspection-2026-06.md` [NEW] (grep-checkable: line count ≥ PNG count)
- [ ] Full gate run passes fresh: typecheck, lint, unit (coverage ≥ 80), e2e, visual.regression, visual.a11y, visual.lighthouse (thresholds §8)
- [ ] Verify in browser

## 4. Functional Requirements

FR-1: All component styles shall reference only `--color-*`, `--type-*`, `--space-*`, `--radius-*`, `--motion-*`, `--ease`, and `--shadow-wash` custom properties; literal hex/font/px-spacing values are forbidden in component CSS (spacing px values must come from the space scale).
FR-2: The masthead shall render the current date bilingually — kanji (display type, via US-209's formatter) + English (muted h2) — from a single Date source, correct at 375/768/1280 per §7.
FR-3: The hanko seal shall derive its filled state as: `todayTasks.length > 0 && todayTasks.every(t => t.status === 'done')`, where todayTasks = tasks due today plus rollovers, recomputed on every store change.
FR-4: Task completion shall render a tapered SVG brushstroke drawn at `--motion-base`, replacing CSS line-through in BOTH render paths (TaskRow component AND DoneView's inline rows).
FR-5: Priority shall display as kanji numerals: 一 in `--color-danger` (p1 only); 二/三 in `--color-muted`. Rollover annotations shall use wide-tracked caps `--color-muted`, never danger.
FR-6: Crimson (`--color-danger`) shall appear only on: the seal, the priority-1 glyph, the active view-tab underline, destructive affordances, and error flashes. Indigo (`--color-accent`) shall appear only on interactive affordances (chips, focus rings, hover/selection ticks, links).
FR-7: Every animation shall be driven by the three motion tokens and `--ease`; `prefers-reduced-motion: reduce` shall result in zero running animations (gate-checked).
FR-8: No behavior, keybinding, parsing rule, storage key, or DOM accessibility semantic shall change. Behavioral assertions in existing tests are frozen; selector/class-name updates are permitted and are made by the story that owns the component (each story owns its components' `.test.tsx` files and may make selector-only edits to e2e specs touching its surfaces).
FR-9: The visual and a11y gates shall evaluate every configured breakpoint in both color schemes, theme list driven by `lens.config.json` `visual.themes`.

## 5. Non-Goals (Out of Scope)

1. **No behavior changes** — keyboard flows, token parsing, snooze/undo logic, storage schema, and view routing are untouched.
2. **No manual theme toggle** — dark mode continues to follow `prefers-color-scheme` / `data-theme` exactly as wired today (the gate emulates, not toggles).
3. **No copy rewrite** — empty-state and UI copy stay verbatim (only typography/layout around them changes).
4. **No new views or layout restructuring** beyond DESIGN-SYSTEM.md §7's stated responsive behavior.
5. **No icon set, illustrations, or imagery** — glyphs are typographic (◯, 一, 今日); the brushstroke SVG is a decoration of text, not an illustration.
6. **No font self-hosting/subsetting work** — Google Fonts import as wired in tokens.css (revisit only if the Lighthouse perf gate fails in US-208).
7. **No DoneView-to-TaskRow refactor** — US-205 mounts BrushStroke in both render paths as-is; unifying them is future work.

## 6. Design Considerations

- DESIGN-SYSTEM.md (2026-06-12) is the sole visual authority; §6 component conventions and §8
  acceptance criteria are normative. The seal and brushstroke specs live there.
- Approved at direction level via `/lens-design` against five rejected alternatives; the chosen
  mockup is archived at `.superpowers/brainstorm/94232-1781290731/content/directions-round2.html`
  (card F) for implementation reference.
- Discipline rule for reviewers: "indigo is the hand, crimson is the seal" (§1). Priority
  glyph colors resolved 2026-06-12: 一 crimson, 二/三 muted (DESIGN-SYSTEM §6 updated to match).

## 7. Technical Considerations

- **Stack:** React + Vite, CSS files per component; gates in `lens.config.json` (dev server
  `pnpm run dev` on :5273; visual specs in `verification/`, state baselines in `__screenshots__/`).
- **Parallel-execution file ownership (quantum-loop).** Stories listed together are file-disjoint;
  `dependsOn` covers every shared file:
  - US-200 owns `verification/visual.spec.ts`, `verification/a11y.spec.ts`, `e2e/fixtures.ts`, `lens.config.json`, `playwright.config.ts`
  - US-209 owns `src/lib/kanji-date.ts` [NEW], `src/lib/kanji-date.test.ts` [NEW]
  - US-201 owns `src/App.tsx`, `src/App.css`, `src/index.css`, `src/views/AllView.tsx`, `src/views/UpcomingView.tsx`, `src/views/DoneView.tsx` (empty-state markup) — dependsOn US-209
  - US-202 owns `src/components/HankoSeal.{tsx,css,test.tsx}` [NEW] + `src/App.tsx` mount — dependsOn US-201; may add `src/lib/selectors.ts` + test per its AC
  - US-203 owns `src/components/CommandBar.{tsx,css,test.tsx}`, `src/components/ParsedInput.{tsx,css,test.tsx}`
  - US-204 owns `src/components/TaskList.{tsx,css,test.tsx}`, `src/components/TaskRow.{tsx,test.tsx}`
  - US-210 owns the same TaskList/TaskRow files — dependsOn US-204
  - US-205 owns `src/components/BrushStroke.{tsx,css,test.tsx}` [NEW] + TaskRow/TaskList files + `src/views/DoneView.tsx` — dependsOn US-210 (and serialized after US-201 via the DoneView overlap)
  - US-206 owns `src/components/Toast.{tsx,css,test.tsx}`, `src/components/StorageBanner.{tsx,css}`, `src/components/ErrorBoundary.{tsx,css,test.tsx}`
  - US-207 owns `src/components/Cheatsheet.{tsx,css,test.tsx}`
  - US-208 owns `src/styles/tokens.css`, `index.html`, `__screenshots__/**`, `verification/baseline-inspection-2026-06.md` [NEW] — dependsOn all
  - Test ownership: per FR-8, each story owns its components' unit-test files and may make
    selector-only edits to e2e specs asserting on its surfaces (e.g. `e2e/all-done.spec.ts`
    locators for US-205); behavioral assertions are frozen.
- **Fonts:** loaded via `@import` in tokens.css. There is NO existing fonts-ready wait in the
  specs (confirmed by review — `verification/visual.spec.ts` waits only on `networkidle`);
  US-200 adds the `document.fonts.ready` wait before any baseline work begins.
- **Frozen clock:** e2e/visual specs pin the browser clock (commit b6d066b); `formatKanjiDate`
  receives the same pinned date. Baselines show the pinned date's kanji. (Pinned fixture date is
  `FIXED_NOW = new Date(2026, 5, 10, 12, 0, 0)` — **Wednesday, June 10, 2026** — `e2e/fixtures.ts:12`.
  Baselines will read 六月十日 / "Wednesday, June 10".)
- **Stagger handshake:** US-210's row stagger delays by `var(--motion-slow)` — a token contract,
  not a code dependency on US-201's animation.

### Lifecycle checklist resolutions
- **First-run:** unchanged logic; empty states restyled with enso glyph (US-201). Resolved.
- **Returning user:** no persisted-state changes; theme detection unchanged. Resolved (N/A beyond styling).
- **Update behavior:** pure presentational change; no migrations; baselines re-blessed in US-208. Resolved.
- **Error recovery:** font-load failure falls back to stacks declared in tokens.css (Hiragino/Georgia/system); command-bar error state restyled per US-203; ErrorBoundary restyled per US-206. Resolved.
- **No-data/empty state:** US-201 AC. Resolved.
- **Uninstall/disable:** N/A — visual layer cannot be disabled; reverting = git revert of this feature.

## 8. Success Metrics

- Visual gate green at 3 breakpoints × 2 themes: diff ratio ≤ 0.01 vs the new blessed baselines, axe = 0, Lighthouse a11y = 1.0 / perf ≥ 0.9 / best-practices ≥ 0.95.
- Grep audits return zero: `shadow-print` in src, Morning Edition font names anywhere, literal hex in component styles.
- Full suite (typecheck, lint, unit ≥ 80% coverage, e2e) passes with zero behavioral-assertion modifications.
- The advisory visual-reviewer pass reports no blocking findings against §6.

## 9. Open Questions

None at this time.
