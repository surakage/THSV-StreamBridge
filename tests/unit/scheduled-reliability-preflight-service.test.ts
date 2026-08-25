import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScheduledReliabilityPreflightService } from '../../bridge/services/scheduled-reliability-preflight-service.js';

const roots: string[] = [];
afterEach(async () => { vi.useRealTimers(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 }); });

describe('scheduled reliability preflight', () => {
  it('stays disabled by default and runs one read-only receipt at the approved local time', async () => {
    vi.useFakeTimers(); const root = await mkdtemp(join(tmpdir(), 'thsv-preflight-schedule-')); roots.push(root); let current = new Date(2026, 7, 25, 18, 29, 0); const run = vi.fn(async () => ({ ready: true, launcher: { checks: [{ ready: true }, { ready: true }] } })); const service = new ScheduledReliabilityPreflightService(root, run, () => current);
    expect(service.status()).toMatchObject({ schedule: { enabled: false }, history: [] }); await expect(service.save({ enabled: true, usualStreamTime: '19:00', leadMinutes: 30, daysOfWeek: [current.getDay()] })).rejects.toThrow('Explicit creator approval');
    await service.save({ enabled: true, usualStreamTime: '19:00', leadMinutes: 30, daysOfWeek: [current.getDay()], approvedByCreator: true }); await service.start(); expect(run).not.toHaveBeenCalled(); current = new Date(2026, 7, 25, 18, 30, 0); await vi.advanceTimersByTimeAsync(60_000); await vi.waitFor(() => expect(service.status()).toMatchObject({ running: false, history: [{ ready: true, totalChecks: 2, summary: 'Scheduled dry-run preflight passed.' }] })); expect(run).toHaveBeenCalledTimes(1); await vi.advanceTimersByTimeAsync(60_000); expect(run).toHaveBeenCalledTimes(1); service.stop();
  });
});
