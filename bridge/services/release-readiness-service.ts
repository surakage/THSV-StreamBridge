import { readFile } from 'node:fs/promises';

interface PullRecord { readonly number: number; readonly title: string; readonly html_url: string; readonly head: { readonly ref: string; readonly sha: string } }
interface CheckRecord { readonly name: string; readonly status: string; readonly conclusion: string | null; readonly details_url: string }
interface WorkflowRunRecord { readonly id: number; readonly name: string; readonly display_title: string; readonly head_branch: string | null; readonly html_url: string; readonly artifacts_url: string; readonly status: string; readonly conclusion: string | null; readonly created_at: string; readonly updated_at: string }

export class ReleaseReadinessService {
  private remote: Readonly<Record<string, unknown>> | undefined;
  private checkedAt = 0;

  public constructor(private readonly version: string, private readonly lifecycleEvidencePath: string, private readonly publishedEvidencePath: string, private readonly repository = 'surakage/THSV-StreamBridge', private readonly fetcher: typeof fetch = fetch) {}

  public async status(refresh = false): Promise<Readonly<Record<string, unknown>>> {
    const [lifecycle, localPublishedSmoke] = await Promise.all([this.readEvidence(this.lifecycleEvidencePath), this.readEvidence(this.publishedEvidencePath)]);
    if (refresh && (this.remote === undefined || Date.now() - this.checkedAt > 60_000)) await this.refreshRemote();
    const checks = Array.isArray(this.remote?.['checks']) ? this.remote['checks'] : [];
    const checksGreen = checks.length > 0 && checks.every((item) => isRecord(item) && item['conclusion'] === 'success');
    const lifecycleReady = lifecycle !== undefined && lifecycle['currentTag'] === `v${this.version}` && lifecycle['previousChecksumVerified'] === true && lifecycle['previousProvenanceVerified'] === true && lifecycle['creatorDataPreserved'] === true;
    const localSmokeMatches = localPublishedSmoke?.['tag'] === `v${this.version}`;
    const postReleaseSmoke = localSmokeMatches
      ? { available: true, source: 'local-evidence', evidenceAvailable: true, ...localPublishedSmoke }
      : this.remote?.['postReleaseSmoke'] ?? { available: false, message: `No post-release smoke result is available for v${this.version}.` };
    const postReleaseVerified = isRecord(postReleaseSmoke) && postReleaseSmoke['available'] === true && (
      (postReleaseSmoke['source'] === 'github-actions' && postReleaseSmoke['conclusion'] === 'success')
      || (postReleaseSmoke['source'] === 'local-evidence' && postReleaseSmoke['cleanInstall'] === this.version && postReleaseSmoke['rollbackProtectionVerified'] === true)
    );
    return {
      version: this.version,
      localLifecycle: lifecycle ?? { available: false },
      pullRequest: this.remote?.['pullRequest'] ?? { available: false, message: 'Refresh GitHub status to inspect the open release-candidate PR.' },
      checks,
      postReleaseSmoke,
      summary: { lifecycleReady, checksGreen, postReleaseVerified, readyForCreatorReview: lifecycleReady && checksGreen },
      remainingCreatorApprovals: ['Review and merge the pull request.', 'Approve creation of the version tag.', 'Approve the protected streambridge-release environment deployment that publishes the GitHub release and assets.'],
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
      const options = { headers: { accept: 'application/vnd.github+json', 'user-agent': 'THSV-StreamBridge' }, signal: AbortSignal.timeout(5_000) };
      const [pullsResponse, runsResponse] = await Promise.all([
        this.fetcher(`https://api.github.com/repos/${this.repository}/pulls?state=open&per_page=30`, options),
        this.fetcher(`https://api.github.com/repos/${this.repository}/actions/runs?per_page=100`, options),
      ]);
      if (!pullsResponse.ok) throw new Error(`GitHub pull-request lookup returned ${String(pullsResponse.status)}.`);
      if (!runsResponse.ok) throw new Error(`GitHub workflow-run lookup returned ${String(runsResponse.status)}.`);
      const pulls = await pullsResponse.json() as PullRecord[];
      const pull = pulls.find((item) => item.title.includes(this.version)) ?? pulls.find((item) => item.head.ref.includes(`release-${this.version}`));
      const runsBody = await runsResponse.json() as { readonly workflow_runs?: WorkflowRunRecord[] };
      const tag = `v${this.version}`;
      const smokeRun = (runsBody.workflow_runs ?? []).find((item) => item.name === 'Post-release smoke' && (item.head_branch === tag || item.display_title.includes(tag)));
      const postReleaseSmoke = smokeRun === undefined
        ? { available: false, message: `No post-release smoke workflow run was found for ${tag}.` }
        : { available: true, source: 'github-actions', tag, runId: smokeRun.id, status: smokeRun.status, conclusion: smokeRun.conclusion, url: smokeRun.html_url, evidenceUrl: `${smokeRun.html_url}#artifacts`, artifactsApiUrl: smokeRun.artifacts_url, createdAt: smokeRun.created_at, updatedAt: smokeRun.updated_at };
      if (pull === undefined) { this.remote = { checkedAt, pullRequest: { available: false, message: `No open ${this.version} pull request was found.` }, checks: [], postReleaseSmoke }; return; }
      const checksResponse = await this.fetcher(`https://api.github.com/repos/${this.repository}/commits/${pull.head.sha}/check-runs`, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'THSV-StreamBridge' }, signal: AbortSignal.timeout(5_000) });
      if (!checksResponse.ok) throw new Error(`GitHub check lookup returned ${String(checksResponse.status)}.`);
      const body = await checksResponse.json() as { check_runs?: CheckRecord[] };
      this.remote = { checkedAt, pullRequest: { available: true, number: pull.number, title: pull.title, url: pull.html_url, branch: pull.head.ref }, checks: (body.check_runs ?? []).map((item) => ({ name: item.name, status: item.status, conclusion: item.conclusion, url: item.details_url })), postReleaseSmoke };
    } catch (error) { this.remote = { checkedAt, error: error instanceof Error ? error.message : String(error), checks: [] }; }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
