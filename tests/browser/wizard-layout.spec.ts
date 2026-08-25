import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { STREAMBRIDGE_VERSION } from '../../bridge/version.js';

async function unlock(page: Page): Promise<void> {
  await page.goto('/wizard/');
  await page.getByLabel('Control token').fill('playwright-control-token-with-32-characters');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.locator('#mode')).toContainText('Authenticated');
}

test('fresh installer opens a focused guided setup without exposing advanced tools', async ({ page }) => {
  await page.goto('/wizard/?guided=1');
  await page.getByLabel('Control token').fill('playwright-control-token-with-32-characters');
  await page.getByRole('button', { name: 'Unlock' }).click();

  await expect(page.locator('#workspace')).toHaveAttribute('data-workspace-mode', 'guided');
  await expect(page.locator('#guided-setup-progress')).toHaveText('3 of 6 complete');
  await expect(page.locator('.workspace > nav .nav:visible')).toHaveText([
    'Start here', 'Platforms', 'Streamer.bot', 'Overlays', 'Included features', 'Test & finish', 'Lock',
  ]);
  await expect(page.getByRole('button', { name: 'Add-ons', exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Diagnostics', exact: true })).toBeHidden();

  for (const checkbox of await page.locator('[data-setup-step] input[type="checkbox"]:not(:disabled)').all()) await checkbox.check();
  await expect(page.locator('#guided-setup-progress')).toHaveText('6 of 6 complete');
  await page.getByRole('button', { name: 'Finish setup' }).click();
  await expect(page.locator('#workspace')).toHaveAttribute('data-workspace-mode', 'management');
  await expect(page.getByRole('button', { name: 'Add-ons', exact: true })).toBeVisible();
  await expect(page.locator('[data-view="diagnostics"]')).toHaveText('Diagnostics');
});

test('normal Wizard openings show every management page even after an older guided preference', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('thsv.streambridge.wizard.workspace-mode.v1', 'guided'));
  await unlock(page);

  await expect(page.locator('#workspace')).toHaveAttribute('data-workspace-mode', 'management');
  await expect(page.getByRole('button', { name: 'Timed Actions', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Extensions', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Viewer Foundation', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Community Analytics', exact: true })).toBeVisible();
});

test('diagnostics exposes the seamless operations center and its safety boundaries', async ({ page }) => {
  await page.route('**/wizard/api/operations/drift', async (route) => await route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ issues: [], components: [], repairable: false }),
  }));
  await unlock(page);
  await page.getByRole('button', { name: 'Diagnostics', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Live confidence center' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Run safe rehearsal' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back up and repair' })).toBeDisabled();
  await expect(page.locator('#operational-timeline-list')).toBeVisible();
  await expect(page.locator('#post-stream-report')).toBeVisible();
  await expect(page.locator('#operations-state')).toContainText(/Health (?:ready|needs attention).*installed-state.*redacted events retained/iu);
});

test('tray reminder deep links open and focus the live-acceptance checklist', async ({ page }) => {
  await page.goto('/wizard/?view=diagnostics&focus=live-acceptance');
  await page.getByLabel('Control token').fill('playwright-control-token-with-32-characters');
  await page.getByRole('button', { name: 'Unlock' }).click();

  await expect(page.locator('[data-panel="diagnostics"]')).toBeVisible();
  await expect(page.locator('#live-acceptance-list')).toBeVisible();
  await expect(page.locator('#live-acceptance-list select').first()).toBeFocused({ timeout: 10_000 });
  await expect(page).toHaveURL(/\/wizard\/$/u);
});

test('connection center explains a stopped Streamer.bot session and offers safe recovery', async ({ page }) => {
  await page.route('**/wizard/api/readiness', async (route) => await route.fulfill({ contentType: 'application/json', body: JSON.stringify({
    readiness: {
      status: 'not-ready', ready: false,
      adapters: [
        { name: 'twitch', state: 'connected' },
        { name: 'youtube', state: 'disabled' },
      ],
      outputs: [{ name: 'streamerbot', state: 'reconnecting', lastError: 'connect ECONNREFUSED 127.0.0.1:8081' }],
      modules: [{ moduleId: 'core.chat', status: 'healthy' }, { moduleId: 'core.alerts', status: 'healthy' }],
    },
    launcher: {
      supported: true, configured: true, executable: 'C:\\Tools\\Streamer.bot.exe', executableExists: true,
      websocketPort: 8081, state: 'stopped', message: 'Streamer.bot is configured but its WebSocket server is not currently listening.', optionalApps: {},
    },
    configuration: { state: 'active', restartRequired: false, activatedAt: '2026-08-18T12:00:00.000Z' },
  }) }));
  await unlock(page);

  await expect(page.locator('#connection-center-badge')).toHaveText('Streamer.bot offline');
  await expect(page.locator('#connection-center-summary')).toHaveText('StreamBridge is running, but Streamer.bot delivery is disconnected.');
  await expect(page.locator('#connection-streamerbot-detail')).toContainText('port 8081');
  await expect(page.getByRole('button', { name: 'Start Streamer.bot', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open connection settings' }).click();
  await expect(page.locator('[data-panel="streamerbot"]')).toBeVisible();
});

test('direct scene profiles stay secret and identify native versus fallback tests', async ({ page }) => {
  const profile = { id: '11111111-1111-4111-8111-111111111111', name: 'OBS Portrait', provider: 'obs', url: 'ws://127.0.0.1:4456', enabled: true, hasCredential: true, credentialVerifiedAt: '2026-08-25T12:00:00.000Z', rotationReminderDays: 90, credentialReminderDue: false, latencyWarningMs: 1500 };
  await page.route('**/wizard/api/broadcast-connections/discover', async (route) => { const input = route.request().postDataJSON() as { provider?: string; port?: number }; const custom = input.port !== undefined; await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ mutationFree: true, scope: custom ? 'single-explicit-loopback-port' : 'documented-loopback-defaults-only', candidates: [{ provider: input.provider ?? 'obs', url: custom ? `ws://127.0.0.1:${String(input.port)}` : 'ws://127.0.0.1:4455', listening: true, profileConfigured: false, application: { configured: true, running: true, processId: 44 } }] }) }); });
  await page.route('**/wizard/api/broadcast-connections/acceptance', async (route) => await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ mutationFree: true, results: [{ provider: 'obs', outcome: 'passed', executable: 'obs64.exe', processId: 44, latencyMs: 12, message: 'Direct OBS WebSocket connected.' }, { provider: 'meld', outcome: 'not-installed', message: 'Meld is not selected.' }], history: { receiptCount: 2, comparison: { regressions: [], summary: 'No installed-app acceptance regressions detected.' } } }) }));
  await page.route('**/wizard/api/broadcast-connections/import/validate', async (route) => await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ valid: true, connections: [{ id: profile.id, name: profile.name, provider: profile.provider, url: profile.url, enabled: true, credentialRequired: true, credentialStatus: 'reentry-required' }] }) }));
  await page.route('**/wizard/api/broadcast-connections/import', async (route) => {
    const body = route.request().postDataJSON() as { credentials?: Record<string, string> };
    expect(body.credentials?.[profile.id]).toBe('replacement-secret');
    return await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ supported: true, credentialProtection: 'windows-dpapi-current-user', connections: [profile], runtime: { subscriptionsActive: true, attention: { level: 'ready' }, connections: [{ ...profile, state: 'connected' }], events: [] } }) });
  });
  await page.route('**/wizard/api/broadcast-connections', async (route) => {
    if (route.request().url().endsWith('/export')) return await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ format: 'thsv-broadcast-connections-metadata-v1', exportedAt: '2026-08-25T12:00:00.000Z', connections: [{ ...profile, credentialRequired: true }] }) });
    if (route.request().method() === 'GET') return await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ supported: true, credentialProtection: 'windows-dpapi-current-user', connections: [profile], runtime: { subscriptionsActive: true, connections: [{ ...profile, state: 'connected', reconnectCount: 0, lastLatencyMs: 18 }], events: [{ timestamp: '2026-08-25T12:00:00.000Z', connectionId: profile.id, connectionName: profile.name, provider: 'obs', type: 'connected', latencyMs: 18, sceneCount: 4 }] } }) });
    return await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ supported: true, credentialProtection: 'windows-dpapi-current-user', connections: [profile], runtime: { subscriptionsActive: true, connections: [{ ...profile, state: 'connected' }], events: [] } }) });
  });
  await page.route('**/wizard/api/broadcast-connections/test', async (route) => await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ available: true, transport: 'direct-websocket', message: 'Direct OBS WebSocket connected and returned 4 scene(s).' }) }));
  await page.route('**/wizard/api/broadcast-connections/export', async (route) => await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ format: 'thsv-broadcast-connections-metadata-v1', exportedAt: '2026-08-25T12:00:00.000Z', secretPolicy: 'Credentials are never exported.', connections: [{ id: profile.id, name: profile.name, provider: profile.provider, url: profile.url, enabled: true, credentialRequired: true }] }) }));
  await unlock(page);
  await page.getByRole('button', { name: 'Streamer.bot', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Direct scene connections' })).toBeVisible();
  await expect(page.locator('#direct-provider-guidance')).toContainText('Tools → WebSocket Server Settings');
  await expect(page.locator('#direct-connection-list')).toContainText('credential verified');
  await expect(page.locator('#direct-connection-list')).not.toContainText(/password|token-value/iu);
  await expect(page.locator('#direct-connection-events')).toContainText('18 ms');
  await page.getByRole('button', { name: 'Discover local endpoints' }).click();
  await expect(page.locator('#direct-connection-discovery')).toContainText('exact configured process PID 44');
  await page.getByRole('button', { name: 'Prefill only' }).click();
  await expect(page.locator('#direct-connection-form input[name="url"]')).toHaveValue('ws://127.0.0.1:4455');
  await page.locator('#custom-direct-discovery-form input[name="port"]').fill('4457');
  await page.getByRole('button', { name: 'Check this one port' }).click();
  await expect(page.locator('#direct-connection-discovery')).toContainText('ws://127.0.0.1:4457');
  await page.getByRole('button', { name: 'Run installed-app acceptance' }).click();
  await expect(page.locator('#broadcast-vendor-acceptance')).toContainText('obs64.exe · PID 44');
  await page.getByRole('button', { name: 'Test direct' }).click();
  await expect(page.locator('#direct-connections-state')).toContainText('Native direct connection');
  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.locator('#direct-connection-form input[name="credential"]')).toHaveValue('');
  await expect(page.locator('#direct-connection-form select[name="rotationReminderDays"]')).toHaveValue('90');
  await expect(page.locator('#direct-connection-form input[name="latencyWarningMs"]')).toHaveValue('1500');
  const downloadPromise = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export profile names and URLs' }).click(); const download = await downloadPromise; const exported = await readFile(await download.path(), 'utf8'); expect(exported).toContain('thsv-broadcast-connections-metadata-v1'); expect(exported).not.toContain('token-value'); expect(exported).not.toContain('never-plain');
  await page.locator('#direct-connections-import-file').setInputFiles({ name: 'connections.json', mimeType: 'application/json', buffer: Buffer.from(exported) });
  await expect(page.locator('#direct-connections-import-form')).toBeVisible();
  await page.locator(`[data-import-credential="${profile.id}"]`).fill('replacement-secret');
  await page.locator('#direct-connections-import-form input[name="approvedByCreator"]').check();
  await page.getByRole('button', { name: 'Protect and import profiles' }).click();
  await expect(page.locator('#direct-connections-import-form')).toBeHidden();
});

