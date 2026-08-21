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
    expect(preflight).toContain('workflow_dispatch:');
    expect(preflight).toContain('workflow_call:');
    expect(preflight).toContain("cron: '17 10 * * 1'");
    expect(preflight).toContain('AllowPublishedCurrentVersion');
    expect(preflight).toContain('retention-days: 14');
    expect(preflight).toContain('test-release-candidate.ps1');
    expect(preflight).toContain('notify-after-repeat-failure:');
    expect(preflight).toContain("previous\" != 'failure'");
    expect(preflight).toContain('gh issue create');
    expect(preflight).not.toContain('gh release create');
    expect(release).toContain('test-release-candidate.ps1');
    expect(release).toContain('environment:');
    expect(release).toContain('name: streambridge-release');
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
    expect(workflow).toContain('Open one failure issue per tag or close it after recovery');
    expect(workflow).toContain('gh issue create');
    expect(workflow).toContain('gh issue close');
    expect(workflow).toContain('gh issue comment');
  });
});
