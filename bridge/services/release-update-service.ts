import { compareVersions } from './addon-package-manager.js';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { verify, type Bundle } from 'sigstore';
import { uncompress } from 'snappyjs';

const DEFAULT_REPOSITORY = 'surakage/THSV-StreamBridge';
const REQUEST_TIMEOUT_MS = 10_000;
const MAXIMUM_ARCHIVE_BYTES = 268_435_456;
const MAXIMUM_CHECKSUM_BYTES = 1_024;
const MAXIMUM_ATTESTATION_BYTES = 2_097_152;
const VERSION_TAG = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?$/u;

interface GitHubReleaseAsset {
  readonly name?: unknown;
  readonly browser_download_url?: unknown;
  readonly size?: unknown;
}

interface GitHubRelease {
  readonly tag_name?: unknown;
  readonly name?: unknown;
  readonly html_url?: unknown;
  readonly body?: unknown;
  readonly draft?: unknown;
  readonly prerelease?: unknown;
  readonly published_at?: unknown;
  readonly assets?: unknown;
}

export interface ReleaseAssetSummary {
  readonly name: string;
  readonly url: string;
  readonly size: number;
}

export interface ReleaseUpdateStatus {
  readonly checkedAt: string;
  readonly currentVersion: string;
  readonly available: boolean;
  readonly updateAvailable: boolean;
  readonly latestVersion?: string;
  readonly releaseName?: string;
  readonly releaseUrl?: string;
  readonly publishedAt?: string;
  readonly releaseNotes?: string;
  readonly archive?: ReleaseAssetSummary;
  readonly checksum?: ReleaseAssetSummary;
  readonly sbom?: ReleaseAssetSummary;
  readonly error?: string;
}

export interface StagedReleaseUpdate {
  readonly version: string;
  readonly archiveName: string;
  readonly archivePath: string;
  readonly sha256: string;
  readonly provenance: 'verified';
  readonly repository: string;
  readonly workflow: string;
}

export interface ProvenanceVerification {
  readonly repository: string;
  readonly workflow: string;
}

export type ProvenanceVerifier = (artifact: Uint8Array, input: Readonly<{ version: string; archiveName: string; sha256: string }>) => Promise<ProvenanceVerification>;

export interface GitHubProvenanceOptions {
  readonly repository: string;
  readonly version: string;
  readonly archiveName: string;
  readonly sha256: string;
  readonly request?: typeof fetch;
  readonly userAgentVersion: string;
  readonly cacheRoot: string;
}

