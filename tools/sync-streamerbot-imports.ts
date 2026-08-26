import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { MAIN_FEATURE_FAMILIES } from '../bridge/core/main-feature-registry.js';

interface StreamerBotManifest {
  readonly name: string;
  readonly version: string;
  readonly minimumStreamerBotVersion: string;
  readonly action?: { readonly importFile: string };
  readonly actions?: readonly { readonly importFile: string }[];
}

interface AddOnDescriptor { readonly manifest?: { readonly moduleId?: string } }

const execute = promisify(execFile);
const root = resolve('.');
const packagesRoot = join(root, 'packages', 'streamerbot');
const extensionModuleIds = new Set(MAIN_FEATURE_FAMILIES.flatMap((family) => family.modules));
const packageDirectories = (await readdir(packagesRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .sort((left, right) => left.name.localeCompare(right.name));
const records: Array<Record<string, unknown>> = [];

for (const directory of packageDirectories) {
  const packageRoot = join(packagesRoot, directory.name);
  const manifestPath = join(packageRoot, 'manifest.json');
  if (!await isFile(manifestPath)) continue;
  await execute(process.execPath, [
    join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
    join(root, 'tools', 'build-streamerbot-export.ts'),
    packageRoot,
  ], { cwd: root, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as StreamerBotManifest;
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await writeFileWithRetry(manifestPath, manifestBytes);
  const importFiles = [...new Set([
    ...(manifest.action === undefined ? [] : [manifest.action.importFile]),
    ...(manifest.actions ?? []).map((action) => action.importFile),
  ])].sort();
  if (importFiles.length !== 1) throw new Error(`${directory.name} must declare exactly one canonical Streamer.bot import file.`);

  const addOnDescriptorPath = join(root, 'addons', directory.name, 'module-package.json');
  const addOnDescriptor = await readJsonIfPresent<AddOnDescriptor>(addOnDescriptorPath);
  const moduleId = addOnDescriptor?.manifest?.moduleId;
  const kind = moduleId === undefined ? 'core' : (extensionModuleIds.has(moduleId) ? 'extension' : 'addon');
  const imports = await Promise.all(importFiles.map(async (filename) => {
    const bytes = await readFile(join(packageRoot, filename));
    if (bytes.length === 0) throw new Error(`${directory.name}/${filename} is empty.`);
    return { filename, size: bytes.length, sha256: sha256(bytes) };
  }));
  records.push({
    folder: directory.name,
    ...(moduleId === undefined ? {} : { moduleId }),
    kind,
    name: manifest.name,
    version: manifest.version,
    minimumStreamerBotVersion: manifest.minimumStreamerBotVersion,
    manifestSha256: sha256(manifestBytes),
    imports,
  });
}

const product = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as { version: string };
const index = {
  schemaVersion: 1,
  product: 'THSV StreamBridge Streamer.bot imports',
  bridgeVersion: product.version,
  policy: 'Canonical imports are regenerated from reviewed package source before every release build.',
  packages: records,
};
await writeFileWithRetry(join(packagesRoot, 'import-index.json'), `${JSON.stringify(index, null, 2)}\n`);
process.stdout.write(`Regenerated and indexed ${String(records.length)} Streamer.bot import package(s).\n`);

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

async function writeFileWithRetry(path: string, contents: string | Uint8Array): Promise<void> {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      await writeFile(path, contents);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (!['EBUSY', 'EPERM', 'UNKNOWN'].includes(code ?? '') || attempt === 5) throw error;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 100));
    }
  }
}

async function isFile(path: string): Promise<boolean> {
  try { return (await stat(path)).isFile(); } catch { return false; }
}

async function readJsonIfPresent<T>(path: string): Promise<T | undefined> {
  try { return JSON.parse(await readFile(path, 'utf8')) as T; } catch { return undefined; }
}
