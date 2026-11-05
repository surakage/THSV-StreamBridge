import { expect, test } from './fixtures.js';

test('the Wizard switches language from the header and back to English', async ({ page }) => {
  await page.goto('/wizard/');
  const picker = page.locator('#wizard-language');
  await expect(picker).toHaveValue('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  await picker.selectOption('ja');
  await page.waitForLoadState('load');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  await page.locator('#token').fill('playwright-control-token-with-32-characters');
  await page.locator('#login-form button').click();
  await expect(page.locator('#workspace')).toBeVisible();
  await expect(page.locator('.workspace > nav [data-view="platforms"]')).toHaveText('プラットフォーム');
  await expect(page.locator('.workspace > nav [data-view="timed-actions"]')).toHaveText('定期アクション');
  // Feature names stay in English, and the picker keeps every language's own name.
  await expect(page.locator('.workspace > nav [data-view="viewer-foundation"]')).toHaveText('Viewer Foundation');
  await expect(page.locator('#wizard-language option[value="es"]')).toHaveText('Español');

  await page.locator('#wizard-language').selectOption('en');
  await page.waitForLoadState('load');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.locator('#token').fill('playwright-control-token-with-32-characters');
  await page.locator('#login-form button').click();
  await expect(page.locator('.workspace > nav [data-view="platforms"]')).toHaveText('Platforms');
});

test('every language word list loads and translates text that appears later', async ({ page }) => {
  for (const code of ['es', 'de', 'fr', 'it', 'pt-BR', 'ja', 'ko', 'zh-CN']) {
    const response = await page.request.get(`/wizard/i18n/${code}.js`);
    expect(response.status(), code).toBe(200);
    expect(await response.text(), code).toContain(`["${code}"]`);
  }
  await page.addInitScript(() => { localStorage.setItem('thsv.wizard.language', 'de'); });
  await page.goto('/wizard/');
  await expect(page.locator('#login-form button')).toHaveText('Entsperren');
  await page.evaluate(() => {
    const note = document.createElement('p');
    note.id = 'late-text';
    note.textContent = 'Check again';
    document.body.append(note);
  });
  await expect(page.locator('#late-text')).toHaveText('Erneut prüfen');
});

test('picking a language while signed in also stages it for chat commands and Translate', async ({ page }) => {
  await page.goto('/wizard/');
  await page.locator('#token').fill('playwright-control-token-with-32-characters');
  await page.locator('#login-form button').click();
  await expect(page.locator('#workspace')).toBeVisible();
  const staged = page.waitForRequest((request) => /\/wizard\/api\/transactions\/[0-9a-f-]+\/stage$/u.test(request.url()) && request.method() === 'POST');
  await page.locator('#wizard-language').selectOption('es');
  const request = await staged;
  expect(request.postDataJSON()).toEqual({ kind: 'language', language: 'es' });
  expect((await request.response())?.status()).toBe(200);
  await page.waitForLoadState('load');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
});

test('the Control Panel follows the Wizard language without its own picker', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('thsv.wizard.language', 'de'); });
  await page.goto('/wizard/panel');
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await expect(page.locator('#wizard-language')).toHaveCount(0);
  await page.locator('#token').fill('playwright-control-token-with-32-characters');
  await page.locator('#login-form button[type="submit"]').click();
  await expect(page.locator('#tab-filter')).toHaveAttribute('placeholder', 'Erweiterung suchen');
  await expect(page.getByText(/^Ausgeschaltet \(\d+\)$/u)).toBeVisible();
});
