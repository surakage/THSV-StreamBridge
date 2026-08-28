import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const executable = process.platform === 'win32' ? 'powershell.exe' : 'pwsh';
const policy = process.platform === 'win32' ? ['-ExecutionPolicy', 'Bypass'] : [];

describe('release evidence manifest', () => {
  it('records exact asset hashes plus lifecycle and startup evidence', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-release-evidence-')); roots.push(root);
    const packages = join(root, 'packages'); const output = join(root, 'output'); const lifecycle = join(root, 'lifecycle.json'); const startup = join(root, 'startup.json'); const sbom = join(root, 'THSV-StreamBridge-v4.0.9.cdx.json');
    await mkdir(packages, { recursive: true });
    const files = ['THSV-StreamBridge-4.0.9.zip', 'THSV-StreamBridge-4.0.9.zip.sha256', 'THSV-StreamBridge-AddOn-Test-4.0.9.zip', 'THSV-StreamBridge-AddOn-Test-4.0.9.zip.sha256', 'THSV-StreamBridge-AddOns-index.json', 'THSV-StreamBridge-AddOns-index.json.sha256'];
    const commitSha = 'a'.repeat(40);
    for (const [index, name] of files.entries()) await writeFile(join(packages, name), name === 'THSV-StreamBridge-4.0.9.zip' ? zipSync({ 'release-manifest.json': strToU8(JSON.stringify({ version: '4.0.9', source: { repository: 'surakage/THSV-StreamBridge', commitSha, treeState: 'clean' } })) }) : `asset-${String(index)}\n`);
    await writeFile(lifecycle, JSON.stringify({ currentTag: 'v4.0.9', previousTag: 'v4.0.8', creatorDataPreserved: true, encryptedRecoveryBundleVerified: true, recoveryFreshProfileRestored: true }), 'utf8');
    await writeFile(startup, JSON.stringify({ passed: true, isolated: true, scenarios: ['early process exit and retry'] }), 'utf8');
    await writeFile(sbom, '{"bomFormat":"CycloneDX"}\n', 'utf8');
    const result = spawnSync(executable, ['-NoProfile', '-NonInteractive', ...policy, '-File', 'scripts/new-release-evidence.ps1', '-Tag', 'v4.0.9', '-CommitSha', commitSha, '-Repository', 'surakage/THSV-StreamBridge', '-PackagesDirectory', packages, '-SbomPath', sbom, '-LifecycleEvidencePath', lifecycle, '-StartupEvidencePath', startup, '-Destination', output], { encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    const manifestPath = join(output, 'THSV-StreamBridge-v4.0.9.release-evidence.json');
    const manifestBytes = await readFile(manifestPath);
    const manifest = JSON.parse(manifestBytes.toString('utf8')) as { schemaVersion: number; tag: string; commitSha: string; coreArchive: { sourceCommitSha: string; sha256: string }; assets: Array<{ name: string; sha256: string }>; lifecycle: { creatorDataPreserved: boolean }; startupChaos: { passed: boolean } };
    expect(manifest).toMatchObject({ schemaVersion: 2, tag: 'v4.0.9', commitSha, coreArchive: { sourceCommitSha: commitSha }, lifecycle: { creatorDataPreserved: true }, startupChaos: { passed: true } });
    expect(manifest.coreArchive.sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(manifest.assets).toHaveLength(7);
    expect(manifest.assets.every((asset) => /^[a-f0-9]{64}$/u.test(asset.sha256))).toBe(true);
    const checksum = (await readFile(`${manifestPath}.sha256`, 'utf8')).split(/\s+/u)[0];
    expect(checksum).toBe(createHash('sha256').update(manifestBytes).digest('hex'));
  });
});
