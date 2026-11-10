import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

async function unlock(page: Page): Promise<void> {
  await page.goto('/wizard/');
  await page.getByLabel('Control token').fill('playwright-control-token-with-32-characters');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.locator('#mode')).toContainText('Authenticated');
}

test('Scene lights finds a light, tests it and saves a scene', async ({ page }) => {
  let saved: unknown;
  await page.route('**/wizard/api/key-lights', async (route) => {
    if (route.request().method() === 'PUT') { saved = route.request().postDataJSON(); await route.fulfill({ contentType: 'application/json', body: JSON.stringify(saved) }); return; }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ enabled: false, lights: [], scenes: [] }) });
  });
  await page.route('**/wizard/api/key-lights/discover', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ lights: [{ name: 'Desk left', address: '192.168.1.50' }] }) }));
  await page.route('**/wizard/api/key-lights/test', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ on: true, brightness: 35, temperature: 4500 }) }));
  await unlock(page);
  await page.evaluate(() => (window as unknown as { activatePanel: (id: string) => void }).activatePanel('scene-connections'));
  const card = page.locator('#key-lights');
  await expect(card.locator('#key-lights-badge')).toHaveText('Off');
  await card.getByRole('button', { name: 'Find my lights' }).click();
  await expect(card.locator('#key-lights-state')).toHaveText('Found new lights. Save to keep them.');
  await expect(card.locator('.key-light-name input')).toHaveValue('Desk left');
  await card.getByRole('button', { name: 'Test' }).click();
  await expect(card.locator('#key-lights-state')).toContainText('The light answered.');
  await expect(card.locator('#key-lights-state')).toContainText('35% · 4500 K');
  await card.getByRole('button', { name: 'Add a scene' }).click();
  await card.locator('.key-light-scene input').fill('Gameplay');
  await card.locator('.key-light-brightness input').fill('55');
  await card.getByLabel('Change my lights with the scene').check();
  await card.getByRole('button', { name: 'Save scene lights' }).click();
  await expect(card.locator('#key-lights-badge')).toHaveText('On');
  expect(saved).toEqual({ enabled: true, lights: [{ name: 'Desk left', address: '192.168.1.50' }], scenes: [{ scene: 'Gameplay', on: true, brightness: 55, temperature: 4500 }] });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
