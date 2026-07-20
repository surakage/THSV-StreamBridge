import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const PRODUCT = 'THSV StreamBridge';
const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argumentsMap = parseArguments(process.argv.slice(2));
const installRoot = safeInstallRoot(argumentsMap.get('install-root') ?? join(process.env.LOCALAPPDATA ?? process.env.USERPROFILE ?? '', PRODUCT));
const startAfterInstall = !argumentsMap.has('no-start');
const allowDowngrade = argumentsMap.has('allow-downgrade');
const manifest = JSON.parse(await readFile(join(sourceRoot, 'release-manifest.json'), 'utf8'));
validateManifest(manifest);
await verifyRelease(sourceRoot, manifest);

const dataRoot = join(installRoot, 'data');
const runtimeDataRoot = join(dataRoot, 'runtime');
const recordPath = join(runtimeDataRoot, 'install-manifest.json');
const previousRecord = await readJsonIfPresent(recordPath);
if (previousRecord !== undefined) {
  if (previousRecord.product !== PRODUCT || typeof previousRecord.activeVersion !== 'string') throw new Error(`The existing installation record is invalid: ${recordPath}`);
  if (compareVersions(manifest.version, previousRecord.activeVersion) < 0 && !allowDowngrade) throw new Error(`Refusing to downgrade ${PRODUCT} from ${previousRecord.activeVersion} to ${manifest.version}. Pass --allow-downgrade only after backing up creator data.`);
}

await stopInstalledBridge(installRoot);
await mkdir(installRoot, { recursive: true });
const transactionRoot = join(installRoot, `.install-${randomUUID()}`);
await mkdir(transactionRoot, { recursive: true });
await protectPrivateDirectory(transactionRoot);

const stagedApp = join(transactionRoot, 'app');
const stagedRuntime = join(transactionRoot, 'runtime');
const stagedLauncher = join(transactionRoot, 'launcher');
const backupSuffix = `.rollback-${randomUUID()}`;
const appTarget = join(installRoot, 'app', manifest.version);
const runtimeTarget = join(installRoot, 'runtime');
const launcherTarget = join(installRoot, 'launcher');
const appBackup = `${appTarget}${backupSuffix}`;
const runtimeBackup = `${runtimeTarget}${backupSuffix}`;
const launcherBackup = `${launcherTarget}${backupSuffix}`;
const moved = [];

try {
  await copyManifestSection(manifest, 'app/', stagedApp);
  await copyManifestSection(manifest, 'runtime/', stagedRuntime);
  await copyManifestSection(manifest, 'launcher/', stagedLauncher, (path) => !path.toLowerCase().endsWith('.cmd'));
  await verifyCopiedSection(manifest, 'app/', stagedApp);
  await verifyCopiedSection(manifest, 'runtime/', stagedRuntime);
  await verifyCopiedSection(manifest, 'launcher/', stagedLauncher, (path) => !path.toLowerCase().endsWith('.cmd'));

  await mkdir(join(installRoot, 'app'), { recursive: true });
  await replaceDirectory(appTarget, stagedApp, appBackup, moved);
  await replaceDirectory(runtimeTarget, stagedRuntime, runtimeBackup, moved);
  await replaceDirectory(launcherTarget, stagedLauncher, launcherBackup, moved);
  for (const name of ['Start THSV StreamBridge.cmd', 'Stop THSV StreamBridge.cmd', 'Open THSV Setup Wizard.cmd', 'Uninstall THSV StreamBridge.cmd']) {
    await copyFile(join(sourceRoot, 'launcher', name), join(installRoot, name));
  }
  // The installer launcher belongs only in the downloaded release folder. Its
  // companion installer/install.mjs is intentionally not part of an installed
  // layout, so copying the launcher here would create a broken shortcut.
  for (const name of ['LICENSE', 'THIRD-PARTY-NOTICES.md', 'RELEASE-VERIFICATION.md']) {
    if (await exists(join(sourceRoot, name))) await copyFile(join(sourceRoot, name), join(installRoot, name));
  }

  await prepareCreatorData(dataRoot, installRoot, manifest.version);
  const record = {
    product: PRODUCT,
    layoutVersion: 2,
    activeVersion: manifest.version,
    previousVersion: previousRecord?.activeVersion,
    runtimeVersion: manifest.runtime.nodeVersion,
    installedAt: new Date().toISOString(),
    installRoot,
    canonicalDownload: manifest.canonicalDownload,
  };
  await writeJsonAtomic(recordPath, record);

  if (startAfterInstall) {
    const result = spawnSync(join(runtimeTarget, 'node.exe'), [join(launcherTarget, 'start.mjs'), '--wait', '--open-wizard'], { cwd: installRoot, encoding: 'utf8', timeout: 30_000, windowsHide: true });
    if (result.status !== 0) {
      if (previousRecord?.activeVersion !== undefined) {
        await writeJsonAtomic(recordPath, { ...previousRecord, rolledBackAt: new Date().toISOString(), failedVersion: manifest.version });
        spawnSync(join(runtimeTarget, 'node.exe'), [join(launcherTarget, 'start.mjs'), '--wait'], { cwd: installRoot, encoding: 'utf8', timeout: 30_000, windowsHide: true });
      } else await rm(recordPath, { force: true });
      throw new Error(`The new version failed its health check and was rolled back. ${result.stderr || result.stdout}`.trim());
    }
  }

  for (const path of [appBackup, runtimeBackup, launcherBackup]) await rm(path, { recursive: true, force: true });
  await pruneOldVersions(join(installRoot, 'app'), new Set([manifest.version, previousRecord?.activeVersion].filter(Boolean)));
  process.stdout.write(`${PRODUCT} ${manifest.version} installed at ${installRoot}\n`);
  process.stdout.write(`A unique control token is stored privately for this Windows user in ${join(dataRoot, 'secrets')}.\n`);
  if (!startAfterInstall) process.stdout.write('Installation validation completed without starting the bridge.\n');
} catch (error) {
  await rollbackDirectories(moved);
  throw error;
} finally {
  await rm(transactionRoot, { recursive: true, force: true });
}

