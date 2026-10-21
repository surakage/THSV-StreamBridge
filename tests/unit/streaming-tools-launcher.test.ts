import { readFile } from 'node:fs/promises';
// The launcher only runs on Windows, so evaluate it with Windows path rules on every CI platform.
import { win32 } from 'node:path';

const basename = (path: string, suffix?: string): string => win32.basename(path, suffix);
const isAbsolute = (path: string): boolean => win32.isAbsolute(path);
const join = (...paths: string[]): string => win32.join(...paths);
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

describe('one-button streaming tools launcher', () => {
  it('warns for missing TikFinity and continues to an installed application', async () => {
    const source = await readFile('launcher/start-streaming-tools.mjs', 'utf8');
    const functions = source.slice(source.indexOf('async function startOptionalApplication('), source.indexOf('async function optionalApplicationCircuit('));
    const results: Array<{ application: string; status: string; detail: string }> = [];
    const context = {
      applicationResults: results, basename, isAbsolute, join,
      process: { env: { LOCALAPPDATA: 'C:/missing' }, stdout: { write: () => undefined } },
      isFile: async (path: string) => path === 'C:/installed/obs64.exe',
      optionalApplicationCircuit: async () => ({ open: false }),
      processesNamed: () => [{ pid: 123, path: 'C:/installed/obs64.exe' }],
      samePath: (left: string, right: string) => left === right,
    };
    await runInNewContext(`${functions}\n(async () => {
      await startOptionalApplication('tikfinity', { optionalApps: { tikfinity: { enabled: true, executable: 'C:/missing/TikFinity.exe' } } });
      await startOptionalApplication('obs', { optionalApps: { obs: { enabled: true, executable: 'C:/installed/obs64.exe' } } });
    })()`, context);
    expect(results[0]).toMatchObject({ application: 'TikFinity', status: 'WARNING' });
    expect(results[0]?.detail).toContain('missing or invalid');
    expect(results[1]).toMatchObject({ application: 'OBS Studio', status: 'SUCCESS' });
  });
  it('treats TikTok LIVE Studio running from inside its launcher folder as already open', async () => {
    const source = await readFile('launcher/start-streaming-tools.mjs', 'utf8');
    const functions = source.slice(source.indexOf('async function startOptionalApplication('), source.indexOf('async function optionalApplicationCircuit('));
    const helper = source.slice(source.indexOf('function isInsideFolder('), source.indexOf('async function isFile('));
    const results: Array<{ application: string; status: string; detail: string }> = [];
    const launcherPath = 'C:\\Program Files\\TikTok LIVE Studio\\TikTok LIVE Studio Launcher.exe';
    let launched = 0;
    const context = {
      applicationResults: results, basename, isAbsolute, join, dirname: (path: string) => win32.dirname(path), relative: (from: string, to: string) => win32.relative(from, to), resolve: (path: string) => win32.resolve(path),
      process: { env: {}, stdout: { write: () => undefined } },
      isFile: async (path: string) => path === launcherPath,
      optionalApplicationCircuit: async () => ({ open: false }),
      processesNamed: () => [{ pid: 456, path: 'C:\\Program Files\\TikTok LIVE Studio\\1.36.6\\TikTok LIVE Studio.exe' }],
      samePath: (left: string, right: string) => left.toLowerCase() === right.toLowerCase(),
      launchDetached: async () => { launched += 1; return 1; },
    };
    await runInNewContext(`${functions}\n${helper}\n(async () => {
      await startOptionalApplication('tiktokstudio', { optionalApps: { tiktokstudio: { enabled: true, executable: ${JSON.stringify(launcherPath)} } } });
    })()`, context);
    expect(results[0]).toMatchObject({ application: 'TikTok LIVE Studio', status: 'SUCCESS' });
    expect(launched).toBe(0);
    expect(source).toContain("startOptionalApplication('tiktokstudio', launcherConfig)");
  });

  it('handles TikTok LIVE Studio running as administrator: hidden location counts as open, and a refused start opens it through Windows', async () => {
    const source = await readFile('launcher/start-streaming-tools.mjs', 'utf8');
    const functions = source.slice(source.indexOf('async function startOptionalApplication('), source.indexOf('async function optionalApplicationCircuit('));
    const helper = source.slice(source.indexOf('function isInsideFolder('), source.indexOf('async function isFile('));
    const launcherPath = 'C:\\Program Files\\TikTok LIVE Studio\\TikTok LIVE Studio Launcher.exe';
    const run = async (running: { pid: number; path: string | null }[][]) => {
      const results: Array<{ application: string; status: string; detail: string }> = [];
      let probes = 0; let launched = 0; let shellOpened = 0;
      const context = {
        applicationResults: results, basename, isAbsolute, join, dirname: (path: string) => win32.dirname(path), relative: (from: string, to: string) => win32.relative(from, to), resolve: (path: string) => win32.resolve(path),
        process: { env: {}, stdout: { write: () => undefined } }, setTimeout: (callback: () => void) => { callback(); return 0; }, OPTIONAL_STARTUP_GRACE_MS: 1,
        isFile: async (path: string) => path === launcherPath,
        optionalApplicationCircuit: async () => ({ open: false }),
        recordOptionalApplicationFailure: async () => undefined, clearOptionalApplicationFailures: async () => undefined,
        processesNamed: () => running[Math.min(probes++, running.length - 1)] ?? [],
        samePath: (left: string, right: string) => left.toLowerCase() === right.toLowerCase(),
        isAlive: () => false,
        launchDetached: async () => { launched += 1; throw Object.assign(new Error(`spawn ${launcherPath} EACCES`), { code: 'EACCES' }); },
        openWithShell: async () => { shellOpened += 1; return true; },
      };
      await runInNewContext(`${functions}\n${helper}\n(async () => {
        await startOptionalApplication('tiktokstudio', { optionalApps: { tiktokstudio: { enabled: true, executable: ${JSON.stringify(launcherPath)} } } });
      })()`, context);
      return { results, launched, shellOpened };
    };
    // Already open as administrator: Get-Process reports no path, and nothing is started again.
    const open = await run([[{ pid: 32520, path: null }]]);
    expect(open.results[0]).toMatchObject({ application: 'TikTok LIVE Studio', status: 'SUCCESS' });
    expect(open.launched).toBe(0);
    // Not open: the direct start is refused (EACCES), so Windows opens it, and it then runs.
    const started = await run([[], [{ pid: 32520, path: null }]]);
    expect(started.launched).toBe(1);
    expect(started.shellOpened).toBe(1);
    expect(started.results[0]).toMatchObject({ application: 'TikTok LIVE Studio', status: 'SUCCESS' });
  });

  it('starts Streamer.bot, then Speaker.bot, makes the bridge ready, and opens enabled broadcast apps last', async () => {
    const source = await readFile('launcher/start-streaming-tools.mjs', 'utf8');
    expect(source).toContain("join(launcherRoot, 'tray.ps1')");
    expect(source).toContain('THSV StreamBridge Tray is available.');
    const streamerBotStart = source.indexOf('await startStreamerBotWithBridgeRecovery()');
    const speakerBotStart = source.indexOf("startOptionalApplication('speakerbot'");
    const bridgeCheck = source.indexOf('if (await bridgeReady(baseUrl))');
    const broadcastAppsStart = source.indexOf("for (const application of ['obs', 'meld', 'streamlabs'])");
    expect(streamerBotStart).toBeGreaterThan(-1);
    expect(source).toContain('startStreamerBotWithBridgeRecovery');
    expect(source).toContain("runLauncher(join(launcherRoot, 'stop.mjs')");
    expect(source).toContain('left a stale listener behind');
    expect(source).toContain('STREAMERBOT_STALE_LISTENER_RECOVERY_MS');
    expect(streamerBotStart).toBeLessThan(speakerBotStart);
    expect(speakerBotStart).toBeLessThan(bridgeCheck);
    expect(bridgeCheck).toBeLessThan(broadcastAppsStart);
    expect(source).toContain('already ready. No restart was needed');
    expect(source).toContain("join(launcherRoot, 'start.mjs')");
    expect(source).toContain("`${url}/ready`");
    expect(source).toContain('readLauncherConfiguration()');
    expect(source).toContain("['obs', 'meld', 'streamlabs']");
    expect(source).toContain('startOptionalApplication(application, launcherConfig)');
    expect(source).toContain("saved?.enabled !== true");
    expect(source).toContain('samePath(candidate.path, executable)');
    // Any running copy of an app counts as open, so a second copy is never started.
    expect(source).toContain("not starting a second copy");
    expect(source).not.toContain("Starting the exact saved executable");
    expect(source).not.toContain('processIsRunning(definition.processNames)');
    expect(source).toContain('Optional app warning:');
    expect(source).toContain("child.once('error', rejectLaunch)");
    expect(source).toContain('OPTIONAL_STARTUP_GRACE_MS = 1_500');
    expect(source).toContain('to initialize before continuing');
    expect(source).toContain('exited during startup; continuing with Streamer.bot and StreamBridge');
    expect(source).toContain('await new Promise((resolveDelay) => setTimeout(resolveDelay, OPTIONAL_STARTUP_GRACE_MS))');
    expect(source).toContain("launcher: 'streaming-tools'");
    expect(source).toContain("'streaming-tools.launch.lock'");
    expect(source).toContain('Another all-tools startup is already running');
    expect(source).toContain('LAUNCH_LOCK_STALE_MS = 140_000');
    expect(source).toContain('createdAt: Date.now()');
    expect(source).toContain('Recovering an expired all-tools startup lock');
    expect(source).toContain('current === ownedLock');
    expect(source).toContain('LAUNCH_LOCK_HEARTBEAT_MS = 5_000');
    expect(source).toContain('refreshOwnedLaunchLock');
    expect(source).toContain('launchLockOwnerMatches');
    expect(source).toContain('Get-CimInstance Win32_Process');
    expect(source).toContain('MAXIMUM_CONFIGURATION_BYTES');
    expect(source).toContain('validateCoreLauncherConfiguration');
    expect(source).toContain('automatic fallback is disabled');
    expect(source).toContain("executableNames: ['obs64.exe']");
    expect(source).toContain('core tools will continue safely');
    expect(source).toContain('OPTIONAL_CIRCUIT_FAILURES = 3');
    expect(source).toContain('optional-app-startup-circuit.json');
    expect(source).toContain('automatic startup is temporarily paused');
    expect(source).toContain("'starting-streamerbot'");
    expect(source).toContain("'starting-broadcast-apps'");
    expect(source).toContain('bridgeReadinessBlockers');
    expect(source).toContain('THSV_STARTUP_RUN_ID');
    expect(source).toContain('startupRunId');
    expect(source).toContain('110_000');
    expect(source).toContain("'last-startup-report.json'");
    expect(source).toContain("'streamerbot-crash'");
    expect(source).toContain("'port-conflict'");
    expect(source).toContain('did not release');
    expect(source).toContain("'bridge-configuration'");
    expect(source).toContain("'bridge-health-timeout'");
    expect(source).not.toContain('taskkill');
    expect(source).not.toContain('Stop-Process');
  });

  it('ships a visible command wrapper suitable for Stream Deck System Open', async () => {
    const source = await readFile('launcher/Start THSV Streaming Tools.cmd', 'utf8');
    expect(source).toContain('launcher\\start-streaming-tools.mjs');
    expect(source).toContain('enabled broadcast apps, and TikFinity');
    expect(source).toContain('per-app summary above');
    expect(source).toContain('Missing apps produce warnings');
    expect(source).toContain('Bundled Node runtime is missing');
    expect(source).toContain('pause >nul');
    expect(source).not.toContain('Closing automatically');
    expect(source).not.toContain('timeout /t');
    expect(source).toContain('exit /b %THSV_TOOLS_EXIT%');
  });

  it('is also exposed through the authenticated wizard launcher service', async () => {
    const source = await readFile('bridge/services/streamerbot-launcher-service.ts', 'utf8');
    const wizard = await readFile('wizard/browser/app.js', 'utf8');
    expect(source).toContain('startAllStreamingTools');
    expect(source).toContain("join(this.installRoot, 'launcher', 'start-streaming-tools.mjs')");
    expect(wizard).toContain('/wizard/api/streamerbot-launcher/start-all');
    expect(source).toContain('Start THSV Streaming Tools.lnk');
    expect(source).toContain('THSV_SHORTCUT_TARGET: target');
    expect(source).toContain('process.env.ComSpec');
    expect(source).toContain("'System32', 'cmd.exe'");
    expect(source).toContain('THSV_SHORTCUT_ICON: `${commandIcon},0`');
    expect(source).not.toContain('THSV_SHORTCUT_ICON: `${configuration.executable},0`');
    expect(source).not.toContain('THSV_SHORTCUT_ARGS');
  });
});
