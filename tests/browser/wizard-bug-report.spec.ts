import { expect, test } from './fixtures.js';

test('Report a bug downloads the sanitized support file and opens the pre-filled beta feedback form', async ({ page }) => {
  await page.goto('/wizard/');
  await expect(page.getByRole('button', { name: 'Report a bug' })).toBeHidden();
  await page.getByLabel('Control token').fill('playwright-control-token-with-32-characters');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.locator('#mode')).toContainText('Authenticated');
  // Record the GitHub link instead of leaving the test page.
  await page.evaluate(`window.__opened = []; window.open = (url) => { window.__opened.push(String(url)); return null; };`);

  await page.getByRole('button', { name: 'Report a bug' }).click();
  const dialog = page.getByRole('dialog', { name: 'Report a bug' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('What were you doing?').selectOption('Private test stream');
  await dialog.getByLabel('What happened, and what did you expect?').fill('Test alert did not show in OBS\nI pressed Test alert twice.');
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Prepare bug report' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.zip$/u);
  await expect(dialog.locator('#bug-report-state')).toContainText('Support bundle');
  await expect(dialog.getByRole('button', { name: 'Copy report' })).toBeVisible();

  const opened: string[] = await page.evaluate('window.__opened');
  expect(opened).toHaveLength(1);
  const link = new URL(opened[0] ?? '');
  expect(`${link.origin}${link.pathname}`).toBe('https://github.com/surakage/THSV-StreamBridge/issues/new');
  expect(link.searchParams.get('template')).toBe('beta_feedback.yml');
  expect(link.searchParams.get('stage')).toBe('Private test stream');
  expect(link.searchParams.get('title')).toBe('[Beta] Test alert did not show in OBS');
  expect(link.searchParams.get('notes')).toContain('I pressed Test alert twice.');
  expect(link.searchParams.get('version')).toMatch(/^\d+\.\d+\.\d+/u);
});
