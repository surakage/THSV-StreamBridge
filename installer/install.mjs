import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { copyFile, cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const PRODUCT = 'THSV StreamBridge';
const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argumentsMap = parseArguments(process.argv.slice(2));
const installRoot = safeInstallRoot(argumentsMap.get('install-root') ?? join(process.env.LOCALAPPDATA ?? process.env.USERPROFILE ?? '', PRODUCT));
const startAfterInstall = !argumentsMap.has('no-start');
const allowDowngrade = argumentsMap.has('allow-downgrade');
const manifestRaw = await readFile(join(sourceRoot, 'release-manifest.json'), 'utf8');
const manifest = JSON.parse(manifestRaw);
validateManifest(manifest);
await verifyRelease(sourceRoot, manifest);
const releaseManifestSha256 = createHash('sha256').update(manifestRaw).digest('hex');
const buildFingerprint = createHash('sha256').update(JSON.stringify(manifest.files.map((file) => [file.path, file.size, file.sha256]))).digest('hex');

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
await migrateLegacyAddOns(installRoot, previousRecord?.activeVersion);
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
  for (const name of ['Start THSV StreamBridge.cmd', 'Start THSV Streamer.bot Safely.cmd', 'Start THSV Streaming Tools.cmd', 'Stop THSV StreamBridge.cmd', 'Open THSV Setup Wizard.cmd', 'Open THSV StreamBridge Tray.cmd', 'Create THSV Recovery Bundle.cmd', 'Restore THSV Recovery Bundle.cmd', 'Uninstall THSV StreamBridge.cmd']) {
    await copyFile(join(sourceRoot, 'launcher', name), join(installRoot, name));
  }
  // The installer launcher belongs only in the downloaded release folder. Its
  // companion installer/install.mjs is intentionally not part of an installed
  // layout, so copying the launcher here would create a broken shortcut.
  for (const name of ['LICENSE', 'THIRD-PARTY-NOTICES.md', 'RELEASE-VERIFICATION.md']) {
    if (await exists(join(sourceRoot, name))) await copyFile(join(sourceRoot, name), join(installRoot, name));
  }

  const recoveryKeyPath = await prepareCreatorData(dataRoot, installRoot, manifest.version);
  const record = {
    product: PRODUCT,
    layoutVersion: 2,
    activeVersion: manifest.version,
    runtimeVersion: manifest.runtime.nodeVersion,
    runtimeUpstreamSha256: manifest.runtime.upstreamSha256,
    installedAt: new Date().toISOString(),
    installRoot,
    canonicalDownload: manifest.canonicalDownload,
    releaseCreatedAt: manifest.createdAt,
    releaseManifestSha256,
    buildFingerprint,
    fileCount: manifest.files.length,
    installerMode: 'verified-portable-release',
  };
  await writeJsonAtomic(recordPath, record);

  if (startAfterInstall) {
    const result = spawnSync(join(runtimeTarget, 'node.exe'), [join(launcherTarget, 'start.mjs'), '--wait', '--open-wizard', '--guided'], { cwd: installRoot, encoding: 'utf8', timeout: 30_000, windowsHide: true });
    if (result.status !== 0) {
      throw new Error(`The new version failed its health check and was rolled back. ${result.error?.message || result.stderr || result.stdout}`.trim());
    }
  }

  removeLegacyConvenienceShortcuts(installRoot);

  // Everything above this line is transactional. Once the health check passes,
  // cleanup is best-effort so a locked old folder cannot undo a healthy install.
  await pruneLegacyInstallArtifacts(installRoot).catch((error) => {
    process.stderr.write(`Warning: obsolete pre-versioned application files could not be removed (${error instanceof Error ? error.message : String(error)}).\n`);
  });
  for (const path of [appBackup, runtimeBackup, launcherBackup]) await rm(path, { recursive: true, force: true }).catch((error) => {
    process.stderr.write(`Warning: old rollback data could not be removed (${error instanceof Error ? error.message : String(error)}).\n`);
  });
  await pruneOldVersions(join(installRoot, 'app'), new Set([manifest.version])).catch((error) => {
    process.stderr.write(`Warning: an older application version could not be pruned (${error instanceof Error ? error.message : String(error)}).\n`);
  });
  if (startAfterInstall) launchTrayShell(installRoot);
  process.stdout.write(`${PRODUCT} ${manifest.version} installed at ${installRoot}\n`);
  process.stdout.write(`Installed folder: ${installRoot}\n`);
  process.stdout.write(`Wizard recovery key saved to: ${recoveryKeyPath}\n`);
  process.stdout.write(`One-button Stream Deck target: ${join(installRoot, 'Start THSV Streaming Tools.cmd')}\n`);
  process.stdout.write(`Notification-area shell: ${join(installRoot, 'Open THSV StreamBridge Tray.cmd')}\n`);
  process.stdout.write('Keep the recovery key private. Open THSV Setup Wizard still unlocks automatically, so the saved key is needed only for manual recovery.\n');
  process.stdout.write('Next: open Setup Wizard -> Streamer.bot -> One Streamer.bot import. Choose your features, download one .sb file, import it once, then follow the generated trigger checklist.\n');
  if (!startAfterInstall) process.stdout.write('Installation validation completed without starting the bridge.\n');
} catch (error) {
  await rollbackDirectories(moved);
  if (previousRecord?.activeVersion !== undefined) {
    await writeJsonAtomic(recordPath, { ...previousRecord, rolledBackAt: new Date().toISOString(), failedVersion: manifest.version });
    if (startAfterInstall) {
      const recovery = spawnSync(join(runtimeTarget, 'node.exe'), [join(launcherTarget, 'start.mjs'), '--wait'], { cwd: installRoot, encoding: 'utf8', timeout: 30_000, windowsHide: true });
      if (recovery.status !== 0) process.stderr.write(`Warning: the previous StreamBridge version was restored but could not restart automatically. ${recovery.error?.message || recovery.stderr || recovery.stdout || ''}\n`);
    }
  } else {
    await rm(recordPath, { force: true });
  }
  throw error;
} finally {
  await rm(transactionRoot, { recursive: true, force: true });
}