async function prepareCreatorData(root, destination, version) {
  for (const path of ['configuration', 'state', 'logs', 'backups', 'runtime', 'secrets']) await mkdir(join(root, path), { recursive: true });
  for (const path of [join(destination, 'addons', 'packages'), join(destination, 'addons', 'state')]) await mkdir(path, { recursive: true });
  await protectPrivateDirectory(join(root, 'secrets'));
  const tokenPath = join(root, 'secrets', 'control-token');
  if (!await exists(tokenPath)) await writeFile(tokenPath, `${randomBytes(32).toString('base64url')}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  const configPath = join(root, 'configuration', 'bridge.local.json');
  const legacyConfig = join(root, 'runtime', 'bridge.local.json');
  if (!await exists(configPath)) {
    const templatePath = await exists(legacyConfig) ? legacyConfig : join(destination, 'app', version, 'config', 'bridge.example.json');
    const config = JSON.parse(await readFile(templatePath, 'utf8'));
    config.logging.directory = join(root, 'logs');
    config.security.controlTokenFile = tokenPath;
    config.deduplication.stateFile = join(root, 'state', 'deduplication.json');
    config.timedActions.stateFile = join(root, 'state', 'timed-actions.json');
    config.streamerbot.deliveryStateFile = join(root, 'state', 'delivery-outbox.json');
    await writeJsonAtomic(configPath, config);
  }
}

async function verifyRelease(root, value) {
  for (const file of value.files) {
    const path = safeManifestPath(root, file.path);
    const info = await stat(path);
    if (!info.isFile() || info.size !== file.size) throw new Error(`Release file size mismatch: ${file.path}`);
    if (await sha256(path) !== file.sha256) throw new Error(`Release file hash mismatch: ${file.path}`);
  }
}

async function copyManifestSection(value, prefix, destination, include = () => true) {
  for (const file of value.files.filter((entry) => entry.path.startsWith(prefix) && include(entry.path))) {
    const relativePath = file.path.slice(prefix.length);
    const target = safeManifestPath(destination, relativePath);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(safeManifestPath(sourceRoot, file.path), target);
  }
}

async function verifyCopiedSection(value, prefix, destination, include = () => true) {
  for (const file of value.files.filter((entry) => entry.path.startsWith(prefix) && include(entry.path))) {
    const target = safeManifestPath(destination, file.path.slice(prefix.length));
    const info = await stat(target);
    if (info.size !== file.size || await sha256(target) !== file.sha256) throw new Error(`Private staging verification failed: ${file.path}`);
  }
}

async function replaceDirectory(target, staged, backup, operations) {
  if (await exists(target)) { await rename(target, backup); operations.push({ target, backup }); }
  await mkdir(dirname(target), { recursive: true });
  await rename(staged, target);
  operations.push({ target, backup: undefined });
}

async function rollbackDirectories(operations) {
  for (const operation of [...operations].reverse()) {
    if (operation.backup === undefined) await rm(operation.target, { recursive: true, force: true });
    else if (await exists(operation.backup)) { await rm(operation.target, { recursive: true, force: true }); await rename(operation.backup, operation.target); }
  }
}

async function stopInstalledBridge(root) {
  const runtime = join(root, 'runtime', 'node.exe'); const script = join(root, 'launcher', 'stop.mjs');
  if (!await exists(runtime) || !await exists(script)) return;
  const result = spawnSync(runtime, [script], { cwd: root, encoding: 'utf8', timeout: 20_000, windowsHide: true });
  if (result.status !== 0) throw new Error(`The existing StreamBridge could not be stopped safely; installation was cancelled before replacing application files. ${result.error?.message || result.stderr || result.stdout || ''}`.trim());
}

async function protectPrivateDirectory(path) {
  if (process.platform !== 'win32' || argumentsMap.has('skip-acl')) return;
  const identity = process.env.USERDOMAIN && process.env.USERNAME ? `${process.env.USERDOMAIN}\\${process.env.USERNAME}` : process.env.USERNAME;
  if (!identity) throw new Error('Unable to determine the current Windows identity for private installation permissions.');
  const result = spawnSync('icacls.exe', [path, '/inheritance:r', '/grant:r', `${identity}:(OI)(CI)F`, '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F'], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(`Unable to protect private installation staging: ${result.stderr || result.stdout}`);
}

async function pruneOldVersions(root, retained) {
  const { readdir } = await import('node:fs/promises');
  if (!await exists(root)) return;
  for (const entry of await readdir(root, { withFileTypes: true })) if (entry.isDirectory() && !retained.has(entry.name) && !entry.name.includes('.rollback-')) await rm(join(root, entry.name), { recursive: true, force: true });
}

function validateManifest(value) {
  if (value.product !== PRODUCT || value.layoutVersion !== 2 || typeof value.version !== 'string' || value.runtime?.platform !== 'win32' || value.runtime?.arch !== 'x64' || !Array.isArray(value.files)) throw new Error('release-manifest.json is invalid or not a Windows x64 portable release.');
  for (const file of value.files) if (typeof file.path !== 'string' || !Number.isSafeInteger(file.size) || !/^[a-f0-9]{64}$/u.test(file.sha256)) throw new Error('release-manifest.json contains an invalid file entry.');
}

function safeManifestPath(root, relativePath) {
  if (!relativePath || isAbsolute(relativePath) || relativePath.includes('\\') || relativePath.split('/').some((part) => part === '..' || part === '.' || part === '')) throw new Error(`Unsafe release path: ${relativePath}`);
  const target = resolve(root, ...relativePath.split('/')); const prefix = resolve(root).replace(/[\\/]+$/u, '') + sep;
  if (!target.startsWith(prefix)) throw new Error(`Release path leaves its root: ${relativePath}`);
  return target;
}

function safeInstallRoot(path) {
  const target = resolve(path);
  if (target === dirname(target) || target.length < 10 || relative(dirname(target), target).startsWith('..')) throw new Error(`Unsafe installation path: ${target}`);
  return target;
}

function parseArguments(values) {
  const result = new Map();
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]; if (!value.startsWith('--')) throw new Error(`Unknown installer argument: ${value}`);
    const equals = value.indexOf('=');
    if (equals > 2) result.set(value.slice(2, equals), value.slice(equals + 1));
    else if (value === '--install-root' && values[index + 1] && !values[index + 1].startsWith('--')) result.set('install-root', values[++index]);
    else result.set(value.slice(2), true);
  }
  return result;
}

function compareVersions(left, right) {
  const parse = (value) => { const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/u.exec(value); if (!match) throw new Error(`Invalid release version: ${value}`); return [Number(match[1]), Number(match[2]), Number(match[3]), match[4]]; };
  const a = parse(left); const b = parse(right);
  for (let index = 0; index < 3; index += 1) if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  if (a[3] === b[3]) return 0; if (a[3] === undefined) return 1; if (b[3] === undefined) return -1; return String(a[3]).localeCompare(String(b[3]));
}

async function writeJsonAtomic(path, value) { await mkdir(dirname(path), { recursive: true }); const temporary = `${path}.${randomUUID()}.tmp`; await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); await rename(temporary, path); }
async function readJsonIfPresent(path) { try { return JSON.parse(await readFile(path, 'utf8')); } catch (error) { if (error?.code === 'ENOENT') return undefined; throw error; } }
async function sha256(path) { return createHash('sha256').update(await readFile(path)).digest('hex'); }
async function exists(path) { try { await stat(path); return true; } catch (error) { if (error?.code === 'ENOENT') return false; throw error; } }
