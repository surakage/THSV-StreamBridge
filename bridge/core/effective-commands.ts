import type { CommandsConfig, CommandDefinition } from '../../schemas/config.js';
import type { CommandDirectoryModuleSource } from './module-registry.js';

const COMMAND_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/u;

type CommandRole = CommandDefinition['minimumRole'];

interface CommandRule {
  readonly setting?: string;
  readonly aliases?: readonly string[];
  readonly minimumRole?: CommandRole;
  readonly enabledSetting?: string;
  readonly platforms?: readonly EffectiveCommandPlatform[];
  readonly platformSetting?: string;
}

export const EFFECTIVE_COMMAND_PLATFORMS = Object.freeze(['twitch', 'youtube', 'kick', 'tiktok'] as const);
export type EffectiveCommandPlatform = (typeof EFFECTIVE_COMMAND_PLATFORMS)[number];

export interface EffectiveAddOnCommand {
  readonly moduleId: string;
  readonly moduleName: string;
  readonly commandId: string;
  readonly definition: CommandDefinition;
  readonly platforms: readonly EffectiveCommandPlatform[];
}

export interface CommandRegistrationCollision {
  readonly moduleId: string;
  readonly commandId: string;
  readonly name: string;
  readonly owner: string;
}

export interface EffectiveCommandsResult {
  readonly config: CommandsConfig;
  readonly addOnCommands: readonly EffectiveAddOnCommand[];
  readonly collisions: readonly CommandRegistrationCollision[];
}

export const COMMAND_DIRECTORY_TARGET_MODULE_ID = 'core.command-directory';
export const COMMAND_DIRECTORY_COMMAND = 'commands';
export const COMMAND_DIRECTORY_ALIASES = Object.freeze(['command'] as const);

