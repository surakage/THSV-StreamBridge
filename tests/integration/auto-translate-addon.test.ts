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

function chat(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return { schemaVersion: '1.0.0', eventId: 'auto-chat-1', eventType: 'chat.message', platform: 'twitch', source: { adapter: 'fixture', eventId: 'source-auto-chat-1', eventName: 'TwitchChatMessage' }, receivedAt: new Date().toISOString(), channel: { id: 'channel-1', name: 'Channel' }, user: { id: 'viewer-1', name: 'spanishviewer', displayName: 'Spanish Viewer', actorType: 'human', roles: ['viewer'] }, payload: { message: 'hola mundo' }, metadata: { simulated: false }, ...overrides };
}

describe('Auto Translate installed add-on', () => {
  let addOnsRoot: string; let stateRoot: string;
  beforeEach(async () => { addOnsRoot = await mkdtemp(join(tmpdir(), 'thsv-auto-translate-addons-')); stateRoot = await mkdtemp(join(tmpdir(), 'thsv-auto-translate-state-')); });
  afterEach(async () => { await rm(addOnsRoot, { recursive: true, force: true }); await rm(stateRoot, { recursive: true, force: true }); });

  it('dispatches allowlisted public chat and returns the translation only to its source platform', async () => {
    const installed = await installAddOnPackage('addons/auto-translate', addOnsRoot, true);
    await mkdir(join(stateRoot, 'thsv.auto-translate'), { recursive: true });
    await writeFile(join(stateRoot, 'thsv.auto-translate', 'settings.json'), JSON.stringify({ enabled: true, audienceMode: 'allowlist-only', allowedNames: ['spanishviewer'], sourceLanguage: 'es', targetLanguage: 'en' }));
    const [module] = await loadInstalledAddOns(addOnsRoot, silentLogger, stateRoot); if (module === undefined) throw new Error('Auto Translate must load.');
    const actions: Array<{ actionId: string; args: Record<string, unknown> }> = []; const sends: unknown[] = [];
    const broker = new AddOnCapabilityBroker(silentLogger, stateRoot, { runStreamerBotAction: async (actionId, args) => { actions.push({ actionId, args }); }, routeOutboundMessage: async (request) => { sends.push(request); return [{ platform: 'twitch', accepted: true, parts: 1 }]; } });
    const registry = new ModuleRegistry([{ ...module, capabilityGrant: { moduleId: module.manifest.moduleId, permissions: installed.descriptor.permissions, approvedActionIds: ['b31de9cf-0d5d-4ba1-a63e-f9ffde20b27d'] } }], silentLogger, 5_000, broker);
    await registry.start(); await registry.publish(chat());
    expect(actions).toHaveLength(1); expect(actions[0]).toMatchObject({ actionId: 'b31de9cf-0d5d-4ba1-a63e-f9ffde20b27d', args: { requestId: 'auto-chat-1', text: 'hola mundo', sourceLanguage: 'es', targetLanguage: 'en', timeoutSeconds: 8 } });
    await registry.publish(chat({ eventId: 'auto-result-1', eventType: 'addon.thsv.auto-translate.translation-received', platform: 'system', user: undefined, source: { adapter: 'streamerbot-addon-relay', eventId: 'relay-auto-1', eventName: 'Auto Translate' }, payload: { requestId: 'auto-chat-1', succeeded: true, translatedText: 'hello world' } }));
    expect(sends).toEqual([{ message: 'Spanish Viewer: (es to en) hello world', routing: 'source', sourcePlatform: 'twitch', overflow: 'split' }]);
    await registry.stop();
  });

  it('stays inert with default settings and never sends simulated chat to the provider', async () => {
    const installed = await installAddOnPackage('addons/auto-translate', addOnsRoot, true); const [module] = await loadInstalledAddOns(addOnsRoot, silentLogger, stateRoot); if (module === undefined) throw new Error('Auto Translate must load.');
    const actions: unknown[] = []; const broker = new AddOnCapabilityBroker(silentLogger, stateRoot, { runStreamerBotAction: async (...args) => { actions.push(args); } });
    const registry = new ModuleRegistry([{ ...module, capabilityGrant: { moduleId: module.manifest.moduleId, permissions: installed.descriptor.permissions, approvedActionIds: ['b31de9cf-0d5d-4ba1-a63e-f9ffde20b27d'] } }], silentLogger, 5_000, broker);
    await registry.start(); await registry.publish(chat()); await registry.publish(chat({ eventId: 'simulated-auto', metadata: { simulated: true } })); expect(actions).toHaveLength(0); await registry.stop();
  });
});
