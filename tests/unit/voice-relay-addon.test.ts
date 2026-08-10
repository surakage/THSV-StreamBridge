import { afterEach, beforeEach, describe, expect, it } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- executable add-on entrypoints are plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import voiceRelay, { textFor } from '../../addons/voice-relay/dist/index.js';

function settings(overrides: Record<string, unknown> = {}) {
  return {
    eventTypes: new Set(['engagement.donation']), viewerMessageEventTypes: new Set<string>(),
    templates: { 'engagement.donation': 'Thank you, {actor}, for {amount} {currency}!' },
    maximumCharacters: 240, allowChatRoles: new Set(['moderator']), blockedTerms: ['blocked'],
    minimumDonationAmount: 0, minimumCheerQuantity: 0, likeMilestoneInterval: 1000, ...overrides,
  };
}

type ScheduledTask = { readonly id: string; readonly callback: () => Promise<void> };

function runtime(overrides: Record<string, unknown> = {}) {
  const calls: Array<Record<string, unknown>> = [];
  const overlays: Array<{ topic: string; payload: Record<string, unknown> }> = [];
  const chats: string[] = [];
  const pointMutations: Array<Record<string, unknown>> = [];
  const tasks: ScheduledTask[] = [];
  let taskNumber = 0;
  const context = {
    settings: {
      enabled: true, voiceAlias: 'THSV Male', eventTypes: ['engagement.donation', 'engagement.cheer'], viewerMessageEventTypes: [],
      donationTemplate: 'Thank you, {actor}, for {amount} {currency}!', cheerTemplate: 'Thank you for the {quantity} bits, {actor}!',
      maximumCharacters: 240, queueLimit: 2, gapSeconds: 1, minimumDonationAmount: 0, minimumCheerQuantity: 0, blockedTerms: [],
      ...overrides,
    },
    streamerbot: { runApprovedAction: async (_actionId: string, args: Record<string, unknown>) => { calls.push(args); } },
    overlay: { publish: async (topic: string, payload: Record<string, unknown>) => { overlays.push({ topic, payload }); } },
    chat: { send: async ({ message }: { message: string }) => { chats.push(message); } },
    viewerFoundation: {
      getProjection: async () => ({ viewerId: 'viewer-one', currencyName: 'Village Points' }),
      mutate: async (request: Record<string, unknown>) => { pointMutations.push(request); return { applied: true }; },
    },
    schedule: {
      after: (_delay: number, callback: () => Promise<void>) => { taskNumber += 1; const id = `task-${String(taskNumber)}`; tasks.push({ id, callback }); return id; },
      cancel: (id: string) => { const index = tasks.findIndex((task) => task.id === id); if (index >= 0) tasks.splice(index, 1); },
    },
  };
  return { context, calls, tasks, overlays, chats, pointMutations };
}

function event(eventType: string, payload: Record<string, unknown> = {}) {
  return { eventType, platform: 'twitch', metadata: {}, user: { id: 'viewer-1', actorType: 'human', displayName: 'Alex', roles: [] }, payload };
}

function control(action: 'pause' | 'resume' | 'stop') {
  return { eventType: 'addon.thsv.voice-relay.control', platform: 'mock', metadata: {}, payload: { action } };
}

beforeEach(async () => {
  await voiceRelay.start();
});

afterEach(async () => {
  const clean = runtime();
  await voiceRelay.stop(clean.context);
});

