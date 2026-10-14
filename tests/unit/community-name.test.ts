import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call -- executable add-on entrypoints are intentionally plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import { processLurkEvent } from '../../addons/lurk-tracker/dist/index.js';
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import { settingsFor as villageDrawSettings } from '../../addons/village-draw/dist/index.js';
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import { communityName as shoutoutCommunity, renderTemplate } from '../../addons/automated-shoutouts/dist/index.js';
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import { expandCommunity } from '../../addons/discord-chat-archive/dist/index.js';
import { CORE_CONTRACT_VERSION } from '../../bridge/contracts/v2/common.js';
import { AddOnCapabilityBroker } from '../../bridge/core/addon-capability-broker.js';
import { ModuleRegistry } from '../../bridge/core/module-registry.js';
import { WizardConfigurationGateway } from '../../bridge/services/wizard-configuration.js';
import { bridgeConfigSchema } from '../../schemas/config.js';
import { fixture, silentLogger, testConfig } from '../helpers.js';

const grant = { moduleId: 'test.community', permissions: [], approvedActionIds: [] };
const liveEvent = (platform: string, name: string, simulated = false) => ({ platform, channel: { name }, metadata: { simulated } }) as Parameters<AddOnCapabilityBroker['observeEvent']>[0];

describe('community name setting', () => {
  it('defaults to blank, trims a saved name, and rejects names over 60 characters', async () => {
    const config = await testConfig();
    const withoutCommunity: Record<string, unknown> = { ...config };
    delete withoutCommunity['community'];
    expect(bridgeConfigSchema.parse(withoutCommunity).community).toEqual({ name: '' });
    expect(bridgeConfigSchema.parse({ ...config, community: { name: '  The Hidden Sloth Village  ' } }).community.name).toBe('The Hidden Sloth Village');
    expect(bridgeConfigSchema.safeParse({ ...config, community: { name: 'x'.repeat(61) } }).success).toBe(false);
    const example = JSON.parse(await readFile('config/bridge.example.json', 'utf8')) as { community: { name: string } };
    expect(example.community).toEqual({ name: '' });
  });

  it('stages, commits, and exports the community name through the wizard gateway', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'thsv-community-'));
    const path = join(directory, 'bridge.json');
    await writeFile(path, await readFile('config/bridge.example.json', 'utf8'));
    const gateway = new WizardConfigurationGateway(path, () => [], join(directory, 'backups'));
    expect(await gateway.snapshot()).toMatchObject({ community: { name: '' } });
    const draft = await gateway.begin();
    expect(() => gateway.stage(draft.id, { kind: 'community', community: { name: 'x'.repeat(61) } })).toThrow('Staged configuration change is invalid');
    gateway.stage(draft.id, { kind: 'community', community: { name: ' The Hidden Sloth Village ' } });
    await gateway.commit(draft.id);
    expect(await gateway.communityName()).toBe('The Hidden Sloth Village');
    expect((await gateway.export()).community).toEqual({ name: 'The Hidden Sloth Village' });
  });

  it('resolves the configured name, then the last live broadcaster channel, then a generic phrase', () => {
    let configured = '';
    const broker = new AddOnCapabilityBroker(silentLogger, join(tmpdir(), 'thsv-community-broker'), { communityName: () => configured });
    const context = broker.contextFor(grant);
    expect(context.community.name).toBe('the community');
    broker.observeEvent(liveEvent('twitch', 'SimulatedChannel', true));
    broker.observeEvent(liveEvent('twitch', 'twitch'));
    broker.observeEvent(liveEvent('system', 'OBS'));
    expect(context.community.name).toBe('the community');
    broker.observeEvent(liveEvent('twitch', 'SlothStreamer'));
    expect(context.community.name).toBe('SlothStreamer');
    configured = 'The Hidden Sloth Village';
    expect(context.community.name).toBe('The Hidden Sloth Village');
    configured = '   ';
    expect(context.community.name).toBe('SlothStreamer');
  });

  it('tells the broker the channel before add-ons handle the event', async () => {
    const seen: string[] = [];
    const broker = new AddOnCapabilityBroker(silentLogger, join(tmpdir(), 'thsv-community-registry'));
    const registry = new ModuleRegistry([{
      manifest: {
        contractVersion: CORE_CONTRACT_VERSION, moduleId: 'test.community', name: 'Community test', version: '1.0.0', minimumCoreVersion: CORE_CONTRACT_VERSION, maximumTestedCoreVersion: CORE_CONTRACT_VERSION,
        dependencies: [], requiredCapabilities: [], configurationSchema: 'schemas/modules/test.community.json', eventSubscriptions: ['chat.message'], commandsProvided: [], actionsProvided: [], browserSourcesProvided: [], dataStorageOwned: [],
        installationSteps: ['Install for test.'], uninstallationSteps: ['Remove after test.'], migrations: [], healthChecks: [],
      },
      required: false,
      onEvent: async (_event, context) => { seen.push(context.community.name); },
    }], silentLogger, 5_000, broker);
    await registry.start();
    const event = await fixture();
    await registry.publish(event);
    await registry.publish({ ...event, eventId: 'live-1', channel: { name: 'SlothStreamer' }, metadata: { simulated: false } });
    expect(seen).toEqual(['the community', 'SlothStreamer']);
    await registry.stop();
  });
});

