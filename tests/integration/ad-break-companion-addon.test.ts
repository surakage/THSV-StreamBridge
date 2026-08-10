import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installAddOnPackage } from '../../bridge/services/addon-package-manager.js';
import { loadInstalledAddOns } from '../../bridge/core/installed-modules.js';
import { AddOnCapabilityBroker } from '../../bridge/core/addon-capability-broker.js';
import { ModuleRegistry } from '../../bridge/core/module-registry.js';
import { silentLogger } from '../helpers.js';
import type { JsonValue, NormalizedEvent } from '../../schemas/event.js';

function relay(eventType: string, payload: Record<string, JsonValue>, simulated = false): NormalizedEvent {
  const stamp = String(Date.now());
  return {
    schemaVersion: '1.0.0', eventId: `ad-break-${stamp}-${eventType}`, eventType, platform: 'system',
    source: { adapter: 'streamerbot-addon-relay', eventId: `relay-${stamp}`, eventName: eventType.endsWith('.started') ? 'TwitchAdRun' : 'TwitchUpcomingAd' },
    receivedAt: new Date().toISOString(), channel: { id: 'system', name: 'system' }, payload, metadata: { simulated },
  };
}

describe('Ad Break Companion installed add-on', () => {
  let addOnsRoot: string; let stateRoot: string;
  beforeEach(async () => { addOnsRoot = await mkdtemp(join(tmpdir(), 'thsv-ad-break-addons-')); stateRoot = await mkdtemp(join(tmpdir(), 'thsv-ad-break-state-')); });
  afterEach(async () => { await rm(addOnsRoot, { recursive: true, force: true }); await rm(stateRoot, { recursive: true, force: true }); });

  it('loads through the package boundary and transitions from upcoming to active without controlling the provider', async () => {
    const installed = await installAddOnPackage('addons/ad-break-companion', addOnsRoot, true);
    const modules = await loadInstalledAddOns(addOnsRoot, silentLogger, stateRoot);
    const module = modules.find((candidate) => candidate.manifest.moduleId === 'thsv.ad-break-companion');
    if (!module) throw new Error('Ad Break Companion must load through the installed add-on path.');
    const overlays: Array<{ topic: string; payload: Record<string, unknown> }> = [];
    const broker = new AddOnCapabilityBroker(silentLogger, stateRoot, { publishOverlay: async (_moduleId, topic, payload) => { overlays.push({ topic, payload }); } });
    const registry = new ModuleRegistry([{ ...module, capabilityGrant: { moduleId: module.manifest.moduleId, permissions: installed.descriptor.permissions, approvedActionIds: [] } }], silentLogger, 5_000, broker);
    await registry.start();

    const nextAdAt = new Date(Date.now() + 60_000).toISOString();
    await registry.publish(relay('addon.thsv.ad-break-companion.upcoming', { minutes: 1, adLength: 90, snoozesLeft: 3, nextAdAt }));
    expect(overlays.at(-1)).toMatchObject({ topic: 'thsv.ad-break-companion.timer.update', payload: { variant: 'ad-break', phase: 'scheduled', badgeText: 'UPCOMING' } });

    await registry.publish(relay('addon.thsv.ad-break-companion.started', { adLength: 90, adLengthMs: 90_000, adScheduled: true }));
    expect(overlays.at(-1)).toMatchObject({ topic: 'thsv.ad-break-companion.timer.update', payload: { variant: 'ad-break', phase: 'active', remainingSeconds: 90, badgeText: 'IN PROGRESS' } });

    await registry.publish(relay('addon.thsv.ad-break-companion.control', { action: 'preview-active', seconds: 90 }, true));
    expect(overlays.at(-1)).toMatchObject({ topic: 'thsv.ad-break-companion.timer.update', payload: { variant: 'ad-break', phase: 'active', remainingSeconds: 90, badgeText: 'IN PROGRESS' } });
    const state = JSON.parse(await readFile(join(stateRoot, 'thsv.ad-break-companion', 'runtime-state.json'), 'utf8')) as Record<string, unknown>;
    expect(state).toMatchObject({ phase: 'active', adLengthSeconds: 90 });
    await registry.stop();
  });

  it('clears persisted timing and remains hidden when disabled', async () => {
    await installAddOnPackage('addons/ad-break-companion', addOnsRoot, true);
    const settingsDirectory = join(stateRoot, 'thsv.ad-break-companion');
    await mkdir(settingsDirectory, { recursive: true });
    await writeFile(join(settingsDirectory, 'settings.json'), JSON.stringify({ enabled: false }), 'utf8');
    await writeFile(join(settingsDirectory, 'runtime-state.json'), JSON.stringify({
      phase: 'active', targetAt: Date.now() + 90_000, expiresAt: Date.now() + 90_000,
      maximumSeconds: 90, adLengthSeconds: 90, snoozesLeft: 0, simulated: false, updatedAt: Date.now(),
    }), 'utf8');
    const modules = await loadInstalledAddOns(addOnsRoot, silentLogger, stateRoot);
    const module = modules.find((candidate) => candidate.manifest.moduleId === 'thsv.ad-break-companion');
    if (!module) throw new Error('Ad Break Companion must load through the installed add-on path.');
    const overlays: Array<{ topic: string; payload: Record<string, unknown> }> = [];
    const broker = new AddOnCapabilityBroker(silentLogger, stateRoot, { publishOverlay: async (_moduleId, topic, payload) => { overlays.push({ topic, payload }); } });
    const registry = new ModuleRegistry([{ ...module, capabilityGrant: { moduleId: module.manifest.moduleId, permissions: ['events.subscribe', 'overlay.publish', 'schedule.bounded', 'state.private'], approvedActionIds: [] } }], silentLogger, 5_000, broker);
    await registry.start();
    expect(overlays.at(-1)).toMatchObject({ topic: 'thsv.ad-break-companion.timer.hide' });
    const state = JSON.parse(await readFile(join(settingsDirectory, 'runtime-state.json'), 'utf8')) as Record<string, unknown>;
    expect(state).toMatchObject({ phase: 'idle', targetAt: 0, expiresAt: 0 });
    await registry.publish(relay('addon.thsv.ad-break-companion.started', { adLength: 90, adLengthMs: 90_000, adScheduled: true }));
    expect(overlays.at(-1)).toMatchObject({ topic: 'thsv.ad-break-companion.timer.hide' });
    await registry.stop();
  });
});
