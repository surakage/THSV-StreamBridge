import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

interface PullRecord { readonly number: number; readonly title: string; readonly body?: string | null; readonly html_url: string; readonly head: { readonly ref: string; readonly sha: string } }
interface CheckRecord { readonly name: string; readonly status: string; readonly conclusion: string | null; readonly details_url: string }
interface WorkflowRunRecord { readonly id: number; readonly name: string; readonly display_title: string; readonly head_branch: string | null; readonly html_url: string; readonly artifacts_url: string; readonly status: string; readonly conclusion: string | null; readonly created_at: string; readonly updated_at: string }
interface ArtifactRecord { readonly id: number; readonly name: string; readonly expired: boolean; readonly digest?: string }
interface BranchRecord { readonly name: string; readonly protected: boolean; readonly commit: { readonly sha: string } }
interface RulesetRecord { readonly id: number; readonly name: string; readonly target: string; readonly enforcement: string; readonly _links?: { readonly html?: { readonly href?: string } } }
interface GitHubHttpCacheEntry { readonly etag: string; readonly body: unknown }

export class ReleaseReadinessService {
  private remote: Readonly<Record<string, unknown>> | undefined;
  private checkedAt = 0;
  private cacheLoaded = false;
  private githubStatusSource: 'unavailable' | 'cache' | 'live' = 'unavailable';
  private readonly githubHttpCache = new Map<string, GitHubHttpCacheEntry>();
  private githubBackoffUntil = 0;

  public constructor(private readonly version: string, private readonly lifecycleEvidencePath: string, private readonly publishedEvidencePath: string, private readonly remoteCachePath: string, private readonly repository = 'surakage/THSV-StreamBridge', private readonly fetcher: typeof fetch = fetch) {}

  public async status(refresh = false): Promise<Readonly<Record<string, unknown>>> {
    await this.loadRemoteCache();
    const [lifecycle, localPublishedSmoke] = await Promise.all([this.readEvidence(this.lifecycleEvidencePath), this.readEvidence(this.publishedEvidencePath)]);
    if (refresh && (this.remote === undefined || Date.now() - this.checkedAt > 60_000)) await this.refreshRemote();
    const checks = Array.isArray(this.remote?.['checks']) ? this.remote['checks'] : [];
    const checksGreen = checks.length > 0 && checks.every((item) => isRecord(item) && item['conclusion'] === 'success');
    const lifecycleReady = lifecycle !== undefined && lifecycle['currentTag'] === `v${this.version}` && lifecycle['previousChecksumVerified'] === true && lifecycle['previousProvenanceVerified'] === true && lifecycle['creatorDataPreserved'] === true && lifecycle['encryptedRecoveryBundleVerified'] === true && lifecycle['recoveryFreshProfileRestored'] === true;
    const localSmokeMatches = localPublishedSmoke?.['tag'] === `v${this.version}`;
    const postReleaseSmoke = localSmokeMatches
      ? { available: true, source: 'local-evidence', evidenceAvailable: true, ...localPublishedSmoke }
      : this.remote?.['postReleaseSmoke'] ?? { available: false, message: `No post-release smoke result is available for v${this.version}.` };
    const postReleaseVerified = isRecord(postReleaseSmoke) && postReleaseSmoke['available'] === true && (
      (postReleaseSmoke['source'] === 'github-actions' && postReleaseSmoke['conclusion'] === 'success')
      || (postReleaseSmoke['source'] === 'local-evidence' && postReleaseSmoke['cleanInstall'] === this.version && postReleaseSmoke['rollbackProtectionVerified'] === true)
    );
    const repositoryProtection = this.remote?.['repositoryProtection'] ?? { available: false, message: 'Refresh GitHub status to audit main protection, active rulesets, and immutable releases.' };
    const repositoryProtectionsReady = isRecord(repositoryProtection) && repositoryProtection['mainProtected'] === true && repositoryProtection['immutableReleases'] === true && repositoryProtection['activeRulesetCount'] !== 0;
    const canaries = refreshCanaryAges(this.remote?.['canaries']);
    const signingCertificatePreflight = refreshSigningPreflight(this.remote?.['signingCertificatePreflight']);
    const githubApi = refreshGithubApiStatus(this.remote?.['githubApi'], this.githubStatusSource);
    const canariesFresh = canaries.length === CANARY_DEFINITIONS.length && canaries.every((item) => isRecord(item) && item['fresh'] === true && item['latestConclusion'] === 'success');
    return {
      version: this.version,
      localLifecycle: lifecycle ?? { available: false },
      pullRequest: this.remote?.['pullRequest'] ?? { available: false, message: 'Refresh GitHub status to inspect the open release-candidate PR.' },
      checks,
      canaries,
      signingCertificatePreflight,
      githubApi,
      postReleaseSmoke,
      repositoryProtection,
      releaseHandoff: this.remote?.['releaseHandoff'] ?? this.releaseHandoff(undefined, undefined),
      summary: { lifecycleReady, checksGreen, canariesFresh, postReleaseVerified, repositoryProtectionsReady, readyForCreatorReview: lifecycleReady && checksGreen && canariesFresh && repositoryProtectionsReady },
      githubStatusSource: this.githubStatusSource,
      usingCachedGitHubStatus: this.githubStatusSource === 'cache',
      remainingCreatorApprovals: ['Review and merge the pull request.', 'Approve the protected streambridge-tag environment deployment that creates the exact version tag.', 'Approve the protected streambridge-release environment deployment that publishes the GitHub release and assets.'],
      ...(this.remote?.['checkedAt'] === undefined ? {} : { checkedAt: this.remote['checkedAt'] }),
      ...(this.remote?.['error'] === undefined ? {} : { error: this.remote['error'] }),
    };
  }

