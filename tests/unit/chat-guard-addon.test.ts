import { describe, expect, it, vi } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- executable add-ons intentionally export plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import chatGuard, { administerChatGuard, processChatGuardEvent, sanitizeChatGuardState, summarizeChatGuardState } from '../../addons/chat-guard/dist/index.js';

function event(message: string, overrides: Record<string, unknown> = {}) { return { eventId: `event-${message}`, eventType: 'chat.message', platform: 'twitch', receivedAt: '2026-07-26T12:00:00.000Z', user: { id: 'stable-user-id', name: 'Visible Name', displayName: 'Visible Name', actorType: 'human', roles: [] }, payload: { message }, metadata: { simulated: false }, ...overrides }; }
function runtime(settings: Record<string, unknown> = {}) { let state: Record<string, unknown> = {}; return { value: () => state, context: { settings: { enabled: true, ...settings }, state: { read: vi.fn(async () => state), write: vi.fn(async (value: Record<string, unknown>) => { state = value; }) }, streamerbot: { runApprovedAction: vi.fn(async () => undefined) }, chat: { send: vi.fn(async () => [{ platform: 'twitch', accepted: true, parts: 1 }]) } } }; }

describe('Chat Guard add-on', () => {
  it('flags configured signals while enforcement stays off by default', async () => {
    const testRuntime = runtime({ blockedTerms: ['unsafe term'], maximumLinks: 1, minimumCapsLetters: 4, maximumCapsPercent: 75, maximumCharacterRun: 3, maximumMessageCharacters: 40 });
    const result = await processChatGuardEvent(event('UNSAFE TERM AAAAA HTTPS://ONE.TEST HTTPS://TWO.TEST THIS MESSAGE IS DELIBERATELY LONG'), testRuntime.context, 1000);
    expect(result).toMatchObject({ flagged: true, enforcement: 'none' });
    expect(result.rules).toEqual(expect.arrayContaining(['blocked-term', 'excessive-links', 'excessive-caps', 'repeated-characters', 'long-message']));
    expect(chatGuard.manifest.actionsProvided).toEqual([{ id: 'chat-guard.moderate', name: 'THSV Addon - Chat Guard - Moderate' }, { id: 'chat-guard.trust-viewer', name: 'THSV Addon - Chat Guard - Trust Viewer' }]); expect(chatGuard.manifest.requiredCapabilities).toEqual([]);
  });

  it('detects bounded repeated messages only at the configured threshold', async () => {
    const testRuntime = runtime({ detectLinks: false, detectCaps: false, detectRepeatedCharacters: false, detectLongMessages: false, repeatMessageCount: 3, repeatWindowSeconds: 30 });
    expect((await processChatGuardEvent(event('same', { eventId: 'one' }), testRuntime.context, 1000)).flagged).toBe(false);
    expect((await processChatGuardEvent(event('same', { eventId: 'two' }), testRuntime.context, 2000)).flagged).toBe(false);
    expect((await processChatGuardEvent(event('same', { eventId: 'three' }), testRuntime.context, 3000)).rules).toContain('repeated-message');
    expect((await processChatGuardEvent(event('same', { eventId: 'four' }), testRuntime.context, 40_000)).flagged).toBe(false);
  });

  it('normalizes exact domain policy and matches subdomains without broad text checks', async () => {
    const blockedRuntime = runtime({ blockedDomains: ['Example.COM'], detectLinks: false, detectCaps: false, detectRepeatedCharacters: false, detectLongMessages: false, detectRepeatedMessages: false });
    expect((await processChatGuardEvent(event('visit https://safe.example.com/path'), blockedRuntime.context, 1000)).rules).toContain('blocked-domain');
    const allowedRuntime = runtime({ allowedDomains: ['trusted.test'], detectLinks: false, detectCaps: false, detectRepeatedCharacters: false, detectLongMessages: false, detectRepeatedMessages: false });
    expect((await processChatGuardEvent(event('visit https://media.trusted.test/path'), allowedRuntime.context, 1000)).flagged).toBe(false);
    expect((await processChatGuardEvent(event('visit https://untrusted.test/path', { eventId: 'untrusted' }), allowedRuntime.context, 2000)).rules).toContain('unapproved-domain');
    expect((await processChatGuardEvent(event('the words example.com without a URL', { eventId: 'plain-text' }), blockedRuntime.context, 2000)).flagged).toBe(false);
  });

  it('skips private-shaped types, simulations, bots, ignored accounts, and trusted roles', async () => {
    const testRuntime = runtime({ blockedTerms: ['flag'], ignoredAccounts: ['twitch|ignored'] });
    expect(await processChatGuardEvent(event('flag', { eventType: 'chat.private-message' }), testRuntime.context, 1000)).toBeUndefined();
    expect(await processChatGuardEvent(event('flag', { metadata: { simulated: true } }), testRuntime.context, 2000)).toBeUndefined();
    expect(await processChatGuardEvent(event('flag', { user: { id: 'bot', name: 'Bot', actorType: 'bot', roles: [] } }), testRuntime.context, 3000)).toBeUndefined();
    expect(await processChatGuardEvent(event('flag', { user: { id: 'ignored', name: 'Ignored', actorType: 'human', roles: [] } }), testRuntime.context, 4000)).toBeUndefined();
    expect(await processChatGuardEvent(event('flag', { user: { id: 'mod', name: 'Mod', actorType: 'human', roles: ['MOD'] } }), testRuntime.context, 5000)).toBeUndefined();
    expect(testRuntime.context.state.write).not.toHaveBeenCalled();
  });

  it('persists hashes and rule metadata without raw messages, names, or account IDs', async () => {
    const testRuntime = runtime({ blockedTerms: ['private phrase'] });
    await processChatGuardEvent(event('a private phrase from chat'), testRuntime.context, 1000);
    const serialized = JSON.stringify(testRuntime.value());
    expect(serialized).toContain('blocked-term'); expect(serialized).toContain('twitch');
    expect(serialized).not.toContain('private phrase'); expect(serialized).not.toContain('Visible Name'); expect(serialized).not.toContain('stable-user-id');
  });

  it('bounds and expires incident state while returning aggregate-only status', () => {
    const hash = 'a'.repeat(64); const state = sanitizeChatGuardState({ salt: 'b'.repeat(64), observations: Array.from({ length: 100 }, (_, index) => ({ accountHash: hash, messageHash: hash, at: index + 9000 })), processed: Array.from({ length: 100 }, (_, index) => ({ id: hash, at: index + 9000 })), incidents: Array.from({ length: 100 }, (_, index) => ({ id: hash, accountHash: hash, messageHash: hash, at: index + 9000, platform: 'twitch', rules: ['excessive-links'] })) }, { retentionHours: 1, retainedIncidents: 10, maximumTrackedObservations: 50 }, 10_000);
    expect(state.incidents).toHaveLength(10); expect(state.observations).toHaveLength(50); expect(state.processed).toHaveLength(50); expect(JSON.stringify(state).length).toBeLessThanOrEqual(60_000);
    expect(summarizeChatGuardState(state, { retentionHours: 1, retainedIncidents: 10, maximumTrackedObservations: 50 }, 10_000)).toMatchObject({ mode: 'observe', incidentCount: 10, byRule: { 'excessive-links': 10 }, byPlatform: { twitch: 10 } });
  });

  it('returns aggregate provider capability status and clears retained observations only with approval', async () => {
    const testRuntime = runtime({ blockedTerms: ['flag'] });
    await processChatGuardEvent(event('flag this message'), testRuntime.context, 1000);
    const status = await administerChatGuard({ operation: 'status' }, testRuntime.context, 2000);
    expect(status).toMatchObject({ mode: 'observe', incidentCount: 1, byRule: { 'blocked-term': 1 }, providerCapabilities: { twitch: { observe: true, warn: true, delete: true, timeout: true, ban: true }, youtube: { delete: false }, tiktok: { timeout: false } } });
    expect(JSON.stringify(status)).not.toContain('flag this message'); expect(JSON.stringify(status)).not.toContain('stable-user-id');
    const incidentId = status.recentIncidents[0].incidentId;
    await expect(administerChatGuard({ operation: 'review', incidentId, decision: 'false-positive', approvedByCreator: true }, testRuntime.context, 2000)).resolves.toMatchObject({ incidentId, decision: 'false-positive', enforcementPerformed: false });
    await expect(administerChatGuard({ operation: 'status' }, testRuntime.context, 2000)).resolves.toMatchObject({ byReview: { unreviewed: 0, confirmed: 0, 'false-positive': 1 }, recentIncidents: [{ incidentId, review: 'false-positive' }] });
    const beforeTest = JSON.stringify(testRuntime.value());
    await expect(administerChatGuard({ operation: 'test', message: 'flag sample text', priorMatchingMessages: 2 }, testRuntime.context, 2000)).resolves.toMatchObject({ operation: 'test', flagged: true, rules: expect.arrayContaining(['blocked-term', 'repeated-message']), persisted: false, enforcementPerformed: false });
    expect(JSON.stringify(testRuntime.value())).toBe(beforeTest);
    await expect(administerChatGuard({ operation: 'clear', approvedByCreator: false }, testRuntime.context, 2000)).rejects.toThrow('Creator approval');
    await expect(administerChatGuard({ operation: 'clear', approvedByCreator: true }, testRuntime.context, 2000)).resolves.toMatchObject({ removedIncidents: 1, enforcementPerformed: false });
    await expect(administerChatGuard({ operation: 'status' }, testRuntime.context, 2000)).resolves.toMatchObject({ incidentCount: 0, trackedObservationCount: 0 });
  });

  it('uses creator-approved temporary link permits once without bypassing unrelated rules or storing account IDs', async () => {
    const testRuntime = runtime({ blockedDomains: ['blocked.test'], detectLinks: false, detectCaps: false, detectRepeatedCharacters: false, detectLongMessages: false, detectRepeatedMessages: false });
    await expect(administerChatGuard({ operation: 'permit', platform: 'twitch', userId: 'stable-user-id', durationMinutes: 15, maximumUses: 1, approvedByCreator: true }, testRuntime.context, 1000)).resolves.toMatchObject({ activePermitCount: 1, maximumUses: 1, enforcementPerformed: false });
    expect(JSON.stringify(testRuntime.value())).not.toContain('stable-user-id');
    await expect(processChatGuardEvent(event('https://blocked.test/first', { eventId: 'permit-first' }), testRuntime.context, 2000)).resolves.toMatchObject({ flagged: false, permitApplied: true });
    await expect(processChatGuardEvent(event('https://blocked.test/second', { eventId: 'permit-second' }), testRuntime.context, 3000)).resolves.toMatchObject({ flagged: true, permitApplied: false, rules: ['blocked-domain'] });
    await administerChatGuard({ operation: 'permit', platform: 'twitch', userId: 'stable-user-id', durationMinutes: 15, maximumUses: 2, approvedByCreator: true }, testRuntime.context, 4000);
    await expect(administerChatGuard({ operation: 'clear-permits', approvedByCreator: true }, testRuntime.context, 5000)).resolves.toMatchObject({ removedPermits: 1, enforcementPerformed: false });
    await expect(administerChatGuard({ operation: 'status' }, testRuntime.context, 5000)).resolves.toMatchObject({ activePermitCount: 0 });
  });

  it('manages deliberate trusted stable IDs and masks them in wizard status', async () => {
    const testRuntime = runtime({ blockedTerms: ['flag'] });
    await expect(administerChatGuard({ operation: 'trust-add', platform: 'twitch', userId: 'private-stable-user-123456', label: 'Helpful Mod', approvedByCreator: true }, testRuntime.context, 1000)).resolves.toMatchObject({ trustedAccountCount: 1 });
    await expect(processChatGuardEvent(event('flag', { user: { id: 'private-stable-user-123456', name: 'Different Name', actorType: 'human', roles: [] } }), testRuntime.context, 2000)).resolves.toBeUndefined();
    const status = await administerChatGuard({ operation: 'status' }, testRuntime.context, 3000);
    expect(status.trustedAccounts).toEqual([expect.objectContaining({ platform: 'twitch', label: 'Helpful Mod', idSuffix: '123456' })]);
    expect(JSON.stringify(status)).not.toContain('private-stable-user-123456');
    await expect(administerChatGuard({ operation: 'trust-remove', accountKey: status.trustedAccounts[0].accountKey, approvedByCreator: true }, testRuntime.context, 4000)).resolves.toMatchObject({ removed: 1, trustedAccountCount: 0 });
  });

  it('requires both approval gates, caps actions, and never enforces simulations', async () => {
    const testRuntime = runtime({ blockedTerms: ['flag'], enforcementEnabled: true, creatorApprovedEnforcement: true, enforcementMode: 'timeout', maximumEnforcementsPerMinute: 1 });
    await expect(processChatGuardEvent(event('flag once'), testRuntime.context, 1000)).resolves.toMatchObject({ enforcement: 'dispatched' });
    expect(testRuntime.context.streamerbot.runApprovedAction).toHaveBeenCalledWith('9b8d5b4a-6a6f-4f63-a09a-85bddc872ea9', expect.objectContaining({ chatGuardPlatform: 'twitch', chatGuardMode: 'timeout', chatGuardUserId: 'stable-user-id' }));
    await expect(processChatGuardEvent(event('flag twice', { eventId: 'second' }), testRuntime.context, 2000)).resolves.toMatchObject({ enforcement: 'unsupported' });
    expect(testRuntime.context.streamerbot.runApprovedAction).toHaveBeenCalledTimes(1);
    const simulation = runtime({ blockedTerms: ['flag'], includeSimulated: true, enforcementEnabled: true, creatorApprovedEnforcement: true, enforcementMode: 'ban' });
    await expect(processChatGuardEvent(event('flag simulation', { eventId: 'sim', metadata: { simulated: true } }), simulation.context, 1000)).resolves.toMatchObject({ enforcement: 'none' });
    expect(simulation.context.streamerbot.runApprovedAction).not.toHaveBeenCalled();
  });

  it('limits enforcement by selected platform, selected signals, threshold, and per-viewer cooldown', async () => {
    const policy = runtime({ blockedTerms: ['flag'], blockedDomains: ['blocked.test'], enforcementEnabled: true, creatorApprovedEnforcement: true, enforcementMode: 'timeout', enforcementPlatforms: ['twitch'], enforcedRules: ['blocked-domain'], minimumRuleMatches: 1, maximumEnforcementsPerMinute: 20, perUserEnforcementCooldownSeconds: 60 });
    await expect(processChatGuardEvent(event('flag only'), policy.context, 1000)).resolves.toMatchObject({ flagged: true, enforcement: 'below-threshold' });
    await expect(processChatGuardEvent(event('https://blocked.test', { eventId: 'domain-one' }), policy.context, 2000)).resolves.toMatchObject({ enforcement: 'dispatched' });
    await expect(processChatGuardEvent(event('https://blocked.test/again', { eventId: 'domain-two' }), policy.context, 3000)).resolves.toMatchObject({ enforcement: 'unsupported' });
    await expect(processChatGuardEvent(event('https://blocked.test/youtube', { eventId: 'domain-youtube', platform: 'youtube' }), policy.context, 70_000)).resolves.toMatchObject({ enforcement: 'not-selected' });
    expect(policy.context.streamerbot.runApprovedAction).toHaveBeenCalledTimes(1);
  });
});
