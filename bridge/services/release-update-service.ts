import { compareVersions } from './addon-package-manager.js';

const DEFAULT_REPOSITORY = 'surakage/THSV-StreamBridge';
const REQUEST_TIMEOUT_MS = 10_000;
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

export class ReleaseUpdateService {
  public constructor(
    private readonly currentVersion: string,
    private readonly repository = DEFAULT_REPOSITORY,
    private readonly fetchRelease: typeof fetch = fetch,
  ) {
    if (!VERSION_TAG.test(currentVersion)) throw new Error(`Current version is not valid SemVer: ${currentVersion}`);
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository)) throw new Error('GitHub repository must be owner/name.');
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
    // Matches both the current archive name (THSV-StreamBridge-<version>.zip) and the
    // pre-rc.4 name that carried a -windows-x64 suffix.
    const archive = assets.find((asset) => /^THSV-StreamBridge-.+\.zip$/iu.test(asset.name));
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
