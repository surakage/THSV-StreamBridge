// Update discovery that does not spend GitHub's REST API allowance.
//
// Anonymous api.github.com requests are limited to 60 an hour per network, shared with every
// other app on it, and update checks used to run out of it. github.com itself answers
// /releases/latest with a redirect to the newest stable release tag, and release assets are
// served from /releases/download/<tag>/<name>. Neither counts against the REST limit, so routine
// checks use them and the API stays a last resort. Verification is unchanged: downloads are
// still checked against the published SHA-256 and GitHub Actions provenance before use.

const REQUEST_TIMEOUT_MS = 10_000;
const ONE_HOUR_MS = 3_600_000;
const STABLE_TAG = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;

/** Thrown when GitHub's API allowance is used up; carries when it resets. */
export class GitHubRateLimitError extends Error {
  public constructor(public readonly resumeAt: number) {
    super(githubRateLimitMessage(resumeAt));
    this.name = 'GitHubRateLimitError';
  }
}

// One allowance per network, so one gate for every service in this process.
let apiBlockedUntil = 0;

/** When the API allowance resets, or undefined when API requests may be sent. */
export function githubApiBlockedUntil(now = Date.now()): number | undefined {
  return apiBlockedUntil > now ? apiBlockedUntil : undefined;
}

/** Test hook: forget a recorded rate limit. */
export function resetGitHubApiRateLimit(): void {
  apiBlockedUntil = 0;
}

export function githubRateLimitMessage(resumeAt: number): string {
  const when = new Date(resumeAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `GitHub's hourly limit for update checks was reached on this network. StreamBridge will not ask GitHub again until ${when}. Streaming is unaffected; you can also download the latest release from the GitHub releases page.`;
}

/** Reads GitHub's rate-limit headers. Returns the reset time when the response is a rate limit. */
export function rateLimitResumeAt(response: Response, now = Date.now()): number | undefined {
  const rateLimited = response.status === 429 || (response.status === 403 && (response.headers.get('x-ratelimit-remaining') === '0' || response.headers.has('retry-after')));
  if (!rateLimited) return undefined;
  const reset = Number(response.headers.get('x-ratelimit-reset')) * 1_000;
  const retryAfter = Number(response.headers.get('retry-after')) * 1_000;
  return reset > now ? reset : retryAfter > 0 ? now + retryAfter : now + ONE_HOUR_MS;
}

/**
 * Sends one GitHub REST API request. While a rate limit is in effect nothing is sent; a new
 * rate-limit response closes the gate until GitHub's reset time. Other failures are reported
 * as `<label> returned HTTP <status>.`
 */
export async function requestGitHubApi(request: typeof fetch, url: string, init: RequestInit, label: string): Promise<Response> {
  const blockedUntil = githubApiBlockedUntil();
  if (blockedUntil !== undefined) throw new GitHubRateLimitError(blockedUntil);
  const response = await request(url, init);
  if (response.ok) return response;
  const resumeAt = rateLimitResumeAt(response);
  if (resumeAt !== undefined) {
    apiBlockedUntil = Math.max(apiBlockedUntil, resumeAt);
    throw new GitHubRateLimitError(resumeAt);
  }
  throw new Error(`${label} returned HTTP ${String(response.status)}.`);
}

/** Records a rate limit seen on a request that did not go through requestGitHubApi. */
export function noteGitHubApiResponse(response: Response): void {
  const resumeAt = rateLimitResumeAt(response);
  if (resumeAt !== undefined) apiBlockedUntil = Math.max(apiBlockedUntil, resumeAt);
}

export function releaseTagUrl(repository: string, tag: string): string {
  return `https://github.com/${repository}/releases/tag/${encodeURIComponent(tag)}`;
}

export function releaseDownloadUrl(repository: string, tag: string, assetName: string): string {
  return `https://github.com/${repository}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(assetName)}`;
}

/**
 * Resolves the tag of the release GitHub marks as latest (never a draft or pre-release) from the
 * redirect of github.com/<repository>/releases/latest. Only stable vX.Y.Z tags are accepted.
 */
export async function resolveLatestReleaseTag(request: typeof fetch, repository: string, userAgent: string): Promise<string> {
  const response = await request(`https://github.com/${repository}/releases/latest`, {
    method: 'GET',
    headers: { accept: 'text/html', 'user-agent': userAgent },
    redirect: 'manual',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  await response.body?.cancel().catch(() => undefined);
  const target = response.status >= 300 && response.status < 400 ? response.headers.get('location') : (response.redirected ? response.url : null);
  if (target === null || target === '') throw new Error(`GitHub latest-release lookup returned HTTP ${String(response.status)}.`);
  const url = new URL(target, 'https://github.com');
  const prefix = `/${repository}/releases/tag/`.toLowerCase();
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || !url.pathname.toLowerCase().startsWith(prefix)) throw new Error('GitHub has no published stable release for this repository.');
  const tag = decodeURIComponent(url.pathname.slice(prefix.length));
  if (!STABLE_TAG.test(tag)) throw new Error('The latest GitHub release tag is not a stable SemVer version.');
  return tag;
}

/**
 * Fetches one release asset by its public download URL. Returns undefined when the release has
 * no asset of that name (HTTP 404).
 */
export async function fetchReleaseAsset(request: typeof fetch, url: string, maximumBytes: number, userAgent: string, label: string): Promise<Uint8Array | undefined> {
  const response = await request(url, {
    headers: { accept: 'application/octet-stream', 'user-agent': userAgent },
    redirect: 'follow',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status === 404) { await response.body?.cancel().catch(() => undefined); return undefined; }
  if (!response.ok) throw new Error(`${label} returned HTTP ${String(response.status)}.`);
  const declaredLength = Number(response.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) throw new Error(`${label} exceeds its safety limit.`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > maximumBytes) throw new Error(`${label} is empty or exceeds its safety limit.`);
  return bytes;
}

/**
 * Learns a release asset's size without downloading it: a one-byte range request answers with
 * Content-Range "bytes 0-0/<size>". Returns undefined when the asset does not exist.
 */
export async function probeReleaseAssetSize(request: typeof fetch, url: string, userAgent: string, label: string): Promise<number | undefined> {
  const response = await request(url, {
    headers: { accept: 'application/octet-stream', range: 'bytes=0-0', 'user-agent': userAgent },
    redirect: 'follow',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  await response.body?.cancel().catch(() => undefined);
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(`${label} returned HTTP ${String(response.status)}.`);
  const total = response.status === 206
    ? Number(/\/(\d+)$/u.exec(response.headers.get('content-range') ?? '')?.[1])
    : Number(response.headers.get('content-length'));
  if (!Number.isSafeInteger(total) || total < 1) throw new Error(`${label} did not report its size.`);
  return total;
}
