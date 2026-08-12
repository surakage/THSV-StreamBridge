import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

declare global {
  interface Window {
    __thsvPublishAddOnEvent?: (payload: unknown) => void;
  }
}

const token = 'playwright-control-token-with-32-characters';

function oneSecondWaveFile(): Buffer {
  const sampleRate = 44_100;
  const samples = Buffer.alloc(sampleRate * 2);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + samples.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(samples.length, 40);
  return Buffer.concat([header, samples]);
}

async function fixture(name: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(`tests/fixtures/${name}`, 'utf8')) as Record<string, unknown>;
}

async function simulate(request: APIRequestContext, input: Record<string, unknown>, suffix: string): Promise<void> {
  const source = input['source'] as Record<string, unknown>;
  const eventId = `${String(input['eventId'])}-${randomUUID()}-${suffix}`;
  const response = await request.post('/simulate', {
    headers: { authorization: `Bearer ${token}` },
    data: { ...input, eventId, source: { ...source, eventId } },
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

test('wizard presents the safe Streamer.bot launcher as a guided connection workflow', async ({ page }) => {
  await page.goto('/wizard/');
  await page.getByLabel('Control token').fill(token);
  await page.locator('#login-form button').click();
  await page.locator('[data-view="streamerbot"]').click();
  await expect(page.getByRole('heading', { name: 'Safe Streamer.bot launcher' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Detect automatically' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose Streamer.bot.exe' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start all streaming tools' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start Streamer.bot only' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Optional one-button apps' })).toBeVisible();
  await expect(page.getByLabel('OBS executable')).toBeVisible();
  await expect(page.getByLabel('Speaker.bot executable')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create one-button desktop shortcut' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open installed folder' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy Stream Deck target' })).toBeVisible();
  await expect(page.getByLabel('Stream Deck one-button target')).toHaveAttribute('readonly', '');
  await expect(page.locator('#streamerbot-launcher-state')).toContainText(/Safe launcher|Streamer\.bot/u);
  await page.locator('[data-view="overview"]').click();
  await expect(page.getByRole('button', { name: 'Download recovery key' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy control token' })).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download recovery key' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('THSV StreamBridge Recovery Key.txt');
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  expect(await readFile(downloadPath, 'utf8')).toContain(`Control token: ${token}`);
});

async function publishViewerSpotlightCard(page: Page, payload: Record<string, unknown>): Promise<void> {
  await page.evaluate((cardPayload) => window.__thsvPublishAddOnEvent?.({
    contractVersion: 'thsv-addon-overlay-v1',
    kind: 'addon.publish',
    moduleId: 'thsv.viewer-spotlight',
    topic: 'thsv.viewer-spotlight.card.show',
    payload: cardPayload,
  }), payload);
}

async function publishAddOnEvent(page: Page, moduleId: string, topic: string, payload: Record<string, unknown>): Promise<void> {
  await page.evaluate(({ moduleId: eventModuleId, topic: eventTopic, payload: eventPayload }) => window.__thsvPublishAddOnEvent?.({
    contractVersion: 'thsv-addon-overlay-v1',
    kind: 'addon.publish',
    moduleId: eventModuleId,
    topic: eventTopic,
    payload: eventPayload,
  }), { moduleId, topic, payload });
}

test('Ad Break Companion uses a compact bounded browser source and fades away cleanly', async ({ page }) => {
  await installAddOnOverlayTransport(page);
  const hostHtml = await readFile('overlays/browser/addon-host.html', 'utf8');
  await page.route('**/overlay/ad-break', async (route) => await route.fulfill({ contentType: 'text/html', body: hostHtml }));
  await page.setViewportSize({ width: 480, height: 180 });
  await page.goto('/overlay/ad-break');
  await expect(page.locator('#status')).toHaveText('LIVE');
  await publishAddOnEvent(page, 'thsv.ad-break-companion', 'thsv.ad-break-companion.timer.update', {
    variant: 'ad-break', phase: 'scheduled', label: 'AD BREAK IN', remainingSeconds: 60, maximumSeconds: 60,
    remainingText: '01:00', running: true, live: true, badgeText: 'UPCOMING', lastReason: 'A quick break is coming up',
    contextText: 'Twitch - 3 snoozes available', warning: false, critical: false,
    preview: true,
    style: { fontFamily: 'broadcast', backgroundMode: 'glass', backgroundColor: '#101722', backgroundOpacity: 0.9, accentColor: '#f4c95d', textColor: '#ffffff', mutedColor: '#d9e2ef', warningColor: '#f4c95d', criticalColor: '#ff6b7d', liveColor: '#f4c95d', borderColor: '#f4c95d', showProgressBar: true },
  });
  const shell = page.locator('#timer-shell');
  await expect(shell).toBeVisible();
  await expect(shell).toHaveAttribute('data-variant', 'ad-break');
  await expect(page.locator('#timer-time')).toHaveText('01:00');
  const layout = await shell.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { width: bounds.width, height: bounds.height, inside: bounds.left >= 0 && bounds.top >= 0 && bounds.right <= innerWidth && bounds.bottom <= innerHeight, bounded: element.scrollWidth <= element.clientWidth + 1 && element.scrollHeight <= element.clientHeight + 1 };
  });
  expect(layout).toMatchObject({ inside: true, bounded: true });
  expect(layout.width).toBeLessThanOrEqual(440);
  expect(layout.height).toBeLessThanOrEqual(160);
  await publishAddOnEvent(page, 'thsv.ad-break-companion', 'thsv.ad-break-companion.timer.hide', {});
  await expect(shell).toBeVisible();
  await publishAddOnEvent(page, 'thsv.ad-break-companion', 'thsv.ad-break-companion.timer.update', {
    variant: 'ad-break', phase: 'active', label: 'AD BREAK', remainingSeconds: 90, maximumSeconds: 90,
    remainingText: '01:30', running: true, live: true, badgeText: 'IN PROGRESS', lastReason: 'The stream will be right back',
    contextText: 'Twitch - scheduled break', warning: false, critical: false,
    style: { fontFamily: 'broadcast', backgroundMode: 'glass', backgroundColor: '#101722', backgroundOpacity: 0.9, accentColor: '#f4c95d', textColor: '#ffffff', mutedColor: '#d9e2ef', warningColor: '#f4c95d', criticalColor: '#ff6b7d', liveColor: '#f4c95d', borderColor: '#f4c95d', showProgressBar: true },
  });
  await expect(page.locator('#timer-time')).toHaveText('01:30');
  const activeLayout = await shell.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { width: bounds.width, height: bounds.height, inside: bounds.left >= 0 && bounds.top >= 0 && bounds.right <= innerWidth && bounds.bottom <= innerHeight };
  });
  expect(activeLayout).toMatchObject({ inside: true });
  expect(activeLayout.width).toBeLessThanOrEqual(440);
  expect(activeLayout.height).toBeLessThanOrEqual(160);
  await publishAddOnEvent(page, 'thsv.ad-break-companion', 'thsv.ad-break-companion.timer.hide', {});
  await expect(shell).toHaveClass(/timer-fading/u);
  await expect(shell).toBeHidden({ timeout: 2_000 });
});

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
  await page.locator('[data-view="chat-overlay"]').click();
  const narrowSaveLayout = await page.locator('#chat-overlay-form').evaluate((form) => {
    const preview = form.querySelector('#chat-preview-card');
    const saveRow = form.querySelector('.guided-save-row');
    if (!(preview instanceof HTMLElement) || !(saveRow instanceof HTMLElement)) throw new Error('Chat preview or save row is missing.');
    const previewBounds = preview.getBoundingClientRect();
    const saveBounds = saveRow.getBoundingClientRect();
    return {
      position: getComputedStyle(saveRow).position,
      followsPreview: saveBounds.top >= previewBounds.bottom,
      noHorizontalOverflow: form.scrollWidth <= form.clientWidth + 1,
    };
  });
  expect(narrowSaveLayout).toEqual({ position: 'static', followsPreview: true, noHorizontalOverflow: true });
});

test('wizard exposes automatic commands and one shared non-repeating timed-message list', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/wizard/');
  await page.locator('#token').fill(token);
  await page.locator('#login-form button').click();
  await expect(page.locator('#workspace')).toBeVisible();

  await page.locator('[data-view="command-sync"]').click();
  await expect(page.locator('[data-panel="command-sync"] h2')).toHaveText('Commands');
  await expect(page.locator('#command-directory-catalog')).toBeVisible();
  await expect(page.locator('#command-directory-search')).toBeVisible();
  await page.locator('[data-disclosure-key="panel:command-sync:moderator-directory"] > summary').click();
  await expect(page.locator('#moderator-command-directory-catalog')).toBeVisible();
  await expect(page.locator('#moderator-command-directory-state')).toContainText('never published');
  await page.locator('#expand-command-directory').click();
  const commandRows = page.locator('.command-center-list article');
  expect(await commandRows.count()).toBeGreaterThan(0);
  const commandLayout = await page.locator('[data-disclosure-key="panel:command-sync:viewer-directory"]').evaluate((card) => {
    const catalog = card.querySelector('#command-directory-catalog')?.getBoundingClientRect();
    const sharing = card.querySelector('.command-directory-sharing')?.getBoundingClientRect();
    const codes = [...card.querySelectorAll('.command-center-list code')];
    return {
      sharingBelowCatalog: Boolean(catalog && sharing && sharing.top >= catalog.bottom),
      commandsStayOnOneLine: codes.every((code) => getComputedStyle(code).whiteSpace === 'nowrap'),
      descriptionsAreNotClipped: [...card.querySelectorAll('.command-center-description')].every((description) => {
        const style = getComputedStyle(description);
        return style.whiteSpace === 'normal' && style.overflow !== 'hidden' && style.textOverflow !== 'ellipsis';
      }),
      noHorizontalOverflow: card.scrollWidth <= card.clientWidth + 1,
    };
  });
  expect(commandLayout).toEqual({ sharingBelowCatalog: true, commandsStayOnOneLine: true, descriptionsAreNotClipped: true, noHorizontalOverflow: true });
  const firstCommand = await commandRows.first().locator('code').innerText();
  await page.locator('#command-directory-search').fill(firstCommand);
  expect(await page.locator('.command-center-list article:not([hidden])').count()).toBeGreaterThan(0);
  await page.locator('#command-directory-search').fill('');
  await page.setViewportSize({ width: 620, height: 900 });
  const narrowCommandLayout = await page.locator('[data-disclosure-key="panel:command-sync:viewer-directory"]').evaluate((card) => {
    const urlGrid = card.querySelector('.command-directory-url-grid');
    const commandRow = card.querySelector('.command-center-list article');
    if (!(urlGrid instanceof HTMLElement) || !(commandRow instanceof HTMLElement)) throw new Error('Command directory layout is incomplete.');
    return {
      noHorizontalOverflow: card.scrollWidth <= card.clientWidth + 1,
      urlColumns: getComputedStyle(urlGrid).gridTemplateColumns.split(' ').length,
      rowColumns: getComputedStyle(commandRow).gridTemplateColumns.split(' ').length,
    };
  });
  expect(narrowCommandLayout).toEqual({ noHorizontalOverflow: true, urlColumns: 1, rowColumns: 1 });
  await expect(page.locator('[data-panel="command-sync"] .transaction[aria-hidden="true"]')).toBeHidden();
  await expect(page.locator('#command-sync-state')).toContainText('automatically');
  if (await page.locator('#new-command-batch-entry').isVisible()) {
  await page.locator('#new-command-batch-entry').click();
  const commandForm = page.locator('#design-command');
  await expect(commandForm.locator('[name="actionName"]')).toBeVisible();
  await expect(commandForm.locator(':scope > details.guided-form-section')).toHaveCount(3);
  await expect(commandForm.locator('[data-guided-section="command-basics"]')).toHaveAttribute('open', '');
  await expect(commandForm.locator('[data-guided-section="command-response"]')).toHaveAttribute('open', '');
  await expect(commandForm.locator('[data-guided-section="command-safety"]')).not.toHaveAttribute('open', '');
  await expect(commandForm.locator('[name="responseMode"]')).toHaveValue('platform-message');
  await expect(commandForm.locator('[name="template"] option')).toHaveCount(28);
  for (const bundled of ['chat-play-control','chat-play-guess','chat-play-answer','chat-play-predict','coin-flip','chat-play-slots','chat-play-roulette','chat-play-rps','chat-play-duel','chat-play-accept','chat-play-decline']) {
    await expect(commandForm.locator(`[name="template"] option[value="${bundled}"]`)).toHaveCount(0);
  }
  await expect(commandForm.locator('[name="template"] option[value="free-games"]')).toHaveText('Free Games Discord guide — YouTube + TikTok');
  await expect(commandForm.locator('[name="template"] option[value="village-jukebox-request"]')).toHaveText('Village Jukebox request — Multi-platform');
  await expect(commandForm.locator('[name="template"] option[value="village-jukebox-skip"]')).toHaveText('Village Jukebox moderator skip — Multi-platform');
  await expect(commandForm.locator('[name="template"] option[value="weather"]')).toHaveCount(0);
  await expect(commandForm.locator('[name="template"] option[value="discord"]')).toHaveCount(1);
  for (const removed of ['rules', 'love', 'specs', 'emotes', 'bot']) {
    await expect(commandForm.locator(`[name="template"] option[value="${removed}"]`)).toHaveCount(0);
  }
  await expect(commandForm.locator('[name="template"] option[value="viewer-card"]')).toHaveCount(1);
  await expect(commandForm.locator('[name="template"] option[value="lurk"]')).toHaveCount(1);
  await expect(commandForm.locator('[name="template"] option[value="timezone"]')).toHaveCount(1);
  await expect(commandForm.locator('[name="template"] option[value="commands-help"]')).toHaveCount(1);
  await expect(commandForm.locator('[name="template"] option[value="magic-8-ball"]')).toHaveCount(0);
  await expect(commandForm.locator('[name="template"] option[value="game-suggestion"]')).toHaveCount(1);
  await expect(commandForm.locator('[name="template"] option[value="random-joke"]')).toHaveCount(0);
  await expect(commandForm.locator('[name="template"] option[value="hug"]')).toHaveCount(0);
  await expect(commandForm.locator('[name="template"] option[value="prize-wheel"]')).toHaveCount(1);
  await expect(commandForm.locator('[name="template"] option[value="creator-counter"]')).toHaveCount(0);
  await expect(commandForm.locator('[name="template"] option[value="custom-counter"]')).toHaveCount(1);
  await expect(commandForm.locator('[name="template"] option[value="creator-poll"]')).toHaveCount(0);
  await expect(commandForm.locator('[name="template"] option[value="creator-vote"]')).toHaveCount(0);
  for (const direct of ['village-draw-info','village-draw-enter','village-draw-tickets','village-draw-balance']) {
    await expect(commandForm.locator(`[name="template"] option[value="${direct}"]`)).toHaveCount(0);
  }
  await expect(commandForm.locator('[name="template"] option[value="account-age"]')).toHaveCount(1);
  await expect(commandForm.locator('[name="template"] option[value="uptime"]')).toHaveCount(1);
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
  await commandForm.locator('[name="template"]').selectOption('game-suggestion');
  await expect(commandForm.locator('[name="name"]')).toHaveValue('suggest');
  await expect(commandForm.locator('[name="customScript"]')).toHaveValue(/thsv\.command\.game-suggestions\.v1/u);
  await commandForm.locator('[name="template"]').selectOption('prize-wheel');
  await expect(commandForm.locator('[name="name"]')).toHaveValue('spinwheel');
  await expect(commandForm.locator('[name="minimumRole"]')).toHaveValue('moderator');
  await expect(commandForm.locator('[name="responseMode"]')).toHaveValue('none');
  await expect(commandForm.locator('[name="customScript"]')).not.toHaveValue(/C:\\Users\\/u);
  await expect(commandForm.locator('[name="commandSource"]:checked')).toHaveCount(4);
  await commandForm.locator('[name="template"]').selectOption('account-age');
  await expect(commandForm.locator('[name="name"]')).toHaveValue('accountage');
  await expect(commandForm.locator('[name="customScript"]')).toHaveValue(/api\.twitch\.tv\/helix\/users/u);
  await expect(commandForm.locator('[name="commandSource"]:checked')).toHaveCount(1);
  await expect(commandForm.locator('[name="commandSource"][value="twitch"]')).toBeChecked();
  await commandForm.locator('[name="template"]').selectOption('uptime');
  await expect(commandForm.locator('[name="name"]')).toHaveValue('uptime');
  await expect(commandForm.locator('[name="customScript"]')).toHaveValue(/api\.twitch\.tv\/helix\/streams/u);
  await expect(commandForm.locator('[name="commandSource"]:checked')).toHaveCount(1);
  await expect(commandForm.locator('[name="commandSource"][value="twitch"]')).toBeChecked();
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
  await commandForm.locator('[name="template"]').selectOption('timezone');
  await expect(commandForm.locator('[name="actionName"]')).toHaveValue('THSV Command - Streamer Time');
  await expect(commandForm.locator('[name="customScript"]')).toHaveValue(/TimeZoneInfo\.Local/u);
  await expect(commandForm.locator('[name="commandSource"]:checked')).toHaveCount(4);
  await commandForm.locator('[name="template"]').selectOption('game-suggestion');
  await commandForm.locator('button[type="submit"]').click();
  await page.locator('#approve-batch').check();
  await page.locator('#generate-batch').click();
  const generatedSuggestion = page.locator('#command-generation-result pre');
  await expect(generatedSuggestion).toContainText('CPH.SetGlobalVar(suggestionsKey');
  await expect(generatedSuggestion).toContainText('return userName + " suggested \\"" + suggestion + "\\". It is now on the game list!";');
  }

  await page.locator('[data-view="timed-actions"]').click();
  await page.locator('#new-timed-action-entry').click();
  const timedForm = page.locator('#timed-action-form');
  await expect(timedForm.locator('[name="id"]')).toHaveValue('social-rotation');
  await expect(timedForm.locator('[name="selectionMode"]')).toHaveValue('shuffle-container');
  await expect(timedForm.locator('[name="actionId"]')).toHaveValue('7d107c29-1127-5bb1-ae8b-6f04d89a71d4');
  await expect(timedForm.locator('[name="deliveryPlatform"]:checked')).toHaveCount(4);
  await expect(timedForm.locator('details.form-section[open]')).toHaveCount(1);
  await expect(timedForm.locator('summary').filter({ hasText: 'Optional safety rules' })).toBeVisible();
  await expect(timedForm.locator('summary').filter({ hasText: 'Advanced settings' })).toBeVisible();
  await expect(page.locator('#timed-action-readiness')).toContainText('as one non-repeating rotation');
  await timedForm.locator('[data-open-timed-section="timing"]').click();
  await expect(timedForm.locator('[data-disclosure-key="panel:timed-actions:timing"]')).toHaveAttribute('open', '');
  await timedForm.locator('[data-disclosure-key="panel:timed-actions:timing"] [data-open-timed-section="messages"]').click();
  await expect(timedForm.locator('[data-disclosure-key="panel:timed-actions:messages"]')).toHaveAttribute('open', '');
  await expect(page.locator('#timed-platform-message-editor')).toBeHidden();
  await expect(page.locator('#timed-shared-messages')).toBeVisible();
  await expect(timedForm.locator('[name="template"] option[value="community-links"]')).toHaveCount(1);
  await expect(timedForm.locator('[name="template"] option[value="rules-help"]')).toHaveCount(1);
  await expect(timedForm.locator('[name="template"] option[value="support"]')).toHaveCount(1);
  await expect(timedForm.locator('[name="template"] option[value="schedule"]')).toHaveCount(1);
  const sharedMessages = timedForm.locator('[name="messages"]');
  const firstGroupMessages = timedForm.locator('[data-timed-group-messages="0"]');
  await expect(firstGroupMessages).toHaveValue(/Enjoying the stream/u);
  await firstGroupMessages.fill('One complete shared message.\nA second shared message.');
  await timedForm.locator('#add-timed-message-group').click();
  await timedForm.locator('[data-timed-group-name="1"]').fill('Community links');
  await timedForm.locator('[data-timed-group-messages="1"]').fill('Join the Discord community.');
  await expect(sharedMessages).toHaveValue('One complete shared message.\nA second shared message.\nJoin the Discord community.');
  await expect(page.locator('#timed-action-summary')).toContainText('2 editing group(s) combine into one shuffle list');
  await timedForm.locator('[name="deliveryPlatform"][value="kick"]').uncheck();
  await expect(page.locator('#timed-platform-message-editor')).toBeHidden();
  await timedForm.locator('summary').filter({ hasText: 'Choose when it runs' }).click();
  await timedForm.locator('[name="intervalMode"]').selectOption('random');
  await expect(timedForm.locator('[data-timed-fixed]')).toBeHidden();
  await expect(timedForm.locator('[data-timed-random]')).toHaveCount(2);
  await expect(page.locator('#timed-action-summary')).toContainText('random minutes');

  await timedForm.locator('summary').filter({ hasText: 'Start with a template' }).click();
  await timedForm.locator('[name="template"]').selectOption('community-links');
  await page.locator('#apply-timer-template').click();
  await expect(timedForm.locator('[name="enabled"]')).not.toBeChecked();
  await expect(timedForm.locator('[data-timed-group-messages="0"]')).toHaveValue(/replace-with-your-discord-link/u);
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
  await expect(page.locator('[data-select-alert="youtube:gift"]')).toHaveText('Jewels gift');
  await expect(page.locator('[data-select-alert="kick:gift"]')).toHaveText('Gift');
  await expect(page.locator('[data-select-alert="tiktok:gift"]')).toHaveText('Gift');
  await page.locator('[data-select-alert="youtube:super-chat"]').click();
  await page.locator('#alert-profile-form [name="alertStyle"]').selectOption('warm');
  await page.locator('#apply-alert-style').click();
  await expect(page.locator('#alert-profile-form [name="titleTemplate"]')).toHaveValue(/thank you!/u);
  await expect(page.locator('#alert-profile-form [name="showThankYou"]')).toBeChecked();
  await expect(page.locator('#alert-profile-form [name="thankYouTemplate"]')).toHaveValue('Thank you for supporting the village, {actor}!');
  await expect(page.locator('#preview-alert-thank-you')).toContainText('Thank you for supporting the village');
  await expect(page.locator('#alert-preview-card')).toHaveAttribute('data-platform', 'youtube');
  await expect(page.locator('.preview-alert-event')).toContainText('SUPER CHAT');
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

test('wizard progressively reveals advanced blocker, alert, and add-on controls', async ({ page }) => {
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
  await alertForm.locator('[data-guided-section="alert-sound"] summary').click();
  await alertForm.locator('[name="customSoundFile"]').setInputFiles({ name: 'one-second.wav', mimeType: 'audio/wav', buffer: oneSecondWaveFile() });
  await expect(alertForm.locator('[name="soundMode"]')).toHaveValue('custom');
  await expect(alertForm.locator('[name="durationMs"]')).toHaveValue('2000');
  await expect(page.locator('#alert-state')).toContainText('track plus 1 second');
  await expect(alertForm.locator('[name="customSoundFile"]')).toHaveValue(/one-second\.wav$/u);
  await page.locator('[data-select-alert="youtube:super-chat"]').click();
  await expect(alertForm.locator('[name="customSoundFile"]')).toHaveValue('');
  await expect(alertForm.locator('[name="soundMode"]')).toHaveValue('none');
  await expect(alertForm.locator('[name="durationMs"]')).toHaveValue('');
  await expect(alertForm.locator('[name="aggregationWindowMs"]')).toBeHidden();
  await alertForm.locator('[data-guided-section="alert-aggregation"] summary').click();
  await alertForm.locator('[name="aggregationMode"]').selectOption('sum-quantity');
  await expect(alertForm.locator('[name="aggregationWindowMs"]')).toBeVisible();

  await expect(page.locator('[data-view="rewards"]')).toHaveCount(0);
  await expect(page.locator('[data-panel="rewards"]')).toHaveCount(0);

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
  await expect(page.locator('#chat-preview-list img.preview-chat-emote')).toHaveCount(1);
  await expect(page.locator('#chat-preview-list img.preview-chat-emote')).toHaveAttribute('alt','SampleSloth');
  await expect(page.locator('#chat-preview-list .preview-chat-event .preview-chat-name')).toHaveText('New follower');
  await expect(page.locator('#chat-preview-list .preview-chat-event .preview-chat-body')).toHaveText('ExampleFollower followed the Village. 🎉');
  await expect(page.locator('#chat-preview-card')).toHaveAttribute('data-layout', 'regular');
  const regularPreview = await page.locator('#chat-preview-list .preview-chat-message').first().evaluate((message) => {
    const identity = message.querySelector('.preview-chat-identity');
    return {
      width: message.getBoundingClientRect().width,
      listWidth: message.parentElement?.getBoundingClientRect().width ?? 0,
      identityDivider: identity ? getComputedStyle(identity).borderBottomWidth : '0px',
    };
  });
  expect(regularPreview.width).toBeGreaterThan(regularPreview.listWidth * .95);
  expect(regularPreview.identityDivider).not.toBe('0px');
  await form.locator('.chat-layout-options label').filter({ hasText: 'Compact' }).click();
  await expect(page.locator('#chat-preview-card')).toHaveAttribute('data-layout', 'compact');
  const compactPreview = await page.locator('#chat-preview-list').evaluate((list) => {
    const twitch = list.querySelector<HTMLElement>('.platform-twitch');
    const youtube = list.querySelector<HTMLElement>('.platform-youtube');
    if (!twitch || !youtube) throw new Error('Expected Twitch and YouTube preview bubbles');
    return {
      twitchLeft: twitch.getBoundingClientRect().left,
      youtubeLeft: youtube.getBoundingClientRect().left,
      twitchWidth: twitch.getBoundingClientRect().width,
      listWidth: list.getBoundingClientRect().width,
      radius: getComputedStyle(twitch).borderTopLeftRadius,
    };
  });
  expect(compactPreview.twitchWidth).toBeLessThan(compactPreview.listWidth * .9);
  expect(compactPreview.youtubeLeft).toBeGreaterThan(compactPreview.twitchLeft);
  expect(compactPreview.radius).toBe('15px');
  await form.locator('.chat-layout-options label').filter({ hasText: 'Minimal' }).click();
  await expect(page.locator('#chat-preview-card')).toHaveAttribute('data-layout', 'minimal');
  await expect(page.locator('#chat-preview-list .preview-chat-message').first()).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(page.locator('#chat-preview-list .preview-chat-avatar').first()).toHaveCSS('display', 'none');
  await expect(page.locator('#chat-preview-list .preview-chat-body').first()).toHaveCSS('display', 'inline');
  await form.locator('.chat-layout-options label').filter({ hasText: 'Classic Chat' }).click();
  await expect(page.locator('#chat-preview-card')).toHaveAttribute('data-layout', 'classic');
  await expect(form.locator('[name="messageColorMode"]')).not.toBeVisible();
  await expect(page.locator('#classic-chat-note')).not.toHaveClass(/hidden/u);
  await form.locator('[name="orientation"]').selectOption('horizontal');
  await form.locator('[name="newMessagePosition"]').selectOption('start');
  await form.locator('[name="animation"]').selectOption('fade');
  await form.locator('[name="textAlign"]').selectOption('center');
  await expect(page.locator('#chat-preview-list')).toHaveAttribute('data-orientation', 'horizontal');
  await expect(page.locator('#chat-preview-list')).toHaveAttribute('data-new-message-position', 'start');
  await expect(page.locator('#chat-preview-list')).toHaveAttribute('data-animation', 'fade');
  await expect(page.locator('#chat-preview-list')).toHaveAttribute('data-text-align', 'center');
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
  await expect(page.locator('#chat .message')).toHaveCount(12);
  await expect(page.locator('#chat .message').last().locator('.display-name')).toHaveCSS('white-space', 'nowrap');
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

test('chat renders emote fragments inline and falls back to their text code when an image fails', async ({ page, request }) => {
  await page.route('https://static-cdn.jtvnw.net/**', async (route) => await route.fulfill({ status: 404 }));
  await page.goto('/overlay/chat');
  await expect(page.locator('#status')).toHaveText('LIVE');
  const input = await fixture('twitch-chat.json');
  await simulate(request, { ...input, payload: { message: 'Hello Kappa', fragments: [
    { type: 'text', text: 'Hello ' },
    { type: 'emote', name: 'Kappa', imageUrl: 'https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/2.0', provider: 'twitch' },
  ] } }, 'emote-fallback');
  const body = page.locator('#chat .message').last().locator('.body');
  await expect(body).toHaveText('Hello Kappa');
  await expect(body.locator('img.chat-emote')).toHaveCount(0);
});

test('wide compact chat scatters bubbles safely and minimal chat wraps complete display names', async ({ page, request }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const input = await fixture('twitch-chat.json');
  const baseUser = input['user'] as Record<string, unknown>;

  await page.goto('/overlay/chat?layout=compact');
  await expect(page.locator('#status')).toHaveText('LIVE');
  for (let index = 0; index < 6; index += 1) {
    await simulate(request, { ...input, user: { ...baseUser, displayName: `Scattered Viewer ${String(index)}` }, payload: { message: `Bubble ${String(index)} appears in a safe screen region.` } }, `scatter-${String(index)}`);
  }
  const bubbles = page.locator('#chat .message');
  await expect(bubbles).toHaveCount(6);
  await expect(bubbles.last()).toHaveCSS('opacity', '1');
  const bubbleLayout = await bubbles.evaluateAll((elements) => elements.map((element) => {
    const bounds = element.getBoundingClientRect();
    const overlaps = elements.some((candidate) => {
      if (candidate === element) return false;
      const candidateBounds = candidate.getBoundingClientRect();
      return bounds.left < candidateBounds.right && bounds.right > candidateBounds.left && bounds.top < candidateBounds.bottom && bounds.bottom > candidateBounds.top;
    });
    return { slot: (element as HTMLElement).dataset.bubbleSlot, left: Math.round(bounds.left), top: Math.round(bounds.top), inside: bounds.left >= 0 && bounds.top >= 0 && bounds.right <= innerWidth && bounds.bottom <= innerHeight, overlaps };
  }));
  expect(new Set(bubbleLayout.map((entry) => entry.slot)).size).toBe(6);
  expect(new Set(bubbleLayout.map((entry) => `${String(entry.left)}:${String(entry.top)}`)).size).toBe(6);
  expect(bubbleLayout.every((entry) => entry.inside), JSON.stringify(bubbleLayout)).toBe(true);
  expect(bubbleLayout.every((entry) => !entry.overlaps), JSON.stringify(bubbleLayout)).toBe(true);
  await expect(bubbles.first().locator('.display-name')).toHaveCSS('text-overflow', 'ellipsis');
  await expect(bubbles.first().locator('.display-name')).toHaveCSS('white-space', 'nowrap');
  await page.screenshot({ path: testInfo.outputPath('chat-compact-scattered-1920x1080.png') });

  await page.goto('/overlay/chat?layout=minimal');
  await expect(page.locator('#status')).toHaveText('LIVE');
  await simulate(request, { ...input, user: { ...baseUser, displayName: 'An Extraordinarily Long Village Display Name That Must Remain Fully Visible' }, payload: { message: 'Minimal chat keeps the complete name readable at large font sizes.' } }, 'minimal-long-name');
  const name = page.locator('#chat .display-name');
  await expect(name).toHaveText('An Extraordinarily Long Village Display Name That Must Remain Fully Visible');
  await expect(name).toHaveCSS('text-overflow', 'ellipsis');
  await expect(name).toHaveCSS('white-space', 'nowrap');
  expect(await name.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('chat-minimal-full-name-1920x1080.png') });

  await page.setViewportSize({ width: 480, height: 480 });
  await page.goto('/overlay/chat?layout=minimal');
  await expect(page.locator('#status')).toHaveText('LIVE');
  await page.evaluate("document.documentElement.style.setProperty('--chat-font-size', '24px')");
  await simulate(request, { ...input, user: { ...baseUser, displayName: 'Pencui' }, payload: { message: 'emote only chat' } }, 'minimal-square-chat');
  await simulate(request, {
    ...input,
    eventType: 'reward.redemption',
    user: { ...baseUser, displayName: 'VoodooLilo' },
    payload: { rewardId: 'fan-crown', rewardTitle: 'Pencui holds the Fan Crown', rewardCost: 100, requiresUserInput: false, input: '', redemptionId: 'minimal-square-reward' },
  }, 'minimal-square-reward');
  const minimalRows = page.locator('#chat .message');
  await expect(minimalRows).toHaveCount(2);
  const minimalLayout = await minimalRows.evaluateAll((rows) => rows.map((row) => {
    const identity = row.querySelector('.identity') as HTMLElement;
    const displayName = row.querySelector('.display-name') as HTMLElement;
    const body = row.querySelector('.body') as HTMLElement;
    const identityBounds = identity.getBoundingClientRect();
    const nameBounds = displayName.getBoundingClientRect();
    const bodyBounds = body.getBoundingClientRect();
    const nameStyle = getComputedStyle(displayName);
    return {
      bounded: row.scrollWidth <= row.clientWidth + 1,
      bodyDisplay: getComputedStyle(body).display,
      identityExtraWidth: Math.round(identityBounds.width - nameBounds.width),
      firstLineGap: Math.round(bodyBounds.left - identityBounds.right),
      nameLines: Math.round(nameBounds.height / Number.parseFloat(nameStyle.lineHeight)),
    };
  }));
  expect(minimalLayout.every((row) => row.bounded && row.bodyDisplay === 'inline' && row.identityExtraWidth <= 2 && row.firstLineGap <= 7 && row.nameLines === 1), JSON.stringify(minimalLayout)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('chat-minimal-square-inline.png') });
});

test('compact cropped chat and alert storms stay within their containers after reconnect', async ({ page, request }, testInfo) => {
  await page.setViewportSize({ width: 500, height: 800 });
  await page.goto('/overlay/chat/dock');
  await expect(page.locator('#status')).toHaveText('LIVE');
  await page.evaluate("document.body.dataset.layout = 'compact'");
  const chat = await fixture('kick-chat.json');
  for (let index = 0; index < 10; index += 1) await simulate(request, { ...chat, payload: { message: `Compact message ${String(index)} with enough text to wrap but never overflow the dock.` } }, `compact-${String(index)}`);
  await expect(page.locator('#chat .message')).toHaveCount(10);
  expect(await page.locator('.overlay').evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  const dockLayout = await page.locator('.chat-shell').evaluate((shell) => {
    const shellBounds = shell.getBoundingClientRect();
    const childBounds = [...shell.children].map((child) => child.getBoundingClientRect());
    return {
      fillsViewport: Math.abs(shellBounds.width - innerWidth) <= 1,
      childrenFillShell: childBounds.every((bounds) => Math.abs(bounds.left - shellBounds.left) <= 1 && Math.abs(bounds.right - shellBounds.right) <= 1),
      bounded: shell.scrollWidth <= shell.clientWidth + 1 && shell.scrollHeight <= shell.clientHeight + 1,
    };
  });
  expect(dockLayout).toEqual({ fillsViewport: true, childrenFillShell: true, bounded: true });

  await page.reload();
  await expect(page.locator('#status')).toHaveText('LIVE');
  await simulate(request, chat, 'after-reconnect');
  await expect(page.locator('#chat .message')).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath('chat-compact-reconnect.png') });

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/overlay/alerts');
  await expect(page.locator('#status')).toHaveText('LIVE');
  const alert = await fixture('youtube-super-chat.json');
  for (let index = 0; index < 25; index += 1) {
    const user = alert['user'] as Record<string, unknown>;
    await simulate(request, { ...alert, user: { ...user, displayName: `Long Supporter Name ${String(index)} That Must Never Be Clipped`, avatarUrl: 'https://example.com/avatar.png' } }, `alert-${String(index)}`);
  }
  await expect(page.locator('.alert')).toHaveCount(1);
  await expect(page.locator('.alert-thank-you')).toHaveCount(1);
  await expect(page.locator('.alert-viewer-message')).toHaveCount(1);
  const textOrder = await page.locator('.alert-copy').evaluate((copy) => [...copy.children].map((child) => child.className || child.tagName.toLowerCase()));
  expect(textOrder.indexOf('alert-thank-you')).toBeLessThan(textOrder.indexOf('alert-viewer-message'));
  expect(await page.locator('.alert').evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await page.setViewportSize({ width: 520, height: 320 });
  await page.waitForTimeout(100);
  const fittedTitle = await page.locator('.alert h2').evaluate((title) => {
    const style = getComputedStyle(title);
    const detail = title.parentElement?.querySelector('.alert-thank-you');
    return {
      lines: Math.round(title.getBoundingClientRect().height / Number.parseFloat(style.lineHeight)),
      fontSize: Number.parseFloat(style.fontSize),
      separated: detail ? title.getBoundingClientRect().bottom <= detail.getBoundingClientRect().top : true,
    };
  });
  expect(fittedTitle.lines).toBeLessThanOrEqual(2);
  expect(fittedTitle.fontSize).toBeGreaterThanOrEqual(16);
  expect(fittedTitle.separated).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('alert-storm.png') });
});

test('Classic Chat renders a bounded card-free four-platform conversation', async ({ page, request }, testInfo) => {
  await page.setViewportSize({ width: 520, height: 760 });
  await page.goto('/overlay/chat/dock?layout=classic');
  await expect(page.locator('#status')).toHaveText('LIVE');

  for (const [index, fixtureName] of ['twitch-chat.json', 'youtube-chat.json', 'kick-chat.json', 'tiktok-tikfinity-chat.json'].entries()) {
    const input = await fixture(fixtureName);
    const payload = input['payload'] as Record<string, unknown>;
    await simulate(request, { ...input, payload: { ...payload, message: `Classic chat message ${String(index + 1)} stays readable without a card background.` } }, `classic-${String(index)}`);
  }

  const messages = page.locator('#chat .message');
  await expect(messages).toHaveCount(4);
  for (const message of await messages.all()) {
    await expect(message).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(message).toHaveCSS('border-top-width', '0px');
    await expect(message.locator('.body')).toHaveCSS('display', 'inline');
  }
  expect(await page.locator('.chat-feed').evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('chat-classic-four-platforms.png') });
});

test('chat dock keeps stable typography and one-line names at its minimum and maximum widths', async ({ page, request }) => {
  const input = await fixture('twitch-chat.json');
  const user = input['user'] as Record<string, unknown>;
  await page.setViewportSize({ width: 280, height: 640 });
  await page.goto('/overlay/chat/dock?layout=classic');
  await expect(page.locator('#status')).toHaveText('LIVE');
  await simulate(request, { ...input, user: { ...user, displayName: 'An Extremely Long Village Creator Display Name' }, payload: { message: 'This message body is allowed to wrap while the username always stays on one line.' } }, 'dock-minimum-name');
  await expect(page.locator('#chat .message')).toHaveCount(1);
  const minimum = await page.locator('.overlay').evaluate((overlay) => {
    const name = overlay.querySelector('.display-name') as HTMLElement;
    const body = overlay.querySelector('.body') as HTMLElement;
    const nameStyle = getComputedStyle(name);
    return { width: overlay.getBoundingClientRect().width, fontSize: Number.parseFloat(nameStyle.fontSize), nameLines: Math.round(name.getBoundingClientRect().height / Number.parseFloat(nameStyle.lineHeight)), nameWhiteSpace: nameStyle.whiteSpace, bodyWhiteSpace: getComputedStyle(body).whiteSpace };
  });
  expect(minimum.width).toBe(320);
  expect(minimum.fontSize).toBeCloseTo(16 * .94, 1);
  expect(minimum).toMatchObject({ nameLines: 1, nameWhiteSpace: 'nowrap', bodyWhiteSpace: 'normal' });

  await page.setViewportSize({ width: 1_100, height: 700 });
  expect(await page.locator('.overlay').evaluate((overlay) => overlay.getBoundingClientRect().width)).toBe(760);
  await expect(page.locator('.display-name')).toHaveCSS('white-space', 'nowrap');
});

test('runtime chat layouts are distinct cards, speech bubbles, nameplates, and chat rows', async ({ page, request }) => {
  await page.setViewportSize({ width: 680, height: 800 });
  await page.goto('/overlay/chat/dock');
  await expect(page.locator('#status')).toHaveText('LIVE');
  await simulate(request, await fixture('twitch-chat.json'), 'layout-twitch');
  await simulate(request, await fixture('youtube-chat.json'), 'layout-youtube');
  const first = page.locator('#chat .message').first();
  const youtube = page.locator('#chat .message.platform-youtube');

  await page.evaluate("document.body.dataset.layout = 'regular'");
  await expect(first.locator('.identity')).toHaveCSS('border-bottom-width', '1px');
  expect(await first.evaluate((message) => message.getBoundingClientRect().width / (message.parentElement?.getBoundingClientRect().width ?? 1))).toBeGreaterThan(.95);

  await page.evaluate("document.body.dataset.layout = 'compact'");
  await expect(first).toHaveCSS('align-self', 'flex-start');
  await expect(youtube).toHaveCSS('align-self', 'flex-end');
  expect(await first.evaluate((message) => message.getBoundingClientRect().width / (message.parentElement?.getBoundingClientRect().width ?? 1))).toBeLessThan(.9);

  await page.evaluate("document.body.dataset.layout = 'minimal'");
  await expect(first).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(first.locator('.avatar-frame')).toHaveCSS('display', 'none');
  await expect(first.locator('.platform')).toHaveCSS('display', 'none');
  await expect(first.locator('.body')).toHaveCSS('display', 'inline');

  await page.evaluate("document.body.dataset.layout = 'classic'");
  await expect(first).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(first.locator('.avatar-frame')).not.toHaveCSS('display', 'none');
  await expect(first.locator('.body')).toHaveCSS('display', 'inline');
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
  await page.waitForTimeout(300);
  const layout = await page.locator('#chat .message').evaluateAll((cards) => cards.map((card) => {
    const bounds = card.getBoundingClientRect();
    return { left: bounds.left, right: bounds.right, bottom: bounds.bottom, width: bounds.width };
  }));
  expect(layout.every((card) => card.left >= 7 && card.right <= 673 && card.bottom <= 792), JSON.stringify(layout)).toBe(true);
  expect(new Set(layout.map((card) => Math.round(card.width))).size).toBe(1);
  expect(layout[0]?.width, JSON.stringify(layout)).toBeGreaterThanOrEqual(660);

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

test('Stream Labels selects one persistent label or a bounded combined panel', async ({ page }, testInfo) => {
  await installAddOnOverlayTransport(page);
  const hostHtml = await readFile('overlays/browser/addon-host.html', 'utf8');
  await page.route('**/overlay/addons/thsv.stream-labels**', async (route) => await route.fulfill({ contentType: 'text/html', body: hostHtml }));
  await page.setViewportSize({ width: 900, height: 260 });
  await page.goto('/overlay/addons/thsv.stream-labels?label=follower');
  await expect(page.locator('#status')).toHaveText('LIVE');
  const payload = {
    labels: {
      follower: { key: 'follower', title: 'Latest Follower', value: 'A Very Long Example Follower Name That Still Wraps Safely', platform: 'twitch' },
      member: { key: 'member', title: 'Latest Member', value: 'Example Member · 12 months', platform: 'youtube' },
      support: { key: 'support', title: 'Latest Support', value: 'Example Supporter · 100.00 USD', platform: 'youtube' },
    },
    style: { showLabelTitle: true, showPlatform: true, backgroundMode: 'glass', backgroundColor: '#101820', backgroundOpacity: 0.88, accentColor: '#7ff5cc', textColor: '#ffffff', fontFamily: 'broadcast', fontSize: 42, textAlign: 'left' },
  };
  await page.evaluate((value) => window.__thsvPublishAddOnEvent?.({
    contractVersion: 'thsv-addon-overlay-v1', kind: 'addon.publish', moduleId: 'thsv.stream-labels',
    topic: 'thsv.stream-labels.labels.update', payload: value,
  }), payload);
  await expect(page.locator('.stream-label')).toHaveCount(1);
  await expect(page.locator('.stream-label:visible')).toHaveCount(1);
  await expect(page.locator('.stream-label-value:visible')).toHaveText('A Very Long Example Follower Name That Still Wraps Safely');
  const bounds = await page.locator('.stream-label:visible').evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { inside: box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight, bounded: element.scrollWidth <= element.clientWidth + 1 };
  });
  expect(bounds).toEqual({ inside: true, bounded: true });
  await page.screenshot({ path: testInfo.outputPath('stream-label-follower.png') });

  await page.setViewportSize({ width: 900, height: 700 });
  await page.goto('/overlay/addons/thsv.stream-labels?label=all');
  await page.evaluate((value) => window.__thsvPublishAddOnEvent?.({
    contractVersion: 'thsv-addon-overlay-v1', kind: 'addon.publish', moduleId: 'thsv.stream-labels',
    topic: 'thsv.stream-labels.labels.update', payload: value,
  }), payload);
  await expect(page.locator('.stream-label:visible')).toHaveCount(3);
  const combined = await page.locator('#label-shell').evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { inside: box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight, bounded: element.scrollWidth <= element.clientWidth + 1 };
  });
  expect(combined).toEqual({ inside: true, bounded: true });
});

