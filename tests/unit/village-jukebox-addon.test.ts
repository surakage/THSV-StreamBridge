import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- executable add-ons intentionally export plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import villageJukebox, { processVillageJukeboxEvent, resetVillageJukeboxRuntime, stateFor } from '../../addons/village-jukebox/dist/index.js';

const RESOLVE_ACTION_ID = '0f16105e-7c92-47ad-a61b-c6d1b934fdf0';
const SETTLE_ACTION_ID = 'fa5b3b6d-a639-48a6-9999-7e5b11f31590';

function command(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: '1.0.0', eventId: 'request-1', eventType: 'command.received', platform: 'youtube',
    source: { adapter: 'test', eventId: 'source-1', eventName: 'Command' }, receivedAt: '2026-07-31T12:00:00.000Z', channel: { name: 'channel' },
    user: { id: 'youtube-viewer-1', name: 'viewer', displayName: 'Village Viewer', actorType: 'human', roles: [] },
    payload: { command: 'sr', arguments: ['safe', 'song'] }, metadata: { simulated: false }, ...overrides,
  };
}

function resolved(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: '1.0.0', eventId: 'resolver-result-1', eventType: 'addon.thsv.village-jukebox.track-resolved', platform: 'system',
    source: { adapter: 'streamerbot-addon-relay', eventId: 'relay-1', eventName: 'Resolve YouTube Track' }, receivedAt: '2026-07-31T12:00:01.000Z', channel: { name: 'system' },
    payload: {
      requestId: 'jukebox-request-1', succeeded: true, error: '', platform: 'youtube', userId: 'youtube-viewer-1', requesterName: 'Village Viewer',
      requestEventId: 'request-1', pointCost: 100, rewardPlatform: '', rewardId: '', redemptionId: '', videoId: 'dQw4w9WgXcQ',
      title: 'A safe test song', channel: 'Example Artist', thumbnailUrl: 'https://i.ytimg.com/example.jpg', durationSeconds: 212,
    }, metadata: { simulated: false }, ...overrides,
  };
}

function harness(settings: Record<string, unknown> = {}) {
  let stored: Record<string, unknown> = {};
  const published: Array<{ topic: string; payload: Record<string, unknown> }> = [];
  const chat: Array<{ platform: string; message: string }> = [];
  const lifecycleListeners: Array<(event: Record<string, unknown>) => void> = [];
  const mediaListeners: Array<(event: Record<string, unknown>) => void> = [];
  const context = {
    settings: { enabled: true, rightsAcknowledged: true, pointsPlatforms: ['youtube', 'tiktok'], pointsCost: 100, secondsBetweenTracks: 4, ...settings },
    state: { read: vi.fn(async () => stored), write: vi.fn(async (value: Record<string, unknown>) => { stored = value; }) },
    streamerbot: { runApprovedAction: vi.fn(async () => undefined) },
    viewerFoundation: {
      getProjection: vi.fn(async () => ({ viewerId: 'viewer-foundation-1', points: 500, currencyName: 'Sprouts' })),
      mutate: vi.fn(async () => ({ applied: true })),
    },
    chat: { send: vi.fn(async ({ message, sourcePlatform }: { message: string; sourcePlatform: string }) => { chat.push({ platform: sourcePlatform, message }); return [{ platform: sourcePlatform, accepted: true }]; }) },
    overlay: {
      publish: vi.fn(async (topic: string, payload: Record<string, unknown>) => { published.push({ topic, payload }); }),
      onLifecycle: vi.fn((listener: (event: Record<string, unknown>) => void) => { lifecycleListeners.push(listener); return () => undefined; }),
    },
    mediaSlot: {
      acquire: vi.fn(async () => ({ acquired: true, ownerModuleId: 'thsv.village-jukebox', leaseId: 'lease-1', priority: 25, expiresAt: Date.now() + 300_000 })),
      release: vi.fn(async () => true),
      onChange: vi.fn((listener: (event: Record<string, unknown>) => void) => { mediaListeners.push(listener); return () => undefined; }),
    },
    schedule: { after: vi.fn((...arguments_: [number, () => Promise<unknown>]) => { void arguments_; return 'task-1'; }), cancel: vi.fn(() => true) },
  };
  return { context, published, chat, lifecycleListeners, mediaListeners, state: () => stored };
}

afterEach(() => { resetVillageJukeboxRuntime(); });

