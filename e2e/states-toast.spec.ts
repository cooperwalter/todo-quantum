import { test, expect } from './fixtures';

const FREEZE =
  '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';

const BREAKPOINTS: [string, number][] = [
  ['mobile', 375],
  ['tablet', 768],
  ['desktop', 1280],
];

for (const [name, width] of BREAKPOINTS) {
  test(`visible toast after a capture @ ${name}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/', { waitUntil: 'networkidle' });
    const input = page.getByRole('textbox', { name: 'Capture a task' });
    await input.fill('Write the morning notes');
    await input.press('Enter');
    await expect(page.locator('.toast')).toBeVisible();
    await expect(page.locator('.toast-message')).toHaveText('Captured');
    await page.addStyleTag({ content: FREEZE });
    await expect(page).toHaveScreenshot(`toast-visible-${name}.png`, {
      fullPage: true,
      animations: 'disabled',
    });
  });
}

test('toast Undo click reverses the capture and shows Undone', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  const input = page.getByRole('textbox', { name: 'Capture a task' });
  await input.fill('Disposable task');
  await input.press('Enter');
  await expect(page.locator('.task-row')).toHaveCount(1);
  await page.locator('.toast-undo').click();
  await expect(page.locator('.task-row')).toHaveCount(0);
  await expect(page.locator('.toast-message')).toHaveText('Undone');
});

test('toast region is an aria-live polite landmark', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('.toast-region')).toHaveAttribute('aria-live', 'polite');
});
