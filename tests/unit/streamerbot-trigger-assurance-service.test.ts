import { copyFile, mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { StreamerBotTriggerAssuranceService } from '../../bridge/services/streamerbot-trigger-assurance-service.js';
import {
  normalizeStreamerBotVersion,
  STREAMERBOT_TRIGGER_REGISTRY_107,
  STREAMERBOT_TRIGGER_REGISTRY_110_ALPHA3,
  STREAMERBOT_TRIGGER_REGISTRY_110_ALPHA4,
  streamerBotTriggerRegistryForVersion,
} from '../../bridge/contracts/streamerbot-trigger-contract-registry.js';

const contracts = STREAMERBOT_TRIGGER_REGISTRY_107.contracts.map((contract) => [contract.actionName, contract.triggerTypes] as const);

async function fixture(version = '1.0.7'): Promise<{ root: string; actionsPath: string; service: StreamerBotTriggerAssuranceService }> {
  const root = await mkdtemp(join(tmpdir(), 'thsv-trigger-assurance-'));
  const actionsPath = join(root, 'streamerbot', 'data', 'actions.json'); await mkdir(join(root, 'streamerbot', 'data'), { recursive: true });
  await writeFile(actionsPath, JSON.stringify({ actions: contracts.map(([name, types], actionIndex) => ({
    id: `action-${String(actionIndex)}`, name, group: 'THSV', enabled: true,
    triggers: types.map((type, triggerIndex) => ({ id: `${String(actionIndex)}-${String(triggerIndex)}`, type, enabled: true, exclusions: [] })),
  })) }));
  const packageRoot = join(root, 'packages'); await mkdir(join(packageRoot, 'native-platform-intake'), { recursive: true });
  await writeFile(join(packageRoot, 'native-platform-intake', 'manifest.json'), JSON.stringify({ name: 'Native', version: '4.0.3', actions: [{ name: 'one' }], triggerContract: {} }));
  return { root, actionsPath, service: new StreamerBotTriggerAssuranceService({ packageRoot, stateRoot: join(root, 'state'), actionsPath: async () => actionsPath, streamerBotVersion: async () => version, streamerBotRunning: async () => false }) };
}

describe('StreamerBotTriggerAssuranceService', () => {
  it('normalizes and selects only exact tested 1.1.0 alpha registries', async () => {
    expect(normalizeStreamerBotVersion('1.1.0 alpha.3')).toBe('1.1.0-alpha.3');
    expect(normalizeStreamerBotVersion('1.1.0-alpha.3')).toBe('1.1.0-alpha.3');
    expect(normalizeStreamerBotVersion('1.0.7.0')).toBe('1.0.7');
    expect(streamerBotTriggerRegistryForVersion('1.1.0 alpha.3')).toBe(STREAMERBOT_TRIGGER_REGISTRY_110_ALPHA3);
    expect(streamerBotTriggerRegistryForVersion('1.1.0 alpha.4')).toBe(STREAMERBOT_TRIGGER_REGISTRY_110_ALPHA4);

    const alpha = await fixture('1.1.0 alpha.3');
    await copyFile('tests/fixtures/streamerbot-actions-1.1.0-alpha.3.json', alpha.actionsPath);
    expect(await alpha.service.status()).toMatchObject({
      ready: true,
      canSave: false,
      versionCompatible: true,
      supportedStreamerBotVersion: '1.1.0-alpha.3',
      triggerRegistryChannel: 'alpha',
    });

    const document = JSON.parse(await readFile(alpha.actionsPath, 'utf8')) as { actions: Array<{ name: string; triggers: Array<Record<string, unknown>> }> };
    const twitch = document.actions.find((action) => action.name === 'THSV Twitch - Intake');
    if (twitch === undefined) throw new Error('Sanitized alpha fixture is missing the Twitch action.');
    twitch.triggers = twitch.triggers.filter((trigger) => trigger['type'] !== 104);
    await writeFile(alpha.actionsPath, JSON.stringify(document));
    const repaired = await alpha.service.reconcile({ approvedByCreator: true });
    expect(repaired['changed']).toBe(1);
    const persisted = JSON.parse((await readFile(alpha.actionsPath, 'utf8')).replace(/^\uFEFF/u, '')) as typeof document;
    expect(persisted.actions.find((action) => action.name === 'THSV Twitch - Intake')?.triggers.find((trigger) => trigger['type'] === 104)).toMatchObject({ tiers: 16, min: -1, max: -1 });
  });

  it('selects the exact installed alpha.4 registry without weakening future-alpha safety', async () => {
    const alpha = await fixture('1.1.0 alpha.4');
    await copyFile('tests/fixtures/streamerbot-actions-1.1.0-alpha.3.json', alpha.actionsPath);
    expect(await alpha.service.status()).toMatchObject({
      ready: true,
      canSave: false,
      versionCompatible: true,
      supportedStreamerBotVersion: '1.1.0-alpha.4',
      triggerRegistryChannel: 'alpha',
    });
  });

  it('keeps unvalidated 1.1.0 alpha builds inspection-only', async () => {
    const alpha = await fixture('1.1.0 alpha.5');
    await copyFile('tests/fixtures/streamerbot-actions-1.1.0-alpha.3.json', alpha.actionsPath);
    expect(await alpha.service.status()).toMatchObject({ ready: false, canSave: false, versionCompatible: false });
    await expect(alpha.service.reconcile({ approvedByCreator: true })).rejects.toThrow(/not covered/u);
    expect((await alpha.service.backups())['backups']).toEqual([]);
  });

  it('recognizes the supported 1.0.7 contract and records genuine activity only', async () => {
    const { service } = await fixture();
    service.observe({ platform: 'twitch', eventType: 'chat.message', receivedAt: '2026-08-22T12:00:00.000Z', metadata: { simulated: false } });
    service.observe({ platform: 'twitch', eventType: 'chat.message', receivedAt: '2026-08-22T12:01:00.000Z', metadata: { simulated: true } });
    service.acknowledge('twitch', '2026-08-22T12:00:01.000Z');
    const status = await service.status();
    expect(status['ready']).toBe(true);
    expect((status['activity'] as Record<string, Record<string, unknown>>)['twitch']).toMatchObject({ genuineEvents: 1, failures: 0, lastAcknowledgedAt: '2026-08-22T12:00:01.000Z' });
  });

  it('backs up before disabling an exact enabled duplicate and blocks live edits', async () => {
    const { actionsPath, root, service } = await fixture();
    const document = JSON.parse(await readFile(actionsPath, 'utf8')) as { actions: Array<{ triggers: Array<Record<string, unknown>> }> };
    document.actions[0]?.triggers.push({ id: 'duplicate', type: 133, enabled: true, exclusions: [] });
    await writeFile(actionsPath, JSON.stringify(document));
    expect((await service.status())['ready']).toBe(false);
    const result = await service.reconcile({ approvedByCreator: true });
    expect(result['changed']).toBe(1);
    expect(result['changes']).toMatchObject({ total: 1, disabledDuplicates: 1, repairable: true });
    expect((await service.status())['ready']).toBe(true);
    expect((await service.backups())['backups']).toEqual([expect.objectContaining({ integrity: 'verified' })]);
    const running = new StreamerBotTriggerAssuranceService({ packageRoot: join(root, 'packages'), stateRoot: join(root, 'state'), actionsPath: async () => actionsPath, streamerBotVersion: async () => '1.0.7', streamerBotRunning: async () => true });
    await expect(running.reconcile({ approvedByCreator: true })).rejects.toThrow(/Close Streamer\.bot/u);
  });

  it('recreates version-compatible triggers stripped by an import without changing action bodies', async () => {
    const { actionsPath, service } = await fixture();
    const document = JSON.parse(await readFile(actionsPath, 'utf8')) as {
      actions: Array<{ name: string; triggers: Array<Record<string, unknown>>; subActions?: Array<Record<string, unknown>> }>;
    };
    for (const [index, action] of document.actions.entries()) {
      action.triggers = [];
      action.subActions = [{ id: `sub-action-${String(index)}`, type: 25, enabled: true, code: `body-${String(index)}` }];
    }
    const expectedBodies = document.actions.map((action) => action.subActions);
    await writeFile(actionsPath, JSON.stringify(document));

    const before = await service.status();
    expect((before['issues'] as { missingTriggers: unknown[] }).missingTriggers).toHaveLength(29);

    const result = await service.reconcile({ approvedByCreator: true });
    expect(result['changed']).toBe(29);
    expect((result['status'] as Record<string, unknown>)['ready']).toBe(true);

    const backup = result['backup'] as { path: string };
    const backedUp = JSON.parse(await readFile(backup.path, 'utf8')) as typeof document;
    expect(backedUp.actions.every((action) => action.triggers.length === 0)).toBe(true);

    const repaired = JSON.parse((await readFile(actionsPath, 'utf8')).replace(/^\uFEFF/u, '')) as typeof document;
    expect(repaired.actions.map((action) => action.subActions)).toEqual(expectedBodies);
    for (const [name, types] of contracts) {
      const action = repaired.actions.find((candidate) => candidate.name === name);
      expect(action?.triggers.map((trigger) => trigger['type'])).toEqual(types);
      expect(action?.triggers.every((trigger) => trigger['enabled'] === true && Array.isArray(trigger['exclusions']))).toBe(true);
    }
    expect(repaired.actions[0]?.triggers.find((trigger) => trigger['type'] === 104)).toMatchObject({ tiers: 16, min: -1, max: -1 });
    expect(repaired.actions[0]?.triggers.find((trigger) => trigger['type'] === 112)).toMatchObject({ rewardId: '' });
    expect(repaired.actions[2]?.triggers.find((trigger) => trigger['type'] === 35024)).toMatchObject({ rewardId: '' });
    expect((await service.reconcile({ approvedByCreator: true }))['changed']).toBe(0);
  });

  it('refuses unknown Streamer.bot versions and missing action bodies before creating a backup', async () => {
    const { actionsPath, root } = await fixture();
    const wrongVersion = new StreamerBotTriggerAssuranceService({ packageRoot: join(root, 'packages'), stateRoot: join(root, 'wrong-state'), actionsPath: async () => actionsPath, streamerBotVersion: async () => '1.0.8', streamerBotRunning: async () => false });
    expect(await wrongVersion.status()).toMatchObject({ ready: false, canSave: false, versionCompatible: false, supportedStreamerBotVersions: ['1.0.7', '1.1.0-alpha.3', '1.1.0-alpha.4'] });
    await expect(wrongVersion.reconcile({ approvedByCreator: true })).rejects.toThrow(/not covered/u);
    expect((await wrongVersion.backups())['backups']).toEqual([]);

    const document = JSON.parse(await readFile(actionsPath, 'utf8')) as { actions: Array<{ name: string }> };
    document.actions = document.actions.filter((action) => action.name !== 'THSV Kick - Intake');
    await writeFile(actionsPath, JSON.stringify(document));
    const service = new StreamerBotTriggerAssuranceService({ packageRoot: join(root, 'packages'), stateRoot: join(root, 'missing-state'), actionsPath: async () => actionsPath, streamerBotVersion: async () => '1.0.7.0', streamerBotRunning: async () => false });
    expect(await service.status()).toMatchObject({ ready: false, canSave: false, repairPlan: { repairable: false, total: 0 } });
    await expect(service.reconcile({ approvedByCreator: true })).rejects.toThrow(/Regenerate and import/u);
    expect((await service.backups())['backups']).toEqual([]);
  });

  it('rejects a corrupted verified backup without changing the installed actions file', async () => {
    const { actionsPath, service } = await fixture();
    const document = JSON.parse(await readFile(actionsPath, 'utf8')) as { actions: Array<{ triggers: Array<Record<string, unknown>> }> };
    document.actions[0]?.triggers.push({ id: 'duplicate-for-backup', type: 133, enabled: true, exclusions: [] });
    await writeFile(actionsPath, JSON.stringify(document));
    const repaired = await service.reconcile({ approvedByCreator: true });
    const backup = repaired['backup'] as { name: string; path: string };
    const installedBeforeRestore = await readFile(actionsPath);
    await writeFile(backup.path, JSON.stringify({ actions: [] }));
    expect((await service.backups())['backups']).toEqual([expect.objectContaining({ name: backup.name, integrity: 'failed' })]);
    await expect(service.restore({ name: backup.name, approvedByCreator: true })).rejects.toThrow(/SHA-256/u);
    expect(await readFile(actionsPath)).toEqual(installedBeforeRestore);
  });

  it('retains only the newest 20 trigger backups and removes matching integrity sidecars', async () => {
    const { actionsPath, root, service } = await fixture();
    for (let index = 0; index < 22; index += 1) {
      const document = JSON.parse((await readFile(actionsPath, 'utf8')).replace(/^\uFEFF/u, '')) as { actions: Array<{ triggers: Array<Record<string, unknown>> }> };
      document.actions[0]?.triggers.push({ id: `duplicate-${String(index)}`, type: 133, enabled: true, exclusions: [] });
      await writeFile(actionsPath, JSON.stringify(document));
      await service.reconcile({ approvedByCreator: true });
    }
    const result = await service.backups();
    expect(result['retention']).toEqual({ maximumFiles: 20 });
    expect(result['backups']).toHaveLength(20);
    const entries = await readdir(join(root, 'state', 'streamerbot-action-backups'));
    expect(entries.filter((name) => name.endsWith('.json') && !name.endsWith('.integrity.json'))).toHaveLength(20);
    expect(entries.filter((name) => name.endsWith('.integrity.json'))).toHaveLength(20);
  });

  it('keeps an unknown managed trigger schema read-only', async () => {
    const { actionsPath, service } = await fixture();
    const document = JSON.parse(await readFile(actionsPath, 'utf8')) as { actions: Array<{ triggers: unknown[] }> };
    document.actions[0]?.triggers.push(null);
    await writeFile(actionsPath, JSON.stringify(document));
    expect(await service.status()).toMatchObject({ ready: false, canSave: false, schemaCompatible: false });
    await expect(service.reconcile({ approvedByCreator: true })).rejects.toThrow(/invalid triggers array/u);
    expect((await service.backups())['backups']).toEqual([]);
  });
});