const RULES: Readonly<Record<string, CommandRule>> = Object.freeze({
  'automated-shoutouts.shoutout': { setting: 'manualCommandName', aliases: ['so'], minimumRole: 'moderator', enabledSetting: 'triggerOnManualCommand', platformSetting: 'enabledPlatforms' },
  'chat-guard.trust-viewer': { minimumRole: 'moderator' },
  'chat-play.play': { setting: 'playCommand', minimumRole: 'viewer' },
  'chat-play.guess': { setting: 'guessCommand' },
  'chat-play.answer': { setting: 'answerCommand', enabledSetting: 'triviaEnabled' },
  'chat-play.predict': { setting: 'predictCommand', enabledSetting: 'predictionEnabled' },
  'chat-play.coinflip': { setting: 'coinFlipCommand', enabledSetting: 'coinFlipEnabled' },
  'chat-play.slots': { setting: 'slotsCommand', enabledSetting: 'slotsEnabled' },
  'chat-play.roulette': { setting: 'rouletteCommand', enabledSetting: 'rouletteEnabled' },
  'chat-play.rps': { setting: 'rpsCommand', enabledSetting: 'rpsEnabled' },
  'chat-play.duel': { setting: 'duelCommand', enabledSetting: 'duelEnabled' },
  'chat-play.accept': { setting: 'acceptCommand', enabledSetting: 'duelEnabled' },
  'chat-play.decline': { setting: 'declineCommand', enabledSetting: 'duelEnabled' },
  'clip-courier.create': { platforms: ['twitch'] },
  'custom-counter.command': { setting: 'commandName', minimumRole: 'moderator', enabledSetting: 'commandEnabled' },
  'fan-crown.claim': { setting: 'commandName', platforms: ['youtube', 'tiktok'] },
  'first-five.claim': { setting: 'commandName', platforms: ['youtube', 'tiktok'] },
  'free-game-check.command': { setting: 'commandName', platforms: ['youtube', 'tiktok'] },
  'prize-wheel.spin': { setting: 'spinCommand', minimumRole: 'moderator' },
  'quote-vault.quote': { setting: 'quoteCommand', platformSetting: 'enabledPlatforms' },
  'quote-vault.quotes': { setting: 'quotesCommand', platformSetting: 'enabledPlatforms' },
  'quote-vault.submit': { setting: 'submitCommand', platformSetting: 'enabledPlatforms' },
  'quote-vault.add': { setting: 'addCommand', minimumRole: 'moderator', platformSetting: 'enabledPlatforms' },
  'quote-vault.approve': { setting: 'approveCommand', minimumRole: 'moderator', platformSetting: 'enabledPlatforms' },
  'quote-vault.reject': { setting: 'rejectCommand', minimumRole: 'moderator', platformSetting: 'enabledPlatforms' },
  'quote-vault.pending': { setting: 'pendingCommand', minimumRole: 'moderator', platformSetting: 'enabledPlatforms' },
  'quote-vault.edit': { setting: 'editCommand', minimumRole: 'moderator', platformSetting: 'enabledPlatforms' },
  'quote-vault.delete': { setting: 'deleteCommand', minimumRole: 'moderator', platformSetting: 'enabledPlatforms' },
  'quote-vault.restore': { setting: 'restoreCommand', minimumRole: 'moderator', platformSetting: 'enabledPlatforms' },
  'quote-vault.stats': { setting: 'statsCommand', minimumRole: 'moderator', platformSetting: 'enabledPlatforms' },
  'raid-scout.suggest': { setting: 'viewerSuggestionCommand', enabledSetting: 'viewerSuggestionsEnabled', platforms: ['twitch'] },
  'subathon-timer.start': { setting: 'startCommandName', minimumRole: 'moderator', enabledSetting: 'enableModeratorCommands' },
  'subathon-timer.pause': { setting: 'pauseCommandName', minimumRole: 'moderator', enabledSetting: 'enableModeratorCommands' },
  'subathon-timer.resume': { setting: 'resumeCommandName', minimumRole: 'moderator', enabledSetting: 'enableModeratorCommands' },
  'subathon-timer.reset': { setting: 'resetCommandName', minimumRole: 'moderator', enabledSetting: 'enableModeratorCommands' },
  'subathon-timer.add-time': { setting: 'addTimeCommandName', minimumRole: 'moderator', enabledSetting: 'enableModeratorCommands' },
  'user-translate.generic': { setting: 'genericCommandName', platformSetting: 'enabledPlatforms' },
  'viewer-foundation.balance': { setting: 'pointsCommand' },
  'viewer-spotlight.card': { setting: 'commandName', platforms: ['youtube', 'tiktok'], platformSetting: 'enabledPlatforms' },
  'village-draw.manage': { setting: 'giveawayCommand', minimumRole: 'moderator', platformSetting: 'eligiblePlatforms' },
  'village-draw.enter': { setting: 'enterCommand', platformSetting: 'eligiblePlatforms' },
  'village-draw.tickets': { setting: 'ticketsCommand', platformSetting: 'eligiblePlatforms' },
  'village-draw.my-tickets': { setting: 'myTicketsCommand', platformSetting: 'eligiblePlatforms' },
  'village-jukebox.request': { setting: 'requestCommand', platformSetting: 'enabledPlatforms' },
  'village-jukebox.queue': { setting: 'queueCommand', platformSetting: 'enabledPlatforms' },
  'village-jukebox.when': { setting: 'whenCommand', platformSetting: 'enabledPlatforms' },
  'village-jukebox.wrongsong': { setting: 'wrongSongCommand', platformSetting: 'enabledPlatforms' },
  'village-jukebox.voteskip': { setting: 'voteSkipCommand', platformSetting: 'enabledPlatforms' },
  'village-jukebox.skip': { setting: 'moderatorSkipCommand', minimumRole: 'moderator', platformSetting: 'enabledPlatforms' },
  'village-polls.poll': { setting: 'pollCommand', minimumRole: 'moderator' },
  'village-polls.vote': { setting: 'voteCommand' },
  'village-roll-call.checkin': { setting: 'commandName', platforms: ['youtube', 'tiktok'] },
  'village-fun.sloth-fact': { setting: 'slothFactCommand', enabledSetting: 'slothFactEnabled' },
  'village-fun.cat-fact': { setting: 'catFactCommand', enabledSetting: 'catFactEnabled' },
  'village-fun.joke': { setting: 'jokeCommand', enabledSetting: 'jokeEnabled' },
  'village-fun.fun-fact': { setting: 'funFactCommand', enabledSetting: 'funFactEnabled' },
  'village-fun.number-fact': { setting: 'numberFactCommand', enabledSetting: 'numberFactEnabled' },
  'village-fun.eight-ball': { setting: 'eightBallCommand', enabledSetting: 'eightBallEnabled' },
  'village-fun.hug': { setting: 'hugCommand', enabledSetting: 'hugEnabled' },
  'village-fun.hugs': { setting: 'hugsCommand', enabledSetting: 'hugEnabled' },
  'village-fun.timezone': { setting: 'timezoneCommand', enabledSetting: 'timezoneEnabled' },
  'village-fun.dice': { setting: 'diceCommand', enabledSetting: 'diceEnabled' },
  'village-fun.pick': { setting: 'pickCommand', enabledSetting: 'pickEnabled' },
  'village-fun.rate': { setting: 'rateCommand', enabledSetting: 'rateEnabled' },
  'village-fun.random-color': { setting: 'randomColorCommand', enabledSetting: 'randomColorEnabled' },
  'village-fun.follow-age': { setting: 'followAgeCommand', enabledSetting: 'followAgeEnabled', platforms: ['twitch'] },
  'village-fun.chuck-norris': { setting: 'chuckNorrisCommand', enabledSetting: 'chuckNorrisEnabled' },
  'village-fun.aesthetic': { setting: 'aestheticCommand', enabledSetting: 'aestheticEnabled' },
  'hydration-station.remind': { setting: 'viewerCommand', enabledSetting: 'viewerRemindersEnabled', platforms: ['youtube', 'tiktok'], platformSetting: 'viewerCommandPlatforms' },
  'hydration-station.creator': { setting: 'creatorCommand', enabledSetting: 'creatorCommandEnabled', minimumRole: 'broadcaster' },
  'viewer-lobby.join': { setting: 'joinCommand', platformSetting: 'platforms' },
  'viewer-lobby.leave': { setting: 'leaveCommand', platformSetting: 'platforms' },
  'viewer-lobby.position': { setting: 'positionCommand', platformSetting: 'platforms' },
  'viewer-lobby.queue': { setting: 'queueCommand', platformSetting: 'platforms' },
  'village-voice.speak': { setting: 'pointsCommand', enabledSetting: 'viewerRequestsEnabled', platforms: ['youtube', 'tiktok'], platformSetting: 'pointsPlatforms' },
});

