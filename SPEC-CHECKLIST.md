# SPEC-CHECKLIST.md

> Run this against the PRD produced by `/ql-spec` **before** `/ql-plan`. quantum-loop will
> faithfully certify whatever criteria you encode — and silently ignore what you omit. This
> checklist is where bug-minimization actually happens. Do not advance a story to planning
> until every box that applies is checked.

## A. Every acceptance criterion is a runnable check

- [ ] Each criterion maps to exactly one command that exits 0 (pass) / non-zero (fail).
- [ ] No criterion uses words like "should", "ideally", "user-friendly", "fast" without a number + command behind it.
- [ ] Criteria reference the gate commands in `lens.config.json`, not ad-hoc ones.

## B. Adversarial coverage (catches functional bugs)

For each story, the PRD must include criteria for:
- [ ] **Happy path** — the obvious success case.
- [ ] **Negative cases** — invalid input, wrong types, missing fields, unauthorized.
- [ ] **Boundaries** — empty, one, max, max+1, very large, zero, negative, unicode/emoji.
- [ ] **Error paths** — network failure, timeout, partial write, dependency down. What does the user see?
- [ ] **Idempotency / concurrency** — double-submit, retry, two writers (if applicable).
- [ ] **State transitions** — every edge in the story's state machine has a test.

## C. UI stories (catches visual bugs) — skip for non-UI stacks

- [ ] Story declares the screen(s) it renders and the breakpoints that matter.
- [ ] Visual criteria copied from `DESIGN-SYSTEM.md` §8 and attached to the story.
- [ ] Verification command for the story includes `bash verification/run-visual-gate.sh <route>`.
- [ ] Empty / loading / error UI states are specified (not just the populated state).
- [ ] Token usage is named (which `color-*`, `space`, `type-*`) so it can be a contract.

## D. Contracts (catches cross-story integration bugs)

- [ ] Any value shared across stories (API routes, env var names, shared types, design tokens) is listed in `quantum.json.contracts` with an exact value and pattern.
- [ ] Stories that consume another story's output declare `dependsOn` so the DAG orders them.

## E. Wiring (catches "built but not connected" bugs)

- [ ] Each component/module task has a `wiring_verification` asserting it is actually imported/rendered/registered somewhere — not just defined.

## F. Definition of done (per story)

A story is done only when ALL apply:
- [ ] All gate commands for its type pass with fresh output (Iron Law).
- [ ] Coverage ≥ `gates.coverageThreshold`.
- [ ] (UI) Visual gate passes; baseline was visually inspected at least once.
- [ ] (UI) visual-reviewer agent ran and its blocking findings, if any, are resolved.
- [ ] Cross-story integration review (quantum-loop Stage 3) is clean after dependencies land.
