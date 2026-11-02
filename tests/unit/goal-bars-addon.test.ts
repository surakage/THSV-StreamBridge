import { describe, expect, it, vi } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- executable add-ons intentionally export plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import goalBars, { contribution, goalsView, settingsFor } from '../../addons/goal-bars/dist/index.js';

function runtime(settings: Record<string, unknown>) {
  let state: Record<string, unknown> = {};
  const context = {
    settings: { enabled: true, ...settings },
    state: { read: vi.fn(async () => state), write: vi.fn(async (value: Record<string, unknown>) => { state = value; }) },
    overlay: { publish: vi.fn(async () => undefined) },
    chat: { send: vi.fn(async () => []) },
  };
  return { context, state: () => state };
}

let sequence = 0;
function event(eventType: string, platform: string, payload: Record<string, unknown> = {}, user = 'Viewer', roles: string[] = [], simulated = false) {
  sequence += 1;
  return { eventId: `event-${String(sequence)}`, eventType, platform, user: { id: user.toLowerCase(), name: user.toLowerCase(), displayName: user, roles, actorType: 'human' }, payload, metadata: { simulated } };
}
const lastView = (test: ReturnType<typeof runtime>) => (test.context.overlay.publish.mock.calls.at(-1) as unknown[])[1] as { goals: Array<{ label: string; current: number; target: number; segments: Array<{ platform: string; value: number }>; lastContributor: string }> };

