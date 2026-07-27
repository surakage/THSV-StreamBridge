import { afterEach, describe, expect, it, vi } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- executable add-ons intentionally export plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import communityAnalytics, { administerCommunityAnalytics, buildAnalyticsReport, communityAnalyticsViewerProjection, processAnalyticsEvent, resetCommunityAnalyticsRuntime, sanitizeCommunityAnalyticsState } from '../../addons/community-analytics/dist/index.js';

function event(eventType = 'chat.message', overrides: Record<string, unknown> = {}) {
  return { eventId: `event-${eventType}`, eventType, platform: 'twitch', source: { eventId: `source-${eventType}` }, receivedAt: '2026-07-26T12:00:00.000Z', channel: { name: 'channel' }, user: { id: '123456', name: 'Viewer Name', displayName: 'Viewer Name', actorType: 'human', roles: [] }, payload: { message: 'private chat text' }, metadata: { simulated: false }, ...overrides };
}
function runtime(settings: Record<string, unknown> = {}) {
  let state: Record<string, unknown> = {};
  return { value: () => state, context: { settings: { enabled: true, ...settings }, state: { read: vi.fn(async () => state), write: vi.fn(async (value: Record<string, unknown>) => { state = value; }) }, viewerFoundation: { getProjection: vi.fn(async (query?: Record<string, unknown>) => { void query; return { contractVersion: '1.0.0', viewerId: 'viewer-one', linked: false, points: 0, level: 1, nextLevelAt: 100 }; }) } } };
}
afterEach(async () => { await communityAnalytics.stop(); resetCommunityAnalyticsRuntime(); });

