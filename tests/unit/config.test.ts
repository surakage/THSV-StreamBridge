import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { bridgeConfigSchema } from '../../schemas/config.js';
import { testConfig } from '../helpers.js';

describe('bridge configuration', () => {
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

  it('keeps pre-0.5.1 configuration compatible with commands safely disabled', async () => {
    const config = await testConfig();
    const { commands: _commands, ...legacy } = config;
    void _commands;
    expect(bridgeConfigSchema.parse(legacy).commands).toEqual({ enabled: false, prefix: '!', definitions: [] });
  });
});