  private async readEvidence(path: string): Promise<Record<string, unknown> | undefined> {
    try { const value: unknown = JSON.parse(await readFile(path, 'utf8')); return isRecord(value) ? value : undefined; }
    catch { return undefined; }
  }

  private async refreshRemote(): Promise<void> {
    if (Date.now() < this.githubBackoffUntil) {
      const backoffUntil = new Date(this.githubBackoffUntil).toISOString();
      const message = `GitHub API refresh is paused until ${backoffUntil} to respect the public rate limit.`;
      if (this.remote === undefined) { this.remote = { checkedAt: new Date().toISOString(), error: message, checks: [], githubApi: { backoffUntil } }; this.githubStatusSource = 'unavailable'; }
      else { this.remote = { ...this.remote, error: message, githubApi: { ...(isRecord(this.remote['githubApi']) ? this.remote['githubApi'] : {}), backoffUntil } }; this.githubStatusSource = 'cache'; }
      await this.persistRemoteCache().catch(() => undefined);
      return;
    }
    const checkedAt = new Date().toISOString(); this.checkedAt = Date.now();
    try {
      const options = { headers: { accept: 'application/vnd.github+json', 'user-agent': 'THSV-StreamBridge', 'x-github-api-version': '2026-03-10' }, signal: AbortSignal.timeout(5_000) };
      const [baseResponses, canaryResponses] = await Promise.all([
        Promise.all([
          this.fetchGithub(`https://api.github.com/repos/${this.repository}/pulls?state=open&per_page=30`, options),
          this.fetchGithub(`https://api.github.com/repos/${this.repository}/actions/runs?per_page=100`, options),
          this.fetchGithub(`https://api.github.com/repos/${this.repository}/branches/main`, options),
          this.fetchGithub(`https://api.github.com/repos/${this.repository}/immutable-releases`, options),
          this.fetchGithub(`https://api.github.com/repos/${this.repository}/rulesets?targets=branch,tag`, options),
          this.fetchGithub(`https://api.github.com/repos/${this.repository}/actions/workflows/windows-signing-certificate-preflight.yml/runs?per_page=20`, options),
        ]),
        Promise.all(CANARY_DEFINITIONS.map((definition) => this.fetchGithub(`https://api.github.com/repos/${this.repository}/actions/workflows/${definition.workflow}/runs?per_page=20`, options))),
      ]);
      const [pullsResponse, runsResponse, branchResponse, immutableResponse, rulesetsResponse, signingRunsResponse] = baseResponses;
      if (!pullsResponse.ok) throw new Error(`GitHub pull-request lookup returned ${String(pullsResponse.status)}.`);
      if (!runsResponse.ok) throw new Error(`GitHub workflow-run lookup returned ${String(runsResponse.status)}.`);
      const pulls = await pullsResponse.json() as PullRecord[];
      const pull = pulls.find((item) => item.title.includes(this.version)) ?? pulls.find((item) => item.head.ref.includes(`release-${this.version}`));
      const branch = branchResponse.ok ? await branchResponse.json() as BranchRecord : undefined;
      const immutable = immutableResponse.ok ? await immutableResponse.json() as { readonly enabled?: boolean; readonly enforced_by_owner?: boolean } : undefined;
      const rulesets = rulesetsResponse.ok ? await rulesetsResponse.json() as RulesetRecord[] : [];
      const activeRulesets = rulesets.filter((item) => item.enforcement === 'active');
      const repositoryProtection = {
        available: branch !== undefined,
        mainProtected: branch?.protected === true,
        mainSha: branch?.commit.sha,
        immutableReleases: immutable?.enabled === true,
        immutableEnforcedByOwner: immutable?.enforced_by_owner === true,
        activeRulesetCount: activeRulesets.length,
        activeRulesets: activeRulesets.map((item) => ({ id: item.id, name: item.name, target: item.target, url: item._links?.html?.href })),
        settingsUrl: `https://github.com/${this.repository}/settings`,
        rulesetsUrl: `https://github.com/${this.repository}/settings/rules`,
        immutableReleasesUrl: `https://github.com/${this.repository}/settings/releases`,
        ...(!branchResponse.ok ? { error: `Main-branch lookup returned ${String(branchResponse.status)}.` } : {}),
        ...(immutableResponse.status === 404 ? { immutableMessage: 'Immutable releases are not enabled.' } : !immutableResponse.ok ? { immutableMessage: `Immutable-release lookup returned ${String(immutableResponse.status)}.` } : {}),
        ...(!rulesetsResponse.ok ? { rulesetsMessage: `Ruleset lookup returned ${String(rulesetsResponse.status)}.` } : {}),
      };
      const runsBody = await runsResponse.json() as { readonly workflow_runs?: WorkflowRunRecord[] };
      const workflowRuns = runsBody.workflow_runs ?? [];
      const signingRuns = signingRunsResponse.ok ? ((await signingRunsResponse.json() as { readonly workflow_runs?: WorkflowRunRecord[] }).workflow_runs ?? []) : [];
      const signingRun = [...signingRuns].filter((run) => run.name === 'Windows signing certificate preflight').sort((left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at))[0];
      let signingArtifactResponse: Response | undefined;
      let signingArtifacts: ArtifactRecord[] = [];
      if (signingRun?.conclusion === 'success' && signingRun.artifacts_url) {
        signingArtifactResponse = await this.fetchGithub(signingRun.artifacts_url, options);
        if (signingArtifactResponse.ok) signingArtifacts = (await signingArtifactResponse.json() as { readonly artifacts?: ArtifactRecord[] }).artifacts ?? [];
      }
      const signingCertificatePreflight = summarizeSigningPreflight(signingRun, signingArtifacts, checkedAt, signingRunsResponse.ok ? undefined : `Certificate preflight lookup returned ${String(signingRunsResponse.status)}.`);
      const canaryRuns = await Promise.all(canaryResponses.map(async (response) => response.ok ? ((await response.json() as { readonly workflow_runs?: WorkflowRunRecord[] }).workflow_runs ?? []) : []));
      const canaryErrors = canaryResponses.map((response, index) => response.ok ? undefined : `${CANARY_DEFINITIONS[index]?.name ?? 'Canary'} lookup returned ${String(response.status)}.`);
      const canaries = summarizeCanaries(canaryRuns, canaryErrors, checkedAt);
      const githubResponses = [...baseResponses, ...canaryResponses, ...(signingArtifactResponse === undefined ? [] : [signingArtifactResponse])];
      const githubApi = summarizeGithubApiStatus(githubResponses, checkedAt);
      const tag = `v${this.version}`;
      const smokeRun = workflowRuns.find((item) => item.name === 'Post-release smoke' && (item.head_branch === tag || item.display_title.includes(tag)));
      const postReleaseSmoke = smokeRun === undefined
        ? { available: false, message: `No post-release smoke workflow run was found for ${tag}.` }
        : { available: true, source: 'github-actions', tag, runId: smokeRun.id, status: smokeRun.status, conclusion: smokeRun.conclusion, url: smokeRun.html_url, evidenceUrl: `${smokeRun.html_url}#artifacts`, artifactsApiUrl: smokeRun.artifacts_url, createdAt: smokeRun.created_at, updatedAt: smokeRun.updated_at };
      if (pull === undefined) { await this.storeLiveRemote({ checkedAt, pullRequest: { available: false, message: `No open ${this.version} pull request was found.` }, checks: [], canaries, signingCertificatePreflight, githubApi, postReleaseSmoke, repositoryProtection, releaseHandoff: this.releaseHandoff(undefined, branch?.commit.sha) }); return; }
      const checksResponse = await this.fetchGithub(`https://api.github.com/repos/${this.repository}/commits/${pull.head.sha}/check-runs`, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'THSV-StreamBridge' }, signal: AbortSignal.timeout(5_000) });
      if (!checksResponse.ok) throw new Error(`GitHub check lookup returned ${String(checksResponse.status)}.`);
      const body = await checksResponse.json() as { check_runs?: CheckRecord[] };
      await this.storeLiveRemote({ checkedAt, pullRequest: { available: true, number: pull.number, title: pull.title, url: pull.html_url, branch: pull.head.ref, sha: pull.head.sha, ...promotionAttestation(pull.body) }, checks: (body.check_runs ?? []).map((item) => ({ name: item.name, status: item.status, conclusion: item.conclusion, url: item.details_url })), canaries, signingCertificatePreflight, githubApi: summarizeGithubApiStatus([...githubResponses, checksResponse], checkedAt), postReleaseSmoke, repositoryProtection, releaseHandoff: this.releaseHandoff(pull.head.sha, branch?.commit.sha) });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const backoffUntil = this.githubBackoffUntil > Date.now() ? new Date(this.githubBackoffUntil).toISOString() : undefined;
      if (this.remote === undefined) { this.remote = { checkedAt, error: message, checks: [], ...(backoffUntil === undefined ? {} : { githubApi: { backoffUntil } }) }; this.githubStatusSource = 'unavailable'; }
      else { this.remote = { ...this.remote, error: `Live GitHub refresh failed; showing the last successful result. ${message}`, liveRefreshFailed: true, ...(backoffUntil === undefined ? {} : { githubApi: { ...(isRecord(this.remote['githubApi']) ? this.remote['githubApi'] : {}), backoffUntil } }) }; this.githubStatusSource = 'cache'; }
      if (backoffUntil !== undefined) await this.persistRemoteCache().catch(() => undefined);
    }
  }

  private async fetchGithub(url: string, options: RequestInit): Promise<Response> {
    const cached = this.githubHttpCache.get(url);
    const headers = new Headers(options.headers);
    if (cached !== undefined) headers.set('if-none-match', cached.etag);
    const response = await this.fetcher(url, { ...options, headers });
    if (response.status === 304 && cached !== undefined) {
      const cachedHeaders = new Headers(response.headers); cachedHeaders.set('x-thsv-conditional-cache', 'hit'); cachedHeaders.set('etag', cached.etag);
      return new Response(JSON.stringify(cached.body), { status: 200, headers: cachedHeaders });
    }
    const rateLimited = response.status === 429 || (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0');
    if (rateLimited) {
      const retryAfter = Number(response.headers.get('retry-after')); const reset = Number(response.headers.get('x-ratelimit-reset')) * 1_000;
      const retryAt = Number.isFinite(retryAfter) && retryAfter >= 0 ? Date.now() + retryAfter * 1_000 : Number.isFinite(reset) && reset > Date.now() ? reset : Date.now() + 60_000;
      this.githubBackoffUntil = Math.max(this.githubBackoffUntil, retryAt);
      throw new Error(`GitHub API rate limit reached; refresh is paused until ${new Date(this.githubBackoffUntil).toISOString()}.`);
    }
    const etag = response.headers.get('etag');
    if (response.ok && etag !== null) {
      this.githubHttpCache.delete(url); this.githubHttpCache.set(url, { etag, body: await response.clone().json() });
      while (this.githubHttpCache.size > 32) { const oldest = this.githubHttpCache.keys().next().value; if (oldest === undefined) break; this.githubHttpCache.delete(oldest); }
    }
    return response;
  }

  private async loadRemoteCache(): Promise<void> {
    if (this.cacheLoaded) return;
    this.cacheLoaded = true;
    try {
      const value: unknown = JSON.parse(await readFile(this.remoteCachePath, 'utf8'));
      if (!isRecord(value) || (value['schemaVersion'] !== 1 && value['schemaVersion'] !== 2) || value['version'] !== this.version || !isRecord(value['remote'])) return;
      this.remote = value['remote'];
      if (value['schemaVersion'] === 2 && isRecord(value['httpCache'])) for (const [url, entry] of Object.entries(value['httpCache'])) if (isRecord(entry) && typeof entry['etag'] === 'string' && 'body' in entry) this.githubHttpCache.set(url, { etag: entry['etag'], body: entry['body'] });
      if (value['schemaVersion'] === 2 && typeof value['backoffUntil'] === 'string') { const parsed = Date.parse(value['backoffUntil']); if (Number.isFinite(parsed)) this.githubBackoffUntil = parsed; }
      this.githubStatusSource = 'cache';
    } catch { /* A first run or invalid cache simply starts without GitHub status. */ }
  }

  private async storeLiveRemote(value: Readonly<Record<string, unknown>>): Promise<void> {
    this.remote = value;
    this.githubStatusSource = 'live';
    await this.persistRemoteCache();
  }

  private async persistRemoteCache(): Promise<void> {
    if (this.remote === undefined) return;
    const temporary = `${this.remoteCachePath}.${randomUUID()}.tmp`;
    await mkdir(dirname(this.remoteCachePath), { recursive: true });
    await writeFile(temporary, `${JSON.stringify({ schemaVersion: 2, version: this.version, cachedAt: new Date().toISOString(), remote: this.remote, httpCache: Object.fromEntries(this.githubHttpCache), ...(this.githubBackoffUntil <= Date.now() ? {} : { backoffUntil: new Date(this.githubBackoffUntil).toISOString() }) }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, this.remoteCachePath);
  }

  private releaseHandoff(candidateSha: string | undefined, mainSha: string | undefined): Readonly<Record<string, unknown>> {
    const tag = `v${this.version}`;
    return {
      tag,
      candidateSha,
      expectedMainSha: mainSha,
      exactMainReady: candidateSha !== undefined && candidateSha === mainSha,
      tagWorkflowUrl: `https://github.com/${this.repository}/actions/workflows/prepare-release-tag.yml`,
      releaseWorkflowUrl: `https://github.com/${this.repository}/actions/workflows/release.yml`,
      compareUrl: `https://github.com/${this.repository}/compare/main...${candidateSha ?? 'main'}`,
      commitUrl: mainSha === undefined ? undefined : `https://github.com/${this.repository}/commit/${mainSha}`,
      releaseUrl: `https://github.com/${this.repository}/releases/tag/${tag}`,
      instructions: candidateSha === mainSha && mainSha !== undefined
        ? 'Copy the tag and exact main SHA into Prepare release tag, repeat the tag confirmation, then approve streambridge-tag.'
        : 'Merge the reviewed pull request, refresh this page, and continue only when the candidate SHA exactly matches main.',
    };
  }
}

