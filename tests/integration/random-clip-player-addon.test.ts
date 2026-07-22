import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installAddOnPackage } from '../../bridge/services/addon-package-manager.js';
import { loadInstalledAddOns } from '../../bridge/core/installed-modules.js';
import { AddOnCapabilityBroker } from '../../bridge/core/addon-capability-broker.js';
import { ModuleRegistry } from '../../bridge/core/module-registry.js';
import { silentLogger } from '../helpers.js';
import type { NormalizedEvent } from '../../schemas/event.js';
import type { AddOnOverlayLifecycleV2 } from '../../bridge/contracts/v2/addon-capability.js';
// @ts-expect-error executable add-on migration is intentionally plain JavaScript
import { migrate as migrateRandomClipSettings } from '../../addons/random-clip-player/migrations/001-interval-to-pause.mjs';

describe('Random Clip Player add-on package', () => {
  let addOnsRoot: string;
  let stateRoot: string;

  beforeEach(async () => {
    addOnsRoot = await mkdtemp(join(tmpdir(), 'thsv-random-clip-player-addons-'));
    stateRoot = await mkdtemp(join(tmpdir(), 'thsv-random-clip-player-state-'));
  });

  afterEach(async () => {
    await rm(addOnsRoot, { recursive: true, force: true });
    await rm(stateRoot, { recursive: true, force: true });
  });

  it('installs, loads, starts, and reacts to its own relay events without any framework code changes', async () => {
    const installed = await installAddOnPackage('addons/random-clip-player', addOnsRoot, true);
    expect(installed.descriptor.manifest.moduleId).toBe('thsv.random-clip-player');

    const modules = await loadInstalledAddOns(addOnsRoot, silentLogger, stateRoot);
    const module = modules.find((candidate) => candidate.manifest.moduleId === 'thsv.random-clip-player');
    if (module === undefined) throw new Error('The add-on must load through the exact same path a real install uses.');
    expect(module.manifest.eventSubscriptions).toEqual(['addon.thsv.random-clip-player.clips-received', 'addon.thsv.random-clip-player.clip-download-received', 'addon.thsv.random-clip-player.control']);
    expect(module.settings).toEqual({ secondsBetweenClips: 5, clipCount: 20, minDurationSeconds: 5, maxDurationSeconds: 60, muted: false, volume: 1 });

    const publishedTopics: Array<{ topic: string; payload: unknown }> = [];
    const dispatchedActions: Array<{ actionId: string; args: unknown }> = [];
    const broker = new AddOnCapabilityBroker(silentLogger, stateRoot, {
      runStreamerBotAction: async (actionId, args) => { dispatchedActions.push({ actionId, args }); },
      publishOverlay: async (_moduleId, topic, payload) => { publishedTopics.push({ topic, payload }); },
      subscribeOverlayLifecycle: () => () => undefined,
    });
    const grantedModule = { ...module, capabilityGrant: { moduleId: 'thsv.random-clip-player', permissions: installed.descriptor.permissions, approvedActionIds: ['f89e397b-7106-5101-a620-b0f5da4facf9', 'ad3cf90f-b320-5ae2-a493-485a5485e0ce'] } };
    const registry = new ModuleRegistry([grantedModule], silentLogger, 5_000, broker);
    await registry.start();
    expect(registry.statuses()).toEqual([expect.objectContaining({ moduleId: 'thsv.random-clip-player', status: 'healthy' })]);

    // start() should have already requested the clip list, since no clips are cached yet.
    expect(dispatchedActions).toHaveLength(1);
    expect(dispatchedActions[0]).toMatchObject({ actionId: 'f89e397b-7106-5101-a620-b0f5da4facf9', args: { clipCount: 20 } });

    const clipsEvent: NormalizedEvent = {
      schemaVersion: '1.0.0', eventId: 'test-clips-1', eventType: 'addon.thsv.random-clip-player.clips-received', platform: 'system',
      source: { adapter: 'streamerbot-addon-relay', eventId: 'relay-1', eventName: 'THSV Addon - Random Clip Player - Get Clips' },
      receivedAt: new Date().toISOString(), channel: { name: 'system' },
      payload: { clips: [{ id: 'ClipOne', title: 'A great play', durationSeconds: 12, thumbnailUrl: 'https://example.com/thumb.jpg' }] },
      metadata: { simulated: true },
    };
    await registry.publish(clipsEvent);
    expect(dispatchedActions).toHaveLength(2);
    expect(dispatchedActions[1]).toMatchObject({ actionId: 'ad3cf90f-b320-5ae2-a493-485a5485e0ce', args: { clipId: 'ClipOne' } });

    await registry.publish({
      ...clipsEvent, eventId: 'test-download-stale', eventType: 'addon.thsv.random-clip-player.clip-download-received',
      payload: { clipId: 'DifferentClip', landscapeUrl: 'https://example.com/stale.mp4' },
    });
    expect(broker.diagnostics()['scheduledTasks']).toBe(1); // A stale response cannot cancel the active retry.

    const downloadEvent: NormalizedEvent = {
      schemaVersion: '1.0.0', eventId: 'test-download-1', eventType: 'addon.thsv.random-clip-player.clip-download-received', platform: 'system',
      source: { adapter: 'streamerbot-addon-relay', eventId: 'relay-2', eventName: 'THSV Addon - Random Clip Player - Get Clip Download' },
      receivedAt: new Date().toISOString(), channel: { name: 'system' },
      payload: { clipId: 'ClipOne', landscapeUrl: 'https://example.com/clip.mp4', portraitUrl: '' },
      metadata: { simulated: true },
    };
    await registry.publish(downloadEvent);
    expect(publishedTopics).toHaveLength(1);
    expect(publishedTopics[0]).toMatchObject({ topic: 'thsv.random-clip-player.media.play', payload: { url: 'https://example.com/clip.mp4', title: 'A great play', posterUrl: 'https://example.com/thumb.jpg', durationMs: 12_000, muted: false, volume: 1 } });

    await registry.publish({
      ...clipsEvent, eventId: 'test-control-disable', eventType: 'addon.thsv.random-clip-player.control', payload: { enabled: false },
    });
    expect(publishedTopics[1]).toMatchObject({ topic: 'thsv.random-clip-player.media.stop' });
    const actionsWhileDisabled = dispatchedActions.length;
    await registry.publish(downloadEvent);
    expect(dispatchedActions).toHaveLength(actionsWhileDisabled);

    await registry.publish({
      ...clipsEvent, eventId: 'test-control-enable', eventType: 'addon.thsv.random-clip-player.control', payload: { enabled: true },
    });
    expect(dispatchedActions).toHaveLength(actionsWhileDisabled + 1);
    expect(dispatchedActions.at(-1)).toMatchObject({ actionId: 'ad3cf90f-b320-5ae2-a493-485a5485e0ce' });

    await registry.stop();
  });

  it('adds the fixed four-second fade buffer, then refreshes after every clip in the pool has played once', async () => {
    const installed = await installAddOnPackage('addons/random-clip-player', addOnsRoot, true);
    // A short, schema-valid pause (minimum is 1 second) keeps this test's real wall-clock wait brief.
    await mkdir(join(stateRoot, 'thsv.random-clip-player'), { recursive: true });
    await writeFile(join(stateRoot, 'thsv.random-clip-player', 'settings.json'), JSON.stringify({ secondsBetweenClips: 1 }));
    const modules = await loadInstalledAddOns(addOnsRoot, silentLogger, stateRoot);
    const module = modules.find((candidate) => candidate.manifest.moduleId === 'thsv.random-clip-player');
    if (module === undefined) throw new Error('The add-on must load through the exact same path a real install uses.');
    expect(module.settings).toMatchObject({ secondsBetweenClips: 1 });

    const dispatchedActions: Array<{ actionId: string; args: unknown }> = [];
    const publishedTopics: Array<{ topic: string; payload: Record<string, unknown> }> = [];
    let lifecycleListener: ((event: AddOnOverlayLifecycleV2) => void) | undefined;
    const broker = new AddOnCapabilityBroker(silentLogger, stateRoot, {
      runStreamerBotAction: async (actionId, args) => { dispatchedActions.push({ actionId, args }); },
      publishOverlay: async (_moduleId, topic, payload) => { publishedTopics.push({ topic, payload }); },
      subscribeOverlayLifecycle: (_moduleId, listener) => { lifecycleListener = listener; return () => undefined; },
    });
    const grantedModule = { ...module, capabilityGrant: { moduleId: 'thsv.random-clip-player', permissions: installed.descriptor.permissions, approvedActionIds: ['f89e397b-7106-5101-a620-b0f5da4facf9', 'ad3cf90f-b320-5ae2-a493-485a5485e0ce'] } };
    const registry = new ModuleRegistry([grantedModule], silentLogger, 5_000, broker);

    await registry.start();
    expect(dispatchedActions).toHaveLength(1); // Get Clips, immediately on start -- no cache yet.

    const twoClips: NormalizedEvent = {
      schemaVersion: '1.0.0', eventId: 'test-clips-2', eventType: 'addon.thsv.random-clip-player.clips-received', platform: 'system',
      source: { adapter: 'streamerbot-addon-relay', eventId: 'relay-1', eventName: 'THSV Addon - Random Clip Player - Get Clips' },
      receivedAt: new Date().toISOString(), channel: { name: 'system' },
      payload: { clips: [{ id: 'ClipOne', durationSeconds: 10 }, { id: 'ClipTwo', durationSeconds: 10 }] },
      metadata: { simulated: true },
    };
    await registry.publish(twoClips);
    expect(dispatchedActions).toHaveLength(2); // Get Clip Download for whichever clip was picked.
    const firstClipId = (dispatchedActions[1]?.args as { clipId: string }).clipId;

    await registry.publish({
      ...twoClips, eventId: 'test-download-first', eventType: 'addon.thsv.random-clip-player.clip-download-received',
      payload: { clipId: firstClipId, landscapeUrl: 'https://example.com/first.mp4' },
    });
    const firstPlaybackId = publishedTopics[0]?.payload['playbackId'];
    expect(firstPlaybackId).toEqual(expect.any(String));
    expect(broker.diagnostics()['scheduledTasks']).toBe(1); // Overlay-start safety net remains armed after publish.
    lifecycleListener?.({ playbackId: 'irrelevant', phase: 'ended', occurredAt: new Date().toISOString() });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(dispatchedActions).toHaveLength(2); // A stale lifecycle ID cannot advance the active clip.
    expect(broker.diagnostics()['scheduledTasks']).toBe(1);

    lifecycleListener?.({ playbackId: String(firstPlaybackId), phase: 'started', occurredAt: new Date().toISOString() });
    await expect.poll(() => broker.diagnostics()['scheduledTasks']).toBe(0);
    lifecycleListener?.({ playbackId: String(firstPlaybackId), phase: 'ended', occurredAt: new Date().toISOString() });
    const firstEndedAt = Date.now();
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(dispatchedActions).toHaveLength(2); // Not immediate: still waiting out the configured pause.

    await expect.poll(() => dispatchedActions.length, { timeout: 7_000 }).toBe(3);
    expect(Date.now() - firstEndedAt).toBeGreaterThanOrEqual(4_900); // 1 configured second + hidden 4-second fade buffer.
    expect(dispatchedActions[2]).toMatchObject({ actionId: 'ad3cf90f-b320-5ae2-a493-485a5485e0ce' });
    const secondClipId = (dispatchedActions[2]?.args as { clipId: string }).clipId;
    expect(secondClipId).not.toBe(firstClipId); // No-repeat: the other clip, not the one just played.

    await registry.publish({
      ...twoClips, eventId: 'test-download-second', eventType: 'addon.thsv.random-clip-player.clip-download-received',
      payload: { clipId: secondClipId, landscapeUrl: 'https://example.com/second.mp4' },
    });
    const secondPlaybackId = publishedTopics[1]?.payload['playbackId'];
    expect(secondPlaybackId).toEqual(expect.any(String));
    // Both clips have now been played once -- the pool is exhausted, so ending playback again
    // should refresh the clip list instead of silently replaying an already-seen clip.
    lifecycleListener?.({ playbackId: String(secondPlaybackId), phase: 'ended', occurredAt: new Date().toISOString() });
    await expect.poll(() => dispatchedActions.length, { timeout: 7_000 }).toBe(4);
    expect(dispatchedActions[3]).toMatchObject({ actionId: 'f89e397b-7106-5101-a620-b0f5da4facf9' });

    await registry.stop();
  }, 20_000);

  it('delivers a creator-saved settings.json to the running add-on context, validated against its own schema', async () => {
    await installAddOnPackage('addons/random-clip-player', addOnsRoot, true);
    await mkdir(join(stateRoot, 'thsv.random-clip-player'), { recursive: true });
    await writeFile(join(stateRoot, 'thsv.random-clip-player', 'settings.json'), JSON.stringify({ secondsBetweenClips: 3, clipCount: 5 }));
    const modules = await loadInstalledAddOns(addOnsRoot, silentLogger, stateRoot);
    const module = modules.find((candidate) => candidate.manifest.moduleId === 'thsv.random-clip-player');
    if (module === undefined) throw new Error('The add-on must load through the exact same path a real install uses.');
    // Unset properties still fall back to the schema's own defaults, exactly like the wizard's settings form does.
    expect(module.settings).toEqual({ secondsBetweenClips: 3, clipCount: 5, minDurationSeconds: 5, maxDurationSeconds: 60, muted: false, volume: 1 });
  });

  it('preserves the old minute interval as seconds when upgrading saved settings', async () => {
    await installAddOnPackage('addons/random-clip-player', addOnsRoot, true);
    await mkdir(join(stateRoot, 'thsv.random-clip-player'), { recursive: true });
    // The real package manager invokes this declared migration before activating the new code.
    await writeFile(join(stateRoot, 'thsv.random-clip-player', 'settings.json'), JSON.stringify({ intervalMinutes: 10, clipCount: 7 }));
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call -- executable migration is loaded as intentionally untyped package JavaScript
    await migrateRandomClipSettings({ storageRoot: join(stateRoot, 'thsv.random-clip-player') });
    const modules = await loadInstalledAddOns(addOnsRoot, silentLogger, stateRoot);
    const module = modules.find((candidate) => candidate.manifest.moduleId === 'thsv.random-clip-player');
    if (module === undefined) throw new Error('Migrated settings must not prevent the add-on from loading.');
    expect(module.settings).toEqual({ secondsBetweenClips: 600, clipCount: 7, minDurationSeconds: 5, maxDurationSeconds: 60, muted: false, volume: 1 });
  });
});
