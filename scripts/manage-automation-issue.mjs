import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function decideAutomationIssue({ kind, result, tag = '', previousResult = '', openIssueNumber = '' }) {
  if (!['release-preflight', 'post-release-smoke'].includes(kind)) throw new Error(`Unsupported automation issue kind: ${kind}`);
  if (!['success', 'failure', 'cancelled'].includes(result)) throw new Error(`Unsupported automation result: ${result}`);
  const title = kind === 'release-preflight' ? '[automation] Release preflight has failed twice' : `[automation] Post-release smoke failed for ${tag}`;
  if (kind === 'post-release-smoke' && !/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(tag)) throw new Error(`Invalid release tag: ${tag}`);
  if (result === 'success') return { action: openIssueNumber ? 'close' : 'none', title, issueNumber: openIssueNumber, reason: openIssueNumber ? 'recovered' : 'healthy-without-open-issue' };
  if (kind === 'release-preflight') {
    if (result !== 'failure' || previousResult !== 'failure') return { action: 'none', title, issueNumber: openIssueNumber, reason: 'requires-two-consecutive-failures' };
    return openIssueNumber ? { action: 'none', title, issueNumber: openIssueNumber, reason: 'failure-already-tracked' } : { action: 'create', title, issueNumber: '', reason: 'two-consecutive-failures' };
  }
  return openIssueNumber ? { action: 'comment', title, issueNumber: openIssueNumber, reason: 'repeat-failure' } : { action: 'create', title, issueNumber: '', reason: 'first-tracked-failure' };
}

async function main() {
  const argumentsValue = parseArguments(process.argv.slice(2));
  const kind = required(argumentsValue, 'kind');
  const result = required(argumentsValue, 'result');
  const repository = required(argumentsValue, 'repository');
  const runUrl = required(argumentsValue, 'run-url');
  const tag = argumentsValue.get('tag') ?? '';
  const dryRun = argumentsValue.has('dry-run');
  const title = kind === 'release-preflight' ? '[automation] Release preflight has failed twice' : `[automation] Post-release smoke failed for ${tag}`;
  const openIssueNumber = argumentsValue.get('open-issue-number') ?? (dryRun ? '' : gh(['issue', 'list', '--repo', repository, '--state', 'open', '--search', `${title} in:title`, '--json', 'number', '--jq', '.[0].number // empty']));
  const previousResult = argumentsValue.get('previous-result') ?? (kind === 'release-preflight' && !dryRun ? gh(['run', 'list', '--repo', repository, '--workflow', 'release-preflight.yml', '--event', 'schedule', '--status', 'completed', '--limit', '1', '--json', 'conclusion', '--jq', '.[0].conclusion // empty']) : '');
  const decision = decideAutomationIssue({ kind, result, tag, previousResult, openIssueNumber });
  if (!dryRun) applyDecision(decision, { kind, repository, runUrl, tag });
  process.stdout.write(`${JSON.stringify({ ...decision, dryRun })}\n`);
}

function applyDecision(decision, context) {
  if (decision.action === 'none') return;
  if (decision.action === 'close') {
    const message = context.kind === 'release-preflight' ? `The weekly non-publishing release preflight recovered successfully: ${context.runUrl}` : `Post-release verification recovered for ${context.tag}: ${context.runUrl}`;
    gh(['issue', 'close', decision.issueNumber, '--repo', context.repository, '--comment', message]);
    return;
  }
  if (decision.action === 'comment') {
    gh(['issue', 'comment', decision.issueNumber, '--repo', context.repository, '--body', `Post-release verification failed again for ${context.tag}: ${context.runUrl}`]);
    return;
  }
  const body = context.kind === 'release-preflight'
    ? `Two consecutive weekly non-publishing release preflights failed. Review the latest run: ${context.runUrl}`
    : `Published asset verification, provenance, installation, recovery, or rollback protection failed for ${context.tag}. Review the run and its evidence: ${context.runUrl}`;
  gh(['issue', 'create', '--repo', context.repository, '--title', decision.title, '--body', body]);
}

function gh(argumentsValue) {
  const result = spawnSync('gh', argumentsValue, { encoding: 'utf8', shell: false, windowsHide: true });
  if (result.status !== 0) throw new Error(`gh ${argumentsValue[0]} failed: ${result.error?.message || result.stderr || result.stdout || 'unknown error'}`.trim());
  return result.stdout.trim();
}

function parseArguments(values) {
  const result = new Map();
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index];
    if (!key?.startsWith('--')) throw new Error(`Unexpected argument: ${key ?? ''}`);
    if (key === '--dry-run') { result.set('dry-run', 'true'); continue; }
    const value = values[++index];
    if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${key}.`);
    result.set(key.slice(2), value);
  }
  return result;
}

function required(values, name) { const value = values.get(name); if (!value) throw new Error(`--${name} is required.`); return value; }

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
