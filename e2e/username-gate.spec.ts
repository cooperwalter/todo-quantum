import { firstRunTest as test, expect } from './fixtures';

test.describe('username gate', () => {
  test('asks who is at the desk on first visit and shows the todo app after submitting a name', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByLabel(/who/i)).toBeVisible();
    await page.getByLabel(/who/i).fill('cooper');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByLabel(/who/i)).toHaveCount(0);
  });

  test('keeps the submitted username across a reload instead of asking again', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel(/who/i).fill('cooper');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel(/who/i)).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('rejects a username with illegal characters and keeps the gate open', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel(/who/i).fill('not a name!');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('alert')).toHaveText('Use letters, numbers, - or _ (max 32)');
    await expect(page.getByLabel(/who/i)).toBeVisible();
  });

  test('stores the submitted username lowercased under todo-quantum.username', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel(/who/i).fill('Cooper');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const stored = await page.evaluate(() => window.localStorage.getItem('todo-quantum.username'));
    expect(stored).toBe('cooper');
  });
});
