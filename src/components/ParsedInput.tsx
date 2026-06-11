import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import './ParsedInput.css';
import { parse } from '../lib/parser';
import type { Chip, ParseResult, Range } from '../lib/parser';

// The field auto-grows from one line up to this many lines, then scrolls.
const MAX_LINES = 5;

export interface ParsedInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (result: ParseResult) => void;
  onCancel?: () => void;
  parseEnabled: boolean;
  initialReverts?: Range[];
  now?: Date;
  inputRef?: React.Ref<HTMLTextAreaElement>;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => boolean;
  inputProps?: React.TextareaHTMLAttributes<HTMLTextAreaElement>;
  ariaLabel: string;
}

function announcementFor(chip: Chip): string {
  switch (chip.kind) {
    case 'date':
      return `due ${chip.display}`;
    case 'time':
      return `at ${chip.display}`;
    case 'list':
      return `list ${chip.display}`;
    case 'priority':
      return `priority ${chip.display}`;
    case 'recurrence':
      return `repeats ${chip.display}`;
  }
}

interface MirrorSegment {
  text: string;
  variant: 'plain' | 'chip' | 'demoted';
  key: string;
}

function mirrorSegments(input: string, chips: Chip[], demoted: Range[]): MirrorSegment[] {
  // Build a single left-to-right cut of the string. Chips and demoted (displaced)
  // ranges never overlap — chips are the active tokens, demoted ranges are earlier
  // same-kind occurrences the parser excluded from `chips`.
  const marks: Array<{ start: number; end: number; variant: 'chip' | 'demoted' }> = [
    ...chips.map((c) => ({ start: c.start, end: c.end, variant: 'chip' as const })),
    ...demoted.map((d) => ({ start: d.start, end: d.end, variant: 'demoted' as const })),
  ].sort((a, b) => a.start - b.start);

  const segments: MirrorSegment[] = [];
  let cursor = 0;
  for (const mark of marks) {
    if (mark.start > cursor) {
      segments.push({ text: input.slice(cursor, mark.start), variant: 'plain', key: `t${cursor}` });
    }
    segments.push({
      text: input.slice(mark.start, mark.end),
      variant: mark.variant,
      key: `${mark.variant === 'chip' ? 'c' : 'd'}${mark.start}`,
    });
    cursor = mark.end;
  }
  if (cursor < input.length) {
    segments.push({ text: input.slice(cursor), variant: 'plain', key: `t${cursor}` });
  }
  return segments;
}

// The displacing token of a displaced range is the active chip of the same kind.
// A displaced range is "sealed" when that displacing token is followed by a
// whitespace char in the live field (or submit is in progress). Determine the kind
// of a displaced range by parsing the slice in isolation against a fixed reference,
// then check whether the active chip of that kind is followed by whitespace.
function displacedKind(value: string, range: Range, now: Date): Chip['kind'] | null {
  const slice = value.slice(range.start, range.end);
  // Time-of-day tokens need a date in context to register as a time chip.
  const probe = parse(`${slice} monday`, now);
  return probe.chips[0]?.kind ?? null;
}

function sealedDisplaced(
  value: string,
  parsed: ParseResult,
  now: Date,
  submitting: boolean,
): Range[] {
  if (parsed.displaced.length === 0) return [];
  const sealed: Range[] = [];
  for (const range of parsed.displaced) {
    if (submitting) {
      sealed.push(range);
      continue;
    }
    const kind = displacedKind(value, range, now);
    // The displacing chip is the rightmost active chip of the matching kind.
    const active = parsed.chips
      .filter((c) => c.kind === kind)
      .sort((a, b) => a.start - b.start)
      .at(-1);
    if (active === undefined) continue;
    const after = value[active.end];
    if (after !== undefined && /\s/.test(after)) sealed.push(range);
  }
  return sealed;
}

interface Rewrite {
  value: string;
  caret: number;
}

