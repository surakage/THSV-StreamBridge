import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { comparePreStreamReports, createPreStreamReport, PreStreamReportError } from '../../bridge/services/pre-stream-report-service.js';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

describe('pre-stream report', () => {
  it('exports whitelisted build, readiness, OBS, acceptance, and startup evidence', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-pre-stream-report-')); roots.push(root); await mkdir(join(root, 'logs'), { recursive: true });
    await writeFile(join(root, 'logs', 'last-startup-report.json'), JSON.stringify({ startupRunId: 'run-123', outcome: 'ready', token: 'never-export', rawOutput: 'private' }));
    const result = await createPreStreamReport(root, {
      provenance: { version: '4.0.1', buildFingerprint: 'a'.repeat(64), secret: 'private' },
      readiness: { ready: true, status: 'ready', blockers: [], configuration: { token: 'private' } },
      obsInventory: { configured: true, ready: true, requiredCount: 1, readyRequiredCount: 1, sources: [{ id: 'alerts', label: 'Alerts', scene: 'Live', surface: '/overlay/alerts:alerts', ready: true, privateUrl: 'secret' }] },
      liveAcceptance: { checks: [{ id: 'bridge-startup', label: 'Startup', guidance: 'not exported' }], confirmations: { 'bridge-startup': { checkId: 'bridge-startup', status: 'accepted', note: 'Passed locally.', confirmedAt: '2026-08-20T00:00:00.000Z', binding: { secret: true } } }, evidence: [{ upstreamEventId: 'private' }] },
    });
    const report = JSON.parse(new TextDecoder().decode(result.bytes)) as Record<string, unknown>; const encoded = JSON.stringify(report);
    expect(result.filename).toMatch(/^THSV-StreamBridge-pre-stream-.*\.json$/u);
    expect(report['startup']).toMatchObject({ startupRunId: 'run-123', outcome: 'ready' });
    expect(encoded).toContain('/overlay/alerts:alerts');
    expect(encoded).not.toContain('never-export'); expect(encoded).not.toContain('privateUrl'); expect(encoded).not.toContain('upstreamEventId'); expect(encoded).not.toContain('"configuration":');
  });

  it('compares only tracked sanitized readiness fields and classifies regressions', () => {
    const baseline = { schemaVersion: 1, build: { version: '4.0.0', buildFingerprint: 'a'.repeat(64) }, readiness: { ready: true, blockers: [] }, obs: { ready: true, readyRequiredCount: 2, sources: [{ id: 'alerts', ready: true }] }, acceptance: { confirmations: { startup: { status: 'accepted' } } }, startup: { outcome: 'ready' }, secret: 'ignore-me' };
    const current = { schemaVersion: 1, build: { version: '4.0.1', buildFingerprint: 'b'.repeat(64) }, readiness: { ready: false, blockers: [{ kind: 'adapter' }] }, obs: { ready: false, readyRequiredCount: 1, sources: [{ id: 'alerts', ready: false }] }, acceptance: { confirmations: { startup: { status: 'due' } } }, startup: { outcome: 'ready' } };
    const result = comparePreStreamReports(baseline, current) as { regressions: number; changes: Array<{ label: string }> };
    expect(result.regressions).toBeGreaterThanOrEqual(5); expect(result.changes.map((change) => change.label)).toContain('Acceptance startup'); expect(JSON.stringify(result)).not.toContain('ignore-me');
    expect(() => comparePreStreamReports({}, current)).toThrow(PreStreamReportError);
  });
});
