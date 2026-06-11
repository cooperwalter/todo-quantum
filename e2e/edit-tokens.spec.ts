import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

const FREEZE =
  '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';

// Resolve the next occurrence (strictly after today) of an ISO weekday (1=Mon..7=Sun)
// using the SAME real clock the app reads via `new Date()`. The app has no seeded
// clock, so the seeded dueDate must be computed at run time to land on the intended
// weekday relative to today.
function nextWeekday(weekday: number): string {
  const now = new Date();
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const current = now.getDay() === 0 ? 7 : now.getDay();
  const delta = ((weekday - current + 7 - 1) % 7) + 1;
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + delta);
  return fmt(target);
}

// Seed a single fully-specified task: title "Send report", due next Friday at 15:00,
// list "work". The app serializes this back into the editor field; the exact date
// word (e.g. "tomorrow" vs "jun 12") depends on today's offset, so the journey
// asserts on the parsed RESULT (the row's date + list pills) rather than the literal
// serialized date word.
function seedSendReport(page: Page) {
  const friday = nextWeekday(5);
  return page.addInitScript((dueDate: string) => {
    window.localStorage.setItem(
      'todo-quantum.v1',
      JSON.stringify({
        schemaVersion: 1,
        tasks: [
          {
            id: 'edit-1',
            title: 'Send report',
            status: 'open',
            dueDate,
            dueTime: '15:00',
            list: 'work',
            priority: null,
            recurrence: null,
            createdAt: '2026-06-01T08:00:00.000Z',
            completedAt: null,
            order: 1,
          },
        ],
      }),
    );
  }, friday);
}

