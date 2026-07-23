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

function event(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    schemaVersion: '1.0.0', eventId: 'raid-1', eventType: 'channel.raid', platform: 'twitch',
    source: { adapter: 'fixture', eventId: 'provider-raid-1', eventName: 'TwitchRaid' }, receivedAt: '2026-07-22T12:00:00.000Z',
    channel: { id: 'broadcaster-1', name: 'ExampleChannel' },
    user: { id: 'raider-1', name: 'friendly_raider', displayName: 'Friendly Raider', actorType: 'human', roles: ['viewer'], avatarUrl: 'https://example.com/avatar.png' },
    payload: { quantity: 42 }, metadata: { simulated: false }, ...overrides,
  };
}

describe('Automated Shoutouts installed add-on', () => {
  let addOnsRoot: string;
  let stateRoot: string;

  beforeEach(async () => {
    addOnsRoot = await mkdtemp(join(tmpdir(), 'thsv-shoutouts-addons-'));
    stateRoot = await mkdtemp(join(tmpdir(), 'thsv-shoutouts-state-'));
  });
  afterEach(async () => { await rm(addOnsRoot, { recursive: true, force: true }); await rm(stateRoot, { recursive: true, force: true }); });

  it('installs through the public package path and sends one source-routed raid shoutout without replay spam', async () => {
    const installed = await installAddOnPackage('addons/automated-shoutouts', addOnsRoot, true);
    const modules = await loadInstalledAddOns(addOnsRoot, silentLogger, stateRoot);
    const module = modules.find((candidate) => candidate.manifest.moduleId === 'thsv.automated-shoutouts');
    if (module === undefined) throw new Error('Automated Shoutouts must load through the installed add-on path.');
    expect(module.settings).toMatchObject({ triggerOnRaids: true, triggerOnFirstChat: false, manualCommandName: 'shoutout', deliveryMode: 'source' });

    const sends: unknown[] = [];
    const overlays: Array<{ topic: string; payload: unknown }> = [];
    const actions: Array<{ actionId: string; argumentsValue: unknown }> = [];
    const broker = new AddOnCapabilityBroker(silentLogger, stateRoot, {
      routeOutboundMessage: async (request) => { sends.push(request); return [{ platform: 'twitch', accepted: true, parts: 1 }]; },
      publishOverlay: async (_moduleId, topic, payload) => { overlays.push({ topic, payload }); },
      runStreamerBotAction: async (actionId, argumentsValue) => { actions.push({ actionId, argumentsValue }); },
    });
    const registry = new ModuleRegistry([{ ...module, capabilityGrant: { moduleId: module.manifest.moduleId, permissions: installed.descriptor.permissions, approvedActionIds: ['e3d92d7e-193a-5bba-8b8c-4f17e605c9d2'] } }], silentLogger, 5_000, broker);
    await registry.start();
    await registry.publish(event());
    expect(actions).toHaveLength(1);
    expect(actions[0]?.actionId).toBe('e3d92d7e-193a-5bba-8b8c-4f17e605c9d2');
    expect(actions[0]?.argumentsValue).toMatchObject({ lookupId: 'raid-1', targetUserId: 'raider-1', targetUserName: 'friendly_raider' });
    await registry.publish(event({
      eventId: 'profile-empty', eventType: 'addon.thsv.automated-shoutouts.twitch-profile-received', platform: 'system',
      source: { adapter: 'streamerbot-addon-relay', eventId: 'profile-relay-empty', eventName: 'Lookup Twitch Creator' },
      user: undefined, payload: { lookupId: 'raid-1', category: '', profileImageUrl: '' },
    }));
    expect(sends).toHaveLength(0); // An ordinary viewer/non-category account is not promoted.
    await registry.publish(event({ eventId: 'raid-2' }));
    expect(actions).toHaveLength(2);
    await registry.publish(event({
      eventId: 'profile-1', eventType: 'addon.thsv.automated-shoutouts.twitch-profile-received', platform: 'system',
      source: { adapter: 'streamerbot-addon-relay', eventId: 'profile-relay-1', eventName: 'Lookup Twitch Creator' },
      user: undefined, payload: { lookupId: 'raid-2', category: 'Just Chatting', profileImageUrl: 'https://example.com/verified-avatar.png' },
    }));
    await registry.publish(event({ eventId: 'raid-replay' }));
    expect(actions).toHaveLength(2);
    expect(sends).toEqual([{ message: 'Thank you Friendly Raider for the raid with 42 viewers! They stream Just Chatting. Watch them at https://twitch.tv/friendly_raider', routing: 'source', sourcePlatform: 'twitch', overflow: 'reject' }]);
    expect(overlays).toHaveLength(1);
    expect(overlays[0]?.topic).toBe('thsv.automated-shoutouts.card.show');
    expect(overlays[0]?.payload).toMatchObject({ title: 'Meet Friendly Raider on Twitch', imageUrl: 'https://example.com/verified-avatar.png' });
    await registry.stop();
  });

  it('requires an allowlist for first-chat automation and never posts simulated events live', async () => {
    await installAddOnPackage('addons/automated-shoutouts', addOnsRoot, true);
    await mkdir(join(stateRoot, 'thsv.automated-shoutouts'), { recursive: true });
    await writeFile(join(stateRoot, 'thsv.automated-shoutouts', 'settings.json'), JSON.stringify({ triggerOnFirstChat: true, firstChatAllowlist: ['youtube:id:creator-1', 'kick:id:kick-creator-1', 'tiktok:tiktok_creator'] }));
    const modules = await loadInstalledAddOns(addOnsRoot, silentLogger, stateRoot);
    const module = modules.find((candidate) => candidate.manifest.moduleId === 'thsv.automated-shoutouts');
    if (module === undefined) throw new Error('Automated Shoutouts must load.');
    const sends: unknown[] = [];
    const overlays: unknown[] = [];
    const broker = new AddOnCapabilityBroker(silentLogger, stateRoot, {
      routeOutboundMessage: async (request) => { sends.push(request); return []; },
      publishOverlay: async (_moduleId, topic, payload) => { overlays.push({ topic, payload }); },
    });
    const registry = new ModuleRegistry([{ ...module, capabilityGrant: { moduleId: module.manifest.moduleId, permissions: module.capabilityGrant?.permissions ?? ['events.subscribe', 'chat.send', 'overlay.publish', 'schedule.bounded', 'state.private', 'streamerbot.run-approved-action'], approvedActionIds: [] } }], silentLogger, 5_000, broker);
    await registry.start();
    await registry.publish(event({
      eventId: 'youtube-first', eventType: 'chat.message', platform: 'youtube', source: { adapter: 'fixture', eventId: 'yt-message-1', eventName: 'YouTubeMessage' },
      user: { id: 'creator-1', name: 'creator', displayName: 'Creator', actorType: 'human', roles: ['viewer'] }, payload: { message: 'hello' }, metadata: { simulated: true },
    }));
    await registry.publish(event({
      eventId: 'kick-first', eventType: 'chat.message', platform: 'kick', source: { adapter: 'fixture', eventId: 'kick-message-1', eventName: 'KickChatMessage' },
      user: { id: 'kick-creator-1', name: 'kick_creator', displayName: 'Kick Creator', actorType: 'human', roles: ['viewer'] }, payload: { message: 'hello' }, metadata: { simulated: true },
    }));
    await registry.publish(event({
      eventId: 'tiktok-first', eventType: 'chat.message', platform: 'tiktok', source: { adapter: 'tikfinity-fixture', eventId: 'tiktok-message-1', eventName: 'Chat' },
      user: { name: 'tiktok_creator', displayName: 'TikTok Creator', actorType: 'human', roles: ['viewer'] }, payload: { message: 'hello' }, metadata: { simulated: true },
    }));
    expect(sends).toHaveLength(0);
    expect(overlays).toHaveLength(0); // Non-Twitch welcomes remain chat-only, including previews.
    await registry.stop();
  });

  it('requests and plays a bounded Twitch target clip through the shared hosted overlay', async () => {
    const installed = await installAddOnPackage('addons/automated-shoutouts', addOnsRoot, true);
    await mkdir(join(stateRoot, 'thsv.automated-shoutouts'), { recursive: true });
    await writeFile(join(stateRoot, 'thsv.automated-shoutouts', 'settings.json'), JSON.stringify({
      twitchVisualType: 'random-clip', clipCount: 30, clipMaximumAgeDays: 60,
      clipMaximumDurationSeconds: 25, clipPreferPopular: true, clipMuted: false, clipVolume: 0.5,
    }));
    const modules = await loadInstalledAddOns(addOnsRoot, silentLogger, stateRoot);
    const module = modules.find((candidate) => candidate.manifest.moduleId === 'thsv.automated-shoutouts');
    if (module === undefined) throw new Error('Automated Shoutouts must load.');
    const actions: Array<{ actionId: string; argumentsValue: unknown }> = [];
    const overlays: Array<{ topic: string; payload: unknown }> = [];
    const broker = new AddOnCapabilityBroker(silentLogger, stateRoot, {
      routeOutboundMessage: async () => [{ platform: 'twitch', accepted: true, parts: 1 }],
      publishOverlay: async (_moduleId, topic, payload) => { overlays.push({ topic, payload }); },
      runStreamerBotAction: async (actionId, argumentsValue) => { actions.push({ actionId, argumentsValue }); },
    });
    const registry = new ModuleRegistry([{ ...module, capabilityGrant: {
      moduleId: module.manifest.moduleId,
      permissions: installed.descriptor.permissions,
      approvedActionIds: ['e3d92d7e-193a-5bba-8b8c-4f17e605c9d2', 'e47c65a2-09d2-5c5b-9c99-c98e3e1d9362'],
    } }], silentLogger, 5_000, broker);
    await registry.start();
    await registry.publish(event({ eventId: 'clip-raid' }));
    await registry.publish(event({
      eventId: 'clip-profile', eventType: 'addon.thsv.automated-shoutouts.twitch-profile-received', platform: 'system',
      source: { adapter: 'streamerbot-addon-relay', eventId: 'clip-profile-relay', eventName: 'Lookup Twitch Creator' },
      user: undefined, payload: { lookupId: 'clip-raid', category: 'Art', profileImageUrl: 'https://example.com/avatar.png' },
    }));
    expect(actions).toHaveLength(2);
    expect(actions[1]).toMatchObject({
      actionId: 'e47c65a2-09d2-5c5b-9c99-c98e3e1d9362',
      argumentsValue: { lookupId: 'clip-raid', targetUserName: 'friendly_raider', clipCount: 30, maximumAgeDays: 60, maximumDurationSeconds: 25, preferPopular: true },
    });
    await registry.publish(event({
      eventId: 'clip-result', eventType: 'addon.thsv.automated-shoutouts.twitch-clip-received', platform: 'system',
      source: { adapter: 'streamerbot-addon-relay', eventId: 'clip-result-relay', eventName: 'Get Twitch Clip' },
      user: undefined,
      payload: { lookupId: 'clip-raid', found: true, clipId: 'FriendlyClip123', title: 'A lovely clip', thumbnailUrl: 'https://example.com/clip.jpg', durationSeconds: 20, landscapeUrl: 'https://example.com/clip.mp4' },
    }));
    expect(overlays).toHaveLength(1);
    expect(overlays[0]).toMatchObject({
      topic: 'thsv.automated-shoutouts.media.play',
      payload: { url: 'https://example.com/clip.mp4', muted: false, volume: 0.5, posterUrl: 'https://example.com/clip.jpg', title: 'A lovely clip', durationMs: 20_000 },
    });
    await registry.stop();
  });

  it('welcomes an allowlisted Twitch first-time viewer without promoting them and does not repeat', async () => {
    const installed = await installAddOnPackage('addons/automated-shoutouts', addOnsRoot, true);
    await mkdir(join(stateRoot, 'thsv.automated-shoutouts'), { recursive: true });
    await writeFile(join(stateRoot, 'thsv.automated-shoutouts', 'settings.json'), JSON.stringify({
      triggerOnFirstChat: true,
      firstChatAllowlist: ['twitch:id:viewer-2'],
      twitchViewerWelcomeTemplate: 'Hello {displayName}, welcome to the stream!',
    }));
    const modules = await loadInstalledAddOns(addOnsRoot, silentLogger, stateRoot);
    const module = modules.find((candidate) => candidate.manifest.moduleId === 'thsv.automated-shoutouts');
    if (module === undefined) throw new Error('Automated Shoutouts must load.');
    const sends: unknown[] = [];
    const actions: Array<{ actionId: string; argumentsValue: unknown }> = [];
    const overlays: Array<{ topic: string; payload: unknown }> = [];
    const broker = new AddOnCapabilityBroker(silentLogger, stateRoot, {
      routeOutboundMessage: async (request) => { sends.push(request); return [{ platform: 'twitch', accepted: true, parts: 1 }]; },
      runStreamerBotAction: async (actionId, argumentsValue) => { actions.push({ actionId, argumentsValue }); },
      publishOverlay: async (_moduleId, topic, payload) => { overlays.push({ topic, payload }); },
    });
    const registry = new ModuleRegistry([{ ...module, capabilityGrant: {
      moduleId: module.manifest.moduleId,
      permissions: installed.descriptor.permissions,
      approvedActionIds: ['e3d92d7e-193a-5bba-8b8c-4f17e605c9d2'],
    } }], silentLogger, 5_000, broker);
    await registry.start();
    const firstChat = event({
      eventId: 'twitch-first-viewer', eventType: 'chat.message',
      source: { adapter: 'fixture', eventId: 'twitch-message-1', eventName: 'TwitchChatMessage' },
      user: { id: 'viewer-2', name: 'friendly_viewer', displayName: 'Friendly Viewer', actorType: 'human', roles: ['viewer'] },
      payload: { message: 'hello', firstMessage: true },
    });
    await registry.publish(firstChat);
    expect(actions).toHaveLength(1);
    await registry.publish(event({
      eventId: 'profile-viewer', eventType: 'addon.thsv.automated-shoutouts.twitch-profile-received', platform: 'system',
      source: { adapter: 'streamerbot-addon-relay', eventId: 'profile-relay-viewer', eventName: 'Lookup Twitch Creator' },
      user: undefined, payload: { lookupId: 'twitch-first-viewer', category: '', profileImageUrl: '' },
    }));
    expect(sends).toEqual([{ message: 'Hello Friendly Viewer, welcome to the stream!', routing: 'source', sourcePlatform: 'twitch', overflow: 'reject' }]);
    expect(overlays).toHaveLength(1);
    expect(overlays[0]).toMatchObject({ topic: 'thsv.automated-shoutouts.card.show', payload: { title: 'Meet Friendly Viewer on Twitch' } });
    await registry.publish({ ...firstChat, eventId: 'twitch-second-viewer', source: { ...firstChat.source, eventId: 'twitch-message-2' } });
    expect(actions).toHaveLength(1);
    expect(sends).toHaveLength(1);
    await registry.stop();
  });

  it('shows the selected Twitch visual for a manual moderator shoutout', async () => {
    const installed = await installAddOnPackage('addons/automated-shoutouts', addOnsRoot, true);
    await mkdir(join(stateRoot, 'thsv.automated-shoutouts'), { recursive: true });
    await writeFile(join(stateRoot, 'thsv.automated-shoutouts', 'settings.json'), JSON.stringify({ twitchVisualTriggers: ['manual'] }));
    const [module] = await loadInstalledAddOns(addOnsRoot, silentLogger, stateRoot);
    if (module === undefined) throw new Error('Automated Shoutouts must load.');
    const sends: unknown[] = [];
    const actions: Array<{ actionId: string; argumentsValue: unknown }> = [];
    const overlays: Array<{ topic: string; payload: unknown }> = [];
    const broker = new AddOnCapabilityBroker(silentLogger, stateRoot, {
      routeOutboundMessage: async (request) => { sends.push(request); return [{ platform: 'twitch', accepted: true, parts: 1 }]; },
      runStreamerBotAction: async (actionId, argumentsValue) => { actions.push({ actionId, argumentsValue }); },
      publishOverlay: async (_moduleId, topic, payload) => { overlays.push({ topic, payload }); },
    });
    const registry = new ModuleRegistry([{ ...module, capabilityGrant: {
      moduleId: module.manifest.moduleId, permissions: installed.descriptor.permissions,
      approvedActionIds: ['e3d92d7e-193a-5bba-8b8c-4f17e605c9d2'],
    } }], silentLogger, 5_000, broker);
    await registry.start();
    await registry.publish(event({
      eventId: 'manual-twitch', eventType: 'command.received',
      source: { adapter: 'fixture', eventId: 'manual-twitch-source', eventName: 'Command' },
      user: { id: 'mod-1', name: 'mod', actorType: 'human', roles: ['moderator'] },
      payload: { command: 'shoutout', arguments: ['TargetCreator'] },
    }));
    expect(actions).toHaveLength(1);
    await registry.publish(event({
      eventId: 'manual-twitch-profile', eventType: 'addon.thsv.automated-shoutouts.twitch-profile-received', platform: 'system',
      source: { adapter: 'streamerbot-addon-relay', eventId: 'manual-profile-relay', eventName: 'Lookup Twitch Creator' },
      user: undefined,
      payload: { lookupId: 'manual-twitch', category: 'Music', profileImageUrl: 'https://example.com/target.png' },
    }));
    expect(sends).toHaveLength(1);
    expect(overlays).toHaveLength(1);
    expect(overlays[0]).toMatchObject({ topic: 'thsv.automated-shoutouts.card.show', payload: { title: 'Meet TargetCreator on Twitch', imageUrl: 'https://example.com/target.png' } });
    await registry.stop();
  });

  it('accepts manual targets only from moderator or broadcaster command events', async () => {
    const installed = await installAddOnPackage('addons/automated-shoutouts', addOnsRoot, true);
    const [module] = await loadInstalledAddOns(addOnsRoot, silentLogger, stateRoot);
    if (module === undefined) throw new Error('Automated Shoutouts must load.');
    const sends: unknown[] = [];
    const broker = new AddOnCapabilityBroker(silentLogger, stateRoot, { routeOutboundMessage: async (request) => { sends.push(request); return [{ platform: 'kick', accepted: true, parts: 1 }]; } });
    const registry = new ModuleRegistry([{ ...module, capabilityGrant: { moduleId: module.manifest.moduleId, permissions: installed.descriptor.permissions, approvedActionIds: [] } }], silentLogger, 5_000, broker);
    await registry.start();
    const command = event({ eventId: 'command-1', eventType: 'command.received', platform: 'kick', source: { adapter: 'fixture', eventId: 'kick-command-1', eventName: 'Command' }, user: { id: 'mod-1', name: 'mod', actorType: 'human', roles: ['moderator'] }, payload: { command: 'shoutout', arguments: ['TargetCreator'] } });
    const commandUser = command.user;
    if (commandUser === undefined) throw new Error('The command fixture requires a user.');
    await registry.publish({ ...command, eventId: 'viewer-command', user: { ...commandUser, roles: ['viewer'] } });
    await registry.publish(command);
    expect(sends).toEqual([{ message: 'Go check out TargetCreator at https://kick.com/targetcreator and show them some love!', routing: 'source', sourcePlatform: 'kick', overflow: 'reject' }]);
    await registry.stop();
  });
});
