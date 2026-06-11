# PRD: Token Parsing in Edit (Edit/Add Symmetry)

**Date:** 2026-06-10
**Source design:** `docs/plans/2026-06-10-edit-token-parsing-design.md` (Approved)
**Extends:** the shipped command-bar todo app (`tasks/prd-command-bar-todo.md`, US-001..US-018)

**User intent (verbatim):** "when editing an existing todo, typing things like #atag and tomorrow, etc, should function like when adding a new todo"

**User clarifications (verbatim):** "adding a new chip should overwrite the related chip to its left" · "Also, as part of this, we will remove the three dots menu. All changes will be made via the keyboard ideally"

## 1. Introduction / Overview

Today the inline editor in `src/components/TaskRow.tsx` edits only the plain-text title; changing a due date, list, priority, or recurrence requires deleting and recreating the task. This feature makes edit fully symmetrical with add: opening edit reconstructs the task as the text you would have typed (title + metadata as live chips), and saving re-parses that text as the single source of truth. As part of the same keyboard-first push, the `⋯` overflow menu is removed from task rows.

## 2. Goals

- Editing a task supports every token kind add supports (date, time, list, priority, recurrence), with identical live-chip feedback.
- Round-trip fidelity: for any task expressible by the token grammar, serialize → parse reproduces every field and the exact title (property-tested).
- One parsing behavior everywhere: last-wins chip overwrite with sealed displacement replaces first-token-wins in **both** add and edit.
- A single undo reverses an entire edit (all changed fields at once).
- The `⋯` overflow menu is gone; snooze is keyboard-only (`1`/`2`/`3`); zero axe violations and visual-gate pass after the change.

## 3. User Stories

Numbering continues from the prior PRD (US-101+) to avoid collision with the existing quantum.json (US-001..US-018).

### US-101: Parser — explicit-year dates
**Description:** As a user editing a rolled-over task, I want past dates like `jun 3 2026` to parse to that exact date so that opening an edit never silently rewrites my due date to next year.

**Acceptance Criteria:**
- [ ] `parse('pay rent jun 3 2026', now)` with `now` = 2026-06-10 yields `dueDate: '2026-06-03'` (no roll-forward) and a date chip covering `jun 3 2026`.
- [ ] Both `<monthname> <day> <year>` and `<day> <monthname> <year>` forms parse; 4-digit years only; years outside 1970–2100 stay literal.
- [ ] Without a year, existing roll-forward behavior is unchanged (`jun 3` at 2026-06-10 → 2027-06-03) — existing tests still pass.
- [ ] Chip display includes the year whenever the resolved date's year differs from `now`'s year (covers both explicit-year dates and no-year dates that roll forward into next year): `formatDateDisplay` gains an optional `now` parameter — `formatDateDisplay('2027-06-03', now)` with `now` in 2026 renders `Thu Jun 3, 2027`; same-year dates render without the year, unchanged.
- [ ] Unit tests in `src/lib/parser.test.ts` cover both word orders, year-boundary values, and the no-year regression.
- [ ] Typecheck/lint passes.

### US-102: Parser — last-wins with displaced ranges and reverted-ranges input
**Description:** As a user, I want typing a second date/list/priority/recurrence token to replace the earlier one so that the chip to the left is overwritten, in add and edit alike.

**Acceptance Criteria:**
- [ ] `parse` signature becomes `parse(input: string, now: Date, reverted?: Array<{start: number; end: number}>)`; existing two-arg calls compile unchanged.
- [ ] `ParseResult` gains `displaced: Array<{ start: number; end: number }>` listing earlier same-kind token ranges superseded by a later token.
- [ ] `parse('pay rent friday monday', now)` yields the Monday date, a chip on `monday`, `displaced` containing the range of `friday`, and `title === 'pay rent'` — **displaced ranges are excluded from the title** exactly like chip ranges. (This makes US-102 safe to ship before US-105: even with no removal UI, a capture never accumulates displaced words in the title.)
- [ ] Last-wins applies per kind to date, time, list, priority, and recurrence independently.
- [ ] Displacement compares **pre-merge** tokens: `parse('dinner tomorrow 3pm 4pm', now)` keeps the date, time becomes `16:00`, and `displaced` contains only the `3pm` range.
- [ ] Tokens inside `reverted` ranges are never matched: with `reverted` covering `tomorrow` in `'Email #invoices tomorrow friday'`, the result has the Friday date, `displaced` is empty, and `tomorrow` remains in the title.
- [ ] FR-9 of `tasks/prd-command-bar-todo.md` (first-wins) is explicitly superseded; every existing first-wins test in `src/lib/parser.test.ts` is rewritten to assert last-wins + displacement.
- [ ] Date-anchor ambiguity tests ("Pay May invoice" stays literal) still pass unchanged.
- [ ] Typecheck/lint passes.

