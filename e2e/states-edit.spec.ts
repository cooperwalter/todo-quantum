import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

const BREAKPOINTS: [string, number][] = [
  ['mobile', 375],
  ['tablet', 768],
  ['desktop', 1280],
];

const FREEZE =
  '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';

// Seed a single fully-specified task due today at 15:00, list "work", priority 1.
// Due-today keeps it in the default Today view so the edit-open screenshot needs no
// view navigation, and the serialized editor text round-trips to a date + time +
// list + priority set of chips — the maximal in-row editor state.
function seedFullTask(page: Page) {
  return page.addInitScript(() => {
    const today = new Date();
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    window.localStorage.setItem(
      'todo-quantum.v1',
      JSON.stringify({
        schemaVersion: 1,
        tasks: [
          {
            id: 'edit-state-1',
            title: 'Send report',
            status: 'open',
            dueDate: fmt(today),
            dueTime: '15:00',
            list: 'work',
            priority: 1,
            recurrence: null,
            createdAt: '2026-06-01T08:00:00.000Z',
            completedAt: null,
            order: 1,
          },
        ],
      }),
    );
  });
}

for (const [name, width] of BREAKPOINTS) {
  test(`task row open for inline edit shows serialized text with token chips @ ${name}`, async ({ page }) => {
    await seedFullTask(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/', { waitUntil: 'networkidle' });

    const row = page.locator('[data-task-id="edit-state-1"]');
    await expect(row).toHaveCount(1);

    // Open the inline editor (title click → openEdit).
    await row.locator('.task-row-title').click();
    const editInput = row.locator('.command-bar-input');
    await expect(editInput).toBeFocused();
    await expect(editInput).toHaveValue(/Send report/);
    // The mirror renders the parsed token chips (date, time, list, priority).
    await expect(row.locator('.command-bar-chip')).not.toHaveCount(0);

    await page.addStyleTag({ content: FREEZE });
    await expect(page).toHaveScreenshot(`edit-open-${name}.png`, {
      fullPage: true,
      animations: 'disabled',
    });
  });
}
