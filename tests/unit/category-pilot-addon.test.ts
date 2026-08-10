import { describe, expect, it, vi } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- verified executable add-on exports are intentionally loaded from plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import categoryPilot from '../../addons/category-pilot/dist/index.js';

function harness(mode = 'suggest') {
  let stored: Record<string, unknown> = {}; let nextTask = 0; const scheduled = new Map<string, { delay: number; task: () => Promise<void> | void }>();
  const runApprovedAction = vi.fn(async (actionId: string, argumentsValue: Record<string, unknown>) => { void actionId; void argumentsValue; }); const publish = vi.fn(async () => {});
  const context = {
    settings: { enabled: true, mode, requireLive: true, intervalSeconds: 20, confirmationCount: 2, mapping1Enabled: true, mapping1ProcessName: 'FortniteClient-Win64-Shipping.exe', mapping1Profile: 'profile-2' },
    streamerbot: { runApprovedAction }, overlay: { publish }, state: { read: vi.fn(async () => stored), write: vi.fn(async (value) => { stored = value; }) },
    schedule: { after: vi.fn((delay: number, task: () => Promise<void> | void) => { const id = `task-${String(++nextTask)}`; scheduled.set(id, { delay, task }); return id; }), cancel: vi.fn((id: string) => scheduled.delete(id)) },
  };
  const runScheduled = async (delay?: number) => { const match = [...scheduled.entries()].find(([, value]) => delay === undefined || value.delay === delay); if (!match) return false; scheduled.delete(match[0]); await match[1].task(); return true; };
  return { context, runApprovedAction, publish, runScheduled, stored: () => stored };
}

describe('Category Pilot add-on', () => {
  it('probes only configured normalized process names while live', async () => {
    const test = harness(); await categoryPilot.start(test.context);
    await categoryPilot.onEvent({ eventType: 'stream.online', platform: 'twitch', metadata: { simulated: false } }, test.context);
    await test.runScheduled(1000);
    expect(test.runApprovedAction).toHaveBeenCalledWith('9422099b-df85-4d50-99c0-87fcbc120814', expect.objectContaining({ categoryPilotAllowedProcesses: 'fortniteclient-win64-shipping' }));
    await categoryPilot.stop(test.context);
  });

  it('requires repeated matches, then suggests without changing the provider', async () => {
    const test = harness(); await categoryPilot.start(test.context);
    await categoryPilot.onEvent({ eventType: 'stream.online', platform: 'twitch', metadata: { simulated: false } }, test.context); await test.runScheduled(1000);
    const firstRequestId = test.runApprovedAction.mock.calls[0]?.[1]['categoryPilotRequestId'];
    await categoryPilot.onEvent({ eventType: 'addon.thsv.category-pilot.processes-received', metadata: { simulated: false }, payload: { requestId: firstRequestId, runningProcesses: ['fortniteclient-win64-shipping'] } }, test.context);
    await test.runScheduled(20_000);
    const secondRequestId = test.runApprovedAction.mock.calls[1]?.[1]['categoryPilotRequestId'];
    await categoryPilot.onEvent({ eventType: 'addon.thsv.category-pilot.processes-received', metadata: { simulated: false }, payload: { requestId: secondRequestId, runningProcesses: ['fortniteclient-win64-shipping'] } }, test.context);
    expect(test.publish).toHaveBeenCalledWith('thsv.category-pilot.card.show', expect.objectContaining({ title: 'Category Pilot suggestion' }), { lane: 'foreground' });
    expect(test.runApprovedAction).toHaveBeenCalledTimes(2);
    expect(test.stored()).toMatchObject({ pendingProfileId: 'profile-2' });
    await categoryPilot.stop(test.context);
  });

  it('applies a pending suggestion only after an exact creator control', async () => {
    const test = harness(); await categoryPilot.start(test.context);
    await test.context.state.write({ pendingProfileId: 'profile-2', pendingProcessName: 'game' });
    await categoryPilot.onEvent({ eventType: 'addon.thsv.category-pilot.control', metadata: { simulated: false }, payload: { action: 'apply' } }, test.context);
    expect(test.runApprovedAction).toHaveBeenCalledWith('eded2e28-2831-4480-9102-14d98742e275', { categoryPilotApplyRequestId: expect.stringMatching(/^apply-/u) });
    expect(test.stored()).toMatchObject({ pendingProfileId: 'profile-2' });
    const requestId = test.runApprovedAction.mock.calls[0]?.[1]['categoryPilotApplyRequestId'];
    await categoryPilot.onEvent({ eventType: 'addon.thsv.creator-controls.result', receivedAt: '2026-08-01T00:00:00.000Z', metadata: { simulated: false }, payload: { categoryPilotRequestId: requestId, success: true } }, test.context);
    expect(test.stored()).toMatchObject({ pendingProfileId: '', lastAppliedProfileId: 'profile-2', lastAppliedAt: '2026-08-01T00:00:00.000Z' });
    await categoryPilot.stop(test.context);
  });

  it('ignores stale probe results and resumes polling when a probe response times out', async () => {
    const test = harness(); await categoryPilot.start(test.context);
    await categoryPilot.onEvent({ eventType: 'stream.online', platform: 'twitch', metadata: { simulated: false } }, test.context); await test.runScheduled(1000);
    await categoryPilot.onEvent({ eventType: 'addon.thsv.category-pilot.processes-received', metadata: { simulated: false }, payload: { requestId: 'stale-request', runningProcesses: ['fortniteclient-win64-shipping'] } }, test.context);
    expect(test.publish).not.toHaveBeenCalled();
    await test.runScheduled(30_000);
    await test.runScheduled(20_000);
    expect(test.runApprovedAction).toHaveBeenCalledTimes(2);
    await categoryPilot.stop(test.context);
  });

  it('keeps pending state after a failed profile application', async () => {
    const test = harness(); await categoryPilot.start(test.context);
    await test.context.state.write({ pendingProfileId: 'profile-2', pendingProcessName: 'game' });
    await categoryPilot.onEvent({ eventType: 'addon.thsv.category-pilot.control', metadata: { simulated: false }, payload: { action: 'apply' } }, test.context);
    const requestId = test.runApprovedAction.mock.calls[0]?.[1]['categoryPilotApplyRequestId'];
    await categoryPilot.onEvent({ eventType: 'addon.thsv.creator-controls.result', receivedAt: '2026-08-01T00:00:00.000Z', metadata: { simulated: false }, payload: { categoryPilotRequestId: requestId, success: false } }, test.context);
    expect(test.stored()).toMatchObject({ pendingProfileId: 'profile-2' });
    expect(test.stored()).not.toHaveProperty('lastAppliedProfileId', 'profile-2');
    await categoryPilot.stop(test.context);
  });

  it('keeps polling until every live platform is offline', async () => {
    const test = harness(); await categoryPilot.start(test.context);
    await categoryPilot.onEvent({ eventType: 'stream.online', platform: 'twitch', metadata: { simulated: false } }, test.context);
    await categoryPilot.onEvent({ eventType: 'stream.online', platform: 'youtube', metadata: { simulated: false } }, test.context);
    await categoryPilot.onEvent({ eventType: 'stream.offline', platform: 'twitch', metadata: { simulated: false } }, test.context);
    await test.runScheduled(1000);
    expect(test.runApprovedAction).toHaveBeenCalledOnce();
    await categoryPilot.onEvent({ eventType: 'stream.offline', platform: 'youtube', metadata: { simulated: false } }, test.context);
    await categoryPilot.stop(test.context);
  });
});
