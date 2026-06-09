import { describe, expect, it } from 'vitest';
import { COMMANDS, fuzzyMatch, fuzzySubsequence } from './commands';

describe('command registry (FR-19)', () => {
  it('exposes exactly the seven v1 commands in palette order', () => {
    expect(COMMANDS.map((c) => c.id)).toEqual([
      'today', 'upcoming', 'all', 'done', 'undo', 'redo', 'help',
    ]);
  });

  it('runs view commands through ctx.setView', () => {
    const calls: string[] = [];
    const ctx = { setView: (v: string) => calls.push(v), dispatch: () => {}, openCheatsheet: () => {} };
    COMMANDS.find((c) => c.id === 'upcoming')?.run(ctx);
    expect(calls).toEqual(['upcoming']);
  });

  it('runs undo and redo through ctx.dispatch', () => {
    const calls: { type: string }[] = [];
    const ctx = { setView: () => {}, dispatch: (a: { type: string }) => calls.push(a), openCheatsheet: () => {} };
    COMMANDS.find((c) => c.id === 'undo')?.run(ctx);
    COMMANDS.find((c) => c.id === 'redo')?.run(ctx);
    expect(calls).toEqual([{ type: 'undo' }, { type: 'redo' }]);
  });

  it('runs help through ctx.openCheatsheet', () => {
    let opened = 0;
    const ctx = { setView: () => {}, dispatch: () => {}, openCheatsheet: () => { opened += 1; } };
    COMMANDS.find((c) => c.id === 'help')?.run(ctx);
    expect(opened).toBe(1);
  });
});

describe('fuzzySubsequence', () => {
  it("matches 'tdy' as a subsequence of 'today'", () => {
    expect(fuzzySubsequence('tdy', 'today')).toBe(true);
  });

  it('matches case-insensitively', () => {
    expect(fuzzySubsequence('TDY', 'today')).toBe(true);
    expect(fuzzySubsequence('tdy', 'TODAY')).toBe(true);
  });

  it('rejects a non-subsequence', () => {
    expect(fuzzySubsequence('tyx', 'today')).toBe(false);
  });

  it('rejects a query longer than the target', () => {
    expect(fuzzySubsequence('todayyy', 'today')).toBe(false);
  });

  it('matches an empty query against anything', () => {
    expect(fuzzySubsequence('', 'today')).toBe(true);
  });
});

describe('fuzzyMatch', () => {
  it('lists all commands for an empty query', () => {
    expect(fuzzyMatch('', COMMANDS)).toHaveLength(7);
  });

  it("returns only 'today' for the query 'tdy'", () => {
    expect(fuzzyMatch('tdy', COMMANDS).map((c) => c.id)).toEqual(['today']);
  });

  it('keeps registry order for multi-match queries (stable ranking)', () => {
    expect(fuzzyMatch('o', COMMANDS).map((c) => c.id)).toEqual([
      'today', 'upcoming', 'done', 'undo', 'redo',
    ]);
  });

  it('returns an empty list when nothing matches', () => {
    expect(fuzzyMatch('zzz', COMMANDS)).toEqual([]);
  });

  it('keeps unicode queries literal non-matches', () => {
    expect(fuzzyMatch('tödäy', COMMANDS)).toEqual([]);
  });
});
