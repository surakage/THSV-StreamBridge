// TEMPORARY (not committed): collects the Control Panel's interface strings for translation.
import { writeFileSync } from 'node:fs';
import { expect, test } from './fixtures.js';
test('collect control panel strings', async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.goto('/wizard/panel');
  const strings = new Set<string>();
  const collect = async () => {
    for (const text of await page.evaluate(() => {
      const out: string[] = [];
      for (const element of Array.from(document.querySelectorAll('body *'))) {
        if (element.closest('script,style')) continue;
        for (const node of Array.from(element.childNodes)) {
          if (node.nodeType !== Node.TEXT_NODE) continue;
          const text = (node.textContent ?? '').replace(/\s+/gu, ' ').trim();
          if (text.length >= 2 && text.length <= 160 && /[A-Za-z]{2}/u.test(text)) out.push(text);
        }
        for (const name of ['placeholder', 'title', 'aria-label']) {
          const value = element.getAttribute(name);
          if (value && /[A-Za-z]{2}/u.test(value)) out.push(value);
        }
      }
      return out;
    })) strings.add(text);
  };
  await collect();
  await page.locator('#token').fill('playwright-control-token-with-32-characters');
  await page.locator('#login-form button[type="submit"]').click();
  await page.waitForTimeout(2_000);
  await page.evaluate(() => { for (const details of Array.from(document.querySelectorAll('details'))) details.open = true; });
  await collect();
  const tabs = page.locator('[role="tab"]');
  await expect(tabs.first()).toBeVisible();
  const count = await tabs.count();
  for (let index = 0; index < count; index += 1) {
    await tabs.nth(index).click();
    await page.waitForTimeout(500);
    await collect();
  }
  writeFileSync(process.env['THSV_OUT'] ?? 'test-results/panel-strings.json', JSON.stringify([...strings].sort(), null, 1));
});
