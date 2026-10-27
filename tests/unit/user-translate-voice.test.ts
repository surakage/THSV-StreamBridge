import { describe, expect, it, vi } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- executable add-ons intentionally export plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import translate, { languageName, parseVoiceCommand, resolveVoiceLanguage } from '../../addons/user-translate/dist/index.js';

const ACTION = 'a6c9d452-7627-4bc2-b0b3-46735d8aa120';

function runtime(settings: Record<string, unknown> = {}) {
  let state: Record<string, unknown> = {};
  const scheduled: Array<{ delay: number; task: () => unknown }> = [];
  const actions: Array<Record<string, unknown>> = [];
  const context = {
    settings: { enabled: true, mode: 'manual', enabledPlatforms: ['twitch', 'youtube', 'kick', 'tiktok'], voiceSubscriptionsEnabled: true, voiceOnDemandEnabled: true, voiceCaptionsEnabled: true, voiceLanguages: ['es', 'fr', 'ja', 'zh-cn', 'ko', 'id', 'de', 'is'], ...settings },
    approvedActionIds: [ACTION],
    state: { read: vi.fn(async () => state), write: vi.fn(async (value: Record<string, unknown>) => { state = value; }) },
    streamerbot: { runApprovedAction: vi.fn(async (_id: string, values: Record<string, unknown>) => { actions.push(values); }) },
    chat: { send: vi.fn(async () => []) },
    overlay: { publish: vi.fn(async () => undefined) },
    schedule: { after: vi.fn((delay: number, task: () => unknown) => { scheduled.push({ delay, task }); return `timer-${String(scheduled.length)}`; }), cancel: vi.fn(() => true) },
  };
  return { context, scheduled, actions };
}

let sequence = 0;
function chat(platform: string, message: string, name = 'Ana') {
  sequence += 1;
  return { eventId: `chat-${String(sequence)}`, eventType: 'chat.message', platform, user: { id: name.toLowerCase(), name: name.toLowerCase(), displayName: name, actorType: 'human' }, metadata: { simulated: false }, payload: { message } };
}
function speech(text: string) { sequence += 1; return { eventId: `speech-${String(sequence)}`, eventType: 'system.live-caption.spoken', platform: 'system', metadata: { simulated: false }, payload: { text } }; }
function result(requestId: unknown, translatedText: string) { sequence += 1; return { eventId: `result-${String(sequence)}`, eventType: 'addon.thsv.user-translate.translation-received', platform: 'system', metadata: { simulated: false }, payload: { requestId, succeeded: true, translatedText } }; }
const messages = (test: ReturnType<typeof runtime>) => test.context.chat.send.mock.calls.map((call) => (call as unknown[])[0] as { message: string; sourcePlatform: string });

