# Deep Review — Command-Bar Todo App (`ql/command-bar-todo`)

**Date:** 2026-06-10 · **Scope:** `7e7acaf..3cd2525` (18 stories, 142 files, +16,922/−556)
**Risk score:** 35 → tier MEDIUM · **Reviewers:** code-reviewer, test-engineer, silent-failure-hunter, cross-story synthesizer, + live devtools interactive pass
**Fresh gate evidence at review time:** typecheck ✅ · lint ✅ · 306/306 unit ✅ · console clean in live session
**Verdict: REQUEST_CHANGES** — strong feature, rigorous cross-story consistency, but 2 critical resilience gaps and 2 confirmed interactive bugs need one focused fix pass before merge.

---

## Blockers (fix before merge)

### F-001 · CRITICAL (conf 90) — Corrupt-but-well-shaped storage bricks the app permanently
`src/lib/persistence.ts:12-16` — `isAppData` validates only `schemaVersion === 1 && Array.isArray(tasks)`. A payload like `{"schemaVersion":1,"tasks":[null]}` passes, skips the FR-42 recovery stash, and crashes the first selector (`src/lib/selectors.ts:43`) during render. No ErrorBoundary in `main.tsx` → white screen, and since the blob persists, **every reload crashes forever**. This is precisely the failure FR-42 exists to prevent.
**Fix:** per-task shape validation in `isAppData` (route failures through the existing stash branch) + an ErrorBoundary that surfaces the recovery key.

### F-002 · CRITICAL (conf 80) — Storage-disabled browsers white-screen instead of bannering
`src/state/AppContext.tsx:66`, `src/hooks/usePersistence.ts:13`, `src/lib/persistence.ts:23` — bare `window.localStorage` property access throws `SecurityError` when site data is blocked; `LoadResult` has no failure variant. FR-41 mandates "in memory + banner; never silent" — this is the unavailable case and it's maximally silent.
**Fix:** try/catch the storage acquisition; return `storageUnavailable: true`; pre-arm the banner.

### F-003 · HIGH (conf 95, runtime-reproduced) — Command-palette ↑/↓ broken whenever the list is non-empty
`src/components/CommandBar.tsx:118-120` prevents default but doesn't stop propagation; `src/hooks/useKeymap.ts:79-81` (document listener) sees the same ArrowDown and steals focus to the task list. Every test/e2e for US-008 runs with an empty list, so per-story gates were green. Breaks the US-008 AC in every real session.
**Fix:** skip the bar→list ArrowDown handoff when `bar.value.startsWith('>')` (or `stopPropagation()` in command mode). Add a seeded e2e.

### F-004 · HIGH (conf 95, live-confirmed) — Stale chip-revert state silently corrupts later captures
`src/components/CommandBar.tsx:93,110-114,166-173` — `reverted` tokens are only cleared on successful submit and match by `kind + literal text`. Repro (verified in browser): type "call mom tomorrow", Esc, clear the bar, type "dentist tomorrow" → the new "tomorrow" never chips; task saves with `dueDate: null`, no feedback.
**Fix:** clear `reverted` when the input empties; scope reverts by position, not text.

## High

- **F-005 (conf 95, live-confirmed)** — `>export` + Enter silently wipes the input: no "no matching command" state. `CommandBar.tsx:124-134`.
- **F-006 (conf 92, 2 reviewers)** — `g`-sequence isn't cancelled by other keys (spurious view switches up to 1s later) and the `g` itself is swallowed from typeahead — typing "groceries" from list context yields "roceries" in the bar. `useKeymap.ts:97-103,165-186`.
- **F-007 (conf 92, 3 reviewers + live)** — Toasts lie: ⌘Z/`>undo`/toast-button on an empty stack toast "Undone" while nothing happened; the Undo button renders on non-undoable toasts — including right after "List updated in another tab", where the stacks were just cleared by design. `AppContext.tsx:45-59`, `Toast.tsx:11`, `store.ts:186-207`.
- **F-008 (conf 85)** — Recurrence engine has unbounded loops (`interval: 0`, `byWeekday: []` freeze the tab); unreachable from the parser but reachable from disk via F-001. `recurrence.ts:27-57`.
- **F-009 (conf 100)** — The ≥80% coverage gate never ran: `@vitest/coverage-v8` isn't installed, no `coverage` config exists, and `pnpm test -- --run --coverage` exits 0 while measuring nothing. PRD G-6/SM-3 are unverified claims. `vite.config.ts`, `package.json`.
- **F-010 (conf 90)** — `save()`'s carefully-distinguished failure `reason` is discarded; quota users get the wrong "storage is unavailable" copy; legacy quota error shapes (code 22, `NS_ERROR_DOM_QUOTA_REACHED`) misclassify. `usePersistence.ts:31-33`, `persistence.ts:18-20`.

## Medium

