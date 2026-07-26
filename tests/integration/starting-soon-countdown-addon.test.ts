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

function control(action: string, payload: Record<string, unknown> = {}): NormalizedEvent {
  return {
    schemaVersion: '1.0.0', eventId: `countdown-${action}-1`, eventType: 'addon.thsv.starting-soon-countdown.control', platform: 'system',
    source: { adapter: 'streamerbot-addon-relay', eventId: `relay-${action}-1`, eventName: `THSV Addon - Starting Soon Countdown - ${action}` },
    receivedAt: '2026-07-26T12:00:00.000Z', channel: { id: 'system', name: 'system' }, payload: { action, ...payload }, metadata: { simulated: false },
  };
}

describe('Starting Soon Countdown installed add-on', () => {
  let addOnsRoot: string; let stateRoot: string;
  beforeEach(async () => { addOnsRoot = await mkdtemp(join(tmpdir(), 'thsv-countdown-addons-')); stateRoot = await mkdtemp(join(tmpdir(), 'thsv-countdown-state-')); });
  afterEach(async () => { await rm(addOnsRoot, { recursive: true, force: true }); await rm(stateRoot, { recursive: true, force: true }); });

  it('loads through the package path and applies explicit start, pause, and complete controls', async () => {
    const installed = await installAddOnPackage('addons/starting-soon-countdown', addOnsRoot, true);
    const modules = await loadInstalledAddOns(addOnsRoot, silentLogger, stateRoot);
    const module = modules.find((candidate) => candidate.manifest.moduleId === 'thsv.starting-soon-countdown');
    if (!module) throw new Error('Starting Soon Countdown must load through the installed add-on path.');
    const overlays: Array<{ topic: string; payload: Record<string, unknown> }> = [];
    const broker = new AddOnCapabilityBroker(silentLogger, stateRoot, { publishOverlay: async (_moduleId, topic, payload) => { overlays.push({ topic, payload }); } });
    const registry = new ModuleRegistry([{ ...module, capabilityGrant: { moduleId: module.manifest.moduleId, permissions: installed.descriptor.permissions, approvedActionIds: [] } }], silentLogger, 5_000, broker);
    const statePath = join(stateRoot, 'thsv.starting-soon-countdown', 'runtime-state.json');
    await registry.start();
    await registry.publish(control('set-and-start', { seconds: 90 }));
    let state = JSON.parse(await readFile(statePath, 'utf8')) as { remainingSeconds: number; maximumSeconds: number; running: boolean; visible: boolean };
    expect(state).toMatchObject({ remainingSeconds: 90, maximumSeconds: 90, running: true, visible: true });
    await registry.publish(control('pause'));
    state = JSON.parse(await readFile(statePath, 'utf8')) as typeof state;
    expect(state.running).toBe(false);
    await registry.publish(control('complete'));
    expect(overlays.at(-1)).toMatchObject({ topic: 'thsv.starting-soon-countdown.timer.update', payload: { completed: true, playCompletionTone: true, completionMessage: 'The stream is starting now!' } });
    await registry.stop();
  });
});
