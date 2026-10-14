import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { STREAMERBOT_TRIGGER_REGISTRIES, STREAMERBOT_TRIGGER_REGISTRY_107 } from '../../bridge/contracts/streamerbot-trigger-contract-registry.js';
import { StreamerBotTriggerAssuranceService } from '../../bridge/services/streamerbot-trigger-assurance-service.js';
import { StreamerBotUniversalImportService } from '../../bridge/services/streamerbot-universal-import-service.js';
import type { WizardAddOnSummary } from '../../bridge/services/addon-wizard-service.js';

type Trigger = Record<string, unknown> & { readonly id: string; readonly type: number; readonly enabled: boolean };
interface ExportedAction { readonly id: string; readonly name: string; readonly enabled: boolean; readonly triggers: readonly Trigger[] }

function decode(contentBase64: string): { data: { actions: ExportedAction[] } } {
  const bytes = Buffer.from(contentBase64, 'base64');
  return JSON.parse(gunzipSync(bytes.subarray(4)).toString('utf8')) as { data: { actions: ExportedAction[] } };
}

async function packageActions(folder: string): Promise<ExportedAction[]> {
  const manifest = JSON.parse(await readFile(`packages/streamerbot/${folder}/manifest.json`, 'utf8')) as { actions: Array<{ importFile: string }> };
  return decode((await readFile(`packages/streamerbot/${folder}/${manifest.actions[0]?.importFile ?? ''}`, 'utf8')).trim()).data.actions;
}

async function completeUniversalImport(): Promise<ExportedAction[]> {
  const service = new StreamerBotUniversalImportService();
  const initial = await service.catalogue([]);
  const installed = initial.packages.filter((item) => item.kind === 'addon' && item.moduleId !== undefined)
    .map((item) => ({ moduleId: item.moduleId, health: 'installed', enabled: true }) as WizardAddOnSummary);
  const catalogue = await service.catalogue(installed);
  return decode((await service.build(catalogue.packages.map((item) => item.folder), installed)).contentBase64).data.actions;
}

// Streamer.bot's import overwrites an existing item with the same name (its Import & Export guide),
// replacing the whole action including its trigger collection. This models that behaviour.
function importInto(existing: readonly ExportedAction[], imported: readonly ExportedAction[]): ExportedAction[] {
  const importedNames = new Set(imported.map((action) => action.name));
  return [...existing.filter((action) => !importedNames.has(action.name)), ...structuredClone(imported)];
}

async function assess(actions: readonly ExportedAction[]): Promise<Readonly<Record<string, unknown>>> {
  const root = await mkdtemp(join(tmpdir(), 'thsv-embedded-triggers-'));
  const actionsPath = join(root, 'actions.json');
  await writeFile(actionsPath, JSON.stringify({ actions }));
  await mkdir(join(root, 'packages'), { recursive: true });
  return new StreamerBotTriggerAssuranceService({ packageRoot: join(root, 'packages'), stateRoot: join(root, 'state'), actionsPath: async () => actionsPath, streamerBotVersion: async () => '1.0.7' }).status();
}

describe('fixed Streamer.bot triggers embedded in the generated imports', () => {
  it('uses one shared contract list for every tested Streamer.bot version', () => {
    for (const registry of STREAMERBOT_TRIGGER_REGISTRIES) {
      expect(registry.contracts).toBe(STREAMERBOT_TRIGGER_REGISTRY_107.contracts);
      expect(registry.defaults).toBe(STREAMERBOT_TRIGGER_REGISTRY_107.defaults);
    }
  });

  it('embeds exactly the contract trigger types, with the verified default settings, on every contract action', async () => {
    let embedded = 0;
    for (const contract of STREAMERBOT_TRIGGER_REGISTRY_107.contracts) {
      const action = (await packageActions(contract.packageId)).find((candidate) => candidate.name === contract.actionName);
      expect(action, contract.actionName).toBeDefined();
      expect(action?.triggers.map((trigger) => trigger.type)).toEqual(contract.triggerTypes);
      for (const trigger of action?.triggers ?? []) {
        const { id, type, enabled, exclusions, ...settings } = trigger;
        expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
        expect({ enabled, exclusions }).toEqual({ enabled: true, exclusions: [] });
        expect(settings).toEqual(STREAMERBOT_TRIGGER_REGISTRY_107.defaults[type] ?? {});
        embedded += 1;
      }
    }
    expect(embedded).toBe(34);
  });

  it('keeps the bridge launcher and every other non-contract action free of guessed native triggers', async () => {
    const contractActions = new Set(STREAMERBOT_TRIGGER_REGISTRY_107.contracts.map((contract) => contract.actionName));
    const actions = await completeUniversalImport();
    for (const action of actions.filter((candidate) => !contractActions.has(candidate.name))) {
      expect(action.triggers.every((trigger) => trigger.type === 401), action.name).toBe(true);
    }
    expect(actions.find((action) => action.name === 'THSV StreamBridge - Launch Bridge')?.triggers).toEqual([]);
  });

  it('carries the embedded triggers through the universal import with unique trigger IDs', async () => {
    const actions = await completeUniversalImport();
    const triggers = actions.flatMap((action) => action.triggers);
    expect(triggers.filter((trigger) => trigger.type !== 401)).toHaveLength(34);
    expect(new Set(triggers.map((trigger) => trigger.id)).size).toBe(triggers.length);
    expect(actions.find((action) => action.name === 'THSV Twitch - Intake')?.triggers.map((trigger) => trigger.type)).toEqual([133, 101, 102, 104, 105, 106, 107, 112, 154, 155]);
  });

  it('passes the trigger assurance check on a fresh import with nothing to repair', async () => {
    const status = await assess(importInto([], await completeUniversalImport()));
    expect(status).toMatchObject({ ready: true, canSave: false, issues: { missingActions: [], missingTriggers: [], duplicateEnabledTriggers: [] }, repairPlan: { repairable: true, total: 0 } });
    expect((status['actions'] as Array<{ state: string }>).every((entry) => entry.state === 'ready')).toBe(true);
  });

  it('replaces hand-attached triggers on re-import instead of duplicating them', async () => {
    const imported = await completeUniversalImport();
    // An existing setup: the same actions with the matrix attached by hand under different IDs.
    const handMade = imported.map((action) => ({ ...action, triggers: action.triggers.map((trigger, index) => ({ ...trigger, id: `hand-${action.id}-${String(index)}` })) }));
    expect((await assess(handMade))['ready']).toBe(true);
    const afterReimport = importInto(handMade, imported);
    const twitch = afterReimport.filter((action) => action.name === 'THSV Twitch - Intake');
    expect(twitch).toHaveLength(1);
    expect(twitch[0]?.triggers).toHaveLength(10);
    expect(await assess(afterReimport)).toMatchObject({ ready: true, issues: { duplicateEnabledTriggers: [] }, repairPlan: { total: 0 } });
    // Importing the same file twice is byte-for-byte idempotent.
    expect(importInto(afterReimport, imported)).toEqual(afterReimport);
  });
});
