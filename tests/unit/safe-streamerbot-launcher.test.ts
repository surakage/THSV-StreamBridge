import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { parseNetstatListeners, recoverStaleListener, samePath } from '../../tools/start-streamerbot-safely.mjs';

describe('safe Streamer.bot launcher', () => {
  it('identifies only the exact listening port and owner PID', () => {
    const output = [
      '  TCP    127.0.0.1:8081     0.0.0.0:0       LISTENING       353184',
      '  TCP    127.0.0.1:18081    0.0.0.0:0       LISTENING       42',
      '  TCP    127.0.0.1:8081     127.0.0.1:54000  ESTABLISHED     99',
    ].join('\r\n');
    expect(parseNetstatListeners(output)).toEqual([{ address: '127.0.0.1:8081', pid: 353184 }]);
  });

  it('compares Windows paths without casing differences', () => {
    expect(samePath('F:\\Apps\\Streamer.bot.exe', 'f:\\apps\\STREAMER.BOT.EXE')).toBe(true);
  });

  it('waits naturally before stopping only a verified installed Bridge and then verifies release', async () => {
    const calls: string[] = [];
    const output = { write: (message: string) => { calls.push(`output:${message.trim()}`); return true; } };
    const recovered = await recoverStaleListener({
      port: 8081, listenerPid: 42, installRoot: 'F:\\Bridge', output,
      waitForNaturalRelease: async (_port: number, timeout: number) => { calls.push(`natural:${String(timeout)}`); throw new Error('still held'); },
      listenerForPort: () => ({ address: '127.0.0.1:8081', pid: 43 }),
      stopBridge: (_root: string | undefined, _port: number, pid: number) => { calls.push(`stop:${String(pid)}`); return true; },
      waitForFinalRelease: async (_port: number, timeout: number) => { calls.push(`final:${String(timeout)}`); },
    });
    expect(recovered).toBe(true);
    expect(calls).toEqual([
      'output:Waiting briefly for stale port 8081 ownership from PID 42 to clear...',
      'natural:2000', 'stop:43', 'final:30000',
    ]);
  });

  it('does not stop the Bridge when Windows releases the listener naturally', async () => {
    let stopped = false;
    const recovered = await recoverStaleListener({
      port: 8081, listenerPid: 42, installRoot: 'F:\\Bridge', output: { write: () => true },
      waitForNaturalRelease: async () => undefined,
      listenerForPort: () => undefined,
      stopBridge: () => { stopped = true; return true; },
      waitForFinalRelease: async () => undefined,
    });
    expect(recovered).toBe(false);
    expect(stopped).toBe(false);
  });

  it('serializes launches, waits for release, and never force-terminates unknown owners', async () => {
    const source = await readFile('tools/start-streamerbot-safely.mjs', 'utf8');
    expect(source).toContain('thsv-streamerbot-start-${String(port)}.lock');
    expect(source).toContain('waiting for its result');
    expect(source).toContain('await acquireLock(port, output)');
    expect(source).toContain('did not finish within 100 seconds');
    expect(source).toContain('streamerbot-${String(port)}-startup-circuit.json');
    expect(source).toContain('THSV_STARTUP_RUN_ID');
    expect(source).toContain('startupRunId');
    expect(source).toContain('crash-loop protection is active');
    expect(source).toContain("outcome: 'in-progress'");
    expect(source).toContain("'waiting-for-websocket'");
    expect(source).toContain('waitForPortRelease');
    expect(source).toContain('START_ATTEMPTS = 2');
    expect(source).toContain('retrying once');
    expect(source).toContain('StreamerBotStartupExitError');
    expect(source).toContain('EXISTING_HEALTH_STABILITY_MS = 4_000');
    expect(source).toContain('listenerRemainsHealthy');
    expect(source).toContain('was already closing');
    expect(source).toContain('STALE_LISTENER_NATURAL_RELEASE_MS = 2_000');
    expect(source).toContain('stopInstalledBridgeForStaleListener');
    expect(source).toContain('installedBridgeServiceIsRunning');
    expect(source).toContain("join(installRoot, 'data', 'runtime', 'service.pid')");
    expect(source).toContain("join(installRoot, 'launcher', 'stop.mjs')");
    expect(source).toContain("join(installRoot, 'launcher', 'start.mjs')");
    expect(source).toContain('Stopping StreamBridge gracefully once to release the inherited socket');
    expect(source).toContain('Restarting StreamBridge after stale-listener recovery');
    expect(source).toContain('StreamBridge could not be restored after stale-listener recovery');
    expect(source).toContain("[startScript, '--wait']");
    expect(source).toContain('bridgeRestartRequired = false');
    expect(source.indexOf('let repaired = false')).toBeLessThan(source.indexOf('if (listener !== undefined)'));
    expect(source.match(/let repaired = false/g)).toHaveLength(1);
    expect(source).toContain('CloseMainWindow');
    expect(source).toContain('streamerbot-launcher.json');
    expect(source).toContain('value?.version !== 1 && value?.version !== 2');
    expect(source).toContain('Automatic fallback is disabled');
    expect(source).toContain('MAXIMUM_LAUNCHER_CONFIGURATION_BYTES');
    expect(source).toContain('STREAMERBOT_LOCK_STALE_MS = 130_000');
    expect(source).toContain('createdAt: new Date().toISOString()');
    expect(source).toContain('Recovered an expired Streamer.bot startup lock');
    expect(source).toContain("readFileSync(lockPath, 'utf8') === lockRecord");
    expect(source).toContain('STREAMERBOT_LOCK_HEARTBEAT_MS = 5_000');
    expect(source).toContain('refreshOwnedLock');
    expect(source).toContain('streamerBotLockOwnerMatches');
    expect(source).toContain('Get-CimInstance Win32_Process');
    expect(source).toContain('optionalApps');
    expect(source).toContain('version: 2');
    expect(source).toContain("bridge.streamerbot?.url");
    expect(source).toContain('It was not stopped');
    expect(source).not.toContain('Stop-Process');
    expect(source).not.toContain('taskkill');
  });
});