export class ReleaseUpdateService {
  public constructor(
    private readonly currentVersion: string,
    private readonly repository = DEFAULT_REPOSITORY,
    private readonly fetchRelease: typeof fetch = fetch,
    private readonly stagingRoot = resolve('data', 'updates'),
    private readonly provenanceVerifier: ProvenanceVerifier = (artifact, input) => verifyGitHubArtifactProvenance(artifact, {
      repository: this.repository,
      version: input.version,
      archiveName: input.archiveName,
      sha256: input.sha256,
      request: this.fetchRelease,
      userAgentVersion: this.currentVersion,
      cacheRoot: this.stagingRoot,
    }),
  ) {
    if (!VERSION_TAG.test(currentVersion)) throw new Error(`Current version is not valid SemVer: ${currentVersion}`);
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository)) throw new Error('GitHub repository must be owner/name.');
  }

  public async stage(input: unknown): Promise<StagedReleaseUpdate> {
    const request = stageRequest(input);
    const status = await this.check();
    if (!status.available) throw new Error(status.error ?? 'The official release could not be checked.');
    if (!status.updateAvailable || status.latestVersion === undefined) throw new Error('No newer stable StreamBridge release is available.');
    if (request.version !== status.latestVersion) throw new Error('The available release changed. Check for updates again before downloading.');
    if (status.archive === undefined || status.checksum === undefined) throw new Error('The official release is missing its archive or adjacent checksum.');

    const [artifact, checksumBytes] = await Promise.all([
      this.download(status.archive, MAXIMUM_ARCHIVE_BYTES),
      this.download(status.checksum, MAXIMUM_CHECKSUM_BYTES),
    ]);
    const publishedSha256 = parseChecksum(new TextDecoder('utf-8', { fatal: true }).decode(checksumBytes), status.archive.name);
    const actualSha256 = createHash('sha256').update(artifact).digest('hex');
    if (actualSha256 !== publishedSha256) throw new Error('The downloaded archive does not match the official SHA-256 checksum.');
    const provenance = await this.provenanceVerifier(artifact, { version: status.latestVersion, archiveName: status.archive.name, sha256: actualSha256 });

    await mkdir(this.stagingRoot, { recursive: true });
    const destination = join(this.stagingRoot, status.archive.name);
    const temporary = `${destination}.${randomUUID()}.tmp`;
    await writeFile(temporary, artifact, { flag: 'wx', mode: 0o600 });
    try {
      await rm(destination, { force: true });
      await rename(temporary, destination);
      await writeFile(`${destination}.sha256`, `${actualSha256}  ${status.archive.name}\n`, { mode: 0o600 });
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    }
    return {
      version: status.latestVersion,
      archiveName: status.archive.name,
      archivePath: resolve(destination),
      sha256: actualSha256,
      provenance: 'verified',
      repository: provenance.repository,
      workflow: provenance.workflow,
    };
  }

  public async check(): Promise<ReleaseUpdateStatus> {
    const checkedAt = new Date().toISOString();
    try {
      const response = await this.fetchRelease(`https://api.github.com/repos/${this.repository}/releases/latest`, {
        headers: { accept: 'application/vnd.github+json', 'user-agent': `THSV-StreamBridge/${this.currentVersion}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`GitHub release check returned HTTP ${String(response.status)}.`);
      const release = await response.json() as GitHubRelease;
      return this.parseRelease(release, checkedAt);
    } catch (error) {
      return { checkedAt, currentVersion: this.currentVersion, available: false, updateAvailable: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  private parseRelease(release: GitHubRelease, checkedAt: string): ReleaseUpdateStatus {
    if (release.draft === true || release.prerelease === true) throw new Error('The latest GitHub release is not a public stable release.');
    const tag = text(release.tag_name, 'release tag', 100);
    if (!VERSION_TAG.test(tag)) throw new Error('The latest GitHub release tag is not valid SemVer.');
    const latestVersion = tag.replace(/^v/u, '');
    const releaseUrl = trustedUrl(release.html_url, 'release page', (url) => url.hostname === 'github.com' && url.pathname.startsWith(`/${this.repository}/releases/tag/`));
    const assets = Array.isArray(release.assets) ? release.assets.map((asset) => parseAsset(asset, this.repository)) : [];
    // Accept only the exact core archive name. A broad prefix also matches add-on ZIPs and
    // could select the wrong executable package if GitHub changes asset ordering.
    const archiveNames = new Set([`THSV-StreamBridge-${latestVersion}.zip`, `THSV-StreamBridge-${latestVersion}-windows-x64.zip`]);
    const archiveMatches = assets.filter((asset) => archiveNames.has(asset.name));
    if (archiveMatches.length > 1) throw new Error('The latest GitHub release contains multiple core archives.');
    const archive = archiveMatches[0];
    const checksum = archive === undefined ? undefined : assets.find((asset) => asset.name === `${archive.name}.sha256`);
    const sbom = assets.find((asset) => /\.cdx\.json$/iu.test(asset.name));
    const publishedAt = optionalText(release.published_at, 100);
    const releaseNotes = optionalText(release.body, 20_000);
    const result: ReleaseUpdateStatus = {
      checkedAt,
      currentVersion: this.currentVersion,
      available: true,
      updateAvailable: compareVersions(this.currentVersion, latestVersion) < 0,
      latestVersion,
      releaseName: optionalText(release.name, 200) ?? tag,
      releaseUrl,
      ...(publishedAt === undefined ? {} : { publishedAt }),
      ...(releaseNotes === undefined ? {} : { releaseNotes }),
      ...(archive === undefined ? {} : { archive }),
      ...(checksum === undefined ? {} : { checksum }),
      ...(sbom === undefined ? {} : { sbom }),
    };
    return result;
  }

  private async download(asset: ReleaseAssetSummary, maximumBytes: number): Promise<Uint8Array> {
    if (asset.size > maximumBytes) throw new Error(`${asset.name} exceeds the update download safety limit.`);
    const response = await this.fetchRelease(asset.url, {
      headers: { accept: 'application/octet-stream', 'user-agent': `THSV-StreamBridge/${this.currentVersion}` },
      redirect: 'follow',
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Downloading ${asset.name} returned HTTP ${String(response.status)}.`);
    const declaredLength = Number(response.headers.get('content-length') ?? '0');
    if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) throw new Error(`${asset.name} exceeds the update download safety limit.`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > maximumBytes) throw new Error(`${asset.name} is empty or exceeds the update download safety limit.`);
    return bytes;
  }
}

export async function verifyGitHubArtifactProvenance(artifact: Uint8Array, options: GitHubProvenanceOptions): Promise<ProvenanceVerification> {
  const request = options.request ?? fetch;
  await mkdir(join(options.cacheRoot, '.sigstore-tuf'), { recursive: true });
  const response = await request(`https://api.github.com/repos/${options.repository}/attestations/sha256:${options.sha256}?predicate_type=provenance&per_page=20`, {
    headers: { accept: 'application/vnd.github+json', 'user-agent': `THSV-StreamBridge/${options.userAgentVersion}`, 'x-github-api-version': '2026-03-10' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`GitHub provenance lookup returned HTTP ${String(response.status)}.`);
  const listing = await response.json() as unknown;
  const entries = attestationEntries(listing);
  if (entries.length === 0) throw new Error('GitHub did not publish build provenance for this archive.');
  const workflow = `https://github.com/${options.repository}/.github/workflows/release.yml@refs/tags/v${options.version}`;
  let lastError: unknown;
  for (const entry of entries) {
    try {
      const bundleResponse = await request(entry, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (!bundleResponse.ok) throw new Error(`GitHub provenance bundle returned HTTP ${String(bundleResponse.status)}.`);
      const declaredLength = Number(bundleResponse.headers.get('content-length') ?? '0');
      if (Number.isFinite(declaredLength) && declaredLength > MAXIMUM_ATTESTATION_BYTES) throw new Error('The GitHub provenance bundle exceeds the safety limit.');
      const encoded = new Uint8Array(await bundleResponse.arrayBuffer());
      if (encoded.byteLength === 0 || encoded.byteLength > MAXIMUM_ATTESTATION_BYTES) throw new Error('The GitHub provenance bundle is empty or exceeds the safety limit.');
      const decoded = bundleResponse.headers.get('content-type')?.toLowerCase().startsWith('application/x-snappy') === true
        ? new Uint8Array(uncompress(encoded, MAXIMUM_ATTESTATION_BYTES))
        : encoded;
      const bundle = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decoded)) as Bundle;
      await verify(bundle, {
        certificateIssuer: 'https://token.actions.githubusercontent.com',
        certificateIdentityURI: `^${escapeRegExp(workflow)}$`,
        timeout: REQUEST_TIMEOUT_MS,
        tufCachePath: join(options.cacheRoot, '.sigstore-tuf'),
      });
      verifyStatement(bundle, options.archiveName, options.sha256, options.repository, options.version);
      return { repository: options.repository, workflow };
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`GitHub provenance verification failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

function stageRequest(value: unknown): { readonly version: string } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('A staged update request is required.');
  const input = value as Record<string, unknown>;
  if (input['approvedByCreator'] !== true) throw new Error('Downloading an update requires explicit creator approval.');
  return { version: normalizedVersion(text(input['version'], 'requested version', 100)) };
}

function normalizedVersion(value: string): string {
  if (!VERSION_TAG.test(value)) throw new Error('The requested update version is invalid.');
  return value.replace(/^v/u, '');
}

function parseChecksum(value: string, archiveName: string): string {
  const lines = value.replace(/^\uFEFF/u, '').trim().split(/\r?\n/u).filter(Boolean);
  if (lines.length !== 1) throw new Error('The official checksum file must contain exactly one entry.');
  const match = /^([a-fA-F0-9]{64})\s+\*?(.+)$/u.exec(lines[0] ?? '');
  if (match?.[1] === undefined || match[2] !== archiveName) throw new Error('The official checksum does not name the expected archive.');
  return match[1].toLowerCase();
}

function attestationEntries(value: unknown): readonly string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('GitHub returned an invalid provenance response.');
  const raw = (value as Record<string, unknown>)['attestations'];
  if (!Array.isArray(raw) || raw.length > 20) throw new Error('GitHub returned an invalid provenance list.');
  return raw.map((entry) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) throw new Error('GitHub returned an invalid provenance entry.');
    const url = new URL(text((entry as Record<string, unknown>)['bundle_url'], 'provenance bundle URL', 4_096));
    if (url.protocol !== 'https:' || url.username !== '' || url.password !== '') throw new Error('GitHub returned an untrusted provenance bundle URL.');
    return url.href;
  });
}

function verifyStatement(bundle: Bundle, archiveName: string, sha256: string, repository: string, version: string): void {
  const envelope = bundle.dsseEnvelope;
  if (envelope === undefined) throw new Error('The GitHub provenance bundle does not contain a DSSE statement.');
  const statement = JSON.parse(Buffer.from(envelope.payload, 'base64').toString('utf8')) as unknown;
  if (typeof statement !== 'object' || statement === null || Array.isArray(statement)) throw new Error('The GitHub provenance statement is invalid.');
  const record = statement as Record<string, unknown>;
  if (record['predicateType'] !== 'https://slsa.dev/provenance/v1') throw new Error('The GitHub provenance predicate is not SLSA v1.');
  const subjects = record['subject'];
  if (!Array.isArray(subjects) || !subjects.some((subject) => {
    if (typeof subject !== 'object' || subject === null || Array.isArray(subject)) return false;
    const item = subject as Record<string, unknown>;
    const digest = item['digest'];
    return item['name'] === archiveName && typeof digest === 'object' && digest !== null && !Array.isArray(digest) && (digest as Record<string, unknown>)['sha256'] === sha256;
  })) throw new Error('The GitHub provenance statement does not cover the downloaded archive.');
  const predicate = record['predicate'];
  const buildDefinition = typeof predicate === 'object' && predicate !== null && !Array.isArray(predicate) ? (predicate as Record<string, unknown>)['buildDefinition'] : undefined;
  const externalParameters = typeof buildDefinition === 'object' && buildDefinition !== null && !Array.isArray(buildDefinition) ? (buildDefinition as Record<string, unknown>)['externalParameters'] : undefined;
  const workflow = typeof externalParameters === 'object' && externalParameters !== null && !Array.isArray(externalParameters) ? (externalParameters as Record<string, unknown>)['workflow'] : undefined;
  if (typeof workflow !== 'object' || workflow === null || Array.isArray(workflow)) throw new Error('The GitHub provenance statement is missing its workflow identity.');
  const workflowRecord = workflow as Record<string, unknown>;
  if (workflowRecord['repository'] !== `https://github.com/${repository}` || workflowRecord['path'] !== '.github/workflows/release.yml' || workflowRecord['ref'] !== `refs/tags/v${version}`) {
    throw new Error('The GitHub provenance statement was not produced by the expected tagged release workflow.');
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function parseAsset(value: unknown, repository: string): ReleaseAssetSummary {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('GitHub returned an invalid release asset.');
  const asset = value as GitHubReleaseAsset;
  const name = text(asset.name, 'asset name', 250);
  const url = trustedUrl(asset.browser_download_url, 'asset URL', (parsed) => parsed.hostname === 'github.com' && parsed.pathname.startsWith(`/${repository}/releases/download/`));
  if (typeof asset.size !== 'number' || !Number.isSafeInteger(asset.size) || asset.size < 0 || asset.size > 1_073_741_824) throw new Error(`GitHub returned an invalid size for ${name}.`);
  return { name, url, size: asset.size };
}

function trustedUrl(value: unknown, label: string, predicate: (url: URL) => boolean): string {
  const raw = text(value, label, 2_048);
  const url = new URL(raw);
  if (url.protocol !== 'https:' || !predicate(url)) throw new Error(`GitHub returned an untrusted ${label}.`);
  return url.href;
}

function text(value: unknown, label: string, maximum: number): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximum) throw new Error(`GitHub returned an invalid ${label}.`);
  return value;
}

function optionalText(value: unknown, maximum: number): string | undefined {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum ? value : undefined;
}