// Remove the given ranges from `value`, collapsing each freed seam to a single
// space, and report where a caret previously at `caret` should land. Removals
// strictly left of the caret shift it down by their length; removals to the right
// leave it untouched. The live field is never trimmed.
function removeRanges(value: string, ranges: Range[], caret: number): Rewrite {
  const ordered = [...ranges].sort((a, b) => a.start - b.start);
  let out = '';
  let cursor = 0;
  let newCaret = caret;
  for (const r of ordered) {
    out += value.slice(cursor, r.start);
    // Decide whether to also swallow one adjacent whitespace char so the seam
    // collapses to a single space instead of leaving a double space or a leading
    // /trailing gap. Prefer eating the trailing whitespace (after the token).
    let removeStart = r.start;
    let removeEnd = r.end;
    const hasLeftSpace = r.start > 0 && /\s/.test(value[r.start - 1]);
    const hasRightSpace = r.end < value.length && /\s/.test(value[r.end]);
    if (hasRightSpace) {
      removeEnd = r.end + 1;
    } else if (hasLeftSpace) {
      // No trailing space (token at end of field) — eat the leading space so we
      // don't leave a dangling separator, but only if doing so won't trim a space
      // the user is actively relying on. At end-of-field this collapses cleanly.
      out = out.slice(0, out.length - 1);
      removeStart = r.start - 1;
    }
    const removedLen = removeEnd - removeStart;
    if (removeEnd <= caret) {
      newCaret -= removedLen;
    } else if (removeStart < caret) {
      newCaret = removeStart;
    }
    cursor = removeEnd;
  }
  out += value.slice(cursor);
  if (newCaret < 0) newCaret = 0;
  if (newCaret > out.length) newCaret = out.length;
  return { value: out, caret: newCaret };
}