test('Village Roll Call leaderboard card remains readable in a cropped OBS source', async ({ page }) => {
  await installAddOnOverlayTransport(page);
  const hostHtml = await readFile('overlays/browser/addon-host.html', 'utf8');
  await page.route('**/overlay/addons/thsv.village-roll-call', async (route) => await route.fulfill({ contentType: 'text/html', body: hostHtml }));
  await page.setViewportSize({ width: 680, height: 260 });
  await page.goto('/overlay/addons/thsv.village-roll-call');
  await expect(page.locator('#status')).toHaveText('LIVE');
  await page.evaluate(() => window.__thsvPublishAddOnEvent?.({
    contractVersion: 'thsv-addon-overlay-v1',
    kind: 'addon.publish',
    moduleId: 'thsv.village-roll-call',
    topic: 'thsv.village-roll-call.card.show',
    payload: {
      cardKind: 'village-roll-call', mode: 'preview', headline: 'Village Roll Call', monthLabel: 'July 2026',
      subtitle: 'Monthly check-in leaderboard',
      leaders: [
        { rank: 1, displayName: 'A Very Long Villager Display Name', count: 31 },
        { rank: 2, displayName: 'Example Viewer', count: 30 },
        { rank: 3, displayName: 'CozySloth', count: 29 },
        { rank: 4, displayName: 'Night Owl', count: 28 },
        { rank: 5, displayName: 'Early Bird', count: 27 },
      ],
      durationMs: 60_000,
    },
  }));
  await expect(page.locator('#roll-call-shell')).toBeVisible();
  await expect(page.locator('.roll-call-place')).toHaveCount(3);
  await expect(page.locator('.roll-call-runner')).toHaveCount(2);
  const bounds = await page.locator('#roll-call-shell').evaluate((element) => {
    const box = element.getBoundingClientRect();
    return {
      inside: box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight,
      bounded: element.scrollWidth <= element.clientWidth + 1 && element.scrollHeight <= element.clientHeight + 1,
    };
  });
  expect(bounds).toEqual({ inside: true, bounded: true });
});

