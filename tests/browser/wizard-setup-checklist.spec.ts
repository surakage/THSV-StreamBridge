import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

const resolveAction = { id: '11111111-1111-4111-8111-111111111111', name: 'THSV Addon - Village Jukebox - Resolve YouTube Track', group: 'THSV Addon - Village Jukebox', enabled: true, triggerCount: 0 };
const settleAction = { id: '22222222-2222-4222-8222-222222222222', name: 'THSV Addon - Village Jukebox - Settle Twitch Reward', group: 'THSV Addon - Village Jukebox', enabled: true, triggerCount: 0 };

async function jukeboxAddOn(overrides: { approvedActionIds: string[]; twitchRewardId: string }): Promise<Record<string, unknown>> {
  const configurationSchema = JSON.parse(await readFile('addons/village-jukebox/schemas/config.json', 'utf8')) as Record<string, unknown>;
  const settingsUi = JSON.parse(await readFile('addons/village-jukebox/ui/settings.json', 'utf8')) as Record<string, unknown>;
  return {
    moduleId: 'thsv.village-jukebox', name: 'Village Jukebox', version: '1.0.0', author: 'THSV', description: 'Song requests.', changelog: '', packageKind: 'executable',
    permissions: ['streamerbot.run-approved-action'], trust: {}, enabled: true, health: 'installed', approvedActionIds: overrides.approvedActionIds,
    configurationSchema, settingsUi, installationSteps: [], uninstallationSteps: [], healthChecks: [], commandsProvided: [], browserSourcesProvided: [],
    settings: { enabled: true, rewardRequestsEnabled: true, twitchRewardId: overrides.twitchRewardId, kickRewardId: '' },
  };
}

/** Serves one enabled feature, a Streamer.bot action list, healthy connections, and Twitch turned on. */
async function mockSetup(page: Page, addOn: Record<string, unknown>, actions: readonly Record<string, unknown>[]): Promise<void> {
  await page.route('**/wizard/api/addons', async (route) => {
    if (route.request().method() !== 'GET') { await route.fallback(); return; }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ addOns: [addOn], featureFamilies: [], featureMigrations: [], discovered: [], trustedPublishers: [] }) });
  });
  await page.route('**/wizard/api/inspect', async (route) => await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ available: true, inspectedAt: new Date().toISOString(), requests: [{ request: 'GetActions' }], actions, commands: [] }) }));
  await page.route('**/wizard/api/readiness', async (route) => {
    const body = await (await route.fetch()).json() as Record<string, Record<string, unknown>>;
    body['readiness'] = { ...body['readiness'], outputs: [{ name: 'streamerbot', state: 'connected' }], adapters: [{ name: 'twitch', state: 'connected' }] };
    body['configuration'] = { state: 'active', restartRequired: false };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.route('**/wizard/api/overview', async (route) => {
    const body = await (await route.fetch()).json() as { configuration: { platforms: Record<string, Record<string, unknown>> } };
    body.configuration.platforms['twitch'] = { ...body.configuration.platforms['twitch'], enabled: true };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
}

async function unlock(page: Page): Promise<void> {
  await page.goto('/wizard/');
  await page.getByLabel('Control token').fill('playwright-control-token-with-32-characters');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.locator('#mode')).toContainText('Authenticated');
}

test('a fresh feature lists each missing step with a count badge and jumps to the exact field', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await mockSetup(page, await jukeboxAddOn({ approvedActionIds: [], twitchRewardId: '' }), [resolveAction]);
  await unlock(page);

  const navigation = page.locator('[data-view="setup-checklist"]');
  await expect(navigation).toHaveAttribute('data-count', '3');
  await expect(navigation).toHaveText('Setup checklist');
  await expect(navigation).toHaveAttribute('title', '3 open items');
  await navigation.click();
  await expect(page.locator('[data-panel="setup-checklist"] h2')).toHaveText('Setup checklist');

  const card = page.locator('[data-checklist-feature="thsv.village-jukebox"]');
  await expect(card.locator('.status-chip')).toHaveText('3 to do');
  await expect(card.locator('[data-checklist-item="actions-not-imported"]')).toContainText('Settle Twitch Reward');
  await expect(card.locator('[data-checklist-item="actions-not-approved"]')).toContainText('Resolve YouTube Track');
  await expect(card.locator('[data-checklist-item="reward:twitchRewardId"]')).toContainText('Twitch Song Request reward ID');
  await expect(page.locator('[data-checklist-feature="general"]')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  await card.locator('[data-checklist-item="reward:twitchRewardId"]').getByRole('button', { name: 'Add reward ID' }).click();
  await expect(page.locator('[data-panel="addons"]')).toBeVisible();
  await expect(page.locator('[data-addon-id="thsv.village-jukebox"] input[name="twitchRewardId"]')).toBeFocused();

  await page.locator('[data-view="setup-checklist"]').click();
  await page.locator('[data-checklist-item="actions-not-imported"]').getByRole('button', { name: 'Open import' }).click();
  await expect(page.locator('[data-panel="streamerbot-import"]')).toBeVisible();
  await expect(page.locator('[data-panel="streamerbot-import"] .universal-import-card')).toBeFocused();
});

test('a feature with nothing missing is listed on the Ready line, with no card and no badge', async ({ page }) => {
  await mockSetup(page, await jukeboxAddOn({ approvedActionIds: [resolveAction.id, settleAction.id], twitchRewardId: 'reward-123' }), [resolveAction, settleAction]);
  await unlock(page);
  await page.locator('[data-view="setup-checklist"]').click();

  // Ready features get no card of their own, only a short "Ready" line naming them.
  await expect(page.locator('[data-checklist-feature="thsv.village-jukebox"]')).toHaveCount(0);
  await expect(page.locator('[data-checklist-ready]')).toContainText('Village Jukebox');
  await expect(page.locator('.setup-checklist-card.needs-attention')).toHaveCount(0);
  await expect(page.locator('#setup-checklist-state')).toHaveText('Everything you turned on is ready.');
  await expect(page.locator('[data-view="setup-checklist"]')).not.toHaveAttribute('data-count', /.*/u);
});