const CANARY_DEFINITIONS = Object.freeze([
  { name: 'Public release attestation canary', workflow: 'public-attestation-canary.yml', schedule: 'daily', maximumAgeHours: 72 },
  { name: 'Dependency update canary', workflow: 'dependency-canary.yml', schedule: 'weekly Tuesday', maximumAgeHours: 240 },
  { name: 'Portable runtime cache canary', workflow: 'runtime-cache-canary.yml', schedule: 'weekly Wednesday', maximumAgeHours: 240 },
  { name: 'TypeScript and Node types next-major canary', workflow: 'toolchain-major-canary.yml', schedule: 'weekly Thursday', maximumAgeHours: 240 },
]);

function summarizeCanaries(runGroups: readonly (readonly WorkflowRunRecord[])[], errors: readonly (string | undefined)[], checkedAt: string): ReadonlyArray<Readonly<Record<string, unknown>>> {
  const checkedAtMs = Date.parse(checkedAt);
  return CANARY_DEFINITIONS.map((definition, index) => {
    const matching = [...(runGroups[index] ?? [])].filter((run) => run.name === definition.name).sort((left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at));
    const latest = matching[0]; const latestSuccess = matching.find((run) => run.conclusion === 'success');
    const lastSuccessAt = latestSuccess?.updated_at;
    const ageHours = lastSuccessAt === undefined ? undefined : Math.max(0, Math.round((checkedAtMs - Date.parse(lastSuccessAt)) / 3_600_000));
    return {
      name: definition.name, workflow: definition.workflow, schedule: definition.schedule, maximumAgeHours: definition.maximumAgeHours,
      latestConclusion: latest?.conclusion ?? latest?.status ?? 'missing', latestRunAt: latest?.updated_at,
      lastSuccessAt, ageHours, fresh: ageHours !== undefined && ageHours <= definition.maximumAgeHours,
      url: latest?.html_url,
      incident: summarizeCanaryIncident(matching, checkedAtMs),
      recentRuns: matching.slice(0, 5).map((run) => ({ id: run.id, conclusion: run.conclusion ?? run.status, startedAt: run.created_at, completedAt: run.updated_at, url: run.html_url })),
      ...(errors[index] === undefined ? {} : { queryError: errors[index] }),
    };
  });
}

