import { readFile } from 'node:fs/promises';
import { expect, test, type APIRequestContext } from '@playwright/test';

const token = 'playwright-control-token-with-32-characters';

async function fixture(name: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(`tests/fixtures/${name}`, 'utf8')) as Record<string, unknown>;
}

async function simulate(request: APIRequestContext, input: Record<string, unknown>, suffix: string): Promise<void> {
  const source = input['source'] as Record<string, unknown>;
  const response = await request.post('/simulate', {
    headers: { authorization: `Bearer ${token}` },
    data: { ...input, eventId: `${String(input['eventId'])}-${suffix}`, source: { ...source, eventId: `${String(source['eventId'])}-${suffix}` } },
  });
  expect(response.status()).toBe(202);
}

test('wizard exposes source-gated command templates and explicit per-platform timed-message cards', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/wizard/');
  await page.locator('#token').fill(token);
  await page.locator('#login-form button').click();
  await expect(page.locator('#workspace')).toBeVisible();

  await page.locator('[data-view="command-sync"]').click();
  const commandForm = page.locator('#design-command');
  await expect(commandForm.locator('[name="actionName"]')).toBeVisible();
  await expect(commandForm.locator('[name="responseMode"]')).toHaveValue('platform-message');
  await expect(commandForm.locator('[name="template"] option')).toHaveCount(10);
  await expect(commandForm.locator('[name="template"] option[value="weather"]')).toHaveCount(0);
  await expect(commandForm.locator('[name="template"] option[value="discord"]')).toHaveCount(1);
  await expect(commandForm.locator('[name="template"] option[value="rules"]')).toHaveCount(1);
  await expect(commandForm.locator('[name="template"] option[value="lurk"]')).toHaveCount(1);
  await expect(commandForm.locator('[name="commandDeliveryPlatform"]')).toHaveCount(0);
  await expect(commandForm.locator('[name="commandSource"][value="tiktok"]')).toHaveCount(1);
  await commandForm.locator('[name="template"]').selectOption('socials');
  await expect(commandForm.locator('[name="name"]')).toHaveValue('socials');
  await expect(commandForm.locator('[name="actionName"]')).toHaveValue('THSV Command - Socials');
  await expect(commandForm.locator('[name="messageYoutube"]')).toHaveValue(/replace-link/u);
  await expect(commandForm.locator('[name="messageTiktok"]')).toHaveValue(/replace-link/u);
  await expect(commandForm.locator('[name="commandSource"]:checked')).toHaveCount(4);

  await page.locator('[data-view="timed-actions"]').click();
  const timedForm = page.locator('#timed-action-form');
  await timedForm.locator('[name="selectionMode"]').selectOption('platform-shuffle');
  await expect(page.locator('#timed-platform-message-editor')).toBeVisible();
  await expect(page.locator('#timed-shared-messages')).toBeHidden();
  await page.locator('[data-add-timed-message="youtube"]').click();
  await page.locator('[data-add-timed-message="youtube"]').click();
  const youtubeMessages = page.locator('[data-timed-platform="youtube"]');
  await expect(youtubeMessages).toHaveCount(2);
  await youtubeMessages.nth(0).fill('One message that may visually wrap but remains one card.');
  await youtubeMessages.nth(1).fill('A second independent YouTube message.');
  await expect(page.locator('[data-timed-count="youtube-0"]')).toHaveText('56/200');
});

