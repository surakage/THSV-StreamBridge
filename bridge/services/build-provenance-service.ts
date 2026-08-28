import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CORE_CONTRACT_VERSION } from '../contracts/v2/common.js';
import { STREAMBRIDGE_VERSION } from '../version.js';

export interface BuildProvenance {
  readonly version: string;
  readonly coreContractVersion: string;
  readonly installation: 'verified-portable-release' | 'local-development';
  readonly buildFingerprint: string;
  readonly releaseManifestSha256?: string;
  readonly releaseCreatedAt?: string;
  readonly installedAt?: string;
  readonly runtimeVersion?: string;
  readonly runtimeUpstreamSha256?: string;
  readonly canonicalDownload?: string;
  readonly sourceRepository?: string;
  readonly sourceCommitSha?: string;
  readonly sourceTreeState?: 'clean' | 'dirty';
  readonly unsignedPayloadSha256?: string;
  readonly fileCount?: number;
}

export async function readBuildProvenance(dataRoot: string): Promise<BuildProvenance> {
  try {
    const raw = await readFile(join(dataRoot, 'runtime', 'install-manifest.json'), 'utf8');
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (value['product'] !== 'THSV StreamBridge' || value['activeVersion'] !== STREAMBRIDGE_VERSION) return localProvenance();
    const buildFingerprint = hex(value['buildFingerprint']);
    if (buildFingerprint === undefined) return localProvenance();
    const releaseManifestSha256 = hex(value['releaseManifestSha256']); const releaseCreatedAt = text(value['releaseCreatedAt']); const installedAt = text(value['installedAt']);
    const runtimeVersion = text(value['runtimeVersion']); const runtimeUpstreamSha256 = hex(value['runtimeUpstreamSha256']); const canonicalDownload = text(value['canonicalDownload']);
    const sourceRepository = value['sourceRepository'] === 'surakage/THSV-StreamBridge' ? value['sourceRepository'] : undefined;
    const sourceCommitSha = sha1(value['sourceCommitSha']); const sourceTreeState = value['sourceTreeState'] === 'clean' || value['sourceTreeState'] === 'dirty' ? value['sourceTreeState'] : undefined;
    const unsignedPayloadSha256 = hex(value['unsignedPayloadSha256']);
    return {
      version: STREAMBRIDGE_VERSION,
      coreContractVersion: CORE_CONTRACT_VERSION,
      installation: 'verified-portable-release',
      buildFingerprint,
      ...(releaseManifestSha256 === undefined ? {} : { releaseManifestSha256 }),
      ...(releaseCreatedAt === undefined ? {} : { releaseCreatedAt }),
      ...(installedAt === undefined ? {} : { installedAt }),
      ...(runtimeVersion === undefined ? {} : { runtimeVersion }),
      ...(runtimeUpstreamSha256 === undefined ? {} : { runtimeUpstreamSha256 }),
      ...(canonicalDownload === undefined ? {} : { canonicalDownload }),
      ...(sourceRepository === undefined ? {} : { sourceRepository }),
      ...(sourceCommitSha === undefined ? {} : { sourceCommitSha }),
      ...(sourceTreeState === undefined ? {} : { sourceTreeState }),
      ...(unsignedPayloadSha256 === undefined ? {} : { unsignedPayloadSha256 }),
      ...(Number.isSafeInteger(value['fileCount']) ? { fileCount: value['fileCount'] as number } : {}),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
    return localProvenance();
  }
}

function localProvenance(): BuildProvenance {
  return {
    version: STREAMBRIDGE_VERSION,
    coreContractVersion: CORE_CONTRACT_VERSION,
    installation: 'local-development',
    buildFingerprint: createHash('sha256').update(`local:${STREAMBRIDGE_VERSION}:${CORE_CONTRACT_VERSION}`).digest('hex'),
  };
}

function hex(value: unknown): string | undefined { return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value) ? value : undefined; }
function sha1(value: unknown): string | undefined { return typeof value === 'string' && /^[a-f0-9]{40}$/u.test(value) ? value : undefined; }
function text(value: unknown): string | undefined { return typeof value === 'string' && value.length > 0 && value.length <= 500 ? value : undefined; }