test('Village Hydration Station uses the exact bounded fill template', async ({ page }, testInfo) => {
  await installAddOnOverlayTransport(page);
  const hostHtml = await readFile('overlays/browser/addon-host.html', 'utf8');
  await page.route('**/overlay/addons/thsv.village-hydration-station', async (route) => await route.fulfill({ contentType: 'text/html', body: hostHtml }));
  await page.setViewportSize({ width: 520, height: 620 });
  await page.goto('/overlay/addons/thsv.village-hydration-station');
  await publishAddOnEvent(page, 'thsv.village-hydration-station', 'thsv.village-hydration-station.hydration.update', {
    cardKind: 'hydration-station', visible: true, title: 'Water Goal', totalOunces: 32, goalOunces: 64, percentage: 50,
    nextReminderAt: Date.now() + 45 * 60_000, showNumbers: true, showNextReminder: true, live: true, templatePreview: true,
    notice: { kind: 'preview', text: 'Hydration check. Time for a sip of water.' },
    style: { containerStyle: 'bottle', backgroundMode: 'glass', backgroundColor: '#0b1720', backgroundOpacity: .9, waterColor: '#55d6ff', waterHighlightColor: '#b8f3ff', accentColor: '#7ff5cc', textColor: '#ffffff', mutedColor: '#c9e7ef' },
  });
  const shell = page.locator('#hydration-shell');
  await expect(shell).toBeVisible();
  await expect(page.locator('#hydration-title')).toHaveText('Water Goal');
  await expect(page.locator('#hydration-total')).toHaveText('32');
  await expect(page.locator('#hydration-percent')).toHaveText('50%');
  await expect(page.locator('#hydration-progress')).toHaveAttribute('style', /width:\s*50%/u);
  await expect(page.locator('#hydration-notice-text')).toContainText('Hydration check');
  const titleBounds = await page.locator('#hydration-title').evaluate((element) => ({
    clipped: element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1,
    lineHeight: getComputedStyle(element).lineHeight,
  }));
  expect(titleBounds.clipped).toBe(false);
  expect(Number.parseFloat(titleBounds.lineHeight)).toBeGreaterThan(25);
  const bounds = await shell.evaluate((element) => { const box = element.getBoundingClientRect(); return { inside: box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight, bounded: element.scrollWidth <= element.clientWidth + 1 && element.scrollHeight <= element.clientHeight + 1 }; });
  expect(bounds).toEqual({ inside: true, bounded: true });
  const fill = await page.locator('#hydration-liquid').evaluate((element) => { const liquid = element.getBoundingClientRect(); const vessel = element.parentElement?.getBoundingClientRect(); return vessel ? liquid.height / vessel.height : 0; });
  expect(fill).toBeGreaterThan(.45); expect(fill).toBeLessThan(.55);
  await page.screenshot({ path: testInfo.outputPath('hydration-station-clean.png') });
  await page.setViewportSize({ width: 300, height: 360 });
  const compactBounds = await shell.evaluate((element) => { const box = element.getBoundingClientRect(); return { inside: box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight, bounded: element.scrollWidth <= element.clientWidth + 1 && element.scrollHeight <= element.clientHeight + 1 }; });
  expect(compactBounds).toEqual({ inside: true, bounded: true });
});

