import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

const BREAKPOINTS: [string, number][] = [
  ['mobile', 375],
  ['tablet', 768],
  ['desktop', 1280],
];

function seedTasks(page: Page) {
  return page.addInitScript(() => {
    const base = {
      status: 'open',
      dueDate: null,
      dueTime: null,
      list: null,
      priority: null,
      recurrence: null,
      createdAt: '2026-06-01T08:00:00.000Z',
      completedAt: null,
    };
    window.localStorage.setItem(
      'todo-quantum.v1',
      JSON.stringify({
        schemaVersion: 1,
        tasks: [
          { ...base, id: 'seed-1', title: 'Send report', order: 1 },
          { ...base, id: 'seed-2', title: 'Dentist appointment', order: 2 },
          { ...base, id: 'seed-3', title: 'Draft report intro', order: 3 },
          {
            ...base,
            id: 'seed-done',
            title: 'Shipped feature',
            status: 'done',
            completedAt: '2026-06-08T10:00:00.000Z',
            order: 4,
          },
        ],
      }),
    );
  });
}

const FREEZE =
  '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';

test('typing in the bar on the All view live-filters rows and Enter captures the text as a task', async ({ page }) => {
  await seedTasks(page);
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'All' }).click();
  await expect(page.locator('.task-row')).toHaveCount(3);

  await page.locator('.command-bar-input').fill('report');
  await expect(page.locator('.task-row')).toHaveCount(2);
  await expect(page.locator('.task-row-title')).toHaveText(['Send report', 'Draft report intro']);
  await expect(page.locator('.filter-hint')).toHaveText('filtering — Enter captures');

  await page.locator('.command-bar-input').press('Enter');
  await expect(page.locator('.command-bar-input')).toHaveValue('');
  await expect(page.locator('.filter-hint')).toHaveCount(0);
  await expect(page.locator('.task-row')).toHaveCount(4);
  await expect(page.locator('.task-row-title').last()).toHaveText('report');
});

test('Done view lists the completed task struck through and the checkbox reopens it', async ({ page }) => {
  await seedTasks(page);
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Done' }).click();
  const row = page.locator('.task-row--done');
  await expect(row).toHaveCount(1);
  await expect(row.locator('.task-row-title')).toHaveText('Shipped feature');

  await page.getByLabel('Reopen Shipped feature').click();
  await expect(page.locator('.task-row')).toHaveCount(0);
  await expect(page.locator('.empty-state')).toHaveText('Nothing done yet — finish something today.');

  await page.getByRole('button', { name: 'All' }).click();
  await expect(page.locator('.task-row-title')).toContainText(['Shipped feature']);
});

for (const [name, width] of BREAKPOINTS) {
  test(`all view while filtering with the mono hint @ ${name}`, async ({ page }) => {
    await seedTasks(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'All' }).click();
    await page.locator('.command-bar-input').fill('report');
    await expect(page.locator('.task-row')).toHaveCount(2);
    await page.addStyleTag({ content: FREEZE });
    await expect(page).toHaveScreenshot(`all-filtered-${name}.png`, {
      fullPage: true,
      animations: 'disabled',
    });
  });

  test(`done view with a struck-through completed task @ ${name}`, async ({ page }) => {
    await seedTasks(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.locator('.task-row--done')).toHaveCount(1);
    await page.addStyleTag({ content: FREEZE });
    await expect(page).toHaveScreenshot(`done-${name}.png`, {
      fullPage: true,
      animations: 'disabled',
    });
  });
}

test('keyboard-only: ArrowDown selects the done row and x reopens it without re-completing', async ({ page }) => {
  await seedTasks(page);
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('.task-row--done')).toHaveCount(1);
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.task-row[data-task-id="seed-done"]')).toBeFocused();
  await page.keyboard.press('x');
  await expect(page.locator('.task-row')).toHaveCount(0);
  await page.getByRole('button', { name: 'All' }).click();
  await expect(page.locator('.task-row-title')).toContainText(['Shipped feature']);
});
