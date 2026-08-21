import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('GitHub workflow reliability', () => {
  it('validates feature branches once through pull requests and cancels superseded runs', async () => {
    const workflow = await readFile('.github/workflows/ci.yml', 'utf8');
    expect(workflow).toContain('branches: [main]');
    expect(workflow).toContain('pull_request:');
    expect(workflow).toContain('cancel-in-progress: true');
    expect(workflow).toContain('docker://rhysd/actionlint:1.7.7');
  });

  it('offers a non-publishing reusable and manual release preflight', async () => {
    const preflight = await readFile('.github/workflows/release-preflight.yml', 'utf8');
    const release = await readFile('.github/workflows/release.yml', 'utf8');
    const tag = await readFile('.github/workflows/prepare-release-tag.yml', 'utf8');
    expect(preflight).toContain('workflow_dispatch:');
    expect(preflight).toContain('workflow_call:');
    expect(preflight).toContain("cron: '17 10 * * 1'");
    expect(preflight).toContain('AllowPublishedCurrentVersion');
    expect(preflight).toContain('retention-days: 14');
    expect(preflight).toContain('test-release-candidate.ps1');
    expect(await readFile('scripts/test-release-candidate.ps1', 'utf8')).toContain('recovery-bundle.tests.ps1');
    expect(preflight).toContain('notify-after-repeat-failure:');
    expect(preflight).toContain('manage-automation-issue.mjs');
    expect(preflight).not.toContain('gh release create');
    expect(release).toContain('test-release-candidate.ps1');
    expect(release).toContain('environment:');
    expect(release).toContain('name: streambridge-release');
    expect(tag).toContain('name: streambridge-tag');
    expect(tag).toContain('expected-main-sha');
    expect(tag).toContain('git rev-parse origin/main');
    expect(tag).toContain('commits/$EXPECTED_MAIN_SHA/pulls');
    expect(tag).toContain('git tag -a');
  });

  it('verifies every published asset and a clean install after release publication', async () => {
    const workflow = await readFile('.github/workflows/post-release-smoke.yml', 'utf8');
    const script = await readFile('scripts/test-published-release.ps1', 'utf8');
    expect(workflow).toContain('types: [published]');
    expect(workflow).toContain('test-published-release.ps1');
    expect(script).toContain('gh release download');
    expect(script).toContain('gh attestation verify');
    expect(script).toContain('Assert-Checksum');
    expect(script).toContain('install.mjs');
    expect(script).toContain('addOnIndexMatched = $true');
    expect(script).toContain('resolve-previous-release.ps1');
    expect(script).toContain('Same-version reinstall');
    expect(script).toContain('Refusing to downgrade');
    expect(script).toContain('rollbackProtectionVerified = $true');
    expect(script).toContain('releaseEvidenceVerified');
    expect(script).toContain('uninstall.mjs');
    expect(script).toContain('reinstallAfterUninstall = $version');
    expect(script).toContain('recoveryKeyVerified = $true');
    expect(workflow).toContain('manage-automation-issue.mjs');
    expect(await readFile('.github/workflows/release.yml', 'utf8')).toContain('new-release-evidence.ps1');
    expect(await readFile('.github/workflows/release.yml', 'utf8')).toContain('Attest release evidence');
  });

  it('dispatches the release explicitly after the protected tag workflow', async () => {
    const prepareTag = await readFile('.github/workflows/prepare-release-tag.yml', 'utf8');
    const release = await readFile('.github/workflows/release.yml', 'utf8');
    expect(prepareTag).toContain('actions: write');
    expect(prepareTag).toContain('gh workflow run release.yml');
    expect(release).toContain('workflow_dispatch:');
    expect(release).toContain('group: release-${{ inputs.tag || github.ref_name }}');
    expect(release).toContain('RELEASE_TAG: ${{ inputs.tag || github.ref_name }}');
    expect(release).toContain('ref: ${{ env.RELEASE_TAG }}');
    expect(release).toContain('-CommitSha $env:RELEASE_COMMIT_SHA');
    expect(release).toContain('gh workflow run post-release-smoke.yml');
  });

  it('opens compatible dependency updates only after the complete canary passes', async () => {
    const workflow = await readFile('.github/workflows/dependency-canary.yml', 'utf8');
    expect(workflow).toContain("cron: '41 11 * * 2'");
    expect(workflow).toContain('npm update --package-lock-only --ignore-scripts');
    expect(workflow).toMatch(/git diff --quiet -- package-lock\.json[\s\S]*?changed=true[\s\S]*?exit 0/u);
    expect(workflow).toContain('npm run test:startup-chaos');
    expect(workflow).toContain('test-release-candidate.ps1 -AllowPublishedCurrentVersion');
    expect(workflow.indexOf('test-release-candidate.ps1')).toBeLessThan(workflow.indexOf('gh pr create'));
    expect(workflow).toContain('gh pr create --repo $env:REPOSITORY --base main --head $branch --draft');
    expect(workflow).toContain('--kind dependency-canary');
  });
});
