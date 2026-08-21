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
