import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const executable = process.platform === 'win32' ? 'powershell.exe' : 'pwsh';
const packageVersion = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version;
const policy = process.platform === 'win32' ? ['-ExecutionPolicy', 'Bypass'] : [];
function runScript(script: string, args: string[]) { return spawnSync(executable, ['-NoProfile', '-NonInteractive', ...policy, '-File', script, ...args], { encoding: 'utf8' }); }

// Each case starts PowerShell, which can take well over 15 seconds to cold-start on a busy CI runner.
describe('release preflight scripts', { timeout: 60_000 }, () => {
  it('selects the prior verified release without YAML quoting or network access', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-release-list-')); roots.push(root);
    const releases = join(root, 'releases.json');
    await writeFile(releases, JSON.stringify([{ tagName: 'v4.0.2' }, { tagName: 'not-a-release' }, { tagName: 'v4.0.1' }]), 'utf8');
    const result = runScript('scripts/resolve-previous-release.ps1', ['-CurrentTag', 'v4.0.3', '-ReleaseListPath', releases, '-ResolveOnly']);
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout.trim())).toMatchObject({ currentTag: 'v4.0.3', previousTag: 'v4.0.2', archive: null });
  });

  it('rejects selecting the current candidate as its own upgrade source', () => {
    const result = runScript('scripts/resolve-previous-release.ps1', ['-CurrentTag', 'v4.0.3', '-PreviousTag', 'v4.0.3', '-ResolveOnly']);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('must differ');
  });

  it('rejects a candidate tag that already has a published release', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-release-collision-')); roots.push(root);
    const releases = join(root, 'releases.json');
    await writeFile(releases, JSON.stringify([{ tagName: 'v4.0.3' }, { tagName: 'v4.0.2' }]), 'utf8');
    const result = runScript('scripts/resolve-previous-release.ps1', ['-CurrentTag', 'v4.0.3', '-ReleaseListPath', releases, '-ResolveOnly']);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('already exists');
  });

  it('allows the scheduled non-publishing audit to exercise the currently published version', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-release-scheduled-')); roots.push(root);
    const releases = join(root, 'releases.json');
    await writeFile(releases, JSON.stringify([{ tagName: 'v4.0.3' }, { tagName: 'v4.0.2' }]), 'utf8');
    const result = runScript('scripts/resolve-previous-release.ps1', ['-CurrentTag', 'v4.0.3', '-ReleaseListPath', releases, '-AllowExistingCurrentRelease', '-ResolveOnly']);
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout.trim())).toMatchObject({ currentTag: 'v4.0.3', previousTag: 'v4.0.2' });
  });

  it('rejects a candidate tag that differs from package.json', () => {
    const result = runScript('scripts/test-release-candidate.ps1', ['-CurrentTag', 'v9.9.9', '-SkipPackaging']);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(`does not match package.json version ${packageVersion}`);
  });

  it('verifies the exact named SHA-256 and rejects tampered bytes offline', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thsv-release-checksum-')); roots.push(root);
    const archive = join(root, 'THSV-StreamBridge-4.0.2.zip');
    const checksum = `${archive}.sha256`;
    const original = Buffer.from('verified release bytes');
    await writeFile(archive, original);
    await writeFile(checksum, `${createHash('sha256').update(original).digest('hex')}  THSV-StreamBridge-4.0.2.zip\n`, 'utf8');
    const verified = runScript('scripts/verify-release-archive.ps1', ['-ArchivePath', archive, '-ChecksumPath', checksum, '-SkipAttestation']);
    expect(verified.status, verified.stderr).toBe(0);
    // PowerShell's default table view cuts long paths to the console width (the per-run temp folder makes them long), so read the result as JSON.
    const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
    const verifiedJson = spawnSync(executable, ['-NoProfile', '-NonInteractive', ...policy, '-Command', `& ${quote('scripts/verify-release-archive.ps1')} -ArchivePath ${quote(archive)} -ChecksumPath ${quote(checksum)} -SkipAttestation | ConvertTo-Json -Compress`], { encoding: 'utf8' });
    expect(verifiedJson.status, verifiedJson.stderr).toBe(0);
    const verifiedResult = JSON.parse(verifiedJson.stdout.trim()) as { archive: string; sha256: string; checksumVerified: boolean };
    expect(verifiedResult.archive.endsWith('THSV-StreamBridge-4.0.2.zip')).toBe(true);
    expect(verifiedResult.sha256.toLowerCase()).toBe(createHash('sha256').update(original).digest('hex'));
    expect(verifiedResult.checksumVerified).toBe(true);
    await writeFile(archive, 'tampered bytes', 'utf8');
    const rejected = runScript('scripts/verify-release-archive.ps1', ['-ArchivePath', archive, '-ChecksumPath', checksum, '-SkipAttestation']);
    expect(rejected.status).not.toBe(0);
    expect(rejected.stderr).toContain('checksum mismatch');
  });
});
