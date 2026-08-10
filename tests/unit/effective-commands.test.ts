import { describe, expect, it } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CommandsConfig } from '../../schemas/config.js';
import { buildEffectiveCommands } from '../../bridge/core/effective-commands.js';
import { deriveCommandEvent } from '../../bridge/core/multi-commands.js';
import type { CommandDirectoryModuleSource } from '../../bridge/core/module-registry.js';
import type { NormalizedEvent } from '../../schemas/event.js';

const base: CommandsConfig = { enabled: true, prefix: '!', definitions: [] };

function source(
  moduleId: string,
  commandsProvided: CommandDirectoryModuleSource['commandsProvided'],
  settings: Readonly<Record<string, unknown>> = {},
  status: CommandDirectoryModuleSource['status'] = 'healthy',
): CommandDirectoryModuleSource {
  return { moduleId, moduleName: moduleId, status, commandsProvided, settings };
}

function chat(message: string): NormalizedEvent {
  return {
    schemaVersion: '1.0.0', eventId: 'chat-1', eventType: 'chat.message', platform: 'twitch',
    source: { adapter: 'test', eventId: 'chat-1', eventName: 'ChatMessage' }, receivedAt: '2026-08-03T12:00:00.000Z',
    channel: { id: 'channel-1', name: 'channel' }, user: { id: 'viewer-1', name: 'viewer', displayName: 'Viewer', actorType: 'human', roles: ['viewer'] },
    payload: { message }, metadata: { simulated: false },
  };
}