describe('Translate voice features', () => {
  it('resolves languages by code, English name or native name, only from the allowed list', () => {
    const allowed = ['es', 'ja', 'zh-cn', 'id', 'is'];
    expect(resolveVoiceLanguage('ES', allowed)).toBe('es');
    expect(resolveVoiceLanguage('spanish', allowed)).toBe('es');
    expect(resolveVoiceLanguage('español', allowed)).toBe('es');
    expect(resolveVoiceLanguage('Japanese', allowed)).toBe('ja');
    expect(resolveVoiceLanguage('chinese', allowed)).toBe('zh-cn');
    expect(resolveVoiceLanguage('indonesian', allowed)).toBe('id');
    expect(resolveVoiceLanguage('icelandic', allowed)).toBe('is');
    expect(resolveVoiceLanguage('french', allowed)).toBe('');
    expect(languageName('zh-cn')).toBe('Chinese');
  });

  it('only recognizes the commands whose option is switched on', () => {
    const settings = { commandPrefix: '!', voiceSubscriptionsEnabled: true, voiceOnDemandEnabled: false, voiceCaptionsEnabled: false };
    expect(parseVoiceCommand(chat('twitch', '!translateme es'), settings)).toEqual({ kind: 'subscribe', argument: 'es' });
    expect(parseVoiceCommand(chat('twitch', '!whatdidyousay es'), settings)).toBeUndefined();
    expect(parseVoiceCommand(chat('twitch', '!captions es'), settings)).toBeUndefined();
  });

  it('batches speech into one translated chat message per language, only on the subscriber platform', async () => {
    const test = runtime(); await translate.start(test.context);
    await translate.onEvent(chat('youtube', '!translateme spanish', 'Ana'), test.context);
    await translate.onEvent(chat('youtube', '!translateme es', 'Luis'), test.context);
    expect(messages(test)[0]?.message).toContain('Ana, I will translate the streamer into Spanish here for 15 minutes');
    await translate.onEvent(speech('welcome back everyone'), test.context);
    await translate.onEvent(speech('we are starting the next level'), test.context);
    expect(test.actions).toHaveLength(0);
    const chatTimer = test.scheduled.find((item) => item.delay === 30_000);
    await chatTimer?.task();
    expect(test.actions).toHaveLength(1);
    expect(test.actions[0]).toMatchObject({ text: 'welcome back everyone we are starting the next level', sourceLanguage: 'en', targetLanguage: 'es' });
    await translate.onEvent(result(test.actions[0]?.['requestId'], 'bienvenidos de nuevo'), test.context);
    expect(messages(test).at(-1)).toMatchObject({ message: '@Ana @Luis (Spanish): bienvenidos de nuevo', sourcePlatform: 'youtube' });
    await translate.onEvent(chat('youtube', '!translateme off', 'Ana'), test.context);
    await translate.onEvent(chat('youtube', '!translateme off', 'Luis'), test.context);
    await translate.onEvent(speech('anyone still here'), test.context);
    for (const item of test.scheduled.slice(1)) await item.task();
    expect(test.actions).toHaveLength(1);
    await translate.stop(test.context);
  });

  it('answers what-did-you-say once from recent speech, with a cooldown', async () => {
    const test = runtime(); await translate.start(test.context);
    await translate.onEvent(chat('kick', '!whatdidyousay ja', 'Kenji'), test.context);
    expect(messages(test)[0]?.message).toContain('has not said anything');
    await translate.onEvent(speech('that boss was hard'), test.context);
    await translate.onEvent(chat('kick', '!whatdidyousay ja', 'Mei'), test.context);
    expect(test.actions).toEqual([expect.objectContaining({ text: 'that boss was hard', targetLanguage: 'ja' })]);
    await translate.onEvent(chat('kick', '!whatdidyousay ja', 'Mei'), test.context);
    expect(test.actions).toHaveLength(1);
    await translate.onEvent(result(test.actions[0]?.['requestId'], 'あのボスは難しかった'), test.context);
    expect(messages(test).at(-1)).toMatchObject({ message: 'Mei (Japanese): あのボスは難しかった', sourcePlatform: 'kick' });
    await translate.stop(test.context);
  });

  it('shows translated captions on the overlay and caps how many languages run at once', async () => {
    const test = runtime({ voiceMaximumLanguages: 1 }); await translate.start(test.context);
    await translate.onEvent(chat('twitch', '!captions german', 'Hans'), test.context);
    await translate.onEvent(chat('twitch', '!translateme fr', 'Marie'), test.context);
    expect(messages(test).at(-1)?.message).toContain('1 languages are already being translated (German)');
    await translate.onEvent(speech('thanks for the raid'), test.context);
    await test.scheduled.find((item) => item.delay === 6_000)?.task();
    expect(test.actions).toEqual([expect.objectContaining({ targetLanguage: 'de' })]);
    await translate.onEvent(result(test.actions[0]?.['requestId'], 'danke für den Raid'), test.context);
    expect(test.context.overlay.publish).toHaveBeenCalledWith('thsv.user-translate.card.show', expect.objectContaining({ title: 'German', text: 'danke für den Raid' }), { lane: 'independent' });
    await translate.stop(test.context);
  });

  it('ignores speech and commands when every voice option is off', async () => {
    const test = runtime({ voiceSubscriptionsEnabled: false, voiceOnDemandEnabled: false, voiceCaptionsEnabled: false }); await translate.start(test.context);
    await translate.onEvent(speech('hello'), test.context);
    await translate.onEvent(chat('twitch', '!translateme es'), test.context);
    expect(test.actions).toHaveLength(0); expect(test.context.chat.send).not.toHaveBeenCalled();
    await translate.stop(test.context);
  });
});
