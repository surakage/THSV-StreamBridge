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
  await expect(page.getByRole('heading', { name: 'Add-ons' })).toBeVisible();
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
  await expect(page.getByText('Declarative Settings Example 1.0.0')).toBeVisible();
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
  await expect(page.getByText('Sample No-Op Add-On 1.0.0')).toBeVisible();
  await expect(page.getByText('Use Streamer.bot → Inspect now first.')).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Save action grants' }).click();
  await expect(page.getByText('Action grants saved for sample.no-op')).toBeVisible();
  const overlayUrl = await page.locator('[data-addon-overlay-url="sample.no-op"]').inputValue();
  expect(overlayUrl).toBe('http://127.0.0.1:8799/overlay/addons/sample.no-op');
  const overlay = await context.newPage();
  await overlay.goto(overlayUrl);
  await expect(overlay.getByText('LIVE')).toBeAttached();
  await page.getByRole('button', { name: 'Send preview card' }).click();
  await expect(page.getByText('Preview sent to the sample.no-op hosted overlay.')).toBeVisible();
  await expect(overlay.getByText('Overlay connection and scoped publication are working.')).toBeVisible();
});
