# PRD: Command-Bar Todo App ("Morning Edition")

**Date:** 2026-06-09
**Source design:** `docs/plans/2026-06-09-command-bar-todo-design.md` (Approved)
**Design system:** `DESIGN-SYSTEM.md` ("Morning Edition", tokens in `src/styles/tokens.css`, already imported via `src/index.css`)
**User intent (verbatim, from quantum.json):** "todo app that implements the best features from existing todo apps and fixes common pain points"

## 1. Introduction / Overview

A local-first, keyboard-first todo web app for busy professionals where a single omnipresent command bar is the entire interaction model. It attacks the canonical pain point of existing todo apps — capture friction — with natural-language quick-add, and fixes the second canonical pain point — the overdue guilt wall — with gentle derived rollover. Client-only React 19 + Vite; all data in `localStorage`; no backend.

## 2. Goals

- G-1: A task typed as natural language is captured with zero interactions beyond typing + Enter (machine proxy: the FR-48 capture flow passes in e2e).
- G-2: Today's plan is visible at load with zero clicks (e2e asserts Today view renders populated without any interaction).
- G-3: Daily triage is fully keyboard-driven (machine proxy: the FR-48 triage flow passes in e2e).
- G-4: Nothing is silently lost: every mutation is undoable (FR-36), storage failures are announced (FR-41), rollover never hides a task (FR-24).
- G-5: Every UI story passes the visual gate: screenshot diff ≤ 0.01, 0 axe violations, Lighthouse perf ≥ 0.9 / a11y = 1.0 / best-practices ≥ 0.95 at 375/768/1280.
- G-6: Unit coverage ≥ 80% overall, with `src/lib/` modules at 100% branch coverage on date math.

## 3. User Stories

> Sizing: one story = one module or one component. Dependency order: data/lib stories (US-001…005) precede all UI stories; US-006 precedes all other UI stories; US-011 (Toast) precedes US-012 (Snooze); US-017 (Cheatsheet) follows US-008 and US-010; US-018 (e2e suite) is last. Every story includes "Typecheck (`pnpm run typecheck`) and lint (`pnpm run lint`) pass". UI stories additionally require the visual gate (`bash verification/run-visual-gate.sh /`) and the browser-verification evidence criterion: "Browser-verified: visual-gate screenshots at 375/768/1280 inspected and cited in the story's completion evidence."

### US-001: Task types and persistence module
**Description:** As the app, I need versioned load/save of `AppData` to localStorage so user data survives reloads and corruption is recoverable.

**Acceptance Criteria:**
- [ ] `src/lib/types.ts` [NEW] exports `Task`, `Recurrence`, `AppData` exactly as specified in FR-26 and FR-29…FR-31 (no `any` anywhere).
- [ ] `src/lib/persistence.ts` [NEW] exports `load(storage: StorageLike): LoadResult` and `save(storage: StorageLike, data: AppData): SaveResult` (storage injected; never touches `window` directly).
- [ ] `save` serializes, writes under key `todo-quantum.v1`, re-reads and parses to verify; returns `{ok: false, reason: 'quota'}` on QuotaExceededError without throwing.
- [ ] `load` of missing key returns `{ok: true, data: {schemaVersion: 1, tasks: []}, recovered: false}`.
- [ ] `load` of unparseable/schema-invalid JSON stashes the raw blob under `todo-quantum.recovery.<ISO timestamp>`, returns empty AppData with `recovered: true`.
- [ ] Unit tests (Vitest, generator fns `makeTask`/`makeAppData` [NEW in test file]) cover: round-trip, missing key, corrupt JSON stash, quota failure; all pass via `pnpm test -- --run`.
- [ ] Typecheck (`pnpm run typecheck`) and lint (`pnpm run lint`) pass.

### US-002: Natural-language parser
**Description:** As a user, I want "Send report tomorrow 3pm #work !p1" parsed into structured fields as I type so capture is one line of text.

**Acceptance Criteria:**
- [ ] `src/lib/parser.ts` [NEW] exports `parse(input: string, now: Date): ParseResult` — deterministic, `now` injected.
- [ ] `ParseResult` = `{title, dueDate, dueTime, list, priority, recurrence, chips}` where `chips: Array<{start, end, kind, display}>` carries source ranges.
- [ ] Implements the FR-1…FR-10 grammar table exactly: every listed token parses; every listed non-token stays literal.
- [ ] "Pay May invoice" yields title "Pay May invoice" with zero chips (FR-2 anchor rule).
- [ ] "Send report tomorrow 3pm #work !p1" with now=2026-06-09 yields dueDate 2026-06-10, dueTime "15:00", list "work", priority 1, title "Send report", 3 chips.
- [ ] Empty-after-extraction title yields `{valid: false}` (FR-13).
- [ ] Unit tests cover every grammar row, every documented literal-fallback case, and chip ranges; all pass.
- [ ] Typecheck and lint pass.

