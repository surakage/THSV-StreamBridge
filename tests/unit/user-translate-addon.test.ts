import { describe, expect, it } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-call -- executable add-on helpers are loaded from verified plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import { parseTranslationCommand } from '../../addons/user-translate/dist/index.js';

const settings = { commandPrefix: '!', genericCommandName: 'translate', languageCommands: ['en', 'es', 'fr'], maximumInputCharacters: 1000 };

describe('User Translate add-on helpers', () => {
  it('accepts language-code and generic commands without confusing the generic name for a language', () => {
    expect(parseTranslationCommand({ eventType: 'chat.message', platform: 'youtube', user: { name: 'viewer', displayName: 'Viewer' }, payload: { message: '!es hello world' } }, settings)).toEqual({ targetLanguage: 'es', inputText: 'hello world', author: 'Viewer', usedReply: false });
    expect(parseTranslationCommand({ eventType: 'chat.message', platform: 'kick', user: { name: 'viewer' }, payload: { message: '!translate fr hello' } }, settings)).toEqual({ targetLanguage: 'fr', inputText: 'hello', author: 'viewer', usedReply: false });
  });

  it('uses documented Twitch reply text and preserves the original author', () => {
    expect(parseTranslationCommand({ eventType: 'chat.message', platform: 'twitch', user: { name: 'requester' }, payload: { message: '!en', isReply: true, replyMessage: 'hola mundo', replyUserName: 'Original Author' } }, settings)).toEqual({ targetLanguage: 'en', inputText: 'hola mundo', author: 'Original Author', usedReply: true });
  });

  it('fails closed for unconfigured commands and ignores reply metadata on other platforms', () => {
    expect(parseTranslationCommand({ eventType: 'chat.message', platform: 'youtube', user: { name: 'viewer' }, payload: { message: '!it ciao' } }, settings)).toBeUndefined();
    expect(parseTranslationCommand({ eventType: 'chat.message', platform: 'youtube', user: { name: 'viewer' }, payload: { message: '!en', isReply: true, replyMessage: 'hola', replyUserName: 'Other' } }, settings)).toEqual({ targetLanguage: 'en', inputText: '', author: 'viewer', usedReply: false });
  });
});
