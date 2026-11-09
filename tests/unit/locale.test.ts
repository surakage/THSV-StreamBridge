import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CommandsConfig } from '../../schemas/config.js';
import { bridgeConfigSchema } from '../../schemas/config.js';
import { buildEffectiveCommands, type EffectiveCommandsResult } from '../../bridge/core/effective-commands.js';
import { commandMatchKey, toCommandName } from '../../bridge/core/command-names.js';
import { catalog, DEFAULT_LANGUAGE, languageOrDefault, SUPPORTED_LANGUAGE_CODES, SUPPORTED_LANGUAGES, t } from '../../bridge/core/locale.js';
import { languageSettingDefaults, TRANSLATE_MODULE_ID } from '../../bridge/core/language-defaults.js';
import { deriveCommandEvent } from '../../bridge/core/multi-commands.js';
import { overlayStrings } from '../../bridge/core/browser-overlay.js';
import type { CommandDirectoryModuleSource } from '../../bridge/core/module-registry.js';
import { validateSettings } from '../../bridge/services/addon-wizard-service.js';
import { WizardConfigurationGateway } from '../../bridge/services/wizard-configuration.js';
import type { NormalizedEvent } from '../../schemas/event.js';
import { testConfig } from '../helpers.js';

const base: CommandsConfig = { enabled: true, prefix: '!', definitions: [] };

function source(moduleId: string, commandsProvided: CommandDirectoryModuleSource['commandsProvided'], settings: Readonly<Record<string, unknown>> = {}): CommandDirectoryModuleSource {
  return { moduleId, moduleName: moduleId, status: 'healthy', commandsProvided, settings };
}

function chat(message: string): NormalizedEvent {
  return {
    schemaVersion: '1.0.0', eventId: 'chat-1', eventType: 'chat.message', platform: 'twitch',
    source: { adapter: 'test', eventId: 'chat-1', eventName: 'ChatMessage' }, receivedAt: '2026-11-05T12:00:00.000Z',
    channel: { id: 'channel-1', name: 'channel' }, user: { id: 'viewer-1', name: 'viewer', displayName: 'Viewer', actorType: 'human', roles: ['viewer'] },
    payload: { message }, metadata: { simulated: false },
  };
}

interface ShippedAddOn { readonly moduleId: string; readonly commands: CommandDirectoryModuleSource['commandsProvided']; readonly schema: { properties?: Record<string, { default?: unknown; type?: string }> } }

async function shippedAddOns(): Promise<ShippedAddOn[]> {
  const addOns: ShippedAddOn[] = [];
  for (const directory of (await readdir('addons', { withFileTypes: true })).filter((entry) => entry.isDirectory())) {
    let packageData: { manifest?: { moduleId?: string; commandsProvided?: Array<{ id: string; name: string }>; configurationSchema?: string } };
    try { packageData = JSON.parse(await readFile(join('addons', directory.name, 'module-package.json'), 'utf8')) as typeof packageData; } catch { continue; }
    const manifest = packageData.manifest;
    if (manifest?.moduleId === undefined || !Array.isArray(manifest.commandsProvided)) continue;
    let schema: ShippedAddOn['schema'] = {};
    try { schema = JSON.parse(await readFile(join('addons', directory.name, manifest.configurationSchema ?? 'schemas/config.json'), 'utf8')) as ShippedAddOn['schema']; } catch { /* Declarative add-ons have no settings. */ }
    addOns.push({ moduleId: manifest.moduleId, commands: manifest.commandsProvided, schema });
  }
  return addOns;
}

/** Every shipped add-on with its published default settings and every on/off switch turned on. */
async function shippedSources(): Promise<CommandDirectoryModuleSource[]> {
  return (await shippedAddOns()).map((addOn) => source(addOn.moduleId, addOn.commands, Object.fromEntries(Object.entries(addOn.schema.properties ?? {})
    .filter(([, property]) => property.default !== undefined || property.type === 'boolean')
    .map(([key, property]) => [key, property.type === 'boolean' ? true : property.default]))));
}

function aliasesOf(result: EffectiveCommandsResult, commandId: string): readonly string[] | undefined {
  return result.addOnCommands.find((entry) => entry.commandId === commandId)?.definition.aliases;
}

const coinflip = source('thsv.chat-play-pack', [{ id: 'chat-play.coinflip', name: 'coinflip' }]);
const englishCatalog = catalog(DEFAULT_LANGUAGE);
const translatedLanguages = SUPPORTED_LANGUAGE_CODES.filter((language) => language !== DEFAULT_LANGUAGE);

