import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

function seedTasks(page: Page) {
  return page.addInitScript(() => {
    const today = new Date();
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    const base = {
      status: 'open',
      dueTime: null,
      list: null,
      priority: null,
      recurrence: null,
      createdAt: '2026-06-01T08:00:00.000Z',
      completedAt: null,
    };
    window.localStorage.setItem(
      'todo-quantum.v1.e2e',
      JSON.stringify({
        schemaVersion: 1,
        tasks: [
          { ...base, id: 'seed-rollover', title: 'Overdue invoice', dueDate: fmt(yesterday), order: 1 },
          { ...base, id: 'seed-today', title: 'Send report', dueDate: fmt(today), dueTime: '15:00', order: 2 },
          { ...base, id: 'seed-anytime', title: 'Read design doc', dueDate: null, order: 3 },
        ],
      }),
    );
  });
}

test('seeded rollover + today + anytime tasks render all three sections in order with no interaction', async ({ page }) => {
  await seedTasks(page);
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('.task-section-label')).toHaveText(['Rollover', 'Due today', 'Anytime']);
  const titles = page.locator('.task-row-title');
  await expect(titles).toHaveText(['Overdue invoice', 'Send report', 'Read design doc']);
});

test('on load the command bar has focus and Today is the active view', async ({ page }) => {
  await seedTasks(page);
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('.command-bar-input')).toBeFocused();
  await expect(page.locator('.view-tab[aria-current="page"]')).toHaveText(/today/i);
});

test('load reveal staggers each row 40ms later than the previous row', async ({ page }) => {
  await seedTasks(page);
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('.task-row')).toHaveCount(3);
  const delays = await page.$$eval('.task-row', (rows) =>
    rows.map((row) => parseFloat(getComputedStyle(row).animationDelay) * 1000),
  );
  expect(delays).toHaveLength(3);
  expect(delays[1] - delays[0]).toBeCloseTo(40, 0);
  expect(delays[2] - delays[1]).toBeCloseTo(40, 0);
});

test('under prefers-reduced-motion the masthead and row reveal animation durations are 0', async ({ page }) => {
  await seedTasks(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('.task-row')).toHaveCount(3);
  const durations = await page.$$eval('.masthead, .task-row', (els) =>
    els.map((el) => getComputedStyle(el).animationDuration),
  );
  for (const duration of durations) {
    expect(parseFloat(duration)).toBe(0);
  }
});