/**
 * Builds the one command table used by chat intake and the public directory.
 * Creator definitions always win. A conflicting add-on command is skipped rather
 * than making the bridge or the rest of that add-on unavailable.
 */
export function buildEffectiveCommands(
  core: CommandsConfig,
  sources: readonly CommandDirectoryModuleSource[],
  options: Readonly<{ includeStopped?: boolean }> = {},
): EffectiveCommandsResult {
  const definitions: Array<CommandDefinition & { readonly targetModuleId?: string }> = (core.enabled ? core.definitions : []).flatMap((definition) => {
    if (definition.name === COMMAND_DIRECTORY_COMMAND || COMMAND_DIRECTORY_ALIASES.includes(definition.name as 'command')) return [];
    const aliases = definition.aliases.filter((alias) => alias !== COMMAND_DIRECTORY_COMMAND && !COMMAND_DIRECTORY_ALIASES.includes(alias as 'command'));
    return [{ ...definition, aliases, targetModuleId: 'core.creator-configuration' }];
  });
  const owners = new Map<string, string>();
  for (const definition of definitions) for (const name of [definition.name, ...definition.aliases]) owners.set(name, 'creator configuration');
  registerCommandDirectoryCommand(definitions, owners);
  const addOnCommands: EffectiveAddOnCommand[] = [];
  const collisions: CommandRegistrationCollision[] = [];

  for (const source of sources) {
    if (source.status === 'failed' || (source.status === 'stopped' && options.includeStopped !== true)) continue;
    if (source.settings['enabled'] === false) continue;
    for (const provided of source.commandsProvided) {
      const rule = RULES[provided.id] ?? {};
      if (rule.enabledSetting !== undefined && source.settings[rule.enabledSetting] === false) continue;
      // Language-code shortcuts are a bounded dynamic list and are registered below.
      if (provided.id === 'user-translate.language-code') continue;
      const name = commandName(rule.setting === undefined ? provided.name : source.settings[rule.setting]) || commandName(provided.name);
      if (name === undefined) continue;
      const aliases = (rule.aliases ?? []).map(commandName).filter((value): value is string => value !== undefined && value !== name);
      register(source, provided.id, name, aliases, rule.minimumRole ?? 'viewer', commandPlatforms(source, rule), definitions, owners, addOnCommands, collisions);
    }
    registerVirtualCommands(source, definitions, owners, addOnCommands, collisions);
  }
  return {
    config: { ...core, enabled: definitions.length > 0, definitions },
    addOnCommands: Object.freeze(addOnCommands),
    collisions: Object.freeze(collisions),
  };
}

function registerCommandDirectoryCommand(
  definitions: Array<CommandDefinition & { readonly targetModuleId?: string }>,
  owners: Map<string, string>,
): void {
  // This Bridge-owned command is reserved so it behaves consistently on every
  // installation without requiring a Streamer.bot Command object or trigger.
  const aliases = COMMAND_DIRECTORY_ALIASES;
  definitions.push({
    name: COMMAND_DIRECTORY_COMMAND,
    aliases: [...aliases],
    minimumRole: 'viewer',
    allowBots: false,
    source: 'synced',
    targetModuleId: COMMAND_DIRECTORY_TARGET_MODULE_ID,
  });
  owners.set(COMMAND_DIRECTORY_COMMAND, 'StreamBridge command directory');
  for (const alias of aliases) owners.set(alias, 'StreamBridge command directory');
}

