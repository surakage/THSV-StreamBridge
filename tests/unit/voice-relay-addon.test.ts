import { afterEach, describe, expect, it } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- executable add-on entrypoints are plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import voiceRelay, { textFor } from '../../addons/voice-relay/dist/index.js';

function settings(overrides: Record<string, unknown> = {}) {
  return {
    eventTypes: new Set(['engagement.donation']), viewerMessageEventTypes: new Set<string>(),
    templates: { 'engagement.donation': 'Thank you, {actor}, for {amount} {currency}!' },
    maximumCharacters: 240, allowChatRoles: new Set(['moderator']), blockedTerms: ['blocked'],
    minimumDonationAmount: 0, minimumCheerQuantity: 0, ...overrides,
  };
}

type ScheduledTask = { readonly id: string; readonly callback: () => Promise<void> };

function runtime(overrides: Record<string, unknown> = {}) {
  const calls: Array<Record<string, unknown>> = [];
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
    schedule: {
      after: (_delay: number, callback: () => Promise<void>) => { taskNumber += 1; const id = `task-${String(taskNumber)}`; tasks.push({ id, callback }); return id; },
      cancel: (id: string) => { const index = tasks.findIndex((task) => task.id === id); if (index >= 0) tasks.splice(index, 1); },
    },
  };
  return { context, calls, tasks };
}

function event(eventType: string, payload: Record<string, unknown> = {}) {
  return { eventType, platform: 'twitch', metadata: {}, user: { id: 'viewer-1', actorType: 'human', displayName: 'Alex', roles: [] }, payload };
}

function control(action: 'pause' | 'resume' | 'stop') {
  return { eventType: 'addon.thsv.voice-relay.control', platform: 'mock', metadata: {}, payload: { action } };
}

afterEach(async () => {
  const clean = runtime();
  await voiceRelay.stop(clean.context);
  await voiceRelay.onEvent(control('resume'), clean.context);
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
});
