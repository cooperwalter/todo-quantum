import { describe, it, expect } from 'vitest';
import { formatKanjiDate } from './kanji-date';

// Dates are constructed with local-time components (new Date(y, monthIndex, day)),
// mirroring src/lib/dates.ts — the formatter is timezone-naive and reads the local
// calendar date off the Date it is given.
describe('formatKanjiDate', () => {
  it('formats June 10 as 六月十日', () => {
    expect(formatKanjiDate(new Date(2026, 5, 10))).toBe('六月十日');
  });

  it('formats June 12 (frozen test clock date) as 六月十二日', () => {
    expect(formatKanjiDate(new Date(2026, 5, 12))).toBe('六月十二日');
  });

  it('formats December 31 as 十二月三十一日', () => {
    expect(formatKanjiDate(new Date(2026, 11, 31))).toBe('十二月三十一日');
  });

  it('formats January 1 as 一月一日', () => {
    expect(formatKanjiDate(new Date(2026, 0, 1))).toBe('一月一日');
  });

  it('formats October 20 as 十月二十日', () => {
    expect(formatKanjiDate(new Date(2026, 9, 20))).toBe('十月二十日');
  });

  it('formats November 11 (double-teen) as 十一月十一日', () => {
    expect(formatKanjiDate(new Date(2026, 10, 11))).toBe('十一月十一日');
  });

  it('formats February 2 as 二月二日', () => {
    expect(formatKanjiDate(new Date(2026, 1, 2))).toBe('二月二日');
  });

  it('formats a round-ten day (June 30) as 六月三十日', () => {
    expect(formatKanjiDate(new Date(2026, 5, 30))).toBe('六月三十日');
  });

  it('reads the local calendar date, not UTC', () => {
    // 23:30 local on the 10th stays the 10th regardless of the runner's offset.
    expect(formatKanjiDate(new Date(2026, 5, 10, 23, 30))).toBe('六月十日');
  });
});
