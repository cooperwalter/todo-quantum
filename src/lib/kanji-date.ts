// Bilingual masthead support: render a Date's local calendar date in kanji
// numerals (e.g. 六月十二日), from the same Date the English masthead formats.
// Timezone-naive on purpose — reads getMonth()/getDate(), matching src/lib/dates.ts.

const DIGITS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'] as const;

// Compose 1–31 in Japanese numerals: units direct, 十 for ten, 十X for the teens,
// and tens-digit + 十 (+ unit) for 20–31.
function kanjiNumeral(n: number): string {
  if (n <= 9) return DIGITS[n];
  if (n === 10) return '十';
  if (n < 20) return `十${DIGITS[n - 10]}`;
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return `${DIGITS[tens]}十${ones ? DIGITS[ones] : ''}`;
}

export function formatKanjiDate(d: Date): string {
  return `${kanjiNumeral(d.getMonth() + 1)}月${kanjiNumeral(d.getDate())}日`;
}
