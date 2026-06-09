# DESIGN-SYSTEM.md

> This is the visual contract. Implementation reads it; the visual gate verifies against it;
> the visual-reviewer agent critiques against it. Chosen via `/lens-design` on 2026-06-09
> (direction "Morning Edition", picked over "Manuscript" and "Marginalia" alternatives).
> Tokens live in `src/styles/tokens.css` (imported once via `src/index.css`).

## 1. Aesthetic direction (commit to ONE)

> **Our direction:** Warm broadsheet editorial — your day typeset like a morning paper:
> ink-dark serif type on warm paper stock, hairline rules, one vermilion accent doing all
> the talking, and offset-print shadows instead of blur.

**The one unforgettable thing:** The masthead — today's date set huge in Fraunces over a
double rule, like a newspaper front page; beneath it, capture chips render as vermilion
typesetting marks (underlined, never boxed).

## 2. Type scale

| Token | Font family | Size / line-height | Use |
| --- | --- | --- | --- |
| `type-display` | "Fraunces", Georgia, serif (wght 600) | 44/48 | masthead date, h1 |
| `type-h2` | "Fraunces", serif (wght 600) | 28/34 | view headings, section heads |
| `type-body` | "Newsreader", Georgia, serif (wght 400–500) | 16/26 | task titles, paragraphs |
| `type-mono` | "JetBrains Mono", monospace (wght 400–600) | 13/20 | command bar input, chips, metadata, keycaps, datelines |

Rules: task titles are Newsreader 17/24 wght 500. ALL-CAPS mono strings (datelines, metadata)
get `letter-spacing: 0.08em–0.14em`. Italic Newsreader is reserved for rollover annotations
("— since Mon") and empty-state copy. No other font families, ever.

## 3. Color tokens (these are quantum.json contracts — names are exact)

| Token | Light | Dark | Notes |
| --- | --- | --- | --- |
| `color-bg` | `#FAF6EF` | `#1A1611` | warm paper / night ink |
| `color-surface` | `#FFFDF8` | `#242019` | command bar, task rows |
| `color-fg` | `#211D17` | `#F0E8DA` | ink |
| `color-muted` | `#6E6457` | `#A99D8C` | metadata, secondary text |
| `color-accent` | `#A63A12` | `#E8703A` | vermilion — chips, priority, masthead rule, primary buttons |
| `color-accent-fg` | `#FFF7EF` | `#2B1207` | text on accent |
| `color-border` | `#E4DACA` | `#3B342B` | hairlines, print shadows |
| `color-danger` | `#8E1B1B` | `#E58B7B` | delete only — "the only red ink" |

Contrast (WCAG AA ≥ 4.5:1), verified 2026-06-09:

| Pair | Light | Dark |
| --- | --- | --- |
| fg / bg | 15.56 | 14.79 |
| fg / surface | 16.49 | 13.32 |
| muted / bg | 5.38 | 6.76 |
| muted / surface | 5.70 | 6.09 |
| accent / bg (chips as text) | 6.03 | 5.84 |
| accent / surface | 6.38 | 5.26 |
| accent-fg / accent | 6.12 | 5.71 |
| danger / bg | 8.39 | 7.12 |
| danger / surface | 8.89 | 6.41 |

Discipline: vermilion is the *only* saturated move — it marks parse chips, priority-1, the
masthead rule, primary buttons, and selection. Danger red appears exclusively on destructive
affordances. Rollover tasks are NOT red (gentle-rollover principle): they use `color-muted`
italic annotation.

## 4. Spacing & radius scale

`space`: 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 (`--space-1..9`; no magic numbers in components)
`radius`: `radius-sm` 0 · `radius-md` 2 · `radius-lg` 4 · `radius-pill` 999

Broadsheet edges are sharp: cards and the command bar use `radius-sm`/`radius-md`. `radius-pill`
is reserved for keycap hints. Depth comes from `--shadow-print` (`3px 3px 0 var(--color-border)`,
accent or fg for emphasis) — never blurred drop shadows.

