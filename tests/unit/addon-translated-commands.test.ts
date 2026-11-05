import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- executable add-on entrypoints are plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import quoteVault, { resetQuoteVaultRuntime } from '../../addons/quote-vault/dist/index.js';
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import userTranslate, { resetTranslateRuntime } from '../../addons/user-translate/dist/index.js';
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import viewerLobby from '../../addons/viewer-lobby/dist/index.js';
import type { CommandsConfig } from '../../schemas/config.js';
import { buildEffectiveCommands } from '../../bridge/core/effective-commands.js';
import type { LanguageCode } from '../../bridge/core/locale.js';
import { deriveCommandEvent } from '../../bridge/core/multi-commands.js';
import type { CommandDirectoryModuleSource } from '../../bridge/core/module-registry.js';
import type { NormalizedEvent } from '../../schemas/event.js';

interface AddOn { onEvent(event: unknown, context: unknown): Promise<void> }

const TRANSLATE_ACTION_ID = 'a6c9d452-7627-4bc2-b0b3-46735d8aa120';
const base: CommandsConfig = { enabled: true, prefix: '!', definitions: [] };

/** The add-on as the bridge registers it: its shipped commands with its default settings plus any overrides. */
async function shippedSource(folder: string, settings: Record<string, unknown> = {}): Promise<CommandDirectoryModuleSource> {
  const packageData = JSON.parse(await readFile(join('addons', folder, 'module-package.json'), 'utf8')) as { manifest: { moduleId: string; name: string; commandsProvided: CommandDirectoryModuleSource['commandsProvided'] } };
  const schema = JSON.parse(await readFile(join('addons', folder, 'schemas/config.json'), 'utf8')) as { properties: Record<string, { default?: unknown }> };
  const defaults = Object.fromEntries(Object.entries(schema.properties).filter(([, property]) => property.default !== undefined).map(([key, property]) => [key, property.default]));
  return { moduleId: packageData.manifest.moduleId, moduleName: packageData.manifest.name, status: 'healthy', commandsProvided: packageData.manifest.commandsProvided, settings: { ...defaults, enabled: true, ...settings } };
}

function chat(message: string, id: string, roles: string[] = []): NormalizedEvent {
  return {
    schemaVersion: '1.0.0', eventId: id, eventType: 'chat.message', platform: 'twitch',
    source: { adapter: 'test', eventId: id, eventName: 'ChatMessage' }, receivedAt: '2026-11-05T12:00:00.000Z',
    channel: { id: 'channel-1', name: 'channel' }, user: { id: `viewer-${id}`, name: 'viewer', displayName: 'Viewer', actorType: 'human', roles },
    payload: { message }, metadata: { simulated: false },
  };
}

/**
 * Delivers one chat message the way the bridge does: the chat event itself, then the command event it
 * derives when the text names a registered command (which the bridge sends only to the owning add-on).
 */
async function deliver(addOn: AddOn, context: unknown, source: CommandDirectoryModuleSource, language: LanguageCode, event: NormalizedEvent): Promise<NormalizedEvent | undefined> {
  const config = buildEffectiveCommands(base, [source], { language }).config;
  const command = deriveCommandEvent(event, config);
  await addOn.onEvent(event, context);
  if (command !== undefined && command.payload['targetModuleId'] === source.moduleId) await addOn.onEvent({ ...command, metadata: { ...command.metadata, bridgeSequence: 2 } }, context);
  return command;
}

function stateContext(settings: Record<string, unknown>, initialState: Record<string, unknown> = {}) {
  let state = initialState;
  return {
    value: () => state,
    context: {
      settings: { enabled: true, ...settings },
      approvedActionIds: [TRANSLATE_ACTION_ID],
      state: { read: vi.fn(async () => state), write: vi.fn(async (value: Record<string, unknown>) => { state = value; }) },
      chat: { send: vi.fn(async () => []) },
      overlay: { publish: vi.fn(async () => {}) },
      streamerbot: { runApprovedAction: vi.fn(async () => undefined) },
      schedule: { after: vi.fn(() => 'timer'), cancel: vi.fn(() => true) },
    },
  };
}

afterEach(async () => {
  await quoteVault.stop();
  resetQuoteVaultRuntime();
  await viewerLobby.stop();
  resetTranslateRuntime();
});

