// verification/visual.spec.ts
// Responsive visual-regression gate. Screenshots the target route at every breakpoint
// defined in lens.config.json, in every color scheme in lens.config.json visual.themes,
// and diffs against the approved baseline.
//
// First run (no baseline): Playwright writes baselines and the test "fails" — this is expected.
// INSPECT the generated PNGs against DESIGN-SYSTEM.md, then re-run to lock them in.
// Regenerate intentionally with:  npx playwright test verification/visual.spec.ts --update-snapshots
import { test, expect, waitForFonts } from '../e2e/fixtures';
import { readFileSync } from 'node:fs';
const cfg = JSON.parse(readFileSync(new URL('../lens.config.json', import.meta.url), 'utf8'));

const route = process.env.QL_ROUTE ?? '/';
const baseURL = process.env.QL_BASE_URL ?? cfg.baseUrl;
const breakpoints = cfg.visual.breakpoints as Record<string, number>;
const maxDiffRatio = cfg.visual.screenshotDiffMaxPixelRatio ?? 0.01;
const themes = (cfg.visual.themes as Array<'light' | 'dark'> | undefined) ?? ['light'];

for (const theme of themes) {
  // Light keeps the historic baseline filenames; dark gets a -dark suffix so the
  // two axes never collide and a light-only diff stays a clean rename-free addition.
  const suffix = theme === 'dark' ? '-dark' : '';
  for (const [name, width] of Object.entries(breakpoints)) {
    test(`visual: ${route} @ ${name} (${width}px) [${theme}]`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ width, height: 900 });
      await page.goto(new URL(route, baseURL).toString(), { waitUntil: 'networkidle' });
      await waitForFonts(page);
      // Freeze animations so diffs are deterministic, not flaky.
      await page.addStyleTag({
        content: `*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}`,
      });
      await expect(page).toHaveScreenshot(`${route.replace(/\W+/g, '_')}-${name}${suffix}.png`, {
        fullPage: true,
        maxDiffPixelRatio: maxDiffRatio,
        animations: 'disabled',
      });
    });
  }
}
