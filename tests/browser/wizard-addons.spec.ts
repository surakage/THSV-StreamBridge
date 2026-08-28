import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { zipSync } from 'fflate';
import { STREAMBRIDGE_VERSION } from '../../bridge/version.js';

async function packageAddOn(root: string): Promise<Uint8Array> {
  const descriptorBytes = await readFile(join(root, 'module-package.json'));
  const descriptor = JSON.parse(descriptorBytes.toString('utf8')) as { files: Array<{ path: string }> };
  const entries: Record<string, Uint8Array> = { 'module-package.json': descriptorBytes };
  for (const file of descriptor.files) entries[file.path] = await readFile(join(root, ...file.path.split('/')));
  return zipSync(entries, { level: 9 });
}

async function openAddOnInstaller(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Add-ons', exact: true }).click();
  const installer = page.locator('[data-disclosure-key="panel:addon-marketplace:install"]');
  if ((await installer.getAttribute('open')) === null) await installer.locator('summary').click();
}

test('launcher ticket unlocks the wizard once without leaving the secret in browser history', async ({ page, request }) => {
  const response = await request.post('/wizard/api/unlock-tickets', { headers: { authorization: 'Bearer playwright-control-token-with-32-characters' } });
  expect(response.status()).toBe(201);
  const { ticket } = await response.json() as { ticket: string };
  await page.goto(`/wizard/#unlock=${ticket}`);
  await expect(page.locator('#mode')).toContainText('Authenticated');
  await expect(page.locator('#login')).toHaveClass(/hidden/u);
  expect(page.url()).toBe('http://127.0.0.1:8799/wizard/');
  const replay = await request.post('/wizard/api/unlock', { data: { ticket } });
  expect(replay.status()).toBe(401);
});

test('wizard prepares and starts a verified offline Bridge update without manual extraction', async ({ page }) => {
  const requests: Array<{ path: string; body: Record<string, unknown> }> = [];
  await page.route('**/wizard/api/updates/check', async (route) => await route.fulfill({ contentType: 'application/json', body: JSON.stringify({
    checkedAt: new Date().toISOString(), currentVersion: STREAMBRIDGE_VERSION, available: true, updateAvailable: true, latestVersion: '3.6.0', releaseName: 'THSV StreamBridge 3.6.0', releaseUrl: 'https://github.com/surakage/THSV-StreamBridge/releases/tag/v3.6.0', publishedAt: '2026-08-15T12:00:00Z', releaseNotes: 'Update center improvements.',
    archive: { name: 'THSV-StreamBridge-3.6.0.zip', url: 'https://github.com/surakage/THSV-StreamBridge/releases/download/v3.6.0/THSV-StreamBridge-3.6.0.zip', size: 40_000_000 },
    checksum: { name: 'THSV-StreamBridge-3.6.0.zip.sha256', url: 'https://github.com/surakage/THSV-StreamBridge/releases/download/v3.6.0/THSV-StreamBridge-3.6.0.zip.sha256', size: 100 },
  }) }));
  await page.route('**/wizard/api/updates/stage', async (route) => {
    requests.push({ path: 'stage', body: route.request().postDataJSON() as Record<string, unknown> });
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ version: '3.6.0', archiveName: 'THSV-StreamBridge-3.6.0.zip', archivePath: 'C:\\Updates\\THSV-StreamBridge-3.6.0.zip', sha256: 'a'.repeat(64), provenance: 'verified', repository: 'surakage/THSV-StreamBridge', workflow: 'release.yml@v3.6.0', applyReady: true }) });
  });
  await page.route('**/wizard/api/updates/apply', async (route) => {
    requests.push({ path: 'apply', body: route.request().postDataJSON() as Record<string, unknown> });
    await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ accepted: true, version: '3.6.0', installRoot: 'C:\\THSV StreamBridge', message: 'The verified updater started. StreamBridge will restart and reopen the wizard.' }) });
  });
  page.on('dialog', async (dialog) => await dialog.accept());
  await page.goto('/wizard/');
  await page.getByLabel('Control token').fill('playwright-control-token-with-32-characters');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await page.getByRole('button', { name: 'Check for updates' }).click();
  await page.getByRole('button', { name: /Download & prepare/u }).click();
  await expect(page.getByRole('button', { name: 'Install verified update' })).toBeVisible();
  await page.getByRole('button', { name: 'Install verified update' }).click();
  await expect(page.locator('#update-state')).toContainText('restart and reopen the wizard');
  expect(requests).toEqual([
    { path: 'stage', body: { version: '3.6.0', approvedByCreator: true } },
    { path: 'apply', body: { version: '3.6.0', approvedByCreator: true } },
  ]);
});

