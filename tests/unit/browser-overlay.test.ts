import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
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

  it('removes a redundant moderator presentation badge before browser delivery', async () => {
    const source = await fixture();
    if (source.user === undefined) throw new Error('Fixture requires an actor');
    const event: NormalizedEvent = {
      ...source,
      user: {
        ...source.user,
        roles: ['moderator'],
        badges: [
          { id: 'moderator', label: 'Moderator' },
          { id: 'subscriber', label: 'Subscriber' },
        ],
      },
      metadata: { ...source.metadata, bridgeSequence: 8 },
    };
    expect(projectBrowserOverlayEvent(event)).toMatchObject({
      kind: 'chat.add',
      payload: { presentation: { badges: [{ id: 'subscriber', label: 'Subscriber' }] } },
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

  it('clears every retained surface and presentation after the final real platform goes offline', async () => {
    vi.useFakeTimers();
    try {
      const config = await testConfig();
      const hub = new BrowserOverlayHub(silentLogger, config.browserOverlay);
      const source = await fixture();
      const lifecycle = (eventType: 'stream.online' | 'stream.offline', platform: string, suffix: string): NormalizedEvent => ({
        ...source,
        eventId: `${eventType}-${suffix}`,
        eventType,
        platform,
        user: undefined,
        source: { ...source.source, eventId: `${eventType}-source-${suffix}` },
        payload: {},
        metadata: { ...source.metadata, simulated: false },
      });
      const broadcast = vi.spyOn(hub as unknown as { broadcast(message: string): void }, 'broadcast');

      hub.publish(lifecycle('stream.online', 'twitch', 'twitch'));
      hub.publish(lifecycle('stream.online', 'youtube', 'youtube'));
      await hub.publishAddOn('sample.labels', 'sample.labels.labels.update', { labels: { follower: { value: 'Old Viewer' } } });
      await hub.publishAddOn('sample.clip', 'sample.clip.media.play', { playbackId: 'offline-reset-clip', url: 'https://clips.example/video.mp4', durationMs: 30_000 });
      await hub.publishAddOn('sample.card', 'sample.card.card.show', { title: 'Active card', durationMs: 30_000 });
      await hub.publishAddOn('sample.queued', 'sample.queued.card.show', { title: 'Queued card', durationMs: 30_000 });
      broadcast.mockClear();

      hub.publish(lifecycle('stream.offline', 'twitch', 'twitch'));
      expect(broadcast.mock.calls.map(([message]) => JSON.parse(message) as { kind?: string }).filter((message) => message.kind === 'overlay.reset')).toHaveLength(0);
      expect(hub.status()).toMatchObject({ livePlatforms: ['youtube'], retainedLabelSnapshots: 1 });

      hub.publish(lifecycle('stream.offline', 'youtube', 'youtube'));
      expect(broadcast.mock.calls.map(([message]) => JSON.parse(message) as { kind?: string; reason?: string })).toContainEqual(expect.objectContaining({ kind: 'overlay.reset', reason: 'stream-offline' }));
      hub.publish(lifecycle('stream.offline', 'youtube', 'youtube-duplicate'));
      expect(broadcast.mock.calls.map(([message]) => JSON.parse(message) as { kind?: string }).filter((message) => message.kind === 'overlay.reset')).toHaveLength(1);
      expect(hub.status()).toMatchObject({ livePlatforms: [], retainedLabelSnapshots: 0, presentationQueue: { active: null, queued: [] } });
      expect((hub as unknown as { activeMediaMessages: Map<string, unknown> }).activeMediaMessages.size).toBe(0);
      hub.stop();
    } finally { vi.useRealTimers(); }
  });

  it('recovers and ends OBS-verified sessions once even when platform offline events are missing', async () => {
    const config = await testConfig();
    const hub = new BrowserOverlayHub(silentLogger, config.browserOverlay);
    const broadcast = vi.spyOn(hub as unknown as { broadcast(message: string): void }, 'broadcast');
    hub.recoverLiveSession(['twitch', 'youtube', 'kick', 'tiktok']);
    expect(hub.status()).toMatchObject({ livePlatforms: ['twitch', 'youtube', 'kick', 'tiktok'] });
    hub.endRecoveredLiveSession(); hub.endRecoveredLiveSession();
    expect(hub.status()).toMatchObject({ livePlatforms: [] });
    expect(broadcast.mock.calls.map(([message]) => JSON.parse(message) as { kind?: string }).filter((message) => message.kind === 'overlay.reset')).toHaveLength(1);
    hub.stop();
  });

  it('accepts queued add-on presentations immediately while serializing their dispatch with a configured gap', async () => {
    vi.useFakeTimers();
    try {
      const config = await testConfig(); config.browserOverlay.overlayGapMs = 1_000;
      const hub = new BrowserOverlayHub(silentLogger, config.browserOverlay);
      await hub.publishAddOn('sample.spotlight', 'sample.spotlight.card.show', { title: 'First', durationMs: 1_000 }, { lane: 'foreground' });
      let secondAccepted = false;
      const second = hub.publishAddOn('sample.shoutout', 'sample.shoutout.card.show', { title: 'Second', durationMs: 1_000 }, { lane: 'foreground' }).then(() => { secondAccepted = true; });
      let hydrationAccepted = false;
      const hydration = hub.publishAddOn('sample.hydration', 'sample.hydration.hydration.update', { totalOunces: 8, durationMs: 1_000 }, { lane: 'foreground' }).then(() => { hydrationAccepted = true; });
      await Promise.all([second, hydration]);
      expect(secondAccepted).toBe(true);
      expect(hydrationAccepted).toBe(true);
      expect(hub.status()).toMatchObject({ addOnPublished: 1, presentationQueue: { active: { owner: 'sample.spotlight' }, queued: [{ owner: 'sample.shoutout' }, { owner: 'sample.hydration' }], gapMs: 1_000 } });
      await vi.advanceTimersByTimeAsync(1_999);
      expect(hub.status()).toMatchObject({ addOnPublished: 1, presentationQueue: { active: null, queued: [{ owner: 'sample.shoutout' }, { owner: 'sample.hydration' }] } });
      await vi.advanceTimersByTimeAsync(1);
      expect(hub.status()).toMatchObject({ addOnPublished: 2, presentationQueue: { active: { owner: 'sample.shoutout' }, queued: [{ owner: 'sample.hydration' }] } });
      await vi.advanceTimersByTimeAsync(2_000);
      expect(hub.status()).toMatchObject({ addOnPublished: 3, presentationQueue: { active: { owner: 'sample.hydration' }, queued: [] } });
      hub.stop();
    } finally { vi.useRealTimers(); }
  });

  it('uses explicit presentation lanes instead of topic-name guesses', async () => {
    vi.useFakeTimers();
    try {
      const config = await testConfig(); const hub = new BrowserOverlayHub(silentLogger, config.browserOverlay);
      await hub.publishAddOn('sample.persistent', 'sample.persistent.card.show', { title: 'Persistent state', durationMs: 30_000 }, { lane: 'persistent' });
      expect(hub.status()).toMatchObject({ addOnPublished: 1, presentationQueue: { active: null, queued: [] } });

      await hub.publishAddOn('sample.foreground', 'sample.foreground.status.update', { title: 'Foreground notice', durationMs: 30_000 }, { lane: 'foreground' });
      expect(hub.status()).toMatchObject({ addOnPublished: 2, presentationQueue: { active: { owner: 'sample.foreground', topic: 'sample.foreground.status.update', lane: 'foreground', durationMs: 30_000 }, queued: [] } });
      hub.stop();
    } finally { vi.useRealTimers(); }
  });

  it('keeps accessibility captions and template previews outside the shared presentation queue', async () => {
    const config = await testConfig(); const hub = new BrowserOverlayHub(silentLogger, config.browserOverlay);
    await hub.publishAddOn('thsv.accessibility-captions', 'thsv.accessibility-captions.card.show', { title: 'Live caption', durationMs: 5_000 });
    await hub.publishAddOn('sample.preview', 'sample.preview.card.show', { title: 'Exact template', durationMs: 60_000, templatePreview: true });
    expect(hub.status()).toMatchObject({ addOnPublished: 2, presentationQueue: { active: null, queued: [] } });
    hub.stop();
  });

  it('starts clip playback independently while a card presentation is active', async () => {
    vi.useFakeTimers();
    try {
      const config = await testConfig(); const hub = new BrowserOverlayHub(silentLogger, config.browserOverlay);
      await hub.publishAddOn('sample.spotlight', 'sample.spotlight.card.show', { title: 'Viewer', durationMs: 10_000 });
      await hub.publishAddOn('sample.clips', 'sample.clips.media.play', { playbackId: 'clip-independent', url: 'https://clips.example/video.mp4', durationMs: 30_000 });
      expect(hub.status()).toMatchObject({ addOnPublished: 2, presentationQueue: { active: { owner: 'sample.spotlight' }, queued: [] } });
      hub.stop();
    } finally { vi.useRealTimers(); }
  });

  it('keeps ad and launch countdown timers independent from transient presentations', async () => {
    vi.useFakeTimers();
    try {
      const config = await testConfig(); const hub = new BrowserOverlayHub(silentLogger, config.browserOverlay);
      await hub.publishAddOn('sample.spotlight', 'sample.spotlight.card.show', { title: 'Viewer', durationMs: 10_000 });
      await hub.publishAddOn('thsv.ad-break-companion', 'thsv.ad-break-companion.timer.update', { state: 'active', remainingSeconds: 90 });
      await hub.publishAddOn('thsv.starting-soon-countdown', 'thsv.starting-soon-countdown.timer.update', { state: 'running', remainingSeconds: 240 });
      expect(hub.status()).toMatchObject({ addOnPublished: 3, presentationQueue: { active: { owner: 'sample.spotlight' }, queued: [] } });
      hub.stop();
    } finally { vi.useRealTimers(); }
  });

  it('enforces the versioned main-feature presentation lanes over built-in publisher requests', async () => {
    vi.useFakeTimers();
    try {
      const config = await testConfig(); const hub = new BrowserOverlayHub(silentLogger, config.browserOverlay);
      await hub.publishAddOn('thsv.first-five', 'thsv.first-five.card.show', { title: 'First Five', durationMs: 10_000 }, { lane: 'independent' });
      await hub.publishAddOn('thsv.random-clip-player', 'thsv.random-clip-player.media.play', { playbackId: 'policy-clip', url: 'https://clips.example/video.mp4', durationMs: 30_000 }, { lane: 'foreground' });
      await hub.publishAddOn('thsv.starting-soon-countdown', 'thsv.starting-soon-countdown.timer.update', { remainingSeconds: 120 }, { lane: 'foreground' });
      await hub.publishAddOn('thsv.chat-guard', 'thsv.chat-guard.status.update', { state: 'healthy' }, { lane: 'foreground' });

      expect(hub.status()).toMatchObject({
        addOnPublished: 4,
        presentationPolicy: {
          contractVersion: '1.0.0',
          foregroundQueue: ['thsv.automated-shoutouts', 'thsv.fan-crown', 'thsv.first-five', 'thsv.raid-scout', 'thsv.viewer-spotlight', 'thsv.village-hydration-station', 'thsv.village-roll-call'],
          mediaLane: ['thsv.raid-scout', 'thsv.random-clip-player'],
          timerLane: ['thsv.ad-break-companion', 'thsv.starting-soon-countdown'],
          backgroundOnly: ['thsv.chat-guard', 'thsv.discord-chat-archive', 'thsv.quote-vault', 'thsv.follower-pulse', 'thsv.community-analytics', 'thsv.user-translate', 'thsv.village-fun-commands'],
        },
        presentationQueue: { active: { owner: 'thsv.first-five', lane: 'foreground' }, queued: [] },
      });
      hub.stop();
    } finally { vi.useRealTimers(); }
  });

  it('keeps exact previews outside the queue even for a foreground main feature', async () => {
    const config = await testConfig(); const hub = new BrowserOverlayHub(silentLogger, config.browserOverlay);
    await hub.publishAddOn('thsv.viewer-spotlight', 'thsv.viewer-spotlight.card.show', { title: 'Exact card', templatePreview: true }, { lane: 'foreground' });
    expect(hub.status()).toMatchObject({ addOnPublished: 1, presentationQueue: { active: null, queued: [] } });
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
    await hub.publishAddOn('sample.clips', 'sample.clips.media.play', { playbackId: 'clip-17', url: 'https://clips.example/video.mp4' });
    receive(JSON.stringify({ contractVersion: 'thsv-addon-overlay-v1', kind: 'addon.lifecycle', moduleId: 'sample.clips', rendererId: 'hidden-source', playbackId: 'clip-17', phase: 'failed' }));
    receive(JSON.stringify({ contractVersion: 'thsv-addon-overlay-v1', kind: 'addon.lifecycle', moduleId: 'sample.clips', rendererId: 'visible-source', playbackId: 'clip-17', phase: 'started', currentTime: 0 }));
    receive(JSON.stringify({ contractVersion: 'thsv-addon-overlay-v1', kind: 'addon.lifecycle', moduleId: 'sample.clips', rendererId: 'hidden-source', playbackId: 'clip-17', phase: 'timeout' }));
    receive(JSON.stringify({ contractVersion: 'thsv-addon-overlay-v1', kind: 'addon.lifecycle', moduleId: 'sample.clips', rendererId: 'visible-source', playbackId: 'clip-17', phase: 'ended', currentTime: 8, duration: 8 }));
    receive(JSON.stringify({ contractVersion: 'thsv-addon-overlay-v1', kind: 'addon.lifecycle', moduleId: 'sample.clips', rendererId: 'visible-source', playbackId: 'clip-17', phase: 'ended' }));
    expect(observed).toMatchObject([{ playbackId: 'clip-17', phase: 'started' }, { playbackId: 'clip-17', phase: 'ended' }]);
    expect(hub.status()).toMatchObject({ addOnLifecycleReports: 2, lifecycleSubscribers: 1 });
    hub.stop();
  });

  it('tracks the exact add-on browser sources registered on a shared overlay socket', async () => {
    const config = await testConfig();
    const hub = new BrowserOverlayHub(silentLogger, config.browserOverlay);
    const socket = {} as WebSocket;
    const receive = (hub as unknown as { receiveClientMessage(raw: string, socket?: WebSocket): void }).receiveClientMessage.bind(hub);
    receive(JSON.stringify({ contractVersion: 'thsv-addon-overlay-v1', kind: 'addon.subscribe', moduleId: 'sample.clips', rendererId: 'obs-clips' }), socket);
    receive(JSON.stringify({ contractVersion: 'thsv-addon-overlay-v1', kind: 'addon.subscribe', moduleId: 'sample.labels', rendererId: 'obs-labels' }), socket);
    receive(JSON.stringify({ contractVersion: 'thsv-addon-overlay-v1', kind: 'addon.subscribe', moduleId: 'sample.clips', rendererId: 'obs-clips' }), socket);
    expect(hub.status()).toMatchObject({ addOnClients: { 'sample.clips': 1, 'sample.labels': 1 } });
    receive(JSON.stringify({ contractVersion: 'thsv-addon-overlay-v1', kind: 'addon.unsubscribe', moduleId: 'sample.clips', rendererId: 'obs-clips' }), socket);
    expect(hub.status()).toMatchObject({ addOnClients: { 'sample.labels': 1 } });
    hub.stop();
  });

  it('records read-only OBS browser-source visibility without opening another connection', async () => {
    const config = await testConfig();
    const hub = new BrowserOverlayHub(silentLogger, config.browserOverlay);
    const socket = {} as WebSocket;
    const receive = (hub as unknown as { receiveClientMessage(raw: string, socket?: WebSocket): void }).receiveClientMessage.bind(hub);
    receive(JSON.stringify({ contractVersion: 'thsv-addon-overlay-v1', kind: 'host.visibility', host: 'obs', rendererId: 'obs-alerts-1', surface: '/overlay/alerts:alerts', scene: 'Live - Village', visible: true, active: true }), socket);
    receive(JSON.stringify({ contractVersion: 'thsv-addon-overlay-v1', kind: 'host.visibility', host: 'obs', rendererId: 'obs-addon-1', moduleId: 'sample.labels', surface: '/overlay/addons/sample.labels', visible: false }), socket);
    expect(hub.status()).toMatchObject({ hostVisibility: { supported: true, visibleObsSources: 1, obsSources: [{ rendererId: 'obs-alerts-1', scene: 'Live - Village', visible: true, active: true }, { rendererId: 'obs-addon-1', moduleId: 'sample.labels', visible: false }] } });
    const future = Date.now() + 180_001;
    expect(hub.status(future)).toMatchObject({ hostVisibility: { supported: false, visibleObsSources: 0, obsSources: [] } });
    hub.stop();
  });

  it('replays active add-on media when an OBS browser source connects after play was published', async () => {
    const config = await testConfig();
    const hub = new BrowserOverlayHub(silentLogger, config.browserOverlay);
    const server = createServer();
    hub.attach(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('Expected a TCP test server address');
    await hub.publishAddOn('sample.clips', 'sample.clips.media.play', { playbackId: 'clip-late-obs', url: 'https://clips.example/video.mp4', durationMs: 30_000 });

    const received: Array<Record<string, unknown>> = [];
    const client = new WebSocket(`ws://127.0.0.1:${String(address.port)}/overlay/events`, { origin: `http://127.0.0.1:${String(address.port)}` });
    await new Promise<void>((resolve, reject) => {
      client.on('error', reject);
      client.on('message', (raw) => {
        const message = Buffer.isBuffer(raw)
          ? raw.toString('utf8')
          : Array.isArray(raw)
            ? Buffer.concat(raw).toString('utf8')
            : Buffer.from(raw).toString('utf8');
        received.push(JSON.parse(message) as Record<string, unknown>);
        if (received.length === 2) resolve();
      });
    });
    expect(received).toMatchObject([
      { kind: 'hub.ready' },
      { kind: 'addon.publish', moduleId: 'sample.clips', topic: 'sample.clips.media.play', payload: { playbackId: 'clip-late-obs' } },
    ]);

    const retryReceived = new Promise<void>((resolve) => client.once('message', () => resolve()));
    (hub as unknown as { replayUnstartedMedia(): void }).replayUnstartedMedia();
    await retryReceived;
    expect(received).toHaveLength(3);

    const startedReceived = new Promise<void>((resolve) => {
      const remove = hub.subscribeAddOnLifecycle('sample.clips', (event) => {
        if (event.playbackId === 'clip-late-obs' && event.phase === 'started') { remove(); resolve(); }
      });
    });
    client.send(JSON.stringify({ contractVersion: 'thsv-addon-overlay-v1', kind: 'addon.lifecycle', moduleId: 'sample.clips', playbackId: 'clip-late-obs', phase: 'started' }));
    await startedReceived;
    (hub as unknown as { replayUnstartedMedia(): void }).replayUnstartedMedia();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(received).toHaveLength(3);

    client.close();
    hub.stop();
    await new Promise<void>((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error)));
  });

  it('replays the latest persistent add-on labels when an OBS browser source connects later', async () => {
    const config = await testConfig();
    const hub = new BrowserOverlayHub(silentLogger, config.browserOverlay);
    const server = createServer();
    hub.attach(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('Expected a TCP test server address');
    await hub.publishAddOn('sample.labels', 'sample.labels.labels.update', { labels: { follower: { value: 'Late Viewer' } } });
    await hub.publishAddOn('sample.labels', 'sample.labels.labels.update', { labels: { follower: { value: 'Latest Viewer' } } });

    const received: Array<Record<string, unknown>> = [];
    const client = new WebSocket(`ws://127.0.0.1:${String(address.port)}/overlay/events`, { origin: `http://127.0.0.1:${String(address.port)}` });
    await new Promise<void>((resolve, reject) => {
      client.on('error', reject);
      client.on('message', (raw) => {
        const message = Buffer.isBuffer(raw)
          ? raw.toString('utf8')
          : Array.isArray(raw)
            ? Buffer.concat(raw).toString('utf8')
            : Buffer.from(raw).toString('utf8');
        received.push(JSON.parse(message) as Record<string, unknown>);
        if (received.length === 2) resolve();
      });
    });
    expect(received).toMatchObject([
      { kind: 'hub.ready' },
      { kind: 'addon.publish', moduleId: 'sample.labels', topic: 'sample.labels.labels.update', payload: { labels: { follower: { value: 'Latest Viewer' } } } },
    ]);
    expect(hub.status()).toMatchObject({ retainedLabelSnapshots: 1 });
    client.close();
    hub.stop();
    await new Promise<void>((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error)));
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

  it('routes a Ko-fi donation to alerts and optionally to the chat activity feed', async () => {
    const source = await fixture('youtube-super-chat.json');
    const config = await testConfig();
    const event: NormalizedEvent = {
      ...source,
      eventId: 'kofi-message-001',
      platform: 'kofi',
      eventType: 'engagement.donation',
      source: { adapter: 'streamerbot-addon-relay', eventId: 'kofi-message-001', eventName: 'KofiDonation' },
      payload: { amount: '5.00', currency: 'USD', message: 'Keep building!' },
      metadata: { ...source.metadata, bridgeSequence: 24, simulated: false },
    };

    expect(projectBrowserOverlayEvents(event, config.browserOverlay)).toMatchObject([
      { kind: 'alert.show', payload: { platform: 'kofi', alertType: 'donation', amount: '5.00', currency: 'USD' } },
      { kind: 'chat.event', payload: { platform: 'kofi', category: 'donation', label: 'KO-FI', message: 'example_member supported with 5.00 USD Keep building!' } },
    ]);

    config.browserOverlay.chat.events.platformEvents.kofi.donation.enabled = false;
    expect(projectBrowserOverlayEvents(event, config.browserOverlay).map((entry) => entry.kind)).toEqual(['alert.show']);
  });

  it('routes a stable Streamlabs donation to its own alert and chat presentation', async () => {
    const source = await fixture('youtube-super-chat.json');
    const config = await testConfig();
    const event: NormalizedEvent = {
      ...source,
      eventId: 'streamlabs-donation-001',
      platform: 'streamlabs',
      eventType: 'engagement.donation',
      source: { adapter: 'streamerbot-streamlabs', eventId: 'streamlabs-donation-001', eventName: 'StreamlabsDonation' },
      payload: { amount: '10.00', currency: 'USD', message: 'Great stream!' },
      metadata: { ...source.metadata, bridgeSequence: 25, simulated: false },
    };

    expect(projectBrowserOverlayEvents(event, config.browserOverlay)).toMatchObject([
      { kind: 'alert.show', payload: { platform: 'streamlabs', alertType: 'donation', amount: '10.00', currency: 'USD' } },
      { kind: 'chat.event', payload: { platform: 'streamlabs', category: 'donation', label: 'STREAMLABS', message: 'example_member donated 10.00 USD Great stream!' } },
    ]);
  });

  it('routes YouTube Jewels Gifted to a gift alert and its independently configurable chat activity message', async () => {
    const source = await fixture('youtube-super-chat.json');
    const config = await testConfig();
    const event: NormalizedEvent = {
      ...source,
      eventId: 'youtube-jewel-message-1',
      eventType: 'engagement.gift',
      source: { adapter: 'streamerbot-native', eventId: 'youtube-jewel-message-1', eventName: 'YouTubeJewelsGifted' },
      payload: { itemName: 'Test Gift', quantity: 3, jewelsAmount: 42, message: 'Three animated gifts' },
      metadata: { ...source.metadata, bridgeSequence: 25 },
    };
    expect(projectBrowserOverlayEvents(event, config.browserOverlay)).toMatchObject([
      { kind: 'alert.show', payload: { platform: 'youtube', alertType: 'gift', itemName: 'Test Gift', quantity: 3 } },
      { kind: 'chat.event', payload: { platform: 'youtube', category: 'jewels-gift', label: 'JEWELS GIFT', message: 'example_member sent 3 Test Gift worth 42 Jewels' } },
    ]);
    config.browserOverlay.chat.events.platformEvents.youtube['jewels-gift'].enabled = false;
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
    expect(projectBrowserOverlayEvents({ ...event, eventId: 'reward-no-input', payload: { ...event.payload, input: '' } }, config.browserOverlay)).toMatchObject([{ kind: 'chat.event', payload: { category: 'reward-redemption', message: 'Example Viewer redeemed Hydrate' } }]);
  });

  it('uses text-only DOM sinks in the reviewed browser source', async () => {
    const source = await readFile('overlays/browser/app.js', 'utf8');
    const captions = await readFile('overlays/browser/captions.js', 'utf8');
    const addOnHost = await readFile('overlays/browser/addon-host.js', 'utf8');
    const worker = await readFile('overlays/browser/worker.js', 'utf8');
    expect(source).toContain('textContent');
    expect(captions).toContain('captionText.textContent = payload.text');
    expect(captions).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\s*\(/u);
    expect(addOnHost).toContain("kind: 'addon.subscribe', moduleId, rendererId");
    expect(addOnHost).toContain("kind: 'addon.unsubscribe', moduleId, rendererId");
    expect(source).toContain("kind: 'host.visibility'");
    expect(addOnHost).toContain("kind: 'host.visibility'");
    expect(source).toContain('getCurrentScene');
    expect(addOnHost).toContain('obsSceneChanged');
    expect(source).toContain("addEventListener('obsSourceVisibleChanged'");
    expect(source).toContain("new SharedWorker('/overlay/worker-1.3.3.js', 'thsv-browser-overlay-1.3.3'");
    expect(addOnHost).toContain("new SharedWorker('/overlay/worker-1.3.3.js', 'thsv-browser-overlay-1.3.3'");
    expect(worker).toContain('const candidate = new WebSocket');
    expect(worker).toContain('if (socket !== candidate) return;');
    expect(worker).toContain("setTransportState('reconnecting');");
    expect(source).toContain("from '/overlay/alert-queue-1.2.3.js'");
    expect(source).toContain("card.dataset.transition = cardStyle.transition || 'slide-vertical'");
    expect(source).toContain("card.classList.add('alert-exit')");
    expect(source).toContain('function fitAlertTitle(card)');
    expect(source).toContain('while (!fitsTwoLines() && size > minimumSize)');
    expect(source).toContain("oldest.classList.add('message-expiring')");
    expect(source).toContain('function updateChatOverflow()');
    expect(source).toContain('new ResizeObserver(updateChatOverflow)');
    expect(source).toContain('new AlertPresentationController({');
    expect(source).toContain('alertController.enqueue(alert)');
    expect(source).toContain("console.warn('Skipped an alert that could not be rendered.'");
    expect(source).toContain("avatar.addEventListener('error', () => avatar.remove()");
    expect(source).toContain("buildAvatar(message.user, message.presentation, message.platform, 'chat-avatar')");
    expect(source).toContain("buildAvatar(alert.actor, alert.presentation || {}, alert.platform, 'alert-avatar')");
    expect(source).toContain("element('span', 'alert-event'");
    expect(source).toContain("activity.category === 'reward-redemption'");
    expect(source).toContain("event.kind === 'chat.event'");
    expect(source).toContain("event.kind === 'overlay.reset'");
    expect(source).toContain("if (state !== 'live') resetOverlaySurface()");
    expect(addOnHost).toContain("event?.kind === 'overlay.reset'");
    expect(addOnHost).toContain("else resetOverlaySurface()");
    expect(source).toContain('function addEventMessage(activity)');
    expect(source).toContain("element('img', 'badge-icon')");
    expect(source).toContain('if (message.user.isModerator && isModeratorBadge(badge)) continue;');
    expect(source).toContain('displayName.style.color = readableNameColor(message.platform)');
    expect(source).toContain("contrastRatio(preferred, background) >= 4.5");
    expect(source).toContain('brandLabel.textContent = clientConfig.brandLabel');
    expect(source).toContain('connectDirectly');
    expect(worker.match(/new WebSocket/gu)).toHaveLength(1);
    expect(worker).toContain('for (const port of ports)');
    for (const reviewedSource of [source, addOnHost, worker]) {
      expect(reviewedSource).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write/u);
      expect(reviewedSource).not.toContain('eval(');
    }
  });

  it('applies plain-text alert profiles and suppresses disabled alert types', async () => {
    const source = await fixture('youtube-super-chat.json');
    const config: BrowserOverlayConfig = {
      ...(await testConfig()).browserOverlay, brandLabel: '',
      alerts: { profiles: { youtube: { 'super-chat': { enabled: true, priority: 'critical', durationMs: 9_000, titleTemplate: '{actor} supported with {amount} {currency}', detailTemplate: '{message}', sound: { mode: 'chime', volume: 0.25 }, card: { backgroundColor: '#171120', fontFamily: 'system', layout: 'classic', mediaPlacement: 'behind', transition: 'slide-vertical' }, aggregation: { mode: 'none', windowMs: 5_000 } } } } },
    };
    expect(projectBrowserOverlayEvent({ ...source, metadata: { ...source.metadata, bridgeSequence: 13 } }, config)).toMatchObject({
      kind: 'alert.show', payload: { priority: 'critical', display: { title: 'Example_member supported with 5.00 USD', thankYou: 'Thank you for supporting the village, Example_member!', viewerMessage: 'Simulated support', detail: 'Simulated support', durationMs: 9_000, sound: { mode: 'chime', volume: 0.25 } } },
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

  it('keeps thank-you and viewer-provided alert text as independent optional layers', async () => {
    const source = await fixture('youtube-super-chat.json');
    const base = (await testConfig()).browserOverlay;
    const profile = {
      enabled: true, showThankYou: true, thankYouTemplate: 'Welcome to the village, {actor}!', showViewerMessage: false,
      sound: { mode: 'none' as const, volume: 0.35 },
      card: { backgroundColor: '#171120', fontFamily: 'system' as const, layout: 'classic' as const, mediaPlacement: 'behind' as const, transition: 'slide-vertical' as const },
      aggregation: { mode: 'none' as const, windowMs: 5_000 },
    };
    const config: BrowserOverlayConfig = { ...base, alerts: { profiles: { youtube: { 'super-chat': profile } } } };
    expect(projectBrowserOverlayEvent({ ...source, metadata: { ...source.metadata, bridgeSequence: 131 } }, config)).toMatchObject({
      kind: 'alert.show', payload: { display: { thankYou: 'Welcome to the village, Example_member!' } },
    });
    const display = (projectBrowserOverlayEvent({ ...source, metadata: { ...source.metadata, bridgeSequence: 132 } }, config) as { payload: { display: { viewerMessage?: string; detail?: string } } }).payload.display;
    expect(display.viewerMessage).toBeUndefined();
    expect(display.detail).toBeUndefined();
  });

  it('carries an uploaded background video through to the projected alert card', async () => {
    const source = await fixture('youtube-super-chat.json');
    const videoUrl = `/overlay/assets/${'d'.repeat(64)}.webm`;
    const config: BrowserOverlayConfig = {
      ...(await testConfig()).browserOverlay, brandLabel: '',
      alerts: { profiles: { youtube: { 'super-chat': { enabled: true, sound: { mode: 'chime', volume: 0.25 }, card: { backgroundColor: '#171120', fontFamily: 'system', layout: 'classic', mediaPlacement: 'behind', transition: 'fade', backgroundVideoUrl: videoUrl }, aggregation: { mode: 'none', windowMs: 5_000 } } } } },
    };
    expect(projectBrowserOverlayEvent({ ...source, metadata: { ...source.metadata, bridgeSequence: 16 } }, config)).toMatchObject({
      kind: 'alert.show', payload: { display: { card: { backgroundVideoUrl: videoUrl } } },
    });
  });

  it('carries the chosen text layout and media placement through to the projected alert card', async () => {
    const source = await fixture('youtube-super-chat.json');
    const imageUrl = `/overlay/assets/${'e'.repeat(64)}.png`;
    const config: BrowserOverlayConfig = {
      ...(await testConfig()).browserOverlay, brandLabel: '',
      alerts: { profiles: { youtube: { 'super-chat': { enabled: true, sound: { mode: 'chime', volume: 0.25 }, card: { backgroundColor: '#171120', fontFamily: 'system', layout: 'stacked', mediaPlacement: 'inset', transition: 'pop', backgroundImageUrl: imageUrl }, aggregation: { mode: 'none', windowMs: 5_000 } } } } },
    };
    expect(projectBrowserOverlayEvent({ ...source, metadata: { ...source.metadata, bridgeSequence: 17 } }, config)).toMatchObject({
      kind: 'alert.show', payload: { display: { card: { layout: 'stacked', mediaPlacement: 'inset', transition: 'pop', backgroundImageUrl: imageUrl } } },
    });
  });

  it('keeps the standalone chat canvas transparent and bottom-anchored', async () => {
    const source = await readFile('overlays/browser/app.js', 'utf8');
    const styles = await readFile('overlays/browser/styles.css', 'utf8');
    expect(source).toContain("['regular', 'compact', 'minimal', 'classic'].includes(requestedLayout)");
    expect(source).toContain("document.body.dataset.orientation = dockMode ? 'vertical' : chatConfig.orientation");
    expect(source).toContain("document.body.dataset.newMessagePosition = dockMode ? 'end' : chatConfig.newMessagePosition");
    expect(source).toContain("clientConfig.chat.showProfilePictures");
    expect(source).toContain("clientConfig.chat.showPlatformLabels");
    expect(source).toContain("clientConfig.chat.showBadges");
    expect(source).not.toContain('verticalScale');
    expect(styles).not.toMatch(/body\[data-mode="chat"\][^{]*\{[^}]*scaleY/u);
    expect(styles).toContain('width: min(680px, calc(100vw - 32px))');
    expect(styles).toContain('background: var(--message-platform-bg, var(--chat-message-bg));');
    expect(source).toContain("chatConfig.messageColorMode === 'platform'");
    expect(styles).toContain('.display-name { min-width: 0; max-width: 100%; overflow: hidden; color: #fff;');
    expect(source).toContain('while (visible.length > retainedChatHistory)');
    expect(styles).toContain('.message { flex: 0 0 auto; width: 100%; min-width: 0;');
    expect(styles).toContain('justify-content: flex-end;');
    expect(styles).toContain('.chat.chat-overflowing { -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 34px');
    expect(source).toContain("platformNameColors = { twitch: '#ffd166', youtube: '#72e5ff', kick: '#d8b4ff', tiktok: '#ff8fab'");
    expect(styles).toContain('font-size: var(--chat-font-size)');
    expect(styles).toContain('font-family: var(--chat-font-family)');
    expect(styles).toContain('text-rendering: geometricPrecision');
    expect(styles).toContain('body[data-layout="compact"] .message { position: relative; align-self: flex-start;');
    expect(styles).toContain('body[data-layout="compact"] .message.platform-youtube, body[data-layout="compact"] .message.platform-tiktok { align-self: flex-end;');
    expect(styles).toContain('background: transparent;');
    expect(styles).toContain('body[data-mode="chat"] .chat-shell header { display: none; }');
    expect(styles).toContain('body[data-mode="chat"] .message.message-expiring');
    expect(styles).toContain('body[data-dock="true"] .chat-shell');
    expect(styles).toContain('grid-template-columns: minmax(0, 1fr); justify-content: stretch;');
    expect(styles).toContain('@media (max-aspect-ratio: 4 / 3)');
    expect(styles).toContain('body[data-mode="chat"] .connection-status[data-state="reconnecting"]');
    expect(styles).toContain('@keyframes chat-expire');
    expect(styles).toContain('@keyframes chat-expire-horizontal');
    expect(styles).toContain('body[data-orientation="horizontal"] .chat');
    expect(styles).toContain('body[data-orientation="horizontal"] .message { flex: 0 0 auto; width: fit-content;');
    expect(styles).toContain('body[data-layout="minimal"] .message');
    expect(styles).toContain('body[data-layout="minimal"] .message .identity { display: inline-flex;');
    expect(styles).toContain('body[data-layout="minimal"] .message .body { display: inline;');
    expect(styles).toContain('body[data-mode="chat"][data-dock="false"][data-layout="compact"] .message { position: absolute;');
    expect(source).toContain('function positionCompactBubble(item)');
    expect(source).toContain('function nextBubbleRandom(seed)');
    expect(source).toContain('function bubbleIntersects(');
    expect(styles).toContain('body[data-layout="compact"] .message .display-name { max-width: 100%');
    expect(styles).toContain('body[data-layout="compact"] .message { position: relative;');
    expect(styles).toContain('body[data-layout="regular"] .message .identity');
    expect(styles).toContain('body[data-layout="classic"] .message { display: block;');
    expect(styles).toContain('body[data-layout="classic"] .message .body { display: inline;');
    expect(source).toContain("fetch('/overlay/chat/dock/send'");
    expect(source).toContain("new Option('All live chats', 'all')");
    expect(styles).toContain('.dock-composer');
  });

  it('keeps standalone alerts crisp and responsive without scaling', async () => {
    const styles = await readFile('overlays/browser/styles.css', 'utf8');
    expect(styles).toContain('body[data-mode="alerts"] .alerts { inset: 0; display: flex;');
    expect(styles).toContain('body[data-mode="alerts"] .alert { width: min(800px, 100%)');
    expect(styles).toContain('@keyframes alert-slide-down');
    expect(styles).toContain('@keyframes alert-slide-up');
    expect(styles).toContain('.alert h2.title-clamped');
    expect(styles).toContain('background-color: var(--alert-card-bg, #171120);');
    expect(styles).toContain('.alert-identity { display: grid; grid-template-columns: 84px minmax(0, 1fr)');
    expect(styles).toContain('.alert-copy { min-width: 0; text-align: left; }');
    expect(styles).toContain('font-size: clamp(22px, 2vw, 36px)');
    expect(styles).toContain('.alert.platform-youtube { --alert-accent: #ff4e45;');
    expect(styles).toContain('.alert.platform-tiktok { --alert-accent: #25f4ee;');
    expect(styles).toContain('overflow-wrap: anywhere');
    expect(styles).toContain('body[data-mode="alerts"] .connection-status[data-state="reconnecting"]');
  });

});