test('Fan Crown keeps a long holder name and season details inside a cropped OBS source', async ({ page }, testInfo) => {
  await installAddOnOverlayTransport(page);
  const hostHtml = await readFile('overlays/browser/addon-host.html', 'utf8');
  await page.route('**/overlay/addons/thsv.fan-crown', async (route) => await route.fulfill({ contentType: 'text/html', body: hostHtml }));
  await page.setViewportSize({ width: 760, height: 500 }); await page.goto('/overlay/addons/thsv.fan-crown');
  await publishAddOnEvent(page, 'thsv.fan-crown', 'thsv.fan-crown.card.show', {
    cardKind: 'fan-crown', state: 'held', eventTitle: 'CROWN CAPTURED', seasonMonth: '2026-08', currentCost: 1_250, durationMs: 60_000,
    holder: { displayName: 'Example Villager With A Very Long Display Name', platform: 'twitch', avatarUrl: '', claimedAt: new Date(Date.now() - 18 * 60_000).toISOString(), captures: 4, totalSpent: 2_750 },
    leaders: [{ rank: 1, displayName: 'Example Villager', totalSpent: 2_750 }, { rank: 2, displayName: 'CozySloth', totalSpent: 2_100 }, { rank: 3, displayName: 'Night Owl', totalSpent: 1_600 }],
    style: { backgroundMode: 'glass', backgroundColor: '#201335', backgroundOpacity: .82, accentColor: '#f4cc63', textColor: '#ffffff', fontFamily: 'broadcast' },
  });
  await expect(page.locator('#fan-crown-shell')).toBeVisible(); await expect(page.locator('#fan-crown-name')).toHaveText('Example Villager With A Very Long Display Name'); await expect(page.locator('#fan-crown-name')).toHaveAttribute('data-length', 'very-long');
  const bounds = await page.locator('#fan-crown-shell').evaluate((element) => { const box = element.getBoundingClientRect(); return { inside: box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight, bounded: element.scrollWidth <= element.clientWidth + 1 && element.scrollHeight <= element.clientHeight + 1 }; });
  expect(bounds).toEqual({ inside: true, bounded: true }); await expect(page.locator('.fan-crown-leader')).toHaveCount(3); await page.screenshot({ path: testInfo.outputPath('fan-crown-crest.png') });
});

