import { beforeEach, describe, expect, it } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-call -- executable add-on helpers are verified plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import { resetAutoTranslateRuntime, shouldTranslateMessage } from '../../addons/auto-translate/dist/index.js';

const settings = {
  enabled: true, enabledPlatforms: ['twitch', 'youtube', 'kick', 'tiktok'], audienceMode: 'allowlist-only', allowedNames: ['viewer'], ignoredNames: [],
  sourceLanguage: 'es', targetLanguage: 'en', commandPrefix: '!', maximumInputCharacters: 500,
  maximumTranslationsPerMinute: 10, percentageWindowMessages: 100, percentageMinimumSample: 10, maximumTranslatedPercentage: 25,
};
const event = { eventId: 'chat-1', eventType: 'chat.message', platform: 'twitch', user: { id: '1', name: 'viewer', displayName: 'Viewer', actorType: 'human' }, payload: { message: 'hola mundo' }, metadata: { simulated: false } };

describe('Auto Translate selection policy', () => {
  beforeEach(() => resetAutoTranslateRuntime());

  it('accepts only an allowlisted human message for an explicit language pair', () => {
    expect(shouldTranslateMessage(event, settings, 1_000)).toMatchObject({ accepted: true, message: 'hola mundo', platform: 'twitch', sourceLanguage: 'es', targetLanguage: 'en', author: 'Viewer' });
  });

  it('fails closed for disabled, ignored, bot, command, simulated, and same-language messages', () => {
    expect(shouldTranslateMessage(event, { ...settings, enabled: false }, 1_000)).toMatchObject({ accepted: false });
    expect(shouldTranslateMessage(event, { ...settings, ignoredNames: ['viewer'] }, 1_000)).toMatchObject({ reason: 'ignored' });
    expect(shouldTranslateMessage({ ...event, user: { ...event.user, actorType: 'bot' } }, settings, 1_000)).toMatchObject({ reason: 'actor' });
    expect(shouldTranslateMessage({ ...event, payload: { message: '!help' } }, settings, 1_000)).toMatchObject({ reason: 'command' });
    expect(shouldTranslateMessage({ ...event, metadata: { simulated: true } }, settings, 1_000)).toMatchObject({ accepted: false });
    expect(shouldTranslateMessage({ ...event, eventId: 'same-language' }, { ...settings, targetLanguage: 'es' }, 1_000)).toMatchObject({ reason: 'languages' });
  });

  it('requires the allowlist by default and suppresses duplicate event IDs', () => {
    expect(shouldTranslateMessage({ ...event, eventId: 'not-allowed' }, { ...settings, allowedNames: [] }, 1_000)).toMatchObject({ reason: 'not-allowed' });
    expect(shouldTranslateMessage(event, settings, 1_000)).toMatchObject({ accepted: true });
    expect(shouldTranslateMessage(event, settings, 1_001)).toMatchObject({ reason: 'duplicate' });
  });

  it('measures its translated-message cap against eligible public chat, not only allowlisted messages', () => {
    const percentageSettings = { ...settings, percentageMinimumSample: 5, maximumTranslatedPercentage: 25 };
    for (let index = 0; index < 4; index += 1) {
      const suffix = String(index);
      expect(shouldTranslateMessage({ ...event, eventId: `other-${suffix}`, user: { ...event.user, name: `other-${suffix}`, displayName: `Other ${suffix}` } }, percentageSettings, 2_000 + index)).toMatchObject({ reason: 'not-allowed' });
    }
    expect(shouldTranslateMessage({ ...event, eventId: 'allowed-after-chat' }, percentageSettings, 2_010)).toMatchObject({ accepted: true });
  });
});
