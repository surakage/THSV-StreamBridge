import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('4.0.9 scheduled hardening workflows', () => {
  it('verifies every public release evidence class and waits for repeat failures before notifying', async () => {
    const workflow = await readFile('.github/workflows/public-attestation-canary.yml', 'utf8');
    const canary = await readFile('scripts/test-public-attestation-canary.ps1', 'utf8');
    expect(workflow).toContain('notify-after-repeat-failure');
    expect(workflow).toContain('--kind public-attestation-canary');
    expect(canary).toContain('sbomAttestationVerified');
    expect(canary).toContain('releaseEvidenceVerified');
    expect(canary).toContain('addOnIndexVerified');
    expect(canary).toContain('$provenanceAssets');
  });

  it('rotates a verified portable runtime cache and shares its newest generation with release jobs', async () => {
    const workflow = await readFile('.github/workflows/runtime-cache-canary.yml', 'utf8');
    const release = await readFile('.github/workflows/release.yml', 'utf8');
    const preflight = await readFile('.github/workflows/release-preflight.yml', 'utf8');
    const rehearsal = await readFile('scripts/rehearse-node-runtime-cache.ps1', 'utf8');
    expect(workflow).toContain('rehearse-node-runtime-cache.ps1');
    expect(workflow).toContain('--kind runtime-cache-canary');
    expect(rehearsal).toContain('corruptionRejected');
    expect(rehearsal).toContain('.rotation-rollback-');
    expect(release).toContain('restore-keys:');
    expect(preflight).toContain('restore-keys:');
  });

  it('keeps the TypeScript 7 and Node 26 trial isolated from production manifests', async () => {
    const workflow = await readFile('.github/workflows/toolchain-major-canary.yml', 'utf8');
    const canary = await readFile('scripts/test-next-major-toolchain.ps1', 'utf8');
    expect(workflow).toContain('test-next-major-toolchain.ps1');
    expect(workflow).toContain('--kind toolchain-major-canary');
    expect(canary).toContain('typescript-next@npm:typescript@7.0.2');
    expect(canary).toContain("'@types/node@26.4.0'");
    expect(canary).toContain('productionManifestChanged');
    expect(canary).toContain('npm.cmd ci --ignore-scripts');
  });

  it('runs the current actionlint release and excludes disposable caches from typed lint discovery', async () => {
    const workflow = await readFile('.github/workflows/ci.yml', 'utf8');
    const eslint = await readFile('eslint.config.mjs', 'utf8');
    expect(workflow).toContain('docker://rhysd/actionlint:1.7.12');
    expect(eslint).toContain("'.cache/**'");
  });
});
