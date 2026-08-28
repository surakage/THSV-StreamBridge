import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CORE_CONTRACT_VERSION } from '../../bridge/contracts/v2/common.js';
import type { ModuleManifestV2 } from '../../bridge/contracts/v2/module-manifest.js';
import { ModuleRegistry, type FrameworkModule } from '../../bridge/core/module-registry.js';
import { CommandDirectoryService } from '../../bridge/services/command-directory.js';
import { silentLogger, testConfig } from '../helpers.js';

function addOn(moduleId: string, name: string, commands: ModuleManifestV2['commandsProvided']): FrameworkModule {
  return {
    required: false,
    manifest: {
      contractVersion: CORE_CONTRACT_VERSION, moduleId, name, version: '1.0.0',
      minimumCoreVersion: CORE_CONTRACT_VERSION, maximumTestedCoreVersion: CORE_CONTRACT_VERSION,
      dependencies: [], requiredCapabilities: [], configurationSchema: 'schemas/config.json', eventSubscriptions: [],
      commandsProvided: commands, actionsProvided: [], browserSourcesProvided: [], dataStorageOwned: [],
      installationSteps: ['Install for test.'], uninstallationSteps: ['Remove after test.'], migrations: [], healthChecks: [],
    },
  };
}

describe('CommandDirectoryService', () => {
  it('publishes viewer-safe core and add-on commands without leaking settings or creator controls', async () => {
    const config = await testConfig();
    config.commands = {
      enabled: true, prefix: '!',
      definitions: [
        { name: 'hello', aliases: ['hi'], minimumRole: 'viewer', allowBots: false, source: 'manual' },
        { name: 'secret', aliases: [], minimumRole: 'moderator', allowBots: false, source: 'manual' },
      ],
    };
    const registry = new ModuleRegistry([
      { ...addOn('thsv.quote-vault', 'Quote Vault', [
        { id: 'quote-vault.quote', name: 'quote - random, ID, or search' },
        { id: 'quote-vault.delete', name: 'quotedelete - soft-delete a quote' },
      ]), settings: { webhookUrl: 'https://secret.invalid', apiToken: 'never-publish' } },
      addOn('thsv.chat-play-pack', 'Chat Play Pack', [{ id: 'chat-play.coinflip', name: 'coinflip' }]),
    ], silentLogger);
    const service = new CommandDirectoryService(config, registry);
    const catalogue = service.catalogue(new Date('2026-08-02T12:00:00.000Z'));
    const serialized = JSON.stringify(catalogue);

    expect(catalogue.commandCount).toBe(4);
    expect(serialized).toContain('commands');
    expect(serialized).toContain('hello');
    expect(serialized).toContain('quote');
    expect(serialized).toContain('coinflip');
    expect(serialized).not.toContain('secret');
    expect(serialized).not.toContain('quotedelete');
    expect(serialized).not.toContain('webhookUrl');
    expect(serialized).not.toContain('never-publish');
    expect(catalogue.privacy).toBe('public-command-metadata-only');
  });

  it('renders a portable escaped HTML page with categories and platform labels', async () => {
    const config = await testConfig();
    config.commands = { enabled: true, prefix: '?', definitions: [{ name: 'hello', aliases: [], minimumRole: 'viewer', allowBots: false, source: 'manual' }] };
    const service = new CommandDirectoryService(config, new ModuleRegistry([], silentLogger));
    const html = service.html(service.catalogue(new Date('2026-08-02T12:00:00.000Z')));
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('?hello');
    expect(html).toContain('Stream Commands');
    expect(html).toContain('Twitch · YouTube · Kick · TikTok');
    expect(html).not.toContain('<script');
  });

  it('shows typed-command platforms instead of native reward platforms', async () => {
    const config = await testConfig();
    config.commands = { enabled: false, prefix: '!', definitions: [] };
    const registry = new ModuleRegistry([
      { ...addOn('thsv.first-five', 'First Five', [{ id: 'first-five.claim', name: 'firstfive' }]), settings: { enabled: true, commandName: 'firstfive' } },
      { ...addOn('thsv.viewer-spotlight', 'Viewer Spotlight', [{ id: 'viewer-spotlight.card', name: 'card' }]), settings: { enabled: true, commandName: 'card', enabledPlatforms: ['twitch', 'youtube', 'kick', 'tiktok'] } },
      { ...addOn('thsv.village-fun-commands', 'Village Fun Commands', [{ id: 'village-fun.follow-age', name: 'followage' }]), settings: { enabled: true, followAgeEnabled: true } },
      { ...addOn('thsv.custom-counter', 'Custom Counter', [{ id: 'custom-counter.command', name: 'streamcounter' }]), settings: { enabled: true, commandEnabled: true } },
    ], silentLogger);
    const catalogue = new CommandDirectoryService(config, registry).catalogue();
    const commands = catalogue.categories.flatMap((category) => category.commands);

    expect(commands.find((entry) => entry.command === 'firstfive')?.platforms).toEqual(['youtube', 'tiktok']);
    expect(commands.find((entry) => entry.command === 'card')?.platforms).toEqual(['youtube', 'tiktok']);
    expect(commands.find((entry) => entry.command === 'followage')?.platforms).toEqual(['twitch']);
    expect(commands.some((entry) => entry.command === 'streamcounter')).toBe(false);
  });

  it('uses each add-on configured platform selection for directory pills', async () => {
    const config = await testConfig();
    config.commands = { enabled: false, prefix: '!', definitions: [] };
    const registry = new ModuleRegistry([
      { ...addOn('thsv.quote-vault', 'Quote Vault', [{ id: 'quote-vault.quote', name: 'quote' }]), settings: { enabled: true, enabledPlatforms: ['youtube', 'kick'] } },
      { ...addOn('thsv.viewer-lobby', 'Viewer Lobby', [{ id: 'viewer-lobby.join', name: 'join' }]), settings: { enabled: true, platforms: ['tiktok'] } },
    ], silentLogger);
    const commands = new CommandDirectoryService(config, registry).catalogue().categories.flatMap((category) => category.commands);

    expect(commands.find((entry) => entry.command === 'quote')?.platforms).toEqual(['youtube', 'kick']);
    expect(commands.find((entry) => entry.command === 'join')?.platforms).toEqual(['tiktok']);
  });

  it('tracks enabled Streamer.bot commands and keeps restricted groups out of the public catalogue', async () => {
    const config = await testConfig();
    config.commands = { enabled: true, prefix: '!', definitions: [
      { name: 'hello', aliases: [], minimumRole: 'viewer', allowBots: false, source: 'manual' },
      { name: 'secret', aliases: [], minimumRole: 'moderator', allowBots: false, source: 'manual' },
    ] };
    const registry = new ModuleRegistry([
      { ...addOn('thsv.quote-vault', 'Quote Vault', [{ id: 'quote-vault.delete', name: 'quotedelete' }]), settings: { enabled: true, deleteCommand: 'quotedelete', enabledPlatforms: ['twitch'] } },
    ], silentLogger);
    const inspector = { inspectCommands: async () => [
      { id: 'sb-public', name: 'Public helper', enabled: true, group: 'Community', aliases: ['!helper', '!helpme'] },
      { id: 'sb-mod', name: 'Mod helper', enabled: true, group: 'Moderators', aliases: ['!modhelper'] },
      { id: 'sb-disabled', name: 'Disabled', enabled: false, group: '', aliases: ['!disabled'] },
    ] };
    const service = new CommandDirectoryService(config, registry, {}, inspector);
    await service.refreshStreamerBotCommands();

    const publicNames = service.catalogue().categories.flatMap((category) => category.commands.map((entry) => entry.command));
    const moderatorNames = service.moderatorCatalogue().categories.flatMap((category) => category.commands.map((entry) => entry.command));

    expect(publicNames).toEqual(expect.arrayContaining(['commands', 'hello', 'helper']));
    expect(publicNames).not.toEqual(expect.arrayContaining(['secret', 'quotedelete', 'modhelper', 'disabled']));
    expect(moderatorNames).toEqual(expect.arrayContaining(['secret', 'quotedelete', 'modhelper']));
    expect(moderatorNames).not.toEqual(expect.arrayContaining(['hello', 'helper', 'disabled']));
    expect(service.moderatorCatalogue().privacy).toBe('authenticated-moderator-command-metadata-only');
  });

  it('publishes through the configured HTTPS endpoint without exposing its token', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-command-directory-'));
    const tokenFile = join(root, 'publish-token.txt');
    const token = 'a'.repeat(48);
    await writeFile(tokenFile, token, 'utf8');
    const requests: Array<{ url: string; authorization: string; body: string }> = [];
    const request = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const body = typeof init?.body === 'string' ? init.body : '';
      requests.push({ url, authorization: new Headers(init?.headers).get('authorization') ?? '', body });
      return Response.json({ accepted: true, changed: true, publicUrl: '/commands/test-creator' });
    };
    const service = new CommandDirectoryService(await testConfig(), new ModuleRegistry([], silentLogger), {
      publishUrl: 'https://www.slothbloom.com/api/commands/test-creator', tokenFile, request,
    });

    const result = await service.publish();

    expect(result).toMatchObject({ enabled: true, state: 'published', publicUrl: 'https://www.slothbloom.com/commands/test-creator' });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.authorization).toBe(`Bearer ${token}`);
    expect(requests[0]?.body).toContain('public-command-metadata-only');
    expect(JSON.stringify(result)).not.toContain(token);
  });

  it('fails closed for unsafe endpoints and removes a hosted page only explicitly', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-command-directory-remove-'));
    const tokenFile = join(root, 'publish-token.txt');
    await writeFile(tokenFile, 'b'.repeat(48), 'utf8');
    const methods: string[] = [];
    const request = async (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      methods.push(init?.method ?? 'GET');
      return Response.json({ deleted: true });
    };
    const unsafe = new CommandDirectoryService(await testConfig(), new ModuleRegistry([], silentLogger), { publishUrl: 'http://example.com/api/commands/test', tokenFile, request });
    expect(unsafe.publicationStatus()).toEqual({ enabled: false, state: 'disabled' });
    await expect(unsafe.publish()).resolves.toEqual({ enabled: false, state: 'disabled' });
    expect(methods).toEqual([]);

    const service = new CommandDirectoryService(await testConfig(), new ModuleRegistry([], silentLogger), { publishUrl: 'https://www.slothbloom.com/api/commands/test', tokenFile, request });
    await expect(service.removePublished()).resolves.toMatchObject({ state: 'removed' });
    expect(methods).toEqual(['DELETE']);
  });

  it('retries transient publication failures and retains bounded attempt evidence', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-command-directory-retry-'));
    const tokenFile = join(root, 'publish-token.txt');
    await writeFile(tokenFile, 'c'.repeat(48), 'utf8');
    let attempts = 0;
    const request = async (): Promise<Response> => {
      attempts += 1;
      return attempts < 3 ? Response.json({ error: 'temporary outage' }, { status: 503 }) : Response.json({ accepted: true, changed: false, publicUrl: '/commands/recovered' });
    };
    const service = new CommandDirectoryService(await testConfig(), new ModuleRegistry([], silentLogger), { publishUrl: 'https://www.slothbloom.com/api/commands/test', tokenFile, request });
    const result = await service.publish();
    expect(result).toMatchObject({ state: 'unchanged', attempts: 3 });
    expect(result.history).toHaveLength(3);
    expect(result.history?.map((entry) => entry.state)).toEqual(['failed', 'failed', 'unchanged']);
  });

  it('persists only bounded sanitized publication evidence across restarts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-command-directory-history-'));
    const tokenFile = join(root, 'publish-token.txt'); const historyPath = join(root, 'state', 'history.json');
    await writeFile(tokenFile, 'd'.repeat(48), 'utf8');
    const request = async (): Promise<Response> => Response.json({ error: 'temporary token=super-secret-value' }, { status: 400 });
    const options = { publishUrl: 'https://www.slothbloom.com/api/commands/test', tokenFile, historyPath, request };
    const service = new CommandDirectoryService(await testConfig(), new ModuleRegistry([], silentLogger), options);
    await service.publish();
    const saved = await readFile(historyPath, 'utf8');
    expect(saved).not.toContain('d'.repeat(48));
    expect(saved).not.toContain('super-secret-value');
    const restarted = new CommandDirectoryService(await testConfig(), new ModuleRegistry([], silentLogger), options);
    await restarted.start();
    expect(restarted.publicationStatus().history).toHaveLength(1);
    expect(restarted.publicationStatus().history?.[0]).toMatchObject({ state: 'failed', attempt: 1 });
  });
});
