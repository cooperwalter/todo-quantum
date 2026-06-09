// verification/a11y.spec.ts
// Accessibility gate: runs axe-core against the target route at every breakpoint and
// fails on any violation (threshold from lens.config.json). Also asserts that a
// visible focus indicator exists for the first interactive element.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
const cfg = JSON.parse(readFileSync(new URL('../lens.config.json', import.meta.url), 'utf8'));

const route = process.env.QL_ROUTE ?? '/';
const baseURL = process.env.QL_BASE_URL ?? cfg.baseUrl;
const breakpoints = cfg.visual.breakpoints as Record<string, number>;
const maxViolations = cfg.visual.a11yMaxViolations ?? 0;

for (const [name, width] of Object.entries(breakpoints)) {
  test(`a11y: ${route} @ ${name}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(new URL(route, baseURL).toString(), { waitUntil: 'networkidle' });

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();

    if (results.violations.length > maxViolations) {
      console.log(JSON.stringify(
        results.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help })),
        null, 2,
      ));
    }
    expect(results.violations.length).toBeLessThanOrEqual(maxViolations);
  });
}

test(`a11y: ${route} keyboard focus is visible`, async ({ page }) => {
  await page.goto(new URL(route, baseURL).toString(), { waitUntil: 'networkidle' });
  await page.keyboard.press('Tab');
  const outline = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return null;
    const s = getComputedStyle(el);
    return { outlineWidth: s.outlineWidth, boxShadow: s.boxShadow };
  });
  expect(outline, 'an element should receive focus on Tab').not.toBeNull();
  const visible = outline && (parseFloat(outline.outlineWidth) > 0 || outline.boxShadow !== 'none');
  expect(visible, 'focused element must have a visible focus indicator').toBeTruthy();
});
