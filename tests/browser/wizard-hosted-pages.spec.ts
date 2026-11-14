import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

async function unlock(page: Page): Promise<void> {
  await page.goto('/wizard/');
  await page.getByLabel('Control token').fill('playwright-control-token-with-32-characters');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.locator('#mode')).toContainText('Authenticated');
}

test('SlothBloom pages can be turned on, show a pairing code and unpair a browser', async ({ page }) => {
  const status = { enabled: false, origins: ['https://app.slothbloom.com'], browsers: [] as Array<{ id: string; name: string; pairedAt: string }> };
  let saved: unknown;
  await page.route('**/wizard/api/hosted-pages', async (route) => {
    if (route.request().method() === 'PUT') { saved = route.request().postDataJSON(); status.enabled = (saved as { enabled: boolean }).enabled; status.browsers = [{ id: 'b1', name: 'Laptop', pairedAt: '2026-11-10T12:00:00.000Z' }]; }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(status) });
  });
  await page.route('**/wizard/api/hosted-pages/code', (route) => route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ code: '123456', expiresInSeconds: 300 }) }));
  await page.route('**/wizard/api/hosted-pages/browsers/b1', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...status, browsers: [] }) }));
  page.on('dialog', (dialog) => void dialog.accept());
  await unlock(page);
  await page.evaluate(() => (window as unknown as { activatePanel: (id: string) => void }).activatePanel('overview'));
  const card = page.locator('#hosted-pages-card');
  await expect(card.locator('#hosted-pages-badge')).toHaveText('Off');
  await expect(card.getByRole('button', { name: 'Pair a browser' })).toBeDisabled();
  await card.getByLabel('Let the SlothBloom pages connect to StreamBridge on this PC').check();
  await expect(card.locator('#hosted-pages-badge')).toHaveText('Paired');
  expect(saved).toEqual({ enabled: true, approvedByCreator: true });
  await card.getByRole('button', { name: 'Pair a browser' }).click();
  await expect(card.locator('#hosted-pages-code')).toHaveText('123 456');
  await expect(card.locator('.hosted-pages-row')).toContainText('Laptop');
  await card.getByRole('button', { name: 'Unpair this browser' }).click();
  await expect(card.locator('.hosted-pages-row')).toHaveCount(0);
  await expect(card.locator('#hosted-pages-state')).toHaveText('That browser can no longer connect.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('Phone Control Panel can be turned on, shows the address and a code, and removes a phone', async ({ page }) => {
  const status = { enabled: false, listening: false, port: 8788, addresses: [] as string[], phones: [] as Array<{ id: string; name: string; pairedAt: string }> };
  let saved: unknown;
  await page.route('**/wizard/api/phone-remote', async (route) => {
    if (route.request().method() === 'PUT') { saved = route.request().postDataJSON(); status.enabled = true; status.listening = true; status.addresses = ['http://192.168.1.20:8788/']; status.phones = [{ id: 'p1', name: 'iPhone', pairedAt: '2026-11-14T12:00:00.000Z' }]; }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(status) });
  });
  await page.route('**/wizard/api/phone-remote/code', (route) => route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ code: '654321', expiresInSeconds: 300 }) }));
  await page.route('**/wizard/api/phone-remote/phones/p1', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...status, phones: [] }) }));
  page.on('dialog', (dialog) => void dialog.accept());
  await unlock(page);
  await page.evaluate(() => (window as unknown as { activatePanel: (id: string) => void }).activatePanel('overview'));
  const card = page.locator('#phone-remote-card');
  await expect(card.locator('#phone-remote-badge')).toHaveText('Off');
  await expect(card.getByRole('button', { name: 'Pair a phone' })).toBeDisabled();
  await card.getByLabel('Let phones on my home Wi-Fi use the Control Panel').check();
  await expect(card.locator('#phone-remote-badge')).toHaveText('Paired');
  expect(saved).toEqual({ enabled: true, approvedByCreator: true });
  await expect(card.locator('#phone-remote-address')).toHaveText('http://192.168.1.20:8788/');
  await card.getByRole('button', { name: 'Pair a phone' }).click();
  await expect(card.locator('#phone-remote-code')).toHaveText('654 321');
  await card.getByRole('button', { name: 'Remove this phone' }).click();
  await expect(card.locator('.hosted-pages-row')).toHaveCount(0);
  await expect(card.locator('#phone-remote-state')).toHaveText('That phone can no longer connect.');
});
