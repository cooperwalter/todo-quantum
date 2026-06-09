# Design: Command-Bar Todo App

**Date:** 2026-06-09
**Status:** Approved
**Approach:** Command Bar Is the App (Approach A)

**User intent (verbatim):** "todo app that implements the best features from existing todo apps and fixes common pain points"

**Ambiguity gate:** final score 13 (<20) after 6 rounds, mode: normal — goal 9 / constraints 9 / criteria 8.

## Overview

We're building **a local-first, keyboard-first todo web app for busy professionals where a single omnipresent command bar is the entire interaction model**. The app's reason to exist: capturing a task in existing apps is too slow — too many clicks, modals, and fields between "I just remembered something" and "it's safely captured."

The command bar sits permanently at the top of the screen and serves two roles:

1. **Natural-language quick-add** — typing "Send report tomorrow 3pm #work !p1" parses due date, time, list, and priority inline as you type, with live visual feedback showing what was understood. Enter captures; the bar clears; focus stays for the next task.
2. **Command palette** — prefixing with `>` switches to command mode: navigate views, snooze, complete, undo, search.

Beneath the bar, four flat views render as filters: **Today** (the default), **Upcoming**, **All**, and **Done**. Undone tasks gently roll over into Today — subtly marked, never a red guilt wall — with one-key snooze (tomorrow / next week / weekend) to push them out. Recurring tasks regenerate on completion. Every action is undoable via a single universal undo stack.

Success is measured in speed: **capture a task in under 2 seconds, triage the day in under a minute, today's plan visible at load with zero clicks.** All data lives in the browser (no backend, no accounts). Explicitly out of scope for v1: collaboration, integrations, subtasks/projects, and notifications.

The synthesis: Todoist's NL quick-add + Things' calm Today/Upcoming structure + Linear/Raycast's command-bar idiom — minus the bloat that makes each of those slow.

## User Experience

**Load → Today.** The app opens directly to the Today view: rolled-over tasks (subtly tinted, labeled "since Mon", no red) sit above today's dated tasks, then anytime-tasks. The command bar is focused and ready — today's plan is visible with zero clicks.

**Capture.** Type into the bar. Tokens highlight live as they parse: `tomorrow 3pm` becomes a date chip, `#work` a list chip, `!p1` a priority chip — each chip rendered inline so you trust what was understood *before* committing. Enter captures, the bar clears, focus remains. Mis-parsed token? `Esc` reverts the last chip to plain text. Three rapid captures should feel like typing three chat messages.

**Command mode.** Typing `>` flips the bar to commands with fuzzy matching: `>today`, `>upcoming`, `>done`, `>undo`, plus task actions when a task is selected. Plain text without `>` always means "new task" — capture is never hijacked.

**List navigation.** `↑`/`↓` (or `j`/`k`) move task selection; `Enter` opens inline edit; `Space` or `x` completes; `1`/`2`/`3` snooze to tomorrow / next week / weekend; `Del` deletes. A press of `?` overlays the cheatsheet. Everything also works by mouse — hover reveals a complete-checkbox and a snooze/overflow menu — keyboard is the fast path, not the only path.

**Feedback & undo.** Every mutation (complete, delete, snooze, edit, capture) shows a quiet toast with "Undo (⌘Z)". Completing a recurring task immediately shows its next occurrence's date in the toast.

**Views.** Today / Upcoming / All / Done render as compact tabs under the bar (`g` then `t`/`u`/`a`/`d` to jump). Upcoming groups by day for the next 7 days, then by week.

## Data Model

All types are TypeScript, persisted as a single versioned JSON document in `localStorage` (todo-scale data fits comfortably; a `schemaVersion` field keeps future migrations cheap). Writes are debounced and atomic (serialize → write → verify parse).

