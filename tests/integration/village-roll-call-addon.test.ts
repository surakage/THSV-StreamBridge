import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AddOnCapabilityBroker } from '../../bridge/core/addon-capability-broker.js';
import { createViewerFoundationIntegration, loadInstalledAddOns } from '../../bridge/core/installed-modules.js';
import { ModuleRegistry } from '../../bridge/core/module-registry.js';
import { installAddOnPackage } from '../../bridge/services/addon-package-manager.js';
import type { NormalizedEvent } from '../../schemas/event.js';
import { silentLogger } from '../helpers.js';

function reward(): NormalizedEvent {
  return {
    schemaVersion: '1.0.0', eventId: 'roll-call-1', eventType: 'reward.redemption', platform: 'twitch',
    source: { adapter: 'test', eventId: 'roll-call-source-1', eventName: 'Reward Redemption' },
    receivedAt: '2026-07-31T12:00:00.000Z', channel: { id: 'channel-1', name: 'Example Channel' },
    user: { id: 'viewer-1', name: 'viewer_one', displayName: 'Viewer One', actorType: 'human', roles: [] },
    payload: { rewardId: 'daily-check-in', redemptionId: 'redemption-1', rewardTitle: 'Daily Check-In', verifiedTransport: true, supportedOperations: [] },
    metadata: { simulated: false },
  };
}

describe('Village Roll Call installed add-on', () => {
  let addOnsRoot: string;
  let stateRoot: string;
  beforeEach(async () => {
    addOnsRoot = await mkdtemp(join(tmpdir(), 'thsv-roll-call-addons-'));
    stateRoot = await mkdtemp(join(tmpdir(), 'thsv-roll-call-state-'));
  });
  afterEach(async () => {
    await rm(addOnsRoot, { recursive: true, force: true });
    await rm(stateRoot, { recursive: true, force: true });
  });

  it('loads through the verified package path and handles the configured reward', async () => {
    const installed = await installAddOnPackage('addons/village-roll-call', addOnsRoot, true);
    await mkdir(join(stateRoot, 'thsv.village-roll-call'), { recursive: true });
    await writeFile(join(stateRoot, 'thsv.village-roll-call', 'settings.json'), JSON.stringify({
      enabled: true, rewardId: 'daily-check-in', timeZone: 'America/Chicago',
    }));
    const modules = await loadInstalledAddOns(addOnsRoot, silentLogger, stateRoot);
    const module = modules.find((candidate) => candidate.manifest.moduleId === 'thsv.village-roll-call');
    const foundation = await createViewerFoundationIntegration(stateRoot);
    if (!module) throw new Error('Village Roll Call must load through the installed add-on path.');
    const overlays: Array<{ topic: string; payload: Record<string, unknown> }> = [];
    const chats: string[] = [];
    const broker = new AddOnCapabilityBroker(silentLogger, stateRoot, {
      publishOverlay: async (_moduleId, topic, payload) => { overlays.push({ topic, payload }); },
      routeOutboundMessage: async (request) => {
        chats.push(request.message);
        return [{ platform: 'twitch', accepted: true, parts: 1 }];
      },
    });
    const registry = new ModuleRegistry([foundation, {
      ...module,
      capabilityGrant: { moduleId: module.manifest.moduleId, permissions: installed.descriptor.permissions, approvedActionIds: [] },
    }], silentLogger, 5_000, broker);
    await registry.start();
    await registry.publish(reward());
    const state = JSON.parse(await readFile(join(stateRoot, 'thsv.village-roll-call', 'runtime-state.json'), 'utf8')) as {
      entries: Array<{ userId: string; count: number }>;
    };
    expect(state.entries).toEqual([expect.objectContaining({ userId: 'twitch:viewer-1', count: 1 })]);
    expect(chats).toHaveLength(1);
    expect(overlays.at(-1)?.topic).toBe('thsv.village-roll-call.card.show');
    await registry.stop();
  });
});