test('Village Polls stays compact, translucent, and bounded while results update', async ({ page }, testInfo) => {
  await installAddOnOverlayTransport(page);
  const hostHtml = await readFile('overlays/browser/addon-host.html', 'utf8');
  await page.route('**/overlay/addons/thsv.village-polls', async (route) => await route.fulfill({ contentType: 'text/html', body: hostHtml }));
  await page.setViewportSize({ width: 720, height: 520 });
  await page.goto('/overlay/addons/thsv.village-polls');
  await page.evaluate(() => window.__thsvPublishAddOnEvent?.({
    contractVersion: 'thsv-addon-overlay-v1', kind: 'addon.publish', moduleId: 'thsv.village-polls', topic: 'thsv.village-polls.poll.update',
    payload: {
      cardKind: 'village-polls', state: 'open', question: 'Which cozy community activity should we choose for the next village night?', totalVotes: 42,
      closesAt: new Date(Date.now() + 90_000).toISOString(), winnerIndexes: [], durationMs: 60_000,
      options: [
        { index: 1, label: 'Community game night', votes: 16, percentage: 38, platforms: { twitch: 7, youtube: 4, kick: 3, tiktok: 2 } },
        { index: 2, label: 'Movie watch-along', votes: 11, percentage: 26, platforms: { twitch: 4, youtube: 3, kick: 2, tiktok: 2 } },
        { index: 3, label: 'Creative build challenge', votes: 8, percentage: 19, platforms: { twitch: 3, youtube: 2, kick: 2, tiktok: 1 } },
        { index: 4, label: 'Chill story night', votes: 7, percentage: 17, platforms: { twitch: 2, youtube: 2, kick: 1, tiktok: 2 } },
      ],
      style: { layout: 'compact', backgroundColor: '#111923', backgroundOpacity: 0.55, accentColor: '#7ff5cc', textColor: '#ffffff', showPercentages: true, showVoteCounts: true, showTimer: true, showPlatformBreakdown: true, transition: 'slide' },
    },
  }));
  await expect(page.locator('#poll-shell')).toBeVisible();
  await expect(page.locator('.poll-option')).toHaveCount(4);
  const bounds = await page.locator('#poll-shell').evaluate((element) => {
    const box = element.getBoundingClientRect(); const board = element.querySelector('.poll-board'); const background = board ? getComputedStyle(board).backgroundColor : '';
    return { inside: box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight, bounded: element.scrollWidth <= element.clientWidth + 1 && element.scrollHeight <= element.clientHeight + 1, width: box.width, background };
  });
  expect(bounds.inside).toBe(true); expect(bounds.bounded).toBe(true); expect(bounds.width).toBeLessThanOrEqual(590); expect(bounds.background).toContain('0.55');
  await page.screenshot({ path: testInfo.outputPath('village-polls-compact.png') });
  await page.evaluate(() => window.__thsvPublishAddOnEvent?.({
    contractVersion: 'thsv-addon-overlay-v1', kind: 'addon.publish', moduleId: 'thsv.village-polls', topic: 'thsv.village-polls.poll.update',
    payload: {
      cardKind: 'village-polls', state: 'closed', question: 'Which cozy community activity should we choose?', totalVotes: 10, winnerIndexes: [0], durationMs: 1_000,
      options: [{ index: 1, label: 'Community game night', votes: 7, percentage: 70 }, { index: 2, label: 'Movie watch-along', votes: 3, percentage: 30 }],
      style: { layout: 'compact', backgroundColor: '#111923', backgroundOpacity: 0.55, accentColor: '#7ff5cc', textColor: '#ffffff', transition: 'slide' },
    },
  }));
  await expect(page.locator('#poll-shell')).toHaveClass(/poll-leaving/u);
  await expect(page.locator('#poll-status')).toHaveText('WINNER', { timeout: 1_200 });
  await expect(page.locator('.poll-option[data-winner="true"]')).toHaveCount(1);
  await expect(page.locator('#poll-shell')).toBeHidden({ timeout: 2_500 });
});