describe('add-ons that read chat directly also answer to translated command names', () => {
  it('Viewer Lobby: !unirse joins in Spanish exactly once, and !join still joins once', async () => {
    // Moderators skip the lobby's short repeat cooldown, so a second delivery would show up as a second reply.
    const source = await shippedSource('viewer-lobby');
    const lobby = stateContext({ platforms: ['twitch'], allowGamertag: true }, { status: 'open', revision: 1, entries: [] });
    await viewerLobby.start(lobby.context);
    const command = await deliver(viewerLobby, lobby.context, source, 'es', chat('!unirse MyTag', 'join-es', ['moderator']));
    expect(command?.payload).toMatchObject({ command: 'join', invokedAs: 'unirse', targetModuleId: 'thsv.viewer-lobby' });
    expect(lobby.value()['entries']).toEqual([expect.objectContaining({ identity: 'twitch:id:viewer-join-es', gamertag: 'MyTag', state: 'waiting' })]);
    expect(lobby.context.chat.send).toHaveBeenCalledTimes(1);

    await deliver(viewerLobby, lobby.context, source, 'es', chat('!join', 'join-en', ['moderator']));
    expect((lobby.value()['entries'] as Array<{ identity: string }>).map((entry) => entry.identity)).toEqual(['twitch:id:viewer-join-es', 'twitch:id:viewer-join-en']);
    expect(lobby.context.chat.send).toHaveBeenCalledTimes(2);

    // Japanese viewers can type the full-width ！ their keyboard gives them.
    await deliver(viewerLobby, lobby.context, source, 'ja', chat('！順番', 'position-ja', ['moderator']));
    expect(lobby.context.chat.send).toHaveBeenCalledTimes(3);
    expect(lobby.context.chat.send).toHaveBeenLastCalledWith(expect.objectContaining({ message: 'You are not waiting in the viewer lobby.' }));
  });

  it('Viewer Lobby: English, a renamed command and a command event from elsewhere get no translated handling', async () => {
    const lobby = stateContext({ platforms: ['twitch'] }, { status: 'open', revision: 1, entries: [] });
    await viewerLobby.start(lobby.context);
    await deliver(viewerLobby, lobby.context, await shippedSource('viewer-lobby'), 'en', chat('!unirse', 'en-only'));
    const renamed = await shippedSource('viewer-lobby', { joinCommand: 'play' });
    lobby.context.settings = { ...lobby.context.settings, joinCommand: 'play' } as typeof lobby.context.settings;
    expect(await deliver(viewerLobby, lobby.context, renamed, 'es', chat('!unirse', 'renamed'))).toBeUndefined();
    const derived = deriveCommandEvent(chat('!unirse', 'other'), buildEffectiveCommands(base, [await shippedSource('viewer-lobby')], { language: 'es' }).config);
    await viewerLobby.onEvent({ ...derived, source: { adapter: 'streamerbot', eventId: 'other', eventName: 'CommandTriggered' } }, lobby.context);
    expect(lobby.value()['entries']).toEqual([]);
    expect(lobby.context.chat.send).not.toHaveBeenCalled();
  });

  it('Quote Vault: Spanish names reach the same commands with their text, each message handled once', async () => {
    const source = await shippedSource('quote-vault');
    const vault = stateContext({ enabledPlatforms: ['twitch'], moderatorBypassCooldowns: true, seedStarterQuotes: false });
    await quoteVault.start(vault.context);
    await deliver(quoteVault, vault.context, source, 'es', chat('!añadircita @Bloom | Hola, ¿qué tal?', 'add-es', ['moderator']));
    expect((vault.value()['approved'] as Array<{ text: string; quotedName: string }>).map((quote) => [quote.quotedName, quote.text])).toEqual([['Bloom', 'Hola, ¿qué tal?']]);
    vault.context.chat.send.mockClear();

    await deliver(quoteVault, vault.context, source, 'es', chat('!resumencitas', 'stats-es', ['moderator']));
    expect(vault.context.chat.send).toHaveBeenCalledTimes(1);
    expect(vault.context.chat.send).toHaveBeenLastCalledWith(expect.objectContaining({ message: expect.stringContaining('Quote Vault: 1 approved') }));
    await deliver(quoteVault, vault.context, source, 'es', chat('!quotestats', 'stats-en', ['moderator']));
    expect(vault.context.chat.send).toHaveBeenCalledTimes(2);
    await deliver(quoteVault, vault.context, source, 'ja', chat('！名言数', 'count-ja', ['moderator']));
    expect(vault.context.chat.send).toHaveBeenCalledTimes(3);
    expect(vault.context.chat.send).toHaveBeenLastCalledWith(expect.objectContaining({ message: 'Quote Vault has 1 approved quote and 0 pending.' }));
  });

  it('Translate: !traducir asks for a translation once and !translate still works once', async () => {
    const source = await shippedSource('user-translate');
    const translate = stateContext({ mode: 'manual', enabledPlatforms: ['twitch'], globalCooldownSeconds: 0, userCooldownSeconds: 0 });
    await userTranslate.start(translate.context);
    const command = await deliver(userTranslate, translate.context, source, 'es', chat('!traducir fr buenos días', 'translate-es'));
    expect(command?.payload).toMatchObject({ command: 'translate', invokedAs: 'traducir' });
    const requests = () => translate.context.streamerbot.runApprovedAction.mock.calls.filter((call: unknown[]) => call[0] === TRANSLATE_ACTION_ID).map((call: unknown[]) => call[1]);
    expect(requests()).toEqual([expect.objectContaining({ text: 'buenos días', targetLanguage: 'fr' })]);

    await deliver(userTranslate, translate.context, source, 'es', chat('!translate hola', 'translate-en'));
    expect(requests()).toHaveLength(2);

    // The usage hint has no cooldown, so a second delivery would show up as a second message.
    await deliver(userTranslate, translate.context, source, 'ko', chat('!번역', 'tutorial-ko'));
    expect(translate.context.chat.send).toHaveBeenCalledTimes(1);
    await userTranslate.stop(translate.context);
  });
});
