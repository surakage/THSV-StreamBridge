import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OperationalReliabilityService } from '../../bridge/services/operational-reliability-service.js';
import type { NormalizedEvent } from '../../schemas/event.js';
import { silentLogger } from '../helpers.js';

const roots: string[] = [];
afterEach(async () => { vi.useRealTimers(); await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function createHarness(triggerReady = true) {
  const root = await mkdtemp(join(tmpdir(), 'thsv-operational-')); roots.push(root);
  const packageRoot = join(root, 'package'); const streamerBotPackageRoot = join(packageRoot, 'packages', 'streamerbot'); const dataRoot = join(root, 'data');
  await mkdir(join(streamerBotPackageRoot, 'core'), { recursive: true });
  await writeFile(join(packageRoot, 'package.json'), JSON.stringify({ version: '4.0.4' }));
  await writeFile(join(streamerBotPackageRoot, 'core', 'manifest.json'), JSON.stringify({ version: '4.0.4' }));
  await writeFile(join(streamerBotPackageRoot, 'core', 'THSV-Core-4.0.4.sb'), 'fixture');
  let ready = triggerReady;
  let capabilityStatus: Readonly<Record<string, unknown>> = { modules: {} };
  const reconcile = vi.fn(async () => { ready = true; return { changed: 2, backup: 'actions-before-repair.json' }; });
  const options = {
    dataRoot, expectedVersion: '4.0.4', packageRoot, streamerBotPackageRoot, logger: silentLogger,
    diagnostics: () => ({ modules: [
      { moduleId: 'thsv.starting-soon-countdown', status: 'healthy' }, { moduleId: 'thsv.ad-break-companion', status: 'healthy' },
      { moduleId: 'thsv.random-clip-player', status: 'healthy' }, { moduleId: 'thsv.raid-scout', status: 'healthy' },
    ], timedActions: {}, mainFeatures: {} }),
    readiness: () => ({ ready: true, blockers: [], adapters: [], outputs: [] }),
    triggerStatus: async () => ({ ready, connectionExplanation: 'Installed trigger contract inspected.' }), reconcileTriggers: reconcile,
    sceneStatus: () => ({ providers: { obs: { scenes: ['Starting Soon', 'Live', 'BRB'] } } }), overlayStatus: () => ({ chat: 'connected', alerts: 'connected' }),
    listAddOns: async () => [{ moduleId: 'thsv.raid-scout', version: '4.0.4' }],
    capabilityStatus: () => capabilityStatus,
  };
  const service = new OperationalReliabilityService(options);
  return { service, root, packageRoot, dataRoot, reconcile, options, setCapabilityStatus: (value: Readonly<Record<string, unknown>>) => { capabilityStatus = value; } };
}

function event(eventId: string, eventType: string, receivedAt: string): NormalizedEvent {
  return {
    schemaVersion: '1.0.0', eventId, eventType, platform: 'twitch', source: { adapter: 'test', eventName: eventType }, receivedAt,
    channel: { name: 'private-channel' }, user: { id: 'private-user-id', name: 'SecretViewer', displayName: 'Secret Viewer', actorType: 'human', roles: [] },
    payload: { text: 'private chat text', operation: 'route-check' }, metadata: { simulated: false },
  };
}

describe('operational reliability service', () => {
  it('detects matched release state and runs a mutation-free live rehearsal', async () => {
    const { service, reconcile } = await createHarness();
    await expect(service.driftStatus()).resolves.toMatchObject({ ready: true, issues: [] });
    await expect(service.rehearsal()).resolves.toMatchObject({ ready: true, safe: true, mutationPolicy: 'dry-run' });
    expect(reconcile).not.toHaveBeenCalled();
  });

  it('requires approval and uses the backed-up trigger reconciler for repairable drift', async () => {
    const { service, reconcile } = await createHarness(false);
    await expect(service.repair({})).rejects.toThrow('explicit creator approval');
    await expect(service.repair({ approvedByCreator: true })).resolves.toMatchObject({ repaired: true, changed: 2, backup: 'actions-before-repair.json', after: { ready: true } });
    expect(reconcile).toHaveBeenCalledOnce();
  });

  it('blocks in-place repair of release files', async () => {
    const { service, packageRoot, reconcile } = await createHarness();
    await writeFile(join(packageRoot, 'package.json'), JSON.stringify({ version: '4.0.3' }));
    await expect(service.repair({ approvedByCreator: true })).rejects.toThrow('Apply the verified StreamBridge update');
    expect(reconcile).not.toHaveBeenCalled();
  });

  it('retains only redacted routing evidence and writes a privacy-safe post-stream report', async () => {
    const { service, dataRoot } = await createHarness();
    const startedAt = new Date().toISOString();
    service.recoverLiveSession(['twitch'], startedAt);
    service.observe(event('evt-private', 'chat.message', startedAt));
    const timeline = service.timelineStatus() as { events: unknown[] };
    const serialized = JSON.stringify(timeline);
    expect(serialized).toContain('chat.message'); expect(serialized).not.toContain('private chat text'); expect(serialized).not.toContain('SecretViewer');
    const replay = service.replay('evt-private', { approvedByCreator: true });
    expect(replay).toMatchObject({ mode: 'dry-run', externalMutationSuppressed: true });
    await service.endRecoveredLiveSession(); await service.flush();
    expect(service.latestReport()).toMatchObject({ available: true, privacy: { chatTextRetained: false, viewerIdentityRetained: false, rawPayloadRetained: false } });
    const persisted = await readFile(join(dataRoot, 'reports', 'post-stream', 'latest.json'), 'utf8');
    expect(persisted).not.toContain('private chat text'); expect(persisted).not.toContain('SecretViewer');
  });

  it('keeps one live-session journal across a Bridge restart and reports capability incidents', async () => {
    const { service, options, dataRoot, setCapabilityStatus } = await createHarness();
    const startedAt = new Date().toISOString();
    service.recoverLiveSession(['twitch'], startedAt);
    service.observe(event('evt-countdown', 'addon.thsv.starting-soon-countdown.started', startedAt));
    setCapabilityStatus({ modules: { 'thsv.random-clip-player': { denied: 3, failed: 1 } } });
    await service.stop();
    expect(await readFile(join(dataRoot, 'state', 'active-stream-session.json'), 'utf8')).toContain('starting-soon-countdown');

    const restarted = new OperationalReliabilityService(options);
    await restarted.start();
    setCapabilityStatus({ modules: { 'thsv.random-clip-player': { denied: 5, failed: 2 } } });
    restarted.observe(event('evt-chat-after-restart', 'chat.message', new Date().toISOString()));
    await restarted.endRecoveredLiveSession();
    expect(restarted.latestReport()).toMatchObject({
      schemaVersion: 2,
      completed: true,
      counts: { 'addon.thsv.starting-soon-countdown.started': 1, 'chat.message': 1 },
      operationalIncidents: [{ moduleId: 'thsv.random-clip-player', denied: 5, failed: 2, count: 7 }],
      summary: { capabilityDenialCount: 5, capabilityFailureCount: 2 },
    });
    await expect(readFile(join(dataRoot, 'state', 'active-stream-session.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    await restarted.stop();
  });

  it('coalesces burst session updates while flush still forces durable shutdown state', async () => {
    vi.useFakeTimers(); vi.setSystemTime('2026-08-26T12:00:00.000Z');
    const { service, dataRoot } = await createHarness();
    service.recoverLiveSession(['twitch']);
    for (let index = 0; index < 25; index += 1) service.observe(event(`evt-${String(index)}`, 'chat.message', new Date().toISOString()));
    const journal = join(dataRoot, 'state', 'active-stream-session.json');
    await vi.advanceTimersByTimeAsync(1_499);
    await expect(readFile(journal, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    await vi.advanceTimersByTimeAsync(1);
    await service.flush();
    expect(JSON.parse(await readFile(journal, 'utf8'))).toMatchObject({ counts: { 'chat.message': 25 } });
    await service.stop();
  });
});