test('Village Draw cycles locally and reveals a bounded translucent prize ticket', async ({ page }, testInfo) => {
  await installAddOnOverlayTransport(page);
  const hostHtml = await readFile('overlays/browser/addon-host.html', 'utf8');
  await page.route('**/overlay/addons/thsv.village-draw', async (route) => await route.fulfill({ contentType: 'text/html', body: hostHtml }));
  await page.setViewportSize({ width: 720, height: 420 }); await page.goto('/overlay/addons/thsv.village-draw');
  await page.evaluate(() => window.__thsvPublishAddOnEvent?.({
    contractVersion: 'thsv-addon-overlay-v1', kind: 'addon.publish', moduleId: 'thsv.village-draw', topic: 'thsv.village-draw.card.show',
    payload: { cardKind: 'village-draw', phase: 'winner', giveawayName: 'Village Summer Draw', prizeName: 'A Cozy Game Bundle and Limited Village Keepsake', winnerMessage: 'The village has chosen!',
      winner: { displayName: 'Example Villager With A Long Display Name', platform: 'twitch', avatarUrl: '' }, entrants: ['CozySloth', 'Early Bird', 'Night Owl'], entrantCount: 42, ticketCount: 84,
      durationMs: 60_000, drawAnimationMs: 2_000, style: { layout: 'compact', backgroundColor: '#10201b', backgroundOpacity: .62, accentColor: '#ffd166', textColor: '#ffffff', fontFamily: 'broadcast', showConfetti: true, showPrizeImage: true, showWinnerAvatar: true, showPlatformBadge: true, showEntryCount: true, playWinnerTone: false } },
  }));
  await expect(page.locator('#draw-shell')).toBeVisible(); await expect(page.locator('#draw-status')).toHaveText('DRAWING…');
  await expect(page.locator('#draw-status')).toHaveText('WINNING TICKET', { timeout: 3_000 });
  await expect(page.locator('#draw-name')).toHaveText('Example Villager With A Long Display Name'); await expect(page.locator('#draw-confetti i')).toHaveCount(18);
  const bounds = await page.locator('#draw-shell').evaluate((element) => { const box = element.getBoundingClientRect(); const ticket = element.querySelector('.draw-ticket'); return { inside: box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight, bounded: element.scrollWidth <= element.clientWidth + 1 && element.scrollHeight <= element.clientHeight + 1, width: box.width, background: ticket ? getComputedStyle(ticket).backgroundColor : '' }; });
  expect(bounds.inside).toBe(true); expect(bounds.bounded).toBe(true); expect(bounds.width).toBeLessThanOrEqual(620); expect(bounds.background).toContain('0.62');
  await expect(page.locator('#draw-name')).toHaveAttribute('data-length', 'long');
  await page.screenshot({ path: testInfo.outputPath('village-draw-prize-ticket.png') });
});

