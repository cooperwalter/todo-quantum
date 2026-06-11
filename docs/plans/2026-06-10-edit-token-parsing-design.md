# Design: Token Parsing in Edit (Edit/Add Symmetry)

**Date:** 2026-06-10
**Status:** Approved
**Approach:** Extract a shared `ParsedInput` component (Approach A)

**User intent (verbatim):** "when editing an existing todo, typing things like #atag and tomorrow, etc, should function like when adding a new todo"

**User clarification (verbatim, mid-brainstorm):** "adding a new chip should overwrite the related chip to its left"

**User clarification (verbatim, mid-brainstorm):** "Also, as part of this, we will remove the three dots menu. All changes will be made via the keyboard ideally"

**Ambiguity gate:** final score 13 (<20) after 1 round (5 questions + 1 unsolicited clarification), mode: normal — goal 9 / constraints 9 / criteria 8.

## Overview

We're making **edit fully symmetrical with add**: opening a task for inline edit reconstructs it as the text you would have typed — title plus its metadata rendered as live, highlighted chips (`Send report tomorrow 3pm #work !p1`) — and saving re-parses that text as the single source of truth. Whatever the field says, the task becomes.

The mechanism is an extraction, not a parallel implementation. The parse → chip-mirror → Esc-revert machinery currently living inside `CommandBar` becomes a shared `ParsedInput` component, used by both the command bar and `TaskRow`'s inline editor. A new pure serializer (`task → canonical text`) handles the reverse direction: dates render as `today`/`tomorrow` when near, otherwise absolute (`jun 12`); every serialized form is guaranteed to re-parse to the identical value (a property tested exhaustively).

One behavior change lands in **both** flows: **last-wins chip overwrite**. Typing a token whose kind already has a chip (a second date, a second `#list`) replaces the earlier chip and removes its text from the field, replacing today's first-token-wins rule. Deleting a chip's text in edit clears that field on save — WYSIWYG, including removal.

- **Problem solved:** today, edit is title-only plain text; changing a due date or list requires delete-and-recreate.
- **Decided:** round-trip text editing · relative-near/absolute-far date serialization · last-wins overwrite with old text removed, in add *and* edit · save re-parses, deletions clear fields · the `⋯` overflow menu is removed — task mutations are keyboard-first.
- **Out of scope:** new token kinds, multi-field form UI, editing completed tasks' metadata semantics beyond what edit already allows.

## User Experience

**Opening edit.** `Enter` on a selected row (or a single click on the title, as today) swaps the title for the parsed input, pre-filled with the serialized text — `Send report tomorrow 3pm #work !p1` — with every token already highlighted as a chip, caret at the end. The row grows no taller; chips render in the same mirror style as the command bar.

**Editing.** It behaves exactly like typing in the add bar: tokens chip up live as you type, with the same colors and the same ARIA announcement ("due Wed Jun 11, 3:00 PM, list #work…"). Typing a token whose kind already has a chip **overwrites it**: while the new token is still being typed, the old same-kind chip's text stays in the field but renders demoted (plain text); once the new token is **sealed** — followed by a space, or the field is submitted — the old text is removed (caret position preserved). The deferral matters because prefixes parse transiently: typing "satchel" passes through `sat` (a weekday); since nothing is deleted until the token seals, the date chip simply resumes when `satchel` stops parsing — no data loss. Deleting chip text by hand works too — erase `#work` and the task will simply have no list.

