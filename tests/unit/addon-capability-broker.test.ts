import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AddOnCapabilityBroker, CapabilityDeniedError } from '../../bridge/core/addon-capability-broker.js';
import type { AddOnActionArgumentsV2, AddOnOverlayLifecycleV2, ViewerFoundationMutationRequestV1 } from '../../bridge/contracts/v2/addon-capability.js';
import type { NormalizedEvent } from '../../schemas/event.js';
import { silentLogger } from '../helpers.js';

const ACTION_ONE = '11111111-1111-4111-8111-111111111111';
const ACTION_TWO = '22222222-2222-4222-8222-222222222222';
const temporary: string[] = [];

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function stateRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'thsv-capabilities-'));
  temporary.push(root);
  return root;
}

describe('AddOnCapabilityBroker', () => {
  it('denies every unsupported operation without exposing payloads in diagnostics', async () => {
    const broker = new AddOnCapabilityBroker(silentLogger, await stateRoot());
    const context = broker.contextFor({ moduleId: 'sample.denied', permissions: [], approvedActionIds: [] });
    await expect(context.state.write({ secretText: 'do-not-report' })).rejects.toBeInstanceOf(CapabilityDeniedError);
    await expect(context.streamerbot.runApprovedAction(ACTION_ONE)).rejects.toBeInstanceOf(CapabilityDeniedError);
    expect(() => context.schedule.after(1_000, () => undefined)).toThrow(CapabilityDeniedError);
    await expect(context.overlay.publish('sample.denied.card', { message: 'private-payload' })).rejects.toBeInstanceOf(CapabilityDeniedError);
    expect(() => context.mediaSlot.current()).toThrow(CapabilityDeniedError);
    const encoded = JSON.stringify(broker.diagnostics());
    expect(encoded).not.toContain('do-not-report');
    expect(encoded).not.toContain('private-payload');
    expect(encoded).toContain('"denied":5');
  });

  it('exposes creator-saved settings on the context, frozen and defaulted to an empty object', async () => {
    const broker = new AddOnCapabilityBroker(silentLogger, await stateRoot());
    const withSettings = broker.contextFor({ moduleId: 'sample.settings', permissions: [], approvedActionIds: [] }, { intervalMinutes: 10, clipCount: 20 });
    expect(withSettings.settings).toEqual({ intervalMinutes: 10, clipCount: 20 });
    expect(Object.isFrozen(withSettings.settings)).toBe(true);
    const withoutSettings = broker.contextFor({ moduleId: 'sample.no-settings', permissions: [], approvedActionIds: [] });
    expect(withoutSettings.settings).toEqual({});
  });

  it('isolates bounded private state by module ID', async () => {
    const root = await stateRoot();
    const broker = new AddOnCapabilityBroker(silentLogger, root);
    const first = broker.contextFor({ moduleId: 'sample.first', permissions: ['state.private'], approvedActionIds: [] });
    const second = broker.contextFor({ moduleId: 'sample.second', permissions: ['state.private'], approvedActionIds: [] });
    await first.state.write({ cursor: 4, shown: ['a', 'b'] });
    await expect(first.state.read()).resolves.toEqual({ cursor: 4, shown: ['a', 'b'] });
    await expect(second.state.read()).resolves.toEqual({});
    await expect(readFile(join(root, 'sample.first', 'runtime-state.json'), 'utf8')).resolves.toContain('"cursor": 4');
    await expect(first.state.write({ oversized: 'x'.repeat(70_000) })).rejects.toThrow('65536 bytes');
  });

  it('dispatches only an exact creator-approved Streamer.bot action ID with bounded JSON arguments', async () => {
    const dispatch = vi.fn<(actionId: string, argumentsValue: AddOnActionArgumentsV2, signal: AbortSignal) => Promise<void>>().mockResolvedValue(undefined);
    const broker = new AddOnCapabilityBroker(silentLogger, await stateRoot(), { runStreamerBotAction: dispatch });
    const context = broker.contextFor({ moduleId: 'sample.actions', permissions: ['streamerbot.run-approved-action'], approvedActionIds: [ACTION_ONE] });
    await context.streamerbot.runApprovedAction(ACTION_ONE, { clipId: 'clip-123', count: 1 });
    expect(dispatch).toHaveBeenCalledOnce();
    expect(dispatch.mock.calls[0]?.[0]).toBe(ACTION_ONE);
    expect(dispatch.mock.calls[0]?.[1]).toMatchObject({ clipId: 'clip-123', count: 1 });
    expect(typeof dispatch.mock.calls[0]?.[1]?.['thsvAddonRelayToken']).toBe('string');
    expect(dispatch.mock.calls[0]?.[2]?.aborted).toBe(false);
    await expect(context.streamerbot.runApprovedAction(ACTION_TWO)).rejects.toThrow('not creator-approved');
    await expect(context.streamerbot.runApprovedAction(ACTION_ONE, Object.fromEntries(Array.from({ length: 51 }, (_, index) => [`key${String(index)}`, index])))).rejects.toThrow('at most 50 keys');
  });

  it('bounds per-module action concurrency and cancels pending dispatches during cleanup', async () => {
    const signals: AbortSignal[] = [];
    const dispatch = vi.fn((_actionId: string, _argumentsValue: unknown, signal: AbortSignal) => new Promise<void>((_resolve, reject) => {
      signals.push(signal);
      signal.addEventListener('abort', () => reject(signal.reason instanceof Error ? signal.reason : new Error('action cancelled')), { once: true });
    }));
    const broker = new AddOnCapabilityBroker(silentLogger, await stateRoot(), { runStreamerBotAction: dispatch });
    const context = broker.contextFor({ moduleId: 'sample.concurrent', permissions: ['streamerbot.run-approved-action'], approvedActionIds: [ACTION_ONE] });
    const first = context.streamerbot.runApprovedAction(ACTION_ONE);
    const second = context.streamerbot.runApprovedAction(ACTION_ONE);
    await expect(context.streamerbot.runApprovedAction(ACTION_ONE)).rejects.toThrow('2 pending');
    broker.cleanup('sample.concurrent');
    await expect(first).rejects.toThrow('stopped before');
    await expect(second).rejects.toThrow('stopped before');
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });

  it('rate-limits repeated action dispatches per add-on', async () => {
    const broker = new AddOnCapabilityBroker(silentLogger, await stateRoot(), { runStreamerBotAction: async () => undefined });
    const context = broker.contextFor({ moduleId: 'sample.rate', permissions: ['streamerbot.run-approved-action'], approvedActionIds: [ACTION_ONE] });
    for (let index = 0; index < 30; index += 1) await context.streamerbot.runApprovedAction(ACTION_ONE);
    await expect(context.streamerbot.runApprovedAction(ACTION_ONE)).rejects.toThrow('30 Streamer.bot actions per minute');
  });

  it('routes outbound chat through one permission-gated shared dependency and rate-limits add-ons', async () => {
    const route = vi.fn().mockResolvedValue([{ platform: 'youtube', accepted: true, parts: 1 }]);
    const broker = new AddOnCapabilityBroker(silentLogger, await stateRoot(), { routeOutboundMessage: route });
    const denied = broker.contextFor({ moduleId: 'sample.chat-denied', permissions: [], approvedActionIds: [] });
    await expect(denied.chat.send({ message: 'hello', routing: 'source', sourcePlatform: 'youtube' })).rejects.toBeInstanceOf(CapabilityDeniedError);
    const context = broker.contextFor({ moduleId: 'sample.chat', permissions: ['chat.send'], approvedActionIds: [] });
    await expect(context.chat.send({ message: 'hello', routing: 'source', sourcePlatform: 'youtube' })).resolves.toEqual([{ platform: 'youtube', accepted: true, parts: 1 }]);
    expect(route).toHaveBeenCalledWith({ message: 'hello', routing: 'source', sourcePlatform: 'youtube' }, expect.any(AbortSignal));
    for (let index = 1; index < 10; index += 1) await context.chat.send({ message: `message ${String(index)}`, routing: 'selected', selectedPlatforms: ['twitch'] });
    await expect(context.chat.send({ message: 'too many', routing: 'selected', selectedPlatforms: ['twitch'] })).rejects.toThrow('10 outbound message requests per minute');
  });

  it('publishes only stable-ID donations for the broker-assigned provider namespace', async () => {
    const publish = vi.fn().mockResolvedValue(undefined);
    const broker = new AddOnCapabilityBroker(silentLogger, await stateRoot(), { publishProviderEvent: publish });
    const denied = broker.contextFor({ moduleId: 'thsv.kofi-donations', permissions: [], approvedActionIds: [] });
    const request = { sourceEventId: 'ko-fi-message-1', sourceEventType: 'KofiDonation', receivedAt: '2026-07-22T12:00:00.000Z', channelName: 'Ko-fi', supporterName: 'Supporter', amount: '5.00', currency: 'USD', message: 'Great stream!', simulated: false } as const;
    await expect(denied.provider.publishDonation(request)).rejects.toBeInstanceOf(CapabilityDeniedError);
    const context = broker.contextFor({ moduleId: 'thsv.kofi-donations', permissions: ['provider.events.publish'], approvedActionIds: [] });
    await context.provider.publishDonation(request);
    const published = publish.mock.calls[0]?.[0] as NormalizedEvent | undefined;
    expect(published?.eventType).toBe('engagement.donation'); expect(published?.platform).toBe('kofi');
    expect(published?.source).toEqual({ adapter: 'addon-provider-kofi', eventId: 'ko-fi-message-1', eventName: 'KofiDonation' });
    expect(published?.user?.name).toBe('Supporter'); expect(published?.payload).toEqual({ amount: '5.00', currency: 'USD', message: 'Great stream!' });
    await expect(context.provider.publishDonation({ ...request, sourceEventId: '' })).rejects.toThrow();
    await expect(context.provider.publishDonation({ ...request, amount: '0.1' })).resolves.toBeUndefined();
    await expect(context.provider.publishDonation({ ...request, amount: '5 USD' })).rejects.toThrow();
    const unassigned = broker.contextFor({ moduleId: 'sample.provider', permissions: ['provider.events.publish'], approvedActionIds: [] });
    await expect(unassigned.provider.publishDonation(request)).rejects.toThrow('not assigned');
  });

  it('cancels pending outbound chat when its add-on stops', async () => {
    const route = vi.fn((_request, signal: AbortSignal) => new Promise<readonly []>((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason instanceof Error ? signal.reason : new Error('outbound request cancelled')), { once: true })));
    const broker = new AddOnCapabilityBroker(silentLogger, await stateRoot(), { routeOutboundMessage: route });
    const context = broker.contextFor({ moduleId: 'sample.chat-cancel', permissions: ['chat.send'], approvedActionIds: [] });
    const pending = context.chat.send({ message: 'hello', routing: 'selected', selectedPlatforms: ['kick'] });
    broker.cleanup('sample.chat-cancel');
    await expect(pending).rejects.toThrow('stopped before its outbound chat request completed');
  });

  it('bounds schedules, scopes cancellation, and clears outstanding tasks on module cleanup', async () => {
    vi.useFakeTimers();
    const broker = new AddOnCapabilityBroker(silentLogger, await stateRoot());
    const first = broker.contextFor({ moduleId: 'sample.timer-one', permissions: ['schedule.bounded'], approvedActionIds: [] });
    const second = broker.contextFor({ moduleId: 'sample.timer-two', permissions: ['schedule.bounded'], approvedActionIds: [] });
    const task = vi.fn();
    expect(() => first.schedule.after(999, task)).toThrow('from 1000');
    const taskId = first.schedule.after(1_000, task);
    expect(second.schedule.cancel(taskId)).toBe(false);
    broker.cleanup('sample.timer-one');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(task).not.toHaveBeenCalled();
  });

  it('keeps overlay publication unavailable until a hosted namespaced contract exists', async () => {
    const broker = new AddOnCapabilityBroker(silentLogger, await stateRoot());
    const context = broker.contextFor({ moduleId: 'sample.overlay', permissions: ['overlay.publish'], approvedActionIds: [] });
    await expect(context.overlay.publish('another.module.card', {})).rejects.toThrow('must begin with sample.overlay.');
    await expect(context.overlay.publish('sample.overlay.card', {})).rejects.toThrow('not available yet');
  });

  it('publishes a bounded namespaced payload through the hosted overlay dependency', async () => {
    const publish = vi.fn<(moduleId: string, topic: string, payload: Readonly<Record<string, unknown>>) => Promise<void>>().mockResolvedValue(undefined);
    const broker = new AddOnCapabilityBroker(silentLogger, await stateRoot(), { publishOverlay: publish });
    const context = broker.contextFor({ moduleId: 'sample.overlay-live', permissions: ['overlay.publish'], approvedActionIds: [] });
    await context.overlay.publish('sample.overlay-live.card.show', { title: 'Safe title', durationMs: 5_000 });
    expect(publish).toHaveBeenCalledWith('sample.overlay-live', 'sample.overlay-live.card.show', { title: 'Safe title', durationMs: 5_000 });
  });

  it('subscribes to scoped overlay lifecycle reports and removes listeners during cleanup', async () => {
    let listener: ((event: AddOnOverlayLifecycleV2) => void) | undefined;
    const unsubscribe = vi.fn();
    const broker = new AddOnCapabilityBroker(silentLogger, await stateRoot(), { subscribeOverlayLifecycle: (_moduleId, received) => { listener = received; return unsubscribe; } });
    const context = broker.contextFor({ moduleId: 'sample.media', permissions: ['overlay.publish'], approvedActionIds: [] });
    const received = vi.fn();
    const remove = context.overlay.onLifecycle(received);
    listener?.({ playbackId: 'clip-1', phase: 'ended', occurredAt: '2026-07-19T00:00:00.000Z' });
    expect(received).toHaveBeenCalledWith(expect.objectContaining({ playbackId: 'clip-1', phase: 'ended' }));
    remove();
    expect(unsubscribe).toHaveBeenCalledOnce();
    broker.cleanup('sample.media');
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('coordinates one bounded exclusive media owner and releases it during cleanup', async () => {
    vi.useFakeTimers();
    const broker = new AddOnCapabilityBroker(silentLogger, await stateRoot());
    const player = broker.contextFor({ moduleId: 'sample.player', permissions: ['media.exclusive'], approvedActionIds: [] });
    const raid = broker.contextFor({ moduleId: 'sample.raid', permissions: ['media.exclusive'], approvedActionIds: [] });
    const other = broker.contextFor({ moduleId: 'sample.other', permissions: ['media.exclusive'], approvedActionIds: [] });
    const changes = vi.fn(); player.mediaSlot.onChange(changes);

    const first = await raid.mediaSlot.acquire({ durationMs: 60_000, priority: 100 });
    expect(first).toMatchObject({ acquired: true, ownerModuleId: 'sample.raid', priority: 100 });
    expect(player.mediaSlot.current()).toMatchObject({ ownerModuleId: 'sample.raid' });
    await expect(other.mediaSlot.acquire({ durationMs: 60_000, priority: 100 })).resolves.toMatchObject({ acquired: false, ownerModuleId: 'sample.raid' });
    expect(changes).toHaveBeenLastCalledWith(expect.objectContaining({ ownerModuleId: 'sample.raid' }));

    broker.cleanup('sample.raid');
    await vi.runAllTimersAsync();
    expect(player.mediaSlot.current()).toEqual({});
    expect(changes).toHaveBeenLastCalledWith({});
  });

  it('revokes every capability exposed by a stopped or superseded runtime context', async () => {
    const broker = new AddOnCapabilityBroker(silentLogger, await stateRoot());
    const grant = { moduleId: 'sample.revoked', permissions: ['state.private', 'schedule.bounded'] as const, approvedActionIds: [] };
    const oldContext = broker.contextFor(grant);
    broker.cleanup('sample.revoked');
    await expect(oldContext.state.read()).rejects.toThrow('no longer running');
    expect(() => oldContext.schedule.after(1_000, () => undefined)).toThrow('no longer running');
    const replacement = broker.contextFor(grant);
    await expect(replacement.state.read()).resolves.toEqual({});
    await expect(oldContext.state.read()).rejects.toThrow('no longer running');
  });

  it('rejects grants for privileged StreamBridge framework actions', async () => {
    const broker = new AddOnCapabilityBroker(silentLogger, await stateRoot());
    expect(() => broker.contextFor({ moduleId: 'sample.privileged', permissions: ['streamerbot.run-approved-action'], approvedActionIds: ['04ca0087-578d-5c2e-9e06-249dc072e9f8'] }))
      .toThrow('framework actions cannot be granted');
  });

  it('brokers Viewer Foundation projections and mutations only to explicit dependent consumers', async () => {
    const broker = new AddOnCapabilityBroker(silentLogger, await stateRoot());
    const providerContext = broker.contextFor({ moduleId: 'thsv.viewer-foundation', permissions: ['viewer.foundation.provide'], approvedActionIds: [] });
    const getProjection = vi.fn(async () => ({ contractVersion: '1.0.0' as const, viewerId: 'viewer-one', linked: false, points: 25, level: 1, nextLevelAt: 100 }));
    const mutate = vi.fn(async (request: ViewerFoundationMutationRequestV1 & { readonly callerModuleId: string }) => ({ contractVersion: '1.0.0' as const, viewerId: request.viewerId, linked: false, points: 15, level: 1, nextLevelAt: 100, operation: request.operation, amount: request.amount, previousPoints: 25, duplicate: false }));
    const administer = vi.fn(async () => ({ operation: 'status', viewerCount: 1 }));
    providerContext.viewerFoundation.provide({ getProjection, mutate, administer });

    const noPermission = broker.contextFor({ moduleId: 'sample.no-viewer', permissions: [], approvedActionIds: [] }, {}, ['thsv.viewer-foundation']);
    await expect(noPermission.viewerFoundation.getProjection({ viewerId: 'viewer-one' })).rejects.toBeInstanceOf(CapabilityDeniedError);
    const noDependency = broker.contextFor({ moduleId: 'sample.no-dependency', permissions: ['viewer.foundation.read'], approvedActionIds: [] });
    await expect(noDependency.viewerFoundation.getProjection({ viewerId: 'viewer-one' })).rejects.toThrow('must declare thsv.viewer-foundation');

    const consumer = broker.contextFor({ moduleId: 'sample.consumer', permissions: ['viewer.foundation.read', 'viewer.foundation.mutate'], approvedActionIds: [] }, {}, ['thsv.viewer-foundation']);
    const deleted = vi.fn(); const unsubscribeDeleted = consumer.viewerFoundation.onDeleted(deleted);
    await expect(consumer.viewerFoundation.getProjection({ viewerId: 'viewer-one' })).resolves.toEqual({ contractVersion: '1.0.0', viewerId: 'viewer-one', linked: false, points: 25, level: 1, nextLevelAt: 100 });
    await expect(consumer.viewerFoundation.mutate({ viewerId: 'viewer-one', operation: 'spend', amount: 10, reason: 'game entry', idempotencyKey: 'game-1' })).resolves.toMatchObject({ points: 15, operation: 'spend' });
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ callerModuleId: 'sample.consumer', reason: 'game entry' }));
    await expect(broker.administerViewerFoundation({ operation: 'status' })).resolves.toEqual({ operation: 'status', viewerCount: 1 });
    await expect(broker.administerViewerFoundation({ operation: 'delete', viewerId: 'viewer-one', approvedByCreator: false })).rejects.toThrow();
    await expect(consumer.viewerFoundation.getProjection({ viewerId: 'Viewer Name' })).rejects.toThrow();
    await providerContext.viewerFoundation.notifyDeleted('viewer-one');
    expect(deleted).toHaveBeenCalledWith('viewer-one');
    unsubscribeDeleted(); await providerContext.viewerFoundation.notifyDeleted('viewer-one');
    expect(deleted).toHaveBeenCalledOnce();

    broker.cleanup('thsv.viewer-foundation');
    await expect(consumer.viewerFoundation.getProjection({ viewerId: 'viewer-one' })).rejects.toThrow('unavailable');
  });

  it('does not allow another add-on to impersonate the Viewer Foundation provider', async () => {
    const broker = new AddOnCapabilityBroker(silentLogger, await stateRoot());
    const impostor = broker.contextFor({ moduleId: 'sample.impostor', permissions: ['viewer.foundation.provide'], approvedActionIds: [] });
    expect(() => impostor.viewerFoundation.provide({ getProjection: async () => undefined, mutate: async () => { throw new Error('unused'); }, administer: async () => ({ operation: 'status' }) })).toThrow('Only thsv.viewer-foundation');
  });

  it('brokers bounded Community Analytics projections only to explicit dependent consumers', async () => {
    const broker = new AddOnCapabilityBroker(silentLogger, await stateRoot());
    const providerContext = broker.contextFor({ moduleId: 'thsv.community-analytics', permissions: ['community.analytics.provide'], approvedActionIds: [] });
    providerContext.communityAnalytics.provide({
      getViewerProjection: async (viewerId) => ({ contractVersion: '1.0.0', viewerId, observed: true, firstSeenAt: 1, lastSeenAt: 2, sessions: 1, counters: { messages: 3, commands: 0, follows: 0, subscriptions: 0, memberships: 0, giftSubscriptions: 0, gifts: 0, cheers: 0, superChats: 0, raids: 0, rewardRedemptions: 0 }, activeSession: true, activeLastSeenAt: 2 }),
      getSessionProjection: async () => ({ contractVersion: '1.0.0', active: true, startedAt: 1, approximate: false, livePlatforms: ['twitch'], uniqueViewers: 1, counters: { messages: 3, commands: 0, follows: 0, subscriptions: 0, memberships: 0, giftSubscriptions: 0, gifts: 0, cheers: 0, superChats: 0, raids: 0, rewardRedemptions: 0 }, retainedSessionCount: 0 }),
    });
    const missingDependency = broker.contextFor({ moduleId: 'sample.analytics-no-dependency', permissions: ['community.analytics.read'], approvedActionIds: [] });
    await expect(missingDependency.communityAnalytics.getSessionProjection()).rejects.toThrow('must declare thsv.community-analytics');
    const consumer = broker.contextFor({ moduleId: 'sample.analytics-consumer', permissions: ['community.analytics.read'], approvedActionIds: [] }, {}, ['thsv.community-analytics']);
    await expect(consumer.communityAnalytics.getViewerProjection('viewer-one')).resolves.toMatchObject({ viewerId: 'viewer-one', observed: true, counters: { messages: 3 } });
    await expect(consumer.communityAnalytics.getSessionProjection()).resolves.toMatchObject({ active: true, uniqueViewers: 1 });
    await expect(consumer.communityAnalytics.getViewerProjection('Viewer Name')).rejects.toThrow();
    broker.cleanup('thsv.community-analytics');
    await expect(consumer.communityAnalytics.getSessionProjection()).rejects.toThrow('unavailable');
  });

  it('does not allow another add-on to impersonate the Community Analytics provider', async () => {
    const broker = new AddOnCapabilityBroker(silentLogger, await stateRoot());
    const impostor = broker.contextFor({ moduleId: 'sample.analytics-impostor', permissions: ['community.analytics.provide'], approvedActionIds: [] });
    expect(() => impostor.communityAnalytics.provide({ getViewerProjection: async () => { throw new Error('unused'); }, getSessionProjection: async () => { throw new Error('unused'); } })).toThrow('Only thsv.community-analytics');
  });
});