describe('Community Analytics add-on', () => {
  it('tracks one Viewer Foundation identity per session without retaining names, IDs, or messages', async () => {
    const testRuntime = runtime();
    await processAnalyticsEvent(event('stream.online', { user: undefined, payload: {} }), testRuntime.context, 1000);
    await expect(processAnalyticsEvent(event(), testRuntime.context, 2000)).resolves.toMatchObject({ viewerId: 'viewer-one', counter: 'messages', total: 1 });
    await expect(processAnalyticsEvent(event(), testRuntime.context, 3000)).resolves.toEqual({ duplicate: true });
    await processAnalyticsEvent(event('command.received', { eventId: 'command-1', source: { eventId: 'command-source-1' }, payload: { command: 'quote' } }), testRuntime.context, 4000);
    await processAnalyticsEvent(event('stream.offline', { user: undefined, payload: {} }), testRuntime.context, 5000);
    const serialized = JSON.stringify(testRuntime.value());
    expect(serialized).toContain('viewer-one'); expect(serialized).toContain('"uniqueViewers":1');
    expect(serialized).not.toContain('Viewer Name'); expect(serialized).not.toContain('123456'); expect(serialized).not.toContain('private chat text');
  });

  it('skips bots, simulations, ignored stable accounts, and ignored Viewer Foundation IDs', async () => {
    const testRuntime = runtime({ ignoredAccounts: ['twitch|123456'], ignoredViewerIds: ['viewer-one'] });
    expect(await processAnalyticsEvent(event(), testRuntime.context, 1000)).toBeUndefined();
    expect(await processAnalyticsEvent(event('chat.message', { user: { id: 'different', name: 'Bot', actorType: 'bot', roles: [] } }), testRuntime.context, 2000)).toBeUndefined();
    expect(await processAnalyticsEvent(event('chat.message', { user: { id: 'different', name: 'Viewer', actorType: 'human', roles: [] }, metadata: { simulated: true } }), testRuntime.context, 3000)).toBeUndefined();
    expect(testRuntime.context.viewerFoundation.getProjection).not.toHaveBeenCalled();
  });

  it('bounds persisted viewers, sessions, and replay identities below the private-state ceiling', () => {
    const state = sanitizeCommunityAnalyticsState({ viewers: Object.fromEntries(Array.from({ length: 100 }, (_, index) => [`viewer-${String(index)}`, { firstSeenAt: index, lastSeenAt: index, sessions: 1, counters: { messages: index } }])), sessions: Array.from({ length: 50 }, (_, index) => ({ id: `session-${String(index)}`, startedAt: index, endedAt: index + 1, counters: {} })), processed: Array.from({ length: 100 }, (_, index) => ({ id: index.toString(16).padStart(32, '0'), at: index })) }, { maximumViewers: 25, retainedSessions: 5, processedEventLimit: 50 });
    expect(Object.keys(state.viewers)).toHaveLength(25); expect(state.sessions).toHaveLength(5); expect(state.processed).toHaveLength(50); expect(JSON.stringify(state).length).toBeLessThanOrEqual(60_000);
  });

  it('reports aggregate status, exports one private record, and deletes active viewer identity without rewriting completed aggregates', async () => {
    const testRuntime = runtime();
    await processAnalyticsEvent(event('stream.online', { user: undefined, payload: {} }), testRuntime.context, 1000);
    await processAnalyticsEvent(event(), testRuntime.context, 2000);
    await expect(administerCommunityAnalytics({ operation: 'status' }, testRuntime.context)).resolves.toMatchObject({ trackedViewerCount: 1, activeSession: true, current: { uniqueViewers: 1 } });
    await expect(administerCommunityAnalytics({ operation: 'export', viewerId: 'viewer-one' }, testRuntime.context)).resolves.toMatchObject({ found: true, activeSession: { present: true } });
    await processAnalyticsEvent(event('stream.offline', { user: undefined, payload: {} }), testRuntime.context, 3000);
    await processAnalyticsEvent(event('chat.message', { eventId: 'second', source: { eventId: 'second' } }), testRuntime.context, 4000);
    await expect(administerCommunityAnalytics({ operation: 'delete', viewerId: 'viewer-one', approvedByCreator: true }, testRuntime.context)).resolves.toMatchObject({ removed: true, activeAttendanceRemoved: true, completedSessionAggregatesRetained: true });
    const state = testRuntime.value() as { viewers: Record<string, unknown>; current: { attendees: Record<string, number> }; sessions: Array<{ uniqueViewers: number }> };
    expect(state.viewers['viewer-one']).toBeUndefined(); expect(state.current.attendees['viewer-one']).toBeUndefined(); expect(state.sessions[0]?.uniqueViewers).toBe(1);
  });

  it('builds bounded session JSON and pseudonymous viewer CSV without private source data', () => {
    const state = sanitizeCommunityAnalyticsState({ viewers: { 'viewer-one': { firstSeenAt: 1, lastSeenAt: 2, sessions: 1, counters: { messages: 3 } } }, sessions: [{ id: 'private-session-id', startedAt: 1, endedAt: 2, approximate: false, uniqueViewers: 1, counters: { messages: 3 } }], processed: [] });
    const now = new Date('2026-07-26T12:34:56.000Z');
    const json = buildAnalyticsReport('session-json', state, now); const csv = buildAnalyticsReport('viewers-csv', state, now);
    expect(json).toMatchObject({ mimeType: 'application/json', filename: 'thsv-community-sessions-2026-07-26T12-34-56-000Z.json' });
    expect(json.content).toContain('Local StreamBridge observations only'); expect(json.content).not.toContain('private-session-id');
    expect(csv).toMatchObject({ mimeType: 'text/csv', filename: 'thsv-community-viewers-2026-07-26T12-34-56-000Z.csv' });
    expect(csv.content).toContain('viewerId,firstSeenAt,lastSeenAt,sessions,activeSession,activeLastSeenAt,messages'); expect(csv.content).toContain('viewer-one,1,2,1,false,,3');
    const combined = String(json.content) + String(csv.content);
    expect(combined).not.toContain('Viewer Name'); expect(combined).not.toContain('123456'); expect(combined).not.toContain('private chat text');
  });

  it('calculates capped monthly engagement scores and hides exact rank below the minimum cohort', async () => {
    const testRuntime = runtime({ engagementScoreEnabled: true, scoreMessagePoints: 1, scoreMessageCap: 2, scoreCommandPoints: 2, scoreCommandCap: 1, scoreSessionPoints: 10, scoreSessionCap: 1, minimumRankCohort: 3 });
    testRuntime.context.viewerFoundation.getProjection.mockImplementation(async (query?: Record<string, unknown>) => ({ contractVersion: '1.0.0', viewerId: query?.['userId'] === 'second' ? 'viewer-two' : query?.['userId'] === 'third' ? 'viewer-three' : 'viewer-one', linked: false, points: 0, level: 1, nextLevelAt: 100 }));
    await processAnalyticsEvent(event('stream.online', { user: undefined, payload: {} }), testRuntime.context, Date.parse('2026-07-01T12:00:00Z'));
    for (let index = 0; index < 3; index += 1) await processAnalyticsEvent(event('chat.message', { eventId: `one-message-${String(index)}`, source: { eventId: `one-message-${String(index)}` } }), testRuntime.context, Date.parse(`2026-07-01T12:00:0${String(index + 1)}Z`));
    await processAnalyticsEvent(event('command.received', { eventId: 'one-command', source: { eventId: 'one-command' }, payload: { command: 'card' } }), testRuntime.context, Date.parse('2026-07-01T12:00:10Z'));
    await processAnalyticsEvent(event('chat.message', { eventId: 'two-message', source: { eventId: 'two-message' }, user: { id: 'second', name: 'Second', actorType: 'human', roles: [] } }), testRuntime.context, Date.parse('2026-07-01T12:00:11Z'));
    await expect(communityAnalyticsViewerProjection('viewer-one', testRuntime.context)).resolves.toMatchObject({ scoreSeason: '2026-07', engagementScore: 14, rankCohortSize: 2 });
    expect((await communityAnalyticsViewerProjection('viewer-one', testRuntime.context)).seasonRank).toBeUndefined();
    await processAnalyticsEvent(event('command.received', { eventId: 'three-command', source: { eventId: 'three-command' }, user: { id: 'third', name: 'Third', actorType: 'human', roles: [] }, payload: { command: 'card' } }), testRuntime.context, Date.parse('2026-07-01T12:00:12Z'));
    await expect(communityAnalyticsViewerProjection('viewer-one', testRuntime.context)).resolves.toMatchObject({ engagementScore: 14, seasonRank: 1, rankCohortSize: 3 });
    await processAnalyticsEvent(event('chat.message', { eventId: 'august-message', source: { eventId: 'august-message' } }), testRuntime.context, Date.parse('2026-08-01T12:00:00Z'));
    await expect(communityAnalyticsViewerProjection('viewer-one', testRuntime.context)).resolves.toMatchObject({ scoreSeason: '2026-08', engagementScore: 1, rankCohortSize: 1 });
  });
});
