import { createHash } from 'node:crypto';
import { readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const STABLE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
const targetVersion = stableVersionArgument(process.argv[2]);

const root = process.cwd();
await alignRootPackage();
await alignProductVersion();
await alignReleaseDocumentation();
await alignAddOns();
await alignStreamerBotPackages();
await import('./sync-streamerbot-imports.js');
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
    manifest['minimumBridgeVersion'] = targetVersion;
    manifest['maximumTestedBridgeVersion'] = targetVersion;
    descriptor['changelog'] = releaseChangelog(descriptor['changelog']);

    const runtimePath = join(addOnRoot, 'dist', 'index.js');
    let runtime = await readFile(runtimePath, 'utf8');
    // Add-on authors may format the closing brace on its own line or after the final property.
    // Match the first complete manifest declaration rather than coupling release packaging to style.
    const match = /const manifest = \{[\s\S]*?\};/u.exec(runtime);
    if (match === null) throw new Error(`${folder.name} runtime has no manifest block.`);
    const alignedManifest = match[0]
      .replace(/\s*minimumBridgeVersion:\s*'[^']+',?/u, '')
      .replace(/\s*maximumTestedBridgeVersion:\s*'[^']+',?/u, '')
      .replace(/(\bversion:\s*')[^']+(')/u, `$1${targetVersion}$2`)
      .replace(/(\bminimumCoreVersion:\s*')[^']+(')/u, `$1${contractVersion}$2`)
      .replace(/(\bmaximumTestedCoreVersion:\s*')[^']+(')/u, `$1${contractVersion}$2`)
      .replace(/(\bmaximumTestedCoreVersion:\s*'[^']+',?)/u, `$1 minimumBridgeVersion: '${targetVersion}', maximumTestedBridgeVersion: '${targetVersion}',`)
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
    const sourceRoot = join(packageRoot, 'src');
    if (await exists(sourceRoot)) {
      for (const sourcePath of await filesBelow(sourceRoot, '.cs')) {
        const source = await readFile(sourcePath, 'utf8');
        const aligned = source.replace(
          /(THSV-StreamBridge-[A-Za-z0-9-]+\/)\d+\.\d+\.\d+(?=["'])/gu,
          `$1${targetVersion}`,
        );
        if (aligned !== source) await writeTextWithRetry(sourcePath, aligned);
      }
    }
  }
}

async function alignReleaseDocumentation(): Promise<void> {
  const paths = [join(root, 'README.md')];
  for (const folder of ['addons', 'packages/streamerbot', 'docs']) {
    const folderPath = join(root, ...folder.split('/'));
    paths.push(...await filesBelow(folderPath, '.md', folder === 'docs' ? new Set(['releases']) : undefined));
  }
  for (const path of paths) {
    const source = await readFile(path, 'utf8');
    const aligned = source
      .replace(
        /((?:THSV|thsv)[A-Za-z0-9_.\\/-]*-)\d+\.\d+\.\d+((?:\.sb|\.thsv-addon)\b)/gu,
        `$1${targetVersion}$2`,
      )
      .replace(/Current THSV \d+\.\d+\.\d+ imports/gu, `Current THSV ${targetVersion} imports`);
    if (aligned !== source) await writeTextWithRetry(path, aligned);
  }
}

async function filesBelow(path: string, extension: string, excludedFolders = new Set<string>()): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!excludedFolders.has(entry.name)) result.push(...await filesBelow(join(path, entry.name), extension, excludedFolders));
    } else if (entry.isFile() && entry.name.endsWith(extension)) {
      result.push(join(path, entry.name));
    }
  }
  return result;
}

async function writeTextWithRetry(path: string, value: string): Promise<void> {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      await writeFile(path, value, 'utf8');
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EPERM' && code !== 'EBUSY') throw error;
      if (attempt === 4) throw error;
      await new Promise<void>((resolve) => setTimeout(resolve, attempt * 75));
    }
  }
}

function releaseChangelog(value: unknown): string {
  const existing = typeof value === 'string' ? value.trim() : '';
  const stablePrefix = `${targetVersion}: aligned with the stable THSV StreamBridge ${targetVersion} baseline, guided wizard UI, verified update metadata, and regenerated Streamer.bot imports.`;
  const prefix = `${targetVersion}: aligned with THSV StreamBridge ${targetVersion}, guided wizard UI, verified update metadata, and regenerated Streamer.bot imports.`;
  if (existing.startsWith(stablePrefix)) return `${prefix}${existing.slice(stablePrefix.length)}`;
  if (existing.startsWith(`${targetVersion}:`)) return existing;
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
