import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { zipSync } from 'fflate';

test('wizard installs and configures add-ons without injecting package code', async ({ page, context }) => {
  await page.goto('/wizard/');
  await page.getByLabel('Control token').fill('playwright-control-token-with-32-characters');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByText('Authenticated', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Add-ons' }).click();
  await expect(page.getByRole('heading', { name: 'Add-ons', exact: true })).toBeVisible();
  await expect(page.getByText('No add-ons are installed')).toBeVisible();

  const root = 'examples/addons/declarative-settings';
  const archive = zipSync({
    'module-package.json': await readFile(join(root, 'module-package.json')),
    'schemas/config.json': await readFile(join(root, 'schemas/config.json')),
    'ui/settings.json': await readFile(join(root, 'ui/settings.json')),
  });
  await page.getByLabel('Add-on package').setInputFiles({ name: 'settings.thsv-addon', mimeType: 'application/zip', buffer: Buffer.from(archive) });
  await page.getByLabel(/I reviewed and trust/u).check();
  await page.getByRole('button', { name: 'Verify and install' }).click();
  await expect(page.getByRole('article').getByText('Declarative Settings Example 1.0.0', { exact: true })).toBeVisible();
  await expect(page.getByText('THSV StreamBridge Project', { exact: false })).toBeVisible();
  await expect(page.getByText('state.private', { exact: false })).toBeVisible();

  await page.getByLabel('Heading').fill('My private add-on setting');
  await page.getByLabel('Accent').selectOption('green');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByLabel('Heading')).toHaveValue('My private add-on setting');
  await expect(page.locator('body')).not.toContainText('<script>');
  expect(await page.locator('.content').evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);

  const executableRoot = 'examples/addons/no-op';
  const descriptor = JSON.parse(await readFile(join(executableRoot, 'module-package.json'), 'utf8')) as { permissions: string[] };
  descriptor.permissions.push('streamerbot.run-approved-action', 'overlay.publish');
  const executableArchive = zipSync({
    'module-package.json': Buffer.from(`${JSON.stringify(descriptor, null, 2)}\n`),
    'dist/index.js': await readFile(join(executableRoot, 'dist/index.js')),
    'schemas/config.json': await readFile(join(executableRoot, 'schemas/config.json')),
  });
  await page.getByLabel('Add-on package').setInputFiles({ name: 'no-op.thsv-addon', mimeType: 'application/zip', buffer: Buffer.from(executableArchive) });
  await page.getByLabel(/I reviewed and trust/u).check();
  await page.getByRole('button', { name: 'Verify and install' }).click();
  await expect(page.getByRole('article').getByText('Sample No-Op Add-On 1.0.0', { exact: true })).toBeVisible();
  await page.getByText('Approved Streamer.bot actions', { exact: true }).click();
  await expect(page.getByText('Your saved action grants remain active.', { exact: false })).toBeVisible();
  await page.evaluate(`state.liveActions = [
    { id: 'ad3cf90f-b320-5ae2-a493-485a5485e0ce', name: 'THSV Addon - Random Clip Player - Get Clip Download', group: 'THSV StreamBridge - Add-ons', enabled: true },
    { id: 'f89e397b-7106-5101-a620-b0f5da4facf9', name: 'THSV Addon - Random Clip Player - Get Clips', group: 'THSV StreamBridge - Add-ons', enabled: true },
    { id: 'e32d29f1-fc2a-58e5-a1f2-a7731f29d940', name: 'THSV Command - Lurk', group: 'THSV StreamBridge - Commands', enabled: true },
  ]; renderAddOns();`);
  await expect(page.getByText('No actions approved yet.')).toBeVisible();
  const groupPicker = page.locator('[data-addon-action-group="sample.no-op"]');
  const actionPicker = page.locator('[data-addon-action-picker="sample.no-op"]');
  await expect(groupPicker).toHaveValue('THSV StreamBridge - Add-ons');
  await expect(actionPicker.locator('option')).toHaveCount(3);
  await expect(actionPicker).not.toContainText('THSV Command - Lurk');
  await groupPicker.selectOption('THSV StreamBridge - Commands');
  await expect(actionPicker.locator('option')).toHaveCount(2);
  await expect(actionPicker).toContainText('THSV Command - Lurk');
  await expect(actionPicker).not.toContainText('Random Clip Player');
  await groupPicker.selectOption('THSV StreamBridge - Add-ons');
  await actionPicker.selectOption('f89e397b-7106-5101-a620-b0f5da4facf9');
  await page.getByRole('button', { name: 'Add selected action' }).click();
  await expect(page.locator('.addon-approved-actions')).toContainText('THSV Addon - Random Clip Player - Get Clips');
  await expect(page.locator('.addon-approved-actions')).toContainText('THSV StreamBridge - Add-ons');
  await page.evaluate('state.liveActions = []; renderAddOns();');
  await expect(page.locator('.addon-approved-actions')).toContainText('THSV Addon - Random Clip Player - Get Clips');
  await expect(page.locator('.addon-approved-actions')).toContainText('saved grant remains active; status not checked this session');
  await expect(page.getByRole('button', { name: 'Refresh action names' })).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Save action grants' }).click();
  await expect(page.getByText('Action grants saved for sample.no-op')).toBeVisible();
  await page.getByText('Hosted overlay & testing', { exact: true }).click();
  const overlayUrl = await page.locator('[data-addon-overlay-url="sample.no-op"]').inputValue();
  expect(overlayUrl).toBe('http://127.0.0.1:8799/overlay/addons/sample.no-op');
  const overlay = await context.newPage();
  await overlay.goto(overlayUrl);
  await expect(overlay.getByText('LIVE')).toBeAttached();
  await page.getByRole('button', { name: 'Send preview card' }).click();
  await expect(page.getByText('Preview sent to the sample.no-op hosted overlay.')).toBeVisible();
  await expect(overlay.getByText('Overlay connection and scoped publication are working.')).toBeVisible();
});
