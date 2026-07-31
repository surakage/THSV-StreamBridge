import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AddOnCapabilityBroker } from '../../bridge/core/addon-capability-broker.js';
import { loadInstalledAddOns } from '../../bridge/core/installed-modules.js';
import { ModuleRegistry } from '../../bridge/core/module-registry.js';
import { installAddOnPackage } from '../../bridge/services/addon-package-manager.js';
import type { NormalizedEvent } from '../../schemas/event.js';
import { silentLogger } from '../helpers.js';

function follow(platform: string): NormalizedEvent {
  return {
    schemaVersion: '1.0.0', eventId: `${platform}-follow-1`, eventType: 'channel.follow', platform,
    source: { adapter: 'test', eventId: `${platform}-source-follow-1`, eventName: 'Follow' },
    receivedAt: '2026-07-31T12:00:00.000Z', channel: { id: 'channel-1', name: 'Example Channel' },
    user: { id: 'viewer-1', name: 'example_viewer', displayName: 'Example Viewer', actorType: 'human', roles: [] },
    payload: {}, metadata: { simulated: false },
  };
}

describe('Stream Labels installed add-on', () => {
  let addOnsRoot: string;
  let stateRoot: string;
  beforeEach(async () => {
    addOnsRoot = await mkdtemp(join(tmpdir(), 'thsv-stream-label-addons-'));
    stateRoot = await mkdtemp(join(tmpdir(), 'thsv-stream-label-state-'));
  });
  afterEach(async () => {
    await rm(addOnsRoot, { recursive: true, force: true });
    await rm(stateRoot, { recursive: true, force: true });
  });

  it('loads through the verified package path and receives normalized platform events', async () => {
    const installed = await installAddOnPackage('addons/stream-labels', addOnsRoot, true);
    const modules = await loadInstalledAddOns(addOnsRoot, silentLogger, stateRoot);
    const module = modules.find((candidate) => candidate.manifest.moduleId === 'thsv.stream-labels');
    if (!module) throw new Error('Stream Labels must load through the installed add-on path.');
    const overlays: Array<{ topic: string; payload: Record<string, unknown> }> = [];
    const broker = new AddOnCapabilityBroker(silentLogger, stateRoot, {
      publishOverlay: async (_moduleId, topic, payload) => { overlays.push({ topic, payload }); },
    });
    const registry = new ModuleRegistry([{
      ...module,
      capabilityGrant: { moduleId: module.manifest.moduleId, permissions: installed.descriptor.permissions, approvedActionIds: [] },
    }], silentLogger, 5_000, broker);
    await registry.start();
    await registry.publish(follow('youtube'));
    const state = JSON.parse(await readFile(join(stateRoot, 'thsv.stream-labels', 'runtime-state.json'), 'utf8')) as {
      labels: Record<string, { value: string; platform: string }>;
    };
    expect(state.labels.follower).toMatchObject({ value: 'Example Viewer', platform: 'youtube' });
    expect(overlays.at(-1)).toMatchObject({ topic: 'thsv.stream-labels.labels.update', payload: { labels: { follower: { value: 'Example Viewer' } } } });
    await registry.stop();
  }, 15_000);
});
