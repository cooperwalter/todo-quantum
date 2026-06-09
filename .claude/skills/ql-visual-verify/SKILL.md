---
name: ql-visual-verify
description: Run the quantum-lens visual verification gate for a UI route and emit fresh pass/fail evidence. Use this skill whenever a story renders UI and you are about to claim it is done, whenever quantum-loop's Iron Law asks for proof that a screen is correct, or any time someone asks to verify that the UI matches the design system, is accessible, or has no visual regressions. Always use this instead of asserting a UI "looks fine" from reading code — code review cannot see rendered pixels.
---

# ql-visual-verify

Turns "the UI looks right" (an unverifiable claim) into fresh command output (Iron-Law
evidence). Wraps three deterministic checks plus an optional advisory review.

## When to run
- A story that renders UI is about to be marked `passed`.
- The Iron Law / `/ql-verify` demands evidence for a UI acceptance criterion.
- A visual regression, accessibility, or design-conformance question is raised.

## Steps
1. Confirm you are at the project root (the dir with `lens.config.json`).
2. Identify the route(s) the story renders.
3. For each route, run the gate and capture the FULL output:
   ```bash
   bash verification/run-visual-gate.sh <route>
   ```
   This runs, per `lens.config.json`:
   - **visual.regression** — Playwright screenshot diff at every breakpoint
   - **visual.a11y** — axe (0 violations) + visible-focus check
   - **visual.lighthouse** — score thresholds
4. Read the output. Exit code 0 = gate passed. Non-zero = at least one check failed.
5. **Only if the gate passes**, optionally dispatch the `visual-reviewer` agent for an
   advisory design critique (see `.claude/agents/visual-reviewer.md`). Resolve any
   *blocking* findings; log advisory ones.
6. Assert the result using the actual output as evidence. Never paraphrase a pass you
   did not see — quote the final `VISUAL GATE: PASS/FAIL` line and the exit code.

## First-baseline handling
If there is no screenshot baseline yet, the regression check will fail by design. Generate
baselines, **open the PNGs and confirm they match `DESIGN-SYSTEM.md`**, then re-run:
```bash
npx playwright test verification/visual.spec.ts --update-snapshots
```
A baseline you never looked at is not a baseline — looking is mandatory exactly once, here.

## Anti-rationalization
- "Tests passed so the UI is fine" → tests don't render pixels; run this gate.
- "The diff is probably just noise" → if it's noise, freeze animations / fix the flake; don't lower the threshold to make it green.
- "Lighthouse is close enough" → the threshold is the threshold; fix or raise it deliberately in config, never silently.

## Output contract
Emit, for each route: the route, the final gate line, the exit code, and (if run) the
visual-reviewer verdict. Set `review.visualReview.status` in quantum.json accordingly.
