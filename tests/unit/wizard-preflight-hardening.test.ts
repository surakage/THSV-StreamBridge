import { describe, expect, it } from 'vitest';
import { inspectAddOnActionReadiness, inspectCriticalOverlayReadiness, inspectSceneConfiguration, inspectTimedActionCanary } from '../../bridge/services/wizard-service.js';
import type { WizardAddOnSummary } from '../../bridge/services/addon-wizard-service.js';

function addOn(moduleId: string, settings: Record<string, unknown> = {}, approvedActionIds: string[] = []): WizardAddOnSummary {
  return { moduleId, name: moduleId, version: '4.0.7', author: 'test', description: '', changelog: '', packageKind: 'executable', permissions: ['streamerbot.run-approved-action'], trust: {}, enabled: true, approvedActionIds, health: 'installed', configurationSchema: {}, installationSteps: [], uninstallationSteps: [], healthChecks: [], commandsProvided: [], browserSourcesProvided: [], settings };
}

describe('wizard production preflight hardening', () => {
  it('uses declared broker contracts instead of queue/history presentation flags', async () => {
    const actionIds = ['6a78d950-17b5-4a98-9de7-1a5b4275f31c', '18a8de7c-1c5f-4a1e-8d58-7944c74060d5', '0c4d8af8-593c-5e6a-b07f-948079c22cd1'];
    const result = await inspectAddOnActionReadiness([addOn('thsv.raid-scout', {}, actionIds)], actionIds.map((id) => ({ id, name: id, group: 'THSV Addon - Raid Scout', enabled: true, triggerCount: 0 })), true);
    expect(result).toMatchObject({ ready: true, requiredCount: 3, readyCount: 3 });
  });

  it('rejects exact scene names when the catalogue is stale or incomplete', () => {
    const automation = { obs: { enabled: true, automationReady: true } };
    const provider = (updatedAt: string, complete = true) => ({ providers: { obs: { scenes: ['BRB'], complete, updatedAt, connections: [{ complete, updatedAt }] } } });
    expect(inspectSceneConfiguration([addOn('thsv.random-clip-player', { automaticSceneNames: ['BRB'] })], provider(new Date().toISOString()), automation)).toMatchObject({ ready: true });
    expect(inspectSceneConfiguration([addOn('thsv.random-clip-player', { automaticSceneNames: ['BRB'] })], provider(new Date(Date.now() - 16 * 60_000).toISOString()), automation)).toMatchObject({ ready: false, checks: [{ staleProviders: ['obs'] }] });
    expect(inspectSceneConfiguration([addOn('thsv.random-clip-player', { automaticSceneNames: ['BRB'] })], provider(new Date().toISOString(), false), automation)).toMatchObject({ ready: false });
  });

  it('requires a connected browser source for each enabled critical overlay', () => {
    const addOns = [addOn('thsv.starting-soon-countdown', { enabled: true, showOverlay: true }), addOn('thsv.raid-scout', { showSearchProgress: true })];
    expect(inspectCriticalOverlayReadiness(addOns, { enabled: true, addOnClients: { 'thsv.starting-soon-countdown': 1 } })).toMatchObject({ ready: false, requiredCount: 2, connectedCount: 1 });
    expect(inspectCriticalOverlayReadiness(addOns, { enabled: true, addOnClients: { 'thsv.starting-soon-countdown': 1, 'thsv.raid-scout': 1 } })).toMatchObject({ ready: true });
  });

  it('fails a timer canary when its creator-approved target is missing or disabled', () => {
    const rehearsal = { timedActionCanary: { ready: true, definitions: [{ id: 'promo', projections: [{}, {}, {}], target: { provider: 'run-existing-action', actionId: '11111111-1111-4111-8111-111111111111', creatorApproved: true } }] } };
    expect(inspectTimedActionCanary(rehearsal, [], true)).toMatchObject({ ready: false, definitions: [{ targetInstalled: false }] });
    expect(inspectTimedActionCanary(rehearsal, [{ id: '11111111-1111-4111-8111-111111111111', name: 'Promo', group: 'Creator', enabled: true, triggerCount: 0 }], true)).toMatchObject({ ready: true, definitions: [{ targetReady: true }] });
  });
});
