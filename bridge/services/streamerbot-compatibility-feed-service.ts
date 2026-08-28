import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { verify } from 'sigstore';
import type { Logger } from './logger.js';
import { installVerifiedStreamerBotTriggerVersions } from '../contracts/streamerbot-trigger-contract-registry.js';

const REPOSITORY = 'surakage/THSV-StreamBridge';
const API = `https://api.github.com/repos/${REPOSITORY}`;
const ASSET = 'THSV-StreamBridge-StreamerBot-Compatibility.json';
const MAXIMUM_BYTES = 256 * 1024;
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1_000;
const HEADERS = { accept: 'application/vnd.github+json', 'user-agent': 'THSV-StreamBridge-compatibility-feed', 'x-github-api-version': '2022-11-28' };

type AttestationVerifier = (bundles: readonly unknown[], digest: string, tag: string) => Promise<void>;
interface CompatibilityCache { readonly schemaVersion: 1; readonly tag: string; readonly publishedAt: string; readonly verifiedAt: string; readonly digest: string; readonly feedBase64: string; readonly attestations: readonly unknown[] }

export class StreamerBotCompatibilityFeedService {
  private current: Readonly<Record<string, unknown>> = Object.freeze({ state: 'checking', source: `${API}/releases`, available: false, provenanceVerified: false, installed: [] });
  private acceptedPublishedAt = 0;

