import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

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

// The app is gated behind a username (`todo-quantum.username`) and stores each
// user's list under `todo-quantum.v1.<username>`. Every spec that expects the
// todo UI is seeded with this name, so their fixtures write to
// `todo-quantum.v1.e2e`. The first-run gate itself is exercised by
// `firstRunTest`, which deliberately leaves the key unset.
export const E2E_USERNAME = 'e2e';
export const USERNAME_KEY = 'todo-quantum.username';

// The API sidecar is a real server with one shared database for the whole run,
// so a list pushed by one test would be pulled back down by the next one (same
// username = same row) and clobber its seed data. Each test therefore talks to
// the server as its own generated user: the request is real, the row is not
// shared. Only the server-side name is swapped — the browser keeps 'e2e', which
// is what the localStorage keys are built from.
async function isolateRemoteUser(context: BrowserContext): Promise<void> {
  const remoteUser = `e2e-${randomUUID().replace(/-/g, '').slice(0, 20)}`;
  await context.route(`**/api/users/${E2E_USERNAME}/data`, async (route) => {
    const url = new URL(route.request().url());
    url.pathname = `/api/users/${remoteUser}/data`;
    await route.continue({ url: url.toString() });
  });
}

function extendPage(seedUsername: boolean) {
  return base.extend({
    // Seeding hangs off the context, not the page, for two reasons: specs that
    // open a second tab (cross-tab sync) need the same username and the same
    // isolated server row in every tab, and a spec that destructures only
    // `context` never instantiates the `page` fixture at all.
    context: async ({ context }, provide) => {
      if (seedUsername) {
        await context.addInitScript(
          ([key, username]) => {
            window.localStorage.setItem(key, username);
          },
          [USERNAME_KEY, E2E_USERNAME],
        );
      }
      await isolateRemoteUser(context);
      await provide(context);
    },
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
}

export const test = extendPage(true);

// Same clock and font handling, but no seeded username: the app boots into the
// first-run username gate.
export const firstRunTest = extendPage(false);

export { expect };
