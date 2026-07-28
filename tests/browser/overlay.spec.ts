import { readFile } from 'node:fs/promises';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

declare global {
  interface Window {
    __thsvPublishAddOnEvent?: (payload: unknown) => void;
  }
}

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

async function installAddOnOverlayTransport(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(globalThis, 'SharedWorker', { configurable: true, value: undefined });
    class TestWebSocket extends EventTarget {
      static readonly OPEN = 1;
      readonly readyState = TestWebSocket.OPEN;

      constructor() {
        super();
        window.__thsvPublishAddOnEvent = (payload: unknown) => this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(payload) }));
        queueMicrotask(() => this.dispatchEvent(new Event('open')));
      }

      send(): void { /* The visual harness only receives publications. */ }
      close(): void { this.dispatchEvent(new Event('close')); }
    }
    Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: TestWebSocket });
  });
}

async function publishViewerSpotlightCard(page: Page, payload: Record<string, unknown>): Promise<void> {
  await page.evaluate((cardPayload) => window.__thsvPublishAddOnEvent?.({
    contractVersion: 'thsv-addon-overlay-v1',
    kind: 'addon.publish',
    moduleId: 'thsv.viewer-spotlight',
    topic: 'thsv.viewer-spotlight.card.show',
    payload: cardPayload,
  }), payload);
}

test('wizard stays readable at a narrow width and remembers its selected theme', async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 850 });
  await page.goto('/wizard/');
  const initialTheme = await page.locator('html').getAttribute('data-theme');
  await page.locator('#theme-toggle').click();
  const selectedTheme = initialTheme === 'dark' ? 'light' : 'dark';
  await expect(page.locator('html')).toHaveAttribute('data-theme', selectedTheme);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', selectedTheme);
  await expect(page.locator('header')).toHaveCSS('flex-direction', 'column');
  expect(await page.locator('body').evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await page.locator('#token').fill(token);
  await page.locator('#login-form button').click();
  await expect(page.locator('#workspace')).toBeVisible();
  await expect(page.locator('[data-panel="overview"] > .page-header')).toBeVisible();
  expect(await page.locator('.content').evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
});

