import { test as base, expect, type Page } from '@playwright/test';

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

// Block until the document's web fonts have finished loading. Screenshots taken
// before this resolves can capture a system-font fallback flash, which the
// visual gate would then bless as the baseline. Returns undefined (not the
// FontFaceSet) so the value is serializable across the evaluate boundary.
export async function waitForFonts(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

export const test = base.extend({
  // Playwright names this callback `use`; that trips react-hooks/rules-of-hooks
  // (it pattern-matches hook names), so it is bound as `provide` here.
  page: async ({ page }, provide) => {
    await page.clock.setFixedTime(FIXED_NOW);

    // Make every navigation wait for fonts transparently, so each consumer
    // (visual.spec, a11y.spec, and all e2e state specs) inherits the wait
    // without a per-spec edit. The wrapper keeps page.goto's signature.
    const originalGoto = page.goto.bind(page);
    page.goto = (async (url: string, options?: Parameters<typeof originalGoto>[1]) => {
      const response = await originalGoto(url, options);
      await waitForFonts(page);
      return response;
    }) as typeof page.goto;

    await provide(page);
  },
});

export { expect };