describe('Goal Bars', () => {
  it('adds up the ticked sources from every platform, counting amounts for gifts, Bits and money', () => {
    const settings = settingsFor({ settings: { enabled: true, tipsCurrency: 'USD' } });
    expect(contribution(event('channel.follow', 'kick'), 'kick-follows', settings)).toBe(1);
    expect(contribution(event('channel.follow', 'kick'), 'twitch-follows', settings)).toBe(0);
    expect(contribution(event('channel.gift-subscription', 'twitch', { quantity: 5 }), 'twitch-gifted-subs', settings)).toBe(5);
    expect(contribution(event('engagement.cheer', 'twitch', { quantity: 300 }), 'twitch-bits', settings)).toBe(300);
    expect(contribution(event('engagement.super-chat', 'youtube', { amount: '9.99', currency: 'USD' }), 'youtube-super-chats', settings)).toBe(9);
    expect(contribution(event('engagement.donation', 'youtube', { amount: 9.99, currency: 'USD' }), 'youtube-super-chats', settings)).toBe(0);
    expect(contribution(event('engagement.donation', 'youtube', { amount: 20, currency: 'USD' }), 'tips', settings)).toBe(0);
    expect(contribution(event('engagement.donation', 'streamlabs', { amount: 20, currency: 'USD' }), 'tips', settings)).toBe(20);
    expect(contribution(event('engagement.donation', 'streamlabs', { amount: 20, currency: 'EUR' }), 'tips', settings)).toBe(0);
  });

  it('counts real events once, shows each platform as its own segment and raises the target when reached', async () => {
    const test = runtime({ goal1Label: 'Followers', goal1Sources: ['twitch-follows', 'kick-follows'], goal1Target: 3, goal1RaiseBy: 2, goal1Start: 1, goal2Enabled: false });
    await goalBars.start(test.context);
    const follow = event('channel.follow', 'twitch', {}, 'Zapiok');
    await goalBars.onEvent(follow, test.context);
    await goalBars.onEvent(follow, test.context);
    await goalBars.onEvent(event('channel.follow', 'kick', {}, 'Luna'), test.context);
    await goalBars.onEvent(event('channel.follow', 'twitch', {}, 'Sim', [], true), test.context);
    const view = lastView(test).goals[0];
    expect(view).toMatchObject({ label: 'Followers', current: 3, target: 5, lastContributor: 'Luna' });
    expect(view?.segments).toEqual([{ source: 'twitch-follows', platform: 'twitch', value: 1 }, { source: 'kick-follows', platform: 'kick', value: 1 }]);
    await goalBars.stop();
  });

  it('lets moderators reset one goal or all of them, and ignores viewers', async () => {
    const test = runtime({ goal1Sources: ['twitch-follows'], goal2Enabled: true, goal2Sources: ['twitch-subs'] });
    await goalBars.start(test.context);
    await goalBars.onEvent(event('channel.follow', 'twitch'), test.context);
    await goalBars.onEvent(event('channel.subscription', 'twitch'), test.context);
    await goalBars.onEvent(event('command.received', 'twitch', { command: 'goalreset', arguments: ['1'] }, 'Viewer'), test.context);
    expect(lastView(test).goals.map((goal) => goal.current)).toEqual([1, 1]);
    await goalBars.onEvent(event('command.received', 'twitch', { command: 'goalreset', arguments: ['1'] }, 'Mod', ['moderator']), test.context);
    expect(lastView(test).goals.map((goal) => goal.current)).toEqual([0, 1]);
    expect(test.context.chat.send).toHaveBeenLastCalledWith(expect.objectContaining({ message: 'Goal 1 reset.', routing: 'source' }));
    await goalBars.stop();
  });

  it('builds the overlay only for goals that are switched on and have sources', () => {
    const settings = settingsFor({ settings: { enabled: true, goal1Sources: [], goal2Enabled: true, goal3Enabled: false } });
    expect(goalsView(settings, { goals: {}, seen: [] }).goals.map((goal: { label: string }) => goal.label)).toEqual(['Subs']);
  });

  it('shows each goal in the Control Deck and saves hand-made changes to counts and targets', async () => {
    const test = runtime({ goal1Target: 10, goal1RaiseBy: 0, goal2Enabled: true });
    await goalBars.start(test.context);
    await goalBars.onEvent(event('channel.follow', 'twitch'), test.context);
    const view = await goalBars.controlDeck({ operation: 'view' }, test.context);
    expect(view).toMatchObject({ title: 'Goal Bars', status: 'Followers 1/10 · Subs 0/25' });
    expect(view.sections[0].items.map((item: { label: string }) => item.label)).toEqual(['Followers: 1 / 10', 'Subs: 0 / 25']);
    const added = await goalBars.controlDeck({ operation: 'adjust-form', args: { goal: '1', direction: 'add', amount: 4 } }, test.context);
    expect(added.message).toBe('Added 4 to Followers.');
    expect(lastView(test).goals[0]).toMatchObject({ current: 5, target: 10, segments: [{ platform: 'twitch', value: 1 }] });
    await goalBars.controlDeck({ operation: 'adjust', args: { goal: 1, amount: -1 } }, test.context);
    await goalBars.controlDeck({ operation: 'adjust-form', args: { goal: '1', direction: 'subtract', amount: 4 } }, test.context);
    expect(lastView(test).goals[0]).toMatchObject({ current: 0 });
    expect(test.state()).toMatchObject({ goals: { 1: { counts: { 'twitch-follows': 0 } } } });
    const target = await goalBars.controlDeck({ operation: 'set-target', args: { goal: '2', target: 5 } }, test.context);
    expect(target.sections[0].items[1].label).toBe('Subs: 0 / 5');
    expect(test.state()).toMatchObject({ goals: { 2: { manualTarget: 5, target: 5 } } });
    await expect(goalBars.controlDeck({ operation: 'adjust', args: { goal: 1, amount: -1 } }, test.context)).rejects.toThrow('already at 0');
    await expect(goalBars.controlDeck({ operation: 'set-target', args: { goal: '3', target: 5 } }, test.context)).rejects.toThrow('Pick one of the goals');
    await expect(goalBars.controlDeck({ operation: 'set-target', args: { goal: '1', target: 0 } }, test.context)).rejects.toThrow('whole number');
    await goalBars.stop();
  });
});
