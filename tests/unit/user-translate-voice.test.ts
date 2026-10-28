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

describe('Translate Stream Deck push to talk', () => {
  function press(action: string) { sequence += 1; return { eventId: `press-${String(sequence)}`, eventType: 'addon.thsv.user-translate.push-to-talk', platform: 'system', metadata: { simulated: false }, payload: { action } }; }

  it('collects speech between two presses and posts one message per language to the chosen chats', async () => {
    const test = runtime({ voiceSubscriptionsEnabled: false, voiceOnDemandEnabled: false, voiceCaptionsEnabled: false, voicePushToTalkEnabled: true, voicePushToTalkLanguages: ['es', 'ja'], voicePushToTalkPlatforms: ['twitch', 'youtube'] });
    await translate.start(test.context);
    await translate.onEvent(speech('said before the press'), test.context);
    await translate.onEvent(press('toggle'), test.context);
    await translate.onEvent(speech('thank you all'), test.context);
    await translate.onEvent(speech('for coming tonight'), test.context);
    await translate.onEvent(press('toggle'), test.context);
    await translate.onEvent(speech('late words'), test.context);
    expect(test.actions).toHaveLength(0);
    const grace = test.scheduled.find((item) => item.delay === 2_500);
    await grace?.task();
    expect(test.actions.map((action) => action['targetLanguage'])).toEqual(['es', 'ja']);
    expect(test.actions[0]).toMatchObject({ text: 'thank you all for coming tonight late words', sourceLanguage: 'en' });
    await translate.onEvent(result(test.actions[0]?.['requestId'], 'gracias a todos'), test.context);
    expect(test.context.chat.send).toHaveBeenLastCalledWith({ message: '🌐 (Spanish) gracias a todos', routing: 'selected', selectedPlatforms: ['twitch', 'youtube'], overflow: 'split' });
    await translate.stop(test.context);
  });

  it('stops by itself after the time limit and ignores presses while switched off', async () => {
    const off = runtime({ voicePushToTalkEnabled: false });
    await translate.start(off.context);
    await translate.onEvent(press('start'), off.context);
    expect(off.scheduled.filter((item) => item.delay === 120_000)).toHaveLength(0);
    await translate.stop(off.context);

    const test = runtime({ voicePushToTalkEnabled: true, voicePushToTalkMaxSeconds: 60 });
    await translate.start(test.context);
    await translate.onEvent(press('start'), test.context);
    await translate.onEvent(speech('forgot to press stop'), test.context);
    await test.scheduled.find((item) => item.delay === 60_000)?.task();
    await test.scheduled.find((item) => item.delay === 2_500)?.task();
    expect(test.actions).toHaveLength(1);
    expect(test.actions[0]).toMatchObject({ text: 'forgot to press stop', targetLanguage: 'es' });
    await translate.stop(test.context);
  });

  it('finishes on its own when the creator pauses after speaking, so one press is enough', async () => {
    const test = runtime({ voicePushToTalkEnabled: true, voicePushToTalkSilenceSeconds: 4 });
    await translate.start(test.context);
    await translate.onEvent(press('toggle'), test.context);
    await translate.onEvent(speech('one press is enough'), test.context);
    await translate.onEvent(speech('then I stop talking'), test.context);
    const silence = test.scheduled.filter((item) => item.delay === 4_000);
    expect(silence).toHaveLength(2);
    await silence.at(-1)?.task();
    await test.scheduled.find((item) => item.delay === 2_500)?.task();
    expect(test.actions).toEqual([expect.objectContaining({ text: 'one press is enough then I stop talking', targetLanguage: 'es' })]);
    await translate.onEvent(speech('not part of it'), test.context);
    expect(test.actions).toHaveLength(1);
    await translate.stop(test.context);
  });

  it('lets a button send captions only, or chat to the platforms it names', async () => {
    const test = runtime({ voicePushToTalkEnabled: true, voicePushToTalkSilenceSeconds: 0 });
    await translate.start(test.context);
    sequence += 1;
    await translate.onEvent({ eventId: `press-${String(sequence)}`, eventType: 'addon.thsv.user-translate.push-to-talk', platform: 'system', metadata: { simulated: false }, payload: { action: 'toggle', output: 'captions', platforms: '', languages: '' } }, test.context);
    await translate.onEvent(speech('captions only please'), test.context);
    await translate.onEvent(press('toggle'), test.context);
    await test.scheduled.filter((item) => item.delay === 2_500).at(-1)?.task();
    await translate.onEvent(result(test.actions.at(-1)?.['requestId'], 'solo subtítulos'), test.context);
    expect(test.context.overlay.publish).toHaveBeenCalledWith('thsv.user-translate.card.show', expect.objectContaining({ text: 'solo subtítulos' }), { lane: 'independent' });
    expect(test.context.chat.send).not.toHaveBeenCalled();

    sequence += 1;
    await translate.onEvent({ eventId: `press-${String(sequence)}`, eventType: 'addon.thsv.user-translate.push-to-talk', platform: 'system', metadata: { simulated: false }, payload: { action: 'start', output: 'chat', platforms: 'youtube', languages: 'ja' } }, test.context);
    await translate.onEvent(speech('youtube only'), test.context);
    await translate.onEvent(press('stop'), test.context);
    await test.scheduled.filter((item) => item.delay === 2_500).at(-1)?.task();
    await translate.onEvent(result(test.actions.at(-1)?.['requestId'], 'solo youtube'), test.context);
    expect(test.context.chat.send).toHaveBeenLastCalledWith({ message: '🌐 (Japanese) solo youtube', routing: 'selected', selectedPlatforms: ['youtube'], overflow: 'split' });
    expect(test.context.overlay.publish).toHaveBeenCalledTimes(1);
    await translate.stop(test.context);
  });
});