test('overlay setup assistant gives host-specific sources and remembers checked layers', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await unlock(page);
  await page.getByRole('button', { name: 'Chat Overlay', exact: true }).click();

  await expect(page.locator('#overlay-setup-assistant')).toBeVisible();
  await expect(page.locator('#overlay-source-checklist [data-overlay-source="core-chat"]')).toContainText('680 × 800');
  await expect(page.locator('#overlay-source-checklist [data-overlay-source="core-alerts"]')).toContainText('1920 × 1080');
  await expect(page.locator('#overlay-source-core-chat')).toHaveValue(/\/overlay\/chat$/u);
  await expect(page.locator('#overlay-source-core-alerts')).toHaveValue(/\/overlay\/alerts$/u);
  await expect(page.locator('#overlay-setup-state')).toContainText('Source checklist ready');
  const sourceCount = await page.locator('#overlay-source-checklist [data-overlay-source]').count();
  expect(sourceCount).toBeGreaterThanOrEqual(2);
  await expect(page.locator('#overlay-setup-progress')).toHaveText(`0 of ${String(sourceCount)} checked`);

  await page.getByLabel('Streaming app').selectOption('meld');
  await expect(page.locator('#overlay-host-instructions')).toContainText('add a Browser or Web layer');
  await page.locator('[data-overlay-source="core-chat"] [data-overlay-verified]').check();
  await expect(page.locator('#overlay-setup-progress')).toHaveText(`1 of ${String(sourceCount)} checked`);

  await page.reload();
  await page.getByLabel('Control token').fill('playwright-control-token-with-32-characters');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await page.getByRole('button', { name: 'Chat Overlay', exact: true }).click();
  await expect(page.getByLabel('Streaming app')).toHaveValue('meld');
  await expect(page.locator('[data-overlay-source="core-chat"] [data-overlay-verified]')).toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});

