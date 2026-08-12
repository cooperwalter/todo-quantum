import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

const BREAKPOINTS: [string, number][] = [
  ['mobile', 375],
  ['tablet', 768],
  ['desktop', 1280],
];

// The injected failure is a QuotaExceededError, so the banner must show the
// quota-specific copy (deep-review F-010: reason threading).
const BANNER_COPY =
  "Changes aren't being saved — this browser's storage is full. Delete done tasks or clear site data to free space.";

// `failureLimit` exists for the dismiss test: a save failure re-arms a 5s retry,
// so a storage that never recovers re-raises the banner moments after it is
// dismissed and the assertion becomes a race against that timer. Letting the
// retry succeed keeps the dismissal observable without weakening it.
const NEVER_RECOVERS = Number.MAX_SAFE_INTEGER;

function breakStorageWrites(page: Page, failureLimit: number = NEVER_RECOVERS) {
  return page.addInitScript((limit) => {
    let failures = 0;
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === 'todo-quantum.v1.e2e' && failures < limit) {
        failures += 1;
        throw new DOMException('quota exceeded', 'QuotaExceededError');
      }
      return original.call(this, key, value);
    };
  }, failureLimit);
}

const FREEZE =
  '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';

test('a failing save shows the danger banner and capture keeps working in memory', async ({ page }) => {
  await breakStorageWrites(page);
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.locator('.command-bar-input').fill('Quota test task');
  await page.locator('.command-bar-input').press('Enter');
  await expect(page.locator('.task-row-title')).toHaveText(['Quota test task']);
  await expect(page.locator('.storage-banner')).toHaveText(new RegExp(BANNER_COPY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  await page.locator('.command-bar-input').fill('Second in-memory task');
  await page.locator('.command-bar-input').press('Enter');
  await expect(page.locator('.task-row')).toHaveCount(2);
});

test('the banner dismiss button hides the banner', async ({ page }) => {
  await breakStorageWrites(page, 1);
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.locator('.command-bar-input').fill('Quota test task');
  await page.locator('.command-bar-input').press('Enter');
  await expect(page.locator('.storage-banner')).toBeVisible();
  await page.getByLabel('Dismiss storage warning').click();
  await expect(page.locator('.storage-banner')).toHaveCount(0);
});

test('a capture in one tab reloads the list and toasts in a second tab', async ({ context }) => {
  const pageA = await context.newPage();
  const pageB = await context.newPage();
  await pageA.goto('/', { waitUntil: 'networkidle' });
  await pageB.goto('/', { waitUntil: 'networkidle' });

  await pageA.locator('.command-bar-input').fill('Tab sync test');
  await pageA.locator('.command-bar-input').press('Enter');
  await expect(pageA.locator('.task-row-title')).toHaveText(['Tab sync test']);

  await expect(pageB.locator('.toast-message')).toHaveText('List updated in another tab');
  await expect(pageB.locator('.task-row-title')).toHaveText(['Tab sync test']);
});

test('a captured task survives a reload via the debounced save', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.locator('.command-bar-input').fill('Persisted task');
  await page.locator('.command-bar-input').press('Enter');
  await expect(page.locator('.task-row-title')).toHaveText(['Persisted task']);
  await page.waitForTimeout(400);
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('.task-row-title')).toHaveText(['Persisted task']);
});

for (const [name, width] of BREAKPOINTS) {
  test(`storage banner visible under the masthead @ ${name}`, async ({ page }) => {
    await breakStorageWrites(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.locator('.command-bar-input').fill('Quota test task');
    await page.locator('.command-bar-input').press('Enter');
    await expect(page.locator('.storage-banner')).toBeVisible();
    await page.addStyleTag({ content: FREEZE });
    await expect(page).toHaveScreenshot(`banner-visible-${name}.png`, {
      fullPage: true,
      animations: 'disabled',
    });
  });
}
