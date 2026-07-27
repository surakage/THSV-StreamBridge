import { describe, expect, it, vi } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- verified executable add-on exports are intentionally loaded from plain JavaScript */
// @ts-expect-error executable add-on entrypoints are intentionally plain JavaScript
import categoryPilot from '../../addons/category-pilot/dist/index.js';

function harness(mode = 'suggest') {
  let stored: Record<string, unknown> = {}; let scheduled: (() => Promise<void>) | undefined;
  const runApprovedAction = vi.fn(async () => {}); const publish = vi.fn(async () => {});
  const context = {
    settings: { enabled: true, mode, requireLive: true, intervalSeconds: 20, confirmationCount: 2, mapping1Enabled: true, mapping1ProcessName: 'FortniteClient-Win64-Shipping.exe', mapping1Profile: 'profile-2' },
    streamerbot: { runApprovedAction }, overlay: { publish }, state: { read: vi.fn(async () => stored), write: vi.fn(async (value) => { stored = value; }) },
    schedule: { after: vi.fn((_delay, task) => { scheduled = task; return 'task-1'; }), cancel: vi.fn(() => true) },
  };
  return { context, runApprovedAction, publish, scheduled: () => scheduled, stored: () => stored };
}

describe('Category Pilot add-on', () => {
  it('probes only configured normalized process names while live', async () => {
    const test = harness(); await categoryPilot.start(test.context);
    await categoryPilot.onEvent({ eventType: 'stream.online', metadata: { simulated: false } }, test.context);
    await test.scheduled()?.();
    expect(test.runApprovedAction).toHaveBeenCalledWith('9422099b-df85-4d50-99c0-87fcbc120814', expect.objectContaining({ categoryPilotAllowedProcesses: 'fortniteclient-win64-shipping' }));
    await categoryPilot.stop(test.context);
  });

  it('requires repeated matches, then suggests without changing the provider', async () => {
    const test = harness(); await categoryPilot.start(test.context);
    await categoryPilot.onEvent({ eventType: 'stream.online', metadata: { simulated: false } }, test.context); await test.scheduled()?.();
    const result = { eventType: 'addon.thsv.category-pilot.processes-received', payload: { runningProcesses: ['fortniteclient-win64-shipping'] } };
    await categoryPilot.onEvent(result, test.context); await categoryPilot.onEvent(result, test.context);
    expect(test.publish).toHaveBeenCalledWith('card.show', expect.objectContaining({ title: 'Category Pilot suggestion' }));
    expect(test.runApprovedAction).toHaveBeenCalledTimes(1);
    expect(test.stored()).toMatchObject({ pendingProfileId: 'profile-2' });
    await categoryPilot.stop(test.context);
  });

  it('applies a pending suggestion only after an exact creator control', async () => {
    const test = harness(); await categoryPilot.start(test.context);
    await test.context.state.write({ pendingProfileId: 'profile-2', pendingProcessName: 'game' });
    await categoryPilot.onEvent({ eventType: 'addon.thsv.category-pilot.control', metadata: { simulated: false }, payload: { action: 'apply' } }, test.context);
    expect(test.runApprovedAction).toHaveBeenCalledWith('eded2e28-2831-4480-9102-14d98742e275', {});
    expect(test.stored()).toMatchObject({ pendingProfileId: '', lastAppliedProfileId: 'profile-2' });
    await categoryPilot.stop(test.context);
  });
});