test('pre-stream check requires healthy local evidence and explicit import confirmation', async ({ page }) => {
  let inspectionCalls = 0;
  await page.route('**/wizard/api/preflight', async (route) => await route.fulfill({ contentType: 'application/json', body: JSON.stringify({
    ready: true,
    readiness: {
      status: 'ready', ready: true,
      adapters: [{ name: 'twitch', state: 'connected' }, { name: 'youtube', state: 'disabled' }],
      outputs: [{ name: 'streamerbot', state: 'connected' }],
      modules: [{ moduleId: 'core.chat', status: 'healthy' }, { moduleId: 'core.alerts', status: 'healthy' }],
    },
    launcher: { supported: true, configured: true, executableExists: true, websocketPort: 8081, state: 'ready', optionalApps: {} },
    launcherPreflight: { ready: true, checks: [] }, broadcastAutomation: {}, obsInventory: { configured: false, ready: true, sources: [], discovered: [], reconciliations: [] },
  }) }));
  await page.route('**/wizard/api/readiness', async (route) => await route.fulfill({ contentType: 'application/json', body: JSON.stringify({
    readiness: {
      status: 'ready', ready: true,
      adapters: [{ name: 'twitch', state: 'connected' }, { name: 'youtube', state: 'disabled' }],
      outputs: [{ name: 'streamerbot', state: 'connected' }],
      modules: [{ moduleId: 'core.chat', status: 'healthy' }, { moduleId: 'core.alerts', status: 'healthy' }],
    },
    launcher: { supported: true, configured: true, executableExists: true, websocketPort: 8081, state: 'ready', optionalApps: {} },
  }) }));
  await page.route('**/wizard/api/inspect', async (route) => {
    inspectionCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 100));
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      available: true, inspectedAt: '2026-08-18T12:00:00.000Z', requests: [{ method: 'GetActions' }, { method: 'GetCommands' }], actions: [], commands: [],
    }) });
  });
  await unlock(page);
  await expect.poll(() => inspectionCalls).toBe(1);
  await page.getByRole('button', { name: 'Diagnostics', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Test & finish', exact: true })).toBeVisible();
  await expect(page.locator('#pre-stream-grid .pre-stream-card')).toHaveCount(10);
  await expect(page.locator('#pre-stream-badge')).toHaveText('1 step left');
  await expect(page.locator('#pre-stream-grid')).toContainText('2 read-only inspection requests completed.');

  await page.getByLabel(/I imported the Wizard-generated Streamer\.bot package/u).check();
  await expect(page.locator('#pre-stream-badge')).toHaveText('Ready to stream');
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await expect(page.locator('[data-setup-step="test"] input')).toBeChecked();
});

