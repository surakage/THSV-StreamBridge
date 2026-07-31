import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- executable add-on entrypoints are intentionally plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import villageRollCall, { processRollCallEvent, rolloverRollCall, sanitizeRollCallState } from '../../addons/village-roll-call/dist/index.js';
import type { NormalizedEvent } from '../../schemas/event.js';

function redemption(id: string, userId = 'viewer-1', simulated = false): NormalizedEvent {
  return {
    schemaVersion: '1.0.0', eventId: id, eventType: 'reward.redemption', platform: 'twitch',
    source: { adapter: 'test', eventId: id, eventName: 'Reward Redemption' },
    receivedAt: '2026-07-31T12:00:00.000Z',
    channel: { id: 'channel-1', name: 'Example Channel' },
    user: { id: userId, name: userId, displayName: userId === 'viewer-1' ? 'Viewer One' : 'Viewer Two', actorType: 'human', roles: [] },
    payload: { rewardId: 'daily-check-in', redemptionId: id, rewardTitle: 'Daily Check-In', verifiedTransport: true, supportedOperations: [] },
    metadata: { simulated },
  };
}
function harness() {
  let state: unknown;
  const chat: string[] = [];
  const overlays: Array<{ topic: string; payload: Record<string, unknown> }> = [];
  return {
    context: {
      settings: { enabled: true, rewardId: 'daily-check-in', timeZone: 'America/Chicago' },
      state: { read: async () => state, write: async (value: unknown) => { state = value; } },
      chat: { send: async ({ message }: { message: string }) => { chat.push(message); } },
      overlay: { publish: async (topic: string, payload: Record<string, unknown>) => { overlays.push({ topic, payload }); } },
    },
    state: () => state, chat, overlays,
  };
}

describe('Village Roll Call add-on', () => {
  it('counts a stable viewer once per calendar day and shows the OBS card', async () => {
    const runtime = harness();
    const first = await processRollCallEvent(redemption('redemption-1'), runtime.context, Date.parse('2026-07-30T12:00:00Z'));
    const repeat = await processRollCallEvent(redemption('redemption-2'), runtime.context, Date.parse('2026-07-30T18:00:00Z'));
    const nextDay = await processRollCallEvent(redemption('redemption-3'), runtime.context, Date.parse('2026-07-31T12:00:00Z'));
    expect(first).toMatchObject({ accepted: true, count: 1, rank: 1 });
    expect(repeat).toMatchObject({ accepted: false, reason: 'already-checked-in' });
    expect(nextDay).toMatchObject({ accepted: true, count: 2 });
    expect(runtime.chat).toHaveLength(3);
    expect(runtime.overlays.at(-1)).toMatchObject({ topic: 'thsv.village-roll-call.card.show' });
  });

  it('rolls monthly scores forward, announces the winner, and never persists simulations', async () => {
    const runtime = harness();
    await processRollCallEvent(redemption('july-1'), runtime.context, Date.parse('2026-07-31T12:00:00Z'));
    const before = JSON.stringify(runtime.state());
    await processRollCallEvent(redemption('preview', 'viewer-2', true), runtime.context, Date.parse('2026-07-31T13:00:00Z'));
    expect(JSON.stringify(runtime.state())).toBe(before);
    const rolled = rolloverRollCall(sanitizeRollCallState(runtime.state(), Date.parse('2026-07-31T12:00:00Z'), 'America/Chicago'), Date.parse('2026-08-02T12:00:00Z'), 'America/Chicago');
    expect(rolled.winner).toMatchObject({ displayName: 'Viewer One', count: 1 });
  });

  it('serializes concurrent redemptions so different viewers are not lost', async () => {
    const runtime = harness();
    await villageRollCall.start(runtime.context);
    await Promise.all([
      villageRollCall.onEvent(redemption('concurrent-1', 'viewer-1'), runtime.context),
      villageRollCall.onEvent(redemption('concurrent-2', 'viewer-2'), runtime.context),
    ]);
    const state = sanitizeRollCallState(runtime.state(), Date.now(), 'America/Chicago') as { entries: Array<{ userId: string }> };
    expect(state.entries.map((entry) => entry.userId).sort()).toEqual(['viewer-1', 'viewer-2']);
    await villageRollCall.stop(runtime.context);
  });

  it('ships as a triggerless guided add-on with bounded permissions', async () => {
    const descriptor = JSON.parse(await readFile('addons/village-roll-call/module-package.json', 'utf8')) as {
      permissions: string[]; manifest: { actionsProvided: unknown[]; eventSubscriptions: string[] };
    };
    expect(descriptor.permissions).toEqual(['events.subscribe', 'state.private', 'chat.send', 'overlay.publish']);
    expect(descriptor.manifest.actionsProvided).toEqual([]);
    expect(descriptor.manifest.eventSubscriptions).toEqual(['reward.redemption', 'stream.online']);
  });
});
