import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

async function unlock(page: Page): Promise<void> {
  await page.goto('/wizard/');
  await page.getByLabel('Control token').fill('playwright-control-token-with-32-characters');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.locator('#mode')).toContainText('Authenticated');
}

test('Dress rehearsal runs off air and lists what worked, grouped, with a way to fix each problem', async ({ page }) => {
  test.setTimeout(90_000);
  await unlock(page);
  const button = page.locator('#go-live-rehearsal');
  await expect(button).toHaveText('Dress rehearsal');
  await button.click();
  const panel = page.locator('#dress-rehearsal');
  await expect(panel).toBeVisible();
  await expect(page.locator('#dress-rehearsal-state')).toContainText('Finished', { timeout: 60_000 });
  // The test setup's streaming app is not running: the first item says so and offers the page that fixes it.
  const app = panel.locator('.dress-area').filter({ has: page.getByRole('heading', { name: 'Streaming app' }) });
  await expect(app.locator('li').first()).toHaveAttribute('data-status', 'fail');
  await expect(app).toContainText(/not connected right now|No streaming app is picked/u);
  await expect(app.getByRole('button', { name: 'Open' })).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Pre-stream check' })).toBeVisible();
  await expect(button).toBeEnabled();
  // The last result comes back after a reload.
  await page.reload();
  await page.getByLabel('Control token').fill('playwright-control-token-with-32-characters');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.locator('#dress-rehearsal-state')).toContainText('Finished', { timeout: 10_000 });
});
