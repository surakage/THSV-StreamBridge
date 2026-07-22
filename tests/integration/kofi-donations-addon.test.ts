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

function donation(isPublic = true): NormalizedEvent {
  return {
    schemaVersion: '1.0.0', eventId: 'kofi-relay-message-1', eventType: 'addon.thsv.kofi-donations.donation-received', platform: 'system',
    source: { adapter: 'streamerbot-addon-relay', eventId: 'message-1', eventName: 'KofiDonation' }, receivedAt: '2026-07-22T12:00:01.000Z',
    channel: { name: 'system' }, payload: { amount: '5.00', currency: 'usd', from: 'Public Supporter', isPublic, message: 'Private-safe message', timestamp: '2026-07-22T12:00:00.000Z' },
    metadata: { simulated: false },
  };
}

describe('Ko-fi Donations installed add-on', () => {
  let addOnsRoot: string; let stateRoot: string;
  beforeEach(async () => {
    addOnsRoot = await mkdtemp(join(tmpdir(), 'thsv-kofi-addons-')); stateRoot = await mkdtemp(join(tmpdir(), 'thsv-kofi-state-'));
    await mkdir(join(stateRoot, 'thsv.kofi-donations'), { recursive: true });
    await writeFile(join(stateRoot, 'thsv.kofi-donations', 'settings.json'), JSON.stringify({ enabled: true, channelName: 'Ko-fi', includePublicMessage: true, showPublicSupporterName: true, privateSupporterLabel: 'Anonymous supporter' }));
  });
  afterEach(async () => { await rm(addOnsRoot, { recursive: true, force: true }); await rm(stateRoot, { recursive: true, force: true }); });

  it('publishes public donations with decimal strings and provider identity', async () => {
    const installed = await installAddOnPackage('addons/kofi-donations', addOnsRoot, true); const [module] = await loadInstalledAddOns(addOnsRoot, silentLogger, stateRoot);
    if (module === undefined) throw new Error('Ko-fi Donations must load.');
    const published: NormalizedEvent[] = [];
    const broker = new AddOnCapabilityBroker(silentLogger, stateRoot, { publishProviderEvent: async (event) => { published.push(event); } });
    const registry = new ModuleRegistry([{ ...module, capabilityGrant: { moduleId: module.manifest.moduleId, permissions: installed.descriptor.permissions, approvedActionIds: [] } }], silentLogger, 5_000, broker);
    await registry.start(); await registry.publish(donation());
    expect(published).toHaveLength(1); expect(published[0]?.platform).toBe('kofi'); expect(published[0]?.eventType).toBe('engagement.donation');
    expect(published[0]?.receivedAt).toBe('2026-07-22T12:00:00.000Z'); expect(published[0]?.user?.name).toBe('Public Supporter');
    expect(published[0]?.payload).toEqual({ amount: '5.00', currency: 'USD', message: 'Private-safe message' });
    await registry.stop();
  });

  it('hides private identity and message before publishing', async () => {
    const installed = await installAddOnPackage('addons/kofi-donations', addOnsRoot, true); const [module] = await loadInstalledAddOns(addOnsRoot, silentLogger, stateRoot);
    if (module === undefined) throw new Error('Ko-fi Donations must load.');
    const published: NormalizedEvent[] = []; const broker = new AddOnCapabilityBroker(silentLogger, stateRoot, { publishProviderEvent: async (event) => { published.push(event); } });
    const registry = new ModuleRegistry([{ ...module, capabilityGrant: { moduleId: module.manifest.moduleId, permissions: installed.descriptor.permissions, approvedActionIds: [] } }], silentLogger, 5_000, broker);
    await registry.start(); await registry.publish(donation(false));
    expect(published[0]?.user?.name).toBe('Anonymous supporter'); expect(published[0]?.payload).toEqual({ amount: '5.00', currency: 'USD' }); await registry.stop();
  });
});
