---
name: lens-design
description: Build or select the design system for a quantum-lens project. Use this when starting a new quantum-lens project, when DESIGN-SYSTEM.md is empty or still has placeholder values, or whenever someone asks to choose, design, generate, or refine the visual design system, color palette, typography, or design tokens. This produces the visual contract that the rest of the framework (the visual gate, the contracts, the visual-reviewer) enforces — so run it before /ql-brainstorm. Do NOT auto-pick a direction; the human chooses.
---

# lens-design — build the design system

You are helping a human commit to a distinctive, accessible design system and write it into the
project as enforceable tokens. The output feeds the visual gate, so it must be concrete and
contrast-checked, not a mood board.

## The one rule that overrides the others

**Do not regress to generic defaults and do not pick for them.** Left unchecked, models produce
the same Inter-on-white, soft-purple-gradient look every time. Your job is to *widen* the option
space and make the human choose. Reject the safe middle. If you catch yourself reaching for
Inter/Roboto/Arial as a default, a centered hero with a purple gradient, or a timid evenly-spread
palette — stop and propose something with an actual point of view instead.

## Procedure

1. **Elicit intent** (use AskUserQuestion; one screen of questions, not an interrogation):
   - What is the product and who is it for?
   - What should it *feel* like? (offer evocative options: brutal/raw, refined/editorial,
     calm/minimal, playful, luxurious, technical/utilitarian, organic, retro-futuristic)
   - One or two reference products/sites whose look they admire.
   - Light, dark, or both.

2. **Propose 2–3 genuinely divergent directions.** Not three shades of the same idea — three
   different bets. For each: a one-line aesthetic thesis, the "one unforgettable thing", a font
   pairing (distinctive, not default), and a palette concept (a dominant + one sharp accent, not
   five equal colors).

3. **Render previews.** For each direction, render a small standalone HTML preview showing the
   palette swatches and a few real components (a heading, body text, a primary button, an input,
   a card) using the proposed tokens, so the human reacts to something visual. Show them side by
   side if you can.

4. **Let the human pick one** (or remix). Confirm the choice explicitly.

5. **Resolve concrete tokens and CONTRAST-CHECK them.** Every `fg`/`bg`, `fg`/`surface`, and
   `accent-fg`/`accent` pair must pass WCAG AA (≥ 4.5:1 for normal text). Adjust values until they
   do — do not ship a palette that will fail the a11y gate later. State the ratios.

6. **Write it into the project**, using the framework's canonical token names so the gate and
   contracts line up:
   - `src/styles/tokens.css` — CSS custom properties: `--color-{bg,surface,fg,muted,accent,accent-fg,border,danger}`
     (light in `:root`, dark in `[data-theme="dark"]` + a `prefers-color-scheme` block),
     `--type-{display,body,mono}`, `--space-1..9`, `--radius-{sm,md,lg,pill}`, `--motion-{fast,base,slow}`,
     and a `prefers-reduced-motion` reset. Include the font `@import`.
   - `DESIGN-SYSTEM.md` — fill the narrative sections (direction, the unforgettable thing, type
     scale, component states for default/hover/focus-visible/active/disabled/loading/error/empty,
     responsive intent) and the per-screen visual acceptance criteria in §8.
   - Confirm the token names match `quantum.json`'s `contracts.design_tokens` (they should already;
     if you renamed anything, update the contract).
   - Remind the human to import `tokens.css` once in the app entry.

## Shortcut

If the human wants a fast, committed starting point instead of the full dialogue, run the
deterministic stamper and then refine:
`node lens-design-preset.mjs <editorial|brutalist|calm>`

## Output contract

End with: the chosen direction in one line, the resolved token table with contrast ratios for the
key pairs, the files you wrote, and the single import line they need to add. Keep every visual rule
something the gate can check — anything that can't be checked is taste, and lives in the advisory
visual-reviewer, not the hard gate.
