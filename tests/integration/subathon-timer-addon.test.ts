import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installAddOnPackage } from '../../bridge/services/addon-package-manager.js';
import { loadInstalledAddOns } from '../../bridge/core/installed-modules.js';
import { AddOnCapabilityBroker } from '../../bridge/core/addon-capability-broker.js';
import { ModuleRegistry } from '../../bridge/core/module-registry.js';
import { silentLogger } from '../helpers.js';
import type { NormalizedEvent } from '../../schemas/event.js';

function event(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    schemaVersion: '1.0.0', eventId: 'event-1', eventType: 'stream.online', platform: 'twitch',
    source: { adapter: 'fixture', eventId: 'provider-event-1', eventName: 'Fixture' }, receivedAt: '2026-07-22T12:00:00.000Z',
    channel: { id: 'channel-1', name: 'ExampleChannel' }, payload: {}, metadata: { simulated: false }, ...overrides,
  };
}

describe('Subathon Timer installed add-on', () => {
  let addOnsRoot: string;
  let stateRoot: string;

  beforeEach(async () => {
    addOnsRoot = await mkdtemp(join(tmpdir(), 'thsv-subathon-addons-'));
    stateRoot = await mkdtemp(join(tmpdir(), 'thsv-subathon-state-'));
  });
  afterEach(async () => { await rm(addOnsRoot, { recursive: true, force: true }); await rm(stateRoot, { recursive: true, force: true }); });

  it('loads through the public package path, awards events, and accepts bounded local controls', async () => {
    const installed = await installAddOnPackage('addons/subathon-timer', addOnsRoot, true);
    const modules = await loadInstalledAddOns(addOnsRoot, silentLogger, stateRoot);
    const module = modules.find((candidate) => candidate.manifest.moduleId === 'thsv.subathon-timer');
    if (module === undefined) throw new Error('Subathon Timer must load through the installed add-on path.');
    const overlays: Array<{ topic: string; payload: unknown }> = [];
    const broker = new AddOnCapabilityBroker(silentLogger, stateRoot, {
      publishOverlay: async (_moduleId, topic, payload) => { overlays.push({ topic, payload }); },
    });
    const registry = new ModuleRegistry([{ ...module, capabilityGrant: {
      moduleId: module.manifest.moduleId, permissions: installed.descriptor.permissions, approvedActionIds: [],
    } }], silentLogger, 5_000, broker);
    const statePath = join(stateRoot, 'thsv.subathon-timer', 'runtime-state.json');
    await registry.start();
    await registry.publish(event());
    await registry.publish(event({ eventId: 'follow-1', eventType: 'channel.follow', source: { adapter: 'fixture', eventId: 'provider-follow-1', eventName: 'TwitchFollow' } }));
    let state = JSON.parse(await readFile(statePath, 'utf8')) as { remainingSeconds: number; running: boolean };
    expect(state).toMatchObject({ remainingSeconds: 3_630, running: true });
    await registry.publish(event({
      eventId: 'control-add-1', eventType: 'addon.thsv.subathon-timer.control', platform: 'system',
      source: { adapter: 'streamerbot-addon-relay', eventId: 'subathon-add-1', eventName: 'THSV Addon - Subathon Timer - Add Time' },
      payload: { action: 'add-time', seconds: 300 },
    }));
    state = JSON.parse(await readFile(statePath, 'utf8')) as { remainingSeconds: number; running: boolean };
    expect(state.remainingSeconds).toBe(3_930);
    await registry.publish(event({
      eventId: 'control-pause-1', eventType: 'addon.thsv.subathon-timer.control', platform: 'system',
      source: { adapter: 'streamerbot-addon-relay', eventId: 'subathon-pause-1', eventName: 'THSV Addon - Subathon Timer - Pause' },
      payload: { action: 'pause' },
    }));
    state = JSON.parse(await readFile(statePath, 'utf8')) as { remainingSeconds: number; running: boolean };
    expect(state.running).toBe(false);
    expect(overlays.at(-1)).toMatchObject({ topic: 'thsv.subathon-timer.timer.update', payload: { running: false, lastReason: 'manual-pause' } });
    await registry.stop();
  });

  it('resets once per multi-platform live session and pauses only after every platform is offline', async () => {
    const installed = await installAddOnPackage('addons/subathon-timer', addOnsRoot, true);
    const modules = await loadInstalledAddOns(addOnsRoot, silentLogger, stateRoot);
    const module = modules.find((candidate) => candidate.manifest.moduleId === 'thsv.subathon-timer');
    if (module === undefined) throw new Error('Subathon Timer must load through the installed add-on path.');
    const broker = new AddOnCapabilityBroker(silentLogger, stateRoot, { publishOverlay: async () => undefined });
    const registry = new ModuleRegistry([{ ...module, capabilityGrant: {
      moduleId: module.manifest.moduleId, permissions: installed.descriptor.permissions, approvedActionIds: [],
    } }], silentLogger, 5_000, broker);
    const statePath = join(stateRoot, 'thsv.subathon-timer', 'runtime-state.json');
    await registry.start();

    await registry.publish(event());
    await registry.publish(event({
      eventId: 'follow-session-1', eventType: 'channel.follow',
      source: { adapter: 'fixture', eventId: 'provider-follow-session-1', eventName: 'TwitchFollow' },
    }));
    await registry.publish(event({
      eventId: 'youtube-online-1', platform: 'youtube',
      source: { adapter: 'fixture', eventId: 'provider-youtube-online-1', eventName: 'YouTubeBroadcastStarted' },
    }));
    let state = JSON.parse(await readFile(statePath, 'utf8')) as {
      remainingSeconds: number; running: boolean; sessionCount: number; livePlatforms: string[];
    };
    expect(state).toMatchObject({ remainingSeconds: 3_630, running: true, sessionCount: 1 });
    expect(state.livePlatforms).toEqual(expect.arrayContaining(['twitch', 'youtube']));

    await registry.publish(event({
      eventId: 'twitch-offline-1', eventType: 'stream.offline',
      source: { adapter: 'fixture', eventId: 'provider-twitch-offline-1', eventName: 'TwitchStreamOffline' },
    }));
    state = JSON.parse(await readFile(statePath, 'utf8')) as typeof state;
    expect(state).toMatchObject({ running: true, sessionCount: 1, livePlatforms: ['youtube'] });

    await registry.publish(event({
      eventId: 'youtube-offline-1', eventType: 'stream.offline', platform: 'youtube',
      source: { adapter: 'fixture', eventId: 'provider-youtube-offline-1', eventName: 'YouTubeBroadcastEnded' },
    }));
    state = JSON.parse(await readFile(statePath, 'utf8')) as typeof state;
    expect(state).toMatchObject({ running: false, sessionCount: 1, livePlatforms: [] });
    await registry.stop();
  });
});