describe('Voice Relay', () => {
  it('role-gates chat, strips links, and blocks configured terms', () => {
    const base = { eventType: 'chat.message', metadata: {}, user: { actorType: 'human', roles: ['moderator'], displayName: 'Alex' }, payload: { message: 'visit https://example.com now' } };
    const chatSettings = settings({ eventTypes: new Set(['chat.message']) });
    expect(textFor(base, chatSettings)).toBe('visit link now');
    expect(textFor({ ...base, user: { ...base.user, roles: ['viewer'] } }, chatSettings)).toBe('');
    expect(textFor({ ...base, payload: { message: 'a blocked phrase' } }, chatSettings)).toBe('');
  });

  it('speaks the creator thank-you before an explicitly enabled viewer message', () => {
    const event = { eventType: 'engagement.donation', metadata: {}, user: { actorType: 'human', displayName: 'Alex' }, payload: { amount: '25.00', currency: 'USD', message: 'Love the stream!' } };
    expect(textFor(event, settings())).toBe('Thank you, Alex, for 25.00 USD!');
    expect(textFor(event, settings({ viewerMessageEventTypes: new Set(['engagement.donation']) }))).toBe('Thank you, Alex, for 25.00 USD! Love the stream!');
  });

  it('suppresses simulated events and financial events below the creator threshold', () => {
    const event = { eventType: 'engagement.donation', metadata: {}, user: { actorType: 'human', displayName: 'Alex' }, payload: { amount: '2.00', currency: 'USD' } };
    expect(textFor(event, settings({ minimumDonationAmount: 5 }))).toBe('');
    expect(textFor({ ...event, metadata: { simulated: true } }, settings())).toBe('');
  });

  it('speaks likes only at the configured total-like interval', () => {
    const milestoneSettings = settings({
      eventTypes: new Set(['engagement.milestone']),
      templates: { 'engagement.milestone': 'Thank you, village! We reached {value} {metric}!' },
      likeMilestoneInterval: 1000,
    });
    const milestone = (value: number) => ({ eventType: 'engagement.milestone', metadata: {}, user: { actorType: 'human', displayName: 'Village' }, payload: { metric: 'likes', value } });
    expect(textFor(milestone(100), milestoneSettings)).toBe('');
    expect(textFor(milestone(900), milestoneSettings)).toBe('');
    expect(textFor(milestone(1000), milestoneSettings)).toBe('Thank you, village! We reached 1000 likes!');
    expect(textFor(milestone(2000), milestoneSettings)).toBe('Thank you, village! We reached 2000 likes!');
  });

  it('pauses, resumes, and stops future dispatch without losing creator safety settings', async () => {
    const test = runtime();
    await voiceRelay.onEvent(control('pause'), test.context);
    await voiceRelay.onEvent(event('engagement.donation', { amount: '5.00', currency: 'USD' }), test.context);
    expect(test.calls).toHaveLength(0);

    await voiceRelay.onEvent(control('resume'), test.context);
    await voiceRelay.onEvent(event('engagement.donation', { amount: '5.00', currency: 'USD' }), test.context);
    expect(test.calls).toEqual([{ voiceRelayMessage: 'Thank you, Alex, for 5.00 USD!', voiceRelayVoiceAlias: 'THSV Male' }]);

    await voiceRelay.onEvent(control('stop'), test.context);
    await voiceRelay.onEvent(event('engagement.donation', { amount: '10.00', currency: 'USD' }), test.context);
    expect(test.calls).toHaveLength(1);
  });

  it('combines rapid cheers from the same viewer before dispatch', async () => {
    const test = runtime();
    await voiceRelay.onEvent(event('engagement.cheer', { quantity: 40 }), test.context);
    await voiceRelay.onEvent(event('engagement.cheer', { quantity: 60 }), test.context);
    expect(test.calls).toHaveLength(0);
    expect(test.tasks).toHaveLength(1);

    const aggregate = test.tasks.shift();
    expect(aggregate).toBeDefined();
    await aggregate?.callback();
    expect(test.calls).toEqual([{ voiceRelayMessage: 'Thank you for the 100 bits, Alex!', voiceRelayVoiceAlias: 'THSV Male' }]);
  });

  it('uses a native Kick reward without spending Viewer Foundation points', async () => {
    const test = runtime({ viewerRequestsEnabled: true, kickRewardId: 'kick-tts', showSpeechOverlay: true });
    await voiceRelay.onEvent({ ...event('reward.redemption', { rewardId: 'kick-tts', redemptionId: 'kick-redemption', input: 'Hello from Kick', verifiedTransport: true }), platform: 'kick' }, test.context);
    expect(test.calls).toEqual([{ voiceRelayMessage: 'Hello from Kick', voiceRelayVoiceAlias: 'THSV Male' }]);
    expect(test.pointMutations).toEqual([]);
    expect(test.overlays[0]).toMatchObject({ topic: 'thsv.voice-relay.card.show', payload: { title: 'Alex • KICK', presentationMode: 'typewriter' } });
  });

  it('does not speak an unverified reward even when its ID matches', async () => {
    const test = runtime({ viewerRequestsEnabled: true, twitchRewardId: 'twitch-tts' });
    await voiceRelay.onEvent(event('reward.redemption', { rewardId: 'twitch-tts', redemptionId: 'unverified', input: 'Do not speak this' }), test.context);
    expect(test.calls).toEqual([]);
    expect(test.pointMutations).toEqual([]);
  });

  it('spends Viewer Foundation points for a YouTube command request', async () => {
    const test = runtime({ viewerRequestsEnabled: true, pointsCommand: 'speak', pointsCost: 75, showSpeechOverlay: false });
    await voiceRelay.onEvent({ ...event('command.received', { command: 'speak', arguments: ['Hello', 'YouTube'] }), eventId: 'youtube-speak-1', platform: 'youtube' }, test.context);
    expect(test.calls).toEqual([{ voiceRelayMessage: 'Hello YouTube', voiceRelayVoiceAlias: 'THSV Male' }]);
    expect(test.pointMutations).toEqual([expect.objectContaining({ operation: 'spend', amount: 75, viewerId: 'viewer-one' })]);
  });
});