function assignForwardedRef(
  ref: React.Ref<HTMLTextAreaElement> | undefined,
  node: HTMLTextAreaElement | null,
): void {
  if (typeof ref === 'function') {
    ref(node);
  } else if (ref !== null && ref !== undefined) {
    (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = node;
  }
}

// Grow the textarea to fit its content, capped at MAX_LINES; beyond that it
// scrolls. Returns nothing — mutates the element's inline height/overflow.
function autosize(el: HTMLTextAreaElement): void {
  const style = window.getComputedStyle(el);
  const line = Number.parseFloat(style.lineHeight) || 0;
  const padding = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
  const maxHeight = line * MAX_LINES + padding;
  el.style.height = 'auto';
  const next = Math.min(el.scrollHeight, maxHeight);
  el.style.height = `${next}px`;
  el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
}

export function ParsedInput({
  value,
  onChange,
  onSubmit,
  onCancel,
  parseEnabled,
  initialReverts,
  now,
  inputRef,
  onKeyDown,
  inputProps,
  ariaLabel,
}: ParsedInputProps) {
  const [reverts, setReverts] = useState<Range[]>(initialReverts ?? []);

  // Baseline = the ParseResult of the mount-time value with initialReverts, captured
  // exactly once. A chip is a "session chip" iff its (kind, parsed value) pair is
  // absent from this baseline.
  const [baseline] = useState<ParseResult>(() =>
    parse(value, now ?? new Date(), parseEnabled ? (initialReverts ?? []) : []),
  );
  const baselineKeys = useMemo(
    () => new Set(baseline.chips.map((c) => `${c.kind}:${c.display}`)),
    [baseline],
  );

  const innerRef = useRef<HTMLTextAreaElement | null>(null);
  const mirrorRef = useRef<HTMLDivElement | null>(null);
  const pendingCaret = useRef<number | null>(null);
  // The caret offset captured from the user's edit BEFORE React's controlled
  // re-render writes `value` back (which resets the native selection to the end in
  // jsdom and some browsers). The seal effect uses this so the caret rule is applied
  // against where the caret actually was, not the post-render reset position.
  const editCaret = useRef<number | null>(null);

  const parsed = useMemo(
    () => parse(value, now ?? new Date(), parseEnabled ? reverts : []),
    [value, now, reverts, parseEnabled],
  );

  const sealed = useMemo(
    () => (parseEnabled ? sealedDisplaced(value, parsed, now ?? new Date(), false) : []),
    [value, parsed, now, parseEnabled],
  );

  // The displaced ranges still shown demoted in the field are the unsealed ones.
  const sealedSet = useMemo(
    () => new Set(sealed.map((r) => `${r.start}:${r.end}`)),
    [sealed],
  );
  const demoted = useMemo(
    () =>
      parseEnabled ? parsed.displaced.filter((r) => !sealedSet.has(`${r.start}:${r.end}`)) : [],
    [parsed, sealedSet, parseEnabled],
  );

  // When ranges seal (a space lands after the displacing token), rewrite the value:
  // delete the sealed displaced ranges, collapse seams, and reposition the caret.
  useLayoutEffect(() => {
    if (sealed.length === 0) return;
    const el = innerRef.current;
    const caret = editCaret.current ?? el?.selectionStart ?? value.length;
    editCaret.current = null;
    const { value: next, caret: nextCaret } = removeRanges(value, sealed, caret);
    if (next === value) return;
    pendingCaret.current = nextCaret;
    onChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sealed, value]);

  // Apply a pending caret position synchronously after the controlled update lands.
  useLayoutEffect(() => {
    if (pendingCaret.current === null) return;
    const el = innerRef.current;
    if (el !== null) {
      const pos = Math.min(pendingCaret.current, el.value.length);
      el.setSelectionRange(pos, pos);
    }
    pendingCaret.current = null;
  }, [value]);

  // Re-fit the field height whenever the text (and therefore its wrapped line
  // count) changes. The mirror is absolutely positioned over the field, so it
  // tracks the new height automatically.
  useLayoutEffect(() => {
    if (innerRef.current !== null) autosize(innerRef.current);
  }, [value]);

  // When the field scrolls (content taller than MAX_LINES), keep the colored
  // mirror in lockstep so chips stay aligned with the caret.
  function syncMirrorScroll(event: React.UIEvent<HTMLTextAreaElement>) {
    if (mirrorRef.current !== null) {
      mirrorRef.current.scrollTop = event.currentTarget.scrollTop;
    }
  }

  // Merge the caller-supplied ref (CommandBar focuses the bar through it) with the
  // internal ref the seal/caret effects need to read selection from the live node.
  const setInputRef = useCallback(
    (node: HTMLTextAreaElement | null): void => {
      innerRef.current = node;
      assignForwardedRef(inputRef, node);
    },
    [inputRef],
  );

  function handleChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = event.target.value;
    // Snapshot the caret from the live edit event before the controlled re-render
    // resets it, so the seal effect can honor the caret rule.
    editCaret.current = event.target.selectionStart;
    // Reverted ranges are scoped to the input they were reverted in — carrying
    // them across captures silently strips valid chips from later text.
    if (next === '') setReverts([]);
    onChange(next);
  }

  function sessionChips(): Chip[] {
    return parsed.chips.filter((c) => !baselineKeys.has(`${c.kind}:${c.display}`));
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    // The field is a textarea, but titles/captures are single-line: Enter always
    // means submit, never a newline. Suppress the default insertion up front so it
    // is prevented even when a consumer (command mode) handles the key below.
    if (event.key === 'Enter') event.preventDefault();

    // Caller-first: command mode (or any consumer) gets the key before the
    // capture path. Returning true means the consumer handled it.
    if (onKeyDown?.(event) === true) return;

    if (event.key === 'Enter') {
      // The submit is fully handled here — the document-level keymap must not see
      // the same keystroke (with focus handed back to the row it would re-open the
      // editor via its Enter-edits binding).
      event.stopPropagation();
      // Strip any remaining displaced ranges (sealed by submit) before the final
      // parse so the captured task never carries a half-overwritten token.
      const submitSealed = parseEnabled
        ? sealedDisplaced(value, parsed, now ?? new Date(), true)
        : [];
      if (submitSealed.length > 0) {
        const el = innerRef.current;
        const caret = el?.selectionStart ?? value.length;
        const { value: next } = removeRanges(value, submitSealed, caret);
        onChange(next);
        onSubmit(parse(next, now ?? new Date(), parseEnabled ? reverts : []));
      } else {
        onSubmit(parsed);
      }
      setReverts([]);
      return;
    }
    if (event.key === 'Escape') {
      const session = parseEnabled ? sessionChips() : [];
      if (session.length > 0) {
        event.preventDefault();
        event.stopPropagation();
        const last = [...session].sort((a, b) => a.start - b.start).at(-1)!;
        setReverts((prev) => [...prev, { start: last.start, end: last.end }]);
        return;
      }
      if (onCancel !== undefined) {
        // Cancelling is fully handled here; contain the keystroke for the same
        // reason as Enter (the keymap's Escape binding clears the selection the
        // caller just restored). With no onCancel (the bar), Escape falls through
        // so the keymap's bar-Escape behavior still works.
        event.preventDefault();
        event.stopPropagation();
        onCancel();
      }
    }
  }

  const chips = parseEnabled ? parsed.chips : [];
  const announcement = chips.map(announcementFor).join(', ');

  return (
    <>
      <div className="command-bar-field">
        <div className="command-bar-mirror" aria-hidden="true" ref={mirrorRef}>
          {mirrorSegments(value, chips, demoted).map((seg) => {
            if (seg.variant === 'chip') {
              return (
                <span key={seg.key} className="command-bar-chip">
                  {seg.text}
                </span>
              );
            }
            if (seg.variant === 'demoted') {
              return (
                <span key={seg.key} className="command-bar-demoted">
                  {seg.text}
                </span>
              );
            }
            return <span key={seg.key}>{seg.text}</span>;
          })}
        </div>
        <textarea
          ref={setInputRef}
          className="command-bar-input"
          rows={1}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onScroll={syncMirrorScroll}
          aria-label={ariaLabel}
          aria-describedby="command-bar-announcement"
          autoComplete="off"
          spellCheck={false}
          {...inputProps}
        />
      </div>
      <span id="command-bar-announcement" className="visually-hidden">
        {announcement}
      </span>
    </>
  );
}
