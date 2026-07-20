import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildStreamerBotPackage } from '../bridge/services/streamerbot-package-builder.js';

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
    readonly references?: readonly string[];
    readonly arguments?: readonly ExportArgument[];
}

interface ExportArgument {
    readonly name: string;
    readonly value: string;
    readonly autoType?: boolean;
    readonly id?: string;
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

const encoded = buildStreamerBotPackage(
  {
    name: manifest.name,
    ...(manifest.author === undefined ? {} : { author: manifest.author }),
    version: manifest.version,
    ...(manifest.description === undefined ? {} : { description: manifest.description }),
    minimumStreamerBotVersion: manifest.minimumStreamerBotVersion,
    concurrent: manifest.runtime.concurrent,
  },
  await Promise.all(actions.map(async (action) => ({
    name: action.name,
    group: action.group,
    ...(action.id === undefined ? {} : { id: action.id }),
    ...(action.sourceSubActionId === undefined ? {} : { sourceSubActionId: action.sourceSubActionId }),
    ...(action.references === undefined ? {} : { references: action.references }),
    ...(action.arguments === undefined ? {} : {
      arguments: action.arguments.map((argument) => ({
        name: argument.name,
        value: argument.value,
        ...(argument.autoType === undefined ? {} : { autoType: argument.autoType }),
        ...(argument.id === undefined ? {} : { id: argument.id }),
        stableIdentitySeed: `${manifest.name}:${action.name}:${argument.name}`,
      })),
    }),
    sourceCode: (await readFile(resolve(packageDirectory, action.source))).toString('utf8'),
    stableIdentitySeed: legacySingleAction ? manifest.name : `${manifest.name}:${action.name}`,
  }))),
);

const importFile = actions[0]?.importFile;
if (importFile === undefined) throw new Error('Manifest has no import file.');
await writeFile(resolve(packageDirectory, importFile), encoded);
console.log(`Created ${resolve(packageDirectory, importFile)}`);