### US-103: Serializer — `serializeTask` with round-trip property
**Description:** As a user opening edit, I want the task reconstructed as the text I would have typed so that everything about the task is editable as text.

**Acceptance Criteria:**
- [ ] New file `src/lib/serialize.ts` (NEW) exports `serializeTask(task: Task, now: Date): { text: string; revertedRanges: Array<{start: number; end: number}> }`.
- [ ] Token order in the output is exactly: title, date, time, recurrence, list, priority.
- [ ] Date forms: `yesterday`/`today`/`tomorrow` when dueDate = now−1/now/now+1; `jun 12` when within the next 12 months; `jun 3 2026` (explicit year) otherwise. Time forms: `3pm` / `3:30pm`. Recurrence: `every day`, `every 2 weeks`, `every monday`, `every month`. List: `#work`. Priority: `!p1`.
- [ ] `revertedRanges` covers every substring of the *title* that would otherwise parse as a token (verified: serializing a task titled `Plan tomorrow standup` returns ranges such that parsing with them keeps `tomorrow` in the title and `dueDate` unchanged).
- [ ] Round-trip property test in `src/lib/serialize.test.ts` (NEW): for a generated grid of tasks (each field present/absent × dates in {now−1, now, now+1, now+30d, now−370d, now+370d} × times × recurrences from the grammar), `parse(text, now, revertedRanges)` reproduces every field and the exact title. `Recurrence.byMonthDay` is excluded from the domain (no grammar form exists; serializer ignores it).
- [ ] Typecheck/lint passes.

### US-104: Extract controlled `ParsedInput` from CommandBar (no behavior change)
**Description:** As a developer, I want the parse/mirror/revert input extracted into one shared component so that add and edit cannot drift apart.

**Acceptance Criteria:**
- [ ] New file `src/components/ParsedInput.tsx` (NEW) owning: the transparent input + chip-mirror overlay (`mirrorSegments`), live re-parse, revert state (relocated `applyReverts` logic now passing reverted ranges into `parse`), and the ARIA chip announcement.
- [ ] Controlled contract: `value`, `onChange`, `onSubmit(result: ParseResult)`, `onCancel?`, `parseEnabled`, `initialReverts?`, `now?`, `inputRef?`, `onKeyDown?` (caller-first; returning true consumes the key), `inputProps?`, `ariaLabel`.
- [ ] `CommandBar` renders `ParsedInput` for the capture path; command mode (`>`), its list ARIA (`aria-activedescendant`, `aria-controls`), `barRef` attachment, and `useKeymap` typeahead via `setBarText` all still work.
- [ ] Chip CSS moves from `src/components/CommandBar.css` to a shared stylesheet `src/components/ParsedInput.css` (NEW); rendered chip appearance is unchanged (visual gate diff within tolerance).
- [ ] All existing tests in `src/components/CommandBar.test.tsx` pass (updated imports only, not behavior); new `src/components/ParsedInput.test.tsx` (NEW) covers chips render, Esc revert, submit, and announcement text.
- [ ] e2e `e2e/states-commandbar.spec.ts` and `e2e/states-commandmode.spec.ts` pass unmodified.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser: `bash verification/run-visual-gate.sh /` passes (screenshot diff within tolerance, 0 axe violations).

### US-105: Sealed displacement, session chips, and Esc two-tier in `ParsedInput`
**Description:** As a user, I want a newly typed token to overwrite the same-kind chip to its left — without ever losing text to half-typed words — so that correcting metadata is one gesture.

