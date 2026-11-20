// TEMPORARY (not committed): collects the short interface strings of every Wizard page for translation.
import { writeFileSync } from 'node:fs';
import { expect, test } from './fixtures.js';
test('collect ui strings', async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/wizard/');
  const strings = new Set<string>();
  const collect = async () => {
    const found = await page.evaluate(() => {
      const out: string[] = [];
      const selector = '.workspace *, header *, #login-form *, main *';
      for (const element of Array.from(document.querySelectorAll(selector))) {
        for (const node of Array.from(element.childNodes)) {
          if (node.nodeType !== Node.TEXT_NODE) continue;
          const text = (node.textContent ?? '').replace(/\s+/gu, ' ').trim();
          if (text.length >= 2 && text.length <= 140 && /[A-Za-z]{2}/u.test(text)) out.push(text);
        }
        const placeholder = element.getAttribute('placeholder');
        if (placeholder && placeholder.length <= 90 && /[A-Za-z]{2}/u.test(placeholder)) out.push(placeholder);
      }
      return out;
    });
    for (const text of found) strings.add(text);
  };
  await collect();
  await page.getByLabel('Control token').fill('playwright-control-token-with-32-characters');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.locator('#workspace')).toBeVisible();
  const views = await page.locator('.workspace > nav [data-view]').evaluateAll((items) => items.map((item) => (item as HTMLElement).dataset['view'] ?? ''));
  for (const view of views) {
    await page.locator(`.workspace > nav [data-view="${view}"]`).first().click();
    await page.waitForTimeout(900);
    await collect();
  }
  writeFileSync(process.env['THSV_OUT'] ?? 'test-results/ui-strings.json', JSON.stringify([...strings].sort(), null, 1));
});
