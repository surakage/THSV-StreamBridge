import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { unzipSync } from 'fflate';
import { compareVersions, type InstalledAddOnSummary } from './addon-package-manager.js';
import { STREAMBRIDGE_VERSION } from '../version.js';
import { verifyGitHubArtifactProvenance, type ProvenanceVerifier, type ProvenanceVerification } from './release-update-service.js';

const DEFAULT_REPOSITORY = 'surakage/THSV-StreamBridge';
const OFFICIAL_RELEASE_FEED = 'https://www.slothbloom.com/api/streambridge/releases/latest';
const INDEX_ASSET_NAME = 'THSV-StreamBridge-AddOns-index.json';
const MAXIMUM_INDEX_BYTES = 1_048_576;
const REQUEST_TIMEOUT_MS = 10_000;
const DOWNLOAD_TIMEOUT_MS = 30_000;
const MODULE_ID = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/u;
const UPDATE_CHECK_CACHE_MS = 21_600_000;

interface GitHubReleaseAsset { readonly name?: unknown; readonly browser_download_url?: unknown; readonly size?: unknown; }
const MAXIMUM_RELEASE_BUNDLE_BYTES = 268_435_456;
const MAXIMUM_RELEASE_BUNDLE_FILES = 100;
const MAXIMUM_RELEASE_BUNDLE_EXPANDED_BYTES = 32_000_000;
const MAXIMUM_INNER_ADDON_BYTES = 7_500_000;

interface GitHubRelease { readonly tag_name?: unknown; readonly html_url?: unknown; readonly draft?: unknown; readonly prerelease?: unknown; readonly assets?: unknown; }

interface AddOnIndexPackage {
  readonly moduleId: string;
  readonly name: string;
  readonly version: string;
  readonly publisherId?: string;
  readonly archiveName: string;
  readonly sha256: string;
  readonly minimumCoreVersion: string;
  readonly maximumTestedCoreVersion: string;
  readonly minimumBridgeVersion?: string;
  readonly maximumTestedBridgeVersion?: string;
  readonly revoked: boolean;
}

export type AddOnUpdateState = 'current' | 'update-available' | 'requires-newer-core' | 'publisher-mismatch' | 'revoked' | 'not-listed' | 'rejected';
export type AddOnCompatibility = 'compatible' | 'requires-newer-core' | 'newer-than-tested';

export interface AddOnUpdateItem {
  readonly moduleId: string;
  readonly name: string;
  readonly installedVersion: string;
  readonly state: AddOnUpdateState;
  readonly compatibility?: AddOnCompatibility;
  readonly latestVersion?: string;
  readonly publisherId?: string;
  readonly archiveName?: string;
  readonly downloadUrl?: string;
  readonly sha256?: string;
  readonly warning?: string;
}

export interface AddOnUpdateStatus {
  readonly checkedAt: string;
  readonly available: boolean;
  readonly releaseUrl?: string;
  readonly releaseVersion?: string;
  readonly indexAssetUrl?: string;
  readonly updateCount: number;
  readonly revokedCount: number;
  readonly addOns: readonly AddOnUpdateItem[];
  readonly error?: string;
  readonly discoverySource?: 'slothbloom' | 'github';
}

export interface VerifiedAddOnUpdatePackage {
  readonly moduleId: string;
  readonly version: string;
  readonly publisherId?: string;
  readonly filename: string;
  readonly archive: Uint8Array;
  readonly sha256: string;
  readonly outerArchiveName: string;
  readonly outerSha256: string;
  readonly provenance: 'verified';
  readonly repository: string;
  readonly workflow: string;
  readonly streamerBotImports: readonly VerifiedStreamerBotImport[];
}

export interface VerifiedStreamerBotImport {
  readonly filename: string;
  readonly archive: Uint8Array;
  readonly sha256: string;
}

export class AddOnUpdateService {
  private cachedStatus: { readonly key: string; readonly status: AddOnUpdateStatus } | undefined;

