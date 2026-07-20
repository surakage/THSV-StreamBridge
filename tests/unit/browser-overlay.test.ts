import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import type { NormalizedEvent } from '../../schemas/event.js';
import type { BrowserOverlayConfig } from '../../schemas/config.js';
import { projectBrowserOverlayEvent, projectBrowserOverlayEvents } from '../../bridge/core/browser-overlay.js';
import { BrowserOverlayHub } from '../../bridge/services/browser-overlay-hub.js';
import { fixture, silentLogger, testConfig } from '../helpers.js';

describe('Browser Overlay Hub contract', () => {
  it('projects public chat and preserves hostile markup as inert text data', async () => {
    const source = await fixture();
    const event: NormalizedEvent = { ...source, payload: { message: '<img src=x onerror=alert(1)> 🦥' }, metadata: { ...source.metadata, bridgeSequence: 7 } };
    expect(projectBrowserOverlayEvent(event)).toMatchObject({
      kind: 'chat.add',
      payload: { eventId: event.eventId, sequence: 7, message: '<img src=x onerror=alert(1)> 🦥' },
    });
  });

  it('projects reviewed presentation metadata and subscription lifecycle fields', async () => {
    const source = await fixture('youtube-super-chat.json');
    if (source.user === undefined) throw new Error('Fixture requires an actor');
    const event: NormalizedEvent = {
      ...source,
      eventType: 'channel.membership',
      user: { ...source.user, avatarUrl: 'https://example.com/avatar.png', nameColor: '#72efc2', badges: [{ id: 'member', label: 'Member' }] },
      payload: { tier: 'Village', subscriptionKind: 'upgrade', months: 6, streakMonths: 4, gifted: true, gifterName: 'Kind Gifter' },
      metadata: { ...source.metadata, bridgeSequence: 12 },
    };
    expect(projectBrowserOverlayEvent(event)).toMatchObject({
      kind: 'alert.show',
      payload: {
        presentation: { avatarUrl: 'https://example.com/avatar.png', nameColor: '#72efc2', badges: [{ id: 'member', label: 'Member' }] },
        tier: 'Village',
        subscription: { kind: 'upgrade', months: 6, streakMonths: 4, gifted: true, gifterName: 'Kind Gifter' },
      },
    });
  });

  it('correlates a message-removal moderation action by target event ID', async () => {
    const source = await fixture();
    const event: NormalizedEvent = {
      ...source,
      eventId: 'moderation-delete-001',
      eventType: 'moderation.action',
      source: { ...source.source, eventId: 'moderation-source-001' },
      payload: { action: 'delete-message', targetEventId: 'sim-twitch-chat-001', reason: 'removed by moderator' },
      metadata: { ...source.metadata, bridgeSequence: 8 },
    };
    expect(projectBrowserOverlayEvent(event)).toMatchObject({
      kind: 'chat.remove',
      payload: { eventId: 'moderation-delete-001', targetEventId: 'sim-twitch-chat-001', reason: 'removed by moderator' },
    });
  });

  it('does not broadcast private, operator, command, or unrelated events', async () => {
    const source = await fixture();
    for (const eventType of ['chat.private-message', 'operator.message', 'command.received', 'system.timed']) {
      expect(projectBrowserOverlayEvent({ ...source, eventType, metadata: { ...source.metadata, bridgeSequence: 9 } })).toBeUndefined();
    }
  });

  it('filters configured ignored chat names before browser publication', async () => {
    const config = await testConfig();
    config.browserOverlay.chat.ignoredNames = ['EXAMPLE_VIEWER'];
    const hub = new BrowserOverlayHub(silentLogger, config.browserOverlay);
    hub.publish(await fixture('twitch-chat.json'));
    expect(hub.status()).toMatchObject({ published: 0 });
    hub.stop();
  });

  it('accepts lifecycle reports only for playback IDs published by the owning add-on', async () => {
    const config = await testConfig();
    const hub = new BrowserOverlayHub(silentLogger, config.browserOverlay);
    const observed: unknown[] = [];
    hub.subscribeAddOnLifecycle('sample.clips', (event) => observed.push(event));
    const receive = (hub as unknown as { receiveClientMessage(raw: string): void }).receiveClientMessage.bind(hub);
    receive(JSON.stringify({ contractVersion: 'thsv-addon-overlay-v1', kind: 'addon.lifecycle', moduleId: 'sample.clips', playbackId: 'unknown', phase: 'ended' }));
    expect(observed).toEqual([]);
    hub.publishAddOn('sample.clips', 'sample.clips.media.play', { playbackId: 'clip-17', url: 'https://clips.example/video.mp4' });
    receive(JSON.stringify({ contractVersion: 'thsv-addon-overlay-v1', kind: 'addon.lifecycle', moduleId: 'sample.clips', playbackId: 'clip-17', phase: 'started', currentTime: 0 }));
    receive(JSON.stringify({ contractVersion: 'thsv-addon-overlay-v1', kind: 'addon.lifecycle', moduleId: 'sample.clips', playbackId: 'clip-17', phase: 'ended', currentTime: 8, duration: 8 }));
    receive(JSON.stringify({ contractVersion: 'thsv-addon-overlay-v1', kind: 'addon.lifecycle', moduleId: 'sample.clips', playbackId: 'clip-17', phase: 'ended' }));
    expect(observed).toMatchObject([{ playbackId: 'clip-17', phase: 'started' }, { playbackId: 'clip-17', phase: 'ended' }]);
    expect(hub.status()).toMatchObject({ addOnLifecycleReports: 2, lifecycleSubscribers: 1 });
    hub.stop();
  });

  it('adds enabled platform activity to chat and truncates it within the Unicode-safe platform cap', async () => {
    const source = await fixture('youtube-super-chat.json');
    const config = await testConfig();
    config.browserOverlay.chat.events.characterLimits.youtube = 40;
    const event: NormalizedEvent = { ...source, payload: { ...source.payload, message: `A very long supporter message with emoji 🦥 ${'x'.repeat(100)}` }, metadata: { ...source.metadata, bridgeSequence: 22 } };
    const projected = projectBrowserOverlayEvents(event, config.browserOverlay);
    expect(projected.map((entry) => entry.kind)).toEqual(['alert.show', 'chat.event']);
    const activity = projected.find((entry) => entry.kind === 'chat.event');
    if (activity?.kind !== 'chat.event') throw new Error('Expected a chat activity event.');
    expect(Array.from(activity.payload.message).length).toBeLessThanOrEqual(40);
    expect(activity.payload.message.endsWith('…')).toBe(true);
    expect(activity.payload).toMatchObject({ platform: 'youtube', category: 'super-chat', label: 'SUPER CHAT' });

    config.browserOverlay.chat.events.platformEvents.youtube['super-chat'].enabled = false;
    expect(projectBrowserOverlayEvents(event, config.browserOverlay).map((entry) => entry.kind)).toEqual(['alert.show']);
    config.browserOverlay.chat.events.platformEvents.youtube['super-chat'].enabled = true;
    config.browserOverlay.chat.events.platforms.youtube = false;
    expect(projectBrowserOverlayEvents(event, config.browserOverlay).map((entry) => entry.kind)).toEqual(['alert.show']);
  });

  it('projects an enabled reward redemption as a chat-only activity message', async () => {
    const source = await fixture('twitch-chat.json');
    const config = await testConfig();
    const event: NormalizedEvent = {
      ...source,
      eventType: 'reward.redemption',
      source: { ...source.source, eventId: 'reward-source-1' },
      payload: { rewardId: 'reward-1', rewardTitle: 'Hydrate', rewardCost: 100, requiresUserInput: true, input: 'Please drink some water', redemptionId: 'redemption-1' },
      metadata: { ...source.metadata, bridgeSequence: 23 },
    };
    expect(projectBrowserOverlayEvents(event, config.browserOverlay)).toMatchObject([{ kind: 'chat.event', payload: { category: 'reward-redemption', message: 'Example Viewer redeemed Hydrate · Please drink some water' } }]);
  });

  it('uses text-only DOM sinks in the reviewed browser source', async () => {
    const source = await readFile('overlays/browser/app.js', 'utf8');
    const worker = await readFile('overlays/browser/worker.js', 'utf8');
    expect(source).toContain('textContent');
    expect(source).toContain("new SharedWorker('/overlay/worker-1.3.1.js', 'thsv-browser-overlay-1.3.1'");
    expect(source).toContain("oldest.classList.add('message-expiring')");
    expect(source).toContain('new AlertPresentationController({');
    expect(source).toContain('alertController.enqueue(alert)');
    expect(source).toContain("console.warn('Skipped an alert that could not be rendered.'");
    expect(source).toContain("avatar.addEventListener('error', () => avatar.remove()");
    expect(source).toContain("buildAvatar(message.user, message.presentation, message.platform, 'chat-avatar')");
    expect(source).toContain("buildAvatar(alert.actor, alert.presentation || {}, alert.platform, 'alert-avatar')");
    expect(source).toContain("event.kind === 'chat.event'");
    expect(source).toContain('function addEventMessage(activity)');
    expect(source).toContain("element('img', 'badge-icon')");
    expect(source).toContain('brandLabel.textContent = clientConfig.brandLabel');
    expect(source).toContain('connectDirectly');
    expect(worker.match(/new WebSocket/gu)).toHaveLength(1);
    expect(worker).toContain('for (const port of ports)');
    for (const reviewedSource of [source, worker]) {
      expect(reviewedSource).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write/u);
      expect(reviewedSource).not.toContain('eval(');
    }
  });

  it('applies plain-text alert profiles and suppresses disabled alert types', async () => {
    const source = await fixture('youtube-super-chat.json');
    const config: BrowserOverlayConfig = {
      ...(await testConfig()).browserOverlay, brandLabel: '',
      alerts: { profiles: { youtube: { 'super-chat': { enabled: true, priority: 'critical', durationMs: 9_000, titleTemplate: '{actor} supported with {amount} {currency}', detailTemplate: '{message}', sound: { mode: 'chime', volume: 0.25 }, card: { backgroundColor: '#171120', fontFamily: 'system' }, aggregation: { mode: 'none', windowMs: 5_000 } } } } },
    };
    expect(projectBrowserOverlayEvent({ ...source, metadata: { ...source.metadata, bridgeSequence: 13 } }, config)).toMatchObject({
      kind: 'alert.show', payload: { priority: 'critical', display: { title: 'example_member supported with 5.00 USD', detail: 'Simulated support', durationMs: 9_000, sound: { mode: 'chime', volume: 0.25 } } },
    });
    const profile = config.alerts.profiles.youtube?.['super-chat'];
    if (profile === undefined) throw new Error('Test profile is required');
    const disabled: BrowserOverlayConfig = { ...config, alerts: { profiles: { youtube: { 'super-chat': { ...profile, enabled: false } } } } };
    expect(projectBrowserOverlayEvent({ ...source, metadata: { ...source.metadata, bridgeSequence: 14 } }, disabled)).toMatchObject({ kind: 'chat.event' });
    // A profile configured for a different platform must never affect this platform's rendering:
    // the youtube event still falls back to its own automatic defaults, not the twitch profile.
    const otherPlatformOnly: BrowserOverlayConfig = { ...config, alerts: { profiles: { twitch: { follow: { ...profile, enabled: false } } } } };
    expect(projectBrowserOverlayEvent({ ...source, metadata: { ...source.metadata, bridgeSequence: 15 } }, otherPlatformOnly)).toMatchObject({ kind: 'alert.show' });
  });

  it('keeps the standalone chat canvas transparent and bottom-anchored', async () => {
    const source = await readFile('overlays/browser/app.js', 'utf8');
    const styles = await readFile('overlays/browser/styles.css', 'utf8');
    expect(source).toContain("requestedLayout === 'compact' || requestedLayout === 'regular'");
    expect(source).toContain("clientConfig.chat.showProfilePictures");
    expect(source).toContain("clientConfig.chat.showPlatformLabels");
    expect(source).toContain("clientConfig.chat.showBadges");
    expect(source).not.toContain('verticalScale');
    expect(styles).not.toMatch(/body\[data-mode="chat"\][^{]*\{[^}]*scaleY/u);
    expect(styles).toContain('width: min(540px, calc(100vw - 32px))');
    expect(styles).toContain('background: var(--message-platform-bg, var(--chat-message-bg));');
    expect(source).toContain("chatConfig.messageColorMode === 'platform'");
    expect(styles).toContain('font-size: var(--chat-font-size)');
    expect(styles).toContain('font-family: var(--chat-font-family)');
    expect(styles).toContain('body[data-mode="chat"][data-layout="compact"] .overlay { display: flex; flex-direction: column; justify-content: flex-end; }');
    expect(styles).toContain('body[data-mode="chat"][data-layout="compact"] .chat-shell { position: relative; inset: auto;');
    expect(styles).toContain('background: transparent;');
    expect(styles).toContain('body[data-mode="chat"] .chat-shell header { display: none; }');
    expect(styles).toContain('body[data-mode="chat"] .message.message-expiring');
    expect(styles).toContain('body[data-dock="true"] .chat-shell');
    expect(styles).toContain('body[data-mode="chat"] .connection-status[data-state="reconnecting"]');
    expect(styles).toContain('@keyframes chat-expire');
  });

  it('keeps standalone alerts crisp and responsive without scaling', async () => {
    const styles = await readFile('overlays/browser/styles.css', 'utf8');
    expect(styles).toContain('body[data-mode="alerts"] .alerts { inset: 0; display: flex;');
    expect(styles).toContain('body[data-mode="alerts"] .alert { width: min(800px, 100%)');
    expect(styles).toContain('background-color: var(--alert-card-bg, #171120);');
    expect(styles).toContain('.alert-identity { display: grid; grid-template-columns: 76px minmax(0, 1fr)');
    expect(styles).toContain('.alert-copy { min-width: 0; text-align: left; }');
    expect(styles).toContain('font-size: clamp(22px, 2.1vw, 38px)');
    expect(styles).toContain('overflow-wrap: anywhere');
    expect(styles).toContain('body[data-mode="alerts"] .connection-status[data-state="reconnecting"]');
  });

});