test('wizard exposes source-gated command templates and explicit per-platform timed-message cards', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/wizard/');
  await page.locator('#token').fill(token);
  await page.locator('#login-form button').click();
  await expect(page.locator('#workspace')).toBeVisible();

  await page.locator('[data-view="command-sync"]').click();
  await page.locator('#new-command-batch-entry').click();
  const commandForm = page.locator('#design-command');
  await expect(commandForm.locator('[name="actionName"]')).toBeVisible();
  await expect(commandForm.locator(':scope > details.guided-form-section')).toHaveCount(3);
  await expect(commandForm.locator('[data-guided-section="command-basics"]')).toHaveAttribute('open', '');
  await expect(commandForm.locator('[data-guided-section="command-response"]')).toHaveAttribute('open', '');
  await expect(commandForm.locator('[data-guided-section="command-safety"]')).not.toHaveAttribute('open', '');
  await expect(commandForm.locator('[name="responseMode"]')).toHaveValue('platform-message');
  await expect(commandForm.locator('[name="template"] option')).toHaveCount(18);
  await expect(commandForm.locator('[name="template"] option[value="weather"]')).toHaveCount(0);
  await expect(commandForm.locator('[name="template"] option[value="discord"]')).toHaveCount(1);
  for (const removed of ['rules', 'love', 'specs', 'emotes', 'bot']) {
    await expect(commandForm.locator(`[name="template"] option[value="${removed}"]`)).toHaveCount(0);
  }
  await expect(commandForm.locator('[name="template"] option[value="viewer-card"]')).toHaveCount(1);
  await expect(commandForm.locator('[name="template"] option[value="lurk"]')).toHaveCount(1);
  await expect(commandForm.locator('[name="template"] option[value="timezone"]')).toHaveCount(1);
  await expect(commandForm.locator('[name="template"] option[value="commands-help"]')).toHaveCount(1);
  await expect(commandForm.locator('[name="template"] option[value="coin-flip"]')).toHaveCount(1);
  await expect(commandForm.locator('[name="template"] option[value="random-joke"]')).toHaveCount(1);
  await expect(commandForm.locator('[name="template"] option[value="follow-age"]')).toBeEnabled();
  await expect(commandForm.locator('[name="commandDeliveryPlatform"]')).toHaveCount(0);
  await expect(commandForm.locator('[name="commandSource"][value="tiktok"]')).toHaveCount(1);
  await commandForm.locator('[name="template"]').selectOption('socials');
  await expect(page.locator('#command-template-support')).toContainText('Multi-platform');
  await expect(commandForm.locator('[name="name"]')).toHaveValue('socials');
  await expect(commandForm.locator('[name="actionName"]')).toHaveValue('THSV Command - Socials');
  await expect(commandForm.locator('[name="messageYoutube"]')).toHaveValue(/replace-link/u);
  await expect(commandForm.locator('[name="messageTiktok"]')).toHaveValue(/replace-link/u);
  await expect(commandForm.locator('[name="commandSource"]:checked')).toHaveCount(4);
  await commandForm.locator('[name="template"]').selectOption('coin-flip');
  await expect(commandForm.locator('[name="name"]')).toHaveValue('coinflip');
  await expect(commandForm.locator('[name="responseMode"]')).toHaveValue('custom-script');
  await expect(commandForm.locator('[name="customScript"]')).toHaveValue(/Guid\.NewGuid/u);
  await commandForm.locator('[name="template"]').selectOption('follow-age');
  await expect(commandForm.locator('[name="name"]')).toHaveValue('followage');
  await expect(commandForm.locator('[name="actionName"]')).toHaveValue('THSV Command - Follow Age');
  await expect(commandForm.locator('[name="commandSource"]:checked')).toHaveCount(1);
  await expect(commandForm.locator('[name="commandSource"][value="twitch"]')).toBeChecked();
  await expect(commandForm.locator('[name="customScript"]')).toHaveValue(/api\.twitch\.tv\/helix\/channels\/followers/u);
  await expect(commandForm.locator('[name="globalCooldown"]')).toHaveValue('3');
  await expect(commandForm.locator('[name="userCooldown"]')).toHaveValue('15');
  await expect(page.locator('#command-template-support')).toContainText('Twitch only');
  await commandForm.locator('[name="template"]').selectOption('lurk');
  await expect(commandForm.locator('[name="responseMode"]')).toHaveValue('custom-script');
  await expect(commandForm.locator('[name="customScript"]')).toHaveValue(/thsv\.command\.lurk\.v1/u);
  await commandForm.locator('[name="template"]').selectOption('hug');
  await expect(commandForm.locator('[name="customScript"]')).toHaveValue(/Hug leaders/u);
  await expect(commandForm.locator('[name="customScript"]')).toHaveValue(/counts\.Count >= 2000/u);
  await commandForm.locator('[name="template"]').selectOption('timezone');
  await expect(commandForm.locator('[name="actionName"]')).toHaveValue('THSV Command - Streamer Time');
  await expect(commandForm.locator('[name="customScript"]')).toHaveValue(/TimeZoneInfo\.Local/u);
  await expect(commandForm.locator('[name="commandSource"]:checked')).toHaveCount(4);

  await page.locator('[data-view="timed-actions"]').click();
  await page.locator('#new-timed-action-entry').click();
  const timedForm = page.locator('#timed-action-form');
  await expect(timedForm.locator('[name="id"]')).toHaveValue('social-rotation');
  await expect(timedForm.locator('[name="selectionMode"]')).toHaveValue('platform-shuffle');
  await expect(timedForm.locator('[name="actionId"]')).toHaveValue('7d107c29-1127-5bb1-ae8b-6f04d89a71d4');
  await expect(timedForm.locator('[name="deliveryPlatform"]:checked')).toHaveCount(4);
  await expect(timedForm.locator('details.form-section[open]')).toHaveCount(3);
  await expect(timedForm.locator('summary').filter({ hasText: 'Optional controls' })).toBeVisible();
  await expect(page.locator('#timed-platform-message-editor')).toBeVisible();
  await expect(page.locator('#timed-shared-messages')).toBeHidden();
  await expect(timedForm.locator('[name="template"] option[value="community-links"]')).toHaveCount(1);
  await expect(timedForm.locator('[name="template"] option[value="rules-help"]')).toHaveCount(1);
  await expect(timedForm.locator('[name="template"] option[value="support"]')).toHaveCount(1);
  await expect(timedForm.locator('[name="template"] option[value="schedule"]')).toHaveCount(1);
  const youtubeMessages = page.locator('[data-timed-platform="youtube"]');
  await expect(youtubeMessages).toHaveCount(2);
  await youtubeMessages.nth(0).fill('One message that may visually wrap but remains one card.');
  await youtubeMessages.nth(1).fill('A second independent YouTube message.');
  await expect(page.locator('[data-timed-count="youtube-0"]')).toHaveText('56/200');
  await timedForm.locator('[name="deliveryPlatform"][value="kick"]').uncheck();
  await expect(page.locator('[data-timed-message-platform="kick"]')).toBeHidden();
  await timedForm.locator('[name="intervalMode"]').selectOption('random');
  await expect(timedForm.locator('[data-timed-fixed]')).toBeHidden();
  await expect(timedForm.locator('[data-timed-random]')).toHaveCount(2);
  await expect(page.locator('#timed-action-summary')).toContainText('random minutes');

  await timedForm.locator('[name="template"]').selectOption('community-links');
  await page.locator('#apply-timer-template').click();
  await expect(timedForm.locator('[name="enabled"]')).not.toBeChecked();
  await expect(page.locator('[data-timed-platform="twitch"]').first()).toHaveValue(/replace-with-your-discord-link/u);
});

