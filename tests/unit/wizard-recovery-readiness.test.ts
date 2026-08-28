import { describe, expect, it } from 'vitest';
import type { AddOnWizardService, WizardAddOnSummary } from '../../bridge/services/addon-wizard-service.js';
import { inspectSpeakerBotReadiness, WizardService, type StreamerBotInspector } from '../../bridge/services/wizard-service.js';

function addOn(moduleId: string, settings: Readonly<Record<string, unknown>> = {}, approvedActionIds: readonly string[] = []): WizardAddOnSummary {
  return { moduleId, enabled: true, health: 'installed', settings, approvedActionIds, permissions: ['streamerbot.run-approved-action'] } as unknown as WizardAddOnSummary;
}

describe('wizard recovery and feature-aware readiness', () => {
  it('requires Speaker.bot only for enabled features that use it', () => {
    expect(inspectSpeakerBotReadiness([addOn('thsv.random-clip-player')], undefined)).toMatchObject({ required: false, ready: true });
    expect(inspectSpeakerBotReadiness([addOn('thsv.village-hydration-station', { speakerEnabled: false })], undefined)).toMatchObject({ required: false, ready: true });
    const waitingForLauncher = inspectSpeakerBotReadiness([addOn('thsv.voice-relay')], { configured: true, enabled: true, running: false, executableExists: true });
    expect(waitingForLauncher).toMatchObject({ required: true, ready: false, willStartAutomatically: true, modules: ['thsv.voice-relay'] });
    expect(String(waitingForLauncher['detail'])).toContain('Start THSV Streaming Tools');
    expect(inspectSpeakerBotReadiness([addOn('thsv.village-hydration-station', { speakerEnabled: true })], { configured: true, enabled: true, running: true })).toMatchObject({ required: true, ready: true });
  });

  it('restores only the exact missing triggerless broker action approval', async () => {
    const actionId = '6a78d950-17b5-4a98-9de7-1a5b4275f31c';
    const updates: Array<{ moduleId: string; actionIds: readonly string[] }> = [];
    const installed = addOn('thsv.raid-scout', {}, ['creator-existing-action']);
    const addOns = {
      list: () => Promise.resolve([installed]),
      setApprovedActions: (moduleId: string, input: unknown) => {
        const actionIds = (input as { actionIds: readonly string[] }).actionIds;
        updates.push({ moduleId, actionIds });
        return Promise.resolve({ moduleId, approvedActionIds: actionIds, restartRequired: true });
      },
    } as unknown as AddOnWizardService;
    const inspector: StreamerBotInspector = {
      inspectActions: () => Promise.resolve([{ id: actionId, name: 'THSV Addon - Raid Scout - Controller', group: 'THSV Addon - Raid Scout', enabled: true, triggerCount: 0 }]),
      inspectCommands: () => Promise.resolve([]), inspectionRequests: () => [],
    };
    const result = await new WizardService(inspector, undefined, undefined, addOns).reconcileAddOnActionGrants({ approvedByCreator: true });
    expect(result).toMatchObject({ recovered: true, changedModules: 1, changedActions: 1, restartRequired: true });
    expect(updates).toEqual([{ moduleId: 'thsv.raid-scout', actionIds: ['creator-existing-action', actionId] }]);
  });

  it('refuses grant recovery without explicit creator approval', async () => {
    const addOns = { list: () => Promise.resolve([]) } as unknown as AddOnWizardService;
    await expect(new WizardService(undefined, undefined, undefined, addOns).reconcileAddOnActionGrants({ approvedByCreator: false })).rejects.toThrow('explicit creator approval');
  });

  it('rolls back earlier module approvals when a later module save fails', async () => {
    const raidAction = { id: '6a78d950-17b5-4a98-9de7-1a5b4275f31c', name: 'THSV Addon - Raid Scout - Controller', group: 'Raid', enabled: true, triggerCount: 0 };
    const clipActions = [
      { id: 'f89e397b-7106-5101-a620-b0f5da4facf9', name: 'THSV Addon - Random Clip Player - Get Clips', group: 'Clips', enabled: true, triggerCount: 0 },
      { id: 'ad3cf90f-b320-5ae2-a493-485a5485e0ce', name: 'THSV Addon - Random Clip Player - Get Clip Download', group: 'Clips', enabled: true, triggerCount: 0 },
    ];
    const updates: Array<{ moduleId: string; actionIds: readonly string[] }> = [];
    const addOns = {
      list: () => Promise.resolve([addOn('thsv.raid-scout', {}, ['raid-existing']), addOn('thsv.random-clip-player', {}, ['clip-existing'])]),
      setApprovedActions: (moduleId: string, input: unknown) => {
        const actionIds = (input as { actionIds: readonly string[] }).actionIds;
        updates.push({ moduleId, actionIds });
        if (moduleId === 'thsv.random-clip-player') return Promise.reject(new Error('simulated save failure'));
        return Promise.resolve({ moduleId, approvedActionIds: actionIds });
      },
    } as unknown as AddOnWizardService;
    const inspector: StreamerBotInspector = { inspectActions: () => Promise.resolve([raidAction, ...clipActions]), inspectCommands: () => Promise.resolve([]), inspectionRequests: () => [] };
    await expect(new WizardService(inspector, undefined, undefined, addOns).reconcileAddOnActionGrants({ approvedByCreator: true })).rejects.toThrow('all changes were rolled back');
    expect(updates).toEqual([
      { moduleId: 'thsv.raid-scout', actionIds: ['raid-existing', raidAction.id] },
      { moduleId: 'thsv.random-clip-player', actionIds: ['clip-existing', ...clipActions.map((action) => action.id)] },
      { moduleId: 'thsv.raid-scout', actionIds: ['raid-existing'] },
    ]);
  });
});
