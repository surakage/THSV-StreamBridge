import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

async function unlock(page: Page): Promise<void> {
  await page.goto('/wizard/');
  await page.getByLabel('Control token').fill('playwright-control-token-with-32-characters');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.locator('#mode')).toContainText('Authenticated');
}

const finished = { id: 'a', startedAt: '2026-11-10T18:00:00.000Z', endedAt: '2026-11-10T20:30:00.000Z', platforms: { twitch: { messages: 1234, chatters: 87 }, tiktok: { messages: 40, chatters: 12 } }, follows: 9, subscriptions: 3, giftedSubscriptions: 0, support: 5, raids: 1, redemptions: 22, commands: 61, adBreaks: 2, warnings: 1, errors: 0, problems: ['Kick chat reconnecting'] };

test('Start here shows a recap of the last stream with counts and problems', async ({ page }) => {
  await page.route('**/wizard/api/stream-summary', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ live: false, recent: [finished] }) }));
  await unlock(page);
  const card = page.locator('#last-stream');
  await expect(card).toBeVisible();
  await expect(card.locator('#last-stream-title')).toHaveText('Last stream');
  await expect(card.locator('#last-stream-when')).toContainText('2 h 30 min');
  await expect(card.locator('#last-stream-badge')).toHaveText('Check the log');
  await expect(card.locator('#last-stream-numbers')).toContainText('Twitch');
  await expect(card.locator('#last-stream-numbers')).toContainText('1,234 messages · 87 chatters');
  await expect(card.locator('#last-stream-numbers')).toContainText('Rewards redeemed');
  await expect(card.locator('#last-stream-numbers')).not.toContainText('Gifted subs');
  await expect(card.locator('#last-stream-problem-list li')).toHaveText(['Kick chat reconnecting']);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('the recap stays hidden before the first stream and shows a running stream as live', async ({ page }) => {
  let body: unknown = { live: false, recent: [] };
  await page.route('**/wizard/api/stream-summary', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) }));
  await unlock(page);
  await expect(page.locator('#last-stream')).toBeHidden();
  body = { live: true, current: { ...finished, endedAt: undefined, warnings: 0, problems: [] }, recent: [] };
  await page.reload();
  await unlock(page);
  await expect(page.locator('#last-stream-title')).toHaveText('This stream so far');
  await expect(page.locator('#last-stream-badge')).toHaveText('Live');
  await expect(page.locator('#last-stream-problems')).toBeHidden();
});
