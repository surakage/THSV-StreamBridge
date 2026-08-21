import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

interface PullRecord { readonly number: number; readonly title: string; readonly html_url: string; readonly head: { readonly ref: string; readonly sha: string } }
interface CheckRecord { readonly name: string; readonly status: string; readonly conclusion: string | null; readonly details_url: string }
interface WorkflowRunRecord { readonly id: number; readonly name: string; readonly display_title: string; readonly head_branch: string | null; readonly html_url: string; readonly artifacts_url: string; readonly status: string; readonly conclusion: string | null; readonly created_at: string; readonly updated_at: string }
interface BranchRecord { readonly name: string; readonly protected: boolean; readonly commit: { readonly sha: string } }
interface RulesetRecord { readonly id: number; readonly name: string; readonly target: string; readonly enforcement: string; readonly _links?: { readonly html?: { readonly href?: string } } }

export class ReleaseReadinessService {
  private remote: Readonly<Record<string, unknown>> | undefined;
  private checkedAt = 0;
  private cacheLoaded = false;
  private githubStatusSource: 'unavailable' | 'cache' | 'live' = 'unavailable';

  public constructor(private readonly version: string, private readonly lifecycleEvidencePath: string, private readonly publishedEvidencePath: string, private readonly remoteCachePath: string, private readonly repository = 'surakage/THSV-StreamBridge', private readonly fetcher: typeof fetch = fetch) {}

  public async status(refresh = false): Promise<Readonly<Record<string, unknown>>> {
    await this.loadRemoteCache();
    const [lifecycle, localPublishedSmoke] = await Promise.all([this.readEvidence(this.lifecycleEvidencePath), this.readEvidence(this.publishedEvidencePath)]);
    if (refresh && (this.remote === undefined || Date.now() - this.checkedAt > 60_000)) await this.refreshRemote();
    const checks = Array.isArray(this.remote?.['checks']) ? this.remote['checks'] : [];
    const checksGreen = checks.length > 0 && checks.every((item) => isRecord(item) && item['conclusion'] === 'success');
    const lifecycleReady = lifecycle !== undefined && lifecycle['currentTag'] === `v${this.version}` && lifecycle['previousChecksumVerified'] === true && lifecycle['previousProvenanceVerified'] === true && lifecycle['creatorDataPreserved'] === true && lifecycle['encryptedRecoveryBundleVerified'] === true;
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
    return {
      version: this.version,
      localLifecycle: lifecycle ?? { available: false },
      pullRequest: this.remote?.['pullRequest'] ?? { available: false, message: 'Refresh GitHub status to inspect the open release-candidate PR.' },
      checks,
      postReleaseSmoke,
      repositoryProtection,
      releaseHandoff: this.remote?.['releaseHandoff'] ?? this.releaseHandoff(undefined, undefined),
      summary: { lifecycleReady, checksGreen, postReleaseVerified, repositoryProtectionsReady, readyForCreatorReview: lifecycleReady && checksGreen && repositoryProtectionsReady },
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
    const checkedAt = new Date().toISOString(); this.checkedAt = Date.now();
    try {
      const options = { headers: { accept: 'application/vnd.github+json', 'user-agent': 'THSV-StreamBridge', 'x-github-api-version': '2026-03-10' }, signal: AbortSignal.timeout(5_000) };
      const [pullsResponse, runsResponse, branchResponse, immutableResponse, rulesetsResponse] = await Promise.all([
        this.fetcher(`https://api.github.com/repos/${this.repository}/pulls?state=open&per_page=30`, options),
        this.fetcher(`https://api.github.com/repos/${this.repository}/actions/runs?per_page=100`, options),
        this.fetcher(`https://api.github.com/repos/${this.repository}/branches/main`, options),
        this.fetcher(`https://api.github.com/repos/${this.repository}/immutable-releases`, options),
        this.fetcher(`https://api.github.com/repos/${this.repository}/rulesets?targets=branch,tag`, options),
      ]);
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
      const tag = `v${this.version}`;
      const smokeRun = (runsBody.workflow_runs ?? []).find((item) => item.name === 'Post-release smoke' && (item.head_branch === tag || item.display_title.includes(tag)));
      const postReleaseSmoke = smokeRun === undefined
        ? { available: false, message: `No post-release smoke workflow run was found for ${tag}.` }
        : { available: true, source: 'github-actions', tag, runId: smokeRun.id, status: smokeRun.status, conclusion: smokeRun.conclusion, url: smokeRun.html_url, evidenceUrl: `${smokeRun.html_url}#artifacts`, artifactsApiUrl: smokeRun.artifacts_url, createdAt: smokeRun.created_at, updatedAt: smokeRun.updated_at };
      if (pull === undefined) { await this.storeLiveRemote({ checkedAt, pullRequest: { available: false, message: `No open ${this.version} pull request was found.` }, checks: [], postReleaseSmoke, repositoryProtection, releaseHandoff: this.releaseHandoff(undefined, branch?.commit.sha) }); return; }
      const checksResponse = await this.fetcher(`https://api.github.com/repos/${this.repository}/commits/${pull.head.sha}/check-runs`, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'THSV-StreamBridge' }, signal: AbortSignal.timeout(5_000) });
      if (!checksResponse.ok) throw new Error(`GitHub check lookup returned ${String(checksResponse.status)}.`);
      const body = await checksResponse.json() as { check_runs?: CheckRecord[] };
      await this.storeLiveRemote({ checkedAt, pullRequest: { available: true, number: pull.number, title: pull.title, url: pull.html_url, branch: pull.head.ref, sha: pull.head.sha }, checks: (body.check_runs ?? []).map((item) => ({ name: item.name, status: item.status, conclusion: item.conclusion, url: item.details_url })), postReleaseSmoke, repositoryProtection, releaseHandoff: this.releaseHandoff(pull.head.sha, branch?.commit.sha) });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (this.remote === undefined) { this.remote = { checkedAt, error: message, checks: [] }; this.githubStatusSource = 'unavailable'; }
      else { this.remote = { ...this.remote, error: `Live GitHub refresh failed; showing the last successful result. ${message}`, liveRefreshFailed: true }; this.githubStatusSource = 'cache'; }
    }
  }

  private async loadRemoteCache(): Promise<void> {
    if (this.cacheLoaded) return;
    this.cacheLoaded = true;
    try {
      const value: unknown = JSON.parse(await readFile(this.remoteCachePath, 'utf8'));
      if (!isRecord(value) || value['schemaVersion'] !== 1 || value['version'] !== this.version || !isRecord(value['remote'])) return;
      this.remote = value['remote'];
      this.githubStatusSource = 'cache';
    } catch { /* A first run or invalid cache simply starts without GitHub status. */ }
  }

  private async storeLiveRemote(value: Readonly<Record<string, unknown>>): Promise<void> {
    this.remote = value;
    this.githubStatusSource = 'live';
    const temporary = `${this.remoteCachePath}.${randomUUID()}.tmp`;
    await mkdir(dirname(this.remoteCachePath), { recursive: true });
    await writeFile(temporary, `${JSON.stringify({ schemaVersion: 1, version: this.version, cachedAt: new Date().toISOString(), remote: value }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
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

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