**Saving & canceling.** `Enter` re-parses the field and saves; the toast reads "Task updated — Undo (⌘Z)" and one undo restores *all* fields at once. An empty title after chip extraction blocks save with the same inline feedback as add. `Esc` follows a two-tier rule: if a *session chip* exists, `Esc` reverts the most recent one to literal text (identical muscle memory to add — mistyped tokens get fixed the same way everywhere); otherwise `Esc` cancels the edit, discarding changes. A **session chip** is defined deterministically: a chip whose `(kind, parsed value)` pair is absent from the baseline `ParseResult` computed from `initialValue` at edit open — so editing `friday` into `monday` in place produces a session chip, while untouched pre-existing chips are not Esc-revertible (their text is right there to edit). Blur saves, exactly as Enter does (today's save-on-blur behavior, kept deliberately — undo reverses any accidental commit).

**Add flow change.** The only visible difference in the command bar: a second same-kind token now replaces the first instead of staying literal.

**Overflow menu removed.** The `⋯` button and its snooze menu disappear from `TaskRow`; task mutations become keyboard-first. Snooze is keys `1`/`2`/`3` only (tomorrow / next week / weekend), documented in the `?` cheatsheet. Mouse still completes via the checkbox and opens edit via title click; rescheduling from there requires typing. This **explicitly narrows** the prior design's "keyboard is the fast path, not the only path" principle: after menu removal, snooze/reschedule has no pointer-only path, by deliberate choice — the principle becomes "keyboard is the primary path; mouse covers complete, open-edit, and select." It also supersedes the original command-bar design's "hover reveals … a snooze/overflow menu" line for v1.

## Data Model

**No schema changes.** `Task` already holds every field a token can set (`dueDate`, `dueTime`, `list`, `priority`, `recurrence`), the store's `edit` action already accepts `Partial<Task>`, and persistence is untouched. `schemaVersion` stays at 1.

What's new is two pure contracts in `src/lib/`:

```ts
// serialize.ts — the reverse of parse()
function serializeTask(task: Task, now: Date): string;
// "Send report tomorrow 3pm #work !p1"
```

Serialization rules: title first, then date (`today`/`tomorrow` when the due date is now±1 day, else `jun 12` — with year handled by the parser's roll-forward rule), time (`3pm` / `3:30pm`), recurrence (`every monday`, `every 2 weeks`), list (`#work`), priority (`!p1`). **Round-trip invariant:** for every task, `parse(serializeTask(task, now), now)` yields exactly the task's field values and a title equal to the original — this is the contract unit tests enforce property-style across dates, times, and recurrences.

```ts
// parser.ts — parse() gains an exclusion input, ParseResult gains one field
function parse(input: string, now: Date, reverted?: Range[]): ParseResult;

interface ParseResult {
  // ...existing: title, dueDate, dueTime, list, priority, recurrence, chips[]
  displaced: Array<{ start: number; end: number }>;  // ranges of same-kind
}                                                    // tokens overwritten by a later one
```

The parser becomes last-wins internally: it scans all token occurrences, keeps the **last** of each kind, and reports earlier same-kind matches as `displaced` so the input component can delete that text once the newer token seals. Two precision rules close the gaps the naive version has:

1. **Reverted ranges move into `parse()`.** Today `applyReverts()` post-processes the result; that ordering would let last-wins displace a *demoted literal* title word (typing `friday` into "Email #invoices tomorrow" must never delete "tomorrow"). Instead, `ParsedInput` passes its reverted ranges in, and the parser never matches tokens inside them — reverted text can be neither chipped nor displaced. `CommandBar`'s revert behavior is unchanged, just relocated.
2. **Displacement operates on pre-merge tokens, not merged chips.** Date+time still merge into one display chip, but last-wins compares token kinds before merging: typing a second bare time (`4pm` against "tomorrow 3pm") displaces only the old time's range, leaving the date intact.

Parser stays deterministic and clock-injected; `Chip` is unchanged. The edit save dispatches one `edit` action carrying all changed fields, so the existing inverse-action undo machinery gives whole-edit undo for free.

**Contract supersession (for the plan stage):** quantum.json's `contracts` currently pin *first-wins per kind*, and FR-9 acceptance tests assert it. Per CLAUDE.md, contract deviation is halt-and-propose — this design **is** that proposal: `/ql-plan` must update the contract to last-wins-with-displacement and the spec must rewrite the affected FR-9 criteria, not work around them.

## Architecture

**Pure core (`src/lib/`):**
- `parser.ts` — last-wins scan + `displaced` ranges (see Data Model). All existing exports keep their signatures.
- `serialize.ts` — new; `serializeTask(task, now)`. Imports only `types.ts` and the parser's display helpers. No React.

**New shared component — `src/components/ParsedInput.tsx`.** The machinery currently inline in `CommandBar` moves here: the transparent `<input>` + chip mirror overlay (`mirrorSegments`), live re-parse on change (`useMemo`), the revert-ranges state and `applyReverts()`, ARIA announcement wiring, and — new — the displaced-text deletion (when a parse returns `displaced` ranges, rewrite the value with those ranges removed, preserving caret position). Its props make the two callers thin:

`ParsedInput` is a **controlled** component — the command bar's value is shared state that `useKeymap` mutates externally (typeahead appends via `setBarText`), the keymap needs a ref to the real `<input>` (`barRef`), and command mode intercepts keys and sets combobox ARIA on the input. The props reflect that:

```ts
interface ParsedInputProps {
  value: string;
  onChange(value: string): void;        // displaced-removal rewrites also flow through this
  onSubmit(result: ParseResult): void;
  onCancel?(): void;                    // edit: Esc with no session chips
  parseEnabled: boolean;                // CommandBar disables in '>' command mode
  initialReverts?: Range[];             // edit: literal title words from the serializer
  now?: Date;                           // edit: frozen at open; default = live clock
  inputRef?: Ref<HTMLInputElement>;     // CommandBar passes barRef
  onKeyDown?(e: KeyboardEvent): boolean;// caller-first interception (command mode);
                                        // returning true consumes the key
  inputProps?: AriaInputProps;          // aria-activedescendant etc. in command mode
  ariaLabel: string;
}
```

**Callers.** `CommandBar` keeps ownership of command mode (`>` prefix), its value state, clearing-after-capture, and global focus; it renders `ParsedInput` for the capture path with `onKeyDown` handling command-mode keys first. `TaskRow` replaces its plain edit `<input>` with local draft state: `openEdit()` seeds the draft from `serializeTask(task, now)` and `initialReverts` from the serializer's literal-token ranges; `onSubmit` diffs the `ParseResult` against the task and dispatches a single `edit` action with every changed field (including `null` for cleared ones). The Esc two-tier rule lives in `ParsedInput` (it computes session chips against the baseline parse of the value at mount), with `onCancel` as the fall-through.

**Keyboard.** No keymap-priority changes — inline-edit already outranks list navigation in `useKeymap`; `ParsedInput` handles only its own keys. CSS: chip styles move from `CommandBar.css` into a shared stylesheet; row-width layout reuses the same mirror technique, which is width-agnostic.

**Overflow-menu removal.** `TaskRow` deletes the `menuOpen` state, the `⋯` button, the `role="menu"` markup, and the `task-row-overflow*` / `task-row-menu*` CSS rules. Snooze dispatching via keys `1`/`2`/`3` is untouched.

## Edge Cases & Error Handling

**Literal token words in titles.** A task titled "Plan tomorrow's standup" (the word demoted via Esc at capture) must not re-chip when edit opens — that would silently move its due date. The serializer therefore returns the ranges inside the title that *would* parse as tokens, and `ParsedInput` accepts them as initial reverted ranges (the same mechanism Esc-demotion already uses). Round-trip stays lossless even for adversarial titles like "Email #invoices tomorrow".

**Past due dates.** The parser rolls dates forward ("jun 3" → next year), so a rolled-over task due June 3 would round-trip to the wrong year. Fix: the parser gains explicit-year support (`jun 3 2026`), and the serializer emits the year whenever the date isn't in the next 12 months (and `yesterday` for now−1, matching the relative rule).

**Midnight boundary.** `ParsedInput` captures `now` once when edit opens and uses it for every re-parse in that session, so "tomorrow" can't shift meaning mid-edit. Saving re-parses with that same `now`.

**Transient prefix parses.** Weekday prefixes (`mon`, `sat`, `fri`) and words like "monthly" momentarily parse as tokens mid-word. The sealing rule (UX §Editing) makes this harmless: displacement removal only commits when the newer token is followed by a space or the field is submitted; until then the displaced text merely renders demoted and is restored the instant the transient parse disappears. Nothing is ever deleted on a keystroke that could un-parse on the next one.

**Displaced-text removal.** Deleting an overwritten chip's range collapses the leftover double space. Caret rule: when the removed range is *left of* the caret, the caret offset shifts down by the removed length so it stays visually stationary; removals right of the caret need no adjustment. The rewrite must be a fixpoint: after removal, re-parse (with the same reverted ranges) yields zero `displaced` ranges — asserted in tests.

**Inexpressible field values.** `Recurrence.byMonthDay` exists in the type but no token grammar can produce it, so it has no serialized form. The round-trip property's domain is explicitly *tasks expressible by the grammar*; `serializeTask` omits `byMonthDay` (it is currently unreachable via the UI). If a future grammar adds it, the property domain widens with it.

**Save-time safety.** Empty title after extraction blocks save (same inline feedback as add); a blur while the title is empty cancels instead of saving (can't commit a nameless task by clicking away). If the task was deleted by another tab mid-edit, the `edit` action on a missing id stays a no-op. Blur otherwise saves, same as Enter (today's behavior, kept).

## Testing Strategy

**Unit tests (Vitest — the bulk, all clock-injected).**

- `serialize.ts` — the round-trip property as a sweep: for a grid of tasks (every field combination × dates spanning today/tomorrow/yesterday/next-week/past-year/next-year × times × recurrences), assert `parse(serializeTask(t, now), now)` reproduces every field and the exact title. Plus the literal-token cases: "Plan tomorrow's standup" serializes with reverted ranges covering "tomorrow".
- `parser.ts` — last-wins: "pay rent friday monday" dates to Monday with Friday's range in `displaced`; same for duplicate `#list`/`!p`/recurrence; pre-merge displacement (second bare time displaces only the old time range, date survives); reverted ranges are unmatchable (neither chipped nor displaced); explicit-year dates ("jun 3 2026" parses to the past, no roll-forward); regression: all existing first-wins tests updated to the new rule, ambiguity anchors unchanged.
- `store.ts` — a multi-field `edit` action round-trips through undo: one ⌘Z restores date, list, priority, and title together; clearing fields (`null`) is also inverted correctly.

**Component tests (Vitest + Testing Library).** `ParsedInput` in isolation: displacement defers until the token seals (typing "satchel" character-by-character never deletes the existing date chip's text; typing "monday " removes it on the space); displaced-text removal rewrites value and preserves caret per the offset rule; rewrite fixpoint (no `displaced` after rewrite, same reverted ranges); Esc two-tier driven by the session-chip definition (in-place `friday`→`monday` edit is revertible, untouched baseline chips are not, Esc with no session chips cancels); initial reverted ranges suppress both chipping and displacement ("Email #invoices tomorrow" + typed `friday` keeps the literal "tomorrow"); blur saves, blur with empty title cancels.

**E2E (Playwright, thin).** One journey: create "Send report friday 3pm #work", Enter to edit, type "monday" (friday's text disappears), erase "#work", Enter — row shows Monday, no list; ⌘Z restores both. Second journey: add-bar overwrite ("friday monday" → Monday chip only).

**Visual gate (Pixel Law).** Edit is UI: `bash verification/run-visual-gate.sh /` with an edit-mode-open state added to the baseline set — chips in a row-width editor get looked at before blessing; axe must stay at zero (the mirror input's ARIA carries over). The task-row baseline also updates for the removed `⋯` affordance, and existing e2e/unit tests that exercise the overflow menu are deleted alongside it (keyboard snooze coverage via `1`/`2`/`3` already exists and remains the contract).

## Rejected Alternatives

- **Approach B — edit in the command bar** (load serialized task text into the main bar in an "editing" state): rejected because eyes jump from the row to the top of the screen, it breaks the approved inline-edit model, and it blocks quick capture while editing.
- **Approach C — parse-on-save only, no chips in edit**: rejected because it gives no live feedback, leaves existing metadata invisible/uneditable, and contradicts the round-trip decision.
- **First-token-wins retained in add** (edit-only overwrite): rejected for symmetry — one parsing behavior everywhere.
- **Demote overwritten chip text to literal title words** (instead of removing it): rejected — titles would accumulate junk words; removal keeps the field WYSIWYG.
- **Deletion never clears fields**: rejected — breaks field-text-is-the-truth.

## Design Review

An advisory spec-reviewer pass (design-review mode) ran post-approval and surfaced 11 findings (2 critical, 3 major, 6 minor) — persisted to `.handoffs/design-review-findings.json`. All were resolved in this document: displacement now defers until the new token seals (fixes transient-prefix data loss); reverted ranges move into `parse()` so literal title words can never be displaced; blur behavior corrected to save-on-blur (user-confirmed; the draft had misread the current code); `ParsedInput` is specified as controlled with ref/keydown/ARIA passthrough; "session chip" got a deterministic definition; caret rule un-inverted; open-edit gesture fixed to single click; `byMonthDay` excluded from the round-trip domain; pre-merge displacement specified; first-wins contract supersession flagged for `/ql-plan`; the narrowed keyboard-first principle stated explicitly.

## Open Questions

- None blocking. Minor implementation latitude: exact whitespace-collapse rules during displaced-text removal, and whether `yesterday` vs `jun 9 2026` is emitted at exactly now−1 (design says `yesterday`).

## Next Steps

Run `/quantum-loop:spec` to generate a formal Product Requirements Document from this design.
