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

  it.each(['cancelled', 'skipped', 'neutral', 'timed_out'] as const)('does not treat a %s conclusion as an automation failure', (result) => {
    expect(decideAutomationIssue({ kind: 'post-release-smoke', result, tag: 'v4.0.9', openIssueNumber: '' })).toMatchObject({ action: 'none', reason: 'non-failure-conclusion' });
    expect(decideAutomationIssue({ kind: 'dependency-canary', result, openIssueNumber: '42' })).toMatchObject({ action: 'none', issueNumber: '42', reason: 'non-failure-conclusion' });
    expect(decideAutomationIssue({ kind: 'runtime-cache-canary', result: 'failure', previousResult: result, openIssueNumber: '' })).toMatchObject({ action: 'none', reason: 'requires-two-consecutive-failures' });
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

  it('opens one certificate renewal reminder and closes it after a current preflight', () => {
    expect(decideAutomationIssue({ kind: 'signing-certificate-expiry', result: 'failure' })).toMatchObject({ action: 'create', reason: 'renewal-warning' });
    expect(decideAutomationIssue({ kind: 'signing-certificate-expiry', result: 'failure', openIssueNumber: '71' })).toMatchObject({ action: 'none', reason: 'renewal-already-tracked' });
    expect(decideAutomationIssue({ kind: 'signing-certificate-expiry', result: 'success', openIssueNumber: '71' })).toMatchObject({ action: 'close', reason: 'recovered' });
  });

  it('deduplicates a stale-preflight approval reminder and closes it after refresh', () => {
    expect(decideAutomationIssue({ kind: 'signing-certificate-preflight-stale', result: 'failure' })).toMatchObject({ action: 'create', reason: 'preflight-stale' });
    expect(decideAutomationIssue({ kind: 'signing-certificate-preflight-stale', result: 'failure', openIssueNumber: '72' })).toMatchObject({ action: 'none', reason: 'preflight-reminder-already-tracked' });
    expect(decideAutomationIssue({ kind: 'signing-certificate-preflight-stale', result: 'success', openIssueNumber: '72' })).toMatchObject({ action: 'close' });
  });

  it('supports a network-free command-line dry run', () => {
    const result = spawnSync(process.execPath, ['scripts/manage-automation-issue.mjs', '--kind', 'post-release-smoke', '--result', 'failure', '--tag', 'v4.0.3', '--repository', 'surakage/THSV-StreamBridge', '--run-url', 'https://github.test/run/1', '--dry-run'], { encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ action: 'create', dryRun: true });
  });

  it('requires bounded certificate days in a network-free renewal dry run', () => {
    const valid = spawnSync(process.execPath, ['scripts/manage-automation-issue.mjs', '--kind', 'signing-certificate-expiry', '--result', 'failure', '--days-remaining', '45', '--repository', 'surakage/THSV-StreamBridge', '--run-url', 'https://github.test/run/2', '--dry-run'], { encoding: 'utf8' });
    expect(valid.status, valid.stderr).toBe(0); expect(JSON.parse(valid.stdout)).toMatchObject({ action: 'create', reason: 'renewal-warning', dryRun: true });
    const invalid = spawnSync(process.execPath, ['scripts/manage-automation-issue.mjs', '--kind', 'signing-certificate-expiry', '--result', 'failure', '--days-remaining', '-1', '--repository', 'surakage/THSV-StreamBridge', '--run-url', 'https://github.test/run/2', '--dry-run'], { encoding: 'utf8' });
    expect(invalid.status).not.toBe(0); expect(invalid.stderr).toContain('--days-remaining');
  });
});
