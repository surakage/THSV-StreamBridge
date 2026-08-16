import { compareVersions } from './addon-package-manager.js';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { unzipSync } from 'fflate';
import { verify, type Bundle } from 'sigstore';
import { uncompress } from 'snappyjs';

const DEFAULT_REPOSITORY = 'surakage/THSV-StreamBridge';
const OFFICIAL_RELEASE_FEED = 'https://www.slothbloom.com/api/streambridge/releases/latest';
const REQUEST_TIMEOUT_MS = 10_000;
const MAXIMUM_ARCHIVE_BYTES = 268_435_456;
const MAXIMUM_CHECKSUM_BYTES = 1_024;
const MAXIMUM_ATTESTATION_BYTES = 2_097_152;
const MAXIMUM_RELEASE_FILES = 20_000;
const MAXIMUM_RELEASE_EXPANDED_BYTES = 536_870_912;
const STAGED_RELEASE_RECORD = 'staged-release.json';
const UPDATE_CHECK_CACHE_MS = 21_600_000;
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
  readonly discoverySource?: 'slothbloom' | 'github';
}

export interface StagedReleaseUpdate {
  readonly version: string;
  readonly archiveName: string;
  readonly archivePath: string;
  readonly sha256: string;
  readonly provenance: 'verified';
  readonly repository: string;
  readonly workflow: string;
  readonly applyReady: true;
}

export interface AppliedReleaseUpdate {
  readonly accepted: true;
  readonly version: string;
  readonly installRoot: string;
  readonly message: string;
}