test('Prize Wheel spins equal slices, reveals the fixed winner, and remains bounded when cropped in OBS', async ({ page }, testInfo) => {
  await installAddOnOverlayTransport(page);
  const hostHtml = await readFile('overlays/browser/addon-host.html', 'utf8');
  await page.route('**/overlay/addons/thsv.prize-wheel', async (route) => await route.fulfill({ contentType: 'text/html', body: hostHtml }));
  await page.setViewportSize({ width: 680, height: 680 });
  await page.goto('/overlay/addons/thsv.prize-wheel');
  await expect(page.locator('#status')).toHaveText('LIVE');
  await page.evaluate(() => window.__thsvPublishAddOnEvent?.({
    contractVersion: 'thsv-addon-overlay-v1', kind: 'addon.publish', moduleId: 'thsv.prize-wheel',
    topic: 'thsv.prize-wheel.wheel.spin',
    payload: {
      title: 'PICK TONIGHT’S GAME',
      options: ['Cozy Game', 'Story Game', 'Community Night', 'Wildcard', 'Retro Game', 'Challenge Run', 'Viewer Choice', 'New Release', 'Speedrun', 'Surprise'],
      winnerIndex: 7, winner: 'New Release', spinDurationMs: 1_000, winnerDurationMs: 60_000, sequence: 1,
      style: { backgroundColor: '#101521', wheelColors: ['#7c3aed', '#0891b2', '#16a34a', '#ea580c'], textColor: '#ffffff', accentColor: '#ffd166', winnerColor: '#7ff5cc' },
    },
  }));
  await expect(page.locator('#wheel-shell')).toBeVisible();
  await expect(page.locator('.wheel-option')).toHaveCount(10);
  await expect(page.locator('.wheel-stud')).toHaveCount(10);
  await expect(page.locator('#wheel-result')).toHaveClass(/revealed/u, { timeout: 2_000 });
  await expect(page.locator('#wheel-winner')).toHaveText('New Release');
  const fullBounds = await page.locator('#wheel-shell').evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { inside: box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight, bounded: element.scrollWidth <= element.clientWidth + 1 && element.scrollHeight <= element.clientHeight + 1 };
  });
  expect(fullBounds).toEqual({ inside: true, bounded: true });
  await page.screenshot({ path: testInfo.outputPath('prize-wheel-680.png') });
  await page.setViewportSize({ width: 420, height: 420 });
  const croppedBounds = await page.locator('#wheel-shell').evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { inside: box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight, bounded: element.scrollWidth <= element.clientWidth + 1 && element.scrollHeight <= element.clientHeight + 1 };
  });
  expect(croppedBounds).toEqual({ inside: true, bounded: true });
  await page.screenshot({ path: testInfo.outputPath('prize-wheel-cropped.png') });
});

test('Raid Scout mounts a locally cached native clip URL without an iframe handshake or blob conversion', async ({ page }) => {
  await installAddOnOverlayTransport(page);
  const hostHtml = await readFile('overlays/browser/addon-host.html', 'utf8');
  await page.route('**/overlay/addons/thsv.raid-scout', async (route) => await route.fulfill({ contentType: 'text/html', body: hostHtml }));
  await page.route('**/overlay/cache/raid-preview.mp4', async (route) => await route.fulfill({ contentType: 'video/mp4', body: Buffer.from([0, 0, 0, 0]) }));
  await page.goto('/overlay/addons/thsv.raid-scout');
  await page.locator('#media').evaluate((element) => {
    const media = element as HTMLVideoElement;
    let source = '';
    Object.defineProperty(media, 'src', { configurable: true, get: () => source, set: (value) => { source = String(value); } });
    Object.defineProperty(media, 'readyState', { configurable: true, get: () => HTMLMediaElement.HAVE_ENOUGH_DATA });
    media.load = () => undefined;
    media.play = async () => { media.dispatchEvent(new Event('playing')); };
  });
  await page.evaluate(() => window.__thsvPublishAddOnEvent?.({
    contractVersion: 'thsv-addon-overlay-v1', kind: 'addon.publish', moduleId: 'thsv.raid-scout',
    topic: 'thsv.raid-scout.media.play',
    payload: { playbackId: 'raid-clip-1', url: '/overlay/cache/raid-preview.mp4', durationMs: 60_000, muted: true, title: 'One raid preview' },
  }));
  await expect(page.locator('#embed-media')).toBeHidden();
  await expect(page.locator('#media')).toBeVisible();
  expect(await page.locator('#media').evaluate((element) => new URL((element as HTMLVideoElement).src).pathname)).toBe('/overlay/cache/raid-preview.mp4');
  await expect(page.locator('#media-shell')).toHaveClass(/media-playing/u);
  await expect(page.locator('#media-shell')).not.toHaveClass(/media-canvas-active/u);
  await expect(page.locator('#media-canvas')).toBeHidden();
  await expect(page.locator('#media-title')).toHaveText('One raid preview');
  await expect(page.locator('#media-title')).toHaveClass(/media-title-live/u);

  await page.evaluate(() => window.__thsvPublishAddOnEvent?.({
    contractVersion: 'thsv-addon-overlay-v1', kind: 'addon.publish', moduleId: 'thsv.raid-scout',
    topic: 'thsv.raid-scout.media.stop', payload: { fade: true },
  }));
  await expect(page.locator('#media-shell')).toHaveClass(/fading/u);
  await expect(page.locator('#media-shell')).toBeHidden({ timeout: 2_000 });
});

test('native clip playback tolerates a transient buffer stall without skipping', async ({ page }) => {
  await page.clock.install();
  await installAddOnOverlayTransport(page);
  const hostHtml = await readFile('overlays/browser/addon-host.html', 'utf8');
  await page.route('**/overlay/addons/thsv.random-clip-player', async (route) => await route.fulfill({ contentType: 'text/html', body: hostHtml }));
  await page.route('**/overlay/cache/random-preview.mp4', async (route) => await route.fulfill({ contentType: 'video/mp4', body: Buffer.from([0, 0, 0, 0]) }));
  await page.goto('/overlay/addons/thsv.random-clip-player');
  await page.locator('#media').evaluate((element) => {
    const media = element as HTMLVideoElement;
    let source = '';
    let readyState: number = HTMLMediaElement.HAVE_ENOUGH_DATA;
    Object.defineProperty(media, 'src', { configurable: true, get: () => source, set: (value) => { source = String(value); } });
    Object.defineProperty(media, 'readyState', { configurable: true, get: () => readyState, set: (value) => { readyState = Number(value); } });
    Object.defineProperty(media, 'duration', { configurable: true, get: () => 60 });
    Object.defineProperty(media, 'currentTime', { configurable: true, get: () => 5 });
    media.load = () => undefined;
    media.play = async () => { media.dispatchEvent(new Event('playing')); };
  });
  await publishAddOnEvent(page, 'thsv.random-clip-player', 'thsv.random-clip-player.media.play', {
    playbackId: 'random-clip-stall-1', url: '/overlay/cache/random-preview.mp4', durationMs: 60_000, muted: true, title: 'A compact transient title',
  });
  await expect(page.locator('#media-shell')).toHaveClass(/media-playing/u);
  await expect(page.locator('#media-title')).toBeVisible();

  await page.locator('#media').evaluate((element) => {
    const media = element as HTMLVideoElement;
    Object.defineProperty(media, 'readyState', { configurable: true, get: () => HTMLMediaElement.HAVE_CURRENT_DATA });
    media.dispatchEvent(new Event('waiting'));
  });
  await page.clock.fastForward(6_000);
  await expect(page.locator('#media-shell')).toBeVisible();
  await expect(page.locator('#media-shell')).toHaveClass(/media-playing/u);
  await expect(page.locator('#media-title')).toBeHidden();
});

test('media template previews use the production frame and remain visible until explicitly hidden', async ({ page }) => {
  await installAddOnOverlayTransport(page);
  const hostHtml = await readFile('overlays/browser/addon-host.html', 'utf8');
  await page.route('**/overlay/addons/thsv.random-clip-player', async (route) => await route.fulfill({ contentType: 'text/html', body: hostHtml }));
  await page.goto('/overlay/addons/thsv.random-clip-player');
  await publishAddOnEvent(page, 'thsv.random-clip-player', 'thsv.random-clip-player.media.play', {
    templatePreview: true,
    playbackId: 'template-thsv.random-clip-player',
    title: 'Random Clip Player - exact media template',
    style: { backgroundColor: '#102030', accentColor: '#abcdef', textColor: '#fedcba', fontFamily: 'broadcast' },
  });

  await expect(page.locator('#media-shell')).toBeVisible();
  await expect(page.locator('#media-shell')).toHaveClass(/media-template-preview/u);
  await expect(page.locator('#media-title')).toHaveText('Random Clip Player - exact media template');
  await expect(page.locator('#media-shell')).toHaveCSS('--media-accent', '#abcdef');
  await page.waitForTimeout(1_100);
  await expect(page.locator('#media-shell')).toBeVisible();

  await publishAddOnEvent(page, 'thsv.random-clip-player', 'thsv.random-clip-player.preview.hide', { force: true });
  await expect(page.locator('#media-shell')).toBeHidden();
});

