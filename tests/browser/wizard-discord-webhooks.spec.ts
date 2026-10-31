import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

async function unlock(page: Page): Promise<void> {
  await page.goto('/wizard/');
  await page.getByLabel('Control token').fill('playwright-control-token-with-32-characters');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.locator('#mode')).toContainText('Authenticated');
}

test('the Discord page loads saved webhooks when the page opens', async ({ page }) => {
  let saved: unknown;
  await page.route('**/wizard/api/discord-webhooks', async (route) => {
    if (route.request().method() === 'PUT') { saved = route.request().postDataJSON(); await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ webhooks: [], maximum: 25 }) }); return; }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ maximum: 25, webhooks: [{ id: '11111111-1111-4111-8111-111111111111', name: 'Clip Courier', enabled: true, hint: 'webhook …1234', ready: true }, { id: '22222222-2222-4222-8222-222222222222', name: 'Chat Archive', enabled: true, hint: 'webhook …5678', ready: true }] }) });
  });
  await unlock(page);
  await page.locator('[data-view="discord"]').click();
  const list = page.locator('#discord-webhook-list');
  await expect(list.locator('.discord-webhook-row')).toHaveCount(2);
  await expect(list.locator('input').first()).toHaveValue('Clip Courier');
  await expect(list).not.toContainText('No webhooks yet.');
  expect(saved).toBeUndefined();
});
