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

test('every sidebar destination opens exactly one matching Wizard panel', async ({ page }) => {
  await unlock(page);
  const destinations = [
    ['Overview', 'overview', 'Setup overview'],
    ['Platforms', 'platforms', 'Platforms'],
    ['Streamer.bot', 'streamerbot', 'Streamer.bot connection'],
    ['Commands', 'command-sync', 'Commands'],
    ['Timed Actions', 'timed-actions', 'Timed actions'],
    ['Chat Overlay', 'chat-overlay', 'Chat overlay'],
    ['Alerts', 'alerts', 'Alerts'],
    ['Viewer Foundation', 'viewer-foundation', 'Viewer Foundation'],
    ['Community Analytics', 'community-analytics', 'Community Analytics'],
    ['Extensions', 'addons', 'Extensions'],
    ['Add-ons', 'addon-marketplace', 'Add-ons'],
    ['Blockers', 'blockers', 'Advanced scoped blockers'],
    ['Ownership', 'ownership', 'Ownership registry'],
    ['Diagnostics', 'diagnostics', 'Wizard diagnostics'],
  ] as const;

  for (const [label, panel, heading] of destinations) {
    const navigation = page.locator(`[data-view="${panel}"]`);
    await expect(navigation).toHaveText(label);
    await expect(navigation).toBeEnabled();
    await navigation.click();
    await expect(navigation).toHaveClass(/active/u);
    await expect(page.locator(`[data-panel="${panel}"]`)).toBeVisible();
    await expect(page.locator(`[data-panel="${panel}"] h2`)).toHaveText(heading);
    await expect(page.locator('[data-panel]:not(.hidden)')).toHaveCount(1);
  }
});

test('Viewer Foundation is a dedicated required Bridge integration', async ({ page }) => {
  await unlock(page);
  await page.getByRole('button', { name: 'Viewer Foundation', exact: true }).click();
  await expect(page.locator('#viewer-foundation-state')).toContainText('installed with StreamBridge');
  await expect(page.locator('[data-panel="viewer-foundation"]')).toContainText('Always installed');
  await expect(page.locator('[data-panel="viewer-foundation"]')).toContainText('Foundation settings');
  await expect(page.locator('[data-panel="viewer-foundation"]')).toContainText('Viewer accounts, points & privacy');
  await expect(page.locator('[data-panel="viewer-foundation"] [data-remove-addon]')).toHaveCount(0);
  await page.locator('[data-panel="viewer-foundation"]').getByLabel('Points name').fill('Village Points');
  await page.getByRole('button', { name: 'Save foundation settings' }).click();
  await expect(page.locator('#wizard-feedback')).toContainText('Viewer Foundation settings saved');
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

test('extension details resize only their own card and keep complete names visible', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await unlock(page);
  await page.getByRole('button', { name: 'Extensions', exact: true }).click();

  const cards = page.locator('.main-feature-card');
  await expect(cards).toHaveCount(7);
  const closedHeights = await cards.evaluateAll((items) => items.map((item) => Math.round(item.getBoundingClientRect().height)));
  await cards.first().locator('summary').click();
  const openedHeights = await cards.evaluateAll((items) => items.map((item) => Math.round(item.getBoundingClientRect().height)));
  expect(openedHeights[0]).toBeGreaterThan((closedHeights[0] ?? 0) + 50);
  expect(openedHeights.slice(1)).toEqual(closedHeights.slice(1));

  const clippedHeadings = await cards.locator('h4').evaluateAll((headings) => headings.filter((heading) => heading.scrollWidth > heading.clientWidth + 1).map((heading) => heading.textContent.trim()));
  expect(clippedHeadings).toEqual([]);
  const clippedComponents = await cards.first().locator('.main-feature-component-list button').evaluateAll((buttons) => buttons.filter((button) => button.scrollWidth > button.clientWidth + 1).map((button) => button.textContent.trim()));
  expect(clippedComponents).toEqual([]);
});

test('standard tablet and mobile widths keep every revised page inside the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await unlock(page);
  for (const destination of ['Overview', 'Streamer.bot', 'Commands']) {
    await page.getByRole('button', { name: destination, exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Alerts', exact: true }).click();
  await page.getByText('Donation provider setup', { exact: true }).click();
  const donationBounds = await page.locator('#kofi-integration-content').evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { left: box.left, right: box.right, width: box.width, viewport: document.documentElement.clientWidth };
  });
  expect(donationBounds.left).toBeGreaterThanOrEqual(-1);
  expect(donationBounds.right).toBeLessThanOrEqual(donationBounds.viewport + 1);
  expect(donationBounds.width).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Extensions', exact: true }).click();
  const wrappedNavigation = await page.locator('.workspace > nav .nav').evaluateAll((buttons) => buttons.filter((button) => button.scrollHeight > button.clientHeight + 1 || button.scrollWidth > button.clientWidth + 1).map((button) => button.textContent.trim()));
  expect(wrappedNavigation).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
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
  expect(download.suggestedFilename()).toBe('THSV-StreamBridge-Universal-Setup-4.0.0.sb');
  await expect(page.locator('#universal-import-state')).toContainText('Import this one file in Streamer.bot');
  await page.getByRole('button', { name: 'Review recommended triggers' }).click();
  await expect(page.locator('#universal-trigger-guide')).toHaveAttribute('open', '');
  await expect(page.locator('#universal-trigger-list')).toContainText('Native Platform Intake');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
