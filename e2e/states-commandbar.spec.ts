import { test, expect } from '@playwright/test';

const CANONICAL = 'Send report tomorrow 3pm #work !p1';
const BREAKPOINTS: [string, number][] = [
  ['mobile', 375],
  ['tablet', 768],
  ['desktop', 1280],
];

for (const [name, width] of BREAKPOINTS) {
  test(`command bar with canonical chips state @ ${name}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/', { waitUntil: 'networkidle' });
    const input = page.getByRole('textbox', { name: 'Capture a task' });
    await input.fill(CANONICAL);
    await expect(page.locator('.command-bar-chip')).toHaveCount(3);
    await page.addStyleTag({
      content:
        '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}',
    });
    await expect(page).toHaveScreenshot(`commandbar-chips-${name}.png`, {
      fullPage: true,
      animations: 'disabled',
    });
  });
}

test('canonical string renders exactly three accent-underlined chips', async ({ page }) => {
  await page.goto('/');
  const input = page.getByRole('textbox', { name: 'Capture a task' });
  await input.fill(CANONICAL);
  const chips = page.locator('.command-bar-chip');
  await expect(chips).toHaveCount(3);
  await expect(chips.nth(0)).toHaveText('tomorrow 3pm');
  await expect(chips.nth(1)).toHaveText('#work');
  await expect(chips.nth(2)).toHaveText('!p1');
});

test('Enter captures, clears the bar, and keeps focus', async ({ page }) => {
  await page.goto('/');
  const input = page.getByRole('textbox', { name: 'Capture a task' });
  await input.fill(CANONICAL);
  await input.press('Enter');
  await expect(input).toHaveValue('');
  await expect(input).toBeFocused();
});
