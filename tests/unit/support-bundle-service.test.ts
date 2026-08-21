import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unzipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';
import { prepareSupportBundle, createSupportBundle, previewSupportBundle } from '../../bridge/services/support-bundle-service.js';
import { createHash } from 'node:crypto';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

describe('support bundle', () => {
  it('contains bounded startup evidence and redacts secrets without including configuration', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-support-bundle-')); roots.push(root);
    await mkdir(join(root, 'logs'), { recursive: true });
    await writeFile(join(root, 'logs', 'last-startup-report.json'), JSON.stringify({ startupRunId: '123', message: 'token=very-secret-value Bearer abc.def' }));
    const result = await createSupportBundle(root, { health: { status: 'healthy' }, readiness: { ready: false, token: 'private-token' }, diagnostics: { password: 'private-password' } });
    const files = unzipSync(result.bytes);
    const summary = new TextDecoder().decode(files['summary.json']);
    const startup = new TextDecoder().decode(files['startup/last-startup-report.json']);
    expect(result.filename).toMatch(/^THSV-StreamBridge-support-.*\.zip$/u);
    expect(Object.keys(files)).not.toContain('configuration/bridge.local.json');
    expect(summary).toContain('[REDACTED]');
    expect(summary).not.toContain('private-token');
    expect(summary).not.toContain('private-password');
    expect(startup).not.toContain('very-secret-value');
    expect(startup).not.toContain('abc.def');
  });

  it('previews the exact sanitized file list, truncation, omissions, and redaction totals', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-support-preview-')); roots.push(root);
    await mkdir(join(root, 'logs'), { recursive: true });
    await writeFile(join(root, 'logs', 'last-startup-report.json'), JSON.stringify({ token: 'private-value', message: 'password=another-secret' }));
    const preview = await previewSupportBundle(root, { health: {}, readiness: {}, diagnostics: {} });
    expect(preview.files.map((file) => file.path)).toEqual(expect.arrayContaining(['README.txt', 'summary.json', 'startup/last-startup-report.json']));
    expect(preview.totalRedactions).toBeGreaterThanOrEqual(2);
    expect(preview.omittedCategories).toContain('configuration files');
  });

  it('prepares preview metadata and downloadable bytes from one immutable snapshot', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-support-snapshot-')); roots.push(root);
    const prepared = await prepareSupportBundle(root, { health: {}, readiness: {}, diagnostics: {} });
    expect(prepared.preview.filename).toBe(prepared.bundle.filename);
    expect(prepared.preview.archiveBytes).toBe(prepared.bundle.bytes.byteLength);
    expect(prepared.preview.sha256).toBe(createHash('sha256').update(prepared.bundle.bytes).digest('hex'));
    expect(prepared.bundle.sha256).toBe(prepared.preview.sha256);
  });
});