**Acceptance Criteria:**
- [ ] While a displacing token is unsealed (not followed by whitespace and field not submitted), the displaced range renders demoted (plain text); nothing is deleted from `value`.
- [ ] Typing `satchel` character-by-character into a field with an existing date chip never removes that chip's text; the chip re-activates when `sat` stops being the parse.
- [ ] When the displacing token seals (space typed after it, or submit), the displaced range is removed from `value` via `onChange`; the seam collapses to a single space; trailing/leading trim happens only in the extracted title, never in the live field.
- [ ] Caret rule: removals left of the caret shift the caret offset down by the removed length (visually stationary); removals right of the caret leave it untouched.
- [ ] Fixpoint: immediately after a displacement removal, re-parse with the same reverted ranges yields `displaced: []` (asserted in component tests).
- [ ] Session chip defined as: a chip whose `(kind, parsed value)` pair is absent from the baseline `ParseResult` of the mount-time value with `initialReverts`. Esc with ≥1 session chip reverts the most recent one; Esc with none calls `onCancel`.
- [ ] In `CommandBar` (no `onCancel` change): Esc behavior for chips is unchanged from the user's perspective; submit on Enter removes any unsealed-displaced ranges before capture.
- [ ] Component tests in `src/components/ParsedInput.test.tsx` cover: seal-on-space, seal-on-submit, transient prefix (satchel), caret offset both sides, fixpoint, session-chip discrimination (in-place `friday`→`monday` is revertible; untouched baseline chip is not).
- [ ] Typecheck/lint passes.
- [ ] Verify in browser: `bash verification/run-visual-gate.sh /` passes (screenshot diff within tolerance, 0 axe violations).

### US-106: TaskRow edit integration — serialize, frozen clock, diff-save, fallback
**Description:** As a user, I want to press Enter (or click a title) and edit the whole task as text so that changing a date or list is as fast as typing it.

**Acceptance Criteria:**
- [ ] `openEdit()` (open tasks only) seeds draft state from `serializeTask(task, now)` — `value` = text, `initialReverts` = revertedRanges — and freezes `now` for the session (passed as the `now` prop; every re-parse and the save-parse use it).
- [ ] Round-trip guard at open: if `parse(text, now, revertedRanges)` does not reproduce the task's fields exactly, log a console error and fall back to title-only editing (current behavior: plain value = `task.title`, `parseEnabled` = false; save updates title only).
- [ ] Save (Enter or blur) diffs the `ParseResult` against the task and dispatches a single `edit` action containing every changed field, with `null` for cleared ones (erasing `#work` text → `list: null`).
- [ ] Blur saves exactly like Enter; blur with an empty extracted title cancels instead of saving; Enter with an empty extracted title blocks save with the same inline feedback as add.
- [ ] Esc with no session chips cancels the edit (discard); with session chips it reverts per US-105.
- [ ] Toast for a parsed edit reads "Task updated" with the undo affordance; one undo restores all changed fields at once — unit test in `src/lib/store.test.ts` asserts a multi-field `edit` inverse (date + list + priority + title changed, then undone, including null-clears).
- [ ] If the task id no longer exists at save time (multi-tab deletion), the `edit` action is a no-op (existing reducer behavior; regression-tested).
- [ ] Tests in `src/components/TaskRow.test.tsx` cover: chips present at open, token edit saves all fields, deletion clears fields, fallback path, blur-save, empty-title blur-cancel, and done-task guard (Enter / title click on a done row does not open the editor — verifies FR-120).
- [ ] Typecheck/lint passes.
- [ ] Verify in browser: `bash verification/run-visual-gate.sh /` passes (screenshot diff within tolerance, 0 axe violations).

### US-107: Remove the overflow menu; keyboard-first row
**Description:** As a keyboard-first user, I want the `⋯` menu gone so that the row is clean and every mutation has a single, predictable path.

**Acceptance Criteria:**
- [ ] `src/components/TaskRow.tsx` no longer renders the `⋯` button or `role="menu"`; `menuOpen` state is deleted.
- [ ] `task-row-overflow*` and `task-row-menu*` CSS rules are deleted from `src/components/TaskList.css` (where they live today); `grep -rn "task-row-overflow\|task-row-menu" src/` returns nothing.
- [ ] Snooze via keys `1`/`2`/`3` still works (existing keymap untouched); the `?` cheatsheet rows for snooze keys are unchanged (already present in `src/components/Cheatsheet.tsx`).
- [ ] Overflow-menu tests are deleted from `src/components/TaskRow.test.tsx`; `e2e/states-snooze.spec.ts` is rewritten to exercise keyboard snooze only.
- [ ] Mouse paths that remain: checkbox completes, title click opens edit — both still covered by tests.
- [ ] Zero axe violations on the task list after removal.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser: `bash verification/run-visual-gate.sh /` passes (screenshot diff within tolerance, 0 axe violations).

### US-108: E2E journeys and visual baseline update
**Description:** As a maintainer, I want end-to-end proof of the edit/add symmetry so that regressions in the full flow are caught.

