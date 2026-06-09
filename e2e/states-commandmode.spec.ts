import { test, expect } from '@playwright/test';

const BREAKPOINTS: [string, number][] = [
  ['mobile', 375],
  ['tablet', 768],
  ['desktop', 1280],
];

for (const [name, width] of BREAKPOINTS) {
  test(`command mode open state @ ${name}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/', { waitUntil: 'networkidle' });
    const input = page.getByRole('textbox', { name: 'Capture a task' });
    await input.fill('>');
    await expect(page.getByRole('listbox')).toBeVisible();
    await expect(page.getByRole('option')).toHaveCount(7);
    await page.addStyleTag({
      content:
        '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}',
    });
    await expect(page).toHaveScreenshot(`commandmode-open-${name}.png`, {
      fullPage: true,
      animations: 'disabled',
    });
  });
}

test('>tdy then Enter switches to Today and exits command mode', async ({ page }) => {
  await page.goto('/');
  const input = page.getByRole('textbox', { name: 'Capture a task' });
  await input.fill('>done');
  await input.press('Enter');
  await expect(page.locator('.view-tab[aria-current="page"]')).toHaveText(/Done/i);
  await input.fill('>tdy');
  await input.press('Enter');
  await expect(page.locator('.view-tab[aria-current="page"]')).toHaveText(/Today/i);
  await expect(input).toHaveValue('');
});

test('Esc exits command mode leaving an empty input', async ({ page }) => {
  await page.goto('/');
  const input = page.getByRole('textbox', { name: 'Capture a task' });
  await input.fill('>tod');
  await input.press('Escape');
  await expect(input).toHaveValue('');
  await expect(page.getByRole('listbox')).toHaveCount(0);
});
