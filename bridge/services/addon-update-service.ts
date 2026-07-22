import { compareVersions, type InstalledAddOnSummary } from './addon-package-manager.js';

const DEFAULT_REPOSITORY = 'surakage/THSV-StreamBridge';
const INDEX_ASSET_NAME = 'THSV-StreamBridge-AddOns-index.json';
const MAXIMUM_INDEX_BYTES = 1_048_576;
const REQUEST_TIMEOUT_MS = 10_000;
const MODULE_ID = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/u;

interface GitHubReleaseAsset { readonly name?: unknown; readonly browser_download_url?: unknown; readonly size?: unknown; }
interface GitHubRelease { readonly html_url?: unknown; readonly draft?: unknown; readonly prerelease?: unknown; readonly assets?: unknown; }

interface AddOnIndexPackage {
  readonly moduleId: string;
  readonly name: string;
  readonly version: string;
  readonly publisherId?: string;
  readonly archiveName: string;
  readonly sha256: string;
  readonly minimumCoreVersion: string;
  readonly maximumTestedCoreVersion: string;
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
  readonly sha256?: string;
  readonly warning?: string;
}

export interface AddOnUpdateStatus {
  readonly checkedAt: string;
  readonly available: boolean;
  readonly releaseUrl?: string;
  readonly indexAssetUrl?: string;
  readonly updateCount: number;
  readonly revokedCount: number;
  readonly addOns: readonly AddOnUpdateItem[];
  readonly error?: string;
}

export class AddOnUpdateService {
  public constructor(
    private readonly currentCoreVersion: string,
    private readonly repository = DEFAULT_REPOSITORY,
    private readonly request: typeof fetch = fetch,
  ) {
    compareVersions(currentCoreVersion, currentCoreVersion);
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository)) throw new Error('GitHub repository must be owner/name.');
  }

  public async check(installed: readonly InstalledAddOnSummary[]): Promise<AddOnUpdateStatus> {
    const checkedAt = new Date().toISOString();
    try {
      const releaseResponse = await this.request(`https://api.github.com/repos/${this.repository}/releases/latest`, this.requestOptions());
      if (!releaseResponse.ok) throw new Error(`GitHub add-on update check returned HTTP ${String(releaseResponse.status)}.`);
      const release = await releaseResponse.json() as GitHubRelease;
      if (release.draft === true || release.prerelease === true) throw new Error('The latest GitHub release is not a public stable release.');
      const releaseUrl = trustedUrl(release.html_url, 'release page', (url) => url.hostname === 'github.com' && url.pathname.startsWith(`/${this.repository}/releases/`));
      const indexAsset = findIndexAsset(release.assets, this.repository);
      const indexResponse = await this.request(indexAsset.url, this.requestOptions());
      if (!indexResponse.ok) throw new Error(`GitHub add-on index returned HTTP ${String(indexResponse.status)}.`);
      const declaredLength = Number(indexResponse.headers.get('content-length') ?? '0');
      if (Number.isFinite(declaredLength) && declaredLength > MAXIMUM_INDEX_BYTES) throw new Error('The published add-on index exceeds the 1 MiB safety limit.');
      const encoded = new Uint8Array(await indexResponse.arrayBuffer());
      if (encoded.byteLength === 0 || encoded.byteLength > MAXIMUM_INDEX_BYTES) throw new Error('The published add-on index is empty or exceeds the 1 MiB safety limit.');
      const index = parseIndex(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(encoded)) as unknown, this.repository);
      const addOns = installed.map((addOn) => evaluateAddOn(addOn, index.packages, index.revoked, this.currentCoreVersion));
      return {
        checkedAt,
        available: true,
        releaseUrl,
        indexAssetUrl: indexAsset.url,
        updateCount: addOns.filter((addOn) => addOn.state === 'update-available').length,
        revokedCount: addOns.filter((addOn) => addOn.state === 'revoked').length,
        addOns,
      };
    } catch (error) {
      return { checkedAt, available: false, updateCount: 0, revokedCount: 0, addOns: [], error: error instanceof Error ? error.message : String(error) };
    }
  }

  private requestOptions(): RequestInit {
    return {
      headers: { accept: 'application/vnd.github+json', 'user-agent': `THSV-StreamBridge/${this.currentCoreVersion}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    };
  }
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
      revoked: item['revoked'] === true,
    };
    if (seen.has(parsed.moduleId)) throw new Error(`The published add-on index contains duplicate package ${parsed.moduleId}.`);
    seen.add(parsed.moduleId);
    return parsed;
  });
  return { packages, revoked };
}

function evaluateAddOn(installed: InstalledAddOnSummary, packages: readonly AddOnIndexPackage[], revoked: ReadonlySet<string>, coreVersion: string): AddOnUpdateItem {
  const base = { moduleId: installed.moduleId, name: installed.name, installedVersion: installed.version };
  if (installed.health === 'rejected') return { ...base, state: 'rejected', warning: installed.error ?? 'The installed package failed local verification.' };
  const published = packages.find((entry) => entry.moduleId === installed.moduleId);
  if (revoked.has(installed.moduleId) || published?.revoked === true) return { ...base, state: 'revoked', ...(published === undefined ? {} : publishedFields(published)), warning: 'This add-on is revoked. Disable it and review the official release or security advisory before using it again.' };
  if (published === undefined) return { ...base, state: 'not-listed', warning: 'This installed add-on is not listed in the official THSV add-on index. No update or publisher claim was inferred.' };
  const installedPublisher = installed.trust.publisherId;
  if (installedPublisher !== published.publisherId) return { ...base, state: 'publisher-mismatch', ...publishedFields(published), warning: `Publisher mismatch: installed ${installedPublisher ?? 'not declared'}; index ${published.publisherId ?? 'not declared'}. No update should be installed.` };
  const compatibility: AddOnCompatibility = compareVersions(coreVersion, published.minimumCoreVersion) < 0 ? 'requires-newer-core' : (compareVersions(coreVersion, published.maximumTestedCoreVersion) > 0 ? 'newer-than-tested' : 'compatible');
  const newer = compareVersions(installed.version, published.version) < 0;
  if (newer && compatibility === 'requires-newer-core') return { ...base, state: 'requires-newer-core', compatibility, ...publishedFields(published), warning: `Version ${published.version} requires StreamBridge ${published.minimumCoreVersion} or newer.` };
  return { ...base, state: newer ? 'update-available' : 'current', compatibility, ...publishedFields(published), ...(compatibility === 'newer-than-tested' ? { warning: `This add-on was tested through StreamBridge ${published.maximumTestedCoreVersion}; your core is newer.` } : {}) };
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