test('wizard installs and configures add-ons without injecting package code', async ({ page, context }) => {
  test.setTimeout(90_000);
  await page.goto('/wizard/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', /^(?:dark|light)$/u);
  const initialTheme = await page.locator('html').getAttribute('data-theme');
  await page.locator('#theme-toggle').click();
  const selectedTheme = initialTheme === 'dark' ? 'light' : 'dark';
  await expect(page.locator('html')).toHaveAttribute('data-theme', selectedTheme);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', selectedTheme);
  await page.getByLabel('Control token').fill('playwright-control-token-with-32-characters');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.locator('#mode')).toContainText('Authenticated');
  await expect(page.locator('.workspace > nav .nav-heading')).toHaveText(['Core setup', 'Automation', 'On stream', 'Foundation', 'Features', 'Advanced']);
  await expect(page.locator('[data-panel="overview"] .page-kicker')).toHaveText('Home');
  const versionCard = page.locator('#overview-cards .stat').filter({ hasText: 'Version' });
  await expect(versionCard).toContainText(STREAMBRIDGE_VERSION);
  await expect(page.locator('#overview-cards .stat').filter({ hasText: 'Preview' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Community Analytics', exact: true }).click();
  await expect(page.locator('[data-panel="community-analytics"]')).toContainText('Installed and updated with THSV StreamBridge');
  await expect(page.locator('[data-panel="community-analytics"]')).toContainText('Always installed');
  await expect(page.locator('[data-panel="community-analytics"] [data-addon-settings="thsv.community-analytics"]')).toBeVisible();
  await expect(page.locator('[data-panel="community-analytics"] [data-analytics-admin-output]')).toBeVisible();
  await page.getByRole('button', { name: 'Extensions', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Extensions', exact: true })).toBeVisible();
  await expect(page.locator('[data-panel="addons"] > .page-header')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check official updates' })).toBeHidden();
  await expect(page.locator('[data-panel="addons"] #addon-install-form')).toHaveCount(0);
  await openAddOnInstaller(page);
  await expect(page.getByRole('heading', { name: 'Add-ons', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check official updates' })).toBeVisible();
  await expect(page.locator('#addon-update-state')).not.toBeEmpty();
  await expect(page.getByText('No optional add-ons are installed', { exact: false })).toBeVisible();

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
  await expect(page.locator('#wizard-feedback')).toContainText('Installed sample.declarative-settings 1.0.0');
  await page.getByRole('button', { name: 'Extensions', exact: true }).click();
  await expect(page.locator('#addon-state')).toContainText('built-in extension');
  await expect(page.getByRole('heading', { name: 'Built-in extension groups' })).toBeVisible();
  await expect(page.getByText('7 groups', { exact: true })).toBeVisible();
  await expect(page.locator('[data-main-feature]')).toHaveCount(7);
  await expect(page.locator('[data-toggle-feature-family]')).toHaveCount(7);
  await expect(page.locator('#addon-state')).toContainText('7 built-in extension groups');
  await page.evaluate(`(() => {
    const template = state.addOns.find((candidate) => candidate.moduleId === 'sample.declarative-settings');
    state.addOns.push({ ...structuredClone(template), moduleId: 'thsv.voice-relay', name: 'Village Voice', enabled: true });
    renderAddOns();
  })()`);
  await page.getByRole('button', { name: 'Configure Voice & Language' }).click();
  await expect(page.locator('#addon-selector')).toHaveValue('thsv.voice-relay');
  await expect(page.locator('[data-addon-id="thsv.voice-relay"]')).toBeVisible();
  await page.evaluate(`state.addOns = state.addOns.filter((candidate) => candidate.moduleId !== 'thsv.voice-relay'); renderAddOns();`);
  const groupDetails = page.locator('.main-feature-details');
  await groupDetails.nth(0).locator('summary').click();
  await expect(groupDetails.nth(0)).toHaveAttribute('open', '');
  await groupDetails.nth(1).locator('summary').click();
  await expect(groupDetails.nth(1)).toHaveAttribute('open', '');
  await expect(groupDetails.nth(0)).not.toHaveAttribute('open', '');
  const migrationRows = await page.evaluate(`state.featureMigrations = [{ moduleId: 'sample.declarative-settings', name: 'Declarative Settings Example', sourceVersion: '0.9.0', discoveredAt: '2026-08-15T00:00:00.000Z', originalEnabled: false, installed: true, currentlyEnabled: false, status: 'pending', stagedData: true, stagedFiles: 3, stagedBytes: 2048, activeData: false }, { moduleId: 'thsv.automated-shoutouts', name: 'thsv.automated-shoutouts', sourceVersion: '3.5.0', discoveredAt: '2026-08-15T00:00:00.000Z', originalEnabled: true, installed: true, currentlyEnabled: true, status: 'imported', dataImported: true, stagedData: false, stagedFiles: 0, stagedBytes: 0, activeData: false }]; renderAddOns(); document.querySelectorAll('[data-feature-migration]').length;`);
  expect(migrationRows).toBe(2);
  const migration = page.locator('[data-feature-migration="sample.declarative-settings"]');
  await expect(page.getByRole('heading', { name: 'Choose what comes into the full Bridge' })).toBeVisible();
  await expect(migration).toContainText('3 saved files · 2 KB');
  await expect(migration.getByLabel('Import saved settings and history')).toBeChecked();
  await expect(migration.getByLabel('Enable component after restart')).not.toBeChecked();
  await expect(migration.getByRole('button', { name: 'Apply this migration' })).toBeEnabled();
  const friendlyMigration = page.locator('[data-feature-migration="thsv.automated-shoutouts"]');
  await expect(friendlyMigration).toContainText('Automated Shoutouts');
  await expect(friendlyMigration).not.toContainText('thsv.automated-shoutouts');
  await expect(friendlyMigration).toContainText('Previous version 3.5.0');
  await expect(friendlyMigration).toContainText('No saved data found');
  await expect(friendlyMigration).toContainText('Imported');
  await page.evaluate('state.featureMigrations = []; renderAddOns();');
  await page.getByRole('button', { name: 'Add-ons', exact: true }).click();
  await expect(page.locator('[data-addon-id="sample.declarative-settings"] .addon-card-status')).toContainText('Restart required');
  await expect(page.locator('[data-addon-id="sample.declarative-settings"] .addon-runtime-summary')).toContainText('restart StreamBridge');
  await expect(page.getByRole('button', { name: 'Apply changes and verify' })).toBeVisible();
  await page.evaluate(`(() => {
    const nextStart = new Date(Date.parse(state.addOnRuntime.startedAt) + 1000).toISOString();
    syncAddOnRestartState(nextStart);
    renderAddOns();
  })()`);
  await expect(page.locator('[data-addon-id="sample.declarative-settings"] .addon-card-status')).not.toContainText('Restart required');
  await expect(page.locator('[data-addon-id="sample.declarative-settings"] .addon-card-status')).toContainText('Not loaded');
  await page.getByText('Package and publisher details', { exact: true }).click();
  await expect(page.getByText('THSV StreamBridge Project', { exact: false })).toBeVisible();
  await expect(page.getByText('state.private', { exact: false })).toBeVisible();
  await page.evaluate(`state.addOnUpdates = { available: true, updateCount: 1, revokedCount: 0, addOns: [{ moduleId: 'sample.declarative-settings', name: 'Declarative Settings Example', installedVersion: '1.0.0', latestVersion: '1.1.0', state: 'update-available', sha256: '${'a'.repeat(64)}', downloadUrl: 'https://github.com/surakage/THSV-StreamBridge/releases/download/v2.4.1/sample.zip' }] }; renderAddOns();`);
  await expect(page.getByText('Update available.', { exact: false })).toBeVisible();
  await expect(page.getByText('Latest authenticated version: 1.1.0.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Update safely' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download for review' })).toBeVisible();
  await expect(page.getByText('Saved settings and private state remain intact', { exact: false })).toBeVisible();

  const addOnHeading = page.locator('[data-addon-settings] [name="heading"]');
  await addOnHeading.fill('My private add-on setting');
  await page.getByLabel('Accent').selectOption('green');
  await page.getByRole('button', { name: 'Save all settings' }).click();
  await expect(page.locator('#wizard-feedback')).toContainText('Settings saved for sample.declarative-settings');
  await expect(page.locator('#wizard-feedback')).toHaveAttribute('data-kind', 'success');
  await expect(page.locator('#addon-state')).toContainText('Restart StreamBridge');
  await expect(addOnHeading).toHaveValue('My private add-on setting');
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
  const guidedSettings = page.locator('[data-addon-settings="sample.declarative-settings"]');
  const quickStart = guidedSettings.locator('summary').filter({ hasText: 'Quick start' });
  const advanced = guidedSettings.locator('summary').filter({ hasText: 'Advanced' });
  await expect(quickStart).toBeVisible();
  await expect(advanced).toBeVisible();
  await expect(guidedSettings.getByText('Choose the common settings first', { exact: false })).toBeVisible();
  await expect(guidedSettings.getByLabel('Twitch')).toBeChecked();
  await expect(guidedSettings.getByLabel('YouTube')).not.toBeChecked();
  await expect(guidedSettings.getByLabel('Heading')).not.toBeVisible();
  await guidedSettings.getByRole('button', { name: 'Expand all' }).click();
  await expect(guidedSettings.locator('.addon-settings-section[open]')).toHaveCount(3);
  await guidedSettings.getByRole('button', { name: 'Collapse all' }).click();
  await expect(guidedSettings.locator('.addon-settings-section[open]')).toHaveCount(0);
  await quickStart.click();
  await advanced.click();
  await expect(guidedSettings.getByLabel('Heading')).toBeVisible();
  await guidedSettings.locator('summary').filter({ hasText: 'Privacy' }).click();
  await expect(guidedSettings.getByText('Only explicitly requested text leaves StreamBridge.')).toBeVisible();
  await expect(guidedSettings.getByRole('link', { name: 'Read provider terms' })).toHaveAttribute('href', 'https://example.com/terms');

  await page.evaluate(`(() => {
    const template = state.addOns.find((candidate) => candidate.moduleId === 'sample.declarative-settings');
    const voice = JSON.parse(JSON.stringify(template));
    voice.moduleId = 'thsv.voice-relay'; voice.name = 'Village Voice'; voice.settings = { voiceAlias: 'THSV Male' };
    const hydration = JSON.parse(JSON.stringify(template));
    hydration.moduleId = 'thsv.village-hydration-station'; hydration.name = 'Village Hydration Station';
    hydration.configurationSchema.properties = {
      speakerEnabled: { type: 'boolean', title: 'Speaker.bot announcements' },
      voiceAlias: { type: 'string', title: 'Speaker.bot voice alias', maxLength: 80 },
    };
    hydration.settings = { speakerEnabled: true, voiceAlias: '' };
    hydration.settingsUi = { order: ['speakerEnabled', 'voiceAlias'], sections: [{ id: 'controls', title: 'Voice', open: true, fields: ['speakerEnabled', 'voiceAlias'] }] };
    state.addOns.push(voice, hydration); state.selectedAddOnId = hydration.moduleId; renderAddOns();
  })()`);
  const hydrationTriggerReadiness = page.locator('[data-addon-id="thsv.village-hydration-station"] .addon-trigger-readiness');
  await expect(hydrationTriggerReadiness).toContainText('No voice setup');
  await expect(hydrationTriggerReadiness).toContainText('Hydration does not use Voice Control');
  const hydrationVoiceAlias = page.locator('[data-addon-settings="thsv.village-hydration-station"] input[name="voiceAlias"]');
  await expect(hydrationVoiceAlias).toHaveValue('THSV Male');
  await page.evaluate(`(() => { const hydration = state.addOns.find((candidate) => candidate.moduleId === 'thsv.village-hydration-station'); hydration.settings.voiceAlias = 'Hydration Custom'; renderAddOns(); })()`);
  await expect(page.locator('[data-addon-settings="thsv.village-hydration-station"] input[name="voiceAlias"]')).toHaveValue('Hydration Custom');
  await page.evaluate(`(() => { state.liveActions = []; state.addOns = state.addOns.filter((candidate) => !['thsv.voice-relay', 'thsv.village-hydration-station'].includes(candidate.moduleId)); state.selectedAddOnId = 'sample.declarative-settings'; renderAddOns(); })()`);

  const userTranslateArchive = await packageAddOn('addons/user-translate');
  await openAddOnInstaller(page);
  await page.getByLabel('Add-on package').setInputFiles({ name: 'user-translate.thsv-addon', mimeType: 'application/zip', buffer: Buffer.from(userTranslateArchive) });
  await page.getByLabel(/I reviewed and trust/u).check();
  await page.getByRole('button', { name: 'Verify and install' }).click();
  const userTranslateSettings = page.locator('[data-addon-settings="thsv.user-translate"]');
  await expect(page.getByRole('article').getByText(`Translate ${STREAMBRIDGE_VERSION}`, { exact: true })).toBeVisible();
  await expect(page.locator('[data-addon-id="thsv.user-translate"] .addon-quick-summary')).toContainText('included commands');
  await expect(page.locator('[data-addon-id="thsv.user-translate"] .addon-quick-summary')).not.toContainText('Setup stepsNone');
  await expect(userTranslateSettings.getByText('One translation add-on, one Streamer.bot action.', { exact: false })).toBeVisible();
  await expect(userTranslateSettings.locator('input[name="enabledPlatforms"][value="twitch"]')).toBeChecked();
  await expect(userTranslateSettings.locator('input[name="enabledPlatforms"][value="youtube"]')).toBeChecked();
  await expect(userTranslateSettings.locator('input[name="enabledPlatforms"][value="kick"]')).toBeChecked();
  await expect(userTranslateSettings.locator('input[name="enabledPlatforms"][value="tiktok"]')).toBeChecked();
  const automaticSection = userTranslateSettings.locator('.addon-settings-section').filter({ hasText: 'Automatically translate these viewer names or IDs' });
  await expect(userTranslateSettings.getByLabel('Translation mode')).toHaveValue('manual');
  await expect(automaticSection).toBeHidden();
  await userTranslateSettings.getByLabel('Translation mode').selectOption('both');
  await expect(automaticSection).toBeVisible();
  await automaticSection.locator('summary').click();
  await expect(userTranslateSettings.getByLabel('Automatically translate these viewer names or IDs')).toBeVisible();
  const quickStartSection = userTranslateSettings.locator('.addon-settings-section').filter({ hasText: 'Choose how translation works' });
  await expect(quickStartSection).toHaveAttribute('open', '');
  await quickStartSection.locator('summary').click();
  await expect(quickStartSection).not.toHaveAttribute('open', '');
  await userTranslateSettings.getByRole('button', { name: 'Save all settings' }).click();
  await expect(page.locator('#addon-state')).toContainText('Settings saved for thsv.user-translate');
  await expect(page.locator('[data-addon-settings="thsv.user-translate"] .addon-settings-section').filter({ hasText: 'Choose how translation works' })).not.toHaveAttribute('open', '');
  await userTranslateSettings.locator('summary').filter({ hasText: 'Privacy review' }).click();
  await expect(userTranslateSettings.getByText('Only eligible public chat text', { exact: false })).toBeVisible();
  const providerTerms = userTranslateSettings.getByRole('link', { name: 'MyMemory terms' });
  await expect(providerTerms).toHaveAttribute('href', 'https://mymemory.translated.net/terms-and-conditions');
  await expect(providerTerms).toHaveAttribute('rel', 'noreferrer noopener');
  const triggerStatus = page.locator('[data-addon-id="thsv.user-translate"] .addon-trigger-readiness .status-chip');
  await expect(triggerStatus).toBeVisible();
  expect(await triggerStatus.evaluate((element) => {
    const style = getComputedStyle(element);
    return { display: style.display, whiteSpace: style.whiteSpace, singleLine: element.scrollHeight <= element.clientHeight };
  })).toEqual({ display: 'flex', whiteSpace: 'nowrap', singleLine: true });
  expect(await page.locator('.content').evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);

  const shoutoutArchive = await packageAddOn('addons/automated-shoutouts');
  await openAddOnInstaller(page);
  await page.getByLabel('Add-on package').setInputFiles({ name: 'automated-shoutouts.thsv-addon', mimeType: 'application/zip', buffer: Buffer.from(shoutoutArchive) });
  await page.getByLabel(/I reviewed and trust/u).check();
  await page.getByRole('button', { name: 'Verify and install' }).click();
  const shoutoutSettings = page.locator('[data-addon-settings="thsv.automated-shoutouts"]');
  await expect(page.getByRole('article').getByText(`Automated Shoutouts ${STREAMBRIDGE_VERSION}`, { exact: true })).toBeVisible();
  await expect(page.locator('[data-addon-id="thsv.automated-shoutouts"] .addon-runtime-summary')).toContainText('Overlay not connected');
  await expect(shoutoutSettings.locator('summary')).toHaveCount(9);
  await shoutoutSettings.locator('summary').filter({ hasText: 'Platform-colored visual cards' }).click();
  await expect(shoutoutSettings.getByLabel('Show a platform-colored visual card')).toBeChecked();
  await expect(shoutoutSettings.locator('input[name="twitchVisualTriggers"]:checked')).toHaveCount(3);
  await expect(shoutoutSettings.getByLabel('Manual moderator shoutouts')).toBeChecked();
  await expect(shoutoutSettings.getByLabel('Safety-approved daily welcomes')).toBeChecked();
  await expect(shoutoutSettings.locator('input[name="overlayPlatforms"]:checked')).toHaveCount(4);
  await expect(page.locator('[data-addon-overlay-url="thsv.automated-shoutouts"]')).toHaveValue('http://127.0.0.1:8799/overlay/shoutouts');
  await shoutoutSettings.getByLabel('Show a platform-colored visual card').uncheck();
  await expect(shoutoutSettings.locator('input[name="overlayPlatforms"]').first()).not.toBeVisible();
  await shoutoutSettings.getByLabel('Show a platform-colored visual card').check();
  await expect(shoutoutSettings.getByText('No clips are retrieved or played', { exact: false })).toBeVisible();
  expect(await page.locator('.content').evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);

  const subathonArchive = await packageAddOn('addons/subathon-timer');
  await openAddOnInstaller(page);
  await page.getByLabel('Add-on package').setInputFiles({ name: 'subathon-timer.thsv-addon', mimeType: 'application/zip', buffer: Buffer.from(subathonArchive) });
  await page.getByLabel(/I reviewed and trust/u).check();
  await page.getByRole('button', { name: 'Verify and install' }).click();
  const subathonSettings = page.locator('[data-addon-settings="thsv.subathon-timer"]');
  await expect(page.getByRole('article').getByText(`Subathon Timer ${STREAMBRIDGE_VERSION}`, { exact: true })).toBeVisible();
  await expect(subathonSettings.locator('summary')).toHaveCount(11);
  await expect(subathonSettings.getByLabel('Enable Subathon Timer')).toBeChecked();
  await expect(subathonSettings.locator('input[name="enabledPlatforms"]')).toHaveCount(6);
  await expect(subathonSettings.locator('input[name="enabledPlatforms"][value="streamlabs"]')).toBeChecked();
  await expect(subathonSettings.locator('input[name="enabledPlatforms"][value="kofi"]')).toBeChecked();
  await subathonSettings.locator('summary').filter({ hasText: 'Manual controls' }).click();
  await expect(subathonSettings.getByText('Choose how Streamer.bot actions', { exact: false })).toBeVisible();
  await subathonSettings.locator('summary').filter({ hasText: 'Overlay layout' }).click();
  await expect(subathonSettings.getByLabel('Overlay background style')).toHaveValue('glass');
  await expect(page.locator('[data-addon-overlay-url="thsv.subathon-timer"]')).toHaveValue('http://127.0.0.1:8799/overlay/subathon');
  await subathonSettings.locator('summary').filter({ hasText: 'Review before enabling' }).click();
  await expect(subathonSettings.getByText('Import the separate Subathon Timer Streamer.bot package', { exact: false })).toBeVisible();
  expect(await page.locator('.content').evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  const subathonOverlay = await context.newPage();
  await subathonOverlay.goto('http://127.0.0.1:8799/overlay/subathon');
  await expect(subathonOverlay.locator('#timer-shell')).toBeAttached();
  await expect(subathonOverlay.getByText('LIVE', { exact: true })).toBeAttached();
  await subathonOverlay.close();

  const countdownArchive = await packageAddOn('addons/starting-soon-countdown');
  await openAddOnInstaller(page);
  await page.getByLabel('Add-on package').setInputFiles({ name: 'starting-soon-countdown.thsv-addon', mimeType: 'application/zip', buffer: Buffer.from(countdownArchive) });
  await page.getByLabel(/I reviewed and trust/u).check();
  await page.getByRole('button', { name: 'Verify and install' }).click();
  const countdownSettings = page.locator('[data-addon-settings="thsv.starting-soon-countdown"]');
  await expect(page.getByRole('article').getByText(`Stream Launch Countdown ${STREAMBRIDGE_VERSION}`, { exact: true })).toBeVisible();
  await expect(countdownSettings.locator('summary')).toHaveCount(6);
  await expect(countdownSettings.locator('input[name="durationMinutes"]')).toHaveValue('10');
  await countdownSettings.locator('[data-disclosure-key="addon:thsv.starting-soon-countdown:settings:finish"] > summary').click();
  await expect(countdownSettings.getByLabel('Message shown when the countdown ends')).toHaveValue('The stream is starting now!');
  await expect(countdownSettings.getByLabel('Optional completion tone')).toHaveValue('soft-chime');
  await countdownSettings.locator('summary').filter({ hasText: 'Optional scene switch' }).click();
  await expect(countdownSettings.getByLabel('Run an approved Streamer.bot action at zero')).not.toBeChecked();
  await countdownSettings.locator('summary').filter({ hasText: 'Overlay layout' }).click();
  await expect(countdownSettings.getByLabel('Background style')).toHaveValue('glass');
  await expect(page.locator('[data-addon-overlay-url="thsv.starting-soon-countdown"]')).toHaveValue('http://127.0.0.1:8799/overlay/countdown');
  const countdownOverlay = await context.newPage();
  await countdownOverlay.goto('http://127.0.0.1:8799/overlay/countdown');
  await expect(countdownOverlay.locator('#timer-shell')).toBeAttached();
  await page.locator('[data-addon-id="thsv.starting-soon-countdown"]').getByText('Open overlay & test', { exact: true }).click();
  await page.locator('[data-addon-id="thsv.starting-soon-countdown"] [data-preview-addon-overlay="thsv.starting-soon-countdown"]').click();
  await expect(page.locator('#wizard-feedback')).toContainText('Exact-template preview sent for thsv.starting-soon-countdown');
  await expect(page.locator('#wizard-feedback')).toHaveAttribute('data-kind', 'success');
  await expect(countdownOverlay.locator('#timer-shell')).toBeVisible();
  await expect(countdownOverlay.locator('#timer-label')).toHaveText('STARTING SOON');
  await expect(countdownOverlay.locator('#timer-time')).toHaveText('00:10:00');
  await countdownOverlay.waitForTimeout(1_100);
  await expect(countdownOverlay.locator('#timer-shell')).toBeVisible();
  await page.locator('[data-addon-id="thsv.starting-soon-countdown"] [data-hide-addon-overlay="thsv.starting-soon-countdown"]').click();
  await expect(countdownOverlay.locator('#timer-shell')).toBeHidden();
  await countdownOverlay.close();

  const sceneActionsArchive = await packageAddOn('addons/scene-actions');
  await openAddOnInstaller(page);
  await page.getByLabel('Add-on package').setInputFiles({ name: 'scene-actions.thsv-addon', mimeType: 'application/zip', buffer: Buffer.from(sceneActionsArchive) });
  await page.getByLabel(/I reviewed and trust/u).check();
  await page.getByRole('button', { name: 'Verify and install' }).click();
  const sceneSettings = page.locator('[data-addon-settings="thsv.scene-actions"]');
  await expect(page.getByRole('article').getByText(`Scene Actions ${STREAMBRIDGE_VERSION}`, { exact: true })).toBeVisible({ timeout: 15_000 });
  const sceneTriggerStatus = page.locator('[data-addon-id="thsv.scene-actions"] .addon-trigger-readiness');
  await expect(sceneTriggerStatus).toContainText('Not checked');
  await expect(sceneTriggerStatus).toContainText('OBS Studio > Scene Changed');
  await page.evaluate(`state.liveActions = [{
    id: '18bdc91c-64eb-4787-8be9-6a921b272943', name: 'THSV Scene Actions - Intake',
    group: 'THSV Addon - Scene Actions', enabled: true, triggerCount: 3
  }]; renderAddOns();`);
  await expect(page.locator('[data-addon-id="thsv.scene-actions"] .addon-trigger-readiness')).toContainText('Ready');
  await expect(page.locator('[data-addon-id="thsv.scene-actions"] .addon-trigger-readiness')).toContainText('3 attached triggers reported');
  await page.evaluate(`state.liveActions = [{
    id: '18bdc91c-64eb-4787-8be9-6a921b272943', name: 'THSV Scene Actions - Intake',
    group: 'Old Combined Add-ons', enabled: true, triggerCount: 3
  }]; renderAddOns();`);
  await expect(page.locator('[data-addon-id="thsv.scene-actions"] .addon-trigger-readiness')).toContainText('Setup needed');
  await expect(page.locator('[data-addon-id="thsv.scene-actions"] .addon-trigger-readiness')).toContainText('instead of its expected "THSV Addon - Scene Actions" group');
  await page.evaluate(`state.liveActions = [{
    id: '18bdc91c-64eb-4787-8be9-6a921b272943', name: 'THSV Scene Actions - Intake',
    group: 'THSV Addon - Scene Actions', enabled: true, triggerCount: 3
  }]; renderAddOns();`);
  await sceneSettings.locator('summary').filter({ hasText: 'Scene mappings' }).click();
  await expect(sceneSettings.getByText('Scene-to-action mappings')).toBeVisible();
  await expect(sceneSettings.locator('[data-scene-mapping-row]')).toHaveCount(5);
  await expect(sceneSettings.locator('[data-scene-mapping-field="sceneName"]').first()).toHaveValue('Starting Soon');
  await expect(sceneSettings.locator('[data-scene-mapping-field="actionId"]').first()).toHaveValue('68fa3646-8b6c-4ef0-bf96-19474de8b620');
  await sceneSettings.getByRole('button', { name: 'Add scene mapping' }).click();
  await expect(sceneSettings.locator('[data-scene-mapping-row]')).toHaveCount(6);
  const addedMapping = sceneSettings.locator('[data-scene-mapping-row]').last();
  await addedMapping.locator('[data-scene-mapping-field="provider"]').selectOption('meld');
  await addedMapping.locator('[data-scene-mapping-field="sceneName"]').fill('Intermission');
  await addedMapping.locator('[data-scene-mapping-field="actionId"]').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Save all settings' }).click();
  await expect(page.locator('[data-addon-settings="thsv.scene-actions"] [data-scene-mapping-row]')).toHaveCount(6);
  await expect(page.locator('.content').evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).resolves.toBe(true);

  await page.getByRole('button', { name: 'Alerts', exact: true }).click();
  await page.locator('[data-panel="alerts"] summary').filter({ hasText: 'Donation provider setup' }).click();
  const kofiIntegration = page.locator('#kofi-integration-content .kofi-donations-integration');
  await expect(kofiIntegration.getByText('Built-in donation provider', { exact: true })).toBeVisible();
  await expect(kofiIntegration.getByText('Installed and updated with THSV StreamBridge', { exact: true })).toBeVisible();
  await expect(kofiIntegration).toContainText('select Ko-fi Donations when creating the one universal Streamer.bot import');
  await expect(kofiIntegration.locator('[data-addon-settings="thsv.kofi-donations"]')).toBeVisible();
  await page.evaluate('state.liveActions = [];');

  const raidScoutArchive = await packageAddOn('addons/raid-scout');
  await openAddOnInstaller(page);
  await page.getByLabel('Add-on package').setInputFiles({ name: 'raid-scout.thsv-addon', mimeType: 'application/zip', buffer: Buffer.from(raidScoutArchive) });
  await page.getByLabel(/I reviewed and trust/u).check();
  await page.getByRole('button', { name: 'Verify and install' }).click();
  const raidScoutSettings = page.locator('[data-addon-settings="thsv.raid-scout"]');
  await expect(page.getByRole('article').getByText(`Raid Scout ${STREAMBRIDGE_VERSION}`, { exact: true })).toBeVisible();
  await expect(page.locator('[data-addon-id="thsv.raid-scout"] .addon-trigger-readiness')).toContainText('Use the existing chat intakes');
  await expect(raidScoutSettings.locator('summary')).toHaveCount(14);
  await expect(raidScoutSettings.getByLabel('Enable Raid Scout')).toBeChecked();
  await expect(raidScoutSettings.getByLabel('Raid confirmation mode')).toHaveValue('required');
  await expect(raidScoutSettings.getByLabel('Show each search phase on the Raid Scout overlay')).toBeChecked();
  await expect(raidScoutSettings.getByLabel('Play one random clip before starting the confirmed raid')).not.toBeChecked();
  await expect(raidScoutSettings.getByLabel('Ending-scene broadcast app').locator('option')).toHaveText(['OBS Studio']);
  await page.evaluate(`state.broadcastConnections = { connections: [{ provider: 'meld', enabled: true }, { provider: 'streamlabs', enabled: true }] }; state.sceneCatalog = { refreshAvailable: true, providers: { obs: { scenes: ['📁 Stream Ending', '🎞 Ending Soon'] }, meld: { scenes: [] }, streamlabs: { scenes: [] } } }; renderAddOns();`);
  const renderedRaidScoutSettings = page.locator('[data-addon-settings="thsv.raid-scout"]');
  await renderedRaidScoutSettings.getByLabel('Start Raid Scout on an ending scene').check();
  const endingScenePicker = renderedRaidScoutSettings.locator('[data-scene-name-picker]');
  await expect(endingScenePicker.getByLabel('Detected scene')).toBeVisible();
  await expect(endingScenePicker.getByLabel('Detected scene').locator('option')).toHaveText(['Choose a detected scene…', '📁 Stream Ending', '🎞 Ending Soon']);
  await endingScenePicker.getByLabel('Detected scene').selectOption('📁 Stream Ending');
  await expect(endingScenePicker.getByLabel('Exact scene name')).toHaveValue('📁 Stream Ending');
  await raidScoutSettings.locator('summary').filter({ hasText: 'Where to search' }).click();
  await expect(raidScoutSettings.getByLabel('Search preferred channels')).toBeChecked();
  await raidScoutSettings.locator('summary').filter({ hasText: 'Preferred channels' }).click();
  await expect(raidScoutSettings.getByLabel('Permanent preferred Twitch channels')).toBeVisible();
  await expect(raidScoutSettings.getByLabel('Let viewers suggest channels')).not.toBeChecked();
  await expect(raidScoutSettings.getByLabel('Twitch suggestion reward ID')).not.toBeVisible();
  await raidScoutSettings.getByLabel('Let viewers suggest channels').check();
  await expect(raidScoutSettings.getByLabel('Twitch suggestion reward ID')).toBeVisible();
  await expect(raidScoutSettings.getByLabel('Maximum viewer suggestions per stream')).toHaveValue('20');
  await expect(raidScoutSettings.getByText('Suggestions clear after the stream', { exact: false })).toBeVisible();
  await raidScoutSettings.getByLabel('Search preferred channels').uncheck();
  await expect(raidScoutSettings.getByLabel('Permanent preferred Twitch channels')).not.toBeVisible();
  await raidScoutSettings.locator('summary').filter({ hasText: 'Search limits' }).click();
  await raidScoutSettings.getByLabel('Search followed live channels').uncheck();
  await expect(raidScoutSettings.getByLabel('Maximum followed candidates')).not.toBeVisible();
  await expect(raidScoutSettings.getByLabel('Maximum same-category candidates')).toBeVisible();
  await raidScoutSettings.locator('summary').filter({ hasText: 'Confirmation and chat messages' }).click();
  const noCandidateMessage = raidScoutSettings.locator('textarea[name="noCandidateMessage"]');
  await expect(noCandidateMessage).not.toBeVisible();
  await raidScoutSettings.getByLabel('Post a no-candidate message in Twitch chat').check();
  await expect(noCandidateMessage).toBeVisible();
  await raidScoutSettings.locator('summary').filter({ hasText: 'Optional automatic broadcast ending' }).click();
  await raidScoutSettings.getByLabel('End the broadcast after the raid attempt').check();
  const broadcastApplication = raidScoutSettings.getByLabel('Broadcast application');
  await expect(broadcastApplication).toHaveValue('obs');
  await expect(broadcastApplication.locator('option')).toHaveText(['OBS Studio (including Aitum outputs)', 'Meld Studio', 'Streamlabs Desktop']);
  await broadcastApplication.selectOption('meld');
  await expect(broadcastApplication).toHaveValue('meld');
  await broadcastApplication.selectOption('streamlabs');
  await expect(broadcastApplication).toHaveValue('streamlabs');
  await expect(raidScoutSettings.getByLabel('Provider Stop Streaming action')).toBeVisible();
  expect(await page.locator('.content').evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);

  const chatGuardArchive = await packageAddOn('addons/chat-guard');
  await openAddOnInstaller(page);
  await page.getByLabel('Add-on package').setInputFiles({ name: 'chat-guard.thsv-addon', mimeType: 'application/zip', buffer: Buffer.from(chatGuardArchive) });
  await page.getByLabel(/I reviewed and trust/u).check();
  await page.getByRole('button', { name: 'Verify and install' }).click();
  const chatGuardSettings = page.locator('[data-addon-settings="thsv.chat-guard"]');
  await expect(page.getByRole('article').getByText(`Chat Guard ${STREAMBRIDGE_VERSION}`, { exact: true })).toBeVisible();
  await expect(page.locator('[data-addon-id="thsv.chat-guard"] .addon-trigger-readiness')).toContainText('Moderation import optional');
  await expect(page.locator('[data-addon-id="thsv.chat-guard"] .addon-trigger-readiness')).toContainText('!guardtrust');
  await expect(chatGuardSettings.locator(':scope > details')).toHaveCount(7);
  await expect(chatGuardSettings).toContainText('Beginner setup');
  await expect(chatGuardSettings.locator('summary').filter({ hasText: 'Safe beginner setup' })).toBeVisible();
  await expect(chatGuardSettings.locator('summary').filter({ hasText: 'Common spam checks' })).toBeVisible();
  await expect(chatGuardSettings.getByLabel('Turn on safe observation')).not.toBeChecked();
  await page.evaluate(`state.addOns.find((addOn) => addOn.moduleId === 'thsv.chat-guard').enabled = true; renderAddOns();`);
  await expect(page.getByText('Optional: trust a specific viewer', { exact: true })).toBeVisible();
  await expect(page.getByText('Moderation dashboard', { exact: true })).toBeVisible();
  await expect(chatGuardSettings.getByLabel('Allow Chat Guard to take automatic actions')).toHaveCount(1);
  await expect(chatGuardSettings.getByLabel('Confirm that I want automatic moderation')).toHaveCount(1);
  await expect(page.locator('[data-disclosure-key="addon:thsv.chat-guard:approved-actions"]')).toContainText('Observation-only users can leave this empty');
  await page.getByText('Optional: trust a specific viewer', { exact: true }).click();
  await expect(page.getByText(/Reply to the viewer's message/u)).toBeVisible();
  await page.getByText('Manual stable-ID fallback', { exact: true }).click();
  await expect(page.locator('[data-chat-guard-trust-form]').getByLabel('Friendly label')).toBeVisible();
  await page.getByText('Moderation dashboard', { exact: true }).click();
  const moderationFilters = page.locator('[data-chat-guard-incident-filters]');
  await expect(moderationFilters.getByLabel('Platform')).toHaveValue('');
  await expect(moderationFilters.getByLabel('Matched rule')).toHaveValue('');
  await expect(moderationFilters.getByLabel('Review')).toHaveValue('');
  await expect(moderationFilters.getByLabel('Action outcome')).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Download bounded report' })).toBeVisible();
  await page.getByText('Test current rules safely', { exact: true }).click();
  await expect(page.getByLabel('Sample public-chat message')).toBeVisible();
  await expect(page.getByLabel('Prior matching messages')).toHaveValue('0');
  await page.getByText('Temporary link permit', { exact: true }).click();
  await expect(page.locator('[data-chat-guard-permit-form]').getByLabel('Stable platform user ID')).toBeVisible();
  await page.getByText('Review by incident ID', { exact: true }).click();
  await expect(page.getByLabel('Decision')).toHaveValue('confirmed');
  expect(await page.locator('.content').evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await page.evaluate(`(() => {
    state.addOnRuntime = {
      ...(state.addOnRuntime || {}),
      mainFeatures: {
        ...(state.addOnRuntime?.mainFeatures || {}),
        communityRewards: { sessionActive: true, redemptions: 7, operations: 4, failures: 0, capabilityFailures: 0 },
        communityMessaging: { sessionActive: true, messagesObserved: 23, operations: 5, failures: 1, capabilityFailures: 2, outboundPending: 2 },
      },
      browserOverlay: {
        ...(state.addOnRuntime?.browserOverlay || {}),
        presentationPolicy: { contractVersion: '1.0.0' },
        presentationQueue: { active: null, queued: [{ owner: 'thsv.first-five' }] },
      },
    };
    renderAddOns();
  })()`);
  await expect(page.locator('[data-main-feature="community-rewards"]')).toContainText('7 redemption events · 1 queued overlay');
  await expect(page.locator('[data-main-feature="community-messaging"]')).toContainText('23 chat events · 3 reported issues');
  await expect(page.locator('.main-feature-details')).toHaveCount(7);
  const messagingFeature = page.locator('[data-main-feature="community-messaging"]');
  await messagingFeature.locator('summary').click();
  await expect(messagingFeature).toContainText('Pending sends');
  await expect(messagingFeature).toContainText('2');
  await expect(messagingFeature).toContainText('Shoutouts queued; delivery background');
  await expect(page.locator('[data-main-feature="community-rewards"]')).toContainText('Foreground queue');
  await expect(messagingFeature.getByRole('button', { name: 'Chat Guard' })).toBeVisible();

  const clipCacheArchive = await packageAddOn('addons/clip-library-cache');
  await openAddOnInstaller(page);
  await page.getByLabel('Add-on package').setInputFiles({ name: 'clip-library-cache.thsv-addon', mimeType: 'application/zip', buffer: Buffer.from(clipCacheArchive) });
  await page.getByLabel(/I reviewed and trust/u).check();
  await page.getByRole('button', { name: 'Verify and install' }).click();
  await expect(page.getByRole('article').getByText(`Clip Library Cache ${STREAMBRIDGE_VERSION}`, { exact: true })).toBeVisible();
  await expect(page.locator('[data-main-feature="clip-engine"]')).toContainText('Clip Engine');
  await expect(page.locator('[data-main-feature="clip-engine"]')).toContainText('Clip Library Cache');
  await expect(page.getByLabel('Manage a built-in extension component').locator('optgroup[label="Clip Engine"]')).toHaveCount(1);
  await expect(page.locator('[data-addon-id="thsv.clip-library-cache"] .addon-trigger-readiness')).toContainText('Clip Engine foundation');
  await expect(page.locator('[data-addon-settings="thsv.clip-library-cache"]')).toContainText('shared library inside the Clip Engine');
  await expect(page.locator('[data-addon-settings="thsv.clip-library-cache"]')).toContainText('Nothing appears on stream');

  const clipCourierArchive = await packageAddOn('addons/clip-courier');
  await openAddOnInstaller(page);
  await page.getByLabel('Add-on package').setInputFiles({ name: 'clip-courier.thsv-addon', mimeType: 'application/zip', buffer: Buffer.from(clipCourierArchive) });
  await page.getByLabel(/I reviewed and trust/u).check();
  await page.getByRole('button', { name: 'Verify and install' }).click();
  await expect(page.getByRole('article').getByText(`Clip Courier ${STREAMBRIDGE_VERSION}`, { exact: true })).toBeVisible();
  await expect(page.locator('[data-addon-id="thsv.clip-courier"] .addon-trigger-readiness')).toContainText('Connect !clip and Discord');
  await expect(page.locator('[data-addon-id="thsv.clip-courier"] .addon-trigger-readiness')).toContainText('30 or 60');
  await expect(page.locator('[data-addon-id="thsv.clip-courier"] .addon-trigger-readiness')).toContainText('No old-library posting');
  await expect(page.locator('[data-addon-id="thsv.clip-courier"] .addon-trigger-readiness')).toContainText('Approve Create Clip and Deliver');
  await expect(page.locator('[data-addon-settings="thsv.clip-courier"]')).toContainText('viewer uses !clip');
  await expect(page.locator('[data-addon-settings="thsv.clip-courier"]')).not.toContainText('Publish an existing clip');

  const villageDrawArchive = await packageAddOn('addons/village-draw');
  await openAddOnInstaller(page);
  await page.getByLabel('Add-on package').setInputFiles({ name: 'village-draw.thsv-addon', mimeType: 'application/zip', buffer: Buffer.from(villageDrawArchive) });
  await page.getByLabel(/I reviewed and trust/u).check();
  await page.getByRole('button', { name: 'Verify and install' }).click();
  await expect(page.getByRole('article').getByText(`Village Draw ${STREAMBRIDGE_VERSION}`, { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Built-in extensions', exact: true })).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Installed add-ons', exact: true })).toBeVisible();
  await expect(page.locator('.installed-addon-card').filter({ hasText: 'Village Draw' })).toBeVisible();
  await expect(page.getByLabel('Manage an installed add-on')).toHaveValue('thsv.village-draw');
  await expect(page.locator('[data-main-feature] [data-select-feature-addon="thsv.village-draw"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Extensions', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Built-in extension groups', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Installed add-ons', exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Add-ons', exact: true }).click();
  const villageDrawSettings = page.locator('[data-addon-settings="thsv.village-draw"]');
  await expect(villageDrawSettings).toContainText('casual community giveaways');
  await villageDrawSettings.locator('summary').filter({ hasText: 'Entry and ticket rules' }).click();
  await expect(villageDrawSettings.getByLabel('Entry method')).toHaveValue('free-single');
  await expect(villageDrawSettings.getByLabel('Viewer Foundation points per ticket')).toBeHidden();
  await villageDrawSettings.getByLabel('Entry method').selectOption('points-multiple');
  await expect(villageDrawSettings.getByLabel('Viewer Foundation points per ticket')).toBeVisible();
  await expect(villageDrawSettings.getByLabel('Maximum tickets per viewer')).toBeVisible();
  await expect(page.locator('[data-addon-id="thsv.village-draw"] .addon-trigger-readiness')).toContainText('Use the existing chat intakes');
  await expect(page.locator('[data-addon-id="thsv.village-draw"] .addon-trigger-readiness')).toContainText('Direct chat commands');
  await page.evaluate(`state.addOns.find((addOn) => addOn.moduleId === 'thsv.village-draw').enabled = true; renderAddOns();`);
  await expect(page.getByText('Run the giveaway', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open entries' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel and refund' })).toBeVisible();
  expect(await page.locator('.content').evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);

  const executableRoot = 'examples/addons/no-op';
  const descriptor = JSON.parse(await readFile(join(executableRoot, 'module-package.json'), 'utf8')) as { permissions: string[] };
  descriptor.permissions.push('streamerbot.run-approved-action', 'overlay.publish');
  const executableArchive = zipSync({
    'module-package.json': Buffer.from(`${JSON.stringify(descriptor, null, 2)}\n`),
    'dist/index.js': await readFile(join(executableRoot, 'dist/index.js')),
    'schemas/config.json': await readFile(join(executableRoot, 'schemas/config.json')),
  });
  await openAddOnInstaller(page);
  await page.getByLabel('Add-on package').setInputFiles({ name: 'no-op.thsv-addon', mimeType: 'application/zip', buffer: Buffer.from(executableArchive) });
  await page.getByLabel(/I reviewed and trust/u).check();
  await page.getByRole('button', { name: 'Verify and install' }).click();
  await expect(page.getByRole('article').getByText('Sample No-Op Add-On 1.0.0', { exact: true })).toBeVisible();
  await page.getByText('Approve Streamer.bot actions', { exact: true }).click();
  await expect(page.getByText('Your saved action grants remain active.', { exact: false })).toBeVisible();
  await page.evaluate(`state.liveActions = [
    { id: 'ad3cf90f-b320-5ae2-a493-485a5485e0ce', name: 'THSV Addon - Random Clip Player - Get Clip Download', group: 'THSV Addon - Random Clip Player', enabled: true },
    { id: 'f89e397b-7106-5101-a620-b0f5da4facf9', name: 'THSV Addon - Random Clip Player - Get Clips', group: 'THSV Addon - Random Clip Player', enabled: true },
    { id: 'e32d29f1-fc2a-58e5-a1f2-a7731f29d940', name: 'THSV Command - Lurk', group: 'THSV StreamBridge - Commands', enabled: true },
  ]; renderAddOns();`);
  await expect(page.getByText('No actions approved yet.')).toBeVisible();
  await page.getByText('Advanced: approve a different action', { exact: true }).click();
  const groupPicker = page.locator('[data-addon-action-group="sample.no-op"]');
  const actionPicker = page.locator('[data-addon-action-picker="sample.no-op"]');
  await expect(groupPicker).toHaveValue('THSV Addon - Random Clip Player');
  await expect(actionPicker.locator('option')).toHaveCount(3);
  await expect(actionPicker).not.toContainText('THSV Command - Lurk');
  await groupPicker.selectOption('THSV StreamBridge - Commands');
  await expect(actionPicker.locator('option')).toHaveCount(2);
  await expect(actionPicker).toContainText('THSV Command - Lurk');
  await expect(actionPicker).not.toContainText('Random Clip Player');
  await groupPicker.selectOption('THSV Addon - Random Clip Player');
  await actionPicker.selectOption('f89e397b-7106-5101-a620-b0f5da4facf9');
  await page.getByRole('button', { name: 'Add selected action' }).click();
  await expect(page.locator('.addon-approved-actions')).toContainText('THSV Addon - Random Clip Player - Get Clips');
  await expect(page.locator('.addon-approved-actions')).toContainText('THSV Addon - Random Clip Player');
  await page.evaluate('state.liveActions = []; renderAddOns();');
  await expect(page.locator('.addon-approved-actions')).toContainText('THSV Addon - Random Clip Player - Get Clips');
  await expect(page.locator('.addon-approved-actions')).toContainText('saved grant remains active; status not checked this session');
  await expect(page.getByRole('button', { name: 'Refresh action names' })).toBeVisible();
  await page.evaluate(`state.liveActions = [{
    id: 'f89e397b-7106-5101-a620-b0f5da4facf9', name: 'My Clip Lookup',
    group: 'Creator Clip Tools', enabled: true
  }]; renderAddOns();`);
  await expect(page.locator('.addon-approved-actions')).toContainText('My Clip Lookup');
  await expect(page.locator('.addon-approved-actions')).toContainText('renamed from THSV Addon - Random Clip Player - Get Clips');
  await expect(page.locator('.addon-approved-actions')).toContainText('moved from THSV Addon - Random Clip Player');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Save action grants' }).click();
  await expect(page.locator('#addon-state')).toContainText('Action grants saved for sample.no-op');
  await page.getByText('Open overlay & test', { exact: true }).click();
  const overlayUrl = await page.locator('[data-addon-overlay-url="sample.no-op"]').inputValue();
  expect(overlayUrl).toBe('http://127.0.0.1:8799/overlay/addons/sample.no-op');
  const overlay = await context.newPage();
  await overlay.goto(overlayUrl);
  await expect(overlay.getByText('LIVE', { exact: true })).toBeAttached();
  await page.getByRole('button', { name: 'Show exact template' }).click();
  await expect(page.locator('#addon-state')).toContainText('Exact-template preview sent for sample.no-op');
  await expect(overlay.getByText('Overlay connection and scoped publication are working.')).toBeVisible();
  await overlay.close();

  const hydrationArchive = await packageAddOn('addons/village-hydration-station');
  await openAddOnInstaller(page);
  await page.getByLabel('Add-on package').setInputFiles({ name: 'village-hydration-station.thsv-addon', mimeType: 'application/zip', buffer: Buffer.from(hydrationArchive) });
  await page.getByLabel(/I reviewed and trust/u).check();
  await page.getByRole('button', { name: 'Verify and install' }).click();
  await page.locator('#addon-selector').selectOption('thsv.village-hydration-station');
  const hydrationCard = page.locator('[data-addon-id="thsv.village-hydration-station"]');
  const visualEditor = hydrationCard.locator('[data-overlay-live-editor="thsv.village-hydration-station"]');
  await expect(visualEditor.getByText('See each change on the real overlay')).toBeVisible();
  await expect(hydrationCard.locator('[data-overlay-visual-target="Water fill inside the bottle or glass"]')).toContainText('Overlay area: Water fill inside the bottle or glass');
  await expect(visualEditor.locator('[data-overlay-draft-state]')).toContainText('Draft preview - not saved');
  const editorOverlay = page.frameLocator('[data-overlay-editor-frame="thsv.village-hydration-station"]');
  await expect(editorOverlay.getByText('PREVIEW', { exact: true })).toBeAttached();
  await expect(editorOverlay.locator('#hydration-shell')).toBeVisible();
  await hydrationCard.locator('input[name="waterColor"]').evaluate((element) => {
    (element as HTMLInputElement).value = '#1266ee';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(visualEditor.locator('[data-overlay-draft-state]')).toContainText('Draft preview - not saved');
  await expect.poll(async () => editorOverlay.locator('#hydration-shell').evaluate((element) => element.style.getPropertyValue('--hydration-water'))).toBe('#1266ee');
  expect(await page.evaluate(`state.addOns.find((candidate) => candidate.moduleId === 'thsv.village-hydration-station').settings.waterColor`)).not.toBe('#1266ee');
  await hydrationCard.getByText('Open overlay & test', { exact: true }).click();
  const hydrationOverlay = await context.newPage();
  await hydrationOverlay.goto('http://127.0.0.1:8799/overlay/addons/thsv.village-hydration-station');
  await hydrationCard.getByRole('button', { name: 'Show exact template' }).click();
  await expect(hydrationOverlay.locator('#hydration-shell')).toBeVisible();
  await expect(hydrationOverlay.locator('#hydration-progress')).toHaveAttribute('style', /width:\s*50%/u);
  await hydrationOverlay.close();
});

test('Community Analytics keeps the creator snapshot simple and responsive', async ({ page }) => {
  await page.route('**/wizard/api/community-analytics/admin', async (route) => await route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      operation: 'status', trackedViewerCount: 42, retainedSessionCount: 8, engagementScoreEnabled: true, scoreSeason: '2026-08', rankCohortSize: 12,
      current: { startedAt: Date.parse('2026-08-11T19:00:00-05:00'), approximate: false, livePlatforms: ['twitch', 'youtube', 'kick', 'tiktok'], uniqueViewers: 17, counters: { messages: 128, commands: 9, follows: 3, subscriptions: 2, memberships: 1, giftSubscriptions: 2, gifts: 4, cheers: 2, superChats: 1, raids: 1, rewardRedemptions: 6 } },
      recentSessions: [{ startedAt: Date.parse('2026-08-10T19:00:00-05:00'), endedAt: Date.parse('2026-08-10T22:25:00-05:00'), approximate: false, uniqueViewers: 31, counters: { messages: 244, commands: 16, follows: 4 } }],
    }),
  }));
  await page.goto('/wizard/');
  await page.getByLabel('Control token').fill('playwright-control-token-with-32-characters');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await page.getByRole('button', { name: 'Community Analytics', exact: true }).click();
  const card = page.locator('[data-panel="community-analytics"] .community-analytics-integration');
  await expect(card.getByText('Always installed', { exact: true })).toBeVisible();
  await expect(card.locator('summary').filter({ hasText: 'Count community activity' })).toBeVisible();
  await expect(card.locator('summary').filter({ hasText: 'Optional participation score' })).toBeVisible();
  await expect(card.locator('summary').filter({ hasText: 'Advanced: exclusions and storage' })).toBeVisible();
  await expect(card.getByText('Live now', { exact: true })).toBeVisible();
  await expect(card.locator('.analytics-key-metrics article')).toHaveCount(3);
  await expect(card.getByText('137', { exact: true })).toBeVisible();
  await expect(card.getByText('22', { exact: true })).toBeVisible();
  await expect(card.getByText('Recent streams', { exact: true })).toBeVisible();
  await expect(card.locator('.analytics-details')).not.toHaveAttribute('open', '');
  await expect(card.getByText('Download detailed reports', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 520, height: 900 });
  await expect(page.locator('.content').evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).resolves.toBe(true);
});

test('Quote Vault exposes a responsive creator-managed quote library', async ({ page }) => {
  const requests: Array<Record<string, unknown>> = [];
  await page.route('**/wizard/api/quote-vault/admin', async (route) => {
    const request = route.request().postDataJSON() as Record<string, unknown>;
    requests.push(request);
    const approved = Array.from({ length: 30 }, (_, index) => ({ id: index + 1, quotedName: index === 0 ? 'Streamer' : `Villager ${String(index + 1)}`, text: index === 0 ? 'The approved quote' : `Scalable quote number ${String(index + 1)}`, sourcePlatform: index % 2 === 0 ? 'twitch' : 'youtube', submittedBy: 'Moderator', submittedAt: '2026-08-11T19:00:00.000Z', approvedAt: '2026-08-11T19:01:00.000Z', status: 'approved' }));
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      contractVersion: '1.0.0', action: request.operation, counts: { approved: approved.length, pending: 1, recoverable: 1 }, capacity: { approved: 100, pending: 20 },
      pending: [{ id: 101, quotedName: 'Viewer', text: 'Please review this quote', sourcePlatform: 'youtube', submittedBy: 'VillageViewer', submittedAt: '2026-08-11T20:00:00.000Z', status: 'pending' }],
      approved,
      deleted: [{ id: 102, quotedName: 'Streamer', text: 'Recoverable quote', sourcePlatform: 'kick', submittedBy: 'Streamer', submittedAt: '2026-08-10T19:00:00.000Z', deletedAt: '2026-08-11T18:00:00.000Z', status: 'deleted' }],
    }) });
  });
  await page.goto('/wizard/');
  await page.getByLabel('Control token').fill('playwright-control-token-with-32-characters');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await openAddOnInstaller(page);
  const archive = await packageAddOn('addons/quote-vault');
  await page.getByLabel('Add-on package').setInputFiles({ name: 'quote-vault.thsv-addon', mimeType: 'application/zip', buffer: Buffer.from(archive) });
  await page.getByLabel(/I reviewed and trust/u).check();
  await page.getByRole('button', { name: 'Verify and install' }).click();
  const card = page.locator('[data-addon-id="thsv.quote-vault"]');
  await expect(card.getByText('Quote library', { exact: true })).toBeVisible();
  await expect(card.locator('[data-quote-vault-row]')).toHaveCount(12);
  await expect(card.getByText('Page 1 of 3', { exact: true })).toBeVisible();
  await card.getByLabel('Search quotes').fill('approved quote');
  await expect(card.locator('[data-quote-vault-row]')).toHaveCount(1);
  await expect(card.getByText('The approved quote', { exact: true })).toBeVisible();
  await card.getByRole('button', { name: 'Clear filters' }).click();
  await card.getByRole('tab', { name: /Needs review/u }).click();
  await expect(card.getByText('Please review this quote', { exact: true })).toBeVisible();
  await card.getByRole('tab', { name: /Approved/u }).click();
  await card.locator('[data-quote-vault-add-form] [name="quotedName"]').fill('Creator');
  await card.locator('[data-quote-vault-add-form] [name="text"]').fill('Added from the wizard');
  await card.getByRole('button', { name: 'Add approved quote' }).click();
  await expect.poll(() => requests.some((request) => request.operation === 'add' && request.text === 'Added from the wizard')).toBe(true);
  await page.setViewportSize({ width: 520, height: 900 });
  await expect(page.locator('.content').evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).resolves.toBe(true);
});
