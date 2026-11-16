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
    const manager = new DirectSceneConnectionManager(vault, [], factory, undefined, async () => ({ configured: true, running, executableName: 'Meld Studio.exe', ...(running ? { processId: 42 } : { differentInstallationProcessId: 99, state: 'different-installation-running' }) }), 5, 5);
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

  it('records confirmation snapshots in history and notifies listeners only when the scene content changed', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-direct-unchanged-')); roots.push(root);
    const vault = new BroadcastConnectionVaultService(root, 'win32', protector); await vault.start();
    await vault.save({ name: 'Main', provider: 'obs', url: 'ws://127.0.0.1:4455', enabled: true });
    let current = 'Live'; let onChange: (() => void) | undefined;
    const getSceneList = vi.fn(async () => ({ connectionId: 'main', connectionName: 'Main', scenes: ['Live', 'BRB'], currentScene: current }));
    const manager = new DirectSceneConnectionManager(vault, [], () => ({ getSceneList, watchChanges: async (handler, signal) => { onChange = handler; await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true })); } }));
    const listener = vi.fn(); await manager.start(listener);
    await vi.waitFor(() => expect(onChange).toBeDefined()); expect(listener).toHaveBeenCalledTimes(1);
    const eventCount = (): number => (manager.status() as { events: unknown[] }).events.length; const before = eventCount();
    for (let index = 0; index < 3; index += 1) { const calls = getSceneList.mock.calls.length; onChange?.(); await vi.waitFor(() => expect(getSceneList.mock.calls.length).toBe(calls + 1)); }
    await vi.waitFor(() => expect((manager.status() as { connections: Array<{ lastSnapshotAt?: string }> }).connections[0]?.lastSnapshotAt).toBeDefined());
    expect(listener).toHaveBeenCalledTimes(1); expect(eventCount()).toBe(before);
    current = 'BRB'; onChange?.();
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(2)); expect(eventCount()).toBe(before + 1);
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

  it('takes screenshots in OBS or Meld through saved connections and never in Streamlabs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-direct-screenshot-')); roots.push(root);
    const vault = new BroadcastConnectionVaultService(root, 'win32', protector); await vault.start();
    await vault.save({ name: 'Streamlabs', provider: 'streamlabs', url: 'ws://127.0.0.1:59650/api/websocket', enabled: true, credential: 'token', approvedByCreator: true });
    await vault.save({ name: 'Meld', provider: 'meld', url: 'ws://127.0.0.1:13376', enabled: true });
    const saved: Array<{ path: string; source?: string }> = []; const meld: boolean[] = [];
    const factory: DirectSceneConnectionClientFactory = (profile) => ({
      getSceneList: async () => ({ connectionId: profile.id, connectionName: profile.name, scenes: ['Live'] }),
      watchChanges: async () => undefined,
      ...(profile.provider === 'obs' ? { saveScreenshot: async (path: string, source?: string) => { saved.push({ path, ...(source === undefined ? {} : { source }) }); }, listSources: async () => ['Camera', 'Game'] } : {}),
      ...(profile.provider === 'meld' ? { takeScreenshot: async (vertical?: boolean) => { meld.push(vertical === true); } } : {}),
    });
    const manager = new DirectSceneConnectionManager(vault, [], factory);
    await expect(manager.takeScreenshot({ app: 'obs', target: 'scene', filePath: 'C:/shots/a.png' })).rejects.toThrow('Add OBS Studio under Scene connections first');
    await expect(manager.takeScreenshot({ app: 'auto', target: 'vertical', filePath: 'C:/shots/b.png' })).resolves.toEqual({ app: 'meld', connectionName: 'Meld' });
    expect(meld).toEqual([true]);
    await vault.save({ name: 'OBS', provider: 'obs', url: 'ws://127.0.0.1:4455', enabled: true });
    await expect(manager.takeScreenshot({ app: 'auto', target: 'source', sourceName: 'Camera', filePath: 'C:/shots/c.png' })).resolves.toEqual({ app: 'obs', connectionName: 'OBS', savedTo: 'C:/shots/c.png' });
    expect(saved).toEqual([{ path: 'C:/shots/c.png', source: 'Camera' }]);
    // A scene that is not on screen is captured by name, and only OBS can do that.
    await expect(manager.takeScreenshot({ app: 'auto', target: 'named-scene', sourceName: 'BRB', filePath: 'C:/shots/d.png' })).resolves.toMatchObject({ app: 'obs' });
    expect(saved.at(-1)).toEqual({ path: 'C:/shots/d.png', source: 'BRB' });
    await expect(manager.takeScreenshot({ app: 'meld', target: 'named-scene', sourceName: 'BRB', filePath: 'C:/shots/e.png' })).rejects.toThrow('Meld Studio can only capture the scene on screen');
    await expect(manager.takeScreenshot({ app: 'auto', target: 'source', filePath: 'C:/shots/f.png' })).rejects.toThrow('Choose which source to capture');
    const options = await manager.screenshotOptions();
    expect(options.obsScenes).toEqual(['Live']);
    expect(options.obsSources).toEqual(['Camera', 'Game']);
    expect(options.apps.map((app) => [app.provider, app.canScreenshot])).toEqual(expect.arrayContaining([['streamlabs', false], ['meld', true], ['obs', true]]));
  });

  it('remembers the streaming app, follows it when switching, and refuses what an app cannot do', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-direct-app-')); roots.push(root);
    const vault = new BroadcastConnectionVaultService(root, 'win32', protector); await vault.start();
    await vault.save({ name: 'OBS', provider: 'obs', url: 'ws://127.0.0.1:4455', enabled: true });
    await vault.save({ name: 'Streamlabs', provider: 'streamlabs', url: 'ws://127.0.0.1:59650/api/websocket', credential: 'token', enabled: true });
    const calls: string[] = [];
    const factory: DirectSceneConnectionClientFactory = (profile) => ({
      getSceneList: async () => ({ connectionId: profile.id, connectionName: profile.name, scenes: ['Gameplay'] }),
      watchChanges: async (_onChange, signal) => { await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true })); },
      switchScene: async (scene) => { calls.push(`${profile.provider}:scene:${scene}`); },
      setFilter: async (source, filter, enabled) => { calls.push(`${profile.provider}:filter:${source}/${filter}=${String(enabled)}`); },
      stopStreaming: async () => { calls.push(`${profile.provider}:stop`); },
      ...(profile.provider === 'streamlabs' ? { spinSource: async (source: string) => { calls.push(`streamlabs:spin:${source}`); } } : {}),
    });
    const manager = new DirectSceneConnectionManager(vault, [], factory, join(root, 'state', 'events.json'));
    expect((await manager.streamingApp()).choice).toBe('auto');
    expect((await manager.streamingApp()).app).toBe('obs');
    await manager.switchScene('Gameplay');
    await manager.setStreamingApp({ app: 'streamlabs' });
    expect(JSON.parse(await readFile(join(root, 'state', 'streaming-app.json'), 'utf8'))).toMatchObject({ app: 'streamlabs' });
    await manager.switchScene('Gameplay');
    await manager.setFilter('Cam', 'THSV Blackout', true);
    await manager.spinSource('Cam', 3);
    await manager.stopStreaming();
    expect(calls).toEqual(['obs:scene:Gameplay', 'streamlabs:scene:Gameplay', 'streamlabs:filter:Cam/THSV Blackout=true', 'streamlabs:spin:Cam', 'streamlabs:stop']);
    await expect(manager.runSprigCastEffect('blackout', 'Cam', 5)).rejects.toThrow(/can't do that/u);
    await manager.setStreamingApp({ app: 'sprigcast' });
    await expect(manager.switchScene('Gameplay')).rejects.toThrow(/Add SprigCast/u);
    await expect(manager.setStreamingApp({ app: 'twitch' })).rejects.toThrow(/app must be/u);
    expect((await manager.streamingApp()).extensions['thsv.snap']?.apps.streamlabs).toBe('no');
  });
  it('checks each screen effect in the picked app and sets up what it can', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-direct-effects-')); roots.push(root);
    const vault = new BroadcastConnectionVaultService(root, 'win32', protector); await vault.start();
    await vault.save({ name: 'OBS', provider: 'obs', url: 'ws://127.0.0.1:4455', enabled: true });
    await vault.save({ name: 'Meld', provider: 'meld', url: 'ws://127.0.0.1:13376', enabled: true });
    const filters = new Set<string>(['Cam/THSV Pixelate']);
    const factory: DirectSceneConnectionClientFactory = (profile) => ({
      getSceneList: async () => ({ connectionId: profile.id, connectionName: profile.name, scenes: ['Gameplay'] }),
      watchChanges: async (_onChange, signal) => { await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true })); },
      checkEffect: async (kind, source, filter) => {
        if (profile.provider === 'meld' && kind === 'barrel-roll') return { status: 'not-available', detail: 'Meld cannot turn a layer.', canCreate: false };
        return filters.has(`${source}/${filter}`) ? { status: 'ready', detail: 'Found.', canCreate: false } : { status: 'needs-setup', detail: 'Missing.', canCreate: kind === 'blackout' };
      },
      ...(profile.provider === 'obs' ? { createEffect: async (_kind: string, source: string, filter: string) => { filters.add(`${source}/${filter}`); } } : {}),
    });
    const manager = new DirectSceneConnectionManager(vault, [], factory, join(root, 'state', 'events.json'));
    await manager.setStreamingApp({ app: 'obs' });
    const checked = await manager.checkEffects({ effects: [{ name: 'Blackout', source: 'Cam', filter: 'THSV Blackout' }, { name: 'Pixelate', source: 'Cam', filter: 'THSV Pixelate' }, { name: '' }, 'junk'] });
    expect(checked.app).toBe('obs');
    expect(checked.effects.map((effect) => [effect.name, effect.kind, effect.status, effect.canCreate])).toEqual([['Blackout', 'blackout', 'needs-setup', true], ['Pixelate', 'pixelate', 'ready', false]]);
    await expect(manager.createEffect({ name: 'Blackout', source: 'Cam', filter: 'THSV Blackout' })).resolves.toMatchObject({ app: 'obs', kind: 'blackout', status: 'ready' });
    await manager.setStreamingApp({ app: 'meld' });
    const meld = await manager.checkEffects({ effects: [{ name: 'Barrel roll', source: 'Cam', filter: '' }] });
    expect(meld.effects[0]).toMatchObject({ kind: 'barrel-roll', status: 'not-available' });
    await expect(manager.createEffect({ name: 'Blackout', source: 'Cam', filter: 'THSV Blackout' })).rejects.toThrow(/can't create this in Meld Studio/u);
    await expect(manager.checkEffects({ effects: 'nope' })).rejects.toThrow(/effects must be a list/u);
    await manager.setStreamingApp({ app: 'streamlabs' });
    expect((await manager.checkEffects({ effects: [{ name: 'Blackout', source: 'Cam', filter: 'X' }] })).effects[0]).toMatchObject({ status: 'unchecked' });
  });
});
