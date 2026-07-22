import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installAddOnPackage } from '../../bridge/services/addon-package-manager.js';
import { loadInstalledAddOns } from '../../bridge/core/installed-modules.js';
import { AddOnCapabilityBroker } from '../../bridge/core/addon-capability-broker.js';
import { ModuleRegistry } from '../../bridge/core/module-registry.js';
import { silentLogger } from '../helpers.js';
import type { NormalizedEvent } from '../../schemas/event.js';

function command(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    schemaVersion: '1.0.0', eventId: 'command-es-1', eventType: 'chat.message', platform: 'twitch',
    source: { adapter: 'fixture', eventId: 'source-command-es-1', eventName: 'TwitchChatMessage' }, receivedAt: '2026-07-22T12:00:00.000Z',
    channel: { id: 'channel-1', name: 'ExampleChannel' },
    user: { id: 'viewer-1', name: 'viewer', displayName: 'Viewer', actorType: 'human', roles: ['viewer'] },
    payload: { message: '!es hello world' }, metadata: { simulated: false }, ...overrides,
  };
}

describe('User Translate installed add-on', () => {
  let addOnsRoot: string; let stateRoot: string;
  beforeEach(async () => { addOnsRoot = await mkdtemp(join(tmpdir(), 'thsv-translate-addons-')); stateRoot = await mkdtemp(join(tmpdir(), 'thsv-translate-state-')); });
  afterEach(async () => { await rm(addOnsRoot, { recursive: true, force: true }); await rm(stateRoot, { recursive: true, force: true }); });

  it('dispatches one approved request and returns the result only to the originating platform', async () => {
    const installed = await installAddOnPackage('addons/user-translate', addOnsRoot, true);
    const modules = await loadInstalledAddOns(addOnsRoot, silentLogger, stateRoot); const module = modules[0];
    if (module === undefined) throw new Error('User Translate must load.');
    const actions: Array<{ actionId: string; argumentsValue: Record<string, unknown> }> = []; const sends: unknown[] = [];
    const broker = new AddOnCapabilityBroker(silentLogger, stateRoot, {
      runStreamerBotAction: async (actionId, argumentsValue) => { actions.push({ actionId, argumentsValue }); },
      routeOutboundMessage: async (request) => { sends.push(request); return [{ platform: 'twitch', accepted: true, parts: 1 }]; },
    });
    const registry = new ModuleRegistry([{ ...module, capabilityGrant: { moduleId: module.manifest.moduleId, permissions: installed.descriptor.permissions, approvedActionIds: ['a6c9d452-7627-4bc2-b0b3-46735d8aa120'] } }], silentLogger, 5_000, broker);
    await registry.start(); await registry.publish(command());
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ actionId: 'a6c9d452-7627-4bc2-b0b3-46735d8aa120', argumentsValue: { requestId: 'command-es-1', text: 'hello world', sourceLanguage: 'en', targetLanguage: 'es', timeoutSeconds: 8 } });
    expect(actions[0]?.argumentsValue['thsvAddonRelayToken']).toEqual(expect.any(String));
    await registry.publish(command({ eventId: 'translation-1', eventType: 'addon.thsv.user-translate.translation-received', platform: 'system', user: undefined, source: { adapter: 'streamerbot-addon-relay', eventId: 'translation-relay-1', eventName: 'Translate Text' }, payload: { requestId: 'command-es-1', succeeded: true, translatedText: 'hola mundo' } }));
    expect(sends).toEqual([{ message: 'Viewer: (es) hola mundo', routing: 'source', sourcePlatform: 'twitch', overflow: 'split' }]);
    await registry.stop();
  });

  it('does not dispatch or send simulated requests live', async () => {
    const installed = await installAddOnPackage('addons/user-translate', addOnsRoot, true); const [module] = await loadInstalledAddOns(addOnsRoot, silentLogger, stateRoot);
    if (module === undefined) throw new Error('User Translate must load.');
    const actions: unknown[] = []; const sends: unknown[] = [];
    const broker = new AddOnCapabilityBroker(silentLogger, stateRoot, { runStreamerBotAction: async (...args) => { actions.push(args); }, routeOutboundMessage: async (request) => { sends.push(request); return []; } });
    const registry = new ModuleRegistry([{ ...module, capabilityGrant: { moduleId: module.manifest.moduleId, permissions: installed.descriptor.permissions, approvedActionIds: ['a6c9d452-7627-4bc2-b0b3-46735d8aa120'] } }], silentLogger, 5_000, broker);
    await registry.start(); await registry.publish(command({ metadata: { simulated: true } }));
    expect(actions).toHaveLength(0); expect(sends).toHaveLength(0); await registry.stop();
  });
});