describe('language setting', () => {
  it('lists the nine supported languages with their own names and defaults to English', async () => {
    expect(SUPPORTED_LANGUAGES.map((language) => language.code)).toEqual(['en', 'es', 'de', 'fr', 'ja', 'pt-BR', 'it', 'zh-CN', 'ko']);
    expect(SUPPORTED_LANGUAGES.find((language) => language.code === 'ja')?.nativeName).toBe('日本語');
    expect(languageOrDefault('ru')).toBe('en');
    const config = await testConfig();
    const withoutLanguage: Record<string, unknown> = { ...config };
    delete withoutLanguage['language'];
    expect(bridgeConfigSchema.parse(withoutLanguage).language).toBe('en');
    expect(bridgeConfigSchema.parse({ ...config, language: 'zh-CN' }).language).toBe('zh-CN');
    expect(bridgeConfigSchema.safeParse({ ...config, language: 'ru' }).success).toBe(false);
  });

  it('falls back to the English text for keys a language does not translate', () => {
    expect(t('es', 'command.chat-play.coinflip', 'coinflip')).toBe('moneda');
    expect(t('es', 'not.a.key', 'English text')).toBe('English text');
    expect(t('en', 'command.chat-play.coinflip', 'coinflip')).toBe('coinflip');
  });

  it('stages a language through the wizard, and choosing English leaves the config file without the key', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'thsv-language-'));
    const path = join(directory, 'bridge.json');
    await writeFile(path, await readFile('config/bridge.example.json', 'utf8'));
    const gateway = new WizardConfigurationGateway(path, () => [], join(directory, 'backups'));
    expect(await gateway.snapshot()).toMatchObject({ language: 'en' });
    expect(await gateway.export()).not.toHaveProperty('language');
    let draft = await gateway.begin();
    expect(() => gateway.stage(draft.id, { kind: 'language', language: 'ru' })).toThrow('Staged configuration change is invalid');
    gateway.stage(draft.id, { kind: 'language', language: 'ja' });
    await gateway.commit(draft.id);
    expect((await gateway.export()).language).toBe('ja');
    draft = await gateway.begin();
    gateway.stage(draft.id, { kind: 'language', language: 'en' });
    await gateway.commit(draft.id);
    expect(JSON.parse(await readFile(path, 'utf8'))).not.toHaveProperty('language');
  });
});

