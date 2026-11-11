import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

async function unlock(page: Page): Promise<void> {
  await page.goto('/wizard/');
  await page.getByLabel('Control token').fill('playwright-control-token-with-32-characters');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.locator('#mode')).toContainText('Authenticated');
}

test('Start with Windows is off at first and can be switched on and off', async ({ page }) => {
  const status = { supported: true, enabled: false };
  const saved: unknown[] = [];
  await page.route('**/wizard/api/sign-in-start', async (route) => {
    if (route.request().method() === 'PUT') { const body = route.request().postDataJSON() as { enabled: boolean }; saved.push(body); status.enabled = body.enabled; }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(status) });
  });
  await unlock(page);
  await page.evaluate(() => (window as unknown as { activatePanel: (id: string) => void }).activatePanel('overview'));
  const card = page.locator('#sign-in-start-card');
  await expect(card).toBeVisible();
  await expect(card.locator('#sign-in-start-badge')).toHaveText('Off');
  const toggle = card.getByLabel('Start StreamBridge when I sign in to Windows');
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await expect(card.locator('#sign-in-start-badge')).toHaveText('On');
  await expect(card.locator('#sign-in-start-state')).toHaveText('On. StreamBridge starts when you sign in to Windows.');
  await toggle.uncheck();
  await expect(card.locator('#sign-in-start-state')).toHaveText('Off. You start StreamBridge yourself.');
  expect(saved).toEqual([{ enabled: true, approvedByCreator: true }, { enabled: false, approvedByCreator: true }]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('Start with Windows stays hidden where it cannot work', async ({ page }) => {
  await page.route('**/wizard/api/sign-in-start', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ supported: false, enabled: false }) }));
  await unlock(page);
  await page.evaluate(() => (window as unknown as { activatePanel: (id: string) => void }).activatePanel('overview'));
  await expect(page.locator('#hosted-pages-card')).toBeVisible();
  await expect(page.locator('#sign-in-start-card')).toBeHidden();
});
