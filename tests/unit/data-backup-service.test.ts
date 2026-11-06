/* eslint-disable @typescript-eslint/no-unsafe-assignment -- vitest asymmetric matchers are typed as any */
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DataBackupService, parseDataBundle } from '../../bridge/services/data-backup-service.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(async (root) => await rm(root, { recursive: true, force: true }))); });

async function setup(now = Date.parse('2026-11-06T12:00:00.000Z')) {
  const root = await mkdtemp(join(tmpdir(), 'data-backup-')); roots.push(root);
  const stateRoot = join(root, 'state'); const backupDirectory = join(root, 'backups');
  const write = async (moduleId: string, file: string, value: unknown) => { await mkdir(join(stateRoot, moduleId), { recursive: true }); await writeFile(join(stateRoot, moduleId, file), JSON.stringify(value)); };
  await write('thsv.quote-vault', 'runtime-state.json', { approved: [{ id: 1, text: 'Hello' }] });
  await write('thsv.quote-vault', 'settings.json', { enabled: true, maximumApprovedQuotes: 100, apiToken: 'keep-me-private' });
  await write('thsv.viewer-foundation', 'runtime-state.json', { viewers: { alex: { points: 10 } } });
  let clock = now;
  const service = new DataBackupService({
    stateRoot, backupDirectory, version: '4.1.51',
    modules: async () => [{ moduleId: 'thsv.quote-vault', name: 'Quote Vault', configurationSchema: {} }, { moduleId: 'thsv.viewer-foundation', name: 'Viewer Foundation', configurationSchema: {} }],
    checkSettings: (_schema, value) => { if (value['broken'] === true) throw new Error('bad'); return value; },
    configuration: async () => ({ format: 'thsv.streambridge.wizard-configuration', version: 1 }),
    now: () => clock,
  });
  return { service, stateRoot, backupDirectory, write, tick: (ms: number) => { clock += ms; } };
}