```ts
type TaskId = string;            // crypto.randomUUID()

interface Task {
  id: TaskId;
  title: string;                 // plain text after chips are extracted
  status: 'open' | 'done';
  dueDate: string | null;        // 'YYYY-MM-DD' local date — date-only semantics
  dueTime: string | null;        // 'HH:mm', only meaningful when dueDate set
  list: string | null;           // '#work' → 'work'; flat namespace
  priority: 1 | 2 | 3 | null;    // !p1 highest
  recurrence: Recurrence | null; // 'every monday', 'every 2 weeks'
  createdAt: string;             // ISO timestamp
  completedAt: string | null;
  order: number;                 // manual sort within a day/view
}

interface Recurrence {
  freq: 'daily' | 'weekly' | 'monthly';
  interval: number;              // every N units
  byWeekday: number[] | null;    // weekly: [1] = Monday
}

interface AppData {
  schemaVersion: 1;
  tasks: Task[];
}
```

**Key decisions:** Rollover is **derived, not stored** — a task is "rolled over" iff `status === 'open' && dueDate < today`; no nightly mutation job, no stale state, works even if the app wasn't opened for a week. Completing a recurring task marks it `done` and creates a *new* Task at the next occurrence (history stays honest in Done). The **undo stack is in-memory only** (session-scoped, max ~50 entries), holding inverse operations — it is not persisted. Lists are derived from tasks (the set of distinct `list` values); no separate list entity to manage.

## Architecture

The stack stays exactly what the repo scaffolds: **React 19 + Vite + TypeScript, no new runtime dependencies.** The design splits into a framework-free core and a thin React shell.

**Pure core (`src/lib/`)** — plain TypeScript modules, no React imports, fully unit-testable:

- `parser.ts` — the NL quick-add parser. Input: raw string. Output: `{ title, dueDate, dueTime, list, priority, recurrence, chips[] }` where `chips` carries source-text ranges so the UI can highlight tokens. Deterministic, takes "now" as a parameter (never reads the clock itself).
- `recurrence.ts` — computes next occurrence from a `Recurrence` + completion date.
- `selectors.ts` — view filters: `todayTasks()` (rolled-over + due-today + ordering), `upcomingGroups()`, etc. Rollover logic lives here, derived at read time.
- `store.ts` — a single reducer over `AppData` with typed actions (`add`, `complete`, `snooze`, `edit`, `delete`, `undo`). Every action returns the new state *plus* its inverse action; the undo stack is just a list of inverses.
- `persistence.ts` — load/save the versioned JSON document, debounced, with parse-verify on write and corruption fallback on read.

**React shell (`src/components/`)** — `App` (layout, view routing via state, global keymap hook), `CommandBar` (input + live chips + command mode), `TaskList`/`TaskRow` (selection, inline edit), `ViewTabs`, `Toast` (undo affordance), `Cheatsheet` overlay. State flows through one `useReducer` + context — no Redux/Zustand; the app is small enough that adding a store library would be the bloat we're avoiding.

**Keyboard handling** is centralized in one `useKeymap` hook with a context-priority model (inline-edit > command bar > list navigation), so shortcuts never fight the input field.

## Edge Cases & Error Handling

**Parser ambiguity.** Text that *could* be a token but reads naturally stays literal unless unambiguous: "Pay May invoice" must not parse "May" as a date — date tokens require keyword anchors (`tomorrow`, `next friday`, `jun 12`, `3pm`). When a token *is* consumed as a chip, `Esc` reverts it; titles containing a literal `#` or `!` can be kept as text the same way. An empty title after chip extraction blocks capture with inline feedback rather than creating a nameless task.

**Time & date.** All date math is local-timezone, date-only strings — no UTC drift bugs. The app recomputes "today" on window focus and at midnight via a timer, so a tab left open overnight rolls over correctly. Past dates typed at capture ("yesterday") are allowed but confirmed by chip color. Feb 30-type cases in monthly recurrence clamp to the month's last day. DST transitions can't break anything because times are display-only strings, never arithmetic inputs.

**Storage.** If `localStorage` is full or unavailable (private browsing), the app runs in-memory and shows a persistent, dismissible warning banner — capture keeps working; data loss is announced, never silent. On load, corrupted JSON triggers fallback: stash the broken blob under a recovery key, start fresh, and surface a notice. Multi-tab: a `storage` event listener reloads state on external writes (last-writer-wins; acceptable for single-user v1).

**Undo edge cases.** Undoing a recurring-task completion also removes the spawned next occurrence. The undo stack caps at 50; undo of a deletion restores the task with its original `order`.