const FAILURE_CONCLUSIONS = new Set(['action_required', 'cancelled', 'failure', 'startup_failure', 'timed_out']);

function summarizeCanaryIncident(runs: readonly WorkflowRunRecord[], checkedAtMs: number): Readonly<Record<string, unknown>> {
  const leadingFailures = runs.slice(0, runs.findIndex((run) => run.conclusion === 'success') < 0 ? runs.length : runs.findIndex((run) => run.conclusion === 'success')).filter((run) => run.conclusion !== null && FAILURE_CONCLUSIONS.has(run.conclusion));
  if (leadingFailures.length > 0) {
    const startedAt = leadingFailures.at(-1)?.created_at;
    return { state: 'active', failureCount: leadingFailures.length, startedAt, durationHours: durationHours(startedAt, checkedAtMs) };
  }
  for (let index = 0; index < runs.length; index += 1) {
    const recovery = runs[index]; if (recovery?.conclusion !== 'success') continue;
    const failures: WorkflowRunRecord[] = [];
    for (let older = index + 1; older < runs.length; older += 1) {
      const run = runs[older]; if (run === undefined || run.conclusion === 'success') break;
      if (run.conclusion !== null && FAILURE_CONCLUSIONS.has(run.conclusion)) failures.push(run);
    }
    if (failures.length > 0) {
      const startedAt = failures.at(-1)?.created_at;
      return { state: 'recovered', failureCount: failures.length, startedAt, recoveredAt: recovery.updated_at, durationHours: durationHours(startedAt, Date.parse(recovery.updated_at)) };
    }
  }
  return { state: 'none', failureCount: 0 };
}

