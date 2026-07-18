import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WizardService, WizardTransactionError, type StreamerBotInspector } from '../../bridge/services/wizard-service.js';
import { WizardConfigurationGateway } from '../../bridge/services/wizard-configuration.js';

function inspector(): StreamerBotInspector {
  const requests: Array<{ request: 'GetActions' | 'GetCommands'; requestedAt: string }> = [];
  return {
    inspectActions: () => { requests.push({ request: 'GetActions', requestedAt: '2026-07-17T00:00:00.000Z' }); return Promise.resolve([
      { id: '143fce1d-c5b0-4108-b766-ee2d0249e2d4', name: 'THSV StreamBridge - Receive Event', group: 'THSV StreamBridge', enabled: true },
      { id: 'creator-action', name: 'THSV StreamBridge - Receive Event', group: 'Creator', enabled: true },
    ]); },
    inspectCommands: () => { requests.push({ request: 'GetCommands', requestedAt: '2026-07-17T00:00:00.000Z' }); return Promise.resolve([{ id: 'creator-command', name: '!hello', enabled: true }]); },
    inspectionRequests: () => [...requests],
  };
}

describe('Stage 3 wizard service', () => {
  it('inspects with documented reads and recognizes ownership only by exact id and name', async () => {
    const service = new WizardService(inspector());
    const result = await service.inspect();
    expect(result.available).toBe(true);
    expect(result.requests.map((entry) => entry.request).sort()).toEqual(['GetActions', 'GetCommands']);
    expect(result.actions.map((action) => action.owned)).toEqual([true, false]);
    expect(result.commands[0]?.owned).toBe(false);
    expect(service.diagnostics()).toMatchObject({ documentedRequestsOnly: true, mutationRequestsSent: 0 });
  });

  it('cancels a non-mutating draft transaction and rejects unknown ids', async () => {
    const service = new WizardService(undefined);
    const draft = await service.beginTransaction();
    expect(draft).toMatchObject({ status: 'draft', stagedChanges: [] });
    expect(service.cancelTransaction(draft.id)).toMatchObject({ status: 'cancelled', stagedChanges: [] });
    expect(() => service.cancelTransaction('missing')).toThrow(WizardTransactionError);
  });

  it('reports real configuration drafts in overview and preserves staged changes on cancel', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'thsv-wizard-service-'));
    const path = join(directory, 'bridge.json');
    await writeFile(path, await readFile('config/bridge.example.json', 'utf8'));
    const gateway = new WizardConfigurationGateway(path, () => [], join(directory, 'backups'));
    const service = new WizardService(undefined, gateway);

    const draft = await service.beginTransaction();
    if (!('restartRequired' in draft)) throw new Error('Expected a configuration draft.');

    // Before this fix, overview().transactions always read from WizardService's own
    // now-unused Stage 3 map and never reflected a real configuration-mode draft.
    const beforeStaging = await service.overview();
    expect(beforeStaging['transactions']).toMatchObject([{ id: draft.id, status: 'draft' }]);

    const staged = service.stageTransaction(draft.id, { kind: 'platform', platform: 'twitch', enabled: true, inputEnabled: true, outputEnabled: false });
    // Before this fix, cancelTransaction()'s declared return type (`as unknown as
    // WizardTransaction`) claimed stagedChanges is always empty (typed `never[]`), even
    // though a real configuration draft can genuinely hold staged changes like this one.
    expect(staged.stagedChanges).toHaveLength(1);
    const afterStaging = await service.overview();
    expect((afterStaging['transactions'] as Array<{ stagedChanges: unknown[] }>)[0]?.stagedChanges).toHaveLength(1);

    const cancelled = service.cancelTransaction(draft.id);
    expect(cancelled).toMatchObject({ status: 'cancelled', stagedChanges: [] });
  });
});
