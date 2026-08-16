import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import type { WizardAddOnSummary } from './addon-wizard-service.js';

interface ImportIndexRecord {
  readonly folder: string;
  readonly moduleId?: string;
  readonly kind: 'core' | 'extension' | 'addon';
  readonly name: string;
  readonly version: string;
  readonly minimumStreamerBotVersion: string;
  readonly imports: readonly { readonly filename: string }[];
}

interface ImportIndex {
  readonly bridgeVersion: string;
  readonly packages: readonly ImportIndexRecord[];
}

interface PackageManifest {
  readonly description?: string;
  readonly manualTriggerSetup?: readonly string[] | Readonly<Record<string, readonly string[]>>;
  readonly triggerSafety?: string;
}

interface DecodedPackage {
  readonly meta: Readonly<Record<string, unknown>>;
  readonly data: Readonly<Record<string, unknown>> & {
    readonly actions: readonly Record<string, unknown>[];
    readonly commands: readonly Record<string, unknown>[];
  };
  readonly version: number;
  readonly exportedFrom: string;
  readonly minimumVersion: string;
}

export interface UniversalImportPackageSummary {
  readonly folder: string;
  readonly moduleId?: string;
  readonly kind: ImportIndexRecord['kind'];
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly required: boolean;
  readonly available: boolean;
  readonly enabled: boolean;
  readonly actionCount: number;
  readonly commandCount: number;
  readonly triggerRecommendations: readonly string[];
  readonly triggerSafety?: string;
}

export interface UniversalImportCatalogue {
  readonly bridgeVersion: string;
  readonly minimumStreamerBotVersion: string;
  readonly packages: readonly UniversalImportPackageSummary[];
}

export interface UniversalImportResult {
  readonly filename: string;
  readonly contentBase64: string;
  readonly sha256: string;
  readonly packageFolders: readonly string[];
  readonly actionCount: number;
  readonly commandCount: number;
  readonly minimumStreamerBotVersion: string;
  readonly triggerRecommendations: readonly { readonly package: string; readonly recommendations: readonly string[]; readonly safety?: string }[];
}

export class StreamerBotUniversalImportService {
  public constructor(private readonly packagesRoot = resolve('packages', 'streamerbot')) {}

  public async catalogue(installedAddOns: readonly WizardAddOnSummary[] = []): Promise<UniversalImportCatalogue> {
    const index = await this.readIndex();
    const installedById = new Map(installedAddOns.map((addOn) => [addOn.moduleId, addOn]));
    const packages = await Promise.all(index.packages.map(async (record) => {
      const decoded = await this.readPackage(record);
      const manifest = await this.readManifest(record.folder);
      const installed = record.moduleId === undefined ? undefined : installedById.get(record.moduleId);
      return {
        folder: record.folder,
        ...(record.moduleId === undefined ? {} : { moduleId: record.moduleId }),
        kind: record.kind,
        name: record.name,
        description: manifest.description ?? '',
        version: record.version,
        required: record.kind === 'core',
        available: record.kind !== 'addon' || (installed?.health === 'installed'),
        enabled: record.kind === 'core' || (record.kind === 'extension' ? installed?.enabled !== false : installed?.enabled === true),
        actionCount: decoded.data.actions.length,
        commandCount: decoded.data.commands.length,
        triggerRecommendations: flattenTriggerSetup(manifest.manualTriggerSetup),
        ...(manifest.triggerSafety === undefined ? {} : { triggerSafety: manifest.triggerSafety }),
      } satisfies UniversalImportPackageSummary;
    }));
    return {
      bridgeVersion: index.bridgeVersion,
      minimumStreamerBotVersion: highestVersion(index.packages.map((record) => record.minimumStreamerBotVersion)),
      packages,
    };
  }