describe('DataBackupService', () => {
  it('exports every extension with data and settings, without secrets, plus the wizard configuration', async () => {
    const { service } = await setup();
    const bundle = await service.exportBundle();
    expect(bundle).toMatchObject({ format: 'thsv-streambridge-data', version: 1, appVersion: '4.1.51', configuration: { version: 1 } });
    expect(bundle.addOns['thsv.quote-vault']).toEqual({ name: 'Quote Vault', data: { approved: [{ id: 1, text: 'Hello' }] }, settings: { enabled: true, maximumApprovedQuotes: 100 } });
    expect(bundle.addOns['thsv.viewer-foundation']).toEqual({ name: 'Viewer Foundation', data: { viewers: { alex: { points: 10 } } } });
    const single = await service.exportBundle({ moduleIds: ['thsv.quote-vault'], includeSettings: false });
    expect(Object.keys(single.addOns)).toEqual(['thsv.quote-vault']);
    expect(single.addOns['thsv.quote-vault']?.settings).toBeUndefined();
    expect(single.configuration).toBeUndefined();
    expect((await service.summary())['modules']).toEqual([
      expect.objectContaining({ moduleId: 'thsv.quote-vault', hasSettings: true, dataBytes: expect.any(Number) }),
      expect.objectContaining({ moduleId: 'thsv.viewer-foundation', hasSettings: false }),
    ]);
  });

  it('previews and stages a restore that only applies on the next start, after a safety backup', async () => {
    const { service, stateRoot, write } = await setup();
    const bundle = JSON.parse(JSON.stringify(await service.exportBundle())) as { addOns: Record<string, Record<string, unknown>> };
    bundle.addOns['thsv.quote-vault'] = { ...bundle.addOns['thsv.quote-vault'], data: { approved: [{ id: 1, text: 'Restored' }] } };
    bundle.addOns['thsv.unknown'] = { data: { a: 1 } };
    expect(await service.preview({ bundle })).toMatchObject({ hasConfiguration: true, modules: [{ moduleId: 'thsv.quote-vault', installed: true, hasData: true, hasSettings: true }, { moduleId: 'thsv.unknown', installed: false }, { moduleId: 'thsv.viewer-foundation' }] });
    await expect(service.restore({ bundle })).rejects.toThrow('approval');
    const staged = await service.restore({ bundle, moduleIds: ['thsv.quote-vault', 'thsv.unknown'], approvedByCreator: true });
    expect(staged).toMatchObject({ staged: 1, restartRequired: true, skipped: [{ moduleId: 'thsv.unknown', reason: 'not installed' }], safetyBackup: expect.stringMatching(/before-restore\.json$/u) });
    expect(await service.pendingRestore()).toMatchObject({ modules: [{ moduleId: 'thsv.quote-vault', data: true, settings: true }] });
    // The running extension keeps writing until the restart; the staged copy still wins.
    await write('thsv.quote-vault', 'runtime-state.json', { approved: [{ id: 1, text: 'Written after the restore was chosen' }] });
    expect(await service.applyPendingRestore()).toEqual({ applied: ['thsv.quote-vault'] });
    expect(JSON.parse(await readFile(join(stateRoot, 'thsv.quote-vault', 'runtime-state.json'), 'utf8'))).toEqual({ approved: [{ id: 1, text: 'Restored' }] });
    expect(JSON.parse(await readFile(join(stateRoot, 'thsv.viewer-foundation', 'runtime-state.json'), 'utf8'))).toEqual({ viewers: { alex: { points: 10 } } });
    expect(await service.pendingRestore()).toBeNull();
    expect(await service.applyPendingRestore()).toEqual({ applied: [] });
  });

  it('restores from a saved backup, can restore only data, skips settings that do not fit, and can be cancelled', async () => {
    const { service, stateRoot } = await setup();
    const backup = await service.backupNow('manual');
    const bundle = JSON.parse(JSON.stringify(await service.exportBundle())) as { addOns: Record<string, Record<string, unknown>> };
    bundle.addOns['thsv.quote-vault'] = { ...bundle.addOns['thsv.quote-vault'], settings: { broken: true } };
    await expect(service.restore({ bundle, settings: true, data: false, moduleIds: ['thsv.quote-vault', 'thsv.viewer-foundation'], approvedByCreator: true })).rejects.toThrow('Nothing');
    const fromFile = await service.restore({ backup: backup.filename, data: true, settings: false, approvedByCreator: true });
    expect(fromFile).toMatchObject({ staged: 2, modules: [expect.objectContaining({ data: true, settings: false }), expect.objectContaining({ data: true, settings: false })] });
    expect(await service.cancelRestore()).toEqual({ cancelled: true });
    expect(await service.applyPendingRestore()).toEqual({ applied: [] });
    expect(await readdir(stateRoot)).not.toContain('.pending-restore');
    await expect(service.restore({ backup: '../secret.json', approvedByCreator: true })).rejects.toThrow('Choose a listed backup');
    expect(() => parseDataBundle({ format: 'other' })).toThrow('not a StreamBridge data backup');
  });

  it('makes one automatic backup a day and keeps the last 14', async () => {
    const { service, tick } = await setup();
    expect(await service.runDailyBackup()).toMatchObject({ created: true });
    expect(await service.runDailyBackup()).toEqual({ created: false });
    for (let day = 0; day < 16; day += 1) {
      tick(day === 0 ? 23 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000);
      await service.runDailyBackup();
    }
    const backups = await service.listBackups();
    // 1 + 15 more days (the first tick of 23 hours is too soon) = 16 made, 14 kept.
    expect(backups.filter((item) => item.kind === 'daily')).toHaveLength(14);
    expect(backups[0]?.createdAt).toBe('2026-11-22T11:00:00.000Z');
    const latest = JSON.parse(await service.readBackup(backups[0]?.filename ?? '')) as Record<string, unknown>;
    expect(latest).toMatchObject({ format: 'thsv-streambridge-data', reason: 'daily' });
  });
});
