import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

const FREEZE =
  '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';

function seedTask(page: Page) {
  return page.addInitScript(() => {
    const today = new Date();
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    window.localStorage.setItem(
      'todo-quantum.v1',
      JSON.stringify({
        schemaVersion: 1,
        tasks: [
          {
            id: 's1', title: 'Overdue chore', status: 'open', dueDate: fmt(yesterday),
            dueTime: null, list: null, priority: null, recurrence: null,
            createdAt: '2026-06-01T08:00:00.000Z', completedAt: null, order: 1,
          },
        ],
      }),
    );
  });
}

async function selectRowWithKeyboard(page: Page) {
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('j');
  await expect(page.locator('[data-task-id="s1"]')).toBeFocused();
}

test('task rows render no overflow button or menu (keyboard-first, FR-121)', async ({ page }) => {
  await seedTask(page);
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('.task-row')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /task options/i })).toHaveCount(0);
  await expect(page.locator('[role="menu"]')).toHaveCount(0);
});

test('pressing 1 on a j-selected overdue row sets dueDate to tomorrow in storage', async ({ page }) => {
  await seedTask(page);
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('.task-section-label').first()).toHaveText('Rollover');
  await selectRowWithKeyboard(page);
  await page.keyboard.press('1');
  await expect(page.locator('.task-row')).toHaveCount(0);
  const tomorrow = await page.evaluate(() => {
    const today = new Date();
    const t = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  });
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const data = JSON.parse(window.localStorage.getItem('todo-quantum.v1') ?? '{}');
          return data.tasks?.[0]?.dueDate as string | undefined;
        }),
      { message: 'debounced persistence flushes the snoozed dueDate to localStorage' },
    )
    .toBe(tomorrow);
  await expect(page.locator('.toast-message')).toHaveText(/^Snoozed to /);
});

test('keyboard snooze moves the task out of rollover and toasts the new date @ desktop', async ({ page }) => {
  await seedTask(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/', { waitUntil: 'networkidle' });
  await selectRowWithKeyboard(page);
  await page.keyboard.press('1');
  await expect(page.locator('.task-row')).toHaveCount(0);
  await expect(page.locator('.toast-message')).toHaveText(/^Snoozed to /);
  await page.addStyleTag({ content: FREEZE });
  await expect(page).toHaveScreenshot('snooze-post-keyboard-desktop.png', {
    fullPage: true,
    animations: 'disabled',
  });
});