test('wizard automatically stages safe configuration imports and provides a real JSON download', async ({ page }) => {
  await page.goto('/wizard/');
  await page.locator('#token').fill(token);
  await page.locator('#login-form button').click();
  await expect(page.locator('#workspace')).toBeVisible();

  await expect(page.locator('#begin')).toHaveCount(0);
  await expect(page.locator('#transaction-state')).toContainText('No pending changes');
  await page.locator('#export-config').click();
  await expect(page.locator('#transfer-state')).toContainText('currently committed settings');
  const preview = await page.locator('#transfer').inputValue();
  const exported = JSON.parse(preview) as Record<string, unknown>;
  expect(exported).toMatchObject({ format: 'thsv.streambridge.wizard-configuration', version: 1 });
  expect(exported).toHaveProperty('platforms');
  expect(exported).toHaveProperty('filters');
  expect(exported).toHaveProperty('timedActions');
  expect(exported).toHaveProperty('chatSettings');
  expect(exported).toHaveProperty('alertSettings');
  expect(preview).not.toContain('controlToken');
  expect(preview).not.toContain('passwordEnv');
  expect(preview).not.toContain('streamerbot');

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#download-config').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^thsv-streambridge-configuration-.*\.json$/u);
  await expect(page.locator('#transfer-state')).toHaveText('Safe configuration JSON downloaded.');

  await page.locator('#import-file').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(preview),
  });
  await expect(page.locator('#transfer-state')).toContainText('Loaded backup.json');
  await page.locator('#import-config').click();
  await expect(page.locator('#transfer-state')).toHaveText('Import staged. Review and commit to save it.');
  await expect(page.locator('#transaction-state')).toContainText('Pending changes:');
  await expect(page.locator('#commit')).toBeEnabled();
  await expect(page.locator('#cancel')).toBeEnabled();

  await page.locator('#cancel').click();
  await expect(page.locator('#transaction-state')).toHaveText('Draft cancelled; no configuration was changed.');
  await expect(page.locator('#commit')).toBeDisabled();
});

test('chat remains bottom-aligned, bounded, crisp, and unclipped at 1920x1080', async ({ page, request }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/overlay/chat');
  await expect(page.locator('#status')).toHaveText('LIVE');
  const input = await fixture('twitch-chat.json');
  for (let index = 0; index < 12; index += 1) {
    const user = input['user'] as Record<string, unknown>;
    await simulate(request, {
      ...input,
      user: {
        ...user,
        displayName: `Extremely Long Creator Display Name ${String(index)} That Must Wrap Cleanly`,
        avatarUrl: 'https://example.com/avatar.png', roles: ['moderator'],
        badges: [{ id: 'moderator', label: 'Moderator', iconUrl: 'https://example.com/badge.png' }],
      },
      payload: { message: `Message ${String(index)} — Unicode 🦥 and a long uninterrupted token abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz` },
    }, `chat-${String(index)}`);
  }
  await expect(page.locator('#chat .message')).toHaveCount(8);
  const layout = await page.locator('.chat-shell').evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { left: bounds.left, right: bounds.right, bottom: bounds.bottom, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth };
  });
  expect(layout.left).toBeGreaterThanOrEqual(0);
  expect(layout.right).toBeLessThanOrEqual(1920);
  expect(layout.bottom).toBeLessThanOrEqual(1080);
  expect(layout.bottom).toBeGreaterThan(900);
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
  expect(await page.evaluate("getComputedStyle(document.body).backgroundColor")).toBe('rgba(0, 0, 0, 0)');
  await page.screenshot({ path: testInfo.outputPath('chat-1920x1080.png') });
});

test('compact cropped chat and alert storms stay within their containers after reconnect', async ({ page, request }, testInfo) => {
  await page.setViewportSize({ width: 500, height: 800 });
  await page.goto('/overlay/chat/dock');
  await expect(page.locator('#status')).toHaveText('LIVE');
  await page.evaluate("document.body.dataset.layout = 'compact'");
  const chat = await fixture('kick-chat.json');
  for (let index = 0; index < 10; index += 1) await simulate(request, { ...chat, payload: { message: `Compact message ${String(index)} with enough text to wrap but never overflow the dock.` } }, `compact-${String(index)}`);
  await expect(page.locator('#chat .message')).toHaveCount(8);
  expect(await page.locator('.overlay').evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);

  await page.reload();
  await expect(page.locator('#status')).toHaveText('LIVE');
  await simulate(request, chat, 'after-reconnect');
  await expect(page.locator('#chat .message')).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath('chat-compact-reconnect.png') });

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/overlay/alerts');
  const alert = await fixture('youtube-super-chat.json');
  for (let index = 0; index < 25; index += 1) {
    const user = alert['user'] as Record<string, unknown>;
    await simulate(request, { ...alert, user: { ...user, displayName: `Long Supporter Name ${String(index)} That Must Never Be Clipped`, avatarUrl: 'https://example.com/avatar.png' } }, `alert-${String(index)}`);
  }
  await expect(page.locator('.alert')).toHaveCount(1);
  expect(await page.locator('.alert').evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('alert-storm.png') });
});