describe('Village Jukebox add-on', () => {
  it('stays inert until the creator accepts the music-rights responsibility', async () => {
    const test = harness({ rightsAcknowledged: false }); await villageJukebox.start(test.context);
    await expect(processVillageJukeboxEvent(command(), test.context)).resolves.toBeUndefined();
    expect(test.context.streamerbot.runApprovedAction).not.toHaveBeenCalled(); expect(test.published).toHaveLength(0);
    await villageJukebox.stop(test.context);
  });

  it('resolves first, spends points only after validation, and starts one shared-media playback', async () => {
    const test = harness();
    await villageJukebox.start(test.context);
    await expect(processVillageJukeboxEvent(command(), test.context)).resolves.toMatchObject({ accepted: true, pending: true, requestId: 'jukebox-request-1' });
    expect(test.context.streamerbot.runApprovedAction).toHaveBeenCalledWith(RESOLVE_ACTION_ID, expect.objectContaining({ villageJukeboxQuery: 'safe song', villageJukeboxPointCost: 100 }));
    expect(test.context.viewerFoundation.mutate).not.toHaveBeenCalled();

    await expect(processVillageJukeboxEvent(resolved(), test.context)).resolves.toMatchObject({ accepted: true, queued: true, trackId: 'dQw4w9WgXcQ' });
    expect(test.context.viewerFoundation.mutate).toHaveBeenCalledWith(expect.objectContaining({ operation: 'spend', amount: 100, idempotencyKey: 'village-jukebox:request-1' }));
    expect(test.context.mediaSlot.acquire).toHaveBeenCalledTimes(1);
    expect(test.published).toContainEqual(expect.objectContaining({ topic: 'thsv.village-jukebox.media.play', payload: expect.objectContaining({ embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ', muted: false }) }));
    expect(test.state()).toMatchObject({ current: { id: 'dQw4w9WgXcQ' }, queue: [], pending: {} });
    await villageJukebox.stop(test.context);
  });

  it('rejects an over-length resolved track without spending points', async () => {
    const test = harness({ maximumTrackMinutes: 5 }); await villageJukebox.start(test.context);
    await processVillageJukeboxEvent(command(), test.context);
    const result = await processVillageJukeboxEvent(resolved({ payload: { ...resolved().payload, durationSeconds: 301 } }), test.context);
    expect(result).toEqual({ accepted: false, reason: 'track-policy' });
    expect(test.context.viewerFoundation.mutate).not.toHaveBeenCalled();
    expect(test.context.mediaSlot.acquire).not.toHaveBeenCalled();
    expect(test.chat.at(-1)?.message).toContain('5 minutes or shorter');
    await villageJukebox.stop(test.context);
  });

  it('uses a verified Twitch reward and settles it only after a valid track is accepted', async () => {
    const test = harness({ rewardRequestsEnabled: true, twitchRewardId: 'reward-1' }); await villageJukebox.start(test.context);
    const reward = command({ eventId: 'reward-event-1', eventType: 'reward.redemption', platform: 'twitch', payload: { rewardId: 'reward-1', redemptionId: 'redemption-1', verifiedTransport: true, input: 'safe song' } });
    await expect(processVillageJukeboxEvent(reward, test.context)).resolves.toMatchObject({ accepted: true, pending: true });
    expect(test.context.streamerbot.runApprovedAction).toHaveBeenCalledWith(RESOLVE_ACTION_ID, expect.objectContaining({ villageJukeboxRewardId: 'reward-1', villageJukeboxRedemptionId: 'redemption-1', villageJukeboxPointCost: 0 }));
    const payload = { ...resolved().payload, requestId: 'jukebox-reward-event-1', platform: 'twitch', userId: 'youtube-viewer-1', requestEventId: 'reward-event-1', pointCost: 0, rewardPlatform: 'twitch', rewardId: 'reward-1', redemptionId: 'redemption-1' };
    await processVillageJukeboxEvent(resolved({ eventId: 'reward-result', payload }), test.context);
    expect(test.context.streamerbot.runApprovedAction).toHaveBeenCalledWith(SETTLE_ACTION_ID, { villageJukeboxRewardOperation: 'fulfill', villageJukeboxRewardId: 'reward-1', villageJukeboxRedemptionId: 'redemption-1' });
    expect(test.context.viewerFoundation.mutate).not.toHaveBeenCalled();
    await villageJukebox.stop(test.context);
  });

  it('advances only after the hosted player reports that the current track ended', async () => {
    const test = harness(); await villageJukebox.start(test.context); await processVillageJukeboxEvent(command(), test.context); await processVillageJukeboxEvent(resolved(), test.context);
    test.context.schedule.after.mockClear();
    expect(test.context.schedule.after).not.toHaveBeenCalled();
    test.lifecycleListeners[0]?.({ playbackId: 'jukebox-jukebox-request-1', phase: 'ended' });
    await vi.waitFor(() => expect(test.context.schedule.after).toHaveBeenCalledWith(4_000, expect.any(Function)));
    expect(test.context.mediaSlot.release).toHaveBeenCalledWith('lease-1');
    await villageJukebox.stop(test.context);
  });

  it('expires a missing resolver response without spending points or leaving the viewer stuck', async () => {
    const test = harness(); await villageJukebox.start(test.context); await processVillageJukeboxEvent(command(), test.context);
    const timeout = test.context.schedule.after.mock.calls.find(([delay]) => delay === 45_000)?.[1] as (() => Promise<unknown>) | undefined;
    expect(timeout).toBeTypeOf('function'); await timeout?.();
    expect(test.state()).toMatchObject({ pending: {}, cooldowns: {}, processedRequestIds: ['jukebox-request-1'] });
    expect(test.context.viewerFoundation.mutate).not.toHaveBeenCalled();
    expect(test.chat.at(-1)?.message).toContain('timed out');
    await villageJukebox.stop(test.context);
  });

  it('clears unresolved requests and refunds a pending Twitch redemption when disabled', async () => {
    const test = harness({ rewardRequestsEnabled: true, twitchRewardId: 'reward-1' }); await villageJukebox.start(test.context);
    const reward = command({ eventId: 'reward-stop-1', eventType: 'reward.redemption', platform: 'twitch', payload: { rewardId: 'reward-1', redemptionId: 'redemption-stop-1', verifiedTransport: true, input: 'safe song' } });
    await processVillageJukeboxEvent(reward, test.context);
    await villageJukebox.stop(test.context);
    expect(test.state()).toMatchObject({ pending: {}, cooldowns: {}, processedRequestIds: ['jukebox-reward-stop-1'] });
    expect(test.context.streamerbot.runApprovedAction).toHaveBeenCalledWith(SETTLE_ACTION_ID, { villageJukeboxRewardOperation: 'refund', villageJukeboxRewardId: 'reward-1', villageJukeboxRedemptionId: 'redemption-stop-1' });
  });

  it('drops malformed persisted tracks instead of silently repairing financial or duration fields', () => {
    const malformed = { id: 'dQw4w9WgXcQ', title: 'Unsafe state', channel: 'Example', durationSeconds: 0, platform: 'youtube', requesterKey: 'youtube:user', requesterName: 'Viewer', requestEventId: 'event-1', requestId: 'request-1', points: { viewerId: 'viewer-1', amount: -10, idempotencyKey: 'key-1' } };
    expect(stateFor({ queue: [malformed] })).toMatchObject({ queue: [] });
  });

  it('can require direct links and caps quota-expensive title searches per UTC day', async () => {
    const linksOnly = harness({ allowTextSearch: false }); await villageJukebox.start(linksOnly.context);
    await expect(processVillageJukeboxEvent(command(), linksOnly.context)).resolves.toEqual({ accepted: false, reason: 'links-only' });
    expect(linksOnly.context.streamerbot.runApprovedAction).not.toHaveBeenCalled(); await villageJukebox.stop(linksOnly.context); resetVillageJukeboxRuntime();

    const capped = harness({ dailyTextSearchLimit: 1, viewerCooldownSeconds: 0, maximumRequestsPerViewer: 5 }); await villageJukebox.start(capped.context);
    await expect(processVillageJukeboxEvent(command(), capped.context)).resolves.toMatchObject({ accepted: true, pending: true });
    await expect(processVillageJukeboxEvent(command({ eventId: 'request-2', user: { id: 'youtube-viewer-2', name: 'viewer2', displayName: 'Second Viewer', actorType: 'human', roles: [] } }), capped.context)).resolves.toEqual({ accepted: false, reason: 'search-limit' });
    await expect(processVillageJukeboxEvent(command({ eventId: 'request-3', user: { id: 'youtube-viewer-3', name: 'viewer3', displayName: 'Third Viewer', actorType: 'human', roles: [] }, payload: { command: 'sr', arguments: ['https://youtu.be/dQw4w9WgXcQ'] } }), capped.context)).resolves.toMatchObject({ accepted: true, pending: true });
    await villageJukebox.stop(capped.context);
  });

  it('ships one dedicated group, a private API-key argument, and no Spotify playback code', async () => {
    const [manifestText, resolver, readme, modulePackage, overlayHost] = await Promise.all([
      readFile('packages/streamerbot/village-jukebox/manifest.json', 'utf8'),
      readFile('packages/streamerbot/village-jukebox/src/ResolveYouTubeTrack.cs', 'utf8'),
      readFile('addons/village-jukebox/README.md', 'utf8'),
      readFile('addons/village-jukebox/module-package.json', 'utf8'),
      readFile('overlays/browser/addon-host.js', 'utf8'),
    ]);
    const packageManifest = JSON.parse(manifestText) as { actions: Array<{ group: string; arguments?: Array<{ name: string }> }> };
    expect(new Set(packageManifest.actions.map((action) => action.group))).toEqual(new Set(['THSV Addon - Village Jukebox']));
    expect(packageManifest.actions[0]?.arguments).toContainEqual(expect.objectContaining({ name: 'villageJukeboxYouTubeApiKey' }));
    expect(resolver).toContain('https://www.googleapis.com/youtube/v3/videos');
    expect(overlayHost).toContain("if (embeddedPlaybackKind === 'youtube') mediaTimer = setTimeout(() => clearMedia('timeout'), 20_000)");
    expect(`${resolver}\n${readme}\n${modulePackage}`).not.toMatch(/api\.spotify|open\.spotify|spotify\.com\/v1/iu);
  });
});