### US-003: Recurrence engine
**Description:** As a user, I want recurring tasks to regenerate on completion at the right next date so repeating work schedules itself.

**Acceptance Criteria:**
- [ ] `src/lib/recurrence.ts` [NEW] exports `nextOccurrence(rec: Recurrence, anchor: string, today: string): string` implementing FR-26…FR-28 (smallest pattern-matching date strictly after `max(anchor, today)`).
- [ ] Monthly `byMonthDay: 31` from 2026-01-31 yields 2026-02-28 (clamp rule FR-27).
- [ ] Weekly `byWeekday:[1]` anchored Monday, completed the following Wednesday, yields the next Monday after today (no back-dated avalanche, FR-28).
- [ ] `every 2 weeks` preserves anchor parity: next = anchor + 14k, smallest strictly after today.
- [ ] Unit tests cover daily/weekly/monthly, interval > 1, clamping, overdue-completion, and DST-transition weeks (e.g. 2026-03-08, 2026-11-01); all pass.
- [ ] Typecheck and lint pass.

### US-004: Store reducer with undo/redo
**Description:** As a user, I want every action reversible so I never fear a keystroke.

**Acceptance Criteria:**
- [ ] `src/lib/store.ts` [NEW] exports reducer over `{data: AppData, undoStack, redoStack}` with actions: `add`, `complete`, `uncomplete`, `edit`, `delete`, `snooze`, `undo`, `redo`, `externalReload`.
- [ ] Every mutating action pushes its inverse onto `undoStack` (cap 50, FIFO eviction) and clears `redoStack`; `undo` pops, applies, pushes inverse onto `redoStack` (FR-36, FR-38).
- [ ] `complete` on a task with `recurrence` also creates the next occurrence (id via injected `newId()`, date via `nextOccurrence`); its inverse removes the spawned task and restores `status` (FR-39).
- [ ] `delete` inverse restores the task with its original `order` value.
- [ ] `externalReload` replaces `data` and empties both stacks (FR-43).
- [ ] Unit tests: every action round-trips via undo to deep-equal prior state; recurring complete+undo removes spawned task; stack cap evicts oldest; all pass.
- [ ] Typecheck and lint pass.

### US-005: View selectors
**Description:** As a user, I want Today/Upcoming/All/Done computed from one task list so views are always consistent.

**Acceptance Criteria:**
- [ ] `src/lib/selectors.ts` [NEW] exports `todayItems(data, today)`, `upcomingGroups(data, today)`, `allItems(data, filterText)`, `doneItems(data)` implementing FR-21…FR-23.
- [ ] `todayItems` returns three ordered sections: rollover (open, dueDate < today, ascending dueDate), due-today (dueTime ascending then `order`), anytime (dueDate null, by `order`).
- [ ] `upcomingGroups` returns day-groups for today+1…today+7 then ISO-week groups, ALREADY omitting empty groups (the selector filters; the UI renders what it receives — FR-22).
- [ ] `allItems('rep')` matches case-insensitive substring on title and list; empty filter returns all open tasks.
- [ ] `doneItems` sorts by `completedAt` descending.
- [ ] Unit tests cover each section's membership and ordering with a fixed `today`; all pass.
- [ ] Typecheck and lint pass.

### US-006: App shell, masthead, and view tabs
**Description:** As a visitor, I want the app shell rendered to the design system so the structure exists for every later story.

