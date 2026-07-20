import { spawnSync } from 'node:child_process';
import { mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const requestedRootIndex = process.argv.indexOf('--install-root');
const requestedRoot = requestedRootIndex >= 0 ? process.argv[requestedRootIndex + 1] : undefined;
const installRoot = await realpath(requestedRoot ? resolve(requestedRoot) : resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const recordPath = join(installRoot, 'data', 'runtime', 'install-manifest.json');
const record = JSON.parse(await readFile(recordPath, 'utf8'));
// Windows can report the same directory in either its short (8.3) or long form depending on how a
// caller reached it (e.g. an environment variable set to the short form vs. a batch file's own
// %~dp0 resolving to the long form). Comparing realpath() output on both sides, rather than a plain
// string resolve(), avoids a false "not a managed installation" rejection for the identical folder.
const recordedRoot = await realpath(record.installRoot).catch(() => resolve(record.installRoot));
if (record.product !== 'THSV StreamBridge' || recordedRoot !== installRoot) throw new Error('This directory is not a managed THSV StreamBridge installation.');
const deleteEverything = process.argv.includes('--delete-user-data');
if (deleteEverything && !process.argv.includes('--confirm-delete-everything')) throw new Error('Deleting creator data requires both --delete-user-data and --confirm-delete-everything.');
const deferredCleanup = new Set();
const stopResult = spawnSync(process.execPath, [join(installRoot, 'launcher', 'stop.mjs')], { stdio: 'inherit', timeout: 20_000 });
if (stopResult.status !== 0) throw new Error(`StreamBridge could not be stopped safely; uninstall was cancelled before application files were removed.${stopResult.error ? ` ${stopResult.error.message}` : ''}`);
// The public uninstall wrapper removes itself after this process exits. Deleting the
// currently executing batch file here makes cmd.exe report a false failure on return.
for (const entry of ['app', 'runtime', 'launcher', 'Install THSV StreamBridge.cmd', 'Start THSV StreamBridge.cmd', 'Stop THSV StreamBridge.cmd', 'Open THSV Setup Wizard.cmd']) await removeInstalledEntry(join(installRoot, entry));
if (deleteEverything) {
  if (!await removeInstalledEntry(installRoot)) throw new Error('Windows is holding installation data open. Nothing will be reported as fully deleted until every requested path is removed.');
  process.stdout.write('THSV StreamBridge and all creator data were removed.\n');
} else {
  await rm(recordPath, { force: true });
  await mkdir(installRoot, { recursive: true });
  await writeFile(join(installRoot, 'REINSTALL.txt'), 'THSV StreamBridge was uninstalled. Creator configuration, add-ons, state, logs, backups, and secrets were preserved. Reinstall the main bridge to use them again.\n', 'utf8');
  process.stdout.write(`THSV StreamBridge was removed. Creator data remains in ${join(installRoot, 'data')} and ${join(installRoot, 'addons')}.\n`);
}
if (deferredCleanup.size > 0) process.stdout.write(`Windows is still holding ${deferredCleanup.size} application path(s) open. The visible uninstaller will retry them after its window closes.\n`);

// Antivirus scans, process shutdown, and terminals can retain Windows directory
// handles. Remove unlocked children individually, record anything still held,
// then let the public wrapper retry the remaining application-only paths.
async function removeInstalledEntry(path) {
  const options = { recursive: true, force: true, maxRetries: 2, retryDelay: 100 };
  try {
    await rm(path, options);
    return true;
  } catch (error) {
    if (error?.code !== 'EBUSY' && error?.code !== 'EPERM') throw error;
  }
  let children;
  try {
    children = await readdir(path);
  } catch (error) {
    if (error?.code === 'ENOENT') return true;
    if (error?.code !== 'ENOTDIR') throw error;
    deferredCleanup.add(path);
    return false;
  }
  let childrenRemoved = true;
  for (const child of children) if (!await removeInstalledEntry(join(path, child))) childrenRemoved = false;
  if (!childrenRemoved) {
    deferredCleanup.add(path);
    return false;
  }
  try {
    await rm(path, options);
    return true;
  } catch (error) {
    if (error?.code !== 'EBUSY' && error?.code !== 'EPERM') throw error;
    deferredCleanup.add(path);
    return false;
  }
}
