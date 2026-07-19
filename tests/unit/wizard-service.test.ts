import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WizardService, WizardTransactionError, type StreamerBotInspector } from '../../bridge/services/wizard-service.js';
import { WizardConfigurationGateway } from '../../bridge/services/wizard-configuration.js';
import type { CommandSyncStore } from '../../bridge/services/command-sync-store.js';
import type { CommandSyncState } from '../../bridge/contracts/v2/command-sync.js';

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

function commandSyncStore(commandIds: readonly string[]): CommandSyncStore {
  return {
    load: () => Promise.resolve({
      version: 1,
      commands: commandIds.map((streamerBotId) => ({
        contractVersion: '2.0.0-preview.1' as const,
        streamerBotId,
        name: streamerBotId,
        aliases: [],
        source: 'wizard-generated' as const,
        lastSeenAt: '2026-07-17T00:00:00.000Z',
        driftStatus: 'in-sync' as const,
      })),
    }),
    scheduleSave: () => {},
    flush: () => Promise.resolve(),
    status: () => ({ enabled: true }),
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

  it('marks only commands in the sync mirror as manageable', async () => {
    const service = new WizardService(inspector(), undefined, commandSyncStore(['creator-command']));
    const result = await service.inspect();
    expect(result.commands).toEqual([expect.objectContaining({ id: 'creator-command', owned: false, managed: true })]);
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

  it('reports command sync as unavailable rather than throwing when no store is configured', async () => {
    const service = new WizardService(inspector());
    const result = await service.syncCommands();
    expect(result).toMatchObject({ available: false, commands: [] });
    expect(result.error).toContain('command sync storage');
    expect((await service.overview())['lastCommandSync']).toEqual(result);
  });
});

describe('Stage 5 step 4: Tier 2 command generation', () => {
  it('generates a package after a fresh collision check finds no conflict', async () => {
    const service = new WizardService(inspector());
    const result = await service.generateCommands({ designs: [{ name: 'so', aliases: ['shoutout'], approvedByCreator: true }] });
    expect(result.available).toBe(true);
    expect(result.collisions).toBeUndefined();
    expect(result.designs).toEqual([{ name: 'so', aliases: ['shoutout'], minimumRole: 'viewer', note: '', actionName: 'THSV Generated - so', responseMessage: '', deliveryPlatforms: [] }]);
    expect(result.package?.filename).toBe('thsv-generated-so.sb');
    expect(result.package?.commands).toEqual([{ name: 'so', actionId: expect.any(String) as string, commandId: expect.any(String) as string, sourceCode: expect.any(String) as string }]);
    expect(typeof result.package?.contentBase64).toBe('string');
  });

  it('generates one package for a batch of several designs', async () => {
    const service = new WizardService(inspector());
    const result = await service.generateCommands({
      designs: [{ name: 'so', approvedByCreator: true }, { name: 'greet', approvedByCreator: true }],
    });
    expect(result.available).toBe(true);
    expect(result.package?.commands.map((command) => command.name)).toEqual(['so', 'greet']);
  });

  it('refuses to generate a batch where any design collides with a live command, regardless of ownership', async () => {
    const creatorInspector: StreamerBotInspector = {
      inspectActions: () => Promise.resolve([]),
      inspectCommands: () => Promise.resolve([{ id: 'creator-command', name: 'hello', enabled: true }]),
      inspectionRequests: () => [],
    };
    const service = new WizardService(creatorInspector);
    const result = await service.generateCommands({ designs: [{ name: 'so', approvedByCreator: true }, { name: 'hello', approvedByCreator: true }] });
    expect(result.available).toBe(true);
    expect(result.package).toBeUndefined();
    expect(result.collisions).toEqual([{ kind: 'command', id: 'creator-command', name: 'hello', matchedOn: 'hello', designIndex: 1 }]);
  });

  it('reports generation as unavailable without throwing when no inspector is configured', async () => {
    const service = new WizardService(undefined);
    const result = await service.generateCommands({ designs: [{ name: 'so', approvedByCreator: true }] });
    expect(result).toMatchObject({ available: false });
    expect(result.error).toContain('Streamer.bot output');
  });

  it('reports an invalid design without throwing', async () => {
    const service = new WizardService(inspector());
    const result = await service.generateCommands({ designs: [{ name: 'So!', approvedByCreator: true }] });
    expect(result.available).toBe(false);
    expect(result.error).toContain('letters, numbers, and hyphens');
  });

  it('rejects a name reused across designs in the same batch without throwing', async () => {
    const service = new WizardService(inspector());
    const result = await service.generateCommands({ designs: [{ name: 'so', approvedByCreator: true }, { name: 'so', approvedByCreator: true }] });
    expect(result.available).toBe(false);
    expect(result.error).toContain('used by both design 0 and design 1');
  });

  it('never marks a command synced until re-inspection confirms the generated ID is live, and handles a partial batch', async () => {
    let saved: CommandSyncState | undefined;
    const store: CommandSyncStore = {
      load: () => Promise.resolve({ version: 1, commands: [] }),
      scheduleSave: (state) => { saved = state; },
      flush: () => Promise.resolve(),
      status: () => ({ enabled: true }),
    };
    const notYetImported = new WizardService(inspector(), undefined, store);
    const missing = await notYetImported.verifyGeneratedCommands({ commands: [{ commandId: 'not-yet-imported', name: 'so' }] });
    expect(missing).toMatchObject({ available: true, verified: false, verifiedCommandIds: [], notFoundCommandIds: ['not-yet-imported'] });
    expect(saved).toBeUndefined();

    const afterImportInspector: StreamerBotInspector = {
      inspectActions: () => Promise.resolve([]),
      inspectCommands: () => Promise.resolve([{ id: 'generated-command-1', name: 'so', enabled: false }]),
      inspectionRequests: () => [],
    };
    const afterImport = new WizardService(afterImportInspector, undefined, store);
    const verified = await afterImport.verifyGeneratedCommands({
      commands: [{ commandId: 'generated-command-1', name: 'so', aliases: ['shoutout'] }, { commandId: 'still-not-imported', name: 'greet' }],
    });
    expect(verified.available).toBe(true);
    expect(verified.verified).toBe(true);
    expect(verified.verifiedCommandIds).toEqual(['generated-command-1']);
    expect(verified.notFoundCommandIds).toEqual(['still-not-imported']);
    expect(verified.commands).toEqual([expect.objectContaining({
      streamerBotId: 'generated-command-1', name: 'so', aliases: ['shoutout'], source: 'wizard-generated', driftStatus: 'in-sync',
    }) as unknown]);
    expect(saved?.commands).toEqual(verified.commands);
  });

  it('reports verification as unavailable rather than throwing when no store is configured', async () => {
    const service = new WizardService(inspector());
    const result = await service.verifyGeneratedCommands({ commands: [{ commandId: 'x', name: 'so' }] });
    expect(result).toMatchObject({ available: false, verified: false });
    expect(result.error).toContain('command sync storage');
  });
});

describe('Tier 1 command administration dispatch', () => {
  function inspectorWithAdministration(): { inspector: StreamerBotInspector; dispatched: Array<{ operation: string; commandId: string }> } {
    const dispatched: Array<{ operation: string; commandId: string }> = [];
    const inspector: StreamerBotInspector = {
      inspectActions: () => Promise.resolve([]),
      inspectCommands: () => Promise.resolve([]),
      inspectionRequests: () => [],
      requestCommandAdministration: (request) => { dispatched.push({ operation: request.operation, commandId: request.commandId }); return Promise.resolve(); },
    };
    return { inspector, dispatched };
  }

  it('dispatches an approved enable request', async () => {
    const { inspector: withAdmin, dispatched } = inspectorWithAdministration();
    const service = new WizardService(withAdmin, undefined, commandSyncStore(['sb-command-1']));
    const result = await service.administerCommand({ operation: 'enable', commandId: 'sb-command-1', approvedByCreator: true });
    expect(result).toMatchObject({ available: true, operation: 'enable', commandId: 'sb-command-1' });
    expect(dispatched).toEqual([{ operation: 'enable', commandId: 'sb-command-1' }]);
  });

  it('reports administration as unavailable without throwing when the inspector has no dispatch method', async () => {
    const service = new WizardService(inspector());
    const result = await service.administerCommand({ operation: 'enable', commandId: 'sb-command-1', approvedByCreator: true });
    expect(result).toMatchObject({ available: false });
    expect(result.error).toContain('Streamer.bot output');
  });

  it('reports administration as unavailable without throwing when no inspector is configured', async () => {
    const service = new WizardService(undefined);
    const result = await service.administerCommand({ operation: 'enable', commandId: 'sb-command-1', approvedByCreator: true });
    expect(result).toMatchObject({ available: false });
  });

  it('rejects a request missing creator approval without dispatching anything', async () => {
    const { inspector: withAdmin, dispatched } = inspectorWithAdministration();
    const service = new WizardService(withAdmin);
    const result = await service.administerCommand({ operation: 'enable', commandId: 'sb-command-1', approvedByCreator: false });
    expect(result.available).toBe(false);
    expect(result.error).toContain('explicit creator approval');
    expect(dispatched).toEqual([]);
  });

  it('rejects administration of a command outside the sync mirror', async () => {
    const { inspector: withAdmin, dispatched } = inspectorWithAdministration();
    const service = new WizardService(withAdmin, undefined, commandSyncStore(['managed-command']));
    const result = await service.administerCommand({ operation: 'disable', commandId: 'unrelated-command', approvedByCreator: true });
    expect(result.available).toBe(false);
    expect(result.error).toContain('limited to commands tracked by THSV StreamBridge');
    expect(dispatched).toEqual([]);
  });

  it('reports a dispatch failure without throwing', async () => {
    const inspector: StreamerBotInspector = {
      inspectActions: () => Promise.resolve([]),
      inspectCommands: () => Promise.resolve([]),
      inspectionRequests: () => [],
      requestCommandAdministration: () => Promise.reject(new Error('Streamer.bot is unavailable')),
    };
    const service = new WizardService(inspector, undefined, commandSyncStore(['sb-command-1']));
    const result = await service.administerCommand({ operation: 'disable', commandId: 'sb-command-1', approvedByCreator: true });
    expect(result.available).toBe(false);
    expect(result.error).toBe('Streamer.bot is unavailable');
  });
});

describe('reward administration dispatch', () => {
  it('dispatches approved Twitch operations and rejects every Kick mutation', async () => {
    const dispatched: unknown[] = [];
    const rewardInspector: StreamerBotInspector = {
      inspectActions: () => Promise.resolve([]), inspectCommands: () => Promise.resolve([]), inspectionRequests: () => [],
      requestRewardAdministration: (request) => { dispatched.push(request); return Promise.resolve(); },
    };
    const service = new WizardService(rewardInspector);
    expect(await service.administerReward({ platform: 'twitch', operation: 'fulfill', rewardId: 'reward-1', redemptionId: 'redeem-1', approvedByCreator: true })).toMatchObject({ available: true, operation: 'fulfill', rewardId: 'reward-1' });
    const kick = await service.administerReward({ platform: 'kick', operation: 'fulfill', rewardId: 'reward-1', redemptionId: 'redeem-1', approvedByCreator: true });
    expect(kick.available).toBe(false);
    expect(kick.error).toContain('Kick reward mutation controls are unavailable');
    expect(dispatched).toHaveLength(1);
  });

  it('reports Streamer.bot unavailability without claiming dispatch', async () => {
    const rewardInspector: StreamerBotInspector = {
      inspectActions: () => Promise.resolve([]), inspectCommands: () => Promise.resolve([]), inspectionRequests: () => [],
      requestRewardAdministration: () => Promise.reject(new Error('Streamer.bot is unavailable')),
    };
    const result = await new WizardService(rewardInspector).administerReward({ platform: 'twitch', operation: 'enable', rewardId: 'reward-1', approvedByCreator: true });
    expect(result).toMatchObject({ available: false, error: 'Streamer.bot is unavailable' });
  });
});
