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
    settings: { enabled: true, rightsAcknowledged: true, pointsPlatforms: ['youtube', 'tiktok'], pointsCost: 100, secondsBetweenTracks: 4, approveRequests: false, ...settings },
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

  async function queueTwo(test: ReturnType<typeof harness>) {
    await villageJukebox.start(test.context);
    await processVillageJukeboxEvent(command(), test.context);
    await processVillageJukeboxEvent(resolved(), test.context);
    await processVillageJukeboxEvent(command({ eventId: 'request-2', user: { id: 'youtube-viewer-2', name: 'second', displayName: 'Second Viewer', actorType: 'human', roles: [] } }), test.context);
    await processVillageJukeboxEvent(resolved({ eventId: 'resolver-result-2', payload: { ...resolved().payload, requestId: 'jukebox-request-2', userId: 'youtube-viewer-2', requesterName: 'Second Viewer', requestEventId: 'request-2', videoId: 'aaaaaaaaaaa', title: 'Second song' } }), test.context);
  }

  it('lets the creator see the queue with links, pause and resume in place, and skip straight to the next song', async () => {
    const test = harness(); await queueTwo(test);
    const status = await villageJukebox.administerVillageJukebox({ operation: 'status' }, test.context);
    expect(status.status).toMatchObject({ paused: false, current: { title: 'A safe test song', link: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }, queue: [{ title: 'Second song', link: 'https://www.youtube.com/watch?v=aaaaaaaaaaa' }] });
    expect(status.status.history.map((entry: { title: string; status: string }) => `${entry.title}:${entry.status}`)).toEqual(['Second song:queued', 'A safe test song:playing']);

    await villageJukebox.administerVillageJukebox({ operation: 'pause' }, test.context);
    expect(test.published.at(-1)).toMatchObject({ topic: 'thsv.village-jukebox.media.pause' });
    expect(test.context.mediaSlot.release).toHaveBeenCalled();
    expect(test.state()).toMatchObject({ paused: true, current: { id: 'dQw4w9WgXcQ' } });
    await villageJukebox.administerVillageJukebox({ operation: 'resume' }, test.context);
    expect(test.published.at(-1)).toMatchObject({ topic: 'thsv.village-jukebox.media.resume' });
    expect(test.state()).toMatchObject({ paused: false, current: { id: 'dQw4w9WgXcQ' } });

    await villageJukebox.administerVillageJukebox({ operation: 'skip' }, test.context);
    expect(test.published.some((entry) => entry.topic === 'thsv.village-jukebox.media.stop')).toBe(true);
    expect(test.context.schedule.after).toHaveBeenLastCalledWith(1_000, expect.any(Function));
    expect(stateFor(test.state()).history.find((entry: { title: string }) => entry.title === 'A safe test song')?.status).toBe('skipped');
    await villageJukebox.stop(test.context);
  });

  it('blocks a video: queued copies are removed and refunded, and later requests are refused before any lookup', async () => {
    const test = harness(); await queueTwo(test);
    await villageJukebox.administerVillageJukebox({ operation: 'block', video: 'https://youtu.be/aaaaaaaaaaa' }, test.context);
    expect(test.state()).toMatchObject({ queue: [], blocked: [{ id: 'aaaaaaaaaaa', title: 'Second song' }] });
    expect(test.context.viewerFoundation.mutate).toHaveBeenCalledWith(expect.objectContaining({ operation: 'refund', amount: 100 }));

    const lookups = test.context.streamerbot.runApprovedAction.mock.calls.length;
    const blocked = await processVillageJukeboxEvent(command({ eventId: 'request-3', user: { id: 'youtube-viewer-3', name: 'third', displayName: 'Third', actorType: 'human', roles: [] }, payload: { command: 'sr', arguments: ['https://www.youtube.com/watch?v=aaaaaaaaaaa'] } }), test.context);
    expect(blocked).toEqual({ accepted: false, reason: 'blocked' });
    expect(test.context.streamerbot.runApprovedAction.mock.calls.length).toBe(lookups);

    // !blocksong from a moderator blocks the song that is playing and moves on; viewers cannot use it.
    expect(await processVillageJukeboxEvent(command({ eventId: 'viewer-block', payload: { command: 'blocksong', arguments: [] } }), test.context)).toBeUndefined();
    await processVillageJukeboxEvent(command({ eventId: 'mod-block', user: { id: 'mod-1', name: 'mod', displayName: 'Mod', actorType: 'human', roles: ['moderator'] }, payload: { command: 'blocksong', arguments: [] } }), test.context);
    expect(stateFor(test.state()).blocked.map((item: { id: string }) => item.id)).toEqual(['dQw4w9WgXcQ', 'aaaaaaaaaaa']);
    expect(test.state().current).toBeUndefined();
    await villageJukebox.stop(test.context);
  });

  it('plays a chosen video now, stops and holds the queue, and plays a past video again without charging anyone', async () => {
    const test = harness(); await queueTwo(test);
    await villageJukebox.administerVillageJukebox({ operation: 'play-now', requestId: 'jukebox-request-2' }, test.context);
    expect(test.published.some((entry) => entry.topic === 'thsv.village-jukebox.media.stop')).toBe(true);
    expect(stateFor(test.state()).queue[0]?.title).toBe('Second song');

    const stopped = await villageJukebox.administerVillageJukebox({ operation: 'stop' }, test.context);
    expect(stopped.status.paused).toBe(true);

    const spendCount = () => JSON.stringify(test.context.viewerFoundation.mutate.mock.calls).split('"operation":"spend"').length - 1;
    const spends = spendCount();
    const played = stateFor(test.state()).history.find((entry: { title: string }) => entry.title === 'A safe test song');
    await villageJukebox.administerVillageJukebox({ operation: 'replay', requestId: played.requestId }, test.context);
    expect(stateFor(test.state()).queue[0]).toMatchObject({ id: 'dQw4w9WgXcQ', durationSeconds: 212 });
    expect(spendCount()).toBe(spends);
    await villageJukebox.stop(test.context);
  });

  it('accepts Shorts links and videos up to an hour when the creator allows it', async () => {
    const test = harness({ maximumTrackMinutes: 60 }); await villageJukebox.start(test.context);
    await processVillageJukeboxEvent(command({ payload: { command: 'sr', arguments: ['https://www.youtube.com/shorts/aaaaaaaaaaa'] } }), test.context);
    await processVillageJukeboxEvent(resolved({ payload: { ...resolved().payload, videoId: 'aaaaaaaaaaa', durationSeconds: 3_000 } }), test.context);
    expect(test.state()).toMatchObject({ current: { id: 'aaaaaaaaaaa', durationSeconds: 3_000 } });
    expect(test.context.mediaSlot.acquire).toHaveBeenCalledWith(expect.objectContaining({ durationMs: 3_015_000 }));
    await villageJukebox.stop(test.context);
  });

  it('moves a request to play next and clears the queue with refunds', async () => {
    const test = harness(); await queueTwo(test);
    await processVillageJukeboxEvent(command({ eventId: 'request-3', user: { id: 'youtube-viewer-3', name: 'third', displayName: 'Third', actorType: 'human', roles: [] } }), test.context);
    await processVillageJukeboxEvent(resolved({ eventId: 'resolver-result-3', payload: { ...resolved().payload, requestId: 'jukebox-request-3', userId: 'youtube-viewer-3', requesterName: 'Third', requestEventId: 'request-3', videoId: 'bbbbbbbbbbb', title: 'Third song' } }), test.context);
    await villageJukebox.administerVillageJukebox({ operation: 'play-next', requestId: 'jukebox-request-3' }, test.context);
    expect(stateFor(test.state()).queue.map((track: { title: string }) => track.title)).toEqual(['Third song', 'Second song']);
    const cleared = await villageJukebox.administerVillageJukebox({ operation: 'clear' }, test.context);
    expect(cleared).toMatchObject({ cleared: 2, status: { queue: [] } });
    await villageJukebox.stop(test.context);
  });

  it('holds new requests with their titles showing until the streamer approves them', async () => {
    const test = harness({ approveRequests: true }); await queueTwo(test);
    expect(test.published.filter((item) => item.topic === 'thsv.village-jukebox.media.play')).toHaveLength(0);
    expect(test.chat.at(-1)?.message).toContain('plays once the streamer approves it');
    const waiting = await villageJukebox.administerVillageJukebox({ operation: 'status' }, test.context);
    expect(waiting.status).toMatchObject({ approveRequests: true, current: null, queue: [{ title: 'A safe test song', approved: false }, { title: 'Second song', approved: false }] });
    const approved = await villageJukebox.administerVillageJukebox({ operation: 'approve', requestId: 'jukebox-request-2' }, test.context);
    expect(approved).toMatchObject({ approved: 'Second song', status: { current: { title: 'Second song' }, queue: [{ title: 'A safe test song', approved: false }] } });
    expect(test.published).toContainEqual(expect.objectContaining({ topic: 'thsv.village-jukebox.media.play', payload: expect.objectContaining({ embedUrl: 'https://www.youtube.com/embed/aaaaaaaaaaa' }) }));
    const all = await villageJukebox.administerVillageJukebox({ operation: 'approve-all' }, test.context);
    expect(all).toMatchObject({ approved: 1, status: { queue: [{ title: 'A safe test song', approved: true }] } });
    await expect(villageJukebox.administerVillageJukebox({ operation: 'approve', requestId: 'missing' }, test.context)).rejects.toThrow('no longer in the queue');
    await villageJukebox.stop(test.context);
  });

  it('describes the queue for the Control Panel and runs its buttons', async () => {
    const test = harness({ approveRequests: true }); await queueTwo(test);
    const status = await villageJukebox.controlPanel({ operation: 'status' }, test.context);
    expect(status.summary).toContainEqual({ label: 'Waiting for approval', value: '2' });
    const upNext = status.lists[0];
    expect(upNext.items[0]).toMatchObject({ title: 'A safe test song', badge: 'Waiting for approval', thumbnail: 'dQw4w9WgXcQ' });
    expect(upNext.items[0].actions[0]).toEqual({ action: 'approve', label: 'Approve', style: 'primary', values: { requestId: 'jukebox-request-1' } });
    const approved = await villageJukebox.controlPanel({ operation: 'action', action: 'approve', values: { requestId: 'jukebox-request-1' } }, test.context);
    expect(approved.summary[0].value).toContain('A safe test song');
    const volume = await villageJukebox.controlPanel({ operation: 'action', action: 'volume', values: { percent: 40 } }, test.context);
    expect(volume.summary).toContainEqual({ label: 'Volume', value: '40%' });
    await expect(villageJukebox.controlPanel({ operation: 'action', action: 'self-destruct' }, test.context)).rejects.toThrow('Unknown');
    await villageJukebox.stop(test.context);
  });

  it('runs the Streamer.bot creator controls: approve next, play/pause, skip and stop', async () => {
    const test = harness({ approveRequests: true }); await queueTwo(test);
    const control = async (action: string, simulated = false): Promise<unknown> => (await processVillageJukeboxEvent({ eventId: `control-${action}`, eventType: 'addon.thsv.village-jukebox.control', platform: 'system', payload: { action }, metadata: { simulated } }, test.context)) as unknown;
    expect(await control('approve-next', true)).toMatchObject({ accepted: false });
    expect(await control('clear')).toMatchObject({ accepted: false, reason: 'unknown-control' });
    expect(await control('approve-next')).toMatchObject({ accepted: true, approved: 'A safe test song', status: { current: { title: 'A safe test song' }, queue: [{ title: 'Second song', approved: false }] } });
    expect(await control('toggle')).toMatchObject({ status: { paused: true } });
    expect(await control('toggle')).toMatchObject({ status: { paused: false } });
    expect(await control('approve-all')).toMatchObject({ approved: 1 });
    expect(await control('skip')).toMatchObject({ skipped: true });
    expect(await control('stop')).toMatchObject({ status: { paused: true } });
    await villageJukebox.stop(test.context);
  });
});