test('wizard applies editable chat and alert wording presets without changing other platforms', async ({ page }) => {
  await page.goto('/wizard/');
  await page.locator('#token').fill(token);
  await page.locator('#login-form button').click();
  await page.locator('[data-view="chat-overlay"]').click();
  await page.locator('#chat-overlay-form details.form-section').filter({ hasText: 'Events shown in chat' }).locator('summary').click();

  await page.locator('#chat-event-platform').selectOption('youtube');
  await page.locator('#chat-event-style').selectOption('hype');
  await page.locator('#apply-chat-event-style').click();
  await expect(page.locator('[data-event-template="subscriber"]')).toHaveValue(/LET'S GO!/u);
  await page.locator('#chat-event-platform').selectOption('twitch');
  await expect(page.locator('[data-event-template="follow"]')).toHaveValue('{actor} followed');

  await page.locator('[data-view="alerts"]').click();
  await page.locator('[data-select-alert="youtube:super-chat"]').click();
  await page.locator('#alert-profile-form [name="alertStyle"]').selectOption('warm');
  await page.locator('#apply-alert-style').click();
  await expect(page.locator('#alert-profile-form [name="titleTemplate"]')).toHaveValue(/thank you!/u);
  await expect(page.locator('#alert-profile-form [name="detailTemplate"]')).toHaveValue('{message}');
});

test('wizard remembers collapsed sections after a page reload', async ({ page }) => {
  await page.goto('/wizard/');
  await page.locator('#token').fill(token);
  await page.locator('#login-form button').click();
  await page.locator('[data-view="chat-overlay"]').click();

  const layoutSection = page.locator('#chat-overlay-form details.form-section').filter({ hasText: '1. Layout and text' });
  await expect(layoutSection).toHaveAttribute('open', '');
  await layoutSection.locator('summary').click();
  await expect(layoutSection).not.toHaveAttribute('open', '');

  await page.reload();
  await page.locator('#token').fill(token);
  await page.locator('#login-form button').click();
  await page.locator('[data-view="chat-overlay"]').click();
  await expect(page.locator('#chat-overlay-form details.form-section').filter({ hasText: '1. Layout and text' })).not.toHaveAttribute('open', '');
});

test('wizard progressively reveals advanced blocker, alert, reward, and add-on controls', async ({ page }) => {
  await page.goto('/wizard/');
  await page.locator('#token').fill(token);
  await page.locator('#login-form button').click();

  await page.locator('[data-view="blockers"]').click();
  await page.locator('#new-blocker-entry').click();
  const blockerForm = page.locator('#add-filter');
  await expect(blockerForm.locator(':scope > details.guided-form-section')).toHaveCount(3);
  await expect(blockerForm.locator('[name="moduleIds"]')).toBeHidden();
  await blockerForm.locator('[name="scope"]').selectOption('module');
  await blockerForm.locator('[data-guided-section="blocker-limits"] summary').click();
  await expect(blockerForm.locator('[name="moduleIds"]')).toBeVisible();

  await page.locator('[data-view="alerts"]').click();
  await page.locator('[data-select-alert="twitch:follow"]').click();
  const alertForm = page.locator('#alert-profile-form');
  await expect(alertForm.locator(':scope > details.guided-form-section')).toHaveCount(5);
  await alertForm.locator('[data-guided-section="alert-appearance"] summary').click();
  await expect(alertForm.locator('[name="cardTransition"]')).toHaveValue('slide-vertical');
  await alertForm.locator('[name="cardTransition"]').selectOption('fade');
  await expect(page.locator('#alert-preview-card')).toHaveAttribute('data-transition', 'fade');
  await expect(alertForm.locator('[name="aggregationWindowMs"]')).toBeHidden();
  await alertForm.locator('[data-guided-section="alert-aggregation"] summary').click();
  await alertForm.locator('[name="aggregationMode"]').selectOption('sum-quantity');
  await expect(alertForm.locator('[name="aggregationWindowMs"]')).toBeVisible();

  await page.locator('[data-view="rewards"]').click();
  const rewardForm = page.locator('#reward-admin-form');
  await expect(rewardForm.locator('[name="redemptionId"]')).toBeHidden();
  await rewardForm.locator('[name="operation"]').selectOption('fulfill');
  await expect(rewardForm.locator('[name="redemptionId"]')).toBeVisible();

  await page.locator('[data-view="addons"]').click();
  await expect(page.locator('[data-disclosure-key="panel:addons:install"]')).not.toHaveAttribute('open', '');
});

test('wizard shows only the selected platform events and exposes platform color modes', async ({ page }) => {
  await page.goto('/wizard/');
  await page.locator('#token').fill(token);
  await page.locator('#login-form button').click();
  await page.locator('[data-view="chat-overlay"]').click();

  const form = page.locator('#chat-overlay-form');
  await expect(form.locator('[name="eventCategory"]')).toHaveCount(0);
  await expect(form.locator('[name="messageColorMode"]')).toHaveValue('platform');
  await expect(form.locator('[name="platformColorTwitch"]')).toHaveValue('#321b52');
  await expect(form.locator('[name="platformColorYoutube"]')).toHaveValue('#571313');
  await expect(form.locator('[name="platformColorKick"]')).toHaveValue('#153e12');
  await expect(form.locator('[name="platformColorTiktok"]')).toHaveValue('#10272c');

  // Live chat preview reflects settings without staging or connecting to an overlay.
  // "Layout & text" is open by default; other settings sections start collapsed.
  await expect(page.locator('#chat-preview-list .preview-chat-message')).toHaveCount(5);
  await expect(page.locator('#chat-preview-card')).toHaveAttribute('data-layout', 'regular');
  await form.locator('[name="layout"]').selectOption('compact');
  await expect(page.locator('#chat-preview-card')).toHaveAttribute('data-layout', 'compact');
  await form.locator('summary').filter({ hasText: '3. Names, badges, and profile pictures' }).click();
  await form.locator('[name="showProfilePictures"]').uncheck();
  await expect(page.locator('#chat-preview-list .preview-chat-avatar')).toHaveCount(0);

  await form.locator('summary').filter({ hasText: '4. Events shown in chat' }).click();
  await form.locator('[name="showEvents"]').uncheck();
  await expect(page.locator('#chat-preview-list .preview-chat-message')).toHaveCount(4);
  await page.locator('#chat-event-platform').selectOption('youtube');
  await expect(page.locator('[data-platform-event]')).toHaveCount(7);
  await expect(page.locator('#chat-event-template-editor')).toContainText('New subscriber (free)');
  await expect(page.locator('#chat-event-template-editor')).toContainText('New paid member');
  await expect(page.locator('#chat-event-template-editor')).toContainText('Jewels gift');
  await expect(page.locator('#chat-event-template-editor')).not.toContainText('Raid');

  await page.locator('#chat-event-platform').selectOption('tiktok');
  await expect(page.locator('[data-platform-event]')).toHaveCount(4);
  await expect(page.locator('#chat-event-template-editor')).toContainText('Like milestone (every 100)');
  await expect(page.locator('#chat-event-template-editor')).toContainText('%subMonth%');
  await expect(page.locator('#chat-event-template-editor [disabled]')).toHaveCount(0);
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
  await expect(page.locator('#chat .message').last().locator('.role', { hasText: 'MOD' })).toHaveCount(1);
  await expect(page.locator('#chat .message').last().getByText('Moderator', { exact: true })).toHaveCount(0);
  await expect(page.locator('#chat .message').last().locator('.display-name')).toHaveCSS('color', 'rgb(255, 209, 102)');
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

test('all chat platforms use accessible contrasting names, one moderator badge, and full-width bounded cards', async ({ page, request }, testInfo) => {
  await page.setViewportSize({ width: 680, height: 800 });
  await page.goto('/overlay/chat/dock');
  await expect(page.locator('#status')).toHaveText('LIVE');
  const cases = [
    ['twitch', 'twitch-chat.json', 'rgb(255, 209, 102)'],
    ['youtube', 'youtube-chat.json', 'rgb(114, 229, 255)'],
    ['kick', 'kick-chat.json', 'rgb(216, 180, 255)'],
    ['tiktok', 'tiktok-tikfinity-chat.json', 'rgb(255, 143, 171)'],
  ] as const;
  for (const [platform, fixtureName] of cases) {
    const input = await fixture(fixtureName);
    const user = input['user'] as Record<string, unknown>;
    await simulate(request, {
      ...input,
      user: { ...user, roles: ['moderator'], nameColor: '#168a63', badges: [{ id: 'moderator', label: 'Moderator' }] },
      payload: { message: `${platform} readability check with enough text to verify the wider native chat card.` },
    }, `readability-${platform}`);
  }
  for (const [platform, , color] of cases) {
    const card = page.locator(`#chat .message.platform-${platform}`);
    await expect(card.locator('.display-name')).toHaveCSS('color', color);
    await expect(card.locator('.role', { hasText: 'MOD' })).toHaveCount(1);
    await expect(card.getByText('Moderator', { exact: true })).toHaveCount(0);
  }
  await expect(page.locator('#chat .message')).toHaveCount(4);
  const layout = await page.locator('#chat .message').evaluateAll((cards) => cards.map((card) => {
    const bounds = card.getBoundingClientRect();
    return { left: bounds.left, right: bounds.right, bottom: bounds.bottom, width: bounds.width };
  }));
  expect(layout.every((card) => card.left >= 7 && card.right <= 673 && card.bottom <= 792)).toBe(true);
  expect(new Set(layout.map((card) => Math.round(card.width))).size).toBe(1);
  expect(layout[0]?.width).toBeGreaterThanOrEqual(660);

  for (const [platform, fixtureName] of cases) {
    const input = await fixture(fixtureName);
    await simulate(request, { ...input, payload: { message: `${platform} second row checks upward overflow without cutting the newest card.` } }, `overflow-${platform}`);
  }
  await page.waitForTimeout(300);
  const overflowLayout = await page.locator('#chat .message').evaluateAll((cards) => cards.map((card) => {
    const bounds = card.getBoundingClientRect();
    return { top: bounds.top, bottom: bounds.bottom, text: card.textContent || '' };
  }));
  expect(overflowLayout).toHaveLength(8);
  await expect(page.locator('#chat')).toHaveClass(/chat-overflowing/u);
  expect(overflowLayout[0]?.top).toBeLessThan(8);
  expect(overflowLayout.at(-1)?.bottom).toBeLessThanOrEqual(792);
  expect(overflowLayout.at(-1)?.text).toContain('tiktok second row');
  await page.screenshot({ path: testInfo.outputPath('chat-all-platform-readability.png') });
});

test('Viewer Spotlight stays crisp and bounded with long names, maximum fields, missing avatars, crops, and transparency', async ({ page }, testInfo) => {
  await installAddOnOverlayTransport(page);
  const hostHtml = await readFile('overlays/browser/addon-host.html', 'utf8');
  await page.route('**/overlay/addons/thsv.viewer-spotlight', async (route) => await route.fulfill({ contentType: 'text/html', body: hostHtml }));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/overlay/addons/thsv.viewer-spotlight');
  await expect(page.locator('#status')).toHaveText('LIVE');

  const longTitle = `${'Very Long Unicode Viewer Name 🢥 '.repeat(4)}• Twitch`;
  const maximumFields = '999,999 points • Level 999 • 9,999 observed sessions • 99,999 observed messages • 99,999 observed commands';
  await publishViewerSpotlightCard(page, {
    title: longTitle,
    text: maximumFields,
    durationMs: 60_000,
    style: { backgroundMode: 'solid', backgroundColor: '#241438', backgroundOpacity: 1, accentColor: '#8fffe0', textColor: '#ffffff', fontFamily: 'broadcast' },
  });
  await expect(page.locator('#card')).toBeVisible();
  await expect(page.locator('#card-image')).toBeHidden();
  const fullLayout = await page.locator('#card').evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const title = element.querySelector('#card-title');
    const text = element.querySelector('#card-text');
    return {
      inside: bounds.left >= 0 && bounds.top >= 0 && bounds.right <= innerWidth && bounds.bottom <= innerHeight,
      bounded: element.scrollWidth <= element.clientWidth + 1 && element.scrollHeight <= element.clientHeight + 1,
      titleSize: title ? Number.parseFloat(getComputedStyle(title).fontSize) : 0,
      textSize: text ? Number.parseFloat(getComputedStyle(text).fontSize) : 0,
    };
  });
  expect(fullLayout).toMatchObject({ inside: true, bounded: true });
  expect(fullLayout.titleSize).toBeGreaterThanOrEqual(22);
  expect(fullLayout.textSize).toBeGreaterThanOrEqual(16);
  await page.screenshot({ path: testInfo.outputPath('viewer-spotlight-1920x1080.png') });

  await page.setViewportSize({ width: 520, height: 280 });
  const croppedLayout = await page.locator('#card').evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return {
      inside: bounds.left >= 0 && bounds.top >= 0 && bounds.right <= innerWidth && bounds.bottom <= innerHeight,
      bounded: element.scrollWidth <= element.clientWidth + 1 && element.scrollHeight <= element.clientHeight + 1,
    };
  });
  expect(croppedLayout).toEqual({ inside: true, bounded: true });
  await page.screenshot({ path: testInfo.outputPath('viewer-spotlight-cropped.png') });

  await publishViewerSpotlightCard(page, {
    title: 'Transparent Viewer Card', text: maximumFields, durationMs: 60_000,
    style: { backgroundMode: 'none', backgroundColor: '#241438', backgroundOpacity: 0, accentColor: '#ffffff', textColor: '#ffffff', fontFamily: 'serif' },
  });
  const transparentStyle = await page.locator('#card').evaluate((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, shadow: style.boxShadow, border: style.borderColor };
  });
  expect(transparentStyle).toEqual({ background: 'rgba(0, 0, 0, 0)', shadow: 'none', border: 'rgba(0, 0, 0, 0)' });
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgba(0, 0, 0, 0)');

  await publishViewerSpotlightCard(page, { title: 'Fade card', text: 'Animated without changing layout', durationMs: 8_000, presentationMode: 'fade-carousel' });
  await expect(page.locator('#card')).toHaveAttribute('data-presentation', 'fade-carousel');
  await publishViewerSpotlightCard(page, { title: 'Credits card', text: 'Moves vertically inside the fixed browser canvas', durationMs: 10_000, presentationMode: 'credits-scroll' });
  await expect(page.locator('#card')).toHaveAttribute('data-presentation', 'credits-scroll');

  await page.reload();
  await expect(page.locator('#status')).toHaveText('LIVE');
  await expect(page.locator('#card')).toBeHidden();
  await publishViewerSpotlightCard(page, { title: 'Reconnected cleanly', text: 'One fresh card after reconnect', durationMs: 60_000 });
  await expect(page.locator('#card-title')).toHaveText('Reconnected cleanly');
  await expect(page.locator('#card-text')).toHaveText('One fresh card after reconnect');
});
