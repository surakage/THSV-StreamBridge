import { mkdir, mkdtemp, readFile, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WizardConfigurationError, WizardConfigurationGateway } from '../../bridge/services/wizard-configuration.js';

describe('Stage 4 wizard configuration gateway', () => {
  it('uses a single lease, commits through a backup, and exports no secrets', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'thsv-wizard-'));
    const path = join(directory, 'bridge.json');
    const source = await readFile('config/bridge.example.json', 'utf8');
    const sourceObject = JSON.parse(source) as Record<string, unknown>;
    sourceObject['viewerIdentity'] = { enabled: true };
    sourceObject['companion'] = { enabled: true };
    const sourceWithArchivedState = `${JSON.stringify(sourceObject, null, 2)}\n`;
    await writeFile(path, sourceWithArchivedState);
    const gateway = new WizardConfigurationGateway(path, () => [], join(directory, 'backups'));
    await expect(gateway.activationStatus()).resolves.toMatchObject({ state: 'active', restartRequired: false });
    const draft = await gateway.begin();
    await expect(gateway.begin()).rejects.toThrow('mutation lease');
    expect(() => gateway.stage(draft.id, { kind: 'platform', platform: 'twitch', enabled: 'yes' })).toThrow('Staged configuration change is invalid');
    gateway.stage(draft.id, { kind: 'platform', platform: 'twitch', enabled: true, inputEnabled: true, outputEnabled: false });
    const committed = await gateway.commit(draft.id);
    expect(committed.status).toBe('committed');
    await expect(gateway.activationStatus()).resolves.toMatchObject({ state: 'restart-required', restartRequired: true });
    expect(committed.backupPath).toBeDefined();
    if (committed.backupPath === undefined) throw new Error('Commit did not return a backup path.');
    expect(await readFile(committed.backupPath, 'utf8')).toBe(sourceWithArchivedState);
    const committedText = await readFile(path, 'utf8');
    expect(committedText).toContain('"viewerIdentity"');
    expect(committedText).toContain('"companion"');
    const exported = JSON.stringify(await gateway.export());
    expect(exported).not.toContain('controlToken');
    expect(exported).not.toContain('passwordEnv');
    expect(exported).toContain('timedActions');
    expect(gateway.diagnostics()).toMatchObject({ mutationWrites: 1, rollbackWrites: 0, activeMutationLeases: 0 });
    const restartedGateway = new WizardConfigurationGateway(path, () => [], join(directory, 'backups-after-restart'));
    await expect(restartedGateway.activationStatus()).resolves.toMatchObject({ state: 'active', restartRequired: false });
  });

  it('round-trips the safe local log-storage policy through configuration export and import', async () => {
    const sourceDirectory = await mkdtemp(join(tmpdir(), 'thsv-wizard-log-policy-source-'));
    const sourcePath = join(sourceDirectory, 'bridge.json');
    await writeFile(sourcePath, await readFile('config/bridge.example.json', 'utf8'));
    await writeFile(join(sourceDirectory, 'log-storage-policy.json'), JSON.stringify({ schemaVersion: 1, activeBytes: 32 * 1024 * 1024, archiveBytes: 96 * 1024 * 1024 }));
    const exported = await new WizardConfigurationGateway(sourcePath, () => []).export();
    expect(exported.logStoragePolicy).toEqual({ activeBytes: 32 * 1024 * 1024, archiveBytes: 96 * 1024 * 1024 });

    const targetDirectory = await mkdtemp(join(tmpdir(), 'thsv-wizard-log-policy-target-'));
    const targetPath = join(targetDirectory, 'bridge.json');
    await writeFile(targetPath, await readFile('config/bridge.example.json', 'utf8'));
    const target = new WizardConfigurationGateway(targetPath, () => []);
    const draft = await target.begin();
    expect(target.stageImport(draft.id, exported).stagedChanges).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'log-storage-policy' })]));
    await target.commit(draft.id);
    expect(JSON.parse(await readFile(join(targetDirectory, 'log-storage-policy.json'), 'utf8'))).toMatchObject({ schemaVersion: 1, activeBytes: 32 * 1024 * 1024, archiveBytes: 96 * 1024 * 1024 });
  });

  it('binds an owned draft to the browser tab that created it', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'thsv-wizard-tab-lease-'));
    const path = join(directory, 'bridge.json');
    await writeFile(path, await readFile('config/bridge.example.json', 'utf8'));
    const gateway = new WizardConfigurationGateway(path, () => [], join(directory, 'backups'));
    const owner = 'wizard-tab-owner';
    const otherTab = 'different-wizard-tab';
    const draft = await gateway.begin(owner);
    const change = { kind: 'platform', platform: 'twitch', enabled: true, inputEnabled: true, outputEnabled: false };

    expect(() => gateway.stage(draft.id, change, otherTab)).toThrow('Another browser tab owns this protected draft');
    expect(() => gateway.cancel(draft.id, otherTab)).toThrow('Another browser tab owns this protected draft');
    gateway.stage(draft.id, change, owner);
    await expect(gateway.commit(draft.id, otherTab)).rejects.toThrow('Another browser tab owns this protected draft');
    expect(gateway.cancel(draft.id, owner)).toMatchObject({ status: 'cancelled' });
  });

  it('stages timed-action CRUD data through the same validated transaction', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'thsv-wizard-timers-'));
    const path = join(directory, 'bridge.json');
    await writeFile(path, await readFile('config/bridge.example.json', 'utf8'));
    const gateway = new WizardConfigurationGateway(path, () => [], join(directory, 'backups'));
    const draft = await gateway.begin();
    const snapshot = await gateway.snapshot() as { timedActions: { stateFile: string; definitions: unknown[] } };
    const timer = {
      id: 'socials', name: 'Socials', enabled: true, intervalMode: 'random', everyMinutes: 15, minimumMinutes: 10, maximumMinutes: 20,
      missedRunPolicy: 'skip', payload: {}, selection: { mode: 'shuffle-container', messages: ['One', 'Two'] },
      gates: { requireLive: true, platforms: ['twitch'], scenes: [], activity: { minimumMessages: 2, windowMinutes: 5 } },
      target: { provider: 'event-only' },
    };
    const staged = gateway.stage(draft.id, { kind: 'timed-actions', timedActions: { ...snapshot.timedActions, definitions: [timer] } });
    expect(staged.stagedChanges).toEqual([expect.objectContaining({ kind: 'timed-actions' })]);
    await gateway.commit(draft.id);
    expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({ timedActions: { definitions: [expect.objectContaining({ id: 'socials' })] } });
  });

  it('does not request a restart when staged settings match the active file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'thsv-wizard-noop-'));
    const path = join(directory, 'bridge.json');
    await writeFile(path, await readFile('config/bridge.example.json', 'utf8'));
    const gateway = new WizardConfigurationGateway(path, () => [], join(directory, 'backups'));
    const snapshot = await gateway.snapshot() as { platforms: Record<string, { enabled: boolean; inputEnabled: boolean; outputEnabled: boolean }> };
    const twitch = snapshot.platforms['twitch'];
    if (twitch === undefined) throw new Error('Expected Twitch platform settings.');
    const draft = await gateway.begin();
    gateway.stage(draft.id, { kind: 'platform', platform: 'twitch', enabled: twitch.enabled, inputEnabled: twitch.inputEnabled, outputEnabled: twitch.outputEnabled });
    await expect(gateway.commit(draft.id)).resolves.toMatchObject({ status: 'committed', restartRequired: false });
    await expect(gateway.activationStatus()).resolves.toMatchObject({ state: 'active', restartRequired: false });
  });

  it('stages alert profiles through the same backup transaction and safe export', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'thsv-wizard-alerts-'));
    const path = join(directory, 'bridge.json');
    await writeFile(path, await readFile('config/bridge.example.json', 'utf8'));
    const gateway = new WizardConfigurationGateway(path, () => [], join(directory, 'backups'));
    const draft = await gateway.begin();
    const alertSettings = {
      maxAlertQueue: 12, alertDurationMs: 8_000, showSimulated: true,
      alerts: { profiles: { kick: { gift: { enabled: true, priority: 'high', durationMs: 6_000, titleTemplate: '{actor} sent {quantity} {itemName}', sound: { mode: 'chime', volume: 0.25 }, aggregation: { mode: 'sum-quantity', windowMs: 4_000 } } } } },
    };
    const staged = gateway.stage(draft.id, { kind: 'alerts', alertSettings });
    expect(staged.stagedChanges).toEqual([expect.objectContaining({ kind: 'alerts' })]);
    await gateway.commit(draft.id);
    expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({ browserOverlay: { maxAlertQueue: 12, alerts: { profiles: { kick: { gift: { priority: 'high' } } } } } });
    expect(await gateway.export()).toMatchObject({ alertSettings: { maxAlertQueue: 12, alerts: { profiles: { kick: { gift: { aggregation: { mode: 'sum-quantity' } } } } } } });
  });

  it('stages chat appearance and ignored names through the safe wizard transaction', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'thsv-wizard-chat-'));
    const path = join(directory, 'bridge.json');
    await writeFile(path, await readFile('config/bridge.example.json', 'utf8'));
    const gateway = new WizardConfigurationGateway(path, () => [], join(directory, 'backups'));
    const snapshot = await gateway.snapshot() as { chatSettings: { brandLabel: string; maxChatMessages: number; showBots: boolean; chat: Record<string, unknown> } };
    const draft = await gateway.begin();
    const events = (snapshot.chatSettings.chat as { events: { enabled: boolean; platforms: Record<string, boolean>; platformEvents: Record<string, Record<string, { enabled: boolean; template: string }>>; characterLimits: Record<string, number> } }).events;
    const subscriber = events.platformEvents['youtube']?.['subscriber'];
    if (subscriber === undefined) throw new Error('YouTube subscriber event settings are required.');
    subscriber.enabled = false;
    const chatSettings = { ...snapshot.chatSettings, maxChatMessages: 12, chat: { ...snapshot.chatSettings.chat, layout: 'compact', fontSizePx: 22, showPlatformLabels: false, ignoredNames: ['ExampleBot'], events: { ...events, characterLimits: { ...events.characterLimits, youtube: 160 } } } };
    const staged = gateway.stage(draft.id, { kind: 'chat-overlay', chatSettings });
    expect(staged.stagedChanges).toEqual([expect.objectContaining({ kind: 'chat-overlay' })]);
    await gateway.commit(draft.id);
    expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({ browserOverlay: { maxChatMessages: 12, chat: { layout: 'compact', fontSizePx: 22, showPlatformLabels: false, ignoredNames: ['ExampleBot'], events: { platformEvents: { youtube: { subscriber: { enabled: false } } }, characterLimits: { youtube: 160 } } } } });
    expect(await gateway.export()).toMatchObject({ chatSettings: { maxChatMessages: 12, chat: { ignoredNames: ['ExampleBot'], events: { platformEvents: { youtube: { subscriber: { enabled: false } } }, characterLimits: { youtube: 160 } } } } });
  });

  it('rejects a stale draft without writing', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'thsv-wizard-stale-'));
    const path = join(directory, 'bridge.json');
    const source = await readFile('config/bridge.example.json', 'utf8');
    await writeFile(path, source);
    const gateway = new WizardConfigurationGateway(path, () => [], join(directory, 'backups'));
    const draft = await gateway.begin();
    gateway.stage(draft.id, { kind: 'platform', platform: 'twitch', enabled: true, inputEnabled: true, outputEnabled: false });
    await writeFile(path, `${source}\n`);
    await expect(gateway.commit(draft.id)).rejects.toBeInstanceOf(WizardConfigurationError);
    expect(await readFile(path, 'utf8')).toBe(`${source}\n`);
    expect(gateway.diagnostics()).toMatchObject({ mutationWrites: 0, rollbackWrites: 0 });
  });

  it('lists only validated backups and restores one with an approval-gated rollback copy', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'thsv-wizard-restore-'));
    const path = join(directory, 'bridge.json'); const backupDirectory = join(directory, 'backups');
    const source = await readFile('config/bridge.example.json', 'utf8');
    await writeFile(path, source);
    const gateway = new WizardConfigurationGateway(path, () => [], backupDirectory);
    const current = (await gateway.snapshot() as { platforms: Record<string, { enabled: boolean; inputEnabled: boolean; outputEnabled: boolean }> }).platforms['twitch'];
    if (current === undefined) throw new Error('Expected Twitch settings.');
    const draft = await gateway.begin();
    gateway.stage(draft.id, { kind: 'platform', platform: 'twitch', enabled: !current.enabled, inputEnabled: current.inputEnabled, outputEnabled: current.outputEnabled });
    await gateway.commit(draft.id);
    const backups = await gateway.backups();
    expect(backups.backups).toHaveLength(1);
    const filename = backups.backups[0]?.filename;
    if (filename === undefined) throw new Error('Expected a validated backup.');
    await expect(gateway.restoreBackup({ filename })).rejects.toThrow('explicit creator approval');
    await expect(gateway.restoreBackup({ filename, approvedByCreator: true })).resolves.toMatchObject({ restored: true, restoredFrom: filename, restartRequired: true });
    expect(await readFile(path, 'utf8')).toBe(source.endsWith('\n') ? source : `${source}\n`);
    expect((await gateway.backups()).backups).toHaveLength(2);
    expect(gateway.diagnostics()).toMatchObject({ mutationWrites: 2, rollbackWrites: 0 });
  });

  it('prunes expired configuration backups while preserving the five newest recovery points', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'thsv-wizard-retention-'));
    const path = join(directory, 'bridge.json'); const backupDirectory = join(directory, 'backups');
    const source = await readFile('config/bridge.example.json', 'utf8');
    await writeFile(path, source); await mkdir(backupDirectory, { recursive: true });
    const old = new Date(Date.now() - 120 * 24 * 60 * 60_000);
    for (let index = 0; index < 7; index += 1) {
      const filename = `2026-01-0${String(index + 1)}T00-00-00-000Z-00000000-0000-4000-8000-00000000000${String(index)}.json`;
      const backupPath = join(backupDirectory, filename); await writeFile(backupPath, source); await utimes(backupPath, old, new Date(old.getTime() + index));
    }
    const gateway = new WizardConfigurationGateway(path, () => [], backupDirectory);
    const result = await gateway.backups();
    expect(result.backups).toHaveLength(5);
    expect(result.retention).toMatchObject({ maximumAgeDays: 90, maximumFiles: 40, minimumKept: 5, pruned: 2 });
  });
});
