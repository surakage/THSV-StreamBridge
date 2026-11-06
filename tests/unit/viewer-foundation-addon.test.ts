import { afterEach, describe, expect, it, vi } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- executable add-ons intentionally export plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import viewerFoundation, { deleteViewerRecord, parseAccountLinks, processViewerEvent, resetViewerFoundationRuntime, sanitizeViewerFoundationState, viewerProjection } from '../../addons/viewer-foundation/dist/index.js';

function event(overrides: Record<string, unknown> = {}) {
  return {
    eventId: 'event-1', eventType: 'chat.message', platform: 'twitch',
    source: { eventId: 'provider-1' }, receivedAt: '2026-07-26T12:00:00.000Z', channel: { name: 'channel' },
    user: { id: '123456', name: 'Viewer', displayName: 'Viewer', actorType: 'human', roles: [] },
    payload: { message: 'This must never be retained.' }, metadata: { simulated: false }, ...overrides,
  };
}

function runtime(settings: Record<string, unknown> = {}, initial: Record<string, unknown> = {}) {
  let state = initial;
  return { value: () => state, context: { settings: { enabled: true, ...settings }, state: { read: vi.fn(async () => state), write: vi.fn(async (value: Record<string, unknown>) => { state = value; }) }, chat: { send: vi.fn(async () => []) } } };
}

afterEach(async () => { await viewerFoundation.stop(); resetViewerFoundationRuntime(); });

