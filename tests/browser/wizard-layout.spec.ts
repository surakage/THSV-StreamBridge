import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function unlock(page: Page): Promise<void> {
  await page.goto('/wizard/');
  await page.getByLabel('Control token').fill('playwright-control-token-with-32-characters');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.locator('#mode')).toContainText('Authenticated');
}

test('wizard uses the wide canvas, keeps cards aligned, and confirms local controls', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await unlock(page);
  const shell = await page.locator('.shell').boundingBox();
  const content = await page.locator('.content').boundingBox();
  expect(shell?.width ?? 0).toBeGreaterThan(1840);
  expect(content?.width ?? 0).toBeGreaterThan(1540);

  await page.getByRole('button', { name: 'Extensions', exact: true }).click();
  await expect(page.locator('[data-panel="addons"] .broadcast-app-card')).toHaveCount(3);
  const cardHeights = await page.locator('[data-panel="addons"] .broadcast-app-card').evaluateAll((cards) => cards.map((card) => card.getBoundingClientRect().height));
  expect(new Set(cardHeights.map((height) => Math.round(height))).size).toBe(1);

  await page.getByRole('button', { name: 'Commands', exact: true }).click();
  await page.getByRole('button', { name: 'Expand all' }).click();
  await expect(page.locator('#wizard-feedback')).toContainText('Expand all applied in this page.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('wizard remains fluid on laptops and bounded on ultrawide monitors', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await unlock(page);
  const laptopShell = await page.locator('.shell').boundingBox();
  const laptopContent = await page.locator('.content').boundingBox();
  expect(laptopShell?.width ?? 0).toBeGreaterThan(1300);
  expect(laptopContent?.width ?? 0).toBeGreaterThan(1050);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  await page.setViewportSize({ width: 3440, height: 1440 });
  const ultrawideShell = await page.locator('.shell').boundingBox();
  expect(ultrawideShell?.width ?? 0).toBeGreaterThan(2100);
  expect(ultrawideShell?.width ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(2201);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('wizard does not bleed horizontally at a narrow dock-like width', async ({ page }) => {
  await page.setViewportSize({ width: 520, height: 900 });
  await unlock(page);
  await page.getByRole('button', { name: 'Add-ons', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const clipped = await page.locator('button:visible').evaluateAll((buttons) => buttons.filter((button) => {
    const box = button.getBoundingClientRect();
    return box.left < -1 || box.right > document.documentElement.clientWidth + 1;
  }).map((button) => button.textContent.trim()));
  expect(clipped).toEqual([]);
});

test('fresh setup creates one selective Streamer.bot import and exposes its trigger guide', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await unlock(page);
  await page.getByRole('button', { name: 'Streamer.bot', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'One Streamer.bot import' })).toBeVisible();
  await expect(page.locator('[data-import-kind="core"] input')).toHaveCount(12);
  await expect(page.locator('[data-import-kind="core"] input:checked')).toHaveCount(12);
  await expect(page.locator('[data-import-kind="addon"] input')).toHaveCount(7);
  expect(await page.locator('[data-import-kind="addon"] input:disabled').count()).toBeGreaterThan(0);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Create & download one import' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('THSV-StreamBridge-Universal-Setup-3.6.0.sb');
  await expect(page.locator('#universal-import-state')).toContainText('Import this one file in Streamer.bot');
  await page.getByRole('button', { name: 'Review recommended triggers' }).click();
  await expect(page.locator('#universal-trigger-guide')).toHaveAttribute('open', '');
  await expect(page.locator('#universal-trigger-list')).toContainText('Native Platform Intake');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