## 5. Motion

`motion-fast` 120ms · `motion-base` 240ms · `motion-slow` 480ms · easing `cubic-bezier(0.2,0.8,0.2,1)` (`--ease`)

One well-orchestrated moment: on load, the masthead settles first, then task rows reveal with a
40ms stagger (within `motion-slow` total). Elsewhere: chip parse-in at `motion-fast`, task
complete strike-through + settle at `motion-base`, toast slide at `motion-base`. Nothing else
animates. `prefers-reduced-motion` zeroes all three tokens (wired in tokens.css; the a11y gate
checks it).

## 6. Component conventions

Focus rings are mandatory: `2px solid var(--color-accent)` with `2px` offset, on every
interactive element (a11y gate fails on invisible focus).

- **Command bar** — surface bg, `1px solid var(--color-fg)`, print shadow in border color.
  Default: vermilion `▸` prompt glyph. Focus-visible: ring + shadow switches to accent.
  Chips: accent text with `2px` accent underline, mono 13 — never boxed/filled. Command mode
  (`>`): prompt glyph swaps to `❯` and input text switches to mono 500. Error (empty title on
  Enter): bar border flashes danger at `motion-fast`, inline mono message below; no shake.
  Disabled state does not exist (capture is never disabled).
- **Task row** — surface bg, border hairline, `3px` left rule: accent for priority 1, border
  color otherwise. Hover: bg shifts to bg-token (paper shows through), checkbox affordance
  appears. Selected (keyboard): left rule thickens to accent + print shadow. Active (completing):
  strike-through draws left→right at `motion-base`, row settles to muted. Rollover: muted left
  rule + italic "— since {day}" annotation. Loading: skeleton rows as hairline-outlined blocks,
  no shimmer.
- **Buttons** — primary: accent bg, accent-fg mono 600 uppercase 13px, print shadow in fg;
  hover lifts shadow to `4px 4px 0`; active presses to `1px 1px 0`. Secondary: transparent bg,
  fg border, fg text. Disabled: muted border + muted text, no shadow. Destructive: danger
  treatments, same geometry.
- **View tabs** — mono uppercase 13, muted; current view: fg + `2px` accent underline.
  Keycap hints (`g t`) in pill-radius hairline boxes.
- **Toast (undo)** — fg bg, bg-token text (inverted ink), bottom-left, print shadow; contains
  mono action label + "Undo ⌘Z" keycap. Announced via `aria-live="polite"`.
- **Cheatsheet overlay (`?`)** — surface sheet over a bg scrim at 80% opacity, double-rule
  header echoing the masthead, two-column mono key table. Focus trapped; Esc closes.
- **Empty states** — italic Newsreader, muted, one line + one keycap hint (e.g. *"Nothing on
  deck — type to capture."*). No illustrations.

## 7. Responsive intent

- **375 (mobile):** single column; masthead 32/38 (display scales down one step); task row
  metadata wraps below the title; view tabs become a horizontal scroll row; command bar sticks
  to top, full-bleed with hairline bottom rule only.
- **768 (tablet):** single column at max-width 640 centered; masthead full 44/48; metadata
  returns inline-right.
- **1280 (desktop):** content column max-width 720 centered on paper bg; keycap hints visible
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

- **Today view:** masthead shows today's date in Fraunces over double rule; rollover rows above
  dated rows, each with italic annotation, never danger-colored; command bar focused on load.
- **Upcoming view:** day-group headers in mono uppercase with hairline rule; 7 day groups then
  week groups.
- **Command bar (all views):** typing the canonical string "Send report tomorrow 3pm #work !p1"
  renders exactly three accent-underlined chips; Enter clears input and keeps focus.
- **Done view:** completed rows struck-through in muted; no accent except the view tab underline.
- **Toast:** appears bottom-left with print shadow; disappears at `motion-slow`; axe reports the
  live region.
