import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- executable add-on entrypoints are intentionally plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import prizeWheel, { formatWinner, optionsFor, spinPrizeWheel } from '../../addons/prize-wheel/dist/index.js';
import type { NormalizedEvent } from '../../schemas/event.js';

function command(simulated = false, roles = ['moderator']): NormalizedEvent {
  return {
    schemaVersion: '1.0.0', eventId: simulated ? 'wheel-preview' : 'wheel-live', eventType: 'command.received', platform: 'twitch',
    source: { adapter: 'test', eventId: simulated ? 'source-preview' : 'source-live', eventName: 'Command' },
    receivedAt: '2026-07-31T12:00:00.000Z',
    channel: { id: 'channel-1', name: 'Example Channel' },
    user: { id: 'mod-1', name: 'example_mod', displayName: 'Example Mod', actorType: 'human', roles },
    payload: { command: 'spinwheel', invokedAs: 'spinwheel', arguments: [], rawInput: '!spinwheel', prefix: '!', minimumRole: 'moderator', allowBots: false },
    metadata: { simulated },
  };
}

function harness() {
  let state: unknown;
  const overlays: Array<{ topic: string; payload: Record<string, unknown> }> = [];
  const chat: Array<{ message: string; platform: string }> = [];
  const scheduled: Array<() => Promise<unknown>> = [];
  const canceled: string[] = [];
  const context = {
    settings: {
      enabled: true, spinCommand: 'spinwheel', options: ['Tea', 'Coffee', 'Water', 'Juice'],
      deliveryPlatforms: ['twitch', 'youtube', 'kick', 'tiktok'], spinSeconds: 9,
      twitchMessage: 'Twitch picked {winner}!', youtubeMessage: 'YouTube picked {winner}!',
      kickMessage: 'Kick picked {winner}!', tiktokMessage: 'TikTok picked {winner}!',
    },
    state: { read: async () => state, write: async (value: unknown) => { state = value; } },
    overlay: { publish: async (topic: string, payload: Record<string, unknown>) => { overlays.push({ topic, payload }); } },
    schedule: { after: (_delay: number, task: () => Promise<unknown>) => { scheduled.push(task); return `timer-${String(scheduled.length)}`; }, cancel: (taskId: string) => { canceled.push(taskId); return true; } },
    chat: {
      send: async ({ message, selectedPlatforms }: { message: string; selectedPlatforms: string[] }) => {
        chat.push({ message, platform: selectedPlatforms[0] ?? '' });
        return [{ platform: selectedPlatforms[0], accepted: true, parts: 1 }];
      },
    },
  };
  return { context, overlays, chat, scheduled, canceled, state: () => state };
}

describe('Prize Wheel add-on', () => {
  it('chooses one equal-slice index, animates first, then announces to every selected chat', async () => {
    const runtime = harness();
    await prizeWheel.start(runtime.context);
    const result = await spinPrizeWheel(command(), runtime.context, 1_000_000, () => 0.62);
    expect(result).toMatchObject({ accepted: true, winner: 'Water', winnerIndex: 2 });
    expect(runtime.overlays).toEqual([expect.objectContaining({ topic: 'thsv.prize-wheel.wheel.spin' })]);
    expect(runtime.chat).toHaveLength(0);
    expect(runtime.scheduled).toHaveLength(1);
    await runtime.scheduled[0]?.();
    expect(runtime.chat).toEqual([
      { platform: 'twitch', message: 'Twitch picked Water!' },
      { platform: 'youtube', message: 'YouTube picked Water!' },
      { platform: 'kick', message: 'Kick picked Water!' },
      { platform: 'tiktok', message: 'TikTok picked Water!' },
    ]);
    expect(runtime.state()).toMatchObject({ lastWinner: 'Water', spinSequence: 1 });
    await prizeWheel.stop(runtime.context);
  });

  it('keeps previews side-effect free and rejects unauthorized or cooldown spins', async () => {
    const preview = harness();
    await prizeWheel.start(preview.context);
    expect(await spinPrizeWheel(command(true), preview.context, 1_000_000, () => 0)).toMatchObject({ accepted: true, simulated: true, winner: 'Tea' });
    expect(preview.state()).toEqual({ lastSpinAt: 0, lastWinner: '', spinSequence: 0 });
    expect(preview.scheduled).toHaveLength(0);
    await prizeWheel.stop(preview.context);
    const unauthorized = harness();
    await prizeWheel.start(unauthorized.context);
    expect(await spinPrizeWheel(command(false, ['subscriber']), unauthorized.context, 1_000_000, () => 0)).toMatchObject({ accepted: false, reason: 'not-authorized' });
    await prizeWheel.stop(unauthorized.context);
    const cooldown = harness();
    await prizeWheel.start(cooldown.context);
    await spinPrizeWheel(command(), cooldown.context, 1_000_000, () => 0);
    expect(await spinPrizeWheel(command(), cooldown.context, 1_001_000, () => 0)).toMatchObject({ accepted: false, reason: 'spin-in-progress' });
    await prizeWheel.stop(cooldown.context);
    expect(cooldown.canceled).toEqual(['timer-1']);
    await cooldown.scheduled[0]?.();
    expect(cooldown.chat).toHaveLength(0);
  });

  it('serializes simultaneous commands into one active spin', async () => {
    const runtime = harness();
    await prizeWheel.start(runtime.context);
    await Promise.all([
      prizeWheel.onEvent(command(), runtime.context),
      prizeWheel.onEvent(command(), runtime.context),
    ]);
    expect(runtime.overlays).toHaveLength(1);
    expect(runtime.scheduled).toHaveLength(1);
    await prizeWheel.stop(runtime.context);
  });

  it('bounds unique options and clamps rendered platform messages without breaking Unicode', async () => {
    expect(optionsFor(['Tea', ' tea ', 'Coffee', '', ...Array.from({ length: 12 }, (_unused, index) => `Choice ${String(index)}`)])).toHaveLength(10);
    expect(Array.from(String(formatWinner('Winner: {winner}', '🦥'.repeat(300), 150)))).toHaveLength(150);
    const descriptor = JSON.parse(await readFile('addons/prize-wheel/module-package.json', 'utf8')) as { permissions: string[]; manifest: { actionsProvided: unknown[]; eventSubscriptions: string[] } };
    expect(descriptor.permissions).toEqual(['events.subscribe', 'state.private', 'schedule.bounded', 'chat.send', 'overlay.publish']);
    expect(descriptor.manifest.actionsProvided).toEqual([]);
    expect(descriptor.manifest.eventSubscriptions).toEqual(['command.received']);
  });
});
