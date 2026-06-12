# DESIGN-SYSTEM.md

> This is the visual contract. Implementation reads it; the visual gate verifies against it;
> the visual-reviewer agent critiques against it. Chosen via `/lens-design` on 2026-06-12
> (direction "Ink Garden", picked over "Checklist Avionics", "Poster Brut", "Orbital Pop",
> "Schematic", and "Daybreak Aero"; replaces "Morning Edition" of 2026-06-09).
> Tokens live in `src/styles/tokens.css` (imported once via `src/index.css`).

## 1. Aesthetic direction (commit to ONE)

> **Our direction:** Ink Garden — the calm of a Japanese stationery desk: cool washi white,
> sumi-ink type with generous negative space (ma), aizome indigo for everything you touch,
> and hanko crimson reserved for the marks that matter.

**The one unforgettable thing:** Completing a task draws a real sumi brushstroke through it —
an organic, tapered ink stroke, not a CSS line-through — and the masthead carries a small
rotated 今日 hanko seal that fills crimson when every task due today is done.

Discipline in one line: **indigo is the hand, crimson is the seal.** Indigo marks everything
interactive (chips, links, focus, selection). Crimson stamps what matters (the seal, the
priority-1 mark, the active view underline) and what destroys (delete affordances). An element
never carries both.

## 2. Type scale

| Token | Font family | Size / line-height | Use |
| --- | --- | --- | --- |
| `type-display` | "Shippori Mincho", Hiragino Mincho ProN, serif (wght 600) | 40/52 | masthead date, h1 |
| `type-h2` | "Shippori Mincho", serif (wght 600) | 24/34 | view headings, section heads |
| `type-body` | "Zen Kaku Gothic New", sans-serif (wght 400–500) | 15/25 | UI copy, metadata labels, buttons |
| `type-mono` | "M PLUS 1 Code", monospace (wght 400–600) | 12/20 | command bar input, chips, keycaps, datelines |

Rules: task titles are Shippori Mincho 17/26 wght 600 (the one serif moment in each row).
ALL-CAPS strings (datelines, view tabs, metadata) are Zen Kaku Gothic New 12px wght 500 with
`letter-spacing: 0.18em–0.22em` — wide tracking is the system's quiet voice. The masthead may
set the date bilingually (六月十日 + English); the kanji form uses `type-display` at full size,
the English at h2 muted. No other font families, ever. No italics anywhere — Mincho has no
true italic; emphasis is done with weight, ink, or the brushstroke.

## 3. Color tokens (these are quantum.json contracts — names are exact)

| Token | Light | Dark | Notes |
| --- | --- | --- | --- |
| `color-bg` | `#F7F6F1` | `#171613` | washi / night ink |
| `color-surface` | `#FFFFFF` | `#201F1A` | command bar card, cheatsheet sheet |
| `color-fg` | `#1C1C1A` | `#ECE9DF` | sumi ink / moonlit paper |
| `color-muted` | `#6F6E66` | `#A5A296` | metadata, secondary text |
| `color-accent` | `#39517B` | `#8FA6CC` | aizome indigo — chips, focus, selection, links |
| `color-accent-fg` | `#F7F6F1` | `#14213A` | text on accent |
| `color-border` | `#DDDBD2` | `#38362E` | hairlines |
| `color-danger` | `#9A3B3B` | `#C97B72` | hanko crimson — seal, priority-1 mark, active-tab underline, destructive |

Contrast (WCAG AA ≥ 4.5:1), verified programmatically 2026-06-12:

| Pair | Light | Dark |
| --- | --- | --- |
| fg / bg | 15.77 | 14.90 |
| fg / surface | 17.07 | 13.59 |
| muted / bg | 4.74 | 7.07 |
| muted / surface | 5.12 | 6.45 |
| accent / bg | 7.36 | 7.32 |
| accent / surface | 7.96 | 6.68 |
| accent-fg / accent | 7.36 | 6.49 |
| danger / bg | 6.34 | 5.65 |
| danger / surface | 6.86 | 5.16 |

Saturation discipline: washi and ink carry the page; indigo and crimson are the only two
chromatic voices and each appears at most a few times per screen. Rollover tasks are NOT
crimson (gentle-rollover principle): they use `color-muted` with a small "— since {day}"
annotation in wide-tracked caps.

## 4. Spacing & radius scale

`space`: 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 (`--space-1..9`; no magic numbers in components)
`radius`: `radius-sm` 2 · `radius-md` 6 · `radius-lg` 10 · `radius-pill` 999

Ma is the medium: sections breathe with `--space-6`+ between them; task rows separate with
hairlines and `--space-4` padding, never boxes-in-boxes. Depth is `--shadow-wash`
(`0 2px 16px rgba(28,28,26,0.07)`) and only on floating surfaces (command bar card, toast,
cheatsheet). Task rows sit flat on the washi — separated by hairlines, not elevation.
`radius-pill` is reserved for keycap hints.

## 5. Motion

`motion-fast` 140ms · `motion-base` 280ms · `motion-slow` 560ms · easing `cubic-bezier(0.33,0,0.2,1)` (`--ease`)

One well-orchestrated moment: on load, the ink rule beneath the masthead date draws
left→right (`motion-slow`), then task rows fade up with a 40ms stagger. The signature
interaction: task completion draws the sumi brushstroke left→right at `motion-base`, then the
row settles to muted at `motion-fast`. Chips ink-in at `motion-fast` (opacity + 2px rise).
Toast slides at `motion-base`. The hanko seal fill, when the day completes, is the only
`motion-slow` interaction moment. Nothing else animates. `prefers-reduced-motion` zeroes all
three tokens (wired in tokens.css; the a11y gate checks it).