  public constructor(
    private readonly currentCoreVersion: string,
    private readonly repository = DEFAULT_REPOSITORY,
    private readonly request: typeof fetch = fetch,
    private readonly currentBridgeVersion: string = STREAMBRIDGE_VERSION,
    private readonly cacheRoot = resolve('data', 'updates'),
    private readonly provenanceVerifier: ProvenanceVerifier = (artifact, input) => verifyGitHubArtifactProvenance(artifact, {
      repository: this.repository,
      version: input.version,
      archiveName: input.archiveName,
      sha256: input.sha256,
      request: this.request,
      userAgentVersion: this.currentBridgeVersion,
      cacheRoot: this.cacheRoot,
    }),
  ) {
    compareVersions(currentCoreVersion, currentCoreVersion);
    compareVersions(currentBridgeVersion, currentBridgeVersion);
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository)) throw new Error('GitHub repository must be owner/name.');
  }

  /** Creates an equally strict updater for a creator-approved GitHub repository. */
  public forRepository(repository: string): AddOnUpdateService {
    return new AddOnUpdateService(
      this.currentCoreVersion,
      repository,
      this.request,
      this.currentBridgeVersion,
      this.cacheRoot,
    );
  }

  public async stage(installed: readonly InstalledAddOnSummary[], input: unknown): Promise<VerifiedAddOnUpdatePackage> {
    const request = stageRequest(input);
    const status = await this.check(installed, true);
    if (!status.available) throw new Error(status.error ?? 'The official add-on release could not be checked.');
    const update = status.addOns.find((entry) => entry.moduleId === request.moduleId);
    if (update?.state !== 'update-available' || update.latestVersion === undefined || update.downloadUrl === undefined || update.archiveName === undefined || update.sha256 === undefined) {
      throw new Error('No compatible official update is available for this installed add-on.');
    }
    if (request.version !== update.latestVersion) throw new Error('The available add-on release changed. Check for updates again before downloading.');
    if (status.releaseVersion === undefined) throw new Error('The official release does not declare a valid version tag.');

    const outerArchive = await this.download(update.downloadUrl, update.archiveName, MAXIMUM_RELEASE_BUNDLE_BYTES);
    const outerSha256 = digest(outerArchive);
    if (outerSha256 !== update.sha256) throw new Error('The downloaded add-on release bundle does not match the official add-on index SHA-256.');
    const provenance: ProvenanceVerification = await this.provenanceVerifier(outerArchive, {
      version: status.releaseVersion,
      archiveName: update.archiveName,
      sha256: outerSha256,
    });
    const inner = extractReleaseBundle(outerArchive);
    return {
      moduleId: update.moduleId,
      version: update.latestVersion,
      ...(update.publisherId === undefined ? {} : { publisherId: update.publisherId }),
      filename: inner.filename,
      archive: inner.archive,
      sha256: inner.sha256,
      outerArchiveName: update.archiveName,
      outerSha256,
      provenance: 'verified',
      repository: provenance.repository,
      workflow: provenance.workflow,
      streamerBotImports: inner.streamerBotImports,
    };
  }

  public async check(installed: readonly InstalledAddOnSummary[], force = false): Promise<AddOnUpdateStatus> {
    const cacheKey = installed.map((addOn) => `${addOn.moduleId}@${addOn.version}:${addOn.trust.publisherId ?? ''}`).sort().join('|');
    if (!force && this.cachedStatus?.key === cacheKey && Date.now() - Date.parse(this.cachedStatus.status.checkedAt) < UPDATE_CHECK_CACHE_MS) return this.cachedStatus.status;
    const checkedAt = new Date().toISOString();
    try {
      const discovered = await this.fetchLatestRelease();
      const release = discovered.release;
      if (release.draft === true || release.prerelease === true) throw new Error('The latest GitHub release is not a public stable release.');
      const releaseVersion = version(text(release.tag_name, 'release tag', 100).replace(/^v/u, ''), 'release version');
      const releaseUrl = trustedUrl(release.html_url, 'release page', (url) => url.hostname === 'github.com' && url.pathname.startsWith(`/${this.repository}/releases/`));
      const indexAsset = findIndexAsset(release.assets, this.repository);
      const indexResponse = await this.request(indexAsset.url, this.requestOptions());
      if (!indexResponse.ok) throw new Error(`GitHub add-on index returned HTTP ${String(indexResponse.status)}.`);
      const declaredLength = Number(indexResponse.headers.get('content-length') ?? '0');
      if (Number.isFinite(declaredLength) && declaredLength > MAXIMUM_INDEX_BYTES) throw new Error('The published add-on index exceeds the 1 MiB safety limit.');
      const encoded = new Uint8Array(await indexResponse.arrayBuffer());
      if (encoded.byteLength === 0 || encoded.byteLength > MAXIMUM_INDEX_BYTES) throw new Error('The published add-on index is empty or exceeds the 1 MiB safety limit.');
      const index = parseIndex(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(encoded)) as unknown, this.repository);
      const addOns = installed.map((addOn) => evaluateAddOn(
        addOn,
        index.packages,
        index.revoked,
        this.currentCoreVersion,
        this.currentBridgeVersion,
        (archiveName) => findPackageAssetUrl(release.assets, archiveName, this.repository),
      ));
      const result: AddOnUpdateStatus = {
        checkedAt,
        available: true,
        discoverySource: discovered.source,
        releaseUrl,
        releaseVersion,
        indexAssetUrl: indexAsset.url,
        updateCount: addOns.filter((addOn) => addOn.state === 'update-available').length,
        revokedCount: addOns.filter((addOn) => addOn.state === 'revoked').length,
        addOns,
      };
      this.cachedStatus = { key: cacheKey, status: result };
      return result;
    } catch (error) {
      const result: AddOnUpdateStatus = { checkedAt, available: false, updateCount: 0, revokedCount: 0, addOns: [], error: error instanceof Error ? error.message : String(error) };
      this.cachedStatus = { key: cacheKey, status: result };
      return result;
    }
  }

  private requestOptions(): RequestInit {
    return {
      headers: { accept: 'application/vnd.github+json', 'user-agent': `THSV-StreamBridge/${this.currentCoreVersion}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    };
  }

  private async fetchLatestRelease(): Promise<{ readonly release: GitHubRelease; readonly source: 'slothbloom' | 'github' }> {
    if (this.repository === DEFAULT_REPOSITORY) {
      try {
        const response = await this.request(OFFICIAL_RELEASE_FEED, this.requestOptions());
        if (response.ok) return { release: await response.json() as GitHubRelease, source: 'slothbloom' };
      } catch { /* Website discovery is optional; verified GitHub releases remain authoritative. */ }
    }
    const response = await this.request(`https://api.github.com/repos/${this.repository}/releases/latest`, this.requestOptions());
    if (!response.ok) throw new Error(`GitHub add-on update check returned HTTP ${String(response.status)}.`);
    return { release: await response.json() as GitHubRelease, source: 'github' };
  }

  private async download(url: string, name: string, maximumBytes: number): Promise<Uint8Array> {
    const response = await this.request(url, {
      headers: { accept: 'application/octet-stream', 'user-agent': `THSV-StreamBridge/${this.currentBridgeVersion}` },
      redirect: 'follow',
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Downloading ${name} returned HTTP ${String(response.status)}.`);
    const declaredLength = Number(response.headers.get('content-length') ?? '0');
    if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) throw new Error(`${name} exceeds the add-on update download safety limit.`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > maximumBytes) throw new Error(`${name} is empty or exceeds the add-on update download safety limit.`);
    return bytes;
  }
}

function stageRequest(value: unknown): { readonly moduleId: string; readonly version: string } {
  const input = record(value, 'staged add-on update request');
  if (input['approvedByCreator'] !== true) throw new Error('Downloading an add-on update requires explicit creator approval.');
  return {
    moduleId: moduleId(input['moduleId'], 'requested module ID'),
    version: version(input['version'], 'requested add-on version'),
  };
}

function extractReleaseBundle(outerArchive: Uint8Array): { readonly filename: string; readonly archive: Uint8Array; readonly sha256: string; readonly streamerBotImports: readonly VerifiedStreamerBotImport[] } {
  let files = 0;
  let expandedBytes = 0;
  const names = new Set<string>();
  const extracted = unzipSync(outerArchive, {
    filter: (file) => {
      const normalizedName = file.name.replaceAll('\\', '/');
      if (normalizedName.endsWith('/')) return false;
      if (!normalizedName || normalizedName.startsWith('/') || /^[A-Za-z]:/u.test(normalizedName) || !normalizedName.split('/').every((segment) => segment.length > 0 && segment !== '.' && segment !== '..')) {
        throw new Error(`Unsafe add-on release bundle path: ${file.name}`);
      }
      if (names.has(normalizedName)) throw new Error(`Duplicate add-on release bundle path: ${file.name}`);
      names.add(normalizedName);
      files += 1;
      expandedBytes += file.originalSize;
      if (files > MAXIMUM_RELEASE_BUNDLE_FILES || expandedBytes > MAXIMUM_RELEASE_BUNDLE_EXPANDED_BYTES) throw new Error('The add-on release bundle exceeds its extraction safety limits.');
      return true;
    },
  });
  const normalizedEntries = new Map(Object.entries(extracted).map(([name, bytes]) => [name.replaceAll('\\', '/'), bytes]));
  const packageNames = [...normalizedEntries.keys()].filter((name) => !name.includes('/') && name.toLowerCase().endsWith('.thsv-addon'));
  if (packageNames.length !== 1) throw new Error('The verified add-on release bundle must contain exactly one root .thsv-addon package.');
  const filename = packageNames[0];
  if (filename === undefined) throw new Error('The add-on release bundle does not contain an installable package.');
  const archive = normalizedEntries.get(filename);
  if (archive === undefined || archive.byteLength === 0 || archive.byteLength > MAXIMUM_INNER_ADDON_BYTES) throw new Error('The inner add-on package is empty or exceeds the package safety limit.');
  const checksumName = `${filename}.sha256`;
  const checksumBytes = normalizedEntries.get(checksumName);
  if (checksumBytes === undefined || checksumBytes.byteLength > 1_024) throw new Error(`The add-on release bundle must contain ${checksumName}.`);
  const publishedSha256 = parseInnerChecksum(new TextDecoder('utf-8', { fatal: true }).decode(checksumBytes), filename);
  const actualSha256 = digest(archive);
  if (actualSha256 !== publishedSha256) throw new Error('The inner add-on package does not match its adjacent SHA-256 checksum.');
  const streamerBotNames = [...normalizedEntries.keys()].filter((name) => /^Streamer\.bot\/[^/]+\.sb$/iu.test(name)).sort();
  if (streamerBotNames.length > 10) throw new Error('The add-on release bundle contains too many Streamer.bot imports.');
  const streamerBotImports = streamerBotNames.map((path) => {
    const importArchive = normalizedEntries.get(path);
    const importFilename = path.slice('Streamer.bot/'.length);
    if (importArchive === undefined || importArchive.byteLength === 0 || importArchive.byteLength > 2_500_000) throw new Error(`The Streamer.bot import ${importFilename} is empty or exceeds the safety limit.`);
    const checksum = normalizedEntries.get(`${path}.sha256`);
    if (checksum === undefined || checksum.byteLength > 1_024) throw new Error(`The Streamer.bot import ${importFilename} is missing its adjacent checksum.`);
    const importSha256 = digest(importArchive);
    if (parseInnerChecksum(new TextDecoder('utf-8', { fatal: true }).decode(checksum), importFilename) !== importSha256) throw new Error(`The Streamer.bot import ${importFilename} does not match its checksum.`);
    return { filename: importFilename, archive: importArchive, sha256: importSha256 };
  });
  return { filename, archive, sha256: actualSha256, streamerBotImports };
}

function parseInnerChecksum(value: string, filename: string): string {
  const lines = value.replace(/^\uFEFF/u, '').trim().split(/\r?\n/u).filter(Boolean);
  if (lines.length !== 1) throw new Error('The inner add-on checksum must contain exactly one entry.');
  const match = /^([a-fA-F0-9]{64})\s+\*?(.+)$/u.exec(lines[0] ?? '');
  if (match?.[1] === undefined || match[2] !== filename) throw new Error('The inner add-on checksum does not name the expected package.');
  return match[1].toLowerCase();
}

function digest(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function findIndexAsset(value: unknown, repository: string): { readonly url: string } {
  if (!Array.isArray(value)) throw new Error('GitHub returned an invalid release asset list.');
  const matches = value.filter((entry): entry is GitHubReleaseAsset => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return false;
    return (entry as Record<string, unknown>)['name'] === INDEX_ASSET_NAME;
  });
  if (matches.length !== 1) throw new Error(`The latest release must contain exactly one ${INDEX_ASSET_NAME} asset.`);
  const asset = matches[0];
  if (typeof asset?.size !== 'number' || !Number.isSafeInteger(asset.size) || asset.size < 1 || asset.size > MAXIMUM_INDEX_BYTES) throw new Error('GitHub returned an invalid add-on index size.');
  const url = trustedUrl(asset.browser_download_url, 'add-on index URL', (parsed) => parsed.hostname === 'github.com' && parsed.pathname.startsWith(`/${repository}/releases/download/`));
  return { url };
}

function findPackageAssetUrl(value: unknown, archiveName: string, repository: string): string {
  if (!Array.isArray(value)) throw new Error('GitHub returned an invalid release asset list.');
  const matches = value.filter((entry): entry is GitHubReleaseAsset => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return false;
    return (entry as Record<string, unknown>)['name'] === archiveName;
  });
  if (matches.length !== 1) throw new Error(`The latest release must contain exactly one ${archiveName} asset.`);
  const asset = matches[0];
  if (typeof asset?.size !== 'number' || !Number.isSafeInteger(asset.size) || asset.size < 1 || asset.size > 1_073_741_824) throw new Error(`GitHub returned an invalid size for ${archiveName}.`);
  return trustedUrl(asset.browser_download_url, 'add-on package URL', (url) => url.hostname === 'github.com' && url.pathname.startsWith(`/${repository}/releases/download/`));
}

function parseIndex(value: unknown, repository: string): { readonly packages: readonly AddOnIndexPackage[]; readonly revoked: ReadonlySet<string> } {
  const index = record(value, 'add-on index');
  if (index['schemaVersion'] !== 1 || index['product'] !== 'THSV StreamBridge Add-ons') throw new Error('The published add-on index uses an unsupported format.');
  trustedUrl(index['releaseUrl'], 'index release URL', (url) => url.hostname === 'github.com' && url.pathname.startsWith(`/${repository}/releases`));
  if (!Array.isArray(index['packages']) || index['packages'].length > 500) throw new Error('The published add-on package list is invalid.');
  if (!Array.isArray(index['revoked']) || index['revoked'].length > 500) throw new Error('The published add-on revocation list is invalid.');
  const revoked = new Set(index['revoked'].map((entry) => moduleId(entry, 'revoked module ID')));
  const seen = new Set<string>();
  const packages = index['packages'].map((entry) => {
    const item = record(entry, 'add-on package');
    const parsed: AddOnIndexPackage = {
      moduleId: moduleId(item['moduleId'], 'package module ID'),
      name: text(item['name'], 'package name', 200),
      version: version(item['version'], 'package version'),
      ...(item['publisherId'] === undefined || item['publisherId'] === '' ? {} : { publisherId: text(item['publisherId'], 'publisher ID', 100) }),
      archiveName: archiveName(item['archiveName']),
      sha256: sha256(item['sha256']),
      minimumCoreVersion: version(item['minimumCoreVersion'], 'minimum core version'),
      maximumTestedCoreVersion: version(item['maximumTestedCoreVersion'], 'maximum tested core version'),
      ...(item['minimumBridgeVersion'] === undefined ? {} : { minimumBridgeVersion: version(item['minimumBridgeVersion'], 'minimum bridge version') }),
      ...(item['maximumTestedBridgeVersion'] === undefined ? {} : { maximumTestedBridgeVersion: version(item['maximumTestedBridgeVersion'], 'maximum tested bridge version') }),
      revoked: item['revoked'] === true,
    };
    if (seen.has(parsed.moduleId)) throw new Error(`The published add-on index contains duplicate package ${parsed.moduleId}.`);
    seen.add(parsed.moduleId);
    return parsed;
  });
  return { packages, revoked };
}

function evaluateAddOn(
  installed: InstalledAddOnSummary,
  packages: readonly AddOnIndexPackage[],
  revoked: ReadonlySet<string>,
  coreVersion: string,
  bridgeVersion: string,
  packageUrl: (archiveName: string) => string,
): AddOnUpdateItem {
  const base = { moduleId: installed.moduleId, name: installed.name, installedVersion: installed.version };
  if (installed.health === 'rejected') return { ...base, state: 'rejected', warning: installed.error ?? 'The installed package failed local verification.' };
  const published = packages.find((entry) => entry.moduleId === installed.moduleId);
  if (revoked.has(installed.moduleId) || published?.revoked === true) return { ...base, state: 'revoked', ...(published === undefined ? {} : publishedFields(published)), warning: 'This add-on is revoked. Disable it and review the official release or security advisory before using it again.' };
  if (published === undefined) return { ...base, state: 'not-listed', warning: 'This installed add-on is not listed in the official THSV add-on index. No update or publisher claim was inferred.' };
  const installedPublisher = installed.trust.publisherId;
  if (installedPublisher !== published.publisherId) return { ...base, state: 'publisher-mismatch', ...publishedFields(published), warning: `Publisher mismatch: installed ${installedPublisher ?? 'not declared'}; index ${published.publisherId ?? 'not declared'}. No update should be installed.` };
  const requiresNewerCore = compareVersions(coreVersion, published.minimumCoreVersion) < 0;
  const coreNewerThanTested = compareVersions(coreVersion, published.maximumTestedCoreVersion) > 0;
  const requiresNewerBridge = published.minimumBridgeVersion !== undefined && compareVersions(bridgeVersion, published.minimumBridgeVersion) < 0;
  const bridgeNewerThanTested = published.maximumTestedBridgeVersion !== undefined && compareVersions(bridgeVersion, published.maximumTestedBridgeVersion) > 0;
  const compatibility: AddOnCompatibility = requiresNewerCore || requiresNewerBridge ? 'requires-newer-core' : (coreNewerThanTested || bridgeNewerThanTested ? 'newer-than-tested' : 'compatible');
  const newer = compareVersions(installed.version, published.version) < 0;
  const downloadUrl = packageUrl(published.archiveName);
  const requiredVersion = requiresNewerBridge ? published.minimumBridgeVersion : published.minimumCoreVersion;
  const testedVersion = bridgeNewerThanTested ? published.maximumTestedBridgeVersion : published.maximumTestedCoreVersion;
  if (newer && compatibility === 'requires-newer-core') return { ...base, state: 'requires-newer-core', compatibility, ...publishedFields(published), downloadUrl, warning: `Version ${published.version} requires StreamBridge ${requiredVersion} or newer.` };
  return { ...base, state: newer ? 'update-available' : 'current', compatibility, ...publishedFields(published), downloadUrl, ...(compatibility === 'newer-than-tested' ? { warning: `This add-on was tested through StreamBridge ${testedVersion}; your bridge is newer.` } : {}) };
}

function publishedFields(value: AddOnIndexPackage): Pick<AddOnUpdateItem, 'latestVersion' | 'publisherId' | 'archiveName' | 'sha256'> {
  return { latestVersion: value.version, ...(value.publisherId === undefined ? {} : { publisherId: value.publisherId }), archiveName: value.archiveName, sha256: value.sha256 };
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`The published ${label} is invalid.`);
  return value as Record<string, unknown>;
}

function trustedUrl(value: unknown, label: string, predicate: (url: URL) => boolean): string {
  const raw = text(value, label, 2_048);
  const url = new URL(raw);
  if (url.protocol !== 'https:' || !predicate(url)) throw new Error(`GitHub returned an untrusted ${label}.`);
  return url.href;
}

function text(value: unknown, label: string, maximum: number): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximum) throw new Error(`The published ${label} is invalid.`);
  return value;
}

function moduleId(value: unknown, label: string): string {
  const parsed = text(value, label, 200);
  if (!MODULE_ID.test(parsed)) throw new Error(`The published ${label} is invalid.`);
  return parsed;
}

function version(value: unknown, label: string): string {
  const parsed = text(value, label, 100);
  if (!VERSION.test(parsed)) throw new Error(`The published ${label} is invalid.`);
  return parsed;
}

function archiveName(value: unknown): string {
  const parsed = text(value, 'archive name', 250);
  if (!/^THSV-StreamBridge-AddOn-[A-Za-z0-9._-]+\.zip$/u.test(parsed)) throw new Error('The published archive name is invalid.');
  return parsed;
}

function sha256(value: unknown): string {
  const parsed = text(value, 'SHA-256', 64);
  if (!SHA256.test(parsed)) throw new Error('The published SHA-256 is invalid.');
  return parsed;
}