describe('translated command names', () => {
  it('leaves English exactly as before', async () => {
    const sources = await shippedSources();
    const core: CommandsConfig = { ...base, definitions: [{ name: 'discord', aliases: ['dc'], minimumRole: 'viewer', allowBots: false, source: 'synced' }] };
    const without = buildEffectiveCommands(core, sources);
    expect(buildEffectiveCommands(core, sources, { language: 'en' })).toEqual(without);
    expect(without.config.definitions.find((definition) => definition.name === 'commands')?.aliases).toEqual(['command']);
  });

  it('adds the translated name next to the English name in Spanish, for add-on commands, lurk and the directory', () => {
    const result = buildEffectiveCommands(base, [coinflip, source('thsv.viewer-foundation', [{ id: 'viewer-foundation.balance', name: 'points' }], { pointsCommand: 'points', lurkCommand: 'lurk' })], { language: 'es' });
    expect(aliasesOf(result, 'chat-play.coinflip')).toEqual(['moneda']);
    expect(aliasesOf(result, 'viewer-foundation.balance')).toEqual(['puntos']);
    expect(aliasesOf(result, 'viewer-foundation.lurk')).toEqual(['acechar']);
    expect(result.config.definitions.find((definition) => definition.name === 'commands')?.aliases).toEqual(['command', 'comandos']);
    expect(result.collisions).toEqual([]);
    // Both names reach the same command, which add-ons receive under its English name.
    expect(deriveCommandEvent(chat('!moneda'), result.config)?.payload).toMatchObject({ command: 'coinflip', invokedAs: 'moneda' });
    expect(deriveCommandEvent(chat('!coinflip'), result.config)?.payload).toMatchObject({ command: 'coinflip' });
    expect(deriveCommandEvent(chat('!comandos'), result.config)?.payload).toMatchObject({ command: 'commands' });
  });

  it('keeps existing English aliases and matches Japanese aliases typed full-width', () => {
    const result = buildEffectiveCommands(base, [source('thsv.automated-shoutouts', [{ id: 'automated-shoutouts.shoutout', name: 'shoutout' }], { manualCommandName: 'shoutout', triggerOnManualCommand: true })], { language: 'ja' });
    expect(aliasesOf(result, 'automated-shoutouts.shoutout')).toEqual(['so', '紹介']);
    expect(deriveCommandEvent(chat('！紹介 friend'), result.config)?.payload).toMatchObject({ command: 'shoutout', arguments: ['friend'] });
  });

  it('gives a renamed command no translated name', () => {
    const result = buildEffectiveCommands(base, [source('thsv.chat-play-pack', [{ id: 'chat-play.coinflip', name: 'coinflip' }], { coinFlipCommand: 'flip' })], { language: 'es' });
    expect(result.addOnCommands.find((entry) => entry.commandId === 'chat-play.coinflip')?.definition).toMatchObject({ name: 'flip', aliases: [] });
  });

  it('skips a translated name that is already taken and keeps the command', () => {
    const creator: CommandsConfig = { ...base, definitions: [{ name: 'moneda', aliases: [], minimumRole: 'viewer', allowBots: false, source: 'synced' }] };
    const result = buildEffectiveCommands(creator, [coinflip], { language: 'es' });
    expect(result.addOnCommands.find((entry) => entry.commandId === 'chat-play.coinflip')?.definition).toMatchObject({ name: 'coinflip', aliases: [] });
    expect(result.collisions).toEqual([]);
    expect(deriveCommandEvent(chat('!moneda'), result.config)?.payload['command']).toBe('moneda');

    // A later add-on whose own name matches the translation keeps that name too.
    const later = source('thsv.custom-counter', [{ id: 'custom-counter.command', name: 'streamcounter' }], { commandEnabled: true, commandName: 'moneda' });
    const both = buildEffectiveCommands(base, [coinflip, later], { language: 'es' });
    expect(both.collisions).toEqual([]);
    expect(aliasesOf(both, 'chat-play.coinflip')).toEqual([]);
    expect(both.addOnCommands.find((entry) => entry.commandId === 'custom-counter.command')?.definition.name).toBe('moneda');
  });

  it('registers every translated name for every shipped add-on without collisions', async () => {
    const sources = await shippedSources();
    const english = buildEffectiveCommands(base, sources);
    for (const language of translatedLanguages) {
      const result = buildEffectiveCommands(base, sources, { language });
      expect(result.collisions, language).toEqual(english.collisions);
      expect(result.addOnCommands.map((entry) => entry.definition.name), language).toEqual(english.addOnCommands.map((entry) => entry.definition.name));
      for (const [key, alias] of Object.entries(catalog(language)).filter(([entry]) => entry.startsWith('command.'))) {
        const commandId = key.slice('command.'.length);
        const aliases = commandId === 'core.command-directory'
          ? result.config.definitions.find((definition) => definition.name === 'commands')?.aliases
          : aliasesOf(result, commandId);
        expect(aliases, `${language} ${key}`).toContain(alias);
      }
    }
  });
});

describe('command name catalogs', () => {
  it('only translate known commands, whose English names match the shipped add-on defaults', async () => {
    const registered = new Map(buildEffectiveCommands(base, await shippedSources()).addOnCommands.map((entry) => [entry.commandId, entry.definition.name]));
    // Catalogs also hold on-stream wording (setting.*, alert.*); these checks cover command names.
    for (const [key, english] of Object.entries(englishCatalog).filter(([entry]) => entry.startsWith('command.'))) {
      const commandId = key.slice('command.'.length);
      expect(commandId === 'core.command-directory' ? 'commands' : registered.get(commandId), key).toBe(english);
    }
    for (const language of translatedLanguages) {
      for (const key of Object.keys(catalog(language))) expect(englishCatalog[key], `${language} ${key}`).toBeDefined();
    }
  });

  it('use valid, distinct chat command names in every language', () => {
    const englishNames = new Set([...Object.entries(englishCatalog).filter(([key]) => key.startsWith('command.')).map(([, name]) => name), 'command', 'so'].map(commandMatchKey));
    for (const language of translatedLanguages) {
      const seen = new Map<string, string>();
      for (const [key, alias] of Object.entries(catalog(language)).filter(([entry]) => entry.startsWith('command.'))) {
        expect(toCommandName(alias), `${language} ${key}`).toBe(alias);
        expect(englishNames.has(commandMatchKey(alias)), `${language} ${key} reuses an English name`).toBe(false);
        const previous = seen.get(commandMatchKey(alias));
        expect(previous, `${language} ${key} matches ${previous ?? ''}`).toBeUndefined();
        seen.set(commandMatchKey(alias), key);
      }
      expect(seen.size, language).toBeGreaterThan(50);
    }
  });

  it('are one file per supported language with no empty text', async () => {
    for (const file of await readdir('bridge/locales')) {
      const parsed = JSON.parse(await readFile(join('bridge/locales', file), 'utf8')) as Record<string, unknown>;
      expect(SUPPORTED_LANGUAGE_CODES.map((code) => `${code}.json`)).toContain(file);
      for (const value of Object.values(parsed)) expect(typeof value === 'string' && value.trim().length > 0, file).toBe(true);
    }
  });
});