## 6. Component conventions

Focus rings are mandatory: `2px solid var(--color-accent)` with `2px` offset, on every
interactive element (a11y gate fails on invisible focus).

- **Command bar** — surface card, `1px solid var(--color-border)`, `radius-md`,
  `--shadow-wash`. Default: indigo vertical ink-bar prompt (a 3px×18px rounded bar, like a
  brush tip resting). Focus-visible: ring + border deepens to accent. Chips: indigo text with
  `2px` indigo underline, mono 12 — never boxed/filled. Command mode (`>`): prompt bar doubles
  (two strokes) and input switches mono 500. Error (empty title on Enter): border flashes
  danger at `motion-fast`, message below in wide-tracked caps; no shake. Disabled state does
  not exist (capture is never disabled).
- **Task row** — flat on bg (no card), hairline bottom border, `--space-4` vertical padding.
  Checkbox: 17px circle, 2px ink outline; fills ink when done. Title: Shippori Mincho 17/26
  wght 600. Priority: a small kanji glyph after the title — 一 in crimson for priority 1; 二 / 三 in
  muted for 2/3 (crimson stays reserved for the priority-1 mark, per §1/§3). Hover: a
  4px indigo brush-tick appears in the left margin (outside the text column). Selected
  (keyboard): left margin tick thickens + title ink deepens to pure fg + row bg warms to
  surface. Active (completing): brushstroke draws at `motion-base` (see §5). Rollover: muted
  title + "— SINCE MON" wide-tracked caps annotation. Loading: skeleton rows as hairline
  underlines only, no shimmer.
- **Buttons** — primary: ink bg (`--color-fg`), bg-token text, wide-tracked caps 12px wght
  500, `radius-md`; hover deepens via opacity 0.88; active presses scale 0.98. Secondary:
  transparent bg, 1px fg border, fg text. Disabled: muted border + muted text. Destructive:
  danger border + danger text; fills danger with accent-fg text on hover.
- **View tabs** — wide-tracked caps 12 wght 500, muted; current view: fg + `2px` crimson
  underline with `4px` gap. Keycap hints (`g t`) in pill-radius hairline boxes, mono 12.
- **Toast (undo)** — ink bg (`--color-fg`), bg-token text (inverted), bottom-left,
  `--shadow-wash`, `radius-md`; contains action label + "Undo ⌘Z" keycap. Announced via
  `aria-live="polite"`.
- **Cheatsheet overlay (`?`)** — surface sheet over a bg scrim at 80% opacity, `radius-lg`,
  header carries a small ink rule echoing the masthead, two-column key table (mono keys,
  body-font labels). Focus trapped; Esc closes.
- **Hanko seal (masthead)** — 40px square, `2.5px solid var(--color-danger)`, `radius-md`,
  rotated 4°, 今日 in display font wght 700 danger color. Filled state (all of today done):
  danger bg, 今日 in surface-white in light theme (contrast 6.86) and in `--color-bg` night
  ink in dark theme (5.65) — both verified. Has `aria-label` describing day progress; the fill
  transition runs at `motion-slow` and is suppressed by `prefers-reduced-motion`.
- **Empty states** — muted body font, one line + one keycap hint (e.g. "Nothing on the desk —
  type to capture."), preceded by a single muted enso glyph (◯) at 24px. No illustrations.

## 7. Responsive intent

- **375 (mobile):** single column; masthead 30/40 (display scales down one step) and drops the
  English subtitle to its own line; hanko seal 32px; task row metadata wraps below the title;
  view tabs become a horizontal scroll row; command bar sticks to top, full-bleed with hairline
  bottom rule only (sheds card chrome).
- **768 (tablet):** single column at max-width 640 centered; masthead full 40/52; metadata
  returns inline-right.
- **1280 (desktop):** content column max-width 720 centered on washi bg; keycap hints visible
  throughout (hidden below 768); cheatsheet renders two-column.

Layout never reflows between breakpoints beyond these stated changes — diffs outside them are
regressions.

## 8. Per-screen visual acceptance criteria (the gateable part)

Every UI story must satisfy, per screen:

- [ ] Matches baseline screenshot at 375 / 768 / 1280 within `screenshotDiffMaxPixelRatio` 0.01
- [ ] 0 axe violations at all three breakpoints
- [ ] All text/bg pairs pass WCAG AA (tokens above are pre-verified; new pairings must be checked)
- [ ] Lighthouse a11y = 1.0, performance ≥ 0.9, best-practices ≥ 0.95
- [ ] Keyboard-only: every interactive element reachable, focus visible (accent ring spec §6)
- [ ] Only fonts from §2 render (no system-font fallback flashes in final screenshot)
- [ ] Only `--color-*` tokens used (no literal hex in component styles)
- [ ] `prefers-reduced-motion`: no animation runs (motion tokens = 0ms)

Per-screen additions:

- **Today view:** masthead shows today's date in Shippori Mincho with the ink rule beneath and
  the 今日 seal top-right; rollover rows above dated rows, each with the muted SINCE annotation,
  never crimson; command bar focused on load.
- **Upcoming view:** day-group headers in wide-tracked caps with hairline rule; 7 day groups
  then week groups.
- **Command bar (all views):** typing the canonical string "Send report tomorrow 3pm #work !p1"
  renders exactly three indigo-underlined chips; Enter clears input and keeps focus.
- **Done view:** completed rows carry the settled brushstroke in muted ink; no indigo except
  focus; the view tab underline is the only crimson.
- **Toast:** appears bottom-left with ink-wash shadow; disappears at `motion-slow`; axe reports
  the live region.
