import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';
import { STREAMBRIDGE_VERSION } from '../../bridge/version.js';

const NEWER = '99.0.0';
const newerRelease = {
  checkedAt: '2026-11-06T12:00:00Z', currentVersion: STREAMBRIDGE_VERSION, available: true, updateAvailable: true, latestVersion: NEWER,
  releaseName: `THSV StreamBridge ${NEWER}`, releaseUrl: `https://github.com/surakage/THSV-StreamBridge/releases/tag/v${NEWER}`, publishedAt: '2026-11-06T12:00:00Z',
  releaseNotes: '## Faster alerts and a calmer setup\n\n- More details.',
  archive: { name: `THSV-StreamBridge-${NEWER}.zip`, url: `https://github.com/surakage/THSV-StreamBridge/releases/download/v${NEWER}/THSV-StreamBridge-${NEWER}.zip`, size: 40_000_000 },
  checksum: { name: `THSV-StreamBridge-${NEWER}.zip.sha256`, url: `https://github.com/surakage/THSV-StreamBridge/releases/download/v${NEWER}/THSV-StreamBridge-${NEWER}.zip.sha256`, size: 100 },
};

async function reportRelease(page: Page, release: Record<string, unknown>): Promise<string[]> {
  const calls: string[] = [];
  await page.route('**/wizard/api/updates/check', async (route) => {
    calls.push('check');
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(release) });
  });
  return calls;
}

async function unlock(page: Page): Promise<void> {
  await page.getByLabel('Control token').fill('playwright-control-token-with-32-characters');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.locator('#mode')).toContainText('Authenticated');
}

test('a newer release opens the update pop-up, and Later keeps it closed for the rest of the session', async ({ page }) => {
  const calls = await reportRelease(page, newerRelease);
  await page.goto('/wizard/');
  await unlock(page);
  const popup = page.getByRole('dialog', { name: 'Update available' });
  await expect(popup).toBeVisible({ timeout: 15_000 });
  await expect(popup).toHaveAttribute('aria-modal', 'true');
  await expect(popup).toContainText(`StreamBridge ${NEWER} is ready to install.`);
  await expect(popup).toContainText('Faster alerts and a calmer setup');
  await expect(popup.getByRole('button', { name: 'Later' })).toBeFocused();
  expect(calls).toEqual(['check']);

  await page.keyboard.press('Escape');
  await expect(popup).toBeHidden();

  // Unlocking again in the same tab (a reload keeps sessionStorage) does not ask again for that version.
  await page.reload();
  await unlock(page);
  await page.waitForTimeout(3_000);
  await expect(popup).toBeHidden();
});

test('Later closes the pop-up with its button too', async ({ page }) => {
  await reportRelease(page, newerRelease);
  await page.goto('/wizard/');
  await unlock(page);
  const popup = page.getByRole('dialog', { name: 'Update available' });
  await popup.getByRole('button', { name: 'Later' }).click({ timeout: 15_000 });
  await expect(popup).toBeHidden();
  expect(await page.evaluate(() => sessionStorage.getItem('thsv.streambridge.wizard.update-later.v1'))).toBe(NEWER);
});

test('Update now prepares and starts the verified update through the existing install path', async ({ page }) => {
  await reportRelease(page, newerRelease);
  const requests: Array<{ path: string; body: unknown }> = [];
  await page.route('**/wizard/api/updates/stage', async (route) => {
    requests.push({ path: 'stage', body: route.request().postDataJSON() });
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ version: NEWER, archiveName: `THSV-StreamBridge-${NEWER}.zip`, archivePath: 'C:\\Updates\\x.zip', sha256: 'a'.repeat(64), provenance: 'verified', repository: 'surakage/THSV-StreamBridge', workflow: 'release.yml', applyReady: true }) });
  });
  await page.route('**/wizard/api/updates/apply', async (route) => {
    requests.push({ path: 'apply', body: route.request().postDataJSON() });
    await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ accepted: true, version: NEWER, installRoot: 'C:\\THSV StreamBridge', message: 'The verified updater started. StreamBridge will restart and reopen the wizard.' }) });
  });
  await page.goto('/wizard/');
  await unlock(page);
  const popup = page.getByRole('dialog', { name: 'Update available' });
  await popup.getByRole('button', { name: 'Update now' }).click({ timeout: 15_000 });
  await expect(popup.locator('#update-prompt-state')).toHaveText('The verified updater started. StreamBridge will restart and reopen the wizard.');
  await expect(page.locator('#update-state')).toContainText('restart and reopen the wizard');
  expect(requests).toEqual([
    { path: 'stage', body: { version: NEWER, approvedByCreator: true } },
    { path: 'apply', body: { version: NEWER, approvedByCreator: true } },
  ]);
  await expect(popup.getByRole('button', { name: 'Update now' })).toBeHidden();
  await popup.getByRole('button', { name: 'Close' }).click();
  await expect(popup).toBeHidden();
});

test('no pop-up appears when the Bridge is up to date or the check fails', async ({ page }) => {
  await reportRelease(page, { checkedAt: '2026-11-06T12:00:00Z', currentVersion: STREAMBRIDGE_VERSION, available: true, updateAvailable: false, latestVersion: STREAMBRIDGE_VERSION });
  await page.goto('/wizard/');
  await unlock(page);
  await page.waitForTimeout(3_000);
  await expect(page.locator('#update-prompt')).toBeHidden();

  await page.unroute('**/wizard/api/updates/check');
  await page.route('**/wizard/api/updates/check', async (route) => await route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'GitHub is unreachable.' }) }));
  await page.reload();
  await unlock(page);
  await page.waitForTimeout(3_000);
  await expect(page.locator('#update-prompt')).toBeHidden();
});

test('no pop-up appears while a platform is live', async ({ page }) => {
  await reportRelease(page, newerRelease);
  await page.route('**/wizard/api/preflight', async (route) => {
    const response = await route.fetch();
    const body = await response.json() as Record<string, unknown>;
    await route.fulfill({ response, json: { ...body, mainFeatures: { broadcastDirector: { livePlatforms: ['twitch'], lifecycle: { status: 'live' } } } } });
  });
  await page.goto('/wizard/');
  const liveStatus = page.waitForResponse('**/wizard/api/preflight', { timeout: 20_000 });
  await unlock(page);
  // Wait until the Wizard has read the live status, then give the pop-up the time it would need to appear.
  await liveStatus;
  await page.waitForTimeout(2_000);
  await expect(page.locator('#update-prompt')).toBeHidden();
  await expect(page.locator('#update-state')).not.toContainText(`Version ${NEWER} is available`);
});