describe('Translate defaults follow the language', () => {
  async function translateSchema(): Promise<unknown> {
    return JSON.parse(await readFile('addons/user-translate/schemas/config.json', 'utf8')) as unknown;
  }

  it('change nothing in English', async () => {
    const schema = await translateSchema();
    expect(languageSettingDefaults(TRANSLATE_MODULE_ID, 'en')).toEqual({});
    expect(validateSettings(schema, {}, true, languageSettingDefaults(TRANSLATE_MODULE_ID, 'en'))).toEqual(validateSettings(schema, {}, true));
  });

  it('speak, caption and translate chat in the chosen language, with English captions underneath', async () => {
    const schema = await translateSchema();
    const spanish = validateSettings(schema, {}, true, languageSettingDefaults(TRANSLATE_MODULE_ID, 'es'));
    expect(spanish).toMatchObject({ voiceSourceLanguage: 'es', targetLanguage: 'es', voiceBilingualLanguages: ['en'], voicePushToTalkLanguages: ['en'] });
    expect(spanish['voiceLanguages']).toEqual(['en', 'fr', 'de', 'pt', 'ja', 'ko', 'zh-cn']);
    expect(validateSettings(schema, {}, true, languageSettingDefaults(TRANSLATE_MODULE_ID, 'pt-BR'))).toMatchObject({ voiceSourceLanguage: 'pt', targetLanguage: 'pt' });
    expect(validateSettings(schema, {}, true, languageSettingDefaults(TRANSLATE_MODULE_ID, 'zh-CN'))).toMatchObject({ voiceSourceLanguage: 'zh-cn', targetLanguage: 'zh-cn' });
    expect(languageSettingDefaults('thsv.no-such-addon', 'es')).toEqual({});
  });

  it('never override a setting the creator saved', async () => {
    const schema = await translateSchema();
    const saved = validateSettings(schema, { targetLanguage: 'en', voiceSourceLanguage: 'auto', voiceBilingualLanguages: ['fr'] }, false, languageSettingDefaults(TRANSLATE_MODULE_ID, 'ja'));
    expect(saved).toMatchObject({ targetLanguage: 'en', voiceSourceLanguage: 'auto', voiceBilingualLanguages: ['fr'], voicePushToTalkLanguages: ['en'] });
  });

  it('are valid Translate settings in every language', async () => {
    const schema = await translateSchema();
    for (const language of SUPPORTED_LANGUAGE_CODES) {
      const defaults = languageSettingDefaults(TRANSLATE_MODULE_ID, language);
      // validateSettingValue falls back to the add-on default for an invalid override, so equality proves each one is accepted.
      expect(validateSettings(schema, {}, true, defaults), language).toMatchObject(defaults);
    }
  });
});

describe('built-in overlay wording', () => {
  it('is keyed by its English text, keeps every {placeholder}, and is empty in English', async () => {
    const english = JSON.parse(await readFile('bridge/locales/en.json', 'utf8')) as Record<string, string>;
    const overlayKeys = Object.keys(english).filter((key) => key.startsWith('overlay.'));
    expect(overlayKeys.length).toBeGreaterThan(100);
    for (const key of overlayKeys) expect(english[key], key).toBe(key.slice('overlay.'.length));
    expect(overlayStrings(DEFAULT_LANGUAGE)).toEqual({});
    const placeholders = (text: string): string[] => [...text.matchAll(/\{\w+\}/gu)].map((match) => match[0]).sort();
    for (const language of SUPPORTED_LANGUAGE_CODES.filter((code) => code !== DEFAULT_LANGUAGE)) {
      const strings = overlayStrings(language);
      expect(Object.keys(strings).sort(), language).toEqual(overlayKeys.map((key) => key.slice('overlay.'.length)).sort());
      for (const [source, text] of Object.entries(strings)) expect(placeholders(text), `${language} ${source}`).toEqual(placeholders(source));
    }
    expect(overlayStrings('de')['OWED']).toBe('OFFEN');
  });
});
