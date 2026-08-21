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
    expect(preflight).not.toContain('gh release create');
    expect(release).toContain('test-release-candidate.ps1');
  });
});
