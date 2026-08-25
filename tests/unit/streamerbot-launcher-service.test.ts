import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseOptionalStartupWarnings, StreamerBotLauncherService } from '../../bridge/services/streamerbot-launcher-service.js';

const temporaryRoots: string[] = [];
const windowsLauncher = (dataRoot: string): StreamerBotLauncherService => new StreamerBotLauncherService(dataRoot, 'ws://127.0.0.1:65534/', 'win32');

afterEach(async () => {
  for (const root of temporaryRoots.splice(0)) await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

describe('public Streamer.bot launcher configuration', () => {
  it('keeps a bounded redacted tray notification history for the Wizard', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-tray-history-')); temporaryRoots.push(root); const service = windowsLauncher(join(root, 'data'));
    await expect(service.recordTrayNotification({ title: 'No approval', summary: 'ignored' })).rejects.toThrow('Explicit creator approval');
    const history = await service.recordTrayNotification({ category: 'startup', title: 'Startup needs attention', summary: 'See C:\\Users\\creator\\secret.log token=do-not-store', kind: 'warning', approvedByCreator: true }) as { entries: Array<{ summary: string; category: string }> };
    expect(history.entries[0]).toMatchObject({ category: 'startup' }); expect(history.entries[0]?.summary).not.toContain('do-not-store'); expect(history.entries[0]?.summary).not.toContain('C:\\Users');
    await expect(service.trayNotificationHistory()).resolves.toMatchObject({ entries: [{ category: 'startup' }] });
  });
  it('uses the explicit restart switch only for creator-approved Bridge restarts', async () => {
    const source = await readFile('bridge/services/streamerbot-launcher-service.ts', 'utf8');
    expect(source).toContain("[launcher, '--restart', '--open-wizard']");
  });
  it('extracts only explicit optional-app warning lines from successful launcher output', () => {
    expect(parseOptionalStartupWarnings('Streamer.bot is ready.\nOptional app warning: Speaker.bot exited during startup.\nEnabled core tools are ready.')).toEqual(['Speaker.bot exited during startup.']);
    expect(parseOptionalStartupWarnings('Streamer.bot and THSV StreamBridge are ready.')).toEqual([]);
  });
  it('stores the selected portable executable outside versioned application files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-streamerbot-launcher-')); temporaryRoots.push(root);
    const dataRoot = join(root, 'data'); const executable = join(root, 'portable', 'Streamer.bot.exe');
    await mkdir(join(root, 'portable'), { recursive: true }); await writeFile(executable, 'test executable');
    const service = windowsLauncher(dataRoot);
    const status = await service.save(executable);
    expect(status).toMatchObject({ configured: true, executable, executableExists: true, websocketPort: 65534, state: 'stopped', installRoot: root, streamDeckTarget: join(root, 'Start THSV Streaming Tools.cmd') });
    expect(JSON.parse(await readFile(join(dataRoot, 'configuration', 'streamerbot-launcher.json'), 'utf8'))).toMatchObject({ version: 2, executable, websocketPort: 65534, optionalApps: {} });
  });

  it('keeps native launcher controls unsupported outside Windows', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-streamerbot-non-windows-')); temporaryRoots.push(root);
    const dataRoot = join(root, 'data'); const executable = join(root, 'portable', 'Streamer.bot.exe');
    await mkdir(join(root, 'portable'), { recursive: true }); await writeFile(executable, 'test executable');
    const service = new StreamerBotLauncherService(dataRoot, 'ws://127.0.0.1:65534/', 'linux');
    await expect(service.save(executable)).resolves.toMatchObject({ supported: false, configured: false, executableExists: false, state: 'unsupported' });
    await expect(service.choose()).rejects.toThrow('available on Windows only');
    expect(() => service.openInstallFolder()).toThrow('available on Windows only');
  });

  it('surfaces a validated latest startup report in launcher status', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-startup-report-')); temporaryRoots.push(root);
    const dataRoot = join(root, 'data');
    await mkdir(join(dataRoot, 'logs'), { recursive: true });
    await writeFile(join(dataRoot, 'logs', 'last-startup-report.json'), JSON.stringify({
      timestamp: '2026-08-20T12:34:56.000Z', startedAt: '2026-08-20T12:34:50.000Z', startupRunId: '019fcfc8-0d74-7ed1-b71e-c8eb4df9f62d', launcher: 'streambridge', requestedAction: 'start', outcome: 'failed',
      category: 'bridge-health-timeout', phase: 'waiting-for-health', attempt: 2, durationMs: 6_000, message: 'The Bridge did not become healthy.',
      readinessBlockers: [{ kind: 'output', name: 'streamerbot', state: 'reconnecting', message: 'Not connected.', recovery: 'Start Streamer.bot.' }], pid: 42, port: 8787, version: '4.0.1', ignored: 'not exposed',
    }));
    const status = await new StreamerBotLauncherService(dataRoot, 'ws://127.0.0.1:65534/', 'linux').status();
    expect(status.lastStartupReport).toEqual({
      timestamp: '2026-08-20T12:34:56.000Z', startedAt: '2026-08-20T12:34:50.000Z', startupRunId: '019fcfc8-0d74-7ed1-b71e-c8eb4df9f62d', launcher: 'streambridge', requestedAction: 'start', outcome: 'failed',
      category: 'bridge-health-timeout', phase: 'waiting-for-health', attempt: 2, durationMs: 6_000, message: 'The Bridge did not become healthy.',
      readinessBlockers: [{ kind: 'output', name: 'streamerbot', state: 'reconnecting', message: 'Not connected.', recovery: 'Start Streamer.bot.' }], pid: 42, port: 8787, version: '4.0.1',
    });
  });

  it('migrates version 1 settings and keeps optional applications explicitly opt-in', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-streaming-apps-')); temporaryRoots.push(root);
    const dataRoot = join(root, 'data'); const configurationRoot = join(dataRoot, 'configuration');
    const streamerBot = join(root, 'portable', 'Streamer.bot.exe'); const obs = join(root, 'obs64.exe'); const speaker = join(root, 'Speaker.bot.exe');
    await mkdir(join(root, 'portable'), { recursive: true }); await mkdir(configurationRoot, { recursive: true });
    await Promise.all([writeFile(streamerBot, 'streamerbot'), writeFile(obs, 'obs'), writeFile(speaker, 'speaker')]);
    await writeFile(join(configurationRoot, 'streamerbot-launcher.json'), JSON.stringify({ version: 1, executable: streamerBot, websocketPort: 65534 }));
    const service = windowsLauncher(dataRoot);
    let status = await service.saveOptionalApplication('obs', obs, true);
    expect(status.optionalApps.obs).toMatchObject({ configured: true, enabled: true, executable: obs, executableExists: true });
    expect(status.optionalApps.speakerbot).toMatchObject({ configured: false, enabled: false });
    status = await service.saveOptionalApplication('speakerbot', speaker, false);
    expect(status.optionalApps.speakerbot).toMatchObject({ configured: true, enabled: false, executable: speaker, executableExists: true });
    const saved = JSON.parse(await readFile(join(configurationRoot, 'streamerbot-launcher.json'), 'utf8')) as unknown;
    expect(saved).toMatchObject({ version: 2, executable: streamerBot, optionalApps: { obs: { executable: obs, enabled: true }, speakerbot: { executable: speaker, enabled: false } } });
  });

  it('stores Meld and Streamlabs as independent optional broadcast applications', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-provider-apps-')); temporaryRoots.push(root);
    const dataRoot = join(root, 'data'); const portable = join(root, 'portable');
    const streamerBot = join(portable, 'Streamer.bot.exe'); const meld = join(root, 'Meld Studio.exe'); const streamlabs = join(root, 'Streamlabs Desktop.exe');
    await mkdir(portable, { recursive: true });
    await Promise.all([writeFile(streamerBot, 'streamerbot'), writeFile(meld, 'meld'), writeFile(streamlabs, 'streamlabs')]);
    const service = windowsLauncher(dataRoot);
    await service.save(streamerBot);
    let status = await service.saveOptionalApplication('meld', meld, true);
    expect(status.optionalApps.meld).toMatchObject({ configured: true, enabled: true, executable: meld, executableExists: true });
    status = await service.saveOptionalApplication('streamlabs', streamlabs, true);
    expect(status.optionalApps.streamlabs).toMatchObject({ configured: true, enabled: true, executable: streamlabs, executableExists: true });
    expect(status.optionalApps.obs).toMatchObject({ configured: false, enabled: false });
  });

  it('rejects missing files and misleading executable names', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-streamerbot-launcher-invalid-')); temporaryRoots.push(root);
    const service = windowsLauncher(join(root, 'data'));
    await expect(service.save(join(root, 'not-streamerbot.exe'))).rejects.toThrow('real Streamer.bot.exe');
    await expect(service.save(join(root, 'Streamer.bot.exe'))).rejects.toThrow('real Streamer.bot.exe');
    const executable = join(root, 'portable', 'Streamer.bot.exe'); await mkdir(join(root, 'portable'), { recursive: true }); await writeFile(executable, 'test'); await service.save(executable);
    await expect(service.saveOptionalApplication('obs', join(root, 'fake-obs.exe'), true)).rejects.toThrow('real OBS Studio executable');
    await expect(service.setOptionalApplicationEnabled('speakerbot', true)).rejects.toThrow('Choose Speaker.bot');
  });

  it('refuses to create a shortcut when an enabled exact executable has moved', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-shortcut-path-review-')); temporaryRoots.push(root);
    const streamerBot = join(root, 'portable', 'Streamer.bot.exe'); const obs = join(root, 'obs64.exe');
    await mkdir(join(root, 'portable'), { recursive: true });
    await Promise.all([writeFile(streamerBot, 'streamerbot'), writeFile(obs, 'obs')]);
    const service = windowsLauncher(join(root, 'data'));
    await service.save(streamerBot);
    await service.saveOptionalApplication('obs', obs, true);
    await rm(obs);
    await expect(service.createDesktopShortcut()).rejects.toThrow('OBS Studio is enabled, but its saved executable is missing');
  });

  it('refuses to create a shortcut when the exact Streamer.bot executable has moved', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-shortcut-streamerbot-review-')); temporaryRoots.push(root);
    const streamerBot = join(root, 'portable', 'Streamer.bot.exe');
    await mkdir(join(root, 'portable'), { recursive: true });
    await writeFile(streamerBot, 'streamerbot');
    const service = windowsLauncher(join(root, 'data'));
    await service.save(streamerBot);
    await rm(streamerBot);
    await expect(service.createDesktopShortcut()).rejects.toThrow('saved Streamer.bot executable is missing or invalid');
  });

  it('requires the installed one-button launcher before starting the complete tool set', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-start-all-missing-')); temporaryRoots.push(root);
    const executable = join(root, 'portable', 'Streamer.bot.exe'); await mkdir(join(root, 'portable'), { recursive: true }); await writeFile(executable, 'test');
    const service = windowsLauncher(join(root, 'data')); await service.save(executable);
    await expect(service.startAllStreamingTools()).rejects.toThrow('one-button streaming tools launcher is missing');
  });

  it('reports a mutation-free path and launcher preflight without starting applications', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-launcher-preflight-')); temporaryRoots.push(root);
    const executable = join(root, 'portable', 'Streamer.bot.exe'); await mkdir(join(root, 'portable'), { recursive: true }); await writeFile(executable, 'test');
    const service = windowsLauncher(join(root, 'data')); await service.save(executable);
    const result = await service.preflight();
    expect(result).toMatchObject({ mutationFree: true, ready: false, launcher: { configured: true, executableExists: true } });
    const checks = result['checks'] as Readonly<Record<string, unknown>>[];
    expect(checks.find((check) => check['id'] === 'streamerbot-path')).toMatchObject({ label: 'Exact Streamer.bot path', ready: true });
    expect(checks.find((check) => check['id'] === 'launcher-start-streaming-tools.mjs')).toMatchObject({ label: 'all-tools launcher', ready: false });
  });

  it('offers a moved portable install from only the adjacent saved folder and does not save it automatically', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-nearby-path-repair-')); temporaryRoots.push(root);
    const previous = join(root, 'installs', 'v1', 'Streamer.bot.exe'); const replacement = join(root, 'installs', 'v2', 'Streamer.bot.exe');
    await mkdir(join(root, 'installs', 'v1'), { recursive: true }); await writeFile(previous, 'old');
    const service = windowsLauncher(join(root, 'data')); await service.save(previous); await rm(previous);
    await mkdir(join(root, 'installs', 'v2'), { recursive: true }); await writeFile(replacement, 'new');
    const detected = await service.detect();
    expect(detected.candidates.some((candidate) => candidate.source === 'near-saved-location' && candidate.executable.toLocaleLowerCase('en-US') === replacement.toLocaleLowerCase('en-US'))).toBe(true);
    expect(detected.status).toMatchObject({ state: 'missing', executable: previous });
  });

  it('surfaces optional application circuit pauses separately from process state', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-optional-circuit-')); temporaryRoots.push(root);
    const dataRoot = join(root, 'data'); const executable = join(root, 'portable', 'Streamer.bot.exe'); const obs = join(root, 'obs64.exe');
    await mkdir(join(root, 'portable'), { recursive: true }); await mkdir(join(dataRoot, 'runtime'), { recursive: true }); await Promise.all([writeFile(executable, 'test'), writeFile(obs, 'test')]);
    const service = windowsLauncher(dataRoot); await service.save(executable); await service.saveOptionalApplication('obs', obs, true);
    const now = new Date().toISOString(); await writeFile(join(dataRoot, 'runtime', 'optional-app-startup-circuit.json'), JSON.stringify({ version: 1, applications: { obs: { failures: [{ at: now }, { at: now }, { at: now }], openUntil: new Date(Date.now() + 60_000).toISOString() } } }));
    const status = await service.status();
    expect(status.optionalApps.obs.recentStartupFailures).toBe(3);
    expect(status.optionalApps.obs.circuitOpenUntil).toEqual(expect.any(String));
    expect(status.optionalApps.obs.message).toContain('automatic startup is paused');
    const reset = await service.resetOptionalApplicationCircuit('obs');
    expect(reset.optionalApps.obs.circuitOpenUntil).toBeUndefined();
    expect(JSON.parse(await readFile(join(dataRoot, 'runtime', 'optional-app-startup-circuit.json'), 'utf8'))).toMatchObject({ version: 1, applications: {} });
  });

  it('starts the installed guarded launcher for a safe Bridge restart', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-restart-launcher-')); temporaryRoots.push(root);
    const service = windowsLauncher(join(root, 'data'));
    await expect(service.restartStreamBridge()).rejects.toThrow('restart launcher is missing');
    await mkdir(join(root, 'launcher'), { recursive: true });
    await writeFile(join(root, 'launcher', 'start.mjs'), 'process.exit(0);\n');
    const result = await service.restartStreamBridge();
    expect(result.accepted).toBe(true);
    expect(Number.isInteger(result.helperProcessId)).toBe(true);
    expect(result.message).toContain('fresh unlocked Wizard');
    const deadline = Date.now() + 2_000;
    while (Date.now() < deadline) {
      try { process.kill(result.helperProcessId, 0); await new Promise((resolveDelay) => setTimeout(resolveDelay, 25)); }
      catch { break; }
    }
  });
});
