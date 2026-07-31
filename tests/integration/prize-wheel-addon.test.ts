import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AddOnCapabilityBroker } from '../../bridge/core/addon-capability-broker.js';
import { loadInstalledAddOns } from '../../bridge/core/installed-modules.js';
import { ModuleRegistry } from '../../bridge/core/module-registry.js';
import { installAddOnPackage } from '../../bridge/services/addon-package-manager.js';
import type { NormalizedEvent } from '../../schemas/event.js';
import { silentLogger } from '../helpers.js';

function previewCommand(): NormalizedEvent {
  return {
    schemaVersion: '1.0.0', eventId: 'wheel-preview-1', eventType: 'command.received', platform: 'twitch',
    source: { adapter: 'test', eventId: 'wheel-source-1', eventName: 'Command' },
    receivedAt: '2026-07-31T12:00:00.000Z', channel: { id: 'channel-1', name: 'Example Channel' },
    user: { id: 'mod-1', name: 'example_mod', displayName: 'Example Mod', actorType: 'human', roles: ['moderator'] },
    payload: { command: 'spinwheel', invokedAs: 'spinwheel', arguments: [], rawInput: '!spinwheel', prefix: '!', minimumRole: 'moderator', allowBots: false },
    metadata: { simulated: true },
  };
}

describe('Prize Wheel installed add-on', () => {
  let addOnsRoot: string;
  let stateRoot: string;
  beforeEach(async () => {
    addOnsRoot = await mkdtemp(join(tmpdir(), 'thsv-wheel-addons-'));
    stateRoot = await mkdtemp(join(tmpdir(), 'thsv-wheel-state-'));
  });
  afterEach(async () => {
    await rm(addOnsRoot, { recursive: true, force: true });
    await rm(stateRoot, { recursive: true, force: true });
  });

  it('loads through the verified install path and publishes a simulation-safe wheel preview', async () => {
    const installed = await installAddOnPackage('addons/prize-wheel', addOnsRoot, true);
    await mkdir(join(stateRoot, 'thsv.prize-wheel'), { recursive: true });
    await writeFile(join(stateRoot, 'thsv.prize-wheel', 'settings.json'), JSON.stringify({
      enabled: true, spinCommand: 'spinwheel', options: ['Tea', 'Coffee', 'Water'],
    }));
    const modules = await loadInstalledAddOns(addOnsRoot, silentLogger, stateRoot);
    const module = modules.find((candidate) => candidate.manifest.moduleId === 'thsv.prize-wheel');
    if (!module) throw new Error('Prize Wheel must load through the installed add-on path.');
    const overlays: Array<{ topic: string; payload: Record<string, unknown> }> = [];
    const broker = new AddOnCapabilityBroker(silentLogger, stateRoot, {
      publishOverlay: async (_moduleId, topic, payload) => { overlays.push({ topic, payload }); },
      routeOutboundMessage: async () => { throw new Error('Simulated spins must not send chat.'); },
    });
    const registry = new ModuleRegistry([{
      ...module,
      capabilityGrant: { moduleId: module.manifest.moduleId, permissions: installed.descriptor.permissions, approvedActionIds: [] },
    }], silentLogger, 5_000, broker);
    await registry.start();
    await registry.publish(previewCommand());
    expect(overlays).toHaveLength(1);
    expect(overlays[0]?.topic).toBe('thsv.prize-wheel.wheel.spin');
    expect(overlays[0]?.payload['preview']).toBe(true);
    await registry.stop();
  }, 15_000);
});