test('Village Jukebox mounts only a bounded official YouTube player with creator styling', async ({ page }) => {
  await installAddOnOverlayTransport(page);
  const hostHtml = await readFile('overlays/browser/addon-host.html', 'utf8');
  await page.route('**/overlay/addons/thsv.village-jukebox', async (route) => await route.fulfill({ contentType: 'text/html', body: hostHtml }));
  await page.route('https://www.youtube.com/embed/**', async (route) => await route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>youtube</title>' }));
  await page.goto('/overlay/addons/thsv.village-jukebox');
  await page.evaluate(() => window.__thsvPublishAddOnEvent?.({
    contractVersion: 'thsv-addon-overlay-v1', kind: 'addon.publish', moduleId: 'thsv.village-jukebox',
    topic: 'thsv.village-jukebox.media.play',
    payload: {
      playbackId: 'jukebox-request-1', embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ', durationMs: 212_000, muted: false, volume: 0.7,
      title: 'A safe test song — Example Artist • requested by Village Viewer',
      style: { backgroundColor: '#101820', accentColor: '#7ff5cc', textColor: '#ffffff', fontFamily: 'broadcast' },
    },
  }));
  await expect(page.locator('#embed-media')).toBeVisible();
  const source = await page.locator('#embed-media').getAttribute('src');
  expect(source).toContain('/embed/dQw4w9WgXcQ');
  expect(source).toContain('autoplay=1');
  expect(source).toContain('enablejsapi=1');
  expect(source).toContain('origin=http%3A%2F%2F127.0.0.1');
  await expect(page.locator('#media')).toBeHidden();
  await expect(page.locator('#media-title')).toHaveText('A safe test song — Example Artist • requested by Village Viewer');
  await expect(page.locator('#media-shell')).toHaveCSS('--media-accent', '#7ff5cc');

  await page.evaluate(() => window.__thsvPublishAddOnEvent?.({
    contractVersion: 'thsv-addon-overlay-v1', kind: 'addon.publish', moduleId: 'thsv.village-jukebox',
    topic: 'thsv.village-jukebox.media.play', payload: { playbackId: 'bad-host', embedUrl: 'https://example.com/embed/dQw4w9WgXcQ' },
  }));
  expect(await page.locator('#embed-media').getAttribute('src')).toBe(source);
});

test('Automated Shoutouts renders a fixed creator signal-boost card', async ({ page }) => {
  await installAddOnOverlayTransport(page);
  const hostHtml = await readFile('overlays/browser/addon-host.html', 'utf8');
  await page.route('**/overlay/shoutouts', async (route) => await route.fulfill({ contentType: 'text/html', body: hostHtml }));
  await page.setViewportSize({ width: 760, height: 460 });
  await page.goto('/overlay/shoutouts');
  await publishAddOnEvent(page, 'thsv.automated-shoutouts', 'thsv.automated-shoutouts.card.show', {
    cardKind: 'shoutout-spotlight', trigger: 'raid', presentation: 'creator', platform: 'twitch', text: 'Go show this creator some love!', creator: { displayName: 'Example Creator With A Long Name', userName: 'example_creator', category: 'Just Chatting', channelUrl: 'https://twitch.tv/example_creator', avatarUrl: '', viewers: 42 }, durationMs: 10_000,
  });
  await expect(page.locator('#shoutout-shell')).toBeVisible();
  await expect(page.locator('#shoutout-name')).toHaveText('Example Creator With A Long Name');
  await expect(page.locator('#shoutout-category')).toHaveText('Just Chatting');
  await expect(page.locator('#shoutout-viewers')).toHaveText('42 RAIDERS');
  const bounds = await page.locator('#shoutout-shell').evaluate((element) => { const box = element.getBoundingClientRect(); return { ratio: Math.round(box.width / box.height * 100) / 100, inside: box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight, bounded: element.scrollWidth <= element.clientWidth + 1 && element.scrollHeight <= element.clientHeight + 1 }; });
  expect(bounds).toEqual({ ratio: 1.78, inside: true, bounded: true });

  await page.setViewportSize({ width: 600, height: 327 });
  await publishAddOnEvent(page, 'thsv.automated-shoutouts', 'thsv.automated-shoutouts.card.show', {
    cardKind: 'shoutout-spotlight', trigger: 'first-chat', presentation: 'creator', platform: 'twitch',
    text: 'Go show chompchompletsplay some love! They stream Just Chatting. https://twitch.tv/chompchompletsplay',
    creator: { displayName: 'chompchompletsplay', userName: 'chompchompletsplay', category: 'Just Chatting', channelUrl: 'https://twitch.tv/chompchompletsplay', avatarUrl: '', viewers: 0 }, durationMs: 10_000,
  });
  await expect(page.locator('#shoutout-name')).toHaveAttribute('data-length', 'long');
  await expect(page.locator('#shoutout-message')).toBeHidden();
  const compactBounds = await page.locator('#shoutout-shell').evaluate((element) => {
    const card = element.querySelector('.shoutout-card')?.getBoundingClientRect();
    const footer = element.querySelector('footer')?.getBoundingClientRect();
    const body = element.querySelector('.shoutout-body')?.getBoundingClientRect();
    return { bounded: element.scrollWidth <= element.clientWidth + 1 && element.scrollHeight <= element.clientHeight + 1, separated: Boolean(card && footer && body && body.bottom <= footer.top && footer.bottom <= card.bottom) };
  });
  expect(compactBounds).toEqual({ bounded: true, separated: true });

  for (const platform of ['youtube', 'kick', 'tiktok']) {
    await publishAddOnEvent(page, 'thsv.automated-shoutouts', 'thsv.automated-shoutouts.card.show', {
      cardKind: 'shoutout-spotlight', trigger: 'first-chat', presentation: 'welcome', platform,
      text: `Welcome Example Viewer from ${platform}!`, creator: { displayName: 'Example Viewer', userName: 'example_viewer', category: '', channelUrl: '', avatarUrl: '', viewers: 0 }, durationMs: 10_000,
    });
    await expect(page.locator('#shoutout-shell')).toHaveAttribute('data-platform', platform);
    await expect(page.locator('#shoutout-shell')).toHaveAttribute('data-presentation', 'welcome');
    await expect(page.locator('#shoutout-message')).toContainText(`Welcome Example Viewer from ${platform}!`);
    await expect(page.locator('#shoutout-reason')).toHaveText('NEW VILLAGER');
  }
});

test('Chat Play renders game rounds and a compact universal winner card', async ({ page }) => {
  await installAddOnOverlayTransport(page);
  const hostHtml = await readFile('overlays/browser/addon-host.html', 'utf8');
  await page.route('**/overlay/addons/thsv.chat-play-pack', async (route) => await route.fulfill({ contentType: 'text/html', body: hostHtml }));
  await page.setViewportSize({ width: 660, height: 380 });
  await page.goto('/overlay/addons/thsv.chat-play-pack');
  await expect(page.locator('#status')).toHaveText('LIVE');
  await publishAddOnEvent(page, 'thsv.chat-play-pack', 'thsv.chat-play-pack.result.show', {
    cardKind: 'chat-play-game', gameKind: 'trivia', gameName: 'Trivia', prompt: 'Which planet is known as the Red Planet?', choices: ['Venus', 'Mars', 'Jupiter', 'Mercury'], instruction: 'Answer with !answer', durationMs: 300_000,
  });
  await expect(page.locator('#chat-play-game-shell')).toBeVisible();
  await expect(page.locator('#chat-play-game-name')).toHaveText('Trivia');
  await expect(page.locator('#chat-play-choices')).toContainText('2. Mars');
  const gameBounds = await page.locator('#chat-play-game-shell').evaluate((element) => { const box = element.getBoundingClientRect(); return { width: Math.round(box.width), height: Math.round(box.height), inside: box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight, bounded: element.scrollWidth <= element.clientWidth + 1 && element.scrollHeight <= element.clientHeight + 1 }; });
  await publishAddOnEvent(page, 'thsv.chat-play-pack', 'thsv.chat-play-pack.result.show', {
    cardKind: 'chat-play-winner', gameName: 'Trivia', points: 50, winner: { displayName: 'Example Villager With A Long Display Name', platform: 'youtube', avatarUrl: '' }, durationMs: 10_000,
  });
  await expect(page.locator('#chat-play-game-shell')).toBeHidden();
  await expect(page.locator('#chat-play-winner-shell')).toBeVisible();
  await expect(page.locator('#chat-play-winner-name')).toHaveText('Example Villager With A Long Display Name');
  await expect(page.locator('#chat-play-winner-points')).toHaveText('+50');
  const winnerBounds = await page.locator('#chat-play-winner-shell').evaluate((element) => { const box = element.getBoundingClientRect(); return { width: Math.round(box.width), height: Math.round(box.height), inside: box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight, bounded: element.scrollWidth <= element.clientWidth + 1 && element.scrollHeight <= element.clientHeight + 1 }; });
  expect(gameBounds).toEqual(winnerBounds);
  expect(winnerBounds).toMatchObject({ inside: true, bounded: true });
});

test('generic add-on host renders viewer-queue contracts', async ({ page }) => {
  await installAddOnOverlayTransport(page);
  const hostHtml = await readFile('overlays/browser/addon-host.html', 'utf8');
  await page.route('**/overlay/addons/thsv.viewer-lobby', async (route) => await route.fulfill({ contentType: 'text/html', body: hostHtml }));

  await page.goto('/overlay/addons/thsv.viewer-lobby');
  await expect(page.locator('#status')).toHaveText('LIVE');
  await publishAddOnEvent(page, 'thsv.viewer-lobby', 'thsv.viewer-lobby.queue.update', {
    status: 'open', count: 2,
    entries: [
      { position: 1, displayName: 'Alex', platform: 'twitch', state: 'selected' },
      { position: 2, displayName: 'Sam', platform: 'youtube', state: 'waiting' },
    ],
  });
  await expect(page.locator('#card')).toBeVisible();
  await expect(page.locator('#card-title')).toHaveText('VIEWER LOBBY • OPEN • 2 VIEWERS');
  await expect(page.locator('#card-text')).toContainText('1. Alex (TWITCH) - selected');
  await expect(page.locator('#card-text')).toContainText('2. Sam (YOUTUBE)');
});