test('diagnostics explains periodic acceptance, OBS reconciliation, and report regressions', async ({ page }) => {
  let reminders = { notificationsSnoozed: false } as { notificationsSnoozed: boolean; snoozedUntil?: string };
  const obsInventory = { configured: true, ready: false, requiredCount: 1, readyRequiredCount: 0, sources: [{ id: 'alerts-main', label: 'Alerts', scene: 'Old Live', surface: '/overlay/alerts:alerts', minimumCount: 1, required: true, visibleCount: 0, ready: false }], discovered: [], reconciliations: [{ sourceId: 'alerts-main', label: 'Alerts', reason: 'Detected the same StreamBridge surface in scene “Live”.', suggested: { scene: 'Live', surface: '/overlay/alerts:alerts', connectedCount: 1, visibleCount: 1 } }] };
  await page.route('**/wizard/api/readiness', async (route) => await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ readiness: { status: 'ready', ready: true, adapters: [], outputs: [], modules: [] }, launcher: { supported: true, configured: true, executableExists: true, websocketPort: 8081, state: 'ready', optionalApps: {} }, provenance: { version: '4.0.1', installation: 'verified-portable-release' }, obsInventory }) }));
  await page.route('**/wizard/api/obs-source-inventory', async (route) => await route.fulfill({ contentType: 'application/json', body: JSON.stringify(obsInventory) }));
    await page.route('**/wizard/api/live-acceptance', async (route) => await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ checks: [{ id: 'bridge-startup', label: 'Bridge startup and recovery', guidance: 'Confirm recovery.', requiresGenuineEvent: false, recheckAfterDays: 90 }, { id: 'provider-reconnect', label: 'Provider reconnect', guidance: 'Confirm reconnect.', requiresGenuineEvent: false, recheckAfterDays: 90 }], evidence: [], reminders, audit: [{ id: 'audit-1', checkId: 'bridge-startup', kind: 'binding-migrated', recordedAt: '2026-08-21T00:00:00.000Z', changes: ['Legacy acceptance binding migrated to scoped content fingerprints.'] }], confirmations: { 'bridge-startup': { checkId: 'bridge-startup', status: 'due', due: true, dueAt: '2026-08-20T00:00:00.000Z', dueReason: 'Periodic live acceptance is due after 90 days.', note: 'Passed.', confirmedAt: '2026-05-22T00:00:00.000Z' }, 'provider-reconnect': { checkId: 'provider-reconnect', status: 'accepted', dueSoon: true, dueAt: '2026-08-30T00:00:00.000Z', dueSoonReason: 'Periodic live acceptance is due within 14 days.', note: 'Passed.', confirmedAt: '2026-06-01T00:00:00.000Z' } } }) }));
  await page.route('**/wizard/api/live-acceptance/reminders', async (route) => { const body = route.request().postDataJSON() as { action: string; hours?: number }; reminders = body.action === 'resume' ? { notificationsSnoozed: false } : { notificationsSnoozed: true, snoozedUntil: '2026-08-22T00:00:00.000Z' }; await route.fulfill({ contentType: 'application/json', body: JSON.stringify(reminders) }); });
  await page.route('**/wizard/api/pre-stream-report', async (route) => await route.fulfill({ contentType: 'application/json', headers: { 'content-disposition': 'attachment; filename="THSV-StreamBridge-pre-stream-test.json"' }, body: JSON.stringify({ schemaVersion: 1, generatedAt: '2026-08-21T00:00:00.000Z', build: { version: '4.0.2' }, readiness: { ready: true } }) }));
  await page.route('**/wizard/api/pre-stream-report/compare', async (route) => await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ changed: true, regressions: 1, improvements: 0, unchanged: false, summary: '1 regression requires attention.', changes: [{ label: 'Bridge readiness', before: 'true', after: 'false', severity: 'regression' }] }) }));
  await unlock(page);
  await expect(page.locator('#overview-acceptance')).toContainText('2 live checks need attention');
  await expect(page.locator('#overview-acceptance')).toContainText('1 due, 1 due soon');
  await page.getByRole('button', { name: 'Diagnostics', exact: true }).click();
    await expect(page.locator('#live-acceptance-list')).toContainText('Periodic recheck due');
    await expect(page.locator('#live-acceptance-list')).toContainText('Recheck due soon');
  await expect(page.locator('#live-acceptance-audit')).toContainText('binding migrated');
  await page.getByRole('button', { name: 'Snooze 1 hour' }).click();
  await expect(page.locator('#live-acceptance-reminder-state')).toContainText('Snoozed until');
  await page.getByRole('button', { name: 'Resume reminders' }).click();
  await expect(page.locator('#live-acceptance-reminder-state')).toHaveText('Notifications are active.');
  await page.getByText('Expected OBS sources by scene', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Use detected replacement' })).toBeVisible();
  await page.locator('#pre-stream-baseline-file').setInputFiles({ name: 'earlier.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ schemaVersion: 1 })) });
  await expect(page.locator('#pre-stream-comparison')).toContainText('1 regression requires attention.');
  await expect(page.locator('#pre-stream-comparison')).toContainText('Bridge readiness');
  await page.getByLabel('Keep up to five sanitized reports in this browser').check();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export sanitized pre-stream report' }).click();
  await downloadPromise;
  await expect(page.locator('#pre-stream-history')).toContainText('StreamBridge 4.0.2');
  await page.getByRole('button', { name: 'Compare now' }).click();
  await expect(page.locator('#pre-stream-comparison')).toContainText('baseline remains in optional local browser history');
});

test('wizard uses the wide canvas, keeps cards aligned, and confirms local controls', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await unlock(page);
  const shell = await page.locator('.shell').boundingBox();
  const content = await page.locator('.content').boundingBox();
  expect(shell?.width ?? 0).toBeGreaterThan(1840);
  expect(content?.width ?? 0).toBeGreaterThan(1540);

  await page.getByRole('button', { name: 'Extensions', exact: true }).click();
  await expect(page.locator('[data-panel="addons"] .broadcast-app-card')).toHaveCount(3);
  const cardHeights = await page.locator('[data-panel="addons"] .broadcast-app-card').evaluateAll((cards) => cards.map((card) => card.getBoundingClientRect().height));
  expect(new Set(cardHeights.map((height) => Math.round(height))).size).toBe(1);

  await page.getByRole('button', { name: 'Commands', exact: true }).click();
  await page.getByRole('button', { name: 'Expand all' }).click();
  await expect(page.locator('#wizard-feedback')).toContainText('Expand all applied in this page.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('every sidebar destination opens exactly one matching Wizard panel', async ({ page }) => {
  await unlock(page);
  const destinations = [
    ['Overview', 'overview', 'Setup overview'],
    ['Platforms', 'platforms', 'Platforms'],
    ['Streamer.bot', 'streamerbot', 'Streamer.bot connection'],
    ['Commands', 'command-sync', 'Commands'],
    ['Timed Actions', 'timed-actions', 'Timed actions'],
    ['Chat Overlay', 'chat-overlay', 'Chat overlay'],
    ['Alerts', 'alerts', 'Alerts'],
    ['Viewer Foundation', 'viewer-foundation', 'Viewer Foundation'],
    ['Community Analytics', 'community-analytics', 'Community Analytics'],
    ['Extensions', 'addons', 'Extensions'],
    ['Add-ons', 'addon-marketplace', 'Add-ons'],
    ['Blockers', 'blockers', 'Advanced scoped blockers'],
    ['Ownership', 'ownership', 'Ownership registry'],
    ['Release Readiness', 'release-readiness', 'Release readiness'],
    ['Diagnostics', 'diagnostics', 'Test & finish'],
  ] as const;

  for (const [label, panel, heading] of destinations) {
    const navigation = page.locator(`[data-view="${panel}"]`);
    await expect(navigation).toHaveText(label);
    await expect(navigation).toBeEnabled();
    await navigation.click();
    await expect(navigation).toHaveClass(/active/u);
    await expect(page.locator(`[data-panel="${panel}"]`)).toBeVisible();
    await expect(page.locator(`[data-panel="${panel}"] h2`)).toHaveText(heading);
    await expect(page.locator('[data-panel]:not(.hidden)')).toHaveCount(1);
  }
});

test('release readiness combines lifecycle, PR checks, post-release evidence, and protected approvals without publishing', async ({ page }) => {
  await page.route('**/wizard/api/release-readiness', async (route) => await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ version: '4.0.3', checkedAt: '2026-08-20T12:00:00.000Z', githubStatusSource: 'cache', usingCachedGitHubStatus: true, localLifecycle: { currentTag: 'v4.0.3', previousTag: 'v4.0.2', previousChecksumVerified: true, previousProvenanceVerified: true, creatorDataPreserved: true, encryptedRecoveryBundleVerified: true }, pullRequest: { available: false, message: 'Refresh GitHub status to inspect the open release-candidate PR.' }, checks: [], repositoryProtection: { available: false, message: 'Refresh GitHub status to audit repository controls.' }, releaseHandoff: { tag: 'v4.0.3', exactMainReady: false, instructions: 'Merge and refresh.' }, postReleaseSmoke: { available: false, message: 'Post-release verification begins automatically after publication.' }, summary: { lifecycleReady: true, checksGreen: false, postReleaseVerified: false, repositoryProtectionsReady: false, readyForCreatorReview: false }, remainingCreatorApprovals: ['Review and merge the pull request.', 'Approve the protected streambridge-tag environment deployment.', 'Approve the protected streambridge-release environment deployment.'] }) }));
  await page.route('**/wizard/api/release-readiness/refresh', async (route) => await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ version: '4.0.3', checkedAt: '2026-08-21T12:00:00.000Z', githubStatusSource: 'live', usingCachedGitHubStatus: false, localLifecycle: { currentTag: 'v4.0.3', previousTag: 'v4.0.2', previousChecksumVerified: true, previousProvenanceVerified: true, creatorDataPreserved: true, encryptedRecoveryBundleVerified: true }, pullRequest: { available: true, number: 9, title: 'Prepare StreamBridge 4.0.3', url: 'https://github.com/surakage/THSV-StreamBridge/pull/9', branch: 'codex/release-4.0.3-seamless', sha: 'a'.repeat(40) }, checks: [{ name: 'windows', status: 'completed', conclusion: 'success' }], repositoryProtection: { available: true, mainProtected: true, immutableReleases: true, immutableEnforcedByOwner: false, activeRulesetCount: 1, rulesetsUrl: 'https://github.com/surakage/THSV-StreamBridge/settings/rules', immutableReleasesUrl: 'https://github.com/surakage/THSV-StreamBridge/settings/releases' }, releaseHandoff: { tag: 'v4.0.3', candidateSha: 'a'.repeat(40), expectedMainSha: 'a'.repeat(40), exactMainReady: true, instructions: 'Copy exact inputs.', tagWorkflowUrl: 'https://github.com/surakage/THSV-StreamBridge/actions/workflows/prepare-release-tag.yml', commitUrl: `https://github.com/surakage/THSV-StreamBridge/commit/${'a'.repeat(40)}` }, postReleaseSmoke: { available: true, tag: 'v4.0.3', previousTag: 'v4.0.2', conclusion: 'success', reinstall: '4.0.3', rollbackProtectionVerified: true, creatorDataPreserved: true, url: 'https://github.com/surakage/THSV-StreamBridge/actions/runs/91', evidenceUrl: 'https://github.com/surakage/THSV-StreamBridge/actions/runs/91#artifacts' }, summary: { lifecycleReady: true, checksGreen: true, postReleaseVerified: true, repositoryProtectionsReady: true, readyForCreatorReview: true }, remainingCreatorApprovals: ['Review and merge the pull request.', 'Approve the protected streambridge-tag environment deployment.', 'Approve the protected streambridge-release environment deployment.'] }) }));
  await unlock(page);
  await page.getByRole('button', { name: 'Release Readiness', exact: true }).click();
  await expect(page.locator('#release-readiness-summary')).toContainText('Needs review');
  await expect(page.locator('#release-readiness-state')).toContainText('last successful GitHub status');
  await page.getByRole('button', { name: 'Refresh GitHub status' }).click();
  await expect(page.locator('#release-readiness-checks')).toContainText('PR #9');
  await expect(page.locator('#release-readiness-summary')).toContainText('Ready for creator');
  await expect(page.locator('#release-readiness-summary')).toContainText('Verified');
  await expect(page.locator('#release-readiness-summary')).toContainText('Repository protection');
  await expect(page.locator('#release-readiness-handoff')).toContainText('Exact main confirmed');
  await expect(page.locator('#release-readiness-handoff')).toContainText('a'.repeat(40));
  await expect(page.locator('#release-readiness-protection')).toContainText('Immutable releases: true');
  await expect(page.locator('#release-readiness-lifecycle')).toContainText('Encrypted recovery restored: true');
  await expect(page.locator('#release-readiness-post-release')).toContainText('Rollback protection: true');
  await expect(page.getByRole('link', { name: 'Download retained evidence' })).toHaveAttribute('href', /#artifacts$/u);
  await expect(page.locator('#release-readiness-state')).toContainText('Live GitHub status checked');
  await expect(page.locator('#release-readiness-approvals')).toContainText('protected streambridge-tag');
  await expect(page.locator('#release-readiness-approvals')).toContainText('protected streambridge-release');
});

