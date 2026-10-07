import { readFile } from 'node:fs/promises';
import { basename, isAbsolute, join } from 'node:path';
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
    expect(source).toContain('A different ${definition.label} installation is running');
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
