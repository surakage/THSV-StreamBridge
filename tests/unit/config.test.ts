import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { bridgeConfigSchema } from '../../schemas/config.js';
import { testConfig } from '../helpers.js';

describe('bridge configuration', () => {
  it('migrates the deprecated meldOverlay alias to browserOverlay', async () => {
    const config = await testConfig();
    const input: Record<string, unknown> = { ...config, meldOverlay: { ...config.browserOverlay } };
    delete input['browserOverlay'];
    const parsed = bridgeConfigSchema.parse(input);
    expect(parsed.browserOverlay).toEqual(config.browserOverlay);
  });

  it('accepts the example configuration', async () => {
    const config = await testConfig();
    expect(bridgeConfigSchema.safeParse(config).success).toBe(true);
    const raw = JSON.parse(await readFile('config/bridge.example.json', 'utf8')) as { streamerbot: { testMode: boolean } };
    expect(raw.streamerbot.testMode).toBe(false);
  });

  it('rejects invalid port and unsafe network binding', async () => {
    const config = await testConfig();
    const result = bridgeConfigSchema.safeParse({ ...config, service: { ...config.service, host: '0.0.0.0', port: 80 } });
    expect(result.success).toBe(false);
  });

  it('accepts dynamically named platform entries', async () => {
    const config = await testConfig();
    const mock = config.platforms['mock'];
    expect(mock).toBeDefined();
    const result = bridgeConfigSchema.safeParse({ ...config, platforms: { ...config.platforms, vstream: { ...mock, adapter: 'vstream-plugin' } } });
    expect(result.success).toBe(true);
  });

  it('requires explicit secure opt-in for remote Streamer.bot egress', async () => {
    const config = await testConfig();
    const implicit = bridgeConfigSchema.safeParse({ ...config, streamerbot: { ...config.streamerbot, url: 'wss://remote.example/socket', allowRemote: false } });
    const insecure = bridgeConfigSchema.safeParse({ ...config, streamerbot: { ...config.streamerbot, url: 'ws://remote.example/socket', allowRemote: true } });
    const embeddedSecret = bridgeConfigSchema.safeParse({ ...config, streamerbot: { ...config.streamerbot, url: 'wss://user:secret@remote.example/socket', allowRemote: true } });
    const explicit = bridgeConfigSchema.safeParse({ ...config, streamerbot: { ...config.streamerbot, url: 'wss://remote.example/socket', allowRemote: true } });
    expect(implicit.success).toBe(false);
    expect(insecure.success).toBe(false);
    expect(embeddedSecret.success).toBe(false);
    expect(explicit.success).toBe(true);
  });

  it('validates one central prefix and rejects command or alias collisions', async () => {
    const config = await testConfig();
    expect(config.commands).toMatchObject({ enabled: true, prefix: '!' });
    const collision = bridgeConfigSchema.safeParse({
      ...config,
      commands: { ...config.commands, definitions: [
        { name: 'first', aliases: ['shared'], minimumRole: 'viewer', allowBots: false },
        { name: 'second', aliases: ['shared'], minimumRole: 'viewer', allowBots: false },
      ] },
    });
    const invalidPrefix = bridgeConfigSchema.safeParse({ ...config, commands: { ...config.commands, prefix: '??' } });
    expect(collision.success).toBe(false);
    expect(invalidPrefix.success).toBe(false);
  });

  it('defaults command definitions to a manual source and keeps synced definitions distinct', async () => {
    const config = await testConfig();
    const manual = bridgeConfigSchema.parse({
      ...config,
      commands: { ...config.commands, definitions: [{ name: 'existing', aliases: [], minimumRole: 'viewer', allowBots: false }] },
    });
    expect(manual.commands.definitions[0]?.source).toBe('manual');
    const synced = bridgeConfigSchema.parse({
      ...config,
      commands: { ...config.commands, definitions: [{ name: 'synced-command', aliases: [], minimumRole: 'viewer', allowBots: false, source: 'synced' }] },
    });
    expect(synced.commands.definitions[0]?.source).toBe('synced');
  });

  it('keeps pre-0.5.1 configuration compatible with commands safely disabled', async () => {
    const config = await testConfig();
    const { commands: _commands, ...legacy } = config;
    void _commands;
    expect(bridgeConfigSchema.parse(legacy).commands).toEqual({ enabled: false, prefix: '!', definitions: [] });
  });

  it('defaults timed actions to empty and rejects duplicate timer IDs', async () => {
    const config = await testConfig();
    const { timedActions: _timedActions, ...legacy } = config;
    void _timedActions;
    expect(bridgeConfigSchema.parse(legacy).timedActions).toEqual({ stateFile: 'data/state/timed-actions.json', definitions: [] });
    const definition = { id: 'duplicate', name: 'Duplicate', enabled: true, everyMinutes: 15, missedRunPolicy: 'skip' as const, payload: {}, selection: { mode: 'fixed' as const } };
    expect(bridgeConfigSchema.safeParse({ ...config, timedActions: { ...config.timedActions, definitions: [definition, definition] } }).success).toBe(false);
  });

  it('validates random intervals, activity gates, and approved action targets', async () => {
    const config = await testConfig();
    const base = { id: 'random', name: 'Random', enabled: true, intervalMode: 'random', everyMinutes: 15, missedRunPolicy: 'skip', payload: {}, selection: { mode: 'fixed' } };
    expect(bridgeConfigSchema.safeParse({ ...config, timedActions: { ...config.timedActions, definitions: [{ ...base, minimumMinutes: 20, maximumMinutes: 10 }] } }).success).toBe(false);
    expect(bridgeConfigSchema.safeParse({ ...config, timedActions: { ...config.timedActions, definitions: [{ ...base, minimumMinutes: 10, maximumMinutes: 20, target: { provider: 'run-existing-action', actionId: '11111111-1111-4111-8111-111111111111', actionName: 'Creator Action', approvedByCreator: false } }] } }).success).toBe(false);
    const parsed = bridgeConfigSchema.parse({ ...config, timedActions: { ...config.timedActions, definitions: [{ ...base, minimumMinutes: 10, maximumMinutes: 20 }] } });
    expect(parsed.timedActions.definitions[0]).toMatchObject({ intervalMode: 'random', gates: { requireLive: true, activity: { minimumMessages: 0, windowMinutes: 5 } }, target: { provider: 'event-only' } });
  });

  it('loads legacy viewer and companion configuration without reactivating archived add-ons', async () => {
    const config = await testConfig();
    const legacy = {
      ...config,
      browserOverlay: { ...config.browserOverlay, maxCompanionQueue: 20 },
      viewerIdentity: { enabled: true, stateFile: 'data/state/viewer-progression.json' },
      companion: { enabled: true, stateFile: 'data/state/companion.json' },
    };
    const parsed = bridgeConfigSchema.parse(legacy);
    expect(parsed).not.toHaveProperty('viewerIdentity');
    expect(parsed).not.toHaveProperty('companion');
    expect(parsed.browserOverlay).not.toHaveProperty('maxCompanionQueue');
  });
});