function durationHours(startedAt: string | undefined, endedAtMs: number): number | undefined {
  const startedAtMs = startedAt === undefined ? Number.NaN : Date.parse(startedAt);
  return Number.isFinite(startedAtMs) && Number.isFinite(endedAtMs) ? Math.max(0, Math.round((endedAtMs - startedAtMs) / 3_600_000)) : undefined;
}

function summarizeGithubApiStatus(responses: readonly Response[], checkedAt: string): Readonly<Record<string, unknown>> {
  const numbered = (name: string): number[] => responses.flatMap((response) => { const raw = response.headers.get(name); if (raw === null) return []; const parsed = Number(raw); return Number.isFinite(parsed) ? [parsed] : []; });
  const limits = numbered('x-ratelimit-limit'); const remaining = numbered('x-ratelimit-remaining'); const used = numbered('x-ratelimit-used'); const resets = numbered('x-ratelimit-reset');
  const reset = resets.length === 0 ? undefined : Math.max(...resets);
  return {
    checkedAt,
    cacheAgeMinutes: 0,
    rateLimitAvailable: limits.length > 0 || remaining.length > 0,
    conditionalCacheHits: responses.filter((response) => response.headers.get('x-thsv-conditional-cache') === 'hit').length,
    ...(limits.length === 0 ? {} : { limit: Math.max(...limits) }),
    ...(remaining.length === 0 ? {} : { remaining: Math.min(...remaining) }),
    ...(used.length === 0 ? {} : { used: Math.max(...used) }),
    ...(reset === undefined ? {} : { resetAt: new Date(reset * 1_000).toISOString() }),
  };
}