export function commandName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const match = value.trim().match(/^!?([a-z0-9][a-z0-9-]{0,63})(?:\s|$)/iu)?.[1]?.toLowerCase();
  return match !== undefined && COMMAND_NAME.test(match) ? match : undefined;
}

function registerVirtualCommands(
  source: CommandDirectoryModuleSource,
  definitions: CommandDefinition[],
  owners: Map<string, string>,
  registrations: EffectiveAddOnCommand[],
  collisions: CommandRegistrationCollision[],
): void {
  if (source.moduleId === 'thsv.custom-counter' && source.settings['commandEnabled'] === true) {
    const primaryName = commandName(source.settings['commandName']) ?? 'streamcounter';
    const shortcuts = Array.isArray(source.settings['commandShortcuts']) ? source.settings['commandShortcuts'].slice(0, 20) : [];
    const seen = new Set<string>([primaryName]);
    for (const value of shortcuts) {
      const shortcut = customCounterShortcut(value);
      if (shortcut === undefined || seen.has(shortcut.command)) continue;
      seen.add(shortcut.command);
      register(source, `custom-counter.shortcut.${shortcut.command}`, shortcut.command, [], 'moderator', EFFECTIVE_COMMAND_PLATFORMS, definitions, owners, registrations, collisions);
    }
  }
  if (source.moduleId === 'thsv.viewer-foundation') {
    const lurk = commandName(source.settings['lurkCommand']);
    if (lurk !== undefined) register(source, 'viewer-foundation.lurk', lurk, [], 'viewer', EFFECTIVE_COMMAND_PLATFORMS, definitions, owners, registrations, collisions);
  }
  if (source.moduleId === 'thsv.user-translate' && source.settings['mode'] !== 'automatic') {
    const languages = Array.isArray(source.settings['languageCommands']) ? source.settings['languageCommands'].slice(0, 30) : [];
    for (const value of languages) {
      const language = commandName(value);
      if (language !== undefined) register(source, `user-translate.language.${language}`, language, [], 'viewer', commandPlatforms(source, RULES['user-translate.generic'] ?? {}), definitions, owners, registrations, collisions);
    }
  }
}

function customCounterShortcut(value: unknown): Readonly<{ command: string; counterId: string }> | undefined {
  if (typeof value !== 'string') return undefined;
  const match = value.trim().match(/^!?([a-z][a-z0-9-]{0,39})\s*=\s*([a-z][a-z0-9-]{0,39})(?:\s*\|\s*[^|\r\n]{1,80})?$/iu);
  if (match === null) return undefined;
  const command = match[1]; const counterId = match[2];
  if (command === undefined || counterId === undefined) return undefined;
  return { command: command.toLowerCase(), counterId: counterId.toLowerCase() };
}

function register(
  source: CommandDirectoryModuleSource,
  commandId: string,
  name: string,
  aliases: readonly string[],
  minimumRole: CommandRole,
  platforms: readonly EffectiveCommandPlatform[],
  definitions: CommandDefinition[],
  owners: Map<string, string>,
  registrations: EffectiveAddOnCommand[],
  collisions: CommandRegistrationCollision[],
): void {
  if (definitions.length >= 200) {
    collisions.push({ moduleId: source.moduleId, commandId, name, owner: 'command registry capacity (200)' });
    return;
  }
  const names = [name, ...aliases].slice(0, 21);
  const conflict = names.find((candidate) => owners.has(candidate));
  if (conflict !== undefined) {
    collisions.push({ moduleId: source.moduleId, commandId, name: conflict, owner: owners.get(conflict) ?? 'another command' });
    return;
  }
  const definition: CommandDefinition & { readonly targetModuleId: string } = { name, aliases: [...aliases].slice(0, 20), minimumRole, allowBots: false, source: 'synced', targetModuleId: source.moduleId };
  definitions.push(definition);
  for (const candidate of names) owners.set(candidate, source.moduleName);
  registrations.push({ moduleId: source.moduleId, moduleName: source.moduleName, commandId, definition, platforms: Object.freeze([...platforms]) });
}

function commandPlatforms(source: CommandDirectoryModuleSource, rule: CommandRule): readonly EffectiveCommandPlatform[] {
  const platforms: readonly EffectiveCommandPlatform[] = rule.platforms ?? EFFECTIVE_COMMAND_PLATFORMS;
  if (rule.platformSetting === undefined) return platforms;
  const configured = source.settings[rule.platformSetting];
  if (!Array.isArray(configured)) return platforms;
  const selected = new Set(configured.filter((value): value is EffectiveCommandPlatform =>
    typeof value === 'string' && EFFECTIVE_COMMAND_PLATFORMS.includes(value as EffectiveCommandPlatform)));
  return platforms.filter((platform) => selected.has(platform));
}
