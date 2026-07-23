import { createHash } from 'node:crypto';
import { readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const STABLE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
const targetVersion = stableVersionArgument(process.argv[2]);

const root = process.cwd();
await alignRootPackage();
await alignProductVersion();
await alignAddOns();
await alignStreamerBotPackages();
process.stdout.write(`Aligned THSV StreamBridge and all first-party packages to ${targetVersion}.\n`);

async function alignRootPackage(): Promise<void> {
  const packagePath = join(root, 'package.json');
  const packageJson = await json<Record<string, unknown>>(packagePath);
  packageJson['version'] = targetVersion;
  const scripts = record(packageJson['scripts']);
  scripts['release:sync-version'] = 'tsx tools/sync-release-version.ts';
  await writeJson(packagePath, packageJson);

  const lockPath = join(root, 'package-lock.json');
  const lock = await json<Record<string, unknown>>(lockPath);
  lock['version'] = targetVersion;
  const packages = record(lock['packages']);
  record(packages[''])['version'] = targetVersion;
  await writeJson(lockPath, lock);
}

async function alignProductVersion(): Promise<void> {
  const path = join(root, 'bridge', 'version.ts');
  const source = await readFile(path, 'utf8');
  const aligned = source.replace(
    /export const STREAMBRIDGE_VERSION = '[^']+' as const;/u,
    `export const STREAMBRIDGE_VERSION = '${targetVersion}' as const;`,
  );
  if (aligned === source && !source.includes(`STREAMBRIDGE_VERSION = '${targetVersion}'`)) {
    throw new Error('bridge/version.ts does not contain STREAMBRIDGE_VERSION.');
  }
  await writeFile(path, aligned, 'utf8');
}

async function alignAddOns(): Promise<void> {
  const addOnsRoot = join(root, 'addons');
  const folders = (await readdir(addOnsRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory());
  for (const folder of folders) {
    const addOnRoot = join(addOnsRoot, folder.name);
    const descriptorPath = join(addOnRoot, 'module-package.json');
    const descriptor = await json<Record<string, unknown>>(descriptorPath);
    const manifest = record(descriptor['manifest']);
    const contractVersion = String(manifest['contractVersion']);
    manifest['version'] = targetVersion;
    manifest['minimumCoreVersion'] = contractVersion;
    manifest['maximumTestedCoreVersion'] = contractVersion;
    descriptor['changelog'] = stableChangelog(descriptor['changelog']);

    const runtimePath = join(addOnRoot, 'dist', 'index.js');
    let runtime = await readFile(runtimePath, 'utf8');
    const match = /const manifest = \{[\s\S]*?\n\};/u.exec(runtime);
    if (match === null) throw new Error(`${folder.name} runtime has no manifest block.`);
    const alignedManifest = match[0]
      .replace(/(\bversion:\s*')[^']+(')/u, `$1${targetVersion}$2`)
      .replace(/(\bminimumCoreVersion:\s*')[^']+(')/u, `$1${contractVersion}$2`)
      .replace(/(\bmaximumTestedCoreVersion:\s*')[^']+(')/u, `$1${contractVersion}$2`)
      .replace(/-\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\.sb\b/gu, `-${targetVersion}.sb`);
    runtime = runtime.slice(0, match.index) + alignedManifest + runtime.slice(match.index + match[0].length);
    await writeFile(runtimePath, runtime, 'utf8');

    const uiPath = join(addOnRoot, 'ui', 'settings.json');
    const existingFiles = Array.isArray(descriptor['files']) ? descriptor['files'] as Array<Record<string, unknown>> : [];
    const paths = new Set(existingFiles.map((entry) => String(entry['path'])));
    if (await exists(uiPath)) {
      descriptor['settingsUi'] = 'ui/settings.json';
      paths.add('ui/settings.json');
    }

    manifest['installationSteps'] = stringArray(manifest['installationSteps']).map((step) => (
      step.replace(/-\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\.sb\b/gu, `-${targetVersion}.sb`)
    ));
    descriptor['files'] = await Promise.all([...paths].map(async (relativePath) => {
      const filePath = join(addOnRoot, ...relativePath.split('/'));
      const bytes = await readFile(filePath);
      return { path: relativePath, size: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex') };
    }));
    await writeJson(descriptorPath, descriptor);
  }
}

async function alignStreamerBotPackages(): Promise<void> {
  const packagesRoot = join(root, 'packages', 'streamerbot');
  const folders = (await readdir(packagesRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory());
  for (const folder of folders) {
    const packageRoot = join(packagesRoot, folder.name);
    const manifestPath = join(packageRoot, 'manifest.json');
    if (!await exists(manifestPath)) continue;
    const manifest = await json<Record<string, unknown>>(manifestPath);
    manifest['version'] = targetVersion;
    const actions = Array.isArray(manifest['actions'])
      ? manifest['actions'] as Array<Record<string, unknown>>
      : [record(manifest['action'])];
    for (const action of actions) {
      if (typeof action['importFile'] === 'string') {
        action['importFile'] = action['importFile'].replace(
          /-\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\.sb$/u,
          `-${targetVersion}.sb`,
        );
      }
    }
    await writeJson(manifestPath, manifest);
    for (const entry of await readdir(packageRoot, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.sb')) await unlink(join(packageRoot, entry.name));
    }
  }
}

function stableChangelog(value: unknown): string {
  const existing = typeof value === 'string' ? value.trim() : '';
  if (existing.startsWith(`${targetVersion}:`)) return existing;
  const prefix = `${targetVersion}: aligned with the stable THSV StreamBridge ${targetVersion} baseline, guided wizard UI, verified update metadata, and regenerated Streamer.bot imports.`;
  return existing.length === 0 ? prefix : `${prefix} ${existing}`;
}

async function json<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Expected an object while synchronizing release versions.');
  return value as Record<string, unknown>;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) throw new Error('Expected a string array while synchronizing release versions.');
  return value;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

function stableVersionArgument(value: string | undefined): string {
  if (value === undefined || !STABLE_VERSION.test(value)) {
    throw new Error('Usage: tsx tools/sync-release-version.ts <major.minor.patch>');
  }
  return value;
}
