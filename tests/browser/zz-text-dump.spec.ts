// TEMPORARY copy-editing aid (not committed): dumps the visible text blocks of several Wizard pages.
import { writeFileSync } from 'node:fs';
import { expect, test } from './fixtures.js';
const VIEWS = (process.env['THSV_VIEWS'] ?? 'overview').split(',');
const OUT = process.env['THSV_OUT'] ?? 'test-results';
test('dump page text', async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/wizard/');
  await page.getByLabel('Control token').fill('playwright-control-token-with-32-characters');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.locator('#workspace')).toBeVisible();
  for (const view of VIEWS) {
    const nav = page.locator(`.workspace > nav [data-view="${view}"]`).first();
    if (await nav.count()) await nav.click(); else await page.evaluate((v) => { location.hash = v; }, view);
    await page.waitForTimeout(1_500);
    const blocks = await page.locator(`[data-panel="${view}"]`).evaluate((panel) => {
      const out: string[] = [];
      const walker = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = (node.textContent ?? '').replace(/\s+/gu, ' ').trim();
        const parent = node.parentElement;
        if (!text || !parent || parent.closest('script,style,option,textarea')) continue;
        out.push(`${parent.tagName.toLowerCase()}${parent.id ? `#${parent.id}` : ''}\t${text}`);
      }
      return out;
    });
    writeFileSync(`${OUT}/text-${view}.txt`, blocks.join('\n'));
  }
});
