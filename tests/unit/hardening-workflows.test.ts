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
    expect(workflow).toContain('lane: [typescript-7, node-types-26, combined]');
    expect(workflow).toContain("-Lane '${{ matrix.lane }}'");
    expect(workflow).toContain('--kind toolchain-major-canary');
    expect(canary).toContain('typescript-next@npm:typescript@7.0.2');
    expect(canary).toContain("'@types/node@26.4.0'");
    expect(canary).toContain('productionManifestChanged');
    expect(canary).toContain("[ValidateSet('typescript-7', 'node-types-26', 'combined')]");
    expect(canary).toContain('lane = $Lane');
    expect(canary).toContain('npm.cmd ci --ignore-scripts');
  });

  it('prepares toolchain promotion only after an explicit confirmation and three green scheduled runs', async () => {
    const workflow = await readFile('.github/workflows/toolchain-major-promotion.yml', 'utf8');
    const evidence = await readFile('scripts/test-toolchain-promotion-evidence.ps1', 'utf8');
    expect(workflow).toContain("inputs.confirmation == 'CREATE-DRAFT-TOOLCHAIN-PR'");
    expect(workflow).toContain('event=schedule&status=completed&per_page=10');
    expect(workflow).toContain("$_.head_branch -eq 'main'");
    expect(workflow).toContain('-gt $publishedAt');
    expect(workflow).toContain('Select-Object -First 3');
    expect(workflow).toContain("gh release view v4.0.9");
    expect(workflow).toContain('typescript@7.0.2');
    expect(workflow).toContain("'@types/node@26.4.0'");
    expect(workflow).toContain('gh pr create --draft');
    expect(workflow).toContain('pull-requests: write');
    expect(workflow).toContain('download-github-artifact.mjs');
    expect(workflow).toContain('artifact.digest');
    expect(workflow).toContain('ExpectedHeadShasCsv');
    expect(workflow).toContain('gh workflow run ci.yml');
    expect(workflow).toContain('gh run watch');
    expect(workflow).toContain('attestations: write');
    expect(workflow).toContain('id-token: write');
    expect(workflow).toContain('Attest the exact promotion eligibility and validation evidence');
    expect(workflow).toContain('artifacts/toolchain-promotion/canary-evidence.json');
    expect(workflow).toContain('artifact-metadata: write');
    expect(workflow).toContain('promotion-attestation.outputs.attestation-url');
    expect(workflow).toContain('Restore the weekly canary schedule in the promotion change');
    expect(workflow).toContain("cron: '29 10 * * 4'");
    expect(workflow).toContain('git add package.json package-lock.json .github/workflows/toolchain-major-canary.yml');
    expect(workflow).toContain('test-toolchain-promotion-evidence.ps1');
    expect(evidence).toContain("@('typescript-7', 'node-types-26', 'combined')");
    expect(evidence).toContain('productionManifestChanged -ne $false');
    expect(evidence).toContain('sourceCommitSha -ne $expectedHeadSha');
  });

  it('lets Dependabot refresh immutable GitHub Action digests without auto-merging them', async () => {
    const dependabot = await readFile('.github/dependabot.yml', 'utf8');
    expect(dependabot).toContain('package-ecosystem: github-actions');
    expect(dependabot).toContain('immutable-action-digests:');
    expect(dependabot).toContain('open-pull-requests-limit: 1');
  });

  it('requires creator-approved signing identities and warns before certificate expiry', async () => {
    const release = await readFile('.github/workflows/release.yml', 'utf8');
    const packager = await readFile('scripts/package-release.ps1', 'utf8');
    const signer = await readFile('scripts/sign-windows-release.ps1', 'utf8');
    const policy = await readFile('scripts/windows-signing-certificate-policy.ps1', 'utf8');
    expect(release).toContain('WINDOWS_SIGNING_ALLOWED_THUMBPRINTS');
    expect(release).toContain("vars.WINDOWS_SIGNING_MODE || 'unsigned'");
    expect(release).toContain("$signingMode -notin @('unsigned', 'certificate')");
    expect(release).toContain("$signingMode -eq 'certificate'");
    expect(packager).toContain('THSV_WINDOWS_SIGNING_ALLOWED_THUMBPRINTS');
    expect(signer).toContain('AllowedCertificateThumbprints');
    expect(policy).toContain('creator-approved allowlist');
    expect(signer).toContain('CertificateExpiryWarningDays');
    expect(policy).toContain("expiryState = $expiryState");
    const preflight = await readFile('.github/workflows/windows-signing-certificate-preflight.yml', 'utf8');
    expect(preflight).toContain("inputs.confirmation == 'VERIFY-SIGNING-CERTIFICATE'");
    expect(preflight).toContain('environment: streambridge-release');
    expect(preflight).toContain('test-windows-signing-certificate.ps1');
    expect(preflight).toContain("signingMode = 'unsigned'");
    expect(preflight).toContain("signingMode = 'certificate'");
    expect(preflight).toContain("'expiry_state=unsigned'");
    expect(preflight).toContain('certificate-renewal-reminder');
    expect(preflight).toContain('--kind signing-certificate-expiry');
    expect(preflight).toContain('issues: write');
    expect(preflight).toContain('$publicEvidence');
    expect(preflight).not.toContain('subject = $evidence.certificate.subject');
    expect(preflight).not.toContain('thumbprint = $evidence.certificate.thumbprint');
    const reminder = await readFile('.github/workflows/windows-signing-certificate-reminder.yml', 'utf8');
    expect(reminder).toContain("cron: '17 13 1 * *'");
    expect(reminder).toContain('check-signing-preflight-freshness.mjs');
    expect(reminder).toContain('--kind signing-certificate-preflight-stale');
    expect(reminder).toContain('issues: write');
  });

  it('runs the current actionlint release and excludes disposable caches from typed lint discovery', async () => {
    const workflow = await readFile('.github/workflows/ci.yml', 'utf8');
    const eslint = await readFile('eslint.config.mjs', 'utf8');
    expect(workflow).toContain('docker://rhysd/actionlint:1.7.12@sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667');
    expect(workflow).toContain('gh attestation verify actionlint.tar.gz --repo rhysd/actionlint');
    expect(workflow).toContain('path: .cache/action-tag-resolution-v1.json');
    expect(workflow).toContain('action-tag-resolution-v1-${{ github.run_id }}');
    expect(eslint).toContain("'.cache/**'");
    const bootstrap = await readFile('scripts/invoke-actionlint.ps1', 'utf8');
    expect(bootstrap).toContain('6e7241b51e6817ea6a047693d8e6fed13b31819c9a0dd6c5a726e1592d22f6e9');
    expect(bootstrap).toContain('Test-CachedArchive');
    expect(bootstrap).toContain('$Offline');
    const verifier = await readFile('scripts/verify-action-pins.mjs', 'utf8');
    expect(verifier).toContain("APPROVED_ACTION_PUBLISHERS = new Set(['actions'])");
    expect(verifier).toContain('action-tag-resolution-v1.json');
  });

  it('isolates every browser case behind its own Bridge process, port, and disposable data root', async () => {
    const config = await readFile('playwright.config.ts', 'utf8');
    const fixture = await readFile('tests/browser/fixtures.ts', 'utf8');
    const server = await readFile('tools/run-browser-test-server.mjs', 'utf8');
    expect(config).toContain('fullyParallel: true');
    expect(config).toContain('process.env.CI ? 4 : 3');
    expect(fixture).toContain('reservePort()');
    expect(fixture).toContain('THSV_BROWSER_TEST_ROOT: root');
    expect(fixture).toContain("rm(root, { recursive: true, force: true })");
    expect(server).toContain('THSV_BROWSER_TEST_ROOT');
  });
});
