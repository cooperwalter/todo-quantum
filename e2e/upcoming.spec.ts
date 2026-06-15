import { test, expect, FIXED_NOW } from './fixtures';
import type { Page } from '@playwright/test';

const BREAKPOINTS: [string, number][] = [
  ['mobile', 375],
  ['tablet', 768],
  ['desktop', 1280],
];

const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function plusDays(n: number): Date {
  const now = FIXED_NOW;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + n, 12);
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayLabel(d: Date): string {
  const js = d.getDay();
  return `${WEEKDAY_SHORT[(js === 0 ? 7 : js) - 1]} ${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`;
}

function weekLabel(d: Date): string {
  const js = d.getDay();
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((js === 0 ? 7 : js) - 1), 12);
  return `Week of ${MONTH_SHORT[start.getMonth()]} ${start.getDate()}`;
}

function seedThreeWeeks(page: Page) {
  const base = {
    status: 'open',
    dueTime: null,
    list: null,
    priority: null,
    recurrence: null,
    createdAt: '2026-06-01T08:00:00.000Z',
    completedAt: null,
  };
  const payload = JSON.stringify({
    schemaVersion: 1,
    tasks: [
      { ...base, id: 'seed-tomorrow', title: 'Send report', dueDate: iso(plusDays(1)), order: 1 },
      { ...base, id: 'seed-plus3', title: 'Dentist appointment', dueDate: iso(plusDays(3)), order: 2 },
      { ...base, id: 'seed-week2', title: 'File expense claim', dueDate: iso(plusDays(10)), order: 3 },
      { ...base, id: 'seed-week3', title: 'Renew passport', dueDate: iso(plusDays(17)), order: 4 },
    ],
  });
  return page.addInitScript((data) => {
    window.localStorage.setItem('todo-quantum.v1', data);
  }, payload);
}

async function gotoUpcoming(page: Page) {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Upcoming' }).click();
}

const FREEZE =
  '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';

test('tasks seeded across 3 weeks land in two day groups then two week groups, in order', async ({ page }) => {
  await seedThreeWeeks(page);
  await gotoUpcoming(page);
  await expect(page.locator('.task-section-label')).toHaveText([
    dayLabel(plusDays(1)),
    dayLabel(plusDays(3)),
    weekLabel(plusDays(10)),
    weekLabel(plusDays(17)),
  ]);
  await expect(page.locator('.task-row-title')).toHaveText([
    'Send report',
    'Dentist appointment',
    'File expense claim',
    'Renew passport',
  ]);
});

test('each seeded task renders inside the section whose header matches its due date', async ({ page }) => {
  await seedThreeWeeks(page);
  await gotoUpcoming(page);
  const pairs: [string, string][] = [
    [dayLabel(plusDays(1)), 'Send report'],
    [dayLabel(plusDays(3)), 'Dentist appointment'],
    [weekLabel(plusDays(10)), 'File expense claim'],
    [weekLabel(plusDays(17)), 'Renew passport'],
  ];
  for (const [label, title] of pairs) {
    const section = page.locator('section', {
      has: page.locator('.task-section-label', { hasText: label }),
    });
    await expect(section.locator('.task-row-title')).toHaveText([title]);
  }
});

test('empty upcoming renders the italic empty state', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Upcoming' }).click();
  await expect(page.locator('.empty-state-copy')).toHaveText('Nothing ahead — type to capture.');
});

for (const [name, width] of BREAKPOINTS) {
  test(`upcoming view with day and week groups @ ${name}`, async ({ page }) => {
    await seedThreeWeeks(page);
    await page.setViewportSize({ width, height: 900 });
    await gotoUpcoming(page);
    await expect(page.locator('.task-row')).toHaveCount(4);
    await page.addStyleTag({ content: FREEZE });
    await expect(page).toHaveScreenshot(`upcoming-grouped-${name}.png`, {
      fullPage: true,
      animations: 'disabled',
    });
  });
}