describe('effective add-on command registry', () => {
  it('derives an installed add-on command from the normal chat intake', () => {
    const result = buildEffectiveCommands(base, [source('thsv.chat-play-pack', [{ id: 'chat-play.coinflip', name: 'coinflip' }])]);
    const event = deriveCommandEvent(chat('!coinflip heads'), result.config);

    expect(result.addOnCommands).toHaveLength(1);
    expect(event).toMatchObject({ eventType: 'command.received', payload: { command: 'coinflip', arguments: ['heads'] } });
  });

  it('activates declared add-on commands even when creator Command Sync is disabled', () => {
    const result = buildEffectiveCommands({ enabled: false, prefix: '!', definitions: [] }, [
      source('thsv.chat-play-pack', [{ id: 'chat-play.coinflip', name: 'coinflip' }]),
    ]);
    expect(result.config.enabled).toBe(true);
    expect(deriveCommandEvent(chat('!coinflip'), result.config)?.payload['command']).toBe('coinflip');
  });

  it('uses creator-saved command names and registers virtual language and lurk commands', () => {
    const result = buildEffectiveCommands(base, [
      source('thsv.viewer-foundation', [{ id: 'viewer-foundation.balance', name: 'points' }], { pointsCommand: 'leaves', lurkCommand: 'hideout' }),
      source('thsv.user-translate', [
        { id: 'user-translate.generic', name: 'translate' },
        { id: 'user-translate.language-code', name: 'language-code commands' },
      ], { mode: 'both', genericCommandName: 'translate', languageCommands: ['en', 'es'] }),
    ]);

    expect(result.config.definitions.map((definition) => definition.name)).toEqual(['leaves', 'hideout', 'translate', 'en', 'es']);
  });

  it('keeps creator definitions authoritative and reports collisions without failing other commands', () => {
    const core: CommandsConfig = {
      enabled: true, prefix: '!',
      definitions: [{ name: 'coinflip', aliases: [], minimumRole: 'viewer', allowBots: false, source: 'manual' }],
    };
    const result = buildEffectiveCommands(core, [source('thsv.chat-play-pack', [
      { id: 'chat-play.coinflip', name: 'coinflip' },
      { id: 'chat-play.slots', name: 'slots' },
    ])]);

    expect(result.config.definitions.map((definition) => definition.name)).toEqual(['coinflip', 'slots']);
    expect(result.collisions).toEqual([expect.objectContaining({ commandId: 'chat-play.coinflip', name: 'coinflip', owner: 'creator configuration' })]);
  });

  it('does not activate disabled, failed, or not-yet-started add-ons', () => {
    const commands = [{ id: 'chat-play.coinflip', name: 'coinflip' }];
    expect(buildEffectiveCommands(base, [source('one', commands, { enabled: false })]).addOnCommands).toHaveLength(0);
    expect(buildEffectiveCommands(base, [source('two', commands, {}, 'failed')]).addOnCommands).toHaveLength(0);
    expect(buildEffectiveCommands(base, [source('three', commands, {}, 'stopped')]).addOnCommands).toHaveLength(0);
  });

  it('registers the shoutout alias and moderator gate from one declaration', () => {
    const result = buildEffectiveCommands(base, [source('thsv.automated-shoutouts', [
      { id: 'automated-shoutouts.shoutout', name: 'shoutout (recommended alias: so)' },
    ], { triggerOnManualCommand: true, manualCommandName: 'shoutout' })]);
    expect(result.config.definitions[0]).toMatchObject({ name: 'shoutout', aliases: ['so'], minimumRole: 'moderator' });
  });

  it('uses saved claim and guide command names instead of stale manifest defaults', () => {
    const result = buildEffectiveCommands(base, [
      source('thsv.fan-crown', [{ id: 'fan-crown.claim', name: 'fancrown' }], { commandName: 'crownme' }),
      source('thsv.first-five', [{ id: 'first-five.claim', name: 'firstfive' }], { commandName: 'earlybird' }),
      source('thsv.free-game-check', [{ id: 'free-game-check.command', name: 'freegames' }], { commandName: 'deals' }),
      source('thsv.village-roll-call', [{ id: 'village-roll-call.checkin', name: 'checkin' }], { commandName: 'daily' }),
    ]);

    expect(result.config.definitions.map((definition) => definition.name)).toEqual(['crownme', 'earlybird', 'deals', 'daily']);
  });

  it('registers editable fun commands, including the conventional digit-leading 8ball name', () => {
    const result = buildEffectiveCommands(base, [source('thsv.village-fun-commands', [
      { id: 'village-fun.eight-ball', name: '8ball' },
      { id: 'village-fun.joke', name: 'joke' },
      { id: 'village-fun.chuck-norris', name: 'chucknorris' },
    ], { eightBallCommand: '8ball', jokeCommand: 'villagejoke', chuckNorrisEnabled: false })]);

    expect(result.config.definitions.map((definition) => definition.name)).toEqual(['8ball', 'villagejoke']);
    expect(deriveCommandEvent(chat('!8ball will this work?'), result.config)).toMatchObject({ payload: { command: '8ball' } });
  });

  it('uses saved timezone and follow-age names and marks follow age as Twitch-only', () => {
    const result = buildEffectiveCommands(base, [source('thsv.village-fun-commands', [
      { id: 'village-fun.timezone', name: 'timezone' },
      { id: 'village-fun.follow-age', name: 'followage' },
    ], { timezoneCommand: 'villagetime', followAgeCommand: 'following', followAgeEnabled: true })]);

    expect(result.addOnCommands.map((entry) => ({ name: entry.definition.name, platforms: entry.platforms }))).toEqual([
      { name: 'villagetime', platforms: ['twitch', 'youtube', 'kick', 'tiktok'] },
      { name: 'following', platforms: ['twitch'] },
    ]);
  });

  it('does not register a disabled creator-only counter command', () => {
    const disabled = buildEffectiveCommands(base, [source('thsv.custom-counter', [
      { id: 'custom-counter.command', name: 'streamcounter' },
    ], { commandEnabled: false })]);
    const enabled = buildEffectiveCommands(base, [source('thsv.custom-counter', [
      { id: 'custom-counter.command', name: 'streamcounter' },
    ], { commandEnabled: true })]);

    expect(disabled.addOnCommands).toHaveLength(0);
    expect(enabled.addOnCommands[0]?.definition.minimumRole).toBe('moderator');
  });

  it('registers hydration reminders only on selected command platforms and keeps water logging creator-only', () => {
    const result = buildEffectiveCommands(base, [source('thsv.village-hydration-station', [
      { id: 'hydration-station.remind', name: 'hydrate' },
      { id: 'hydration-station.creator', name: 'water' },
    ], { viewerRemindersEnabled: true, viewerCommand: 'drink', viewerCommandPlatforms: ['tiktok'], creatorCommandEnabled: true, creatorCommand: 'waterlog' })]);
    expect(result.addOnCommands.map((entry) => ({ name: entry.definition.name, role: entry.definition.minimumRole, platforms: entry.platforms }))).toEqual([
      { name: 'drink', role: 'viewer', platforms: ['tiktok'] },
      { name: 'waterlog', role: 'broadcaster', platforms: ['twitch', 'youtube', 'kick', 'tiktok'] },
    ]);
  });

  it('registers bounded Custom Counter shortcuts without overlapping the primary command', () => {
    const result = buildEffectiveCommands(base, [source('thsv.custom-counter', [
      { id: 'custom-counter.command', name: 'streamcounter' },
    ], {
      commandEnabled: true,
      commandName: 'streamcounter',
      commandShortcuts: ['death=deaths|Deaths', 'win=wins|Wins', 'death=other|Duplicate', 'streamcounter=wrong|Conflict', 'not valid'],
    })]);

    expect(result.config.definitions.map((definition) => definition.name)).toEqual(['streamcounter', 'death', 'win']);
    expect(result.addOnCommands.map((entry) => entry.commandId)).toEqual([
      'custom-counter.command',
      'custom-counter.shortcut.death',
      'custom-counter.shortcut.win',
    ]);
    expect(result.addOnCommands.every((entry) => entry.definition.minimumRole === 'moderator')).toBe(true);
    expect(deriveCommandEvent(chat('!death'), result.config)?.payload['targetModuleId']).toBe('thsv.custom-counter');
  });

  it('marks creator-owned collisions so command-providing add-ons cannot react to them', () => {
    const core: CommandsConfig = { enabled: true, prefix: '!', definitions: [
      { name: 'death', aliases: [], minimumRole: 'moderator', allowBots: false, source: 'manual' },
    ] };
    const result = buildEffectiveCommands(core, [source('thsv.custom-counter', [
      { id: 'custom-counter.command', name: 'streamcounter' },
    ], { commandEnabled: true, commandShortcuts: ['death=deaths|Deaths'] })]);
    expect(result.collisions).toEqual([expect.objectContaining({ commandId: 'custom-counter.shortcut.death', owner: 'creator configuration' })]);
    expect(deriveCommandEvent(chat('!death'), result.config)?.payload['targetModuleId']).toBe('core.creator-configuration');
  });

  it('registers every declared add-on command contract', async () => {
    const addOnRoot = join(process.cwd(), 'addons');
    const directories = await readdir(addOnRoot, { withFileTypes: true });
    const failures: string[] = [];
    let declared = 0;

    for (const directory of directories.filter((entry) => entry.isDirectory())) {
      const packagePath = join(addOnRoot, directory.name, 'module-package.json');
      let packageData: { manifest?: { moduleId?: string; name?: string; commandsProvided?: Array<{ id: string; name: string }> } };
      try { packageData = JSON.parse(await readFile(packagePath, 'utf8')) as typeof packageData; }
      catch { continue; }
      const manifest = packageData.manifest;
      if (!manifest?.moduleId || !Array.isArray(manifest.commandsProvided)) continue;
      for (const command of manifest.commandsProvided) {
        if (command.id === 'user-translate.language-code') continue;
        declared += 1;
        const result = buildEffectiveCommands(base, [source(manifest.moduleId, [command])]);
        const registration = result.addOnCommands.find((entry) => entry.commandId === command.id);
        if (registration === undefined) failures.push(`${manifest.moduleId}:${command.id}`);
        else if (deriveCommandEvent(chat(`!${registration.definition.name}`), result.config)?.payload['command'] !== registration.definition.name) failures.push(`${manifest.moduleId}:${command.id}:not-derived`);
      }
    }

    expect(declared).toBeGreaterThan(40);
    expect(failures).toEqual([]);
  });
});
