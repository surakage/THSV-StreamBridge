import { expect, test } from './fixtures.js';

const TOKEN = 'playwright-control-token-with-32-characters';
const profiles = [
  { id: 'profile-1', name: 'Starting Soon', enabled: true, platforms: ['twitch', 'youtube', 'kick'], title: 'Starting soon', twitchCategoryId: '', youtubeCategoryName: 'Gaming', kickCategoryName: 'Just Chatting' },
  { id: 'profile-2', name: 'Gameplay', enabled: true, platforms: ['twitch', 'kick'], title: 'Live gameplay', twitchCategoryId: '12345', youtubeCategoryName: '', kickCategoryName: '' },
];

test('Stream info unlocks with the Wizard password and says when Creator Controls is missing', async ({ page }) => {
  await page.goto('/wizard/stream-info');
  await page.getByLabel('Wizard password').fill(TOKEN);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByText('Creator Controls is not installed.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Update all platforms' })).toBeDisabled();
  await expect(page.getByText('Nintendo Switch cannot be detected.')).toBeVisible();
});

test('Stream info says when Streamer.bot is not connected', async ({ page }) => {
  await page.route('**/wizard/api/stream-info', (route) => route.fulfill({ json: { streamerBotConnected: false, creatorControls: { installed: true, running: true, enabled: true, controllerApproved: true, profiles }, categoryPilot: { installed: false, enabled: false, consoleGames: [] } } }));
  await page.goto('/wizard/stream-info');
  await page.getByLabel('Wizard password').fill(TOKEN);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByText('Streamer.bot is not connected. Start Streamer.bot, then press Refresh.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Update all platforms' })).toBeDisabled();
});

test('Stream info rejects a wrong password', async ({ page }) => {
  await page.goto('/wizard/stream-info');
  await page.getByLabel('Wizard password').fill('not-the-password');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByText('That password did not work.')).toBeVisible();
});

test('Stream info sends the edited profile and shows each platform result', async ({ page }) => {
  let sent: unknown;
  await page.route('**/wizard/api/stream-info', (route) => route.fulfill({ json: {
    streamerBotConnected: true,
    creatorControls: { installed: true, running: true, enabled: true, controllerApproved: true, profiles },
    categoryPilot: { installed: true, enabled: true, consoleGames: [], consoles: { xbox: { saved: true, enabled: true, polling: true, titleName: 'Forza Horizon 5', profileId: 'profile-2' }, playstation: { saved: false, enabled: false, polling: false, titleName: '' } } },
  } }));
  await page.route('**/wizard/api/stream-info/apply', async (route) => { sent = route.request().postDataJSON(); await route.fulfill({ status: 202, json: { requestId: 'stream-info-00000000-0000-4000-8000-000000000000' } }); });
  await page.route('**/wizard/api/stream-info/results/*', (route) => route.fulfill({ json: { state: 'done', success: false, results: [{ platform: 'twitch', success: true }, { platform: 'kick', success: false }] } }));
  await page.goto('/wizard/stream-info');
  await page.getByLabel('Wizard password').fill(TOKEN);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByLabel('Stream title')).toHaveValue('Starting soon');
  await page.getByRole('radio', { name: 'Gameplay' }).click();
  await expect(page.getByLabel('Twitch category ID')).toHaveValue('12345');
  await page.getByLabel('Stream title').fill('Racing tonight');
  await page.getByRole('button', { name: 'Update all platforms' }).click();
  await expect(page.getByText('Some platforms were not updated.')).toBeVisible();
  await expect(page.getByText('Twitch: updated')).toBeVisible();
  await expect(page.getByText('Kick: failed')).toBeVisible();
  expect(sent).toEqual({ profileId: 'profile-2', platforms: ['twitch', 'kick'], title: 'Racing tonight', twitchCategoryId: '12345', youtubeCategoryName: '', kickCategoryName: '' });
  await expect(page.getByText('Xbox: Forza Horizon 5')).toBeVisible();
  await expect(page.getByText('PlayStation: detection is off.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apply Gameplay' })).toBeEnabled();
});

test('the Wizard opens Stream info already unlocked', async ({ page, context }) => {
  await page.goto('/wizard/');
  const ticket = await page.evaluate(async (token) => (await (await fetch('/wizard/api/unlock-tickets', { method: 'POST', headers: { authorization: `Bearer ${token}` } })).json() as { ticket: string }).ticket, TOKEN);
  const popup = await context.newPage();
  await popup.goto(`/wizard/stream-info#unlock=${ticket}`);
  await expect(popup.getByText('Creator Controls is not installed.')).toBeVisible();
  expect(popup.url()).not.toContain('unlock=');
});
