import { describe, expect, it } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument -- executable add-on entrypoints are plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import { normalizeFollowerPage, reconcileSnapshot, stateFor } from '../../addons/follower-pulse/dist/index.js';

const settings = { enabled: true, reconciliationHours: 12, confirmMissingScans: 2, maximumTrackedFollowers: 500, retainedChanges: 50, retentionDays: 90 };
const follower = (id: string, login = `user${id}`) => ({ i: id, l: login, n: login, a: '2026-07-27T12:00:00Z' });

describe('Follower Pulse', () => {
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
  });

  it('restores only bounded suspects that still belong to tracked followers', () => {
    const limited = { ...settings, maximumTrackedFollowers: 25 };
    const followers = Object.fromEntries(Array.from({ length: 30 }, (_, index) => { const id = String(index + 1); return [id, { l: `user${id}`, n: `User ${id}`, a: '2026-07-27T12:00:00Z' }]; }));
    const suspects = Object.fromEntries(Array.from({ length: 100 }, (_, index) => [String(index + 1), 2]));
    const state = stateFor({ followers, suspects }, limited);
    expect(Object.keys(state.followers)).toHaveLength(25);
    expect(Object.keys(state.suspects)).toHaveLength(25);
    expect(Object.keys(state.suspects).every((id) => Object.hasOwn(state.followers, id))).toBe(true);
  });
});