export type UpdateProcessLauncher = (executable: string, argumentsValue: readonly string[], workingDirectory: string) => number | undefined;

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
  private cachedStatus: ReleaseUpdateStatus | undefined;

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
    private readonly launchUpdate: UpdateProcessLauncher = launchDetachedUpdate,
  ) {
    if (!VERSION_TAG.test(currentVersion)) throw new Error(`Current version is not valid SemVer: ${currentVersion}`);
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository)) throw new Error('GitHub repository must be owner/name.');
  }

  public async stage(input: unknown): Promise<StagedReleaseUpdate> {
    const request = stageRequest(input);
    const status = await this.check(true);
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
    const preparedPath = await this.prepareRelease(artifact, status.latestVersion, actualSha256);
    const staged: StagedReleaseUpdate = {
      version: status.latestVersion,
      archiveName: status.archive.name,
      archivePath: resolve(destination),
      sha256: actualSha256,
      provenance: 'verified',
      repository: provenance.repository,
      workflow: provenance.workflow,
      applyReady: true,
    };
    await writeFile(join(this.stagingRoot, STAGED_RELEASE_RECORD), `${JSON.stringify({ ...staged, preparedPath }, null, 2)}\n`, { mode: 0o600 });
    return staged;
  }

  public async apply(input: unknown): Promise<AppliedReleaseUpdate> {
    const request = applyRequest(input);
    const staged = JSON.parse(await readFile(join(this.stagingRoot, STAGED_RELEASE_RECORD), 'utf8')) as Record<string, unknown>;
    if (staged['version'] !== request.version || staged['provenance'] !== 'verified' || staged['applyReady'] !== true) throw new Error('The verified staged update does not match this request. Download and verify it again.');
    const archiveName = text(staged['archiveName'], 'staged archive name', 250);
    const sha256 = sha256Text(staged['sha256']);
    const archivePath = resolve(this.stagingRoot, archiveName);
    if (createHash('sha256').update(await readFile(archivePath)).digest('hex') !== sha256) throw new Error('The staged release archive changed after verification. Download it again.');
    const preparedRoot = resolve(this.stagingRoot, `prepared-${request.version}`);
    const installRoot = resolve(this.stagingRoot, '..', '..');
    const installedRecord = JSON.parse(await readFile(join(installRoot, 'data', 'runtime', 'install-manifest.json'), 'utf8')) as Record<string, unknown>;
    const recordedInstallRoot = typeof installedRecord['installRoot'] === 'string' ? resolve(installedRecord['installRoot']) : '';
    if (installedRecord['product'] !== 'THSV StreamBridge' || installedRecord['layoutVersion'] !== 2 || installedRecord['activeVersion'] !== this.currentVersion || recordedInstallRoot !== installRoot) {
      throw new Error('One-click update is available only from a managed THSV StreamBridge installation. Source checkouts must use the release installer directly.');
    }
    const executable = join(preparedRoot, 'runtime', 'node.exe');
    const applyScript = join(preparedRoot, 'installer', 'apply-update.mjs');
    await assertRegularFile(executable, 'prepared Node.js runtime');
    await assertRegularFile(applyScript, 'prepared update helper');
    const pid = this.launchUpdate(executable, [applyScript, '--install-root', installRoot], preparedRoot);
    if (pid === undefined) throw new Error('Windows did not start the verified update helper. The current installation was not changed.');
    return { accepted: true, version: request.version, installRoot, message: 'The verified updater started. StreamBridge will stop, install with rollback protection, restart, and reopen the wizard.' };
  }

  private async prepareRelease(artifact: Uint8Array, version: string, sha256: string): Promise<string> {
    const names = new Set<string>();
    let files = 0;
    let expandedBytes = 0;
    const extracted = unzipSync(artifact, { filter: (file) => {
      if (file.name.replaceAll('\\', '/').endsWith('/')) {
        normalizedArchivePath(file.name.replaceAll('\\', '/').slice(0, -1));
        return false;
      }
      const name = normalizedArchivePath(file.name);
      if (names.has(name)) throw new Error(`Duplicate release archive path: ${file.name}`);
      names.add(name);
      files += 1;
      expandedBytes += file.originalSize;
      if (files > MAXIMUM_RELEASE_FILES || expandedBytes > MAXIMUM_RELEASE_EXPANDED_BYTES) throw new Error('The release archive exceeds its safe extraction limits.');
      return true;
    } });
    const normalized = new Map(Object.entries(extracted).map(([name, bytes]) => [normalizedArchivePath(name), bytes]));
    for (const required of ['release-manifest.json', 'runtime/node.exe', 'installer/install.mjs', 'installer/apply-update.mjs']) if (!normalized.has(required)) throw new Error(`The verified release archive is missing ${required}.`);
    const manifestBytes = normalized.get('release-manifest.json');
    if (manifestBytes === undefined) throw new Error('The verified release archive is missing release-manifest.json.');
    const manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(manifestBytes)) as Record<string, unknown>;
    if (manifest['product'] !== 'THSV StreamBridge' || manifest['layoutVersion'] !== 2 || manifest['version'] !== version) throw new Error('The verified archive release identity does not match the published update.');
    const destination = resolve(this.stagingRoot, `prepared-${version}`);
    const temporary = resolve(this.stagingRoot, `.prepared-${version}-${randomUUID()}`);
    await mkdir(temporary, { recursive: true, mode: 0o700 });
    try {
      for (const [name, bytes] of normalized) {
        const path = resolve(temporary, ...name.split('/'));
        if (path !== temporary && !path.startsWith(`${temporary}\\`) && !path.startsWith(`${temporary}/`)) throw new Error(`Unsafe release archive path: ${name}`);
        await mkdir(dirname(path), { recursive: true, mode: 0o700 });
        await writeFile(path, bytes, { mode: 0o600 });
      }
      await writeFile(join(temporary, '.verified-update.json'), `${JSON.stringify({ version, sha256, preparedAt: new Date().toISOString() })}\n`, { mode: 0o600 });
      await rm(destination, { recursive: true, force: true });
      await rename(temporary, destination);
      return destination;
    } catch (error) {
      await rm(temporary, { recursive: true, force: true }).catch(() => undefined);
      throw error;
    }
  }

  public async check(force = false): Promise<ReleaseUpdateStatus> {
    if (!force && this.cachedStatus !== undefined && Date.now() - Date.parse(this.cachedStatus.checkedAt) < UPDATE_CHECK_CACHE_MS) return this.cachedStatus;
    const checkedAt = new Date().toISOString();
    try {
      const discovered = await this.fetchLatestRelease();
      const result = this.parseRelease(discovered.release, checkedAt, discovered.source);
      this.cachedStatus = result;
      return result;
    } catch (error) {
      const result: ReleaseUpdateStatus = { checkedAt, currentVersion: this.currentVersion, available: false, updateAvailable: false, error: error instanceof Error ? error.message : String(error) };
      this.cachedStatus = result;
      return result;
    }
  }

  private async fetchLatestRelease(): Promise<{ readonly release: GitHubRelease; readonly source: 'slothbloom' | 'github' }> {
    if (this.repository === DEFAULT_REPOSITORY) {
      try {
        const response = await this.fetchRelease(OFFICIAL_RELEASE_FEED, this.releaseRequestOptions());
        if (response.ok) return { release: await response.json() as GitHubRelease, source: 'slothbloom' };
      } catch { /* The official website is a discovery convenience; GitHub remains the fallback authority. */ }
    }
    const response = await this.fetchRelease(`https://api.github.com/repos/${this.repository}/releases/latest`, this.releaseRequestOptions());
    if (!response.ok) throw new Error(`GitHub release check returned HTTP ${String(response.status)}.`);
    return { release: await response.json() as GitHubRelease, source: 'github' };
  }

  private releaseRequestOptions(): RequestInit {
    return {
      headers: { accept: 'application/vnd.github+json', 'user-agent': `THSV-StreamBridge/${this.currentVersion}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    };
  }

  private parseRelease(release: GitHubRelease, checkedAt: string, discoverySource: 'slothbloom' | 'github'): ReleaseUpdateStatus {
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
      discoverySource,
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

function applyRequest(value: unknown): { readonly version: string } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('An update installation request is required.');
  const input = value as Record<string, unknown>;
  if (input['approvedByCreator'] !== true) throw new Error('Installing an update requires explicit creator approval.');
  return { version: normalizedVersion(text(input['version'], 'requested version', 100)) };
}

function normalizedArchivePath(value: string): string {
  const normalized = value.replaceAll('\\', '/');
  if (!normalized || normalized.startsWith('/') || /^[A-Za-z]:/u.test(normalized) || !normalized.split('/').every((segment) => segment.length > 0 && segment !== '.' && segment !== '..')) throw new Error(`Unsafe release archive path: ${value}`);
  return normalized;
}

function sha256Text(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value)) throw new Error('The staged release checksum is invalid.');
  return value;
}

async function assertRegularFile(path: string, label: string): Promise<void> {
  const information = await lstat(path).catch(() => undefined);
  if (information === undefined || !information.isFile() || information.isSymbolicLink()) throw new Error(`The ${label} is unavailable. Download and verify the update again.`);
}

function launchDetachedUpdate(executable: string, argumentsValue: readonly string[], workingDirectory: string): number | undefined {
  const child = spawn(executable, [...argumentsValue], { cwd: workingDirectory, detached: true, windowsHide: true, stdio: 'ignore' });
  child.unref();
  return child.pid;
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
