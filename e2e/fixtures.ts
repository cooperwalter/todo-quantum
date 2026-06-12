import { test as base, expect } from '@playwright/test';

// Every e2e and visual-gate run happens at this frozen instant — Wednesday noon,
// away from DST edges — so date-bearing screenshots (masthead, day labels,
// "since" annotations) never go stale when the suite runs across midnight.
// Only Date is fixed: clock.setFixedTime keeps timers real, so the app's
// debounced persistence and toast timeouts behave normally (clock.install
// would freeze them).
//
// Specs that compute seed dates or expected labels in NODE scope must use this
// same constant — the pinned clock only governs the browser's Date.
export const FIXED_NOW = new Date(2026, 5, 10, 12, 0, 0);

export const test = base.extend({
  // Playwright names this callback `use`; that trips react-hooks/rules-of-hooks
  // (it pattern-matches hook names), so it is bound as `provide` here.
  page: async ({ page }, provide) => {
    await page.clock.setFixedTime(FIXED_NOW);
    await provide(page);
  },
});

export { expect };
