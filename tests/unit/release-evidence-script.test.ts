import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const executable = process.platform === 'win32' ? 'powershell.exe' : 'pwsh';
const policy = process.platform === 'win32' ? ['-ExecutionPolicy', 'Bypass'] : [];

describe('release evidence manifest', () => {
  it('records exact asset hashes plus lifecycle and startup evidence', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-release-evidence-')); roots.push(root);
    const packages = join(root, 'packages'); const output = join(root, 'output'); const lifecycle = join(root, 'lifecycle.json'); const startup = join(root, 'startup.json'); const sbom = join(root, 'THSV-StreamBridge-v4.0.3.cdx.json');
    await mkdir(packages, { recursive: true });
    const files = ['THSV-StreamBridge-4.0.3.zip', 'THSV-StreamBridge-4.0.3.zip.sha256', 'THSV-StreamBridge-AddOn-Test-4.0.3.zip', 'THSV-StreamBridge-AddOn-Test-4.0.3.zip.sha256', 'THSV-StreamBridge-AddOns-index.json', 'THSV-StreamBridge-AddOns-index.json.sha256'];
    for (const [index, name] of files.entries()) await writeFile(join(packages, name), `asset-${String(index)}\n`, 'utf8');
    await writeFile(lifecycle, JSON.stringify({ currentTag: 'v4.0.3', previousTag: 'v4.0.2', creatorDataPreserved: true }), 'utf8');
    await writeFile(startup, JSON.stringify({ passed: true, isolated: true, scenarios: ['early process exit and retry'] }), 'utf8');
    await writeFile(sbom, '{"bomFormat":"CycloneDX"}\n', 'utf8');
    const result = spawnSync(executable, ['-NoProfile', '-NonInteractive', ...policy, '-File', 'scripts/new-release-evidence.ps1', '-Tag', 'v4.0.3', '-CommitSha', 'a'.repeat(40), '-Repository', 'surakage/THSV-StreamBridge', '-PackagesDirectory', packages, '-SbomPath', sbom, '-LifecycleEvidencePath', lifecycle, '-StartupEvidencePath', startup, '-Destination', output], { encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    const manifestPath = join(output, 'THSV-StreamBridge-v4.0.3.release-evidence.json');
    const manifestBytes = await readFile(manifestPath);
    const manifest = JSON.parse(manifestBytes.toString('utf8')) as { tag: string; commitSha: string; assets: Array<{ name: string; sha256: string }>; lifecycle: { creatorDataPreserved: boolean }; startupChaos: { passed: boolean } };
    expect(manifest).toMatchObject({ tag: 'v4.0.3', commitSha: 'a'.repeat(40), lifecycle: { creatorDataPreserved: true }, startupChaos: { passed: true } });
    expect(manifest.assets).toHaveLength(7);
    expect(manifest.assets.every((asset) => /^[a-f0-9]{64}$/u.test(asset.sha256))).toBe(true);
    const checksum = (await readFile(`${manifestPath}.sha256`, 'utf8')).split(/\s+/u)[0];
    expect(checksum).toBe(createHash('sha256').update(manifestBytes).digest('hex'));
  });
});