test('editing a task: typing monday displaces the seeded date, deleting #work clears the list, and Cmd+Z restores both together', async ({
  page,
}) => {
  const friday = nextWeekday(5);
  const monday = nextWeekday(1);
  await seedSendReport(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/', { waitUntil: 'networkidle' });

  // The seeded task is due next Friday (a future date), so it lives in the All view,
  // not the default Today view. Navigate there via the view tab.
  await page.getByRole('button', { name: 'All' }).click();

  const row = page.locator('[data-task-id="edit-1"]');
  await expect(row).toHaveCount(1);
  // The row shows the seeded list pill before editing.
  await expect(row.locator('.task-row-list')).toHaveText('#work');

  // Open the editor by selecting the row and pressing Enter (keyboard-first path).
  await row.locator('.task-row-title').click();
  await row.press('Enter');

  const editInput = row.locator('.command-bar-input');
  await expect(editInput).toBeFocused();

  // The editor shows the serialized text round-tripped from the task: it must
  // contain the title, the list token, and at least one token chip in the mirror.
  await expect(editInput).toHaveValue(/Send report/);
  await expect(editInput).toHaveValue(/#work/);
  await expect(row.locator('.command-bar-chip')).not.toHaveCount(0);

  // Capture the serialized date word (whatever the serializer chose for next Friday)
  // so we can assert it disappears after the new Monday token seals. The serialized
  // text is "Send report <dateword> 3pm #work" — the date word is the token(s)
  // between the title "Send report " and the time "3pm".
  const serialized = (await editInput.inputValue()) ?? '';
  expect(serialized).toContain('#work');
  const dateWord = serialized.replace(/^Send report\s+/, '').replace(/\s+3pm.*$/, '').trim();
  expect(dateWord.length).toBeGreaterThan(0);
  // The FRIDAY date is in effect (stored task), not the literal word.
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const data = JSON.parse(window.localStorage.getItem('todo-quantum.v1') ?? '{}');
        return data.tasks?.[0]?.dueDate as string | undefined;
      }),
    )
    .toBe(friday);

  // Type a trailing " monday " — the new date token displaces the seeded date token,
  // and the trailing space SEALS the displacement, removing the old date word from
  // the live field entirely.
  await editInput.focus();
  // Move the caret to the end before typing the appended token.
  await page.keyboard.press('End');
  await editInput.pressSequentially(' monday ');

  // The new Monday token lands and the trailing space SEALS the displacement: the
  // seeded date word is removed from the live field entirely.
  await expect(editInput).toHaveValue(/monday/i);
  await expect
    .poll(async () => (await editInput.inputValue()).includes(dateWord))
    .toBe(false);
  // Token chips are still rendered in the mirror (the Monday date + #work).
  await expect(row.locator('.command-bar-chip')).not.toHaveCount(0);
  const fieldAfterMonday = await editInput.inputValue();
  expect(fieldAfterMonday).toMatch(/monday/i);
  expect(fieldAfterMonday).not.toContain(dateWord);

  // Select-and-delete the "#work" token from the field.
  const workIndex = fieldAfterMonday.indexOf('#work');
  expect(workIndex).toBeGreaterThanOrEqual(0);
  await editInput.focus();
  // Place caret at end, then select from end back over "#work" by setting the
  // selection range directly on the input element, then delete.
  await editInput.evaluate((el: HTMLInputElement, idx: number) => {
    el.setSelectionRange(idx, idx + '#work'.length);
  }, workIndex);
  await page.keyboard.press('Delete');
  await expect(editInput).not.toHaveValue(/#work/);

  // Commit the edit with Enter.
  await editInput.press('Enter');

  // The editor closes and the row reflects the new state: due Monday, no list pill.
  await expect(row.locator('.command-bar-input')).toHaveCount(0);
  await expect(row.locator('.task-row-list')).toHaveCount(0);
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const data = JSON.parse(window.localStorage.getItem('todo-quantum.v1') ?? '{}');
        return data.tasks?.[0]?.dueDate as string | undefined;
      }),
    )
    .toBe(monday);
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const data = JSON.parse(window.localStorage.getItem('todo-quantum.v1') ?? '{}');
        return data.tasks?.[0]?.list as string | null | undefined;
      }),
    )
    .toBeNull();

  // Cmd+Z restores BOTH the date and the list together (a single edit action).
  await row.focus();
  await page.keyboard.press('Meta+z');
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const data = JSON.parse(window.localStorage.getItem('todo-quantum.v1') ?? '{}');
        return data.tasks?.[0]?.dueDate as string | undefined;
      }),
    )
    .toBe(friday);
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const data = JSON.parse(window.localStorage.getItem('todo-quantum.v1') ?? '{}');
        return data.tasks?.[0]?.list as string | null | undefined;
      }),
    )
    .toBe('work');
  // The restored list pill is back on the row.
  await expect(row.locator('.task-row-list')).toHaveText('#work');
  await page.addStyleTag({ content: FREEZE });
});

test('add bar: typing "call mom friday monday " seals to a single Monday chip and creates a task due Monday', async ({
  page,
}) => {
  const monday = nextWeekday(1);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/', { waitUntil: 'networkidle' });

  const bar = page.locator('.command-bar-input').first();
  await bar.focus();
  await bar.pressSequentially('call mom friday monday ');

  // After the trailing space seals the displacement, only ONE date chip remains —
  // the Monday one. The earlier "friday" token is displaced and removed.
  await expect(page.locator('.command-bar-chip')).toHaveCount(1);
  const barValue = await bar.inputValue();
  expect(barValue).toMatch(/monday/i);
  expect(barValue).not.toMatch(/friday/i);

  // Enter captures the task.
  await bar.press('Enter');

  // Exactly one created task, due Monday, titled "call mom".
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const data = JSON.parse(window.localStorage.getItem('todo-quantum.v1') ?? '{}');
        return data.tasks?.length ?? 0;
      }),
    )
    .toBe(1);
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const data = JSON.parse(window.localStorage.getItem('todo-quantum.v1') ?? '{}');
        return data.tasks?.[0]?.dueDate as string | undefined;
      }),
    )
    .toBe(monday);
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const data = JSON.parse(window.localStorage.getItem('todo-quantum.v1') ?? '{}');
        return data.tasks?.[0]?.title as string | undefined;
      }),
    )
    .toBe('call mom');
});
