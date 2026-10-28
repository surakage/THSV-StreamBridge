import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const executable = process.platform === 'win32' ? 'powershell.exe' : 'pwsh';
const policy = process.platform === 'win32' ? ['-ExecutionPolicy', 'Bypass'] : [];
function evaluate(lastSignature: string, lastNotifiedAt: string, now: string, acceptance = { due: 1, dueSoon: 0, stale: 0 }, snoozedUntil = '0001-01-01T00:00:00Z') {
  const result = spawnSync(executable, ['-NoProfile', '-NonInteractive', ...policy, '-File', 'launcher/tray-status.ps1', '-Evaluate', '-AcceptanceJson', JSON.stringify(acceptance), '-LastSignature', lastSignature, '-LastNotifiedAt', lastNotifiedAt, '-Now', now, '-SnoozedUntil', snoozedUntil], { encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout.trim()) as { attention: number; signature: string; visible: boolean; shouldNotify: boolean };
}

describe('tray acceptance reminder evaluation', () => {
  it('notifies on first attention and suppresses an unchanged reminder during cooldown', () => {
    const first = evaluate('', '0001-01-01T00:00:00Z', '2026-08-21T12:00:00Z');
    expect(first).toMatchObject({ attention: 1, visible: true, shouldNotify: true });
    expect(evaluate(first.signature, '2026-08-21T12:00:00Z', '2026-08-21T18:00:00Z')).toMatchObject({ shouldNotify: false });
  });

  it('renotifies after twelve hours or immediately when the attention signature changes', () => {
    expect(evaluate('due=1;soon=0;stale=0', '2026-08-21T00:00:00Z', '2026-08-21T12:00:00Z')).toMatchObject({ shouldNotify: true });
    expect(evaluate('due=1;soon=0;stale=0', '2026-08-21T11:00:00Z', '2026-08-21T12:00:00Z', { due: 1, dueSoon: 1, stale: 0 })).toMatchObject({ attention: 2, shouldNotify: true });
  });

  it('hides the reminder when no checks need attention', () => {
    expect(evaluate('', '0001-01-01T00:00:00Z', '2026-08-21T12:00:00Z', { due: 0, dueSoon: 0, stale: 0 })).toMatchObject({ attention: 0, visible: false, shouldNotify: false });
  });

  it('keeps attention visible while a creator snooze suppresses notifications', () => {
    expect(evaluate('', '0001-01-01T00:00:00Z', '2026-08-21T12:00:00Z', { due: 1, dueSoon: 0, stale: 0 }, '2026-08-22T12:00:00Z')).toMatchObject({ attention: 1, visible: true, snoozed: true, shouldNotify: false });
  });
});

function watchdog(flags: readonly string[], now: string, failingSince = '0001-01-01T00:00:00Z', lastRestartAt = '0001-01-01T00:00:00Z') {
  const result = spawnSync(executable, ['-NoProfile', '-NonInteractive', ...policy, '-File', 'launcher/tray-status.ps1', '-EvaluateWatchdog', ...flags, '-FailingSince', failingSince, '-LastRestartAt', lastRestartAt, '-Now', now], { encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout.trim()) as { failingSince: string; shouldRestart: boolean; reason: string };
}

describe('tray bridge watchdog', () => {
  it('restarts a running Bridge that has not answered for a minute while offline', () => {
    const first = watchdog(['-ProcessAlive'], '2026-10-28T16:02:00Z');
    expect(first).toMatchObject({ shouldRestart: false, reason: 'waiting' });
    expect(Date.parse(first.failingSince)).toBe(Date.parse('2026-10-28T16:02:00Z'));
    expect(watchdog(['-ProcessAlive'], '2026-10-28T16:02:30Z', '2026-10-28T16:02:00Z')).toMatchObject({ shouldRestart: false, reason: 'waiting' });
    expect(watchdog(['-ProcessAlive'], '2026-10-28T16:03:00Z', '2026-10-28T16:02:00Z')).toMatchObject({ shouldRestart: true, reason: 'restart' });
  });

  it('never restarts while live, while starting, or after the creator stopped the Bridge', () => {
    expect(watchdog(['-ProcessAlive', '-LastKnownLive'], '2026-10-28T16:10:00Z', '2026-10-28T16:02:00Z')).toMatchObject({ shouldRestart: false, reason: 'live' });
    expect(watchdog(['-ProcessAlive', '-StartupInProgress'], '2026-10-28T16:10:00Z', '2026-10-28T16:02:00Z')).toMatchObject({ shouldRestart: false, reason: 'starting' });
    expect(watchdog([], '2026-10-28T16:10:00Z', '2026-10-28T16:02:00Z')).toMatchObject({ shouldRestart: false, reason: 'not-running' });
  });

  it('waits out the cooldown after a restart and clears once healthy', () => {
    expect(watchdog(['-ProcessAlive'], '2026-10-28T16:10:00Z', '2026-10-28T16:02:00Z', '2026-10-28T16:00:00Z')).toMatchObject({ shouldRestart: false, reason: 'cooldown' });
    expect(watchdog(['-ProcessAlive'], '2026-10-28T16:16:00Z', '2026-10-28T16:02:00Z', '2026-10-28T16:00:00Z')).toMatchObject({ shouldRestart: true });
    expect(watchdog(['-Healthy', '-ProcessAlive'], '2026-10-28T16:16:00Z', '2026-10-28T16:02:00Z')).toMatchObject({ shouldRestart: false, reason: 'healthy' });
  });
});