  public async build(selectedFolders: readonly string[], installedAddOns: readonly WizardAddOnSummary[] = []): Promise<UniversalImportResult> {
    if (selectedFolders.length > 100 || selectedFolders.some((value) => !/^[a-z0-9][a-z0-9-]{0,99}$/u.test(value))) {
      throw new Error('Selected Streamer.bot packages are invalid. Refresh the selector and try again.');
    }
    const index = await this.readIndex();
    const catalogue = await this.catalogue(installedAddOns);
    const summaries = new Map(catalogue.packages.map((record) => [record.folder, record]));
    const requested = new Set<string>(selectedFolders);
    for (const record of catalogue.packages) if (record.required) requested.add(record.folder);
    for (const folder of requested) {
      const record = summaries.get(folder);
      if (record === undefined) throw new Error(`Unknown Streamer.bot package: ${folder}. Refresh the selector and try again.`);
      if (!record.available) throw new Error(`${record.name} is an optional add-on. Install it in the wizard before including its Streamer.bot actions.`);
    }
    const selected = index.packages.filter((record) => requested.has(record.folder));
    const decoded = await Promise.all(selected.map((record) => this.readPackage(record)));
    const actions = uniqueObjects(decoded.flatMap((item) => item.data.actions), 'action');
    const commands = uniqueObjects(decoded.flatMap((item) => item.data.commands), 'command');
    const minimumStreamerBotVersion = highestVersion(selected.map((record) => record.minimumStreamerBotVersion));
    const universal: DecodedPackage = {
      meta: {
        name: 'THSV StreamBridge - Universal Setup',
        author: 'surakage',
        version: index.bridgeVersion,
        description: `One reviewed import containing ${String(selected.length)} selected THSV StreamBridge package(s).`,
        autoRunAction: null,
        minimumVersion: null,
      },
      data: {
        actions,
        queues: uniqueNested(decoded, 'queues'),
        commands,
        websocketServers: uniqueNested(decoded, 'websocketServers'),
        websocketClients: uniqueNested(decoded, 'websocketClients'),
        timers: uniqueNested(decoded, 'timers'),
      },
      version: Math.max(...decoded.map((item) => item.version)),
      exportedFrom: minimumStreamerBotVersion,
      minimumVersion: decoded[0]?.minimumVersion ?? '1.0.0-alpha.1',
    };
    const compressed = gzipSync(Buffer.from(JSON.stringify(universal)), { level: 9 });
    compressed[9] = 255;
    const bytes = Buffer.concat([Buffer.from('SBAE', 'ascii'), compressed]);
    const recommendationRecords = await Promise.all(selected.map(async (record) => ({ record, manifest: await this.readManifest(record.folder) })));
    return {
      filename: `THSV-StreamBridge-Universal-Setup-${index.bridgeVersion}.sb`,
      contentBase64: bytes.toString('base64'),
      sha256: createHash('sha256').update(bytes).digest('hex'),
      packageFolders: selected.map((record) => record.folder),
      actionCount: actions.length,
      commandCount: commands.length,
      minimumStreamerBotVersion,
      triggerRecommendations: recommendationRecords.map(({ record, manifest }) => ({
        package: record.name,
        recommendations: flattenTriggerSetup(manifest.manualTriggerSetup),
        ...(manifest.triggerSafety === undefined ? {} : { safety: manifest.triggerSafety }),
      })).filter((entry) => entry.recommendations.length > 0 || entry.safety !== undefined),
    };
  }

  private async readIndex(): Promise<ImportIndex> {
    const parsed = JSON.parse(await readFile(join(this.packagesRoot, 'import-index.json'), 'utf8')) as ImportIndex;
    if (!Array.isArray(parsed.packages) || parsed.packages.length === 0) throw new Error('The Streamer.bot import catalogue is missing or empty. Repair or update StreamBridge.');
    return parsed;
  }

  private async readManifest(folder: string): Promise<PackageManifest> {
    return JSON.parse(await readFile(join(this.packagesRoot, folder, 'manifest.json'), 'utf8')) as PackageManifest;
  }

  private async readPackage(record: ImportIndexRecord): Promise<DecodedPackage> {
    const filename = record.imports[0]?.filename;
    if (filename === undefined || record.imports.length !== 1) throw new Error(`${record.name} does not declare one canonical import.`);
    const encoded = (await readFile(join(this.packagesRoot, record.folder, filename), 'utf8')).trim();
    const bytes = Buffer.from(encoded, 'base64');
    if (bytes.subarray(0, 4).toString('ascii') !== 'SBAE') throw new Error(`${record.name} has an invalid Streamer.bot package header.`);
    const decoded = JSON.parse(gunzipSync(bytes.subarray(4)).toString('utf8')) as DecodedPackage;
    if (!Array.isArray(decoded.data.actions) || !Array.isArray(decoded.data.commands)) throw new Error(`${record.name} has an invalid Streamer.bot package body.`);
    return decoded;
  }
}

function flattenTriggerSetup(input: PackageManifest['manualTriggerSetup']): readonly string[] {
  if (input === undefined) return [];
  if (Array.isArray(input)) return (input as readonly unknown[]).filter((entry): entry is string => typeof entry === 'string');
  return Object.entries(input as Readonly<Record<string, readonly string[]>>).flatMap(([action, entries]) => entries.map((entry) => `${friendlyKey(action)}: ${entry}`));
}

function friendlyKey(value: string): string {
  return value.replace(/([a-z])([A-Z])/gu, '$1 $2').replace(/[-_]+/gu, ' ').replace(/^./u, (character) => character.toUpperCase());
}

function highestVersion(versions: readonly string[]): string {
  return [...versions].sort((left, right) => compareVersion(left, right)).at(-1) ?? '1.0.7';
}

function compareVersion(left: string, right: string): number {
  const a = left.split(/[.-]/u).map((part) => Number.parseInt(part, 10) || 0);
  const b = right.split(/[.-]/u).map((part) => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function uniqueObjects(values: readonly Record<string, unknown>[], label: string): readonly Record<string, unknown>[] {
  const seen = new Map<string, string>();
  return values.filter((value) => {
    const id = typeof value['id'] === 'string' ? value['id'] : '';
    if (id.length === 0) throw new Error(`A selected Streamer.bot ${label} has no stable ID.`);
    const serialized = JSON.stringify(value);
    const existing = seen.get(id);
    if (existing !== undefined && existing !== serialized) throw new Error(`Selected packages contain conflicting ${label} ID ${id}. Update all packages to the same StreamBridge version.`);
    if (existing !== undefined) return false;
    seen.set(id, serialized);
    return true;
  });
}

function uniqueNested(packages: readonly DecodedPackage[], key: string): readonly unknown[] {
  const seen = new Set<string>();
  const result: unknown[] = [];
  for (const item of packages) {
    const values = item.data[key];
    if (!Array.isArray(values)) continue;
    for (const value of values) {
      const serialized = JSON.stringify(value);
      if (seen.has(serialized)) continue;
      seen.add(serialized);
      result.push(value);
    }
  }
  return result;
}
