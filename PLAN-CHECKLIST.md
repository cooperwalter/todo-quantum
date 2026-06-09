# PLAN-CHECKLIST.md

> Run after `/ql-plan` produces `quantum.json`, before executing. This is enforced
> mechanically by `npm run plan:lint` (which `./lens-run.sh` runs for you) — this doc is
> the human-readable version of the same rules. SPEC-CHECKLIST hardens *what* gets built;
> this hardens *how the plan executes*.

## A. Parallelism is engineered, not free  ← the one people get wrong

quantum-loop runs stories in **waves**: every story whose dependencies are all satisfied
runs together. But its file-conflict filter (which derives each story's footprint by
aggregating its `tasks[].filePaths`) removes any story that shares a file path with a
higher-priority story in the same wave — so two "parallel" stories that both edit
`NotesPage.tsx` don't run in parallel, they **serialize**, and you lose the speedup silently.

- [ ] Every task declares a `filePaths` array listing exactly what it creates/edits (the
      story's footprint is their union — there is no story-level `files` field).
- [ ] For any two stories you want to run concurrently (same satisfied dependencies), the
      union of their task `filePaths` is **disjoint**. Put shared surfaces in a dedicated
      integration story that depends on both.
- [ ] `npm run plan:lint` prints the wave plan and reports **no** same-wave file conflicts.

> Pattern: build self-contained pieces in parallel (e.g. `PinButton.tsx`, `FilterBar.tsx`),
> then wire them into the shared page (`NotesPage.tsx`) in a later integration story that
> depends on both. The shared file is touched once, by one story, in its own wave.

## B. The DAG is correct

- [ ] Every `dependsOn` references a real story id (lint errors on dangling refs).
- [ ] No cycles (lint errors on cycles).
- [ ] Dependencies reflect real data/contract flow: schema → API → UI → integration.
- [ ] A failure in one story doesn't block unrelated stories (they don't falsely depend on it).

## C. Every task carries its own evidence (Iron Law)

- [ ] Each task has a `commands` array (verification commands), or `testFirst: true`, or a `wiring_verification`.
- [ ] UI stories include a task that runs `bash verification/run-visual-gate.sh <route>`.
- [ ] `wiring_verification` is set wherever a component/module must be mounted/registered,
      not just defined (catches "built but never rendered").

## D. Tasks are small

- [ ] Tasks are ~2–5 minutes of work each. Oversized tasks blow the per-iteration context
      and make failures hard to localize.
- [ ] One story owns one coherent slice; no story quietly does two features.

## E. Contracts cover every shared value

- [ ] Shared routes, env var names, shared types, and design tokens are in `contracts` with
      exact values + patterns, so parallel agents can't drift (they halt-and-propose instead).

## F. Run order

- [ ] `npm run plan:lint` is clean (or warnings are deliberate and understood).
- [ ] First execution is interactive (`/ql-execute`) to validate the spec/plan on wave 1.
- [ ] Autonomous runs go through `./lens-run.sh` (lints, then loops) with sane
      `--max-iterations` / `--max-parallel`.