describe('add-on {community} wording', () => {
  function lurkHarness(community?: string) {
    let state: unknown = {};
    const chats: Array<{ message: string }> = [];
    const context = {
      settings: { enabled: true }, ...(community === undefined ? {} : { community: { name: community } }),
      state: { read: async () => state, write: async (next: unknown) => { state = structuredClone(next); } },
      chat: { send: async (request: { message: string }) => { chats.push(request); } },
      viewerFoundation: { getProjection: async () => ({ viewerId: 'twitch-viewer' }) },
      schedule: { after: () => 'task', cancel: () => undefined },
    };
    return { context, chats };
  }
  const lurk = (channel: string) => ({ eventType: 'command.received', eventId: `lurk-${channel}`, platform: 'twitch', channel: { name: channel }, user: { id: '42', name: 'viewer', displayName: 'Viewer', actorType: 'human', roles: [] }, source: { eventId: `lurk-${channel}` }, payload: { command: 'lurk' }, metadata: { simulated: false } });

  it('thanks lurkers for keeping the creator community company', async () => {
    const configured = lurkHarness('The Hidden Sloth Village');
    await processLurkEvent(lurk('SlothStreamer'), configured.context, Date.parse('2026-10-05T18:00:00Z'));
    expect(configured.chats[0]?.message).toBe('Viewer is lurking. Thanks for keeping The Hidden Sloth Village company! Chat again to return.');
    const olderHost = lurkHarness();
    await processLurkEvent(lurk('SlothStreamer'), olderHost.context, Date.parse('2026-10-05T18:00:00Z'));
    expect(olderHost.chats[0]?.message).toContain('Thanks for keeping SlothStreamer company!');
    const placeholder = lurkHarness();
    await processLurkEvent(lurk('twitch'), placeholder.context, Date.parse('2026-10-05T18:00:00Z'));
    expect(placeholder.chats[0]?.message).toContain('Thanks for keeping the community company!');
  });

  it('names Village Draw giveaways after the community while keeping saved names', () => {
    const community = { name: 'The Hidden Sloth Village' };
    expect(villageDrawSettings({ settings: {}, community })).toMatchObject({ name: 'The Hidden Sloth Village Giveaway', winnerOverlayMessage: 'The community has chosen!' });
    expect(villageDrawSettings({ settings: {} })).toMatchObject({ name: 'The community Giveaway' });
    expect(villageDrawSettings({ settings: { giveawayName: 'Village Giveaway', winnerOverlayMessage: 'The village has chosen!' }, community })).toMatchObject({ name: 'Village Giveaway', winnerOverlayMessage: 'The village has chosen!' });
    expect(villageDrawSettings({ settings: { giveawayName: 'Summer {community} Draw', openMessage: 'Welcome to {community}: {name}' }, community })).toMatchObject({ name: 'Summer The Hidden Sloth Village Draw', openMessage: 'Welcome to The Hidden Sloth Village: {name}' });
  });

  it('expands {community} in shoutout welcomes and Discord archive titles', () => {
    const candidate = { platform: 'twitch', trigger: 'first-chat', user: { name: 'newviewer', displayName: 'NewViewer' } };
    const welcome = renderTemplate('Glad you made it, {displayName}! Welcome to the Twitch side of {community}.', candidate, 'The Hidden Sloth Village');
    expect(welcome).toMatch(/^Glad you made it, \S+! Welcome to the Twitch side of The Hidden Sloth Village\.$/u);
    expect(shoutoutCommunity({ community: { name: 'The Hidden Sloth Village' } }, { platform: 'twitch', channel: { name: 'SlothStreamer' } })).toBe('The Hidden Sloth Village');
    expect(shoutoutCommunity({}, { platform: 'twitch', channel: { name: 'SlothStreamer' } })).toBe('SlothStreamer');
    expect(shoutoutCommunity({}, { platform: 'twitch', channel: { name: 'twitch' } })).toBe('the community');
    expect(expandCommunity('{community} chat · {date}', 'the community')).toBe('The community chat · {date}');
    expect(expandCommunity('Archive for {community}', 'the community')).toBe('Archive for the community');
  });

  it('ships {community} defaults and neutral points names in add-on schemas', async () => {
    const schema = async (folder: string) => JSON.parse(await readFile(`addons/${folder}/schemas/config.json`, 'utf8')) as { properties: Record<string, { default?: unknown }> };
    expect((await schema('village-draw')).properties['giveawayName']?.default).toBe('{community} Giveaway');
    expect((await schema('discord-chat-archive')).properties['forumThreadName']?.default).toBe('{community} chat · {date} · {time}');
    expect((await schema('discord-chat-archive')).properties['sessionHeaderTitle']?.default).toBe('{community} Stream Chat Archive');
    expect((await schema('viewer-foundation')).properties['currencyName']?.default).toBe('Points');
    for (const folder of ['automated-shoutouts', 'lurk-tracker', 'discord-chat-archive', 'viewer-foundation', 'viewer-spotlight', 'free-game-check']) {
      const source = await readFile(`addons/${folder}/dist/index.js`, 'utf8');
      expect(source, folder).not.toMatch(/\bthe village\b|Village Points|Village (?:Regular|Veteran|Legend|level|Spotlight|chat|Stream Chat)/u);
    }
  });
});
