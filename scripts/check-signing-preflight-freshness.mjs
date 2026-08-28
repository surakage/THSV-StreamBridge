import { appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function checkSigningPreflightFreshness({ repository, maximumAgeDays = 35, token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN ?? '', fetcher = fetch, now = Date.now() }) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository)) throw new Error('Repository must use owner/name format.');
  if (!Number.isInteger(maximumAgeDays) || maximumAgeDays < 1 || maximumAgeDays > 365) throw new Error('Maximum age must be between 1 and 365 days.');
  const response = await fetcher(`https://api.github.com/repos/${repository}/actions/workflows/windows-signing-certificate-preflight.yml/runs?status=completed&per_page=20`, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'THSV-StreamBridge', 'x-github-api-version': '2022-11-28', ...(token ? { authorization: `Bearer ${token}` } : {}) }, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Certificate-preflight history lookup failed (${response.status}).`);
  const body = await response.json();
  const runs = Array.isArray(body?.workflow_runs) ? body.workflow_runs : [];
  const latestSuccess = runs.filter((run) => run?.conclusion === 'success' && typeof run.updated_at === 'string').sort((left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at))[0];
  const updatedAtMs = Date.parse(String(latestSuccess?.updated_at ?? ''));
  const ageDays = Number.isFinite(updatedAtMs) ? Math.max(0, Math.floor((now - updatedAtMs) / 86_400_000)) : undefined;
  const fresh = ageDays !== undefined && ageDays <= maximumAgeDays;
  return { schemaVersion: 1, checkedAt: new Date(now).toISOString(), repository, maximumAgeDays, latestSuccessAt: latestSuccess?.updated_at, ageDays, latestRunUrl: latestSuccess?.html_url, result: fresh ? 'success' : 'failure', fresh };
}

async function main() {
  const values = new Map();
  for (let index = 2; index < process.argv.length; index += 2) values.set(process.argv[index], process.argv[index + 1]);
  const repository = values.get('--repository') ?? '';
  const maximumAgeDays = Number(values.get('--maximum-age-days') ?? '35');
  const output = await checkSigningPreflightFreshness({ repository, maximumAgeDays });
  const githubOutput = values.get('--github-output');
  if (githubOutput) await appendFile(githubOutput, `result=${output.result}\nage_days=${output.ageDays ?? 'missing'}\nlatest_run_url=${output.latestRunUrl ?? ''}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(output)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