**Acceptance Criteria:**
- [ ] New `e2e/edit-tokens.spec.ts` (NEW): create "Send report friday 3pm #work" → Enter to edit → field shows serialized text with chips → type ` monday ` (friday's text disappears after seal) → erase `#work` → Enter → row shows Monday and no list → ⌘Z restores date and list together.
- [ ] Add-bar journey in the same spec: type "call mom friday monday" → only a Monday chip remains after seal → Enter → task due Monday.
- [ ] Edit-fallback journey is NOT e2e-tested (requires injecting a serializer bug); covered at unit level (US-106).
- [ ] Visual gate passes: `bash verification/run-visual-gate.sh /` with baselines updated for (a) the row without `⋯` and (b) a new edit-mode-open state at 375/768/1280; new baselines rendered and visually confirmed against `DESIGN-SYSTEM.md` before blessing.
- [ ] Zero axe violations at every configured breakpoint; Lighthouse meets `lens.config.json` thresholds.
- [ ] Full suite green: typecheck, lint, unit, e2e.

## 4. Functional Requirements

**Parser**
- FR-101: `parse` shall accept an optional third argument `reverted: Array<{start, end}>`; characters inside reverted ranges shall match no token.
- FR-102: `parse` shall keep the **last** token of each kind (date, time, list, priority, recurrence) and report each superseded earlier same-kind token's range in `ParseResult.displaced`. Displaced ranges shall be excluded from `ParseResult.title`, exactly like chip ranges. This supersedes FR-9 of `tasks/prd-command-bar-todo.md`.
- FR-103: Displacement shall be computed on pre-merge tokens: a later bare time displaces only the earlier time token, not a merged date+time chip's date.
- FR-104: `parse` shall accept explicit-year dates (`jun 3 2026`, `3 jun 2026`), parsing to that exact date with no roll-forward, for years 1970–2100.
- FR-105: All other grammar (anchored dates, `yesterday`/`today`/`tomorrow`, times, `#list` ≤32 word chars, `!p1`-`!p3`, recurrence forms) shall be unchanged.

**Serializer**
- FR-106: `serializeTask(task, now)` shall emit tokens in the order: title, date, time, recurrence, list, priority, single-space separated.
- FR-107: Date emission shall be `yesterday`/`today`/`tomorrow` for now−1/now/now+1, `<mon> <day>` within the next 12 months, `<mon> <day> <year>` otherwise.
- FR-108: `serializeTask` shall return `revertedRanges` covering every title substring that would otherwise parse as a token.
- FR-109: For every task expressible by the grammar (excluding `Recurrence.byMonthDay`, which the serializer ignores), `parse(serializeTask(t, now).text, now, .revertedRanges)` shall reproduce all five token fields and the exact title.

**ParsedInput**
- FR-110: `ParsedInput` shall be controlled (`value`/`onChange`) and shall expose `onSubmit`, `onCancel`, `parseEnabled`, `initialReverts`, `now`, `inputRef`, `onKeyDown` (caller-first interception), `inputProps`, `ariaLabel`.
- FR-111: Displaced text shall be removed from the field only when the displacing token seals (followed by whitespace, or on submit); until sealed, the displaced range shall render as plain text and shall be restored intact if the displacing parse disappears.
- FR-112: On displacement removal, whitespace at the seam shall collapse to a single space; the live field shall never be trimmed; caret offset shall decrease by the removed length when the removal is left of the caret and be unchanged otherwise.
- FR-113: After a displacement removal, re-parsing the new value with the same reverted ranges shall yield zero displaced ranges (fixpoint).
- FR-114: Esc shall revert the most recent *session chip* — a chip whose (kind, parsed value) is absent from the mount-time baseline parse — to literal text; Esc with no session chips shall invoke `onCancel`.
- FR-115: The chip ARIA announcement (`aria-describedby` live region) shall function identically in both add and edit usages.

**Edit flow**
- FR-116: Opening edit on an open task shall seed the field from `serializeTask` with reverted ranges applied and `now` frozen for the session.
- FR-117: If the open-time round-trip check fails, the editor shall fall back to title-only mode (`parseEnabled` false, value = raw title, save changes title only) and log a console error.
- FR-118: Save shall dispatch one `edit` action containing every field whose parsed value differs from the task, using `null` for cleared fields; the action's inverse shall restore all of them in one undo.
- FR-119: Enter and blur shall both save; blur with an empty extracted title shall cancel; Enter with an empty extracted title shall block with inline feedback.
- FR-120: Done tasks shall remain non-editable.

**Row / menu**
- FR-121: The `⋯` overflow button, its menu, its state, and its CSS shall be removed; snooze shall be reachable via keys `1`/`2`/`3` only.
- FR-122: Checkbox-complete and title-click-to-edit mouse paths shall remain.

## 5. Non-Goals (Out of Scope)

1. New token kinds or grammar beyond explicit-year dates (no `byMonthDay` recurrence form, no time ranges, no multi-list).
2. Editing done tasks (rows stay read-only after completion).
3. Any pointer-only replacement for the removed menu (no clickable chips, date pickers, or context menus) — keyboard-first by deliberate choice.
4. Changes to snooze targets, keymap priorities, command mode, or the undo stack design.
5. Persistence/schema changes (`schemaVersion` stays 1).
6. Mobile/touch-specific edit affordances.

## 6. Design Considerations

- Chip visuals, colors, and the mirror technique are reused exactly from the command bar; tokens come from `DESIGN-SYSTEM.md` (contract names — deviation is halt-and-propose).
- The edit row keeps its current height; chips render at row width using the same width-agnostic mirror.
- Demoted (unsealed-displaced) text renders as plain text — visually identical to non-token words.
- Narrowed interaction principle, stated deliberately: keyboard is the primary path; mouse covers complete, open-edit, and select.

## 7. Technical Considerations

- **Contract supersession (for `/ql-plan`):** quantum.json `contracts` pin first-wins parsing and `ParseResult` without `displaced`; the plan stage must update the `parse_result` shape (add `displaced`) and the parsing-rule contract to last-wins-with-displacement, and rewrite affected FR-9-derived ACs — not work around them.
- `ParsedInput` must stay controlled: `useKeymap` typeahead appends via `setBarText` (`src/App.tsx`), `barRef` must attach to the real `<input>` (`src/hooks/useKeymap.ts`), and command mode sets combobox ARIA on the input (`src/components/CommandBar.tsx`).
- All parsing/serialization is clock-injected (`now` parameter); no module reads the real clock.
- No new runtime dependencies.
- **Story-density note for `/ql-plan`:** US-106 is the densest story; carve the `src/lib/store.test.ts` multi-field-inverse AC into its own task (it has no UI dependency) so the TaskRow work stays comfortably inside one context window.

## 8. Success Metrics

- Changing a task's due date via edit takes ≤ 3 seconds / ≤ 8 keystrokes (Enter, type `monday `, Enter) — covered by the e2e journey.
- Round-trip property suite passes over the full generated grid (0 failures).
- 0 occurrences of `task-row-overflow|task-row-menu` in `src/` after US-107.
- All gates green: typecheck, lint, unit (≥80% coverage), e2e, visual gate (diff within tolerance, 0 axe violations, Lighthouse ≥ thresholds).

## 9. Open Questions

None at this time.

## Risks (carried from brainstorm handoff)

- Extracting from `CommandBar` — the app's most polished component — risks regressions; mitigated by US-104's "no behavior change" gate (existing unit + e2e pass unmodified) before new behavior lands in US-105.
- Chip mirror at row width is new rendering territory; visual gate baselines are looked at before blessing.
- Last-wins supersedes a recorded quantum.json contract and FR-9 tests; handled explicitly at plan stage (Technical Considerations).
- Missing explicit-year parsing would silently rewrite past due dates on edit; US-101 lands before US-103's round-trip property, which would catch it.
- Menu removal drops the only pointer path to snooze — accepted, principle narrowed explicitly (Non-Goal 3).

## Lifecycle Checklist

- **First-run behavior:** No onboarding needed; edit opens pre-filled from existing task data. Empty field cannot save (FR-119).
- **Returning-user behavior:** No persisted state changes; tasks created under first-wins parse identically at edit-open (serializer emits canonical text regardless of original input).
- **Update behavior:** No schema migration (`schemaVersion` 1). Behavior change (first-wins → last-wins) is documented as FR-102 supersession; no stored data is affected.
- **Error recovery:** Round-trip mismatch at open → title-only fallback + console error (FR-117); task deleted mid-edit → no-op save (US-106); empty title → blocked/cancelled (FR-119).
- **No-data/empty state:** N/A beyond empty-title handling — the editor always opens on an existing task.
- **Uninstall/disable:** N/A — core behavior, not a toggleable feature; removing it would be a code revert with no data cleanup (no new persisted state).

## Next Steps

Run `/quantum-loop:plan` to convert this PRD into quantum.json stories/tasks with the contract updates noted in §7.
