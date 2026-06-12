import { test, expect, FIXED_NOW } from './fixtures';
import type { Page } from '@playwright/test';

interface SeedTask {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  dueTime: string | null;
  list: string | null;
  priority: number | null;
  recurrence: null;
  createdAt: string;
  completedAt: string | null;
  order: number;
}

function makeSeed(id: string, title: string, dueDate: string | null, order: number): SeedTask {
  return {
    id,
    title,
    status: 'open',
    dueDate,
    dueTime: null,
    list: null,
    priority: null,
    recurrence: null,
    createdAt: '2026-06-01T08:00:00.000Z',
    completedAt: null,
    order,
  };
}

function localDate(offsetDays: number): string {
  const now = FIXED_NOW;
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays, 12);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function seed(page: Page, tasks: SeedTask[]) {
  const payload = JSON.stringify({ schemaVersion: 1, tasks });
  return page.addInitScript((data) => {
    window.localStorage.setItem('todo-quantum.v1', data);
  }, payload);
}

test('capture proxy (G-1): keyboard-only canonical capture renders the row in under 200ms from Enter keyup', async ({ page }) => {
  await seed(page, [makeSeed('seed-existing', 'Existing task', null, 1)]);
  await page.goto('/', { waitUntil: 'networkidle' });

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('g');
  await page.keyboard.press('a');
  await expect(page.locator('.view-tab[aria-current="page"]')).toHaveText(/all/i);

  await page.keyboard.type('Send report tomorrow 3pm #work !p1');
  await expect(page.locator('.command-bar-input')).toHaveValue('Send report tomorrow 3pm #work !p1');

  await page.evaluate(() => {
    const holder = window as unknown as { __captureMs: Promise<number> };
    holder.__captureMs = new Promise<number>((resolve) => {
      const onKeyUp = (event: KeyboardEvent) => {
        if (event.key !== 'Enter') return;
        window.removeEventListener('keyup', onKeyUp, true);
        const start = performance.now();
        const check = () => {
          const rows = document.querySelectorAll('.task-row-title');
          for (const row of rows) {
            if (row.textContent === 'Send report') {
              resolve(performance.now() - start);
              return;
            }
          }
          requestAnimationFrame(check);
        };
        check();
      };
      window.addEventListener('keyup', onKeyUp, true);
    });
  });
  await page.keyboard.press('Enter');
  const elapsedMs = await page.evaluate(
    () => (window as unknown as { __captureMs: Promise<number> }).__captureMs,
  );
  await expect(page.locator('.task-row-title', { hasText: 'Send report' })).toBeVisible();
  expect(elapsedMs).toBeLessThan(200);
});

test('zero-click Today (G-2): seeded storage renders all three Today sections with no interaction', async ({ page }) => {
  await seed(page, [
    makeSeed('seed-rollover', 'Overdue invoice', localDate(-1), 1),
    makeSeed('seed-today', 'Send report', localDate(0), 2),
    makeSeed('seed-anytime', 'Read design doc', null, 3),
  ]);
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('.task-section-label')).toHaveText(['Rollover', 'Due today', 'Anytime']);
  await expect(page.locator('.task-row')).toHaveCount(3);
});

test("triage proxy (G-3): 5 rollover tasks cleared with only ↓ x 1 2 3 keys in one run", async ({ page }) => {
  await seed(page, [
    makeSeed('r1', 'Rollover one', localDate(-2), 1),
    makeSeed('r2', 'Rollover two', localDate(-2), 2),
    makeSeed('r3', 'Rollover three', localDate(-1), 3),
    makeSeed('r4', 'Rollover four', localDate(-1), 4),
    makeSeed('r5', 'Rollover five', localDate(-1), 5),
  ]);
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('.task-row')).toHaveCount(5);

  for (const key of ['ArrowDown', 'x', 'ArrowDown', 'x', 'ArrowDown', '1', 'ArrowDown', '2', 'ArrowDown', '3']) {
    await page.keyboard.press(key);
  }

  await expect(page.locator('.task-section-label', { hasText: 'Rollover' })).toHaveCount(0);
  await expect(page.locator('.task-row')).toHaveCount(0);
});

test('undo journey: complete a task then ⌘Z restores it to open', async ({ page }) => {
  await seed(page, [makeSeed('u1', 'Undo me', null, 1)]);
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('x');
  await expect(page.locator('.task-row')).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.task-row-title')).toHaveText(['Undo me']);
});

test('reload persistence: a captured task is present again after reload', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.keyboard.type('Persisted by reload');
  await page.keyboard.press('Enter');
  await expect(page.locator('.task-row-title')).toHaveText(['Persisted by reload']);
  await page.waitForTimeout(400);
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('.task-row-title')).toHaveText(['Persisted by reload']);
});

test('dark theme smoke: data-theme=dark renders the dark background token #1A1611', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark';
  });
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(26, 22, 17)');
});

test('100 seeded tasks render in the Today view without interaction', async ({ page }) => {
  const tasks: SeedTask[] = [];
  for (let i = 1; i <= 100; i++) {
    const dueDate = i % 3 === 0 ? null : i % 3 === 1 ? localDate(0) : localDate(-1);
    tasks.push(makeSeed(`bulk-${i}`, `Bulk task ${i}`, dueDate, i));
  }
  await seed(page, tasks);
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('.task-row')).toHaveCount(100);
});
