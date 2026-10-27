import { describe, expect, it } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-call -- executable add-on helpers are loaded from verified plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import { looksLikeEnglish, parseTranslationCommand, resetTranslateRuntime, shouldAutomaticallyTranslate } from '../../addons/user-translate/dist/index.js';

const settings = { commandPrefix: '!', genericCommandName: 'translate', languageCommands: ['en', 'es', 'fr'], targetLanguage: 'en', maximumInputCharacters: 1000 };

describe('User Translate add-on helpers', () => {
  it('accepts language-code and generic commands without confusing the generic name for a language', () => {
    expect(parseTranslationCommand({ eventType: 'chat.message', platform: 'youtube', user: { name: 'viewer', displayName: 'Viewer' }, payload: { message: '!es hello world' } }, settings)).toEqual({ targetLanguage: 'es', inputText: 'hello world', author: 'Viewer', usedReply: false });
    expect(parseTranslationCommand({ eventType: 'chat.message', platform: 'kick', user: { name: 'viewer' }, payload: { message: '!translate fr hello' } }, settings)).toEqual({ targetLanguage: 'fr', inputText: 'hello', author: 'viewer', usedReply: false });
    expect(parseTranslationCommand({ eventType: 'chat.message', platform: 'kick', user: { name: 'viewer' }, payload: { message: '!translate buenos dias' } }, settings)).toEqual({ targetLanguage: 'en', inputText: 'buenos dias', author: 'viewer', usedReply: false });
  });

  it('uses documented Twitch reply text and preserves the original author', () => {
    expect(parseTranslationCommand({ eventType: 'chat.message', platform: 'twitch', user: { name: 'requester' }, payload: { message: '!en', isReply: true, replyMessage: 'hola mundo', replyUserName: 'Original Author' } }, settings)).toEqual({ targetLanguage: 'en', inputText: 'hola mundo', author: 'Original Author', usedReply: true });
  });

  it('fails closed for unconfigured commands and ignores reply metadata on other platforms', () => {
    expect(parseTranslationCommand({ eventType: 'chat.message', platform: 'youtube', user: { name: 'viewer' }, payload: { message: '!it ciao' } }, settings)).toBeUndefined();
    expect(parseTranslationCommand({ eventType: 'chat.message', platform: 'youtube', user: { name: 'viewer' }, payload: { message: '!en', isReply: true, replyMessage: 'hola', replyUserName: 'Other' } }, settings)).toEqual({ targetLanguage: 'en', inputText: '', author: 'viewer', usedReply: false });
  });

  it('combines privacy-gated automatic translation without translating commands', () => {
    resetTranslateRuntime();
    const automatic = { ...settings, enabled: true, mode: 'both', enabledPlatforms: ['twitch'], provider: 'google-web', sourceLanguage: 'auto', automaticAudienceMode: 'allowlist-only', automaticAllowedNames: ['viewer'], automaticIgnoredNames: [], maximumTranslationsPerMinute: 10, percentageWindowMessages: 100, percentageMinimumSample: 10, maximumTranslatedPercentage: 25 };
    const base = { eventId: 'auto-1', eventType: 'chat.message', platform: 'twitch', metadata: { simulated: false }, user: { id: '1', name: 'viewer', actorType: 'human' }, payload: { message: 'buenos dias' } };
    expect(shouldAutomaticallyTranslate(base, automatic, 1_000)).toMatchObject({ accepted: true, mode: 'automatic', sourceLanguage: 'auto', targetLanguage: 'en', inputText: 'buenos dias' });
    expect(shouldAutomaticallyTranslate({ ...base, eventId: 'auto-2', payload: { message: '!translate buenos dias' } }, automatic, 1_001)).toEqual({ accepted: false, reason: 'command' });
  });

  it('keeps ordinary English chat away from the translator and lets other languages through', () => {
    for (const english of ['gg wp that was close', 'lol', 'Hello everyone, how is the stream going?', 'PogChamp PogChamp', '1234 !!!', 'https://example.com/clip']) expect(looksLikeEnglish(english), english).toBe(true);
    for (const foreign of ['hola como estas', 'buenos dias', 'tudo bem? obrigado', 'merci beaucoup pour le stream', 'danke, sehr gut', 'Привет всем', 'こんにちは', '¿qué pasó?']) expect(looksLikeEnglish(foreign), foreign).toBe(false);
    resetTranslateRuntime();
    const automatic = { ...settings, enabled: true, mode: 'automatic', enabledPlatforms: ['youtube'], provider: 'google-web', sourceLanguage: 'auto', automaticAudienceMode: 'all-viewers', automaticAllowedNames: [], automaticIgnoredNames: [], maximumTranslationsPerMinute: 10, percentageWindowMessages: 100, percentageMinimumSample: 10, maximumTranslatedPercentage: 100 };
    const base = { eventId: 'yt-1', eventType: 'chat.message', platform: 'youtube', metadata: { simulated: false }, user: { id: '1', name: 'viewer', actorType: 'human' }, payload: { message: 'what game is this' } };
    expect(shouldAutomaticallyTranslate(base, automatic, 1_000)).toEqual({ accepted: false, reason: 'looks-english' });
    expect(shouldAutomaticallyTranslate({ ...base, eventId: 'yt-2', payload: { message: 'que juego es este' } }, automatic, 1_001)).toMatchObject({ accepted: true, platform: 'youtube' });
    expect(shouldAutomaticallyTranslate({ ...base, eventId: 'yt-3' }, { ...automatic, detectLanguageLocally: false }, 1_002)).toMatchObject({ accepted: true });
  });
});
