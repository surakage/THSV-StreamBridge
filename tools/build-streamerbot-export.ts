import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

interface ExportManifest {
  readonly name: string;
  readonly version: string;
  readonly author?: string;
  readonly description?: string;
  readonly minimumStreamerBotVersion: string;
  readonly action?: ExportAction;
  readonly actions?: readonly ExportAction[];
  readonly runtime: {
    readonly concurrent: boolean;
  };
}

interface ExportAction {
    readonly name: string;
    readonly group: string;
    readonly id?: string;
    readonly sourceSubActionId?: string;
    readonly source: string;
    readonly importFile: string;
}

const packageArgument = process.argv[2];
if (packageArgument === undefined) {
  throw new Error('Usage: npm run package:streamerbot -- <package-directory>');
}

const packageDirectory = resolve(packageArgument);
const manifest = JSON.parse(await readFile(resolve(packageDirectory, 'manifest.json'), 'utf8')) as ExportManifest;
const actions = manifest.actions ?? (manifest.action === undefined ? [] : [manifest.action]);
const legacySingleAction = manifest.actions === undefined;
if (actions.length === 0) throw new Error('Manifest must define action or actions.');
const importFiles = new Set(actions.map((action) => action.importFile));
if (importFiles.size !== 1) throw new Error('Every action in a multi-action package must use the same importFile.');
const exported = {
  meta: {
    name: manifest.name,
    author: manifest.author ?? '',
    version: manifest.version,
    description: manifest.description ?? '',
    autoRunAction: null,
    minimumVersion: null,
  },
  data: {
    actions: await Promise.all(actions.map(async (action) => ({
      id: action.id ?? stableUuid(legacySingleAction ? `${manifest.name}:action` : `${manifest.name}:${action.name}:action`),
      queue: '00000000-0000-0000-0000-000000000000',
      enabled: true,
      excludeFromHistory: false,
      excludeFromPending: false,
      name: action.name,
      group: action.group,
      alwaysRun: false,
      randomAction: false,
      concurrent: manifest.runtime.concurrent,
      triggers: [],
      subActions: [{
        name: null,
        description: null,
        references: ['C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\mscorlib.dll'],
        byteCode: (await readFile(resolve(packageDirectory, action.source))).toString('base64'),
        precompile: false,
        delayStart: false,
        saveResultToVariable: false,
        saveToVariable: null,
        id: action.sourceSubActionId ?? stableUuid(legacySingleAction ? `${manifest.name}:source` : `${manifest.name}:${action.name}:source`),
        weight: 0,
        type: 99_999,
        parentId: null,
        enabled: true,
        index: 0,
      }],
      collapsedGroups: [],
    }))),
    queues: [],
    commands: [],
    websocketServers: [],
    websocketClients: [],
    timers: [],
  },
  version: 24,
  exportedFrom: manifest.minimumStreamerBotVersion,
  minimumVersion: '1.0.0-alpha.1',
};

const header = Buffer.from('SBAE', 'ascii');
const compressed = gzipSync(Buffer.from(JSON.stringify(exported)), { level: 9 });
const importFile = actions[0]?.importFile;
if (importFile === undefined) throw new Error('Manifest has no import file.');
await writeFile(resolve(packageDirectory, importFile), Buffer.concat([header, compressed]).toString('base64'));
console.log(`Created ${resolve(packageDirectory, importFile)}`);

function stableUuid(input: string): string {
  const bytes = createHash('sha256').update(input).digest().subarray(0, 16);
  bytes[6] = (bytes[6] ?? 0) & 0x0f | 0x50;
  bytes[8] = (bytes[8] ?? 0) & 0x3f | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