function launchTrayShell(root) {
  if (process.platform !== 'win32') return;
  const child = spawn('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden',
    '-File', join(root, 'launcher', 'tray.ps1'), '-InstallRoot', root,
  ], { cwd: root, detached: true, windowsHide: true, stdio: 'ignore' });
  child.once('error', (error) => process.stderr.write(`Warning: the notification-area shell could not start (${error.message}).\n`));
  child.unref();
}

async function prepareCreatorData(root, destination, version) {
  for (const path of ['configuration', 'state', 'logs', 'backups', 'runtime', 'secrets']) await mkdir(join(root, path), { recursive: true });
  for (const path of [join(destination, 'addons', 'packages'), join(destination, 'addons', 'state')]) await mkdir(path, { recursive: true });
  await protectPrivateDirectory(join(root, 'secrets'));
  const tokenPath = join(root, 'secrets', 'control-token');
  if (!await exists(tokenPath)) await writeFile(tokenPath, `${randomBytes(32).toString('base64url')}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  const controlToken = (await readFile(tokenPath, 'utf8')).trim();
  const recoveryKeyPath = join(destination, `${PRODUCT} Recovery Key.txt`);
  await writeFile(recoveryKeyPath, [
    `${PRODUCT} wizard recovery key`,
    '',
    `Control token: ${controlToken}`,
    '',
    `Installed folder: ${destination}`,
    '',
    'Keep this file private. Anyone with this token and access to your Windows session could change StreamBridge settings.',
    'For everyday use, open "Open THSV Setup Wizard.cmd" instead. It unlocks the local wizard automatically.',
    '',
  ].join('\n'), { encoding: 'utf8', mode: 0o600 });
  await protectPrivateFile(recoveryKeyPath);
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
  return recoveryKeyPath;
}

async function migrateLegacyAddOns(destination, activeVersion) {
  if (typeof activeVersion !== 'string' || activeVersion.length === 0) return;
  const legacyRoot = join(destination, 'app', activeVersion, 'addons');
  if (!await exists(legacyRoot)) return;
  const legacyPackages = join(legacyRoot, 'packages');
  if (!await exists(legacyPackages)) return;
  const persistentPackages = join(destination, 'addons', 'packages');
  const migrationRoot = join(destination, 'addons', 'migration-inbox');
  const ledgerPath = join(migrationRoot, 'feature-migrations.json');
  await mkdir(persistentPackages, { recursive: true });
  await mkdir(migrationRoot, { recursive: true });
  const existingLedger = await readJsonIfPresent(ledgerPath);
  const candidates = Array.isArray(existingLedger?.candidates) ? [...existingLedger.candidates] : [];
  const known = new Set(candidates.map((candidate) => candidate?.moduleId).filter((value) => typeof value === 'string'));

  for (const entry of await readdir(legacyPackages)) {
    const source = join(legacyPackages, entry);
    const descriptor = await readJsonIfPresent(join(source, 'module-package.json'));
    const record = await readJsonIfPresent(join(source, 'installed-package.json'));
    const moduleId = descriptor?.manifest?.moduleId;
    const version = descriptor?.manifest?.version;
    if (typeof moduleId !== 'string' || !/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/u.test(moduleId) || typeof version !== 'string') continue;
    if (record?.moduleId !== moduleId || record?.version !== version) continue;
    if (moduleId === 'thsv.viewer-foundation' || moduleId === 'thsv.community-analytics' || moduleId === 'thsv.kofi-donations') {
      const legacyState = join(legacyRoot, 'state', moduleId);
      const activeState = join(destination, 'addons', 'state', moduleId);
      if (await exists(legacyState) && !await exists(activeState)) {
        await mkdir(dirname(activeState), { recursive: true });
        await cp(legacyState, activeState, { recursive: true, errorOnExist: true, force: false });
      }
      continue;
    }
    const target = join(persistentPackages, moduleId);
    if (await exists(target)) continue;
    await cp(source, target, { recursive: true, errorOnExist: true, force: false });
    const originalEnabled = record.enabled !== false;
    await writeJsonAtomic(join(target, 'installed-package.json'), { ...record, enabled: false, changedAt: new Date().toISOString() });

    const legacyState = join(legacyRoot, 'state', moduleId);
    const stagedState = join(migrationRoot, moduleId, 'state');
    if (await exists(legacyState) && !await exists(stagedState)) {
      await mkdir(dirname(stagedState), { recursive: true });
      await cp(legacyState, stagedState, { recursive: true, errorOnExist: true, force: false });
    }
    if (!known.has(moduleId)) {
      candidates.push({ moduleId, sourceVersion: version, discoveredAt: new Date().toISOString(), originalEnabled });
      known.add(moduleId);
    }
  }
  if (candidates.length > 0) await writeJsonAtomic(ledgerPath, { version: 1, candidates });
}

async function protectPrivateFile(path) {
  if (process.platform !== 'win32' || argumentsMap.has('skip-acl')) return;
  const identity = process.env.USERDOMAIN && process.env.USERNAME ? `${process.env.USERDOMAIN}\\${process.env.USERNAME}` : process.env.USERNAME;
  if (!identity) throw new Error('Unable to determine the current Windows identity for recovery-key permissions.');
  const result = spawnSync('icacls.exe', [path, '/inheritance:r', '/grant:r', `${identity}:F`, '*S-1-5-18:F', '*S-1-5-32-544:F'], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(`Unable to protect the wizard recovery key: ${result.stderr || result.stdout}`);
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
  if (await exists(target)) { await renameWithRetry(target, backup); operations.push({ target, backup }); }
  await mkdir(dirname(target), { recursive: true });
  await renameWithRetry(staged, target);
  operations.push({ target, backup: undefined });
}

async function rollbackDirectories(operations) {
  for (const operation of [...operations].reverse()) {
    if (operation.backup === undefined) await rm(operation.target, { recursive: true, force: true });
    else if (await exists(operation.backup)) { await rm(operation.target, { recursive: true, force: true }); await renameWithRetry(operation.backup, operation.target); }
  }
}

async function renameWithRetry(source, destination) {
  const retryable = new Set(['EACCES', 'EBUSY', 'ENOTEMPTY', 'EPERM']);
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(source, destination);
      return;
    } catch (error) {
      if (!retryable.has(error?.code) || attempt >= 11) throw error;
      await delay(Math.min(50 * (2 ** attempt), 400));
    }
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

function removeLegacyConvenienceShortcuts(destination) {
  if (process.platform !== 'win32' || argumentsMap.has('no-shortcuts')) return;
  const script = [
    "$desktop = [Environment]::GetFolderPath('Desktop')",
    '$shell = New-Object -ComObject WScript.Shell',
    "foreach ($name in @('THSV StreamBridge Folder.lnk','THSV Streaming Tools.lnk')) {",
    '  $path = Join-Path $desktop $name',
    '  if (-not (Test-Path -LiteralPath $path)) { continue }',
    '  $shortcut = $shell.CreateShortcut($path)',
    '  if ($shortcut.WorkingDirectory -eq $env:THSV_INSTALL_ROOT) { Remove-Item -LiteralPath $path -Force }',
    '}',
  ].join('; ');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8', windowsHide: true, timeout: 10_000, env: { ...process.env, THSV_INSTALL_ROOT: destination },
  });
  if (result.status !== 0) process.stderr.write('Warning: an older StreamBridge desktop shortcut could not be removed automatically.\n');
}

async function pruneOldVersions(root, retained) {
  const { readdir } = await import('node:fs/promises');
  if (!await exists(root)) return;
  for (const entry of await readdir(root, { withFileTypes: true })) if (entry.isDirectory() && !retained.has(entry.name) && !entry.name.includes('.rollback-')) await rm(join(root, entry.name), { recursive: true, force: true });
}

async function pruneLegacyInstallArtifacts(root) {
  // Layout v2 runs exclusively from app/<version>. Creator-owned data, add-on
  // packages/state, backups, launchers, and the bundled runtime are deliberately
  // outside this list and are never touched here.
  const obsoleteRoots = ['bridge', 'config', 'dist', 'docs', 'node_modules', 'overlays', 'packages', 'scripts', 'wizard'];
  for (const name of obsoleteRoots) await rm(join(root, name), { recursive: true, force: true });
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isDirectory() && /^streamerbot-imports-\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(entry.name)) {
      await rm(join(root, entry.name), { recursive: true, force: true });
    }
  }
}

function validateManifest(value) {
  if (value.product !== PRODUCT || value.layoutVersion !== 2 || typeof value.version !== 'string' || !isReleaseVersion(value.version) || value.runtime?.platform !== 'win32' || value.runtime?.arch !== 'x64' || !Array.isArray(value.files)) throw new Error('release-manifest.json is invalid or not a Windows x64 portable release.');
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
  const parse = (value) => { const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/u.exec(value); if (!match) throw new Error(`Invalid release version: ${value}`); return [Number(match[1]), Number(match[2]), Number(match[3]), match[4]]; };
  const a = parse(left); const b = parse(right);
  for (let index = 0; index < 3; index += 1) if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  if (a[3] === b[3]) return 0; if (a[3] === undefined) return 1; if (b[3] === undefined) return -1; return String(a[3]).localeCompare(String(b[3]));
}

async function writeJsonAtomic(path, value) { await mkdir(dirname(path), { recursive: true }); const temporary = `${path}.${randomUUID()}.tmp`; await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); await renameWithRetry(temporary, path); }
async function readJsonIfPresent(path) { try { return JSON.parse(await readFile(path, 'utf8')); } catch (error) { if (error?.code === 'ENOENT') return undefined; throw error; } }
function isReleaseVersion(value) { return /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/u.test(value); }
async function sha256(path) { return createHash('sha256').update(await readFile(path)).digest('hex'); }
async function exists(path) { try { await stat(path); return true; } catch (error) { if (error?.code === 'ENOENT') return false; throw error; } }