test('Viewer Foundation is a dedicated required Bridge integration', async ({ page }) => {
  await unlock(page);
  await page.getByRole('button', { name: 'Viewer Foundation', exact: true }).click();
  await expect(page.locator('#viewer-foundation-state')).toContainText('installed with StreamBridge');
  await expect(page.locator('[data-panel="viewer-foundation"]')).toContainText('Always installed');
  await expect(page.locator('[data-panel="viewer-foundation"]')).toContainText('Foundation settings');
  await expect(page.locator('[data-panel="viewer-foundation"]')).toContainText('Viewer accounts, points & privacy');
  await expect(page.locator('[data-panel="viewer-foundation"] [data-remove-addon]')).toHaveCount(0);
  await page.locator('[data-panel="viewer-foundation"]').getByLabel('Points name').fill('Village Points');
  await page.getByRole('button', { name: 'Save foundation settings' }).click();
  await expect(page.locator('#wizard-feedback')).toContainText('Viewer Foundation settings saved');
});

test('wizard remains fluid on laptops and bounded on ultrawide monitors', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await unlock(page);
  const laptopShell = await page.locator('.shell').boundingBox();
  const laptopContent = await page.locator('.content').boundingBox();
  expect(laptopShell?.width ?? 0).toBeGreaterThan(1300);
  expect(laptopContent?.width ?? 0).toBeGreaterThan(1050);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  await page.setViewportSize({ width: 3440, height: 1440 });
  const ultrawideShell = await page.locator('.shell').boundingBox();
  expect(ultrawideShell?.width ?? 0).toBeGreaterThan(2100);
  expect(ultrawideShell?.width ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(2201);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('extension details resize only their own card and keep complete names visible', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await unlock(page);
  await page.getByRole('button', { name: 'Extensions', exact: true }).click();

  const cards = page.locator('.main-feature-card');
  await expect(cards).toHaveCount(7);
  const closedHeights = await cards.evaluateAll((items) => items.map((item) => Math.round(item.getBoundingClientRect().height)));
  await cards.first().locator('summary').click();
  const openedHeights = await cards.evaluateAll((items) => items.map((item) => Math.round(item.getBoundingClientRect().height)));
  expect(openedHeights[0]).toBeGreaterThan((closedHeights[0] ?? 0) + 50);
  expect(openedHeights.slice(1)).toEqual(closedHeights.slice(1));

  const clippedHeadings = await cards.locator('h4').evaluateAll((headings) => headings.filter((heading) => heading.scrollWidth > heading.clientWidth + 1).map((heading) => heading.textContent.trim()));
  expect(clippedHeadings).toEqual([]);
  const clippedComponents = await cards.first().locator('.main-feature-component-list button').evaluateAll((buttons) => buttons.filter((button) => button.scrollWidth > button.clientWidth + 1).map((button) => button.textContent.trim()));
  expect(clippedComponents).toEqual([]);
});

test('standard tablet and mobile widths keep every revised page inside the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await unlock(page);
  for (const destination of ['Overview', 'Streamer.bot', 'Commands']) {
    await page.getByRole('button', { name: destination, exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Chat Overlay', exact: true }).click();
  await expect(page.locator('#overlay-source-checklist [data-overlay-source="core-chat"]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);

  await page.getByRole('button', { name: 'Alerts', exact: true }).click();
  await page.getByText('Donation provider setup', { exact: true }).click();
  const donationBounds = await page.locator('#kofi-integration-content').evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { left: box.left, right: box.right, width: box.width, viewport: document.documentElement.clientWidth };
  });
  expect(donationBounds.left).toBeGreaterThanOrEqual(-1);
  expect(donationBounds.right).toBeLessThanOrEqual(donationBounds.viewport + 1);
  expect(donationBounds.width).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Extensions', exact: true }).click();
  const wrappedNavigation = await page.locator('.workspace > nav .nav').evaluateAll((buttons) => buttons.filter((button) => button.scrollHeight > button.clientHeight + 1 || button.scrollWidth > button.clientWidth + 1).map((button) => button.textContent.trim()));
  expect(wrappedNavigation).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});

test('wizard does not bleed horizontally at a narrow dock-like width', async ({ page }) => {
  await page.setViewportSize({ width: 520, height: 900 });
  await unlock(page);
  await page.getByRole('button', { name: 'Add-ons', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const clipped = await page.locator('button:visible').evaluateAll((buttons) => buttons.filter((button) => {
    const box = button.getBoundingClientRect();
    return box.left < -1 || box.right > document.documentElement.clientWidth + 1;
  }).map((button) => button.textContent.trim()));
  expect(clipped).toEqual([]);
});

test('fresh setup creates one selective Streamer.bot import and exposes its trigger guide', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await unlock(page);
  await page.getByRole('button', { name: 'Streamer.bot', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'One Streamer.bot import' })).toBeVisible();
  await expect(page.locator('[data-import-kind="core"] input')).toHaveCount(13);
  await expect(page.locator('[data-import-kind="core"] input:checked')).toHaveCount(13);
  await expect(page.locator('[data-import-kind="addon"] input')).toHaveCount(7);
  expect(await page.locator('[data-import-kind="addon"] input:disabled').count()).toBeGreaterThan(0);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Create & download one import' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`THSV-StreamBridge-Universal-Setup-${STREAMBRIDGE_VERSION}.sb`);
  await expect(page.locator('#universal-import-state')).toContainText('Import this one file in Streamer.bot');
  await page.getByRole('button', { name: 'Review recommended triggers' }).click();
  await expect(page.locator('#universal-trigger-guide')).toHaveAttribute('open', '');
  await expect(page.locator('#universal-trigger-list')).toContainText('Native Platform Intake');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
