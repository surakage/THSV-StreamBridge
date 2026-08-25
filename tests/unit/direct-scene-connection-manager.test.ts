import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BroadcastConnectionVaultService, type CredentialProtector } from '../../bridge/services/broadcast-connection-vault-service.js';
import { DirectSceneConnectionManager, type DirectSceneConnectionClientFactory } from '../../bridge/services/direct-scene-connection-manager.js';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const protector: CredentialProtector = { protect: async (value) => `p:${value}`, unprotect: async (value) => value.slice(2) };

describe('direct scene connection manager', () => {
  it('runs multiple named subscriptions, refreshes after events, and reports direct transport', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-direct-manager-')); roots.push(root);
    const vault = new BroadcastConnectionVaultService(root, 'win32', protector); await vault.start();
    await vault.save({ name: 'Landscape', provider: 'obs', url: 'ws://127.0.0.1:4455', enabled: true });
    await vault.save({ name: 'Portrait', provider: 'obs', url: 'ws://127.0.0.1:4456', enabled: true });
    const changeHandlers = new Map<string, () => void>();
    const snapshots = new Map<string, number>();
    const factory: DirectSceneConnectionClientFactory = (profile) => ({
      getSceneList: vi.fn(async () => ({ connectionId: profile.id, connectionName: profile.name, scenes: [`Scene ${String((snapshots.get(profile.id) ?? 0) + 1)}`] })),
      watchChanges: async (onChange, signal) => { changeHandlers.set(profile.id, onChange); await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true })); },
    });
    const historyPath = join(root, 'state', 'broadcast-connection-events.json');
    const manager = new DirectSceneConnectionManager(vault, [], factory, historyPath);
    const listener = vi.fn(); await manager.start(listener);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(2));
    const firstId = (await vault.resolved('obs'))[0]?.id ?? ''; snapshots.set(firstId, 1); changeHandlers.get(firstId)?.();
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(3));
    await expect(manager.test({ provider: 'obs', connectionIndex: 1 })).resolves.toMatchObject({ available: true, transport: 'direct-websocket', connectionName: 'Portrait' });
    await expect(manager.testCandidate({ id: '99999999-9999-4999-8999-999999999999', name: 'Proposed', provider: 'obs', url: 'ws://127.0.0.1:4499', enabled: true, hasCredential: true, credential: 'proposed-only' })).resolves.toMatchObject({ available: true, connectionName: 'Proposed' });
    const suggestions = await manager.suggestUnusedPorts({ provider: 'obs' }) as { mutationFree: boolean; suggestions: number[] }; expect(suggestions.mutationFree).toBe(true); expect(suggestions.suggestions).not.toContain(4455); expect(suggestions.suggestions).not.toContain(4456);
    await expect(manager.captureReliabilitySnapshot()).resolves.toMatchObject({ comparison: { available: false } });
    await expect(manager.captureReliabilitySnapshot()).resolves.toMatchObject({ comparison: { available: true } });
    expect(manager.reliabilityHistory()).toMatchObject({ redacted: true, snapshotCount: 2, snapshots: [{ comparison: { available: true } }, { comparison: { available: false } }] });
    expect((manager.status() as { connections: unknown[] }).connections).toHaveLength(2);
    await manager.stop();
    const status = manager.status() as { subscriptionsActive: boolean; connections: Array<{ reconnectCount: number; lastLatencyMs?: number }>; events: Array<{ type: string; connectionName: string }> };
    expect(status.subscriptionsActive).toBe(false); expect(status.connections).toHaveLength(2); expect(status.connections[0]?.reconnectCount).toBe(0); expect(typeof status.connections[0]?.lastLatencyMs).toBe('number'); expect(status.events.some((event) => event.type === 'test-succeeded' && event.connectionName === 'Portrait')).toBe(true);
    const persisted = await readFile(historyPath, 'utf8'); expect(persisted).not.toContain('credential'); const parsed = JSON.parse(persisted) as unknown[]; expect(parsed.length).toBeGreaterThan(0);
  });

  it('pauses while a configured application is closed and resumes without reconnect noise', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-direct-pause-')); roots.push(root);
    const vault = new BroadcastConnectionVaultService(root, 'win32', protector); await vault.start();
    await vault.save({ name: 'Meld local', provider: 'meld', url: 'ws://127.0.0.1:13376', enabled: true });
    let running = false;
    const watchChanges = vi.fn(async (_onChange: () => void, signal: AbortSignal) => await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true })));
    const factoryImplementation: DirectSceneConnectionClientFactory = (profile) => ({ getSceneList: vi.fn(async () => ({ connectionId: profile.id, connectionName: profile.name, scenes: ['Scene'] })), watchChanges });
    const factory = vi.fn(factoryImplementation);
    const manager = new DirectSceneConnectionManager(vault, [], factory, undefined, async () => ({ configured: true, running, executableName: 'Meld Studio.exe', ...(running ? { processId: 42 } : { differentInstallationProcessId: 99, state: 'different-installation-running' }) }), 5);
    await manager.start(vi.fn()); await vi.waitFor(() => expect((manager.status() as { connections: Array<{ state: string }> }).connections[0]?.state).toBe('paused'));
    expect((manager.status() as { connections: Array<{ state: string; reconnectCount: number }> }).connections[0]).toMatchObject({ state: 'paused', reconnectCount: 0 });
    expect(factory).not.toHaveBeenCalled();
    running = true; await vi.waitFor(() => expect(factory).toHaveBeenCalledTimes(1));
    expect((manager.status() as { connections: Array<{ applicationExecutableName: string; applicationProcessId: number }> }).connections[0]).toMatchObject({ applicationExecutableName: 'Meld Studio.exe', applicationProcessId: 42 });
    expect((manager.status() as { events: Array<{ type: string }> }).events.some((event) => event.type === 'resumed')).toBe(true);
    running = false; await vi.waitFor(() => expect((manager.status() as { connections: Array<{ state: string }> }).connections[0]?.state).toBe('paused'));
    expect((manager.status() as { connections: Array<{ reconnectCount: number; differentInstallationProcessId: number }> }).connections[0]).toMatchObject({ reconnectCount: 0, differentInstallationProcessId: 99 });
    expect(factory).toHaveBeenCalledTimes(1);
    await manager.stop();
  });

  it('reports one consolidated latency warning at the threshold', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-direct-attention-')); roots.push(root);
    const vault = new BroadcastConnectionVaultService(root, 'win32', protector); await vault.start();
    await vault.save({ name: 'Slow OBS', provider: 'obs', url: 'ws://127.0.0.1:4455', enabled: true });
    let now = 1_000; const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
    const manager = new DirectSceneConnectionManager(vault, [], (profile) => ({ getSceneList: async () => { now += 2_100; return { connectionId: profile.id, connectionName: profile.name, scenes: ['Scene'] }; }, watchChanges: async (_onChange, signal) => await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true })) }));
    await manager.start(vi.fn()); await vi.waitFor(() => expect((manager.status() as { connections: Array<{ state: string }> }).connections[0]?.state).toBe('connected'));
    expect((manager.status() as { attention: { level: string; affectedConnections: number } }).attention).toMatchObject({ level: 'warning', affectedConnections: 1 });
    expect((manager.status() as { trends: { connections: Array<{ maximumLatencyMs: number }> } }).trends.connections[0]).toMatchObject({ maximumLatencyMs: 2100 });
    expect((manager.status() as { reliability: { alerts: Array<{ alerting: boolean }> } }).reliability.alerts[0]).toMatchObject({ alerting: false }); now += 5 * 60_000;
    expect((manager.status() as { reliability: { alerts: Array<{ alerting: boolean }> } }).reliability.alerts[0]).toMatchObject({ alerting: true });
    await manager.stop(); clock.mockRestore();
  });

  it('checks one explicit custom port and persists sanitized acceptance regression receipts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-direct-acceptance-')); roots.push(root);
    const vault = new BroadcastConnectionVaultService(root, 'win32', protector); await vault.start();
    const historyPath = join(root, 'state', 'broadcast-connection-events.json');
    const manager = new DirectSceneConnectionManager(vault, [], vi.fn(), historyPath);
    await manager.start(vi.fn());
    await expect(manager.discover({ provider: 'obs', port: 4456 })).resolves.toMatchObject({ mutationFree: true, scope: 'single-explicit-loopback-port', candidates: [{ provider: 'obs', url: 'ws://127.0.0.1:4456' }] });
    await expect(manager.discover({ provider: 'obs', port: '4456-4459' })).rejects.toThrow('Port ranges are not allowed');
    await expect(manager.recordAcceptance([{ provider: 'obs', outcome: 'passed', processId: 42, executable: 'obs64.exe', sceneCount: 65, latencyMs: 5, message: 'must not persist' }])).resolves.toMatchObject({ receiptCount: 1, comparison: { baseline: true } });
    await expect(manager.recordAcceptance([{ provider: 'obs', outcome: 'failed', message: 'secret-shaped detail' }])).resolves.toMatchObject({ receiptCount: 2, comparison: { regressions: [{ provider: 'obs', kind: 'outcome', before: 'passed', after: 'failed' }] } });
    await manager.stop();
    const persisted = await readFile(join(root, 'state', 'broadcast-acceptance-receipts.json'), 'utf8');
    expect(persisted).toContain('obs64.exe'); expect(persisted).not.toContain('must not persist'); expect(persisted).not.toContain('secret-shaped detail');
  });

  it('approves intentional acceptance baselines and reports reliability freshness and conflicts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-direct-governance-')); roots.push(root);
    const vault = new BroadcastConnectionVaultService(root, 'win32', protector); await vault.start();
    await vault.save({ name: 'OBS', provider: 'obs', url: 'ws://127.0.0.1:4455', credential: 'saved', enabled: true });
    await vault.save({ name: 'Meld same port', provider: 'meld', url: 'ws://127.0.0.1:4455', enabled: true });
    await vault.saveReliabilityPolicy({ strictMode: true, acceptanceMaxAgeDays: 30, credentialMaxAgeDays: 90, approvedByCreator: true });
    const historyPath = join(root, 'state', 'broadcast-connection-events.json');
    const manager = new DirectSceneConnectionManager(vault, [], (profile) => ({ getSceneList: async () => ({ connectionId: profile.id, connectionName: profile.name, scenes: ['Scene'] }), watchChanges: async (_change, signal) => await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true })) }), historyPath, async (profile) => ({ configured: true, running: profile.provider !== 'meld', ...(profile.provider === 'meld' ? { differentInstallationProcessId: 91 } : { processId: 42 }) }));
    await manager.start(vi.fn());
    await manager.recordAcceptance([{ provider: 'obs', outcome: 'passed', sceneCount: 5 }, { provider: 'meld', outcome: 'passed', sceneCount: 2 }]);
    await manager.recordAcceptance([{ provider: 'obs', outcome: 'passed', sceneCount: 4 }, { provider: 'meld', outcome: 'passed', sceneCount: 2 }]);
    expect((manager.status() as { acceptance: { comparison: { regressions: unknown[] } } }).acceptance.comparison.regressions).toHaveLength(1);
    await expect(manager.approveAcceptanceBaseline({ approvedByCreator: true })).resolves.toMatchObject({ approved: true });
    expect((manager.status() as { acceptance: { comparison: { regressions: unknown[] } }; strictGate: { ready: boolean; blockers: Array<{ type: string }> }; reliability: { profiles: Array<{ score: number }> } }).acceptance.comparison.regressions).toHaveLength(0);
    const status = manager.status() as { strictGate: { ready: boolean; blockers: Array<{ type: string }> }; reliability: { profiles: Array<{ score: number }> } };
    expect(status.strictGate.ready).toBe(false); expect(status.strictGate.blockers.some((item) => item.type === 'credential-stale')).toBe(true); expect(status.reliability.profiles.every((item) => item.score >= 0 && item.score <= 100)).toBe(true);
    const assistant = await manager.conflictAssistant() as { ready: boolean; issues: Array<{ type: string; port?: number; processId?: number }> };
    expect(assistant.ready).toBe(false); expect(assistant.issues).toContainEqual(expect.objectContaining({ type: 'duplicate-port', port: 4455 })); expect(assistant.issues).toContainEqual(expect.objectContaining({ type: 'wrong-installation', processId: 91 }));
    await manager.stop(); expect(await readFile(join(root, 'state', 'broadcast-acceptance-baseline.json'), 'utf8')).toContain('receiptCheckedAt');
  });
});