function refreshGithubApiStatus(value: unknown, source: 'unavailable' | 'cache' | 'live'): Readonly<Record<string, unknown>> {
  if (!isRecord(value)) return { available: false, source, cacheAgeMinutes: undefined, rateLimitAvailable: false };
  const checkedAt = typeof value['checkedAt'] === 'string' ? value['checkedAt'] : undefined;
  const checkedAtMs = checkedAt === undefined ? Number.NaN : Date.parse(checkedAt);
  const cacheAgeMinutes = Number.isFinite(checkedAtMs) ? Math.max(0, Math.round((Date.now() - checkedAtMs) / 60_000)) : undefined;
  return { ...value, available: true, source, cacheAgeMinutes, stale: cacheAgeMinutes === undefined || cacheAgeMinutes > 60 };
}

function refreshCanaryAges(value: unknown): ReadonlyArray<Readonly<Record<string, unknown>>> {
  if (!Array.isArray(value)) return [];
  const now = Date.now();
  return value.filter(isRecord).map((item) => {
    const lastSuccessAt = typeof item['lastSuccessAt'] === 'string' ? item['lastSuccessAt'] : undefined;
    const maximumAgeHours = typeof item['maximumAgeHours'] === 'number' && Number.isFinite(item['maximumAgeHours']) ? item['maximumAgeHours'] : 0;
    const parsed = lastSuccessAt === undefined ? Number.NaN : Date.parse(lastSuccessAt);
    const ageHours = Number.isFinite(parsed) ? Math.max(0, Math.round((now - parsed) / 3_600_000)) : undefined;
    return { ...item, ageHours, fresh: ageHours !== undefined && ageHours <= maximumAgeHours };
  });
}

