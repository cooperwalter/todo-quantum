import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

const FREEZE =
  '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';

function seedTasks(page: Page) {
  return page.addInitScript(() => {
    const today = new Date();
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
      'todo-quantum.v1',
      JSON.stringify({
        schemaVersion: 1,
        tasks: [
          { ...base, id: 'k1', title: 'First keyboard task', dueDate: fmt(today), order: 1 },
          { ...base, id: 'k2', title: 'Second keyboard task', dueDate: fmt(today), order: 2 },
        ],
      }),
    );
  });
}

test('load focus lands in the command bar (FR-15)', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.getByRole('textbox', { name: 'Capture a task' })).toBeFocused();
});

test('ArrowDown moves focus from bar to list and j/k navigate rows', async ({ page }) => {
  await seedTasks(page);
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-task-id="k1"]')).toBeFocused();
  await page.keyboard.press('j');
  await expect(page.locator('[data-task-id="k2"]')).toBeFocused();
  await page.keyboard.press('k');
  await expect(page.locator('[data-task-id="k1"]')).toBeFocused();
});

test('a printable key in the list refocuses the bar and types itself (FR-16)', async ({ page }) => {
  await seedTasks(page);
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('b');
  const input = page.getByRole('textbox', { name: 'Capture a task' });
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('b');
});

test('Cmd+Z in the list undoes the last mutation', async ({ page }) => {
  await seedTasks(page);
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('x');
  await expect(page.locator('.task-row')).toHaveCount(1);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.task-row')).toHaveCount(2);
});

test('keyboard-selected row state @ desktop (accent rule + print shadow)', async ({ page }) => {
  await seedTasks(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.task-row--selected')).toHaveCount(1);
  await page.addStyleTag({ content: FREEZE });
  await expect(page).toHaveScreenshot('focus-selected-row-desktop.png', {
    fullPage: true,
    animations: 'disabled',
  });
});
