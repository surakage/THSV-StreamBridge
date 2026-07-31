import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-assignment -- executable add-on entrypoints are intentionally plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import viewerFoundation from '../../addons/viewer-foundation/dist/index.js';
import { AddOnCapabilityBroker } from '../../bridge/core/addon-capability-broker.js';
import { loadInstalledAddOns } from '../../bridge/core/installed-modules.js';
import { ModuleRegistry } from '../../bridge/core/module-registry.js';
import { installAddOnPackage } from '../../bridge/services/addon-package-manager.js';
import type { NormalizedEvent } from '../../schemas/event.js';
import { silentLogger } from '../helpers.js';

const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

function entryCommand(): NormalizedEvent {
  return {
    schemaVersion: '1.0.0', eventId: 'draw-entry-1', eventType: 'command.received', platform: 'twitch',
    source: { adapter: 'fixture', eventId: 'draw-entry-source-1', eventName: 'Command' }, receivedAt: '2026-07-31T12:00:00.000Z',
    channel: { id: 'channel-1', name: 'Example Channel' }, user: { id: '123456', name: 'alex', displayName: 'Alex', actorType: 'human', roles: [] },
    payload: { command: 'enter', invokedAs: 'enter', arguments: [], rawInput: '!enter', prefix: '!', minimumRole: 'viewer', allowBots: false }, metadata: { simulated: false },
  };
}

describe('Village Draw installed add-on', () => {
  it('loads through package verification, shares Viewer Foundation identity, and exposes authenticated host controls', async () => {
    const addOnsRoot = await mkdtemp(join(tmpdir(), 'thsv-draw-addons-')); const stateRoot = await mkdtemp(join(tmpdir(), 'thsv-draw-state-')); temporary.push(addOnsRoot, stateRoot);
    const installed = await installAddOnPackage('addons/village-draw', addOnsRoot, true);
    await mkdir(join(stateRoot, 'thsv.village-draw'), { recursive: true });
    await writeFile(join(stateRoot, 'thsv.village-draw', 'settings.json'), JSON.stringify({ enabled: true, entryMode: 'free-single', giveawayName: 'Test Draw', prizeItem: 'Test Prize', announcementPlatforms: ['twitch'] }));
    const loaded = await loadInstalledAddOns(addOnsRoot, silentLogger, stateRoot); const draw = loaded.find((candidate) => candidate.manifest.moduleId === 'thsv.village-draw');
    if (!draw) throw new Error('Village Draw must load through the verified installed add-on path.');
    const overlays: string[] = []; const messages: string[] = [];
    const broker = new AddOnCapabilityBroker(silentLogger, stateRoot, {
      publishOverlay: async (_moduleId, topic) => { overlays.push(topic); },
      routeOutboundMessage: async (request) => { messages.push(request.message); return [{ platform: request.sourcePlatform ?? request.selectedPlatforms?.[0] ?? 'twitch', accepted: true, parts: 1 }]; },
    });
    const foundation = { ...viewerFoundation, settings: { enabled: true, accountLinks: ['alex|twitch|123456'] }, capabilityGrant: { moduleId: 'thsv.viewer-foundation', permissions: ['events.subscribe', 'state.private', 'viewer.foundation.provide'] as const, approvedActionIds: [] } };
    const registry = new ModuleRegistry([{ ...draw, capabilityGrant: { moduleId: draw.manifest.moduleId, permissions: installed.descriptor.permissions, approvedActionIds: [] } }, foundation], silentLogger, 5_000, broker);
    await registry.start();
    await expect(registry.administerVillageDraw({ operation: 'open', approvedByCreator: true })).resolves.toMatchObject({ status: 'open', entrantCount: 0 });
    await registry.publish(entryCommand());
    expect(registry.statuses()).toEqual(expect.arrayContaining([expect.objectContaining({ moduleId: 'thsv.village-draw', status: 'healthy' })]));
    await expect(registry.administerVillageDraw({ operation: 'close', approvedByCreator: true })).resolves.toMatchObject({ status: 'closed', entrantCount: 1, totalTickets: 1 });
    await expect(registry.administerVillageDraw({ operation: 'draw', approvedByCreator: true })).resolves.toMatchObject({ status: 'drawn', winner: 'Alex' });
    await expect(registry.administerVillageDraw({ operation: 'confirm', approvedByCreator: true })).resolves.toMatchObject({ status: 'confirmed', historyCount: 1 });
    expect(overlays).toEqual(['thsv.village-draw.card.show', 'thsv.village-draw.card.show']); expect(messages.some((message) => message.includes('Alex'))).toBe(true);
    await registry.stop();
  });
});
