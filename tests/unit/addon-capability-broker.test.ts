import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AddOnCapabilityBroker, CapabilityDeniedError } from '../../bridge/core/addon-capability-broker.js';
import type { AddOnActionArgumentsV2, AddOnOverlayLifecycleV2 } from '../../bridge/contracts/v2/addon-capability.js';
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
    const encoded = JSON.stringify(broker.diagnostics());
    expect(encoded).not.toContain('do-not-report');
    expect(encoded).not.toContain('private-payload');
    expect(encoded).toContain('"denied":4');
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
});