  public constructor(
    private readonly logger: Logger,
    private readonly fetcher: typeof fetch = fetch,
    private readonly cachePath?: string,
    private readonly verifier?: AttestationVerifier,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public status(): Readonly<Record<string, unknown>> { return this.current; }

  public async start(): Promise<Readonly<Record<string, unknown>>> {
    await this.loadCache();
    void this.refresh();
    return this.current;
  }

  public async refresh(): Promise<Readonly<Record<string, unknown>>> {
    try {
      const releases = await this.json(`${API}/releases?per_page=30`) as Array<Record<string, unknown>>;
      const release = releases.find((entry) => entry['draft'] !== true && typeof entry['tag_name'] === 'string' && entry['tag_name'].startsWith('streamerbot-compat-'));
      if (release === undefined) return this.fallback('No published compatibility-data release exists yet.');
      const tag = release['tag_name'] as string;
      const publishedAt = parseTimestamp(release['published_at'], 'Compatibility release published timestamp is invalid.');
      if (publishedAt < this.acceptedPublishedAt) throw new Error('Compatibility release rollback was rejected.');
      const assets = Array.isArray(release['assets']) ? release['assets'] as Array<Record<string, unknown>> : [];
      const asset = assets.find((entry) => entry['name'] === ASSET);
      if (typeof asset?.['browser_download_url'] !== 'string') throw new Error(`Compatibility release is missing ${ASSET}.`);
      const response = await this.fetcher(asset['browser_download_url'], { headers: HEADERS, redirect: 'follow', signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw new Error(`Compatibility feed download returned ${String(response.status)}.`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength < 2 || bytes.byteLength > MAXIMUM_BYTES) throw new Error('Compatibility feed size is outside the safety limit.');
      const digest = createHash('sha256').update(bytes).digest('hex');
      const attestationResponse = await this.fetcher(`${API}/attestations/${encodeURIComponent(`sha256:${digest}`)}`, { headers: HEADERS, signal: AbortSignal.timeout(20_000) });
      if (!attestationResponse.ok) throw new Error(`Compatibility attestation lookup returned ${String(attestationResponse.status)}.`);
      const attestationDocument = await attestationResponse.json() as Record<string, unknown>;
      const attestations = Array.isArray(attestationDocument['attestations']) ? attestationDocument['attestations'] as Array<Record<string, unknown>> : [];
      const bundles = attestations.map((entry) => entry['bundle'] ?? entry);
      await this.verifyBundles(bundles, digest, tag);
      const feed = parseFeed(JSON.parse(Buffer.from(bytes).toString('utf8')) as unknown);
      const installed = installVerifiedStreamerBotTriggerVersions(feed.versions);
      this.acceptedPublishedAt = publishedAt;
      await this.writeCache({ schemaVersion: 1, tag, publishedAt: new Date(publishedAt).toISOString(), verifiedAt: this.now().toISOString(), digest, feedBase64: Buffer.from(bytes).toString('base64'), attestations: bundles });
      this.logger.info('Verified Streamer.bot compatibility-data feed', { tag, digest, installedVersions: installed });
      return this.record({ state: 'verified', available: true, provenanceVerified: true, tag, publishedAt: new Date(publishedAt).toISOString(), digest, installed, declared: feed.versions.map((entry) => entry.version) });
    } catch (error) {
      this.logger.warn('Streamer.bot compatibility-data refresh was unavailable; the last trusted local registry remains active', { error });
      return this.fallback(error instanceof Error ? error.message : String(error));
    }
  }

  private async loadCache(): Promise<void> {
    if (this.cachePath === undefined) return;
    try {
      const cache = parseCache(JSON.parse((await readFile(this.cachePath, 'utf8')).replace(/^\uFEFF/u, '')) as unknown);
      const verifiedAt = Date.parse(cache.verifiedAt); const publishedAt = Date.parse(cache.publishedAt); const now = this.now().getTime();
      if (now - verifiedAt > CACHE_MAX_AGE_MS || verifiedAt > now + 5 * 60_000) throw new Error('Cached compatibility data is expired or time-invalid.');
      const bytes = Buffer.from(cache.feedBase64, 'base64');
      if (bytes.byteLength < 2 || bytes.byteLength > MAXIMUM_BYTES || createHash('sha256').update(bytes).digest('hex') !== cache.digest) throw new Error('Cached compatibility data failed digest validation.');
      await this.verifyBundles(cache.attestations, cache.digest, cache.tag);
      const feed = parseFeed(JSON.parse(bytes.toString('utf8')) as unknown);
      const installed = installVerifiedStreamerBotTriggerVersions(feed.versions);
      this.acceptedPublishedAt = publishedAt;
      this.current = Object.freeze({ state: 'verified-cache', source: this.cachePath, available: true, provenanceVerified: true, tag: cache.tag, publishedAt: cache.publishedAt, verifiedAt: cache.verifiedAt, expiresAt: new Date(verifiedAt + CACHE_MAX_AGE_MS).toISOString(), digest: cache.digest, installed, declared: feed.versions.map((entry) => entry.version), checkedAt: this.now().toISOString() });
      this.logger.info('Loaded verified cached Streamer.bot compatibility data', { tag: cache.tag, installedVersions: installed });
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.logger.warn('Cached Streamer.bot compatibility data was rejected', { error }); }
  }

  private async writeCache(cache: CompatibilityCache): Promise<void> {
    if (this.cachePath === undefined) return;
    await mkdir(dirname(this.cachePath), { recursive: true });
    const temporary = `${this.cachePath}.${String(process.pid)}.tmp`;
    try { await writeFile(temporary, `${JSON.stringify(cache, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 }); await rename(temporary, this.cachePath); }
    finally { await rm(temporary, { force: true }).catch(() => undefined); }
  }

  private fallback(reason: string): Readonly<Record<string, unknown>> {
    if (this.current['provenanceVerified'] === true) { this.current = Object.freeze({ ...this.current, refreshError: reason, checkedAt: this.now().toISOString() }); return this.current; }
    return this.record({ state: 'embedded', available: false, provenanceVerified: false, installed: [], reason });
  }

  private verifyBundles(bundles: readonly unknown[], digest: string, tag: string): Promise<void> {
    return this.verifier?.(bundles, digest, tag) ?? verifyCompatibilityAttestation(bundles, digest, tag, this.cachePath === undefined ? undefined : join(dirname(this.cachePath), 'sigstore-tuf'));
  }

  private record(value: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> { this.current = Object.freeze({ ...value, source: `${API}/releases`, checkedAt: this.now().toISOString() }); return this.current; }
  private async json(url: string): Promise<unknown> { const response = await this.fetcher(url, { headers: HEADERS, signal: AbortSignal.timeout(20_000) }); if (!response.ok) throw new Error(`GitHub returned ${String(response.status)}.`); return response.json(); }
}

async function verifyCompatibilityAttestation(bundles: readonly unknown[], digest: string, tag: string, persistentTufCachePath?: string): Promise<void> {
  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const identity = `^https://github\\.com/surakage/THSV-StreamBridge/\\.github/workflows/streamerbot-compatibility\\.yml@refs/tags/${escapedTag}$`;
  const temporary = persistentTufCachePath === undefined;
  const tufCachePath = persistentTufCachePath ?? await mkdtemp(join(tmpdir(), 'thsv-compat-tuf-'));
  if (!temporary) await mkdir(tufCachePath, { recursive: true });
  try {
    for (const bundle of bundles) try {
      await verify(bundle as Parameters<typeof verify>[0], { certificateIssuer: 'https://token.actions.githubusercontent.com', certificateIdentityURI: identity, tufCachePath });
      const envelope = (bundle as Record<string, unknown>)['dsseEnvelope'] as Record<string, unknown> | undefined; const payload = envelope?.['payload'];
      if (typeof payload !== 'string') continue;
      const statement = JSON.parse(Buffer.from(payload, 'base64').toString('utf8')) as Record<string, unknown>;
      const subjects = Array.isArray(statement['subject']) ? statement['subject'] as Array<Record<string, unknown>> : [];
      if (statement['predicateType'] === 'https://slsa.dev/provenance/v1' && subjects.some((subject) => (subject['digest'] as Record<string, unknown> | undefined)?.['sha256'] === digest)) return;
    } catch { /* Check every attestation for this digest. */ }
  } finally { if (temporary) await rm(tufCachePath, { recursive: true, force: true }); }
  throw new Error('No valid tagged GitHub provenance attestation matched the compatibility feed.');
}

function parseCache(value: unknown): CompatibilityCache {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Compatibility cache must be an object.');
  const item = value as Record<string, unknown>;
  if (item['schemaVersion'] !== 1 || typeof item['tag'] !== 'string' || !/^streamerbot-compat-[0-9A-Za-z.-]+$/u.test(item['tag']) || typeof item['publishedAt'] !== 'string' || typeof item['verifiedAt'] !== 'string' || typeof item['digest'] !== 'string' || !/^[a-f0-9]{64}$/u.test(item['digest']) || typeof item['feedBase64'] !== 'string' || !Array.isArray(item['attestations']) || item['attestations'].length === 0 || item['attestations'].length > 32) throw new Error('Compatibility cache schema is invalid.');
  parseTimestamp(item['publishedAt'], 'Compatibility cache published timestamp is invalid.'); parseTimestamp(item['verifiedAt'], 'Compatibility cache verification timestamp is invalid.');
  return item as unknown as CompatibilityCache;
}

function parseTimestamp(value: unknown, message: string): number { if (typeof value !== 'string') throw new Error(message); const timestamp = Date.parse(value); if (!Number.isFinite(timestamp)) throw new Error(message); return timestamp; }

function parseFeed(value: unknown): { readonly versions: readonly { readonly version: string; readonly baseVersion: string }[] } {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Compatibility feed must be an object.');
  const root = value as Record<string, unknown>; const versions = root['versions'];
  if (root['schemaVersion'] !== 1 || !Array.isArray(versions) || versions.length === 0 || versions.length > 32) throw new Error('Compatibility feed schema is invalid.');
  const parsed = versions.map((entry) => { if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('Compatibility version entry is invalid.'); const item = entry as Record<string, unknown>; if (typeof item['version'] !== 'string' || typeof item['baseVersion'] !== 'string') throw new Error('Compatibility version identities are invalid.'); return { version: item['version'], baseVersion: item['baseVersion'] }; });
  if (new Set(parsed.map((entry) => entry.version)).size !== parsed.length) throw new Error('Compatibility feed versions must be unique.'); return { versions: parsed };
}