describe('Viewer Foundation add-on', () => {
  it('accepts only explicit stable account-link rules', () => {
    const links = parseAccountLinks(['alex|twitch|123456', 'bad name|kick|abc', 'alex|discord|42', 'missing']);
    expect(links.accounts.get('twitch\u0000123456')).toBe('alex');
    expect(links.accounts.size).toBe(1);
    expect(parseAccountLinks(['twitch-aaaaaaaaaaaaaaaaaaaaaaaa|twitch|123']).accounts.size).toBe(0);
    expect(parseAccountLinks(['alex|twitch|123', 'sam|twitch|123']).conflicts).toHaveLength(1);
  });

  it('uses one linked identity across platforms, keeping only the latest name, never raw IDs or chat text', async () => {
    const testRuntime = runtime({ accountLinks: ['alex|twitch|123456', 'alex|youtube|UC-ABC'], chatCooldownSeconds: 0 });
    const first = await processViewerEvent(event(), testRuntime.context, 1000);
    const second = await processViewerEvent(event({ eventId: 'event-2', platform: 'youtube', source: { eventId: 'provider-2' }, user: { id: 'UC-ABC', name: 'Different Name', actorType: 'human', roles: [] } }), testRuntime.context, 2000);
    expect(first).toMatchObject({ viewerId: 'alex', linked: true, pointsAwarded: 1, totalPoints: 1 });
    expect(second).toMatchObject({ viewerId: 'alex', linked: true, pointsAwarded: 1, totalPoints: 2 });
    const serialized = JSON.stringify(testRuntime.value());
    expect(serialized).not.toContain('123456'); expect(serialized).not.toContain('UC-ABC'); expect(serialized).not.toContain('This must never');
    expect((testRuntime.value() as { viewers: Record<string, Record<string, unknown>> }).viewers['alex']).toMatchObject({ name: 'Different Name', login: 'different name', platform: 'youtube' });
  });

  it('creates installation-local salted pseudonyms and suppresses replayed events', async () => {
    const left = runtime({ chatCooldownSeconds: 0 });
    const right = runtime({ chatCooldownSeconds: 0 });
    const awarded = await processViewerEvent(event(), left.context, 1000);
    const replay = await processViewerEvent(event(), left.context, 2000);
    const otherInstall = await processViewerEvent(event(), right.context, 1000);
    expect(awarded.viewerId).toMatch(/^twitch-[a-f0-9]{24}$/u);
    expect(replay).toMatchObject({ viewerId: awarded.viewerId, duplicate: true, pointsAwarded: 0 });
    expect(otherInstall.viewerId).not.toBe(awarded.viewerId);
  });

  it('applies a per-viewer chat cooldown and ignores simulations by default', async () => {
    const testRuntime = runtime({ chatCooldownSeconds: 60, chatMessagePoints: 5 });
    const first = await processViewerEvent(event(), testRuntime.context, 1000);
    const cooled = await processViewerEvent(event({ eventId: 'event-2', source: { eventId: 'provider-2' } }), testRuntime.context, 2000);
    const simulated = await processViewerEvent(event({ eventId: 'event-3', source: { eventId: 'provider-3' }, metadata: { simulated: true } }), testRuntime.context, 70000);
    expect(first.pointsAwarded).toBe(5); expect(cooled.pointsAwarded).toBe(0); expect(simulated).toBeUndefined();
  });

  it('does not let cooldown-suppressed chat farm consistency bonuses', async () => {
    const testRuntime = runtime({ chatCooldownSeconds: 60, chatMessagePoints: 1, chatConsistencyMessages: 2, chatConsistencyPoints: 10 });
    const first = await processViewerEvent(event(), testRuntime.context, 1_000);
    const spammed = await processViewerEvent(event({ eventId: 'event-2', source: { eventId: 'provider-2' } }), testRuntime.context, 2_000);
    const eligible = await processViewerEvent(event({ eventId: 'event-3', source: { eventId: 'provider-3' } }), testRuntime.context, 61_000);
    expect(first).toMatchObject({ pointsAwarded: 1, totalPoints: 1 });
    expect(spammed).toMatchObject({ pointsAwarded: 0, totalPoints: 1 });
    expect(eligible).toMatchObject({ pointsAwarded: 11, totalPoints: 12 });
  });

  it('bounds viewer and replay collections and derives projections without names', () => {
    const state = sanitizeViewerFoundationState({
      viewers: Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`viewer-${String(index)}`, { points: index, lastSeenAt: index }])),
      processed: Array.from({ length: 60 }, (_, index) => ({ id: index.toString(16).padStart(32, '0'), at: 1000 + index })),
    }, { levelStepPoints: 10, maximumViewers: 25, processedEventLimit: 25, processedEventTtlHours: 720 }, 2000);
    expect(Object.keys(state.viewers)).toHaveLength(25); expect(state.processed).toHaveLength(25);
    expect(viewerProjection(state, 'viewer-39', { levelStepPoints: 10 })).toEqual({ contractVersion: '1.0.0', viewerId: 'viewer-39', linked: false, currencyName: 'Points', points: 39, level: 4, nextLevelAt: 40 });
    const deleted = deleteViewerRecord(state, 'viewer-39', { levelStepPoints: 10 });
    expect(deleted.removed).toBe(true); expect(deleted.state.viewers['viewer-39']).toBeUndefined();
  });

  it('derives bounded milestone achievements from points without storing another profile', () => {
    const projection = viewerProjection({ viewers: { alex: { points: 2_600, level: 27, lastSeenAt: 1 } } }, 'alex', { levelStepPoints: 100, achievementsEnabled: true });
    expect(projection).toMatchObject({ points: 2_600, latestAchievement: { id: 'village-veteran', label: 'Veteran', points: 2_500 } });
    expect(projection.achievements).toHaveLength(4);
    expect(viewerProjection({ viewers: { alex: { points: 2_600, level: 27, lastSeenAt: 1 } } }, 'alex', { levelStepPoints: 100, achievementsEnabled: false })).not.toHaveProperty('achievements');
  });

  it('awards named chat consistency, observed active time, and bounded lurk time', async () => {
    const active = runtime({ currencyName: 'Acorns', chatMessagePoints: 1, chatCooldownSeconds: 0, chatConsistencyMessages: 2, chatConsistencyPoints: 7, activeMinutesRequired: 10, activeMinutesPoints: 3, activeWindowMinutes: 20 });
    await processViewerEvent(event(), active.context, 1_000);
    const continued = await processViewerEvent(event({ eventId: 'event-2', source: { eventId: 'provider-2' } }), active.context, 601_000);
    expect(continued).toMatchObject({ pointsAwarded: 11, totalPoints: 12, currencyName: 'Acorns' });

    const lurk = runtime({ currencyName: 'Leaves', chatMessagePoints: 1, chatCooldownSeconds: 0, lurkCommand: 'lurk', lurkMinutesRequired: 10, lurkMinutesPoints: 4 });
    await processViewerEvent(event({ eventId: 'lurk-1', eventType: 'command.received', source: { eventId: 'lurk-provider-1' }, payload: { command: 'lurk', arguments: [] } }), lurk.context, 1_000);
    const returned = await processViewerEvent(event({ eventId: 'return-1', source: { eventId: 'return-provider-1' } }), lurk.context, 601_000);
    expect(returned).toMatchObject({ pointsAwarded: 5, totalPoints: 5, currencyName: 'Leaves' });
    await processViewerEvent(event({ eventId: 'points-1', eventType: 'command.received', source: { eventId: 'points-provider-1' }, payload: { command: 'points', arguments: [] } }), lurk.context, 602_000);
    expect(lurk.context.chat.send).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('5 Leaves'), routing: 'source', sourcePlatform: 'twitch', overflow: 'reject' }));
  });

  it('preserves the original lurk start when the viewer repeats the lurk command', async () => {
    const testRuntime = runtime({ accountLinks: ['alex|twitch|123456'], lurkCommand: 'lurk', lurkMinutesRequired: 10, lurkMinutesPoints: 4, chatCooldownSeconds: 0 });
    const first = await processViewerEvent(event({ eventId: 'lurk-1', eventType: 'command.received', source: { eventId: 'lurk-provider-1' }, payload: { command: 'lurk', arguments: [] } }), testRuntime.context, 1_000);
    const repeated = await processViewerEvent(event({ eventId: 'lurk-2', eventType: 'command.received', source: { eventId: 'lurk-provider-2' }, payload: { command: 'lurk', arguments: [] } }), testRuntime.context, 301_000);
    const returned = await processViewerEvent(event({ eventId: 'return-1', source: { eventId: 'return-provider-1' } }), testRuntime.context, 601_000);
    expect(first).toMatchObject({ alreadyLurking: false });
    expect(repeated).toMatchObject({ alreadyLurking: true });
    expect(returned).toMatchObject({ pointsAwarded: 5, totalPoints: 5 });
  });

  it('keeps the active observation window at least as long as the required interval', async () => {
    const testRuntime = runtime({ accountLinks: ['alex|twitch|123456'], chatCooldownSeconds: 0, chatMessagePoints: 0, activeMinutesRequired: 30, activeWindowMinutes: 5, activeMinutesPoints: 7 });
    await processViewerEvent(event(), testRuntime.context, 1_000);
    const settled = await processViewerEvent(event({ eventId: 'event-2', source: { eventId: 'provider-2' } }), testRuntime.context, 1_801_000);
    expect(settled).toMatchObject({ pointsAwarded: 7, totalPoints: 7 });
  });

  it('settles lurk time only after the final live platform goes offline', async () => {
    const session = runtime({ accountLinks: ['alex|twitch|123456'], lurkCommand: 'lurk', lurkMinutesRequired: 10, lurkMinutesPoints: 4 });
    await processViewerEvent(event({ eventId: 'online-twitch', eventType: 'stream.online', platform: 'twitch', user: undefined, source: { eventId: 'online-twitch' }, payload: {} }), session.context, 1_000);
    await processViewerEvent(event({ eventId: 'online-youtube', eventType: 'stream.online', platform: 'youtube', user: undefined, source: { eventId: 'online-youtube' }, payload: {} }), session.context, 1_000);
    await processViewerEvent(event({ eventId: 'lurk-session', eventType: 'command.received', source: { eventId: 'lurk-session' }, payload: { command: 'lurk', arguments: [] } }), session.context, 2_000);
    const twitchEnded = await processViewerEvent(event({ eventId: 'offline-twitch', eventType: 'stream.offline', platform: 'twitch', user: undefined, source: { eventId: 'offline-twitch' }, payload: {} }), session.context, 602_000);
    expect(twitchEnded).toEqual({ streamEnded: false, livePlatforms: 1 });
    expect((session.value() as { viewers: { alex: { points: number } } }).viewers.alex.points).toBe(0);
    const youtubeEnded = await processViewerEvent(event({ eventId: 'offline-youtube', eventType: 'stream.offline', platform: 'youtube', user: undefined, source: { eventId: 'offline-youtube' }, payload: {} }), session.context, 602_000);
    expect(youtubeEnded).toMatchObject({ streamEnded: true, viewersSettled: 1, pointsAwarded: 4 });
    expect((session.value() as { viewers: { alex: { points: number } } }).viewers.alex.points).toBe(4);
  });

  it('shrinks hostile persisted collections below the broker state ceiling', () => {
    const state = sanitizeViewerFoundationState({
      viewers: Object.fromEntries(Array.from({ length: 500 }, (_, index) => [`viewer-${String(index)}`, { points: index, lastSeenAt: index }])),
      processed: Array.from({ length: 500 }, (_, index) => ({ id: index.toString(16).padStart(32, '0'), at: 1000 + index })),
      mutations: Array.from({ length: 200 }, (_, index) => ({ id: index.toString(16).padStart(32, '0'), viewerId: `viewer-${String(index)}`, operation: 'add', amount: 1, previousPoints: 0, totalPoints: 1, at: 1000 + index, callerModuleId: 'sample.consumer', reason: 'x'.repeat(120) })),
    }, { levelStepPoints: 100, maximumViewers: 500, processedEventLimit: 500, processedEventTtlHours: 720 }, 2000);
    expect(JSON.stringify(state).length).toBeLessThanOrEqual(900_000);
    expect(Object.keys(state.viewers).length).toBeGreaterThanOrEqual(25);
  });

  it('registers a bounded provider and applies idempotent audited mutations', async () => {
    const testRuntime = runtime({ accountLinks: ['alex|twitch|123456'], levelStepPoints: 100 });
    let provider: { getProjection(query: Record<string, unknown>): Promise<Record<string, unknown> | undefined>; mutate(request: Record<string, unknown>): Promise<Record<string, unknown>>; administer(request: Record<string, unknown>): Promise<Record<string, unknown>> } | undefined;
    const context = {
      ...testRuntime.context,
      viewerFoundation: { provide: vi.fn((value) => { provider = value; return vi.fn(); }) },
    };
    await viewerFoundation.start(context);
    expect(provider).toBeDefined();
    await expect(provider?.getProjection({ platform: 'twitch', userId: '123456' })).resolves.toMatchObject({ viewerId: 'alex', linked: true, points: 0, level: 1 });
    const request = { viewerId: 'alex', operation: 'add', amount: 125, reason: 'game reward', idempotencyKey: 'round-1', callerModuleId: 'thsv.chat-play-pack' };
    await expect(provider?.mutate(request)).resolves.toMatchObject({ viewerId: 'alex', points: 125, level: 2, previousPoints: 0, duplicate: false });
    await expect(provider?.mutate(request)).resolves.toMatchObject({ points: 125, previousPoints: 0, duplicate: true });
    expect(JSON.stringify(testRuntime.value())).toContain('thsv.chat-play-pack');
    const correction = await provider?.administer({ operation: 'correct', viewerId: 'alex', adjustment: 'remove', amount: 25, reason: 'creator correction', approvedByCreator: true });
    expect(correction).toMatchObject({ points: 100, level: 2, auditId: expect.stringMatching(/^[a-f0-9]{32}$/u) });
    await expect(provider?.administer({ operation: 'audit', limit: 10 })).resolves.toMatchObject({
      retained: 1,
      entries: [expect.objectContaining({ id: correction?.auditId, operation: 'correct', subject: 'alex', previousPoints: 125, totalPoints: 100 })],
    });
    await expect(provider?.administer({ operation: 'search', viewerId: 'alex' })).resolves.toMatchObject({
      found: true, viewerId: 'alex', linked: true, displayNamesStored: true,
      linkedAccounts: [{ platform: 'twitch', userId: '123456' }], projection: { points: 100 },
    });
    await expect(provider?.administer({ operation: 'search', platform: 'twitch', userId: '123456' })).resolves.toMatchObject({
      found: true, viewerId: 'alex', linked: true, displayNamesStored: true, projection: { points: 100 },
    });
    await expect(provider?.administer({ operation: 'undo-correction', auditId: correction?.auditId, reason: 'mistaken correction', approvedByCreator: true })).resolves.toMatchObject({
      viewerId: 'alex', previousPoints: 100, points: 125, level: 2, revertsAuditId: correction?.auditId,
    });
    await expect(provider?.administer({ operation: 'undo-correction', auditId: correction?.auditId, reason: 'second attempt', approvedByCreator: true })).rejects.toThrow('already undone');
    await expect(provider?.administer({ operation: 'export', viewerId: 'alex' })).resolves.toMatchObject({ found: true, viewerId: 'alex', projection: { points: 125 } });
    await expect(provider?.administer({ operation: 'delete', viewerId: 'alex', approvedByCreator: true })).resolves.toMatchObject({ removed: true, accountLinksRequireRemoval: true });
    await expect(provider?.administer({ operation: 'export', viewerId: 'alex' })).resolves.toMatchObject({ found: true, projection: null });
    const serialized = JSON.stringify(testRuntime.value());
    expect(serialized).not.toContain('round-1');
    expect(serialized).not.toContain('thsv.chat-play-pack');
  });

  it('refuses to undo a stale correction after newer point activity', async () => {
    const testRuntime = runtime({ accountLinks: ['alex|twitch|123456'], levelStepPoints: 100 });
    let provider: { mutate(request: Record<string, unknown>): Promise<Record<string, unknown>>; administer(request: Record<string, unknown>): Promise<Record<string, unknown>> } | undefined;
    await viewerFoundation.start({ ...testRuntime.context, viewerFoundation: { provide: vi.fn((value) => { provider = value; return vi.fn(); }) } });
    const correction = await provider?.administer({ operation: 'correct', viewerId: 'alex', adjustment: 'add', amount: 50, reason: 'creator correction', approvedByCreator: true });
    await provider?.mutate({ viewerId: 'alex', operation: 'add', amount: 5, reason: 'new activity', idempotencyKey: 'new-activity', callerModuleId: 'sample.consumer' });
    await expect(provider?.administer({ operation: 'undo-correction', auditId: correction?.auditId, reason: 'too late', approvedByCreator: true })).rejects.toThrow('Refusing to overwrite newer activity');
  });

  it('audits account-link changes without retaining the raw platform account ID', async () => {
    const testRuntime = runtime();
    let provider: { administer(request: Record<string, unknown>): Promise<Record<string, unknown>> } | undefined;
    await viewerFoundation.start({ ...testRuntime.context, viewerFoundation: { provide: vi.fn((value) => { provider = value; return vi.fn(); }) } });
    const result = await provider?.administer({ operation: 'link-audit', linkAction: 'add', viewerId: 'alex', platform: 'youtube', userId: 'UC-sensitive-account', reason: 'creator verified ownership', approvedByCreator: true });
    expect(result).toMatchObject({ operation: 'link-audit', viewerId: 'alex', platform: 'youtube', restartRequired: true, accountFingerprint: expect.stringMatching(/^[a-f0-9]{24}$/u) });
    const serialized = JSON.stringify(testRuntime.value());
    expect(serialized).toContain('link-add');
    expect(serialized).not.toContain('UC-sensitive-account');
  });

  it('imports one creator-approved legacy snapshot once and keeps higher current totals', async () => {
    const testRuntime = runtime({ levelStepPoints: 100 }, { viewers: { alex: { points: 250, level: 3, lastSeenAt: 1 } } });
    let provider: { administer(request: Record<string, unknown>): Promise<Record<string, unknown>> } | undefined;
    await viewerFoundation.start({ ...testRuntime.context, viewerFoundation: { provide: vi.fn((value) => { provider = value; return vi.fn(); }) } });
    const request = { operation: 'import-legacy', approvedByCreator: true, migrationDigest: 'a'.repeat(64), legacyViewers: [
      { viewerId: 'alex', points: 100, lastAwardAt: {} }, { viewerId: 'sam', points: 450, lastAwardAt: { 'chat.message': 1234 } }, { viewerId: 'bad', points: -1, lastAwardAt: {} },
    ] };
    await expect(provider?.administer(request)).resolves.toMatchObject({ duplicate: false, imported: 1, merged: 0, skipped: 2, sourceRecords: 3 });
    await expect(provider?.administer(request)).resolves.toMatchObject({ duplicate: true, imported: 0, merged: 0, skipped: 0 });
    await expect(provider?.administer({ operation: 'export', viewerId: 'alex' })).resolves.toMatchObject({ projection: { points: 250 } });
    await expect(provider?.administer({ operation: 'export', viewerId: 'sam' })).resolves.toMatchObject({ projection: { points: 450, level: 5 } });
    await expect(provider?.administer({ ...request, migrationDigest: 'b'.repeat(64), approvedByCreator: false })).rejects.toThrow('explicit creator approval');
  });
  it('lists viewers by name with search, sorting and pages, and sets an exact total', async () => {
    const testRuntime = runtime({ chatCooldownSeconds: 0 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- admin results are loose JSON from the plain JavaScript add-on
    let provider: { administer(request: Record<string, unknown>): Promise<Record<string, any>> } | undefined;
    await viewerFoundation.start({ ...testRuntime.context, viewerFoundation: { provide: vi.fn((value) => { provider = value; return vi.fn(); }) } });
    const admin = async (request: Record<string, unknown>) => { if (!provider) throw new Error('Viewer Foundation did not start.'); return provider.administer(request); };
    for (let index = 0; index < 60; index += 1) {
      await processViewerEvent(event({ eventId: `chat-${String(index)}`, source: { eventId: `provider-${String(index)}` }, user: { id: `user-${String(index)}`, name: `viewer${String(index)}`, displayName: `Viewer${String(index)}`, actorType: 'human', roles: [] } }), testRuntime.context, 1_000 + index);
    }
    const first = await admin({ operation: 'list', sort: 'recent' });
    expect(first).toMatchObject({ total: 60, page: 1, pages: 2, pageSize: 50 });
    expect(first['rows'][0]).toMatchObject({ name: 'Viewer59', login: 'viewer59', platform: 'twitch', points: 1 });
    const found = await admin({ operation: 'list', query: 'viewer7' });
    expect(found['rows'].map((row: { name: string }) => row.name)).toEqual(['Viewer7']);
    const set = await admin({ operation: 'correct', viewerId: found['rows'][0].viewerId, adjustment: 'set', amount: 500, reason: 'points list', approvedByCreator: true });
    expect(set).toMatchObject({ points: 500, level: 6 });
    expect((await admin({ operation: 'list' }))['rows'][0]).toMatchObject({ name: 'Viewer7', points: 500 });
    const bulk = await admin({ operation: 'bulk-add', amount: 10, scope: 'all', approvedByCreator: true });
    expect(bulk).toMatchObject({ viewers: 60, amount: 10 });
    const exported = await admin({ operation: 'export-all' });
    expect(exported).toMatchObject({ total: 60, pages: 1 });
    expect(exported['rows'][0]).toMatchObject({ name: 'Viewer7', points: 510 });
  });

  it('imports a points file with a preview, waits for new names until they chat, and can undo it', async () => {
    const testRuntime = runtime({ chatCooldownSeconds: 0 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- admin results are loose JSON from the plain JavaScript add-on
    let provider: { administer(request: Record<string, unknown>): Promise<Record<string, any>> } | undefined;
    await viewerFoundation.start({ ...testRuntime.context, viewerFoundation: { provide: vi.fn((value) => { provider = value; return vi.fn(); }) } });
    const admin = async (request: Record<string, unknown>) => { if (!provider) throw new Error('Viewer Foundation did not start.'); return provider.administer(request); };
    await processViewerEvent(event({ user: { id: '123456', name: 'cozysloth', displayName: 'CozySloth', actorType: 'human', roles: [] } }), testRuntime.context, 1_000);
    const rows = [{ name: 'CozySloth', points: 300 }, { name: '@NightOwl', points: 75 }, { name: 'nobody', points: -1 }].filter((row) => row.points >= 0);
    const preview = await admin({ operation: 'import', mode: 'higher', dryRun: true, rows });
    expect(preview).toMatchObject({ preview: true, updated: 1, waiting: 1, skipped: 0 });
    expect((await admin({ operation: 'list' }))['rows'][0]).toMatchObject({ points: 1 });
    const applied = await admin({ operation: 'import', mode: 'higher', dryRun: false, approvedByCreator: true, rows });
    expect(applied).toMatchObject({ preview: false, updated: 1, waiting: 1, undoAvailable: true });
    const list = await admin({ operation: 'list' });
    expect(list['rows'][0]).toMatchObject({ name: 'CozySloth', points: 300 });
    expect(list['pending']).toEqual([expect.objectContaining({ name: 'NightOwl', points: 75, key: 'any:nightowl' })]);
    // The imported name chats for the first time and gets the waiting points on top of the chat point.
    const merged = await processViewerEvent(event({ eventId: 'owl', source: { eventId: 'owl' }, platform: 'kick', user: { id: 'owl-1', name: 'nightowl', displayName: 'NightOwl', actorType: 'human', roles: [] } }), testRuntime.context, 2_000);
    expect(merged).toMatchObject({ totalPoints: 76 });
    expect((await admin({ operation: 'list' }))['pending']).toEqual([]);
    const undone = await admin({ operation: 'undo-import', approvedByCreator: true });
    expect(undone).toMatchObject({ restored: 2 });
    expect((await admin({ operation: 'list', query: 'cozysloth' }))['rows'][0]).toMatchObject({ points: 1 });
    await expect(admin({ operation: 'undo-import', approvedByCreator: true })).rejects.toThrow('no import to undo');
  });

  it('lets moderators add, remove and look up points in chat only when turned on', async () => {
    const testRuntime = runtime({ chatCooldownSeconds: 0, modCommandsEnabled: true });
    await processViewerEvent(event({ user: { id: '123456', name: 'cozysloth', displayName: 'CozySloth', actorType: 'human', roles: [] } }), testRuntime.context, 1_000);
    const command = (name: string, args: string[], roles: string[], id: string) => event({ eventId: id, source: { eventId: id }, eventType: 'command.received', user: { id: 'mod-1', name: 'mod', displayName: 'Mod', actorType: 'human', roles }, payload: { command: name, arguments: args } });
    await expect(processViewerEvent(command('addpoints', ['@CozySloth', '50'], ['moderator'], 'a'), testRuntime.context, 2_000)).resolves.toMatchObject({ moderatorCommand: true, changed: true, totalPoints: 51 });
    await expect(processViewerEvent(command('removepoints', ['cozysloth', '100'], ['moderator'], 'b'), testRuntime.context, 3_000)).resolves.toMatchObject({ changed: true, totalPoints: 0 });
    await expect(processViewerEvent(command('points', ['cozysloth'], ['moderator'], 'c'), testRuntime.context, 4_000)).resolves.toMatchObject({ moderatorCommand: true, changed: false });
    expect(testRuntime.context.chat.send).toHaveBeenLastCalledWith(expect.objectContaining({ message: 'CozySloth has 0 Points (level 1).' }));
    await expect(processViewerEvent(command('addpoints', ['cozysloth', '50'], [], 'd'), testRuntime.context, 5_000)).resolves.toBeUndefined();
    const off = runtime({ chatCooldownSeconds: 0 });
    await processViewerEvent(event({ user: { id: '123456', name: 'cozysloth', displayName: 'CozySloth', actorType: 'human', roles: [] } }), off.context, 1_000);
    await expect(processViewerEvent(command('addpoints', ['cozysloth', '50'], ['moderator'], 'e'), off.context, 2_000)).resolves.toBeUndefined();
  });

  it('treats the old 250 viewer default as the new larger list', () => {
    const viewers = Object.fromEntries(Array.from({ length: 400 }, (_, index) => [`viewer-${String(index)}`, { points: index, lastSeenAt: index, name: `Viewer ${String(index)}` }]));
    expect(Object.keys(sanitizeViewerFoundationState({ viewers }, { levelStepPoints: 100, maximumViewers: 2_000, processedEventLimit: 25, processedEventTtlHours: 1 }, 2_000).viewers)).toHaveLength(400);
  });
});
