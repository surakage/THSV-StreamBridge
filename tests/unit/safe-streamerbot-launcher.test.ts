import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { parseNetstatListeners, samePath } from '../../tools/start-streamerbot-safely.mjs';

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
    expect(source.indexOf('let repaired = false')).toBeLessThan(source.indexOf('if (listener !== undefined)'));
    expect(source.match(/let repaired = false/g)).toHaveLength(1);
    expect(source).toContain('CloseMainWindow');
    expect(source).toContain('streamerbot-launcher.json');
    expect(source).toContain("value?.version === 1 || value?.version === 2");
    expect(source).toContain('optionalApps');
    expect(source).toContain('version: 2');
    expect(source).toContain("bridge.streamerbot?.url");
    expect(source).toContain('It was not stopped');
    expect(source).not.toContain('Stop-Process');
    expect(source).not.toContain('taskkill');
  });
});
