import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

async function unlock(page: Page): Promise<void> {
  await page.goto('/wizard/');
  await page.getByLabel('Control token').fill('playwright-control-token-with-32-characters');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.locator('#mode')).toContainText('Authenticated');
}

test('the licence card activates a key, shows only its hint and can remove it', async ({ page }) => {
  let sentKey: unknown;
  const active = { beta: true, licensed: true, state: 'active', keyHint: '…4D51', productName: 'StreamBridge', activatedAt: '2026-11-10T00:00:00Z', lastCheckedAt: '2026-11-10T00:00:00Z' };
  await page.route('**/wizard/api/licence', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ beta: true, licensed: false, state: 'none' }) }));
  await page.route('**/wizard/api/licence/activate', async (route) => { sentKey = (route.request().postDataJSON() as { key?: unknown }).key; await route.fulfill({ contentType: 'application/json', body: JSON.stringify(active) }); });
  await page.route('**/wizard/api/licence/deactivate', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ beta: true, licensed: false, state: 'none' }) }));
  await unlock(page);
  const card = page.locator('#licence-card');
  await expect(card.locator('#licence-state')).toContainText('free during the beta');
  await expect(card.locator('#licence-badge')).toHaveText('Beta');
  await card.getByLabel('Licence key').fill('38B1460A-5104-4067-A91D-77B872934D51');
  await card.getByRole('button', { name: 'Activate' }).click();
  await expect(card.locator('#licence-state')).toContainText('Activated. Key …4D51 · StreamBridge');
  expect(sentKey).toBe('38B1460A-5104-4067-A91D-77B872934D51');
  await expect(card.locator('#licence-badge')).toHaveText('Active');
  await expect(card.getByLabel('Licence key')).toBeHidden();
  page.once('dialog', (dialog) => void dialog.accept());
  await card.getByRole('button', { name: 'Remove from this PC' }).click();
  await expect(card.locator('#licence-state')).toContainText('Removed from this PC.');
  await expect(card.getByLabel('Licence key')).toBeVisible();
});

test('a free PC picks its two platforms, and a third cannot be ticked', async ({ page }) => {
  let saved: unknown;
  const free = { beta: true, licensed: false, state: 'none', plan: { tier: 'free', enforced: false, freePlatformLimit: 2, proModuleIds: [] }, freePlatforms: ['kick'] };
  await page.route('**/wizard/api/licence', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(free) }));
  await page.route('**/wizard/api/licence/free-platforms', async (route) => {
    saved = (route.request().postDataJSON() as { platforms?: unknown }).platforms;
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...free, freePlatforms: saved }) });
  });
  await unlock(page);
  const picker = page.locator('#licence-free-platforms');
  await expect(picker).toBeVisible();
  await expect(picker.getByLabel('Kick')).toBeChecked();
  await picker.getByLabel('YouTube').check();
  await expect(picker.getByLabel('Twitch')).toBeDisabled();
  await picker.getByRole('button', { name: 'Save platforms' }).click();
  await expect(page.locator('#licence-state')).toContainText('applies the next time StreamBridge starts');
  expect(saved).toEqual(['youtube', 'kick']);
});