- **F-011 (conf 90)** — FR-48's "Lighthouse perf ≥ 0.9 **with 100 seeded tasks**" was silently dropped: `lighthouserc.json` audits the empty app (no seed hook). The e2e only proves 100 rows render.
- **F-012 (conf 90)** — The DST regression tests are vacuous on non-DST machines (this one runs America/Mexico_City — no DST since 2022): suite TZ is unpinned, so `dates`/`recurrence` DST tests pass against a buggy implementation. Related: `useToday.test.tsx:2-3` mutates `process.env.TZ` at module scope and leaks to sibling files. **Fix:** pin TZ in vitest config.
- **F-013 (conf 90, live-confirmed)** — Esc in command mode executes *two* FR-17 precedence steps in one press: clears the input AND moves focus to the list. Spec says one step per press.
- **F-014 (conf 85, live-confirmed)** — Capturing "water plants every monday" yields `dueDate: null`: the recurring task sits in Anytime until its first completion (after which the spawn is dated correctly). Spec gap — recurrence capture should arguably seed the first occurrence date.
- **F-015 (conf 85)** — Inline-edit blur silently discards the draft (`TaskRow.tsx:106`); Enter saves, click-away loses.
- **F-016 (conf 85)** — `storage` events ignore key removal and `clear()` (`usePersistence.ts:53`) — a stale tab resurrects deleted data on its next save.
- **F-017 (conf 90)** — Failed save payload is nulled before the result check (`usePersistence.ts:30-33`): no retry after storage recovers; dismiss the banner and the unsaved state is silent. Plus the verify-by-re-read `getItem` sits outside the try (`persistence.ts:54`).
- **F-018 (conf 85)** — `DoneView` hand-rolls its own task-row markup instead of reusing TaskRow (`DoneView.tsx:22-49`), bypassing the roving-tabindex/selection model (FR-46) and creating a styling fork.
- **F-019 (conf 82)** — `TodayView.tsx:10` module-level `revealPlayed` flag: under React StrictMode/HMR the load reveal never replays in dev; use a ref.
- Also: external-reload discards in-flight edits with benign copy; corrupt write from another tab wipes to empty under an "updated" toast; `beforeunload` flush failure unobservable; recovery stash never mentioned to the user and unbounded; `reuseExistingServer: true` lets gates run against a stale server; Esc precedence tested level-by-level but never as a chain; toast next-date for recurring completion computed twice (toast vs store) — convergent today, divergence-prone.

## Low / advisory (selected)

- "Captured" toast doesn't say where the task went — capturing "tomorrow" from Today leaves you staring at an unchanged list (live observation).
- After snooze/complete of the selected row, focus drops to `<body>`; `j` recovers, but focus should advance to the next row (live observation).
- Mobile (375): the scrollable tabs row paints a floating scrollbar thumb over the UI (live screenshot).
- Capture input lacks `id`/`name` (Chrome devtools issue; harmless for axe).
- "jan 5" typed in June chips as "Mon Jan 5" but stores 2027-01-05 — chip omits the year.
- Dedup debt: date-format constants ×3, `View` union ×3, `daysInMonth`/`pad2` ×2; dead exports `nextSaturdayAfter`, `fuzzySubsequence`; e2e re-declares a loosened `SeedTask` instead of importing `Task`.
- Parser boundary tests are one-sided (32-char list accept and `in 365 days` accept unpinned).

## Kudos (earned, verified)

- **Date math is DST-proof by construction** (noon-anchored local components) — and the undo system's inverse operations round-trip deep-equal across every action, including the recurring-complete compound inverse with deterministic redo.
- **Cross-story contract discipline is exemplary**: storage keys, shared types, and design tokens each have exactly one definition; zero hex literals outside tokens.css; toast/empty-state copy byte-identical between producers and e2e assertions written by different agents; cheatsheet table matches the real keymap exactly.
- **The test suite is honest**: no over-mocking (component tests run the real provider/reducer/parser), real failure injection (patched `QuotaExceededError`, true two-tab e2e), the speed proxy measures actual Enter-to-paint, and every screenshot spec gates on a functional precondition first.

## Conflicts
None — no opposed findings on the same location.

## Suppressed
0 findings suppressed (every reviewer finding carried file:line evidence; one was self-downgraded by its reviewer). The 4 "live observation" advisories above are tagged as such where they lack a single file:line.

## Suggested fix order
1. F-001 + F-002 + F-008 (one resilience story: validate-at-load + ErrorBoundary + storage guard + recurrence guards)
2. F-003 + F-004 + F-005 + F-013 (one command-bar/keymap story)
3. F-006 + F-007 (keymap g-sequence + honest toasts)
4. F-009 + F-012 (test-infra: coverage provider + TZ pin)
5. F-010, F-011, F-014..F-019 and advisories as a polish wave

---

## Resolution (2026-06-10)

All blockers, all highs, and the actionable mediums/advisories were fixed in three commits
(`543125a` resilience, `6addcd6` command-bar/keyboard, `643f272` gates) with regression tests
pinning each fix (335 unit tests, up from 306; 29 new). Verified fresh after the fixes:

- typecheck ✅ · lint ✅ · unit 335/335 ✅ · coverage ENFORCED at 92/86/93/95 (≥80 gate) ✅
- e2e 72/72 ✅ · visual gate PASS (regression + axe + lighthouse) ✅
- Lighthouse under the FR-48 100-task seed: ≥0.9 ✅ (was 0.88 until the reveal stagger was
  capped at --motion-slow per DESIGN-SYSTEM §5 — the uncapped stagger was both a spec
  violation and the perf gap)
- F-003/F-004/F-005/F-007/F-013 re-verified live in the browser via devtools

Deliberately deferred (tracked, not fixed): F-018 DoneView/TaskRow consolidation and the
low-severity dedup debt (date-format helpers ×3, View union ×3, dead exports, e2e SeedTask
type) — refactors better done as their own pass. One finding became a meta-lesson: M10
(trust-the-port) bit this very session when a foreign dev server on 5173 failed all 72 e2e
against the wrong app; the gates now own their servers on a strict dedicated port.
