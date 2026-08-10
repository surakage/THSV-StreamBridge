import { afterEach, describe, expect, it, vi } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument -- executable add-on entrypoints are plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import followerPulse, { normalizeFollowerPage, reconcileSnapshot, retryDelayMs, snapshotPageDisposition, stateFor } from '../../addons/follower-pulse/dist/index.js';

const settings = { enabled: true, reconciliationHours: 12, confirmMissingScans: 2, maximumTrackedFollowers: 500, retainedChanges: 50, retentionDays: 90 };
const follower = (id: string, login = `user${id}`) => ({ i: id, l: login, n: login, a: '2026-07-27T12:00:00Z' });

describe('Follower Pulse', () => {
  afterEach(async () => { vi.restoreAllMocks(); await followerPulse.stop({ schedule: { cancel: vi.fn() } }); });
  it('creates a silent first baseline', () => {
    const state = stateFor({}, settings);
    expect(reconcileSnapshot(state, { '1': follower('1'), '2': follower('2') }, settings, 1)).toMatchObject({ baseline: true, follows: [], unfollows: [] });
    expect(Object.keys(state.followers)).toEqual(['1', '2']);
    expect(state.changes).toEqual([]);
  });

  it('requires two complete missing snapshots and clears a restored suspect', () => {
    const state = stateFor({ baselineComplete: true, followers: { '1': { l: 'one', n: 'One', a: '2026-07-27T12:00:00Z' }, '2': { l: 'two', n: 'Two', a: '2026-07-27T12:00:00Z' } } }, settings);
    expect(reconcileSnapshot(state, { '1': follower('1', 'one') }, settings, 10).unfollows).toHaveLength(0);
    expect(state.suspects['2']).toBe(1);
    expect(reconcileSnapshot(state, { '1': follower('1', 'one'), '2': follower('2', 'two') }, settings, 20).unfollows).toHaveLength(0);
    expect(state.suspects['2']).toBeUndefined();
    reconcileSnapshot(state, { '1': follower('1', 'one') }, settings, 30);
    expect(reconcileSnapshot(state, { '1': follower('1', 'one') }, settings, 40).unfollows).toMatchObject([{ i: '2', l: 'two' }]);
    expect(state.followers['2']).toBeUndefined();
  });

  it('rejects malformed pages and bounds follower data', () => {
    expect(normalizeFollowerPage({ scanId: 'scan-1', page: 0, total: 1, nextCursor: '', followers: [{ id: '42', login: 'valid_user', name: 'Valid', followedAt: '2026-07-27T12:00:00Z' }] })?.followers).toHaveLength(1);
    expect(normalizeFollowerPage({ scanId: '', page: 0, total: 0, followers: [] })).toBeUndefined();
    expect(normalizeFollowerPage({ scanId: 'scan-1', page: 0, total: 1, followers: [{ id: 'not-numeric', login: 'bad', name: 'Bad', followedAt: 'now' }] })?.followers).toHaveLength(0);
    expect(normalizeFollowerPage({ scanId: 'scan-1', page: 0, error: 'Twitch authorization failed.' })).toMatchObject({ total: 0, error: 'Twitch authorization failed.' });
  });

  it('retries transient failures quickly with a cap and spaces out missing-scope checks', () => {
    expect(retryDelayMs('Streamer.bot could not start the Twitch follower snapshot.', 1)).toBe(30_000);
    expect(retryDelayMs('The Twitch follower snapshot page timed out.', 3)).toBe(120_000);
    expect(retryDelayMs('The Twitch follower snapshot page timed out.', 20)).toBe(900_000);
    expect(retryDelayMs('Reconnect with moderator:read:followers access.', 1)).toBe(1_800_000);
  });

  it('completes a full final page even when Twitch includes a continuation cursor', () => {
    expect(snapshotPageDisposition(500, 500, 'extra-cursor', 4, 500)).toEqual({ kind: 'complete' });
    expect(snapshotPageDisposition(100, 250, 'next-page', 0, 500)).toEqual({ kind: 'continue' });
    expect(snapshotPageDisposition(200, 250, '', 1, 500)).toMatchObject({ kind: 'fail' });
    expect(snapshotPageDisposition(0, 179, '', 0, 500)).toMatchObject({ kind: 'fail', reason: expect.stringContaining('moderator:read:followers') });
  });

  it('restores only bounded suspects that still belong to tracked followers', () => {
    const limited = { ...settings, maximumTrackedFollowers: 25 };
    const followers = Object.fromEntries(Array.from({ length: 30 }, (_, index) => { const id = String(index + 1); return [id, { l: `user${id}`, n: `User ${id}`, a: '2026-07-27T12:00:00Z' }]; }));
    const suspects = Object.fromEntries(Array.from({ length: 100 }, (_, index) => [String(index + 1), 2]));
    const state = stateFor({ followers, suspects }, limited);
    expect(state).toMatchObject({ version: 2, lastAttemptAt: 0, consecutiveFailures: 0 });
    expect(Object.keys(state.followers)).toHaveLength(25);
    expect(Object.keys(state.suspects)).toHaveLength(25);
    expect(Object.keys(state.suspects).every((id) => Object.hasOwn(state.followers, id))).toBe(true);
  });

  it('records an immediate relayed API failure and schedules a missing-scope recovery check', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(10_000);
    let stored: Record<string, unknown> = {};
    let sequence = 0;
    const scheduled = new Map<string, { delay: number; task: () => Promise<void> | void }>();
    const runApprovedAction = vi.fn(async (actionId: string, actionArguments: Record<string, unknown>) => { void actionId; void actionArguments; });
    const context = {
      settings,
      state: { read: vi.fn(async () => stored), write: vi.fn(async (value: Record<string, unknown>) => { stored = value; }) },
      streamerbot: { runApprovedAction },
      schedule: {
        after: vi.fn((delay: number, task: () => Promise<void> | void) => { const id = `task-${String(++sequence)}`; scheduled.set(id, { delay, task }); return id; }),
        cancel: vi.fn((id: string) => scheduled.delete(id)),
      },
    };
    await followerPulse.start(context);
    const startup = [...scheduled.values()].find((entry) => entry.delay === 8_000);
    expect(startup).toBeDefined();
    await startup?.task();
    const request = runApprovedAction.mock.calls[0]?.[1] as unknown as Record<string, unknown>;
    await followerPulse.onEvent({ eventType: 'addon.thsv.follower-pulse.snapshot-page', metadata: { simulated: false }, payload: { scanId: request.followerPulseScanId, page: 0, error: 'Reconnect with moderator:read:followers access.' } }, context);
    const status = await followerPulse.administerFollowerPulse({ operation: 'status' }, context);
    expect(status).toMatchObject({ scanActive: false, lastAttemptAt: 10_000, consecutiveFailures: 1, lastError: expect.stringContaining('moderator:read:followers') });
    expect([...scheduled.values()].some((entry) => entry.delay === 1_800_000)).toBe(true);
  });

  it('recovers quickly when Streamer.bot is still starting', async () => {
    let stored: Record<string, unknown> = {};
    const delays: number[] = [];
    let startupTask: (() => Promise<void> | void) | undefined;
    const context = {
      settings,
      state: { read: vi.fn(async () => stored), write: vi.fn(async (value: Record<string, unknown>) => { stored = value; }) },
      streamerbot: { runApprovedAction: vi.fn(async () => { throw new Error('starting'); }) },
      schedule: { after: vi.fn((delay: number, task: () => Promise<void> | void) => { delays.push(delay); if (delay === 8_000) startupTask = task; return `task-${String(delays.length)}`; }), cancel: vi.fn() },
    };
    await followerPulse.start(context);
    await startupTask?.();
    expect(delays).toContain(30_000);
    expect(stored).toMatchObject({ consecutiveFailures: 1, lastError: 'Streamer.bot could not start the Twitch follower snapshot.' });
  });
});