function summarizeSigningPreflight(run: WorkflowRunRecord | undefined, artifacts: readonly ArtifactRecord[], checkedAt: string, queryError?: string): Readonly<Record<string, unknown>> {
  if (run === undefined) return { available: false, fresh: false, message: queryError ?? 'The protected certificate preflight has not been run yet.' };
  const artifact = artifacts.find((item) => /^windows-signing-preflight-(?:current|warning|unsigned)-\d+-\d+$/u.test(item.name) && !item.expired);
  const match = /^windows-signing-preflight-(current|warning|unsigned)-(\d+)-(\d+)$/u.exec(artifact?.name ?? '');
  const ageHours = Math.max(0, Math.round((Date.parse(checkedAt) - Date.parse(run.updated_at)) / 3_600_000));
  const signingMode = match?.[1] === 'unsigned' ? 'unsigned' : match === null ? undefined : 'certificate';
  const expiryState = match?.[1] === 'unsigned' ? 'not-applicable' : match?.[1]; const daysRemaining = match === null || match[1] === 'unsigned' ? undefined : Number(match[2]);
  const evidenceAvailable = artifact !== undefined && match !== null && (signingMode === 'unsigned' || Number.isFinite(daysRemaining));
  return { available: true, runId: run.id, status: run.status, conclusion: run.conclusion, checkedAt: run.updated_at, ageHours, maximumAgeHours: 720, fresh: run.conclusion === 'success' && ageHours <= 720 && evidenceAvailable, evidenceAvailable, signingMode, expiryState, daysRemaining, artifactId: artifact?.id, artifactDigest: artifact?.digest, url: run.html_url, ...(evidenceAvailable ? signingMode === 'unsigned' ? { message: 'Windows signing is intentionally disabled. Checksums and GitHub attestations remain required.' } : {} : { message: 'The latest preflight run does not expose current signing-mode evidence.' }) };
}

function refreshSigningPreflight(value: unknown): Readonly<Record<string, unknown>> {
  if (!isRecord(value) || value['available'] !== true) return isRecord(value) ? value : { available: false, fresh: false };
  const checkedAt = typeof value['checkedAt'] === 'string' ? value['checkedAt'] : undefined;
  const parsed = checkedAt === undefined ? Number.NaN : Date.parse(checkedAt);
  const maximumAgeHours = typeof value['maximumAgeHours'] === 'number' ? value['maximumAgeHours'] : 720;
  const ageHours = Number.isFinite(parsed) ? Math.max(0, Math.round((Date.now() - parsed) / 3_600_000)) : undefined;
  return { ...value, ageHours, fresh: value['conclusion'] === 'success' && value['evidenceAvailable'] === true && ageHours !== undefined && ageHours <= maximumAgeHours };
}

function promotionAttestation(body: string | null | undefined): Readonly<Record<string, string>> {
  const url = /https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/attestations\/\d+/u.exec(body ?? '')?.[0];
  return url === undefined ? {} : { promotionAttestationUrl: url };
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
