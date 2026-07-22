import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { zipSync } from 'fflate';

async function packageAddOn(root: string): Promise<Uint8Array> {
  const descriptorBytes = await readFile(join(root, 'module-package.json'));
  const descriptor = JSON.parse(descriptorBytes.toString('utf8')) as { files: Array<{ path: string }> };
  const entries: Record<string, Uint8Array> = { 'module-package.json': descriptorBytes };
  for (const file of descriptor.files) entries[file.path] = await readFile(join(root, ...file.path.split('/')));
  return zipSync(entries, { level: 9 });
}

test('wizard installs and configures add-ons without injecting package code', async ({ page, context }) => {
  await page.goto('/wizard/');
  await page.getByLabel('Control token').fill('playwright-control-token-with-32-characters');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByText('Authenticated', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Add-ons' }).click();
  await expect(page.getByRole('heading', { name: 'Add-ons', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check updates' })).toBeVisible();
  await expect(page.getByText('Update checks are manual and never install or enable an add-on.')).toBeVisible();
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
  await page.evaluate(`state.addOnUpdates = { available: true, updateCount: 1, revokedCount: 0, addOns: [{ moduleId: 'sample.declarative-settings', name: 'Declarative Settings Example', installedVersion: '1.0.0', latestVersion: '1.1.0', state: 'update-available', sha256: '${'a'.repeat(64)}' }] }; renderAddOns();`);
  await expect(page.getByText('Update available.', { exact: false })).toBeVisible();
  await expect(page.getByText('Latest official version: 1.1.0.', { exact: false })).toBeVisible();

  await page.getByLabel('Heading').fill('My private add-on setting');
  await page.getByLabel('Accent').selectOption('green');
  await page.getByRole('button', { name: 'Save all settings' }).click();
  await expect(page.getByLabel('Heading')).toHaveValue('My private add-on setting');
  await expect(page.locator('body')).not.toContainText('<script>');
  expect(await page.locator('.content').evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);

  await page.evaluate(`(() => {
    const addOn = state.addOns.find((candidate) => candidate.moduleId === 'sample.declarative-settings');
    addOn.configurationSchema.properties.destinations = { type: 'array', title: 'Destinations', items: { type: 'string', enum: ['twitch', 'youtube'] }, minItems: 1, maxItems: 2 };
    addOn.settings.destinations = ['twitch'];
    addOn.settingsUi = {
      intro: 'Choose the common settings first, then open advanced options only when needed.',
      sections: [
        { title: '1. Quick start', description: 'Common choices', open: true, fields: ['enabled', 'destinations'] },
        { title: '2. Advanced', description: 'Open only when needed', fields: ['heading', 'accent'] },
        { title: '3. Privacy', description: 'Review the provider before enabling.', notice: 'Only explicitly requested text leaves StreamBridge.', links: [{ label: 'Read provider terms', url: 'https://example.com/terms' }], fields: [] },
      ],
      fields: { heading: { visibleWhen: { field: 'enabled', equals: true } } },
    };
    renderAddOns();
  })()`);
  const quickStart = page.locator('summary').filter({ hasText: '1. Quick start' });
  const advanced = page.locator('summary').filter({ hasText: '2. Advanced' });
  const guidedSettings = page.locator('[data-addon-settings="sample.declarative-settings"]');
  await expect(quickStart).toBeVisible();
  await expect(advanced).toBeVisible();
  await expect(guidedSettings.getByText('Choose the common settings first', { exact: false })).toBeVisible();
  await expect(guidedSettings.getByLabel('Twitch')).toBeChecked();
  await expect(guidedSettings.getByLabel('YouTube')).not.toBeChecked();
  await expect(guidedSettings.getByLabel('Heading')).not.toBeVisible();
  await advanced.click();
  await expect(guidedSettings.getByLabel('Heading')).toBeVisible();
  await guidedSettings.locator('summary').filter({ hasText: '3. Privacy' }).click();
  await expect(guidedSettings.getByText('Only explicitly requested text leaves StreamBridge.')).toBeVisible();
  await expect(guidedSettings.getByRole('link', { name: 'Read provider terms' })).toHaveAttribute('href', 'https://example.com/terms');

  const userTranslateArchive = await packageAddOn('addons/user-translate');
  await page.getByLabel('Add-on package').setInputFiles({ name: 'user-translate.thsv-addon', mimeType: 'application/zip', buffer: Buffer.from(userTranslateArchive) });
  await page.getByLabel(/I reviewed and trust/u).check();
  await page.getByRole('button', { name: 'Verify and install' }).click();
  const userTranslateSettings = page.locator('[data-addon-settings="thsv.user-translate"]');
  await expect(page.getByRole('article').getByText('User Translate 1.0.0', { exact: true })).toBeVisible();
  await expect(userTranslateSettings.getByText('Set up viewer-requested translation in five short sections.', { exact: false })).toBeVisible();
  await expect(userTranslateSettings.locator('input[name="enabledPlatforms"][value="twitch"]')).toBeChecked();
  await expect(userTranslateSettings.locator('input[name="enabledPlatforms"][value="youtube"]')).toBeChecked();
  await expect(userTranslateSettings.locator('input[name="enabledPlatforms"][value="kick"]')).toBeChecked();
  await expect(userTranslateSettings.locator('input[name="enabledPlatforms"][value="tiktok"]')).toBeChecked();
  await userTranslateSettings.locator('summary').filter({ hasText: '5. Privacy and provider' }).click();
  await expect(userTranslateSettings.getByText('Only text from an explicit translation request', { exact: false })).toBeVisible();
  const providerTerms = userTranslateSettings.getByRole('link', { name: 'Read MyMemory terms' });
  await expect(providerTerms).toHaveAttribute('href', 'https://mymemory.translated.net/terms-and-conditions');
  await expect(providerTerms).toHaveAttribute('rel', 'noreferrer noopener');
  expect(await page.locator('.content').evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);

  const autoTranslateArchive = await packageAddOn('addons/auto-translate');
  await page.getByLabel('Add-on package').setInputFiles({ name: 'auto-translate.thsv-addon', mimeType: 'application/zip', buffer: Buffer.from(autoTranslateArchive) });
  await page.getByLabel(/I reviewed and trust/u).check();
  await page.getByRole('button', { name: 'Verify and install' }).click();
  const autoTranslateSettings = page.locator('[data-addon-settings="thsv.auto-translate"]');
  await expect(page.getByRole('article').getByText('Auto Translate 1.0.0', { exact: true })).toBeVisible();
  await expect(autoTranslateSettings.getByText('Auto Translate sends selected public chat text', { exact: false })).toBeVisible();
  await expect(autoTranslateSettings.locator('input[name="enabled"]')).not.toBeChecked();
  await autoTranslateSettings.locator('summary').filter({ hasText: '2. Audience' }).click();
  await expect(autoTranslateSettings.getByLabel('Who may be translated')).toHaveValue('allowlist-only');
  await autoTranslateSettings.locator('summary').filter({ hasText: '5. Safety limits' }).click();
  await expect(autoTranslateSettings.getByLabel('Maximum requests waiting')).toHaveValue('5');
  await autoTranslateSettings.locator('summary').filter({ hasText: '6. Chat rate limits' }).click();
  await expect(autoTranslateSettings.getByLabel('Maximum translated chat percentage')).toHaveValue('25');
  await autoTranslateSettings.locator('summary').filter({ hasText: '7. Review before enabling' }).click();
  await expect(autoTranslateSettings.getByText('Every selected public chat message is sent to MyMemory', { exact: false })).toBeVisible();
  await expect(autoTranslateSettings.getByRole('link', { name: 'Read MyMemory terms' })).toHaveAttribute('rel', 'noreferrer noopener');
  expect(await page.locator('.content').evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);

  const subathonArchive = await packageAddOn('addons/subathon-timer');
  await page.getByLabel('Add-on package').setInputFiles({ name: 'subathon-timer.thsv-addon', mimeType: 'application/zip', buffer: Buffer.from(subathonArchive) });
  await page.getByLabel(/I reviewed and trust/u).check();
  await page.getByRole('button', { name: 'Verify and install' }).click();
  const subathonSettings = page.locator('[data-addon-settings="thsv.subathon-timer"]');
  await expect(page.getByRole('article').getByText('Subathon Timer 1.1.0', { exact: true })).toBeVisible();
  await expect(subathonSettings.locator('summary')).toHaveCount(7);
  await expect(subathonSettings.getByLabel('Enable Subathon Timer')).toBeChecked();
  await expect(subathonSettings.locator('input[name="enabledPlatforms"]')).toHaveCount(4);
  await subathonSettings.locator('summary').filter({ hasText: '3. Manual controls' }).click();
  await expect(subathonSettings.getByText('Choose how Streamer.bot actions', { exact: false })).toBeVisible();
  await subathonSettings.locator('summary').filter({ hasText: '6. Overlay state' }).click();
  await expect(subathonSettings.getByLabel('Overlay background style')).toHaveValue('glass');
  await expect(page.locator('[data-addon-overlay-url="thsv.subathon-timer"]')).toHaveValue('http://127.0.0.1:8799/overlay/addons/thsv.subathon-timer');
  await subathonSettings.locator('summary').filter({ hasText: '7. Review before enabling' }).click();
  await expect(subathonSettings.getByText('Import the separate Subathon Timer Streamer.bot package', { exact: false })).toBeVisible();
  expect(await page.locator('.content').evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  const subathonOverlay = await context.newPage();
  await subathonOverlay.goto('http://127.0.0.1:8799/overlay/addons/thsv.subathon-timer');
  await expect(subathonOverlay.locator('#timer-shell')).toBeAttached();
  await expect(subathonOverlay.getByText('LIVE', { exact: true })).toBeAttached();
  await subathonOverlay.close();

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
  await expect(overlay.getByText('LIVE', { exact: true })).toBeAttached();
  await page.getByRole('button', { name: 'Send preview card' }).click();
  await expect(page.getByText('Preview sent to the sample.no-op hosted overlay.')).toBeVisible();
  await expect(overlay.getByText('Overlay connection and scoped publication are working.')).toBeVisible();
});