**Acceptance Criteria:**
- [ ] `src/App.tsx` (existing) replaced with shell: masthead (today's date, `--type-display` Fraunces over double rule per DESIGN-SYSTEM §1), view tabs (Today/Upcoming/All/Done, mono uppercase, accent underline on current), main column (max-width 720 desktop / 640 tablet / full 375 per §7), placeholder content region.
- [ ] `src/components/ViewTabs.tsx` [NEW]; current view held in App state; clicking a tab switches view.
- [ ] Only `--color-*`/`--space-*`/`--type-*`/`--radius-*` tokens used — `grep -rnE '#[0-9A-Fa-f]{3,6}' src/components src/App.tsx src/App.css` returns no matches in changed files.
- [ ] Scaffold demo content and unused assets removed from `src/App.tsx`/`src/App.css`.
- [ ] Visual gate passes: `bash verification/run-visual-gate.sh /` (baseline created, rendered, inspected against DESIGN-SYSTEM.md before blessing).
- [ ] Browser-verified: visual-gate screenshots at 375/768/1280 inspected and cited in completion evidence.
- [ ] Typecheck and lint pass.

### US-007: Command bar with live parse chips
**Description:** As a user, I want tokens to become visible chips as I type so I trust the parse before pressing Enter.

**Acceptance Criteria:**
- [ ] `src/components/CommandBar.tsx` [NEW]: text input styled per DESIGN-SYSTEM §6 (vermilion `▸` prompt, fg border, print shadow), permanently mounted above the view tabs.
- [ ] On each input change, `parse()` runs and recognized tokens render as accent-underlined chips inline (overlay or mirrored rendering — visually inside the bar), per §6 "never boxed".
- [ ] Enter with valid parse dispatches `add`, clears input, keeps focus in the bar (FR-12).
- [ ] Enter with empty/invalid title: danger border flash at `--motion-fast`, inline mono message "nothing to capture", no task created (FR-13).
- [ ] Esc with ≥1 chip reverts the most recent chip to literal text (FR-14); input value updates accordingly.
- [ ] Chips have visually-hidden text announcing the parse (e.g. "due tomorrow 3 PM") via `aria-describedby` on the input (FR-45).
- [ ] Dev deps `@testing-library/react`, `@testing-library/user-event`, `jsdom` [NEW dev deps — this story introduces all three] added; component tests: typing canonical string renders 3 chips; Enter dispatches add and clears; Esc reverts last chip.
- [ ] Visual gate passes for `/` including a state with the canonical string typed.
- [ ] Browser-verified: visual-gate screenshots at 375/768/1280 inspected and cited in completion evidence.
- [ ] Typecheck and lint pass.

### US-008: Command mode
**Description:** As a user, I want `>` to switch the bar into a fuzzy command palette so navigation never needs the mouse.

**Acceptance Criteria:**
- [ ] When input begins with `>`, bar enters command mode: prompt glyph `❯`, mono input text (DESIGN-SYSTEM §6), fuzzy-matched command list rendered beneath the bar.
- [ ] v1 commands: `today`, `upcoming`, `all`, `done`, `undo`, `redo`, `help` (FR-19); ↑/↓ move command selection, Enter executes; Esc exits command mode and clears the input to the empty string (capture mode).
- [ ] `>help` opens the cheatsheet overlay (delivered by US-017; until then it is a registered command whose handler is wired in US-017).
- [ ] Fuzzy match: subsequence, case-insensitive (`>tdy` matches `today`).
- [ ] Text not starting with `>` is NEVER treated as a command (FR-18).
- [ ] Command list has `role="listbox"` with `aria-activedescendant` on the input.
- [ ] Component tests: `>tdy` + Enter switches view to Today; `>undo` dispatches undo; Esc exits command mode leaving an empty input.
- [ ] Visual gate passes including command-mode-open state.
- [ ] Browser-verified: visual-gate screenshots at 375/768/1280 inspected and cited in completion evidence.
- [ ] Typecheck and lint pass.

### US-009: Task list and task row
**Description:** As a user, I want my tasks rendered as broadsheet rows with selection, completion, and inline editing.

**Acceptance Criteria:**
- [ ] `src/components/TaskList.tsx` + `src/components/TaskRow.tsx` [NEW]: rows per DESIGN-SYSTEM §6 (surface bg, hairline border, 3px left rule: accent for priority 1, border otherwise; metadata in mono right-aligned, wrapping below title at 375).
- [ ] Selection model: at most one selected row, accent-thickened left rule + print shadow; roving `tabindex` (selected row tabIndex 0, others -1) (FR-46).
- [ ] Mouse: hover reveals checkbox; click checkbox completes (strike-through draws at `--motion-base`, row settles muted); click title opens inline edit (input pre-filled, Enter saves via `edit`, Esc cancels).
- [ ] Rollover rows render muted left rule + italic "— since {weekday}" annotation, never danger-colored (FR-24).
- [ ] Empty list renders italic empty state: "Nothing on deck — type to capture." (DESIGN-SYSTEM §6).
- [ ] Component tests: render sections, complete dispatches with strike state, inline edit save/cancel, empty state.
- [ ] Visual gate passes including selected + rollover + empty states.
- [ ] Browser-verified: visual-gate screenshots at 375/768/1280 inspected and cited in completion evidence.
- [ ] Typecheck and lint pass.

### US-010: Keyboard system and focus model
**Description:** As a user, I want one coherent keyboard layer so the bar and the list never fight over keys.

**Acceptance Criteria:**
- [ ] `src/hooks/useKeymap.ts` [NEW] implements the FR-15…FR-17 focus model and Esc precedence exactly.
- [ ] Bar focused: printable keys type; `↓` (or Esc when bar empty) moves focus to list; Enter captures.
- [ ] List focused: `j`/`↓` next, `k`/`↑` previous, `x`/Space complete, `e`/Enter inline edit, `Del`/`Backspace` delete, `1`/`2`/`3` snooze, `g` then `t/u/a/d` switch view, `?` opens the cheatsheet (key registered here; overlay handler wired when US-017 lands); any other printable character moves focus to the bar AND inserts itself (FR-16).
- [ ] Undo-key routing per FR-37: LIST focused → `⌘Z`/`Ctrl+Z` always dispatches app `undo` (and `⌘⇧Z`/`Ctrl+Shift+Z` app `redo`); BAR focused with empty input → app undo/redo; BAR focused with non-empty input → native text-field undo untouched. No focus/content combination leaves the key dead.
- [ ] Component tests: focus handoff bar↔list both directions, each list key dispatches its action, ⌘Z routing in all three contexts (list-focused, bar-empty, bar-non-empty).
- [ ] Visual gate passes (focus-visible states).
- [ ] Browser-verified: visual-gate screenshots at 375/768/1280 inspected and cited in completion evidence.
- [ ] Typecheck and lint pass.

### US-011: Toast and undo wiring
**Description:** As a user, I want quiet confirmation with an undo handle after every mutation.

**Acceptance Criteria:**
- [ ] `src/components/Toast.tsx` [NEW]: bottom-left, inverted ink (fg bg / bg text), print shadow, mono label + "Undo ⌘Z" keycap; auto-dismisses after 4.8s; only the latest toast shows.
- [ ] Toast container is `aria-live="polite"`; message text includes the action ("Completed", "Deleted", "Snoozed to …", "Captured", "Scheduled").
- [ ] Completing a recurring task toasts the next occurrence date ("Done — next Mon Jun 15").
- [ ] Clicking Undo in the toast (or ⌘Z per FR-37) reverses the action; toast updates to "Undone".
- [ ] Component tests: toast renders per action type, auto-dismiss timer (fake timers), Undo click dispatches undo, aria-live attribute present.
- [ ] Visual gate passes including visible-toast state.
- [ ] Browser-verified: visual-gate screenshots at 375/768/1280 inspected and cited in completion evidence.
- [ ] Typecheck and lint pass.

### US-012: Snooze
**Description:** As a user, I want one-key snooze so an overdue item leaves Today in under a second. *(Depends on US-011: snooze surfaces its result via the toast.)*

**Acceptance Criteria:**
- [ ] With a row selected: `1` sets dueDate to tomorrow, `2` to today+7, `3` to next Saturday strictly after today (FR-33…FR-35; pressing `3` on a Saturday yields the following Saturday).
- [ ] Snoozing a task with `dueDate: null` assigns the target date and the toast labels it "Scheduled" (FR-35).
- [ ] Mouse parity: row overflow menu offers Tomorrow / Next week / Weekend.
- [ ] Each snooze shows the undo toast naming the new date (e.g. "Snoozed to Sat Jun 13 — Undo ⌘Z").
- [ ] Unit tests for the three date computations live with store tests, including weekend-on-weekend and `2` crossing a month boundary.
- [ ] Component test: pressing `1` on selected row dispatches snooze with tomorrow's date.
- [ ] Visual gate passes.
- [ ] Browser-verified: visual-gate screenshots at 375/768/1280 inspected and cited in completion evidence.
- [ ] Typecheck and lint pass.

### US-013: Today view assembly
**Description:** As a user, I want the app to open into an honest Today so the day's plan needs zero clicks.

**Acceptance Criteria:**
- [ ] Today renders the three FR-21 sections with section labels (mono uppercase, hairline rule); rollover rows above dated rows above anytime rows.
- [ ] "Today" recomputes on `window` focus and via a timer scheduled for next local midnight, re-armed after firing (FR-25); a task due "today" left overnight appears as rollover without reload.
- [ ] Midnight-timer DST test: with fake timers crossing 2026-11-01 (25h day) and 2026-03-08 (23h day), the timer fires at local midnight, not 24h-after-arm.
- [ ] On load, command bar receives focus and Today is the active view (G-2).
- [ ] Load reveal: masthead settles first, rows stagger 40ms (verified by asserting each row's computed `animation-delay` increases by 40ms); under `prefers-reduced-motion` an e2e asserts computed animation durations are 0.
- [ ] e2e (Playwright): seeded localStorage with rollover + today + anytime tasks renders all three sections, correct order, no interaction.
- [ ] Visual gate passes (this story owns the canonical `/` baseline update).
- [ ] Browser-verified: visual-gate screenshots at 375/768/1280 inspected and cited in completion evidence.
- [ ] Typecheck and lint pass.

### US-014: Upcoming view
**Description:** As a user, I want the next stretch of days visible so I can plan beyond today.

**Acceptance Criteria:**
- [ ] Upcoming renders the day-groups starting tomorrow (header: mono uppercase weekday + date over hairline rule), then week-groups ("WEEK OF JUN 22"); the selector already omits empty groups (US-005/FR-22).
- [ ] Rows reuse TaskRow; selection/snooze/complete keys work identically here.
- [ ] Empty upcoming renders the italic empty state.
- [ ] e2e: seeded tasks across 3 weeks land in the correct groups.
- [ ] Visual gate passes for the Upcoming state.
- [ ] Browser-verified: visual-gate screenshots at 375/768/1280 inspected and cited in completion evidence.
- [ ] Typecheck and lint pass.

### US-015: All and Done views with live filter
**Description:** As a user, I want a complete honest list and a browsable history, filterable by just typing.

**Acceptance Criteria:**
- [ ] All view lists every open task (dated then anytime, by dueDate then `order`); Done view lists completed tasks by `completedAt` descending, struck-through muted per DESIGN-SYSTEM §8.
- [ ] In All view only, non-empty bar text (not starting with `>`) ALSO live-filters the list via `allItems(filterText)` while remaining valid capture input — Enter still captures it as a task and clears the filter (FR-20).
- [ ] A mono hint "filtering — Enter captures" appears under the bar while filtering.
- [ ] `uncomplete` is reachable in Done view: `x`/checkbox restores a task to open (status open, completedAt null).
- [ ] Component/e2e tests: filter narrows visible rows; Enter during filter creates the task; Done uncomplete round-trips.
- [ ] Visual gate passes for All-filtered and Done states.
- [ ] Browser-verified: visual-gate screenshots at 375/768/1280 inspected and cited in completion evidence.
- [ ] Typecheck and lint pass.

### US-016: Persistence wiring, storage banner, multi-tab
**Description:** As a user, I want my data saved continuously and loudly told when it can't be.

**Acceptance Criteria:**
- [ ] App state initializes from `load()` (recovery notice toast when `recovered: true`); every state change schedules a debounced (250ms) `save()`.
- [ ] `save` failure (quota/unavailable) sets a persistent dismissible banner under the masthead: danger border, mono text "Changes aren't being saved — this browser's storage is unavailable."; capture keeps working in memory (FR-41).
- [ ] `storage` events for the app key dispatch `externalReload`: state replaced, undo/redo stacks cleared, toast "List updated in another tab" (FR-43).
- [ ] `beforeunload` flushes any pending debounced save (FR-40).
- [ ] Integration tests: mutation → debounced write lands (fake timers); quota-failing storage shows banner; storage event clears stacks and toasts.
- [ ] Visual gate passes including banner-visible state.
- [ ] Browser-verified: visual-gate screenshots at 375/768/1280 inspected and cited in completion evidence.
- [ ] Typecheck and lint pass.

### US-017: Cheatsheet overlay
**Description:** As a user, I want `?` (or `>help`) to show every key so the keyboard layer is discoverable. *(Depends on US-008 and US-010, which register the entry points.)*

**Acceptance Criteria:**
- [ ] `src/components/Cheatsheet.tsx` [NEW]: overlay per DESIGN-SYSTEM §6 — surface sheet over bg scrim at 80% opacity, double-rule header, two-column mono key table listing every US-010 binding.
- [ ] `role="dialog"` + `aria-modal="true"`; focus trapped inside; Esc closes (FR-17 precedence: highest); focus returns to the previously focused element on close (FR-46).
- [ ] Opens via `?` in LIST context (US-010 binding) and via `>help` (US-008 command); both paths wired here.
- [ ] Component tests: open via both paths, focus trap cycles, Esc closes and restores focus.
- [ ] Visual gate passes including cheatsheet-open state.
- [ ] Browser-verified: visual-gate screenshots at 375/768/1280 inspected and cited in completion evidence.
- [ ] Typecheck and lint pass.

### US-018: Speed-benchmark e2e suite
**Description:** As the team, we want the headline goals enforced as machine-verifiable journeys so "fast" is a regression-tested property.

**Acceptance Criteria:**
- [ ] `e2e/speed.spec.ts` [NEW] passes via `pnpm exec playwright test e2e/` (FR-48):
- [ ] Capture proxy (G-1): from page load, keyboard-only — type canonical string, Enter — task row visible; zero non-typing interactions; time from Enter keyup to row visible < 200ms (Playwright timestamp assertion).
- [ ] Zero-click Today (G-2): seeded storage → Today sections visible with no interaction.
- [ ] Triage proxy (G-3): 5 seeded rollover tasks cleared via only `↓ x 1 2 3` keys in a single run; Today's rollover section empties.
- [ ] Undo journey: complete → ⌘Z → task restored open.
- [ ] Reload persistence: capture → reload → task present.
- [ ] Dark theme smoke: `data-theme="dark"` renders with dark tokens (bg computed style `#1A1611`).
- [ ] Typecheck and lint pass.

## 4. Functional Requirements

### Parser grammar (the definitive token table)

- FR-1: The parser shall recognize, case-insensitively, exactly these date tokens: `today`, `tomorrow`, `yesterday`; bare weekday names `monday`…`sunday` and 3-letter forms `mon`…`sun` (meaning the next such weekday strictly after today); `next <weekday>` (the weekday in the following ISO week); `<monthname> <D>` and `<D> <monthname>` with month names `january`…`december`/`jan`…`dec` (next future occurrence; allows past only for `yesterday`); `in N days` / `in N weeks` (N = 1–365).
- FR-2: A bare month name or weekday-lookalike inside other text shall stay literal: date tokens are recognized only as whole words AND only when the whole token resolves per FR-1 — "Pay May invoice" contains no `<monthname> <D>` pattern and yields zero chips.
- FR-3: The parser shall recognize time tokens only when a date token is also present or the time token is suffixed am/pm: `H(am|pm)`, `H:MM(am|pm)`, `HH:MM` (24h, 00:00–23:59). A bare `3` is never a time.
- FR-4: The parser shall recognize at most one list token `#<word>` (`\w+`, 1–32 chars); the FIRST `#` token is the list, later `#` tokens stay literal.
- FR-5: The parser shall recognize priority tokens exactly `!p1`, `!p2`, `!p3`; any other `!…` string stays literal.
- FR-6: The parser shall recognize recurrence tokens: `every day`/`daily`, `every week`/`weekly`, `every month`/`monthly`, `every N days|weeks|months`, `every <weekday>`, `every weekday` (→ weekly, byWeekday Mon–Fri).
- FR-7: Recognized tokens are removed from the title; remaining text, whitespace-collapsed and trimmed, is the title.
- FR-8: Each recognized token shall yield a chip with source range `{start, end}` and a human display string (e.g. "Wed Jun 10, 3:00 PM").
- FR-9: When two tokens of the same kind appear, the first wins and later ones stay literal (except `next <weekday>` which consumes both words).
- FR-10: Parsing shall be pure: same `(input, now)` always yields the same result; no Date.now()/locale reads inside.

### Capture

- FR-11: Plain text in the bar (not starting with `>`) shall always mean "new task"; capture is never hijacked by other modes.
- FR-12: Enter on a valid parse shall create the task (status open, `createdAt` now, `order` = next insertion counter), clear the bar, and keep focus in the bar.
- FR-13: Enter with an empty post-extraction title shall create nothing and show the inline error state (danger flash + mono message).
- FR-14: Esc in the bar with ≥1 chip shall revert the most recently created chip to its literal source text.

### Focus model & keyboard

- FR-15: Exactly two focus contexts exist outside overlays: BAR and LIST. On load: BAR. `↓` from BAR (any content) or Esc from an empty chip-less BAR moves to LIST (first/selected row). Overlay (cheatsheet, inline edit) is a third, modal context.
- FR-16: In LIST, the bound keys are `j ↓ k ↑ x Space e Enter Del Backspace 1 2 3 g ? ⌘Z ⌘⇧Z`; any OTHER printable key moves focus to BAR and types itself there.
- FR-17: Esc precedence (highest first): close cheatsheet → cancel inline edit → exit command mode (clearing the input to empty) → revert last chip → (bar empty) move focus to LIST → (in LIST) clear selection.
- FR-18: Input beginning with `>` enters command mode; deleting the `>` (or Esc per FR-17) exits it.
- FR-19: v1 command set: `today`, `upcoming`, `all`, `done`, `undo`, `redo`, `help` (`help` opens the US-017 cheatsheet); fuzzy subsequence matching; Enter runs the highlighted command.
- FR-20: In the All view, non-command bar text live-filters the list while remaining capture input (see US-015).

### Views & rollover

- FR-21: Today = three ordered sections: (1) rollover: open AND dueDate < today, ascending dueDate; (2) due today, dueTime ascending (null times last) then `order`; (3) anytime: dueDate null, by `order`.
- FR-22: Upcoming = day-groups for today+1…today+7, then ISO-week groups; the selector omits empty groups.
- FR-23: All = every open task, dated (dueDate ascending) then anytime (`order`). Done = completed tasks, `completedAt` descending.
- FR-24: Rollover is derived at read time (never stored, no mutation job); rollover rows are muted-annotated ("— since {weekday}", italic), never danger-styled.
- FR-25: "Today" recomputes on window focus and at local midnight via a re-arming timer.

### Recurrence

- FR-26: `Recurrence` = `{freq: 'daily'|'weekly'|'monthly', interval: number ≥ 1, byWeekday: number[] | null, byMonthDay: number | null}`.
- FR-27: Monthly occurrences fall on `byMonthDay`, clamped to the month's last day when shorter.
- FR-28: On completion, the next occurrence = the smallest date matching the pattern (anchored at the completed task's dueDate) strictly after `max(today, dueDate)`; the spawned task copies title/list/priority/recurrence and gets a fresh id; exactly one task per recurrence chain is open at a time.

### Data model

- FR-29: `Task` = `{id: string (crypto.randomUUID()), title, status: 'open'|'done', dueDate: 'YYYY-MM-DD'|null, dueTime: 'HH:mm'|null, list: string|null, priority: 1|2|3|null, recurrence: Recurrence|null, createdAt: ISO string, completedAt: ISO string|null, order: number}`.
- FR-30: `order` is a monotonically increasing insertion counter (max existing + 1); it provides stable sort only — manual reordering is a Non-Goal (NG-8).
- FR-31: `AppData` = `{schemaVersion: 1, tasks: Task[]}` stored as one JSON document under key `todo-quantum.v1`.
- FR-32: All date arithmetic uses local-timezone date components (never UTC ms math across days).

### Snooze

- FR-33: Snooze targets: key `1` → today+1; key `2` → today+7; key `3` → next Saturday strictly after today.
- FR-34: Snooze never moves a task into the past and always strictly forward from today.
- FR-35: Snoozing an undated task assigns the target date; the toast labels it "Scheduled".

### Undo/redo

- FR-36: Every mutating action (add, complete, uncomplete, edit, delete, snooze) is undoable via an inverse-operation stack, cap 50, session-scoped (not persisted).
- FR-37: Undo-key routing by focus context: LIST focused → ⌘Z/Ctrl+Z dispatches app undo and ⌘⇧Z/Ctrl+Shift+Z app redo, regardless of bar content; BAR focused with empty input → same app routing; BAR focused with non-empty input → the browser's native text-field undo applies untouched.
- FR-38: A new mutation clears the redo stack.
- FR-39: Undoing a recurring completion removes the spawned next occurrence and reopens the task.

### Persistence & failure modes

- FR-40: Saves are debounced 250ms, verified by re-parse, and flushed on `beforeunload`.
- FR-41: Quota/unavailable storage → app continues in memory + persistent dismissible danger banner; never silent.
- FR-42: Corrupt stored JSON → stash under recovery key, fresh start, recovery toast.
- FR-43: External `storage` writes → state reload, both undo/redo stacks cleared, "List updated in another tab" toast (last-writer-wins).

### Accessibility & theming

- FR-44: The toast region is `aria-live="polite"`; the storage banner `role="alert"`.
- FR-45: Chip parses are announced: input has `aria-describedby` pointing at visually-hidden text describing current chips.
- FR-46: TaskList uses roving tabindex; cheatsheet is a focus-trapped `role="dialog"` that restores focus on close; every interactive element shows the §6 accent focus ring; 0 axe violations at 375/768/1280.
- FR-47: Theme: light default; `[data-theme="dark"]` + `prefers-color-scheme` per `src/styles/tokens.css`; no component-level literal colors.

### Performance proxies

- FR-48: e2e-asserted: Enter-to-row-visible < 200ms (capture); load-to-Today-visible without interaction; 5-task keyboard-only triage flow; Lighthouse performance ≥ 0.9 with 100 seeded tasks.

## 5. Non-Goals (Out of Scope)

- NG-1: Collaboration — no shared lists, assignees, comments, or multi-user anything.
- NG-2: Integrations — no email/Slack/calendar connections, browser extensions, or in-bound capture from other apps.
- NG-3: Subtasks and project hierarchy — lists are FLAT labels (`#work`): no nesting, no per-list views beyond filtering, no list management UI (lists exist iff tasks reference them).
- NG-4: Notifications — no push, desktop, or in-app reminders; the Today view is the reminder.
- NG-5: Accounts, sync, backend, or any network persistence.
- NG-6: Data export/import — explicitly deferred (user decision 2026-06-09); no `>export` command in v1.
- NG-7: Search beyond the All-view live filter — no global search command, no fuzzy task search.
- NG-8: Manual reordering — no drag-and-drop or reorder keys; `order` is insertion-stable only.
- NG-9: Mobile-native features — responsive web at 375 is supported; PWA/offline manifest/installability are not.

## 6. Design Considerations

`DESIGN-SYSTEM.md` ("Morning Edition") is the binding visual contract: token names are quantum.json `contracts`; §6 defines per-component states (command bar, task row, buttons, tabs, toast, cheatsheet, empty states); §7 the per-breakpoint layout; §8 the gateable per-screen criteria including the canonical-chips check. Deviating from a token is a halt-and-propose event. The one orchestrated motion moment is the load reveal (§5); everything else is fast and quiet. Danger color appears only on destructive affordances and the storage banner.

## 7. Technical Considerations

- Stack: React 19 + Vite + TypeScript (strict; no `any`). No new RUNTIME dependencies. New DEV dependencies: `@testing-library/react`, `@testing-library/user-event`, `jsdom` — all three introduced by US-007.
- All `src/lib/` modules are framework-free, with injected `now`/`today`/`storage`/`newId` for determinism.
- Existing files this PRD touches: `src/App.tsx`, `src/App.css`, `src/index.css` (verified present); `src/styles/tokens.css` is complete — do not modify it.
- Gates (lens.config.json): typecheck `pnpm run typecheck`, lint `pnpm run lint`, unit `pnpm test -- --run` (coverage ≥ 80%), e2e `pnpm exec playwright test e2e/`, visual gate per UI story.
- Lifecycle checklist: First-run → empty AppData + empty state + focused bar (US-006/009). Returning → localStorage load + Today recompute (US-013/016). Update → `schemaVersion` field reserved; v1 ships only version 1, future migrations read it (no migration code in v1 — justified: single shipped schema). Error recovery → FR-40…FR-43. Empty states → US-009/014. Uninstall/disable → N/A with justification: client-only app; "uninstall" = clearing browser storage, which the recovery-key stash and FR-41 banner already make non-silent.

## 8. Success Metrics

- SM-1: FR-48's four e2e speed proxies pass in CI on every story merge.
- SM-2: Visual gate green (diff ≤ 0.01, axe = 0, Lighthouse perf ≥ 0.9 / a11y = 1.0 / bp ≥ 0.95) at all three breakpoints for every UI story.
- SM-3: Unit coverage ≥ 80% overall; `src/lib/` date-math branches 100%.
- SM-4: Parser grammar table fully covered: one passing unit test per FR-1…FR-10 row, including every literal-fallback case.
- SM-5: Zero uses of `any`, zero literal hex colors in components (grep-verified in US-006).

## 9. Open Questions

None at this time. (All brainstorm `remaining` items and the prior design-review findings are resolved as binding FRs: weekend snooze → FR-33, search → FR-20/NG-7, undo-vs-multi-tab → FR-43, export → NG-6, focus model → FR-15…FR-17, recurrence anchor → FR-26…FR-28, ⌘Z → FR-37, parser grammar → FR-1…FR-10, a11y → FR-44…FR-47, speed proxies → FR-48, midnight-timer DST → US-013 AC, reorder dead field → FR-30/NG-8.)

## Next Steps

Run `/quantum-loop:plan` to convert this PRD into machine-readable `quantum.json` stories/tasks with the dependency DAG (lib stories US-001…005 first; US-006 before all other UI; US-011 before US-012; US-017 after US-008/US-010; US-018 last).
