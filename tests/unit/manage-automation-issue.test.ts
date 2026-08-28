import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { decideAutomationIssue } from '../../scripts/manage-automation-issue.mjs';

describe('automation issue policy', () => {
  it('requires two consecutive preflight failures and deduplicates the issue', () => {
    expect(decideAutomationIssue({ kind: 'release-preflight', result: 'failure', previousResult: 'success', openIssueNumber: '' })).toMatchObject({ action: 'none' });
    expect(decideAutomationIssue({ kind: 'release-preflight', result: 'failure', previousResult: 'failure', openIssueNumber: '' })).toMatchObject({ action: 'create' });
    expect(decideAutomationIssue({ kind: 'release-preflight', result: 'failure', previousResult: 'failure', openIssueNumber: '42' })).toMatchObject({ action: 'none', issueNumber: '42' });
    expect(decideAutomationIssue({ kind: 'release-preflight', result: 'success', previousResult: 'failure', openIssueNumber: '42' })).toMatchObject({ action: 'close', issueNumber: '42' });
  });

  it('requires two consecutive public-attestation failures and closes after recovery', () => {
    expect(decideAutomationIssue({ kind: 'public-attestation-canary', result: 'failure', previousResult: 'success', openIssueNumber: '' })).toMatchObject({ action: 'none' });
    expect(decideAutomationIssue({ kind: 'public-attestation-canary', result: 'failure', previousResult: 'failure', openIssueNumber: '' })).toMatchObject({ action: 'create' });
    expect(decideAutomationIssue({ kind: 'public-attestation-canary', result: 'success', previousResult: 'failure', openIssueNumber: '19' })).toMatchObject({ action: 'close', issueNumber: '19' });
  });

  it.each(['runtime-cache-canary', 'toolchain-major-canary'] as const)('requires two consecutive %s failures and closes after recovery', (kind) => {
    expect(decideAutomationIssue({ kind, result: 'failure', previousResult: 'success', openIssueNumber: '' })).toMatchObject({ action: 'none' });
    expect(decideAutomationIssue({ kind, result: 'failure', previousResult: 'failure', openIssueNumber: '' })).toMatchObject({ action: 'create' });
    expect(decideAutomationIssue({ kind, result: 'success', previousResult: 'failure', openIssueNumber: '23' })).toMatchObject({ action: 'close', issueNumber: '23' });
  });

  it('creates, updates, and closes one post-release issue per tag', () => {
    expect(decideAutomationIssue({ kind: 'post-release-smoke', result: 'failure', tag: 'v4.0.3', openIssueNumber: '' })).toMatchObject({ action: 'create' });
    expect(decideAutomationIssue({ kind: 'post-release-smoke', result: 'failure', tag: 'v4.0.3', openIssueNumber: '17' })).toMatchObject({ action: 'comment', issueNumber: '17' });
    expect(decideAutomationIssue({ kind: 'post-release-smoke', result: 'success', tag: 'v4.0.3', openIssueNumber: '17' })).toMatchObject({ action: 'close', issueNumber: '17' });
  });

  it('deduplicates dependency canary failures and closes the issue after recovery', () => {
    expect(decideAutomationIssue({ kind: 'dependency-canary', result: 'failure' })).toMatchObject({ action: 'create', reason: 'first-tracked-failure' });
    expect(decideAutomationIssue({ kind: 'dependency-canary', result: 'failure', openIssueNumber: '42' })).toMatchObject({ action: 'comment', issueNumber: '42' });
    expect(decideAutomationIssue({ kind: 'dependency-canary', result: 'success', openIssueNumber: '42' })).toMatchObject({ action: 'close', issueNumber: '42' });
  });

  it('supports a network-free command-line dry run', () => {
    const result = spawnSync(process.execPath, ['scripts/manage-automation-issue.mjs', '--kind', 'post-release-smoke', '--result', 'failure', '--tag', 'v4.0.3', '--repository', 'surakage/THSV-StreamBridge', '--run-url', 'https://github.test/run/1', '--dry-run'], { encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ action: 'create', dryRun: true });
  });
});
