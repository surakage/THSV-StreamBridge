import { afterEach, describe, expect, it, vi } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- executable add-ons intentionally export plain JavaScript */
// @ts-expect-error add-on package is JavaScript
import chatPlayPack from '../../addons/chat-play-pack/dist/index.js';
// @ts-expect-error add-on package is JavaScript
import communityAnalytics from '../../addons/community-analytics/dist/index.js';
// @ts-expect-error add-on package is JavaScript
import firstFive from '../../addons/first-five/dist/index.js';
// @ts-expect-error add-on package is JavaScript
import rollCall from '../../addons/village-roll-call/dist/index.js';
// @ts-expect-error add-on package is JavaScript
import lurkTracker from '../../addons/lurk-tracker/dist/index.js';
// @ts-expect-error add-on package is JavaScript
import userTranslate from '../../addons/user-translate/dist/index.js';

type Task = () => unknown;
function harness(settings: Record<string, unknown>, initial?: unknown) {
  let state = initial; const tasks: Array<{ delay: number; task: Task }> = [];
  const read = vi.fn(async () => state); const write = vi.fn(async (next: unknown) => { state = structuredClone(next); });
  const context = {
    settings, approvedActionIds: [], state: { read, write },
    schedule: { after: vi.fn((delay: number, task: Task) => { tasks.push({ delay, task }); return `task-${String(tasks.length)}`; }), cancel: vi.fn(() => true) },
    communityAnalytics: { provide: () => () => undefined },
    viewerFoundation: { onDeleted: () => () => undefined, getProjection: async () => ({ viewerId: 'villager' }) },
    chat: { send: vi.fn(async () => undefined) }, streamerbot: { runApprovedAction: vi.fn(async () => undefined) },
  };
  return { context, read, write, tasks, state: () => state, last: () => tasks.at(-1) as { delay: number; task: Task } };
}
afterEach(() => { vi.useRealTimers(); });

describe('monthly rollover timers', () => {
  it.each([
    ['Chat Play Pack', chatPlayPack, {}],
    ['Community Analytics', communityAnalytics, { enabled: true }],
    ['First Five', firstFive, { enabled: true }],
    ['Village Roll Call', rollCall, { enabled: true }],
  ])('%s schedules one task for the next America/Chicago month boundary instead of a minute loop', async (_name, module, settings) => {
    vi.useFakeTimers(); vi.setSystemTime('2026-10-31T23:30:00-05:00');
    const h = harness(settings);
    await module.start(h.context);
    expect(h.tasks).toHaveLength(1);
    expect(h.last().delay).toBe(30 * 60_000 + 1_000);
    vi.setSystemTime('2026-10-15T12:00:00-05:00');
    const quiet = harness(settings); await module.start(quiet.context);
    expect(quiet.last().delay).toBe(3_600_000);
    // An hourly wake-up inside the same month neither reads nor writes state.
    const reads = quiet.read.mock.calls.length; const writes = quiet.write.mock.calls.length;
    vi.setSystemTime('2026-10-15T13:00:00-05:00'); await quiet.last().task();
    expect(quiet.read.mock.calls.length).toBe(reads); expect(quiet.write.mock.calls.length).toBe(writes); expect(quiet.tasks).toHaveLength(2);
    await module.stop(quiet.context); await module.stop(h.context);
  });

  it('uses the configured Roll Call time zone for its boundary', async () => {
    vi.useFakeTimers(); vi.setSystemTime('2026-10-31T23:40:00Z');
    const h = harness({ enabled: true, timeZone: 'UTC' });
    await rollCall.start(h.context);
    expect(h.last().delay).toBe(20 * 60_000 + 1_000);
    await rollCall.stop(h.context);
  });

  it('Chat Play Pack writes its state only when normalization or the month changes it', async () => {
    vi.useFakeTimers(); vi.setSystemTime('2026-10-31T23:30:00-05:00');
    const h = harness({});
    await chatPlayPack.start(h.context);
    expect(h.write).toHaveBeenCalledTimes(1);
    await chatPlayPack.stop(h.context); await chatPlayPack.start(h.context);
    expect(h.write).toHaveBeenCalledTimes(1);
    vi.setSystemTime('2026-11-01T00:00:01-05:00'); await h.last().task();
    expect(h.write).toHaveBeenCalledTimes(2); expect(h.state()).toMatchObject({ month: '2026-11', monthlyRounds: 0 });
    await chatPlayPack.stop(h.context);
  });

  it('Lurk Tracker heartbeats every minute only while someone is lurking', async () => {
    vi.useFakeTimers(); vi.setSystemTime('2026-10-15T12:00:00-05:00');
    const h = harness({ enabled: true, announceLurk: false });
    await lurkTracker.start(h.context);
    expect(h.last().delay).toBe(3_600_000);
    const writesBefore = h.write.mock.calls.length;
    vi.setSystemTime('2026-10-15T13:00:00-05:00'); await h.last().task();
    expect(h.write.mock.calls.length).toBe(writesBefore);
    await lurkTracker.onEvent({ eventId: 'lurk-1', eventType: 'command.received', platform: 'twitch', user: { id: '1', displayName: 'Villager', actorType: 'human' }, payload: { command: 'lurk' }, metadata: { simulated: false } }, h.context);
    expect(h.last().delay).toBe(60_000);
    vi.setSystemTime('2026-10-15T13:01:00-05:00'); const heartbeatWrites = h.write.mock.calls.length; await h.last().task();
    expect(h.write.mock.calls.length).toBe(heartbeatWrites + 1); expect(h.state()).toMatchObject({ lastTickAt: Date.now() });
    expect(h.last().delay).toBe(60_000);
    await lurkTracker.onEvent({ eventId: 'back-1', eventType: 'chat.message', platform: 'twitch', user: { id: '1', displayName: 'Villager', actorType: 'human' }, payload: { message: 'hi' }, metadata: { simulated: false } }, h.context);
    vi.setSystemTime('2026-10-15T13:02:00-05:00'); const afterReturn = h.write.mock.calls.length; await h.last().task();
    expect(h.write.mock.calls.length).toBe(afterReturn); expect(h.last().delay).toBe(3_600_000);
    await lurkTracker.stop(h.context);
  });

  it('User Translate prunes every minute only while requests are pending and never rewrites unchanged state', async () => {
    vi.useFakeTimers(); vi.setSystemTime('2026-10-15T12:00:00Z');
    const h = harness({ enabled: true }, { pending: [], userCooldowns: [], lastRequestAt: 0 });
    await userTranslate.start(h.context);
    expect(h.write).not.toHaveBeenCalled(); expect(h.last().delay).toBe(3_600_000);
    await h.last().task(); expect(h.write).not.toHaveBeenCalled();
    const pending = harness({ enabled: true }, { pending: [{ requestId: 'r1', platform: 'twitch', author: 'Viewer', mode: 'manual', sourceLanguage: 'en', targetLanguage: 'es', createdAt: Date.now() }], userCooldowns: [], lastRequestAt: Date.now() });
    await userTranslate.stop(h.context); await userTranslate.start(pending.context);
    expect(pending.last().delay).toBe(60_000);
    vi.setSystemTime('2026-10-15T12:03:00Z'); await pending.last().task();
    expect(pending.write).toHaveBeenCalledTimes(1); expect(pending.state()).toMatchObject({ pending: [] }); expect(pending.last().delay).toBe(3_600_000);
    await userTranslate.stop(pending.context);
  });
});
