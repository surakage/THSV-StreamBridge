import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- executable add-ons intentionally export plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import eightBall, { DEFAULT_ANSWERS, manifest, pickAnswer, resolveQuestion, settingsFor } from '../../addons/magic-eight-ball/dist/index.js';

function runtime(settings: Record<string, unknown> = {}) {
  const context = {
    settings: { enabled: true, twitchRewardIds: ['twitch-8ball'], kickRewardIds: ['kick-8ball'], command: 'ask', ...settings },
    chat: { send: vi.fn(async () => []) },
    overlay: { publish: vi.fn(async () => undefined) },
  };
  return context;
}

function redemption(platform: string, rewardId: string, input?: string) {
  return { eventId: `${platform}-${rewardId}-${String(Math.random())}`, eventType: 'reward.redemption', platform, user: { id: 'viewer-1', displayName: 'Sloth' }, metadata: { simulated: false }, payload: { rewardId, verifiedTransport: true, ...(input === undefined ? {} : { input }) } };
}

function chatCommand(platform: string, name: string, args: string[], userId = 'viewer-1') {
  return { eventId: `${platform}-${name}-${String(Math.random())}`, eventType: 'command.received', platform, user: { id: userId, displayName: 'Sloth' }, metadata: { simulated: false }, payload: { command: name, arguments: args } };
}

describe('Magic 8-Ball extension', () => {
  it('answers a Twitch reward question only in Twitch chat and shows the overlay card', async () => {
    const context = runtime(); await eightBall.start();
    await eightBall.onEvent(redemption('twitch', 'twitch-8ball', 'Will I win?'), context);
    expect(context.chat.send).toHaveBeenCalledTimes(1);
    const sent = (context.chat.send.mock.calls[0] as unknown[])[0] as { message: string; routing: string; sourcePlatform: string };
    expect(sent).toMatchObject({ routing: 'source', sourcePlatform: 'twitch' });
    expect(sent.message).toContain('Sloth asked "Will I win?"');
    expect(context.overlay.publish).toHaveBeenCalledWith('thsv.magic-eight-ball.card.show', expect.objectContaining({ platform: 'twitch' }), { lane: 'foreground' });
    await eightBall.stop();
  });

  it('matches reward IDs per platform and ignores unverified or unknown rewards', () => {
    const settings = settingsFor(runtime());
    expect(resolveQuestion(redemption('kick', 'kick-8ball', 'Pizza?'), settings)).toEqual({ question: 'Pizza?', paid: true });
    expect(resolveQuestion(redemption('kick', 'twitch-8ball', 'Pizza?'), settings)).toBeUndefined();
    expect(resolveQuestion({ ...redemption('twitch', 'twitch-8ball'), payload: { rewardId: 'twitch-8ball' } }, settings)).toBeUndefined();
    expect(resolveQuestion(redemption('twitch', 'twitch-8ball'), settings)).toEqual({ question: '', paid: true });
  });

  it('applies cooldowns to the command but always answers paid rewards', async () => {
    const context = runtime({ viewerCooldownSeconds: 60, globalCooldownSeconds: 0 }); await eightBall.start();
    await eightBall.onEvent(chatCommand('youtube', '!ask', ['Is', 'it', 'raining?']), context);
    await eightBall.onEvent(chatCommand('youtube', 'ask', ['Again?']), context);
    const messages = context.chat.send.mock.calls.map((call) => ((call as unknown[])[0] as { message: string }).message);
    expect(messages[0]).toContain('Is it raining?');
    expect(messages[1]).toContain('resting');
    await eightBall.onEvent(redemption('twitch', 'twitch-8ball', 'Paid question?'), context);
    expect(context.chat.send).toHaveBeenCalledTimes(3);
    await eightBall.onEvent(chatCommand('youtube', 'ask', [], 'viewer-2'), context);
    expect(context.chat.send).toHaveBeenCalledTimes(3);
    await eightBall.stop();
  });

  it('stays silent when disabled, simulated, or without a command name', async () => {
    const context = runtime({ enabled: false }); await eightBall.start();
    await eightBall.onEvent(redemption('twitch', 'twitch-8ball', 'Hello?'), context);
    const noCommand = runtime({ command: '' });
    await eightBall.onEvent(chatCommand('twitch', 'ask', ['Hello?']), noCommand);
    const simulated = runtime();
    await eightBall.onEvent({ ...redemption('twitch', 'twitch-8ball', 'Hello?'), metadata: { simulated: true } }, simulated);
    expect([context, noCommand, simulated].every((item) => item.chat.send.mock.calls.length === 0)).toBe(true);
    await eightBall.stop();
  });

  it('uses custom answers and avoids repeating the last one', () => {
    const settings = settingsFor(runtime({ answers: ['One', 'Two'] }));
    const first = pickAnswer(settings, () => 0);
    expect(pickAnswer(settings, () => 0)).not.toBe(first);
    expect(settingsFor(runtime()).answers).toEqual([...DEFAULT_ANSWERS]);
  });

  it('keeps the package descriptor equal to the runtime manifest', async () => {
    const descriptor = JSON.parse(await readFile('addons/magic-eight-ball/module-package.json', 'utf8')) as { manifest: unknown; permissions: string[] };
    expect(descriptor.manifest).toEqual(JSON.parse(JSON.stringify(manifest)));
    expect(descriptor.permissions).toEqual(['events.subscribe', 'chat.send', 'overlay.publish']);
  });
});