**Recurrence safety.** Completing an overdue recurring task computes the next occurrence from *today*, not from the missed date — no avalanche of back-dated occurrences.

## Testing Strategy

The project's gates (`lens.config.json`) define the evidence: typecheck, lint, Vitest unit (≥80% coverage), Playwright e2e, and the visual gate (regression + axe + Lighthouse). Testing weight goes where the logic lives — the pure core.

**Unit tests (Vitest, the bulk).** The framework-free `src/lib/` modules get exhaustive coverage with injected clocks (no real time, no flake):

- `parser.ts` — the largest suite: each token type, combinations, the ambiguity cases above ("Pay May invoice" stays literal, "call mom tomorrow 3pm #family !p2" yields every field), chip source-ranges, empty-title rejection.
- `recurrence.ts` — next-occurrence math including monthly clamping and the overdue-advances-from-today rule.
- `selectors.ts` — Today composition (rollover + due-today + anytime, ordering), Upcoming grouping.
- `store.ts` — every action and, critically, every action's inverse: complete→undo round-trips state exactly, undoing a recurring completion removes the spawned task.
- `persistence.ts` — corruption fallback, recovery-key stash, quota-failure path.

Per repo convention: test names state behavior concretely ("snoozing with key 1 sets dueDate to tomorrow"), generator functions (`makeTask`, `makeAppData`) over beforeEach mutation.

**E2E (Playwright, thin).** The speed-benchmark flows as user journeys: load → today visible; type NL string → chips render → Enter → task appears; keyboard triage (j/k, x, 1/2/3); undo via toast; data survives reload.

**Visual gate (Pixel Law).** Every UI story runs `bash verification/run-visual-gate.sh /` — screenshot diff vs baseline at 375/768/1280, zero axe violations, Lighthouse ≥ thresholds. First baseline gets rendered, *looked at*, and checked against DESIGN-SYSTEM.md before blessing.

## Open Questions

- `DESIGN-SYSTEM.md` is still placeholder/template values. Run `/lens-design` to choose the visual direction and fill the token tables **before** UI stories execute — the visual gate and quantum.json `contracts` depend on it.
- Snooze target for "weekend" when today *is* the weekend (next weekend vs tomorrow) — decide during spec.
- Whether `>search` (free-text filter) makes the v1 cut or rides with All-view filtering.

### From advisory design-review (1 critical / 5 major — `/ql-spec` must resolve; full list in `.handoffs/design-review-findings.json`)

- **[critical] Focus model:** the bar is "always focused" yet bare keys (`j`/`k`, `x`, `1`/`2`/`3`, `?`) drive list triage — those would type into the bar. Spec must define the focus handoff (e.g. `↓`/`Esc` from an empty bar moves focus to the list; any printable character refocuses the bar).
- **[major] Recurrence anchoring:** `Recurrence` needs a day-of-month anchor (e.g. `byMonthDay`) — the implicit dueDate anchor conflicts with the advance-from-today rule ("rent on the 1st" would drift). Spec must also state that spawned occurrences carry `recurrence` forward.
- **[major] ⌘Z routing:** ⌘Z natively undoes typing in the focused input. Spec must define undo-key routing per focus context, plus redo and undo-of-undo behavior.
- **[major] Testable speed criteria:** "capture <2s" / "triage <1min" need machine proxies (keystrokes-to-capture count, Enter-to-render latency budget) as acceptance criteria.
- **[major] Parser grammar table:** the PRD must enumerate the definitive supported-token grammar (what "12 jun", "15:00", "in 3 days", "every weekday", multiple `#` tags, `!p4` do — parse, reject, or stay literal).
- **[major] A11y design:** zero-axe + Lighthouse a11y 1.0 gates require designed aria-live for toasts/chips, focus management for overlay/inline-edit, and list keyboard semantics — spec these, don't leave to implementation.
- Minor items also recorded: anytime-tasks-in-Today rule, snooze on undated tasks, `order` reorder UX, Esc precedence, undo-stack clear on multi-tab reload, DST tests for midnight timer, component-test coverage plan, lists-vs-projects Non-Goals line, data export in/out.

## Next Steps

Run `/quantum-loop:spec` to generate a formal Product Requirements Document from this design.
