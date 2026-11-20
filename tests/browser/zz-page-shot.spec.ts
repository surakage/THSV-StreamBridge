// TEMPORARY design aid (not committed): full-page screenshot of one management-mode Wizard page.
import { expect, test } from './fixtures.js';
const VIEW = process.env['THSV_VIEW'] ?? 'overview';
test('page screenshot', async ({ page }) => {
  await page.emulateMedia({ colorScheme: (process.env['THSV_SCHEME'] as 'dark' | 'light' | undefined) ?? 'dark' });
  await page.setViewportSize({ width: 1600, height: 1000 });
  const lang = process.env['THSV_LANG']; if (lang) await page.addInitScript((code) => { localStorage.setItem('thsv.wizard.language', code); }, lang);
  await page.goto('/wizard/');
  await page.locator('#token').fill('playwright-control-token-with-32-characters');
  await page.locator('#login-form button').click();
  await expect(page.locator('#workspace')).toBeVisible();
  await page.locator(`.workspace > nav .nav[data-view="${VIEW}"]`).click();
  await page.waitForTimeout(2_000);
  await page.screenshot({ path: process.env['THSV_OUT'] ?? 'test-results/page.png', fullPage: true });
});
